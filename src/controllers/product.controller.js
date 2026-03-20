const productService = require('../services/product.service');
const Product = require('../models/Product');
const Category = require('../models/Category');
const User = require('../models/User');
const Distributor = require('../models/Distributor');
const asyncHandler = require('../utils/asyncHandler');
const { ValidationError, NotFoundError } = require('../utils/errors');
const { sendSuccess, sendPaginated } = require('../utils/response');

// Helper function to escape regex special characters
const escapeRegex = (text) => {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
};

// Helper: resolve category param (ObjectId, name, or slug) to a Category ObjectId
async function resolveCategoryParam(category) {
  if (!category) return null;
  const isCatObjectId = /^[0-9a-fA-F]{24}$/.test(category);
  if (isCatObjectId) return category;
  // Look up by name (case-insensitive) or slug
  const escapedCategory = escapeRegex(category);
  const categoryDoc = await Category.findOne({
    $or: [
      { name: { $regex: new RegExp(`^${escapedCategory}$`, 'i') } },
      { slug: category.toLowerCase() }
    ]
  });
  return categoryDoc ? categoryDoc._id : null;
}

// @desc    Get all products with filters
// @route   GET /api/products
// @access  Public
exports.getAllProducts = asyncHandler(async (req, res) => {
  const { category, minPrice, maxPrice, search, sortBy, page = 1, limit = 24,
          pincode: locationPincode, city: locationCity } = req.query;

  const filters = {
    isActive: true,
    // Hide products that are out of stock or below minimum order quantity
    $expr: { $gte: ['$stock', '$minQuantity'] }
  };

  // Category filter: accept ObjectId, name, or slug for backward compatibility
  if (category) {
    const resolvedCategoryId = await resolveCategoryParam(category);
    if (resolvedCategoryId) {
      filters.category = resolvedCategoryId;
    } else {
      // No matching category — force empty results
      filters.category = null;
    }
  }

  // Price filters with validation
  if (minPrice) {
    const min = parseFloat(minPrice);
    if (!isNaN(min) && min >= 0) {
      filters.price = { $gte: min };
    }
  }

  if (maxPrice) {
    const max = parseFloat(maxPrice);
    if (!isNaN(max) && max >= 0) {
      filters.price = { ...filters.price, $lte: max };
    }
  }

  // FIX: Sanitize search to prevent ReDoS attacks
  // Note: category is now an ObjectId ref, so we search category name via a separate lookup
  let searchTerm = null;
  if (search && search.trim()) {
    searchTerm = escapeRegex(search.trim());
    filters.$or = [
      { name: { $regex: searchTerm, $options: 'i' } },
      { description: { $regex: searchTerm, $options: 'i' } },
      { brand: { $regex: searchTerm, $options: 'i' } },
      { manufacturer: { $regex: searchTerm, $options: 'i' } }
    ];

    // Also search by category name: find matching categories and include their ObjectIds
    const matchingCategories = await Category.find({
      name: { $regex: searchTerm, $options: 'i' }
    }).select('_id').lean();
    if (matchingCategories.length > 0) {
      filters.$or.push({ category: { $in: matchingCategories.map(c => c._id) } });
    }
  }

  // Location-based filtering: find distributors by pincode/city, then filter products.
  // We do NOT use $geoNear because distributor coordinates can be wrong in DB.
  // Pincode and city text matching is the reliable source of truth.
  let locationFiltered = false;

  if (locationPincode || locationCity) {
    locationFiltered = true;
    const nearbyIds = [];
    const seenIds = new Set();

    // 1) Exact pincode match — highest priority
    if (locationPincode) {
      const pincodeDistributors = await Distributor.find({
        pincode: locationPincode,
        isApproved: true,
        isActive: true,
        isWalletLocked: { $ne: true },
        planType: { $ne: 'none' }
      }).select('_id').lean();

      pincodeDistributors.forEach(d => {
        seenIds.add(d._id.toString());
        nearbyIds.push(d._id);
      });
    }

    // 2) Same city match (case-insensitive)
    if (locationCity && locationCity.trim()) {
      const escapedCity = escapeRegex(locationCity.trim());
      const cityDistributors = await Distributor.find({
        city: { $regex: `^${escapedCity}$`, $options: 'i' },
        isApproved: true,
        isActive: true,
        isWalletLocked: { $ne: true },
        planType: { $ne: 'none' }
      }).select('_id').lean();

      cityDistributors.forEach(d => {
        if (!seenIds.has(d._id.toString())) {
          seenIds.add(d._id.toString());
          nearbyIds.push(d._id);
        }
      });
    }

    // 3) Same pincode region (first 3 digits) — only if no results yet
    if (nearbyIds.length === 0 && locationPincode && /^\d{6}$/.test(locationPincode)) {
      const pincodePrefix = locationPincode.substring(0, 3);
      const regionDistributors = await Distributor.find({
        pincode: { $regex: `^${pincodePrefix}` },
        isApproved: true,
        isActive: true,
        isWalletLocked: { $ne: true },
        planType: { $ne: 'none' }
      }).select('_id').lean();

      regionDistributors.forEach(d => {
        if (!seenIds.has(d._id.toString())) {
          nearbyIds.push(d._id);
        }
      });
    }

    if (nearbyIds.length > 0) {
      filters.distributor = { $in: nearbyIds };
    }
    // If no distributors found at all, don't filter — frontend handles "expanding" message
  }

  // Exclude products from distributors that are not publicly visible
  // (not approved, not active, no plan, or wallet locked)
  const hiddenDistributors = await Distributor.find({
    $or: [
      { isApproved: { $ne: true } },
      { isActive: { $ne: true } },
      { planType: 'none' },
      { isWalletLocked: true }
    ]
  }).select('_id').lean();

  if (hiddenDistributors.length > 0) {
    const hiddenIds = hiddenDistributors.map(d => d._id);
    if (filters.distributor && filters.distributor.$in) {
      // Location filter already applied — remove hidden from the allowed list
      const hiddenSet = new Set(hiddenIds.map(id => id.toString()));
      filters.distributor.$in = filters.distributor.$in.filter(
        id => !hiddenSet.has(id.toString())
      );
    } else if (!filters.distributor) {
      // No distributor filter yet — exclude hidden distributors
      filters.distributor = { $nin: hiddenIds };
    }
  }

  // Validate and limit pagination
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit))); // Max 100 items per request for infinite scroll

  // Map frontend sort values to Mongoose sort strings
  const sortMap = {
    newest: '-createdAt',
    oldest: 'createdAt',
    priceLowToHigh: 'price',
    priceHighToLow: '-price',
    nameAZ: 'name',
    nameZA: '-name',
  };
  const sortOption = sortMap[sortBy] || '-createdAt';

  const options = {
    page: pageNum,
    limit: limitNum,
    sort: sortOption,
    populate: [
      { path: 'category', select: 'name slug icon' },
      { path: 'distributor', select: 'businessName email phone city state pincode slug' }
    ]
  };

  // If search term provided, also find distributors matching the search
  // and include their products in the query (since distributor is a ref,
  // we can't regex it in the main $or query)
  if (searchTerm) {
    const distributorFilter = {
      businessName: { $regex: searchTerm, $options: 'i' },
      isApproved: true,
      isActive: true,
      isWalletLocked: { $ne: true },
      planType: { $ne: 'none' }
    };

    // When location filtering is active, only match distributors that are also nearby
    if (filters.distributor) {
      distributorFilter._id = filters.distributor;
    }

    const matchingDistributors = await Distributor.find(distributorFilter).select('_id');

    if (matchingDistributors.length > 0) {
      const distributorIds = matchingDistributors.map(d => d._id);
      filters.$or.push({ distributor: { $in: distributorIds } });
    }
  }

  let result = await productService.getProducts(filters, options);

  return sendPaginated(res, {
    data: { products: result.products, locationFiltered },
    page: pageNum,
    limit: limitNum,
    total: result.totalProducts
  });
});

// @desc    Get single product by ID
// @route   GET /api/products/:id
// @access  Public
exports.getProductById = asyncHandler(async (req, res) => {
  const param = req.params.id;

  // Check if param is a valid MongoDB ObjectID or a slug
  const isObjectId = /^[0-9a-fA-F]{24}$/.test(param);
  const query = isObjectId ? { _id: param } : { slug: param };

  const product = await Product.findOne(query)
    .populate({ path: 'category', select: 'name slug icon' })
    .populate('distributor', 'businessName email phone address city state pincode rating slug isApproved isActive planType isWalletLocked');

  if (!product) {
    throw new NotFoundError('Product not found');
  }

  // Only show if active (or if user is the distributor/admin)
  if (!product.isActive && (!req.user || req.user._id.toString() !== product.distributor._id.toString())) {
    throw new NotFoundError('Product not found');
  }

  // Hide products from distributors with no plan or locked wallets (unless viewing own product)
  const isOwnProduct = req.user && req.user._id.toString() === product.distributor._id.toString();
  const isAdmin = req.user && req.user.role === 'admin';
  if (!isOwnProduct && !isAdmin && product.distributor) {
    const d = product.distributor;
    if (!d.isApproved || !d.isActive || d.planType === 'none' || d.isWalletLocked) {
      throw new NotFoundError('Product not found');
    }
  }

  return sendSuccess(res, { data: { product } });
});

// @desc    Get products by category
// @route   GET /api/products/category/:categoryId
// @access  Public
exports.getProductsByCategory = asyncHandler(async (req, res) => {
  const { categoryId } = req.params;
  const { city, pincode, exclude, limit } = req.query;

  // Resolve categoryId: accept ObjectId, name, or slug
  const resolvedCategoryId = await resolveCategoryParam(categoryId);
  if (!resolvedCategoryId) {
    throw new ValidationError('Invalid category');
  }

  // Build distributor eligibility filter
  const distributorFilter = {
    isApproved: true,
    isActive: true,
    isWalletLocked: { $ne: true },
    planType: { $ne: 'none' }
  };

  // If city is provided, filter distributors by same city only
  if (city && city.trim()) {
    const escapedCity = city.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    distributorFilter.city = { $regex: `^${escapedCity}$`, $options: 'i' };
  }

  const eligibleDistributors = await Distributor.find(distributorFilter)
    .select('_id pincode').lean();

  // Separate distributors: same pincode first, then rest of city
  let samePincodeIds = [];
  let sameCityIds = [];
  if (pincode) {
    for (const d of eligibleDistributors) {
      if (d.pincode === pincode) {
        samePincodeIds.push(d._id);
      } else {
        sameCityIds.push(d._id);
      }
    }
  } else {
    sameCityIds = eligibleDistributors.map(d => d._id);
  }

  const allEligibleIds = [...samePincodeIds, ...sameCityIds];

  // Build product filter
  const productFilter = {
    category: resolvedCategoryId,
    isActive: true,
    $expr: { $gte: ['$stock', '$minQuantity'] }
  };

  if (allEligibleIds.length > 0) {
    // Location matched — show local distributors' products
    productFilter.distributor = { $in: allEligibleIds };
  } else {
    // No location match or no location provided — fallback to all eligible distributors
    const baseFilter = {
      isApproved: true,
      isActive: true,
      isWalletLocked: { $ne: true },
      planType: { $ne: 'none' }
    };
    const allDistributors = await Distributor.find(baseFilter).select('_id').lean();
    productFilter.distributor = { $in: allDistributors.map(d => d._id) };
  }

  // Exclude a specific product (for related products on PDP)
  if (exclude) {
    const mongoose = require('mongoose');
    if (mongoose.Types.ObjectId.isValid(exclude)) {
      productFilter._id = { $ne: exclude };
    }
  }

  const maxResults = Math.min(parseInt(limit) || 20, 50);

  const products = await Product.find(productFilter)
    .populate({ path: 'category', select: 'name slug icon' })
    .populate('distributor', 'businessName city state pincode slug')
    .limit(maxResults)
    .lean();

  // Sort: same pincode distributors first, then same city
  if (pincode && samePincodeIds.length > 0) {
    const pincodeIdSet = new Set(samePincodeIds.map(id => id.toString()));
    products.sort((a, b) => {
      const aIsPincode = pincodeIdSet.has(a.distributor?._id?.toString());
      const bIsPincode = pincodeIdSet.has(b.distributor?._id?.toString());
      if (aIsPincode && !bIsPincode) return -1;
      if (!aIsPincode && bIsPincode) return 1;
      return 0;
    });
  }

  return sendSuccess(res, { data: { products, count: products.length } });
});

// @desc    Get products by distributor
// @route   GET /api/products/distributor/:distributorId
// @access  Public
exports.getProductsByDistributor = asyncHandler(async (req, res) => {
  const { distributorId } = req.params;

  // Support both ObjectID and slug
  const isObjectId = /^[0-9a-fA-F]{24}$/.test(distributorId);
  const lookupQuery = isObjectId ? { _id: distributorId } : { slug: distributorId };

  // Check if distributor is eligible (active, approved, has a plan, not locked)
  const dist = await Distributor.findOne(lookupQuery).select('_id isApproved isActive planType isWalletLocked').lean();
  if (!dist || !dist.isApproved || !dist.isActive || dist.planType === 'none' || dist.isWalletLocked) {
    return sendSuccess(res, { data: { products: [], count: 0 } });
  }

  const products = await Product.find({
    distributor: dist._id,
    isActive: true,
    $expr: { $gte: ['$stock', '$minQuantity'] }
  })
    .populate({ path: 'category', select: 'name slug icon' })
    .populate('distributor', 'businessName email phone city state rating slug');

  return sendSuccess(res, { data: { products, count: products.length } });
});

// @desc    Get all categories
// @route   GET /api/products/categories
// @access  Public
exports.getCategories = asyncHandler(async (req, res) => {
  // Fetch active categories from database, sorted by order
  let categories = await Category.find({ isActive: true }).sort('order').lean();

  // Seed default categories if none exist
  if (categories.length === 0) {
    const defaultCategories = [
      { name: 'Cement', icon: '🏗️', order: 1, image: 'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=400' },
      { name: 'Steel', icon: '🔩', order: 2, image: 'https://images.unsplash.com/photo-1567789884554-0b844b597180?w=400' },
      { name: 'Bricks', icon: '🧱', order: 3, image: 'https://images.unsplash.com/photo-1590075865003-e48277faa558?w=400' },
      { name: 'Sand', icon: '⏳', order: 4, image: 'https://images.unsplash.com/photo-1455659817273-f96807779a8a?w=400' },
      { name: 'Paint', icon: '🎨', order: 5, image: 'https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=400' },
      { name: 'Tiles', icon: '◽', order: 6, image: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=400' },
      { name: 'Other', icon: '📦', order: 7 }
    ];
    await Category.insertMany(defaultCategories);
    categories = await Category.find({ isActive: true }).sort('order').lean();
  }

  // Get product count for each category (now using ObjectId reference)
  const categoriesWithCount = await Promise.all(
    categories.map(async (cat) => {
      const count = await Product.countDocuments({
        category: cat._id,
        isActive: true
      });
      return {
        _id: cat._id,
        id: cat.name,
        name: cat.name,
        slug: cat.slug,
        icon: cat.icon,
        image: cat.image,
        description: cat.description,
        order: cat.order,
        count
      };
    })
  );

  return sendSuccess(res, { data: { categories: categoriesWithCount } });
});

// @desc    Add product to wishlist
// @route   POST /api/products/wishlist
// @access  Private
exports.addToWishlist = asyncHandler(async (req, res) => {
  // FIX: Use _id consistently
  const userId = req.user._id;
  const { productId } = req.body;

  if (!productId) {
    throw new ValidationError('Product ID is required');
  }

  // Verify product exists
  const product = await Product.findById(productId);
  if (!product) {
    throw new NotFoundError('Product not found');
  }

  const user = await User.findById(userId);

  // Check if already in wishlist
  if (user.wishlist.includes(productId)) {
    return sendSuccess(res, {
      message: 'Product already in wishlist',
      data: { wishlist: user.wishlist }
    });
  }

  user.wishlist.push(productId);
  await user.save();

  return sendSuccess(res, {
    message: 'Product added to wishlist',
    data: { wishlist: user.wishlist }
  });
});

// @desc    Remove product from wishlist
// @route   DELETE /api/products/wishlist/:productId
// @access  Private
exports.removeFromWishlist = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { productId } = req.params;

  const user = await User.findById(userId);
  user.wishlist = user.wishlist.filter(id => id.toString() !== productId);
  await user.save();

  return sendSuccess(res, {
    message: 'Product removed from wishlist',
    data: { wishlist: user.wishlist }
  });
});

// @desc    Get user wishlist
// @route   GET /api/products/wishlist
// @access  Private
exports.getWishlist = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const user = await User.findById(userId).populate({
    path: 'wishlist',
    populate: [
      { path: 'category', select: 'name slug icon' },
      { path: 'distributor', select: 'businessName city state slug' }
    ]
  });

  return sendSuccess(res, { data: { wishlist: user.wishlist } });
});

// @desc    Add product to cart
// @route   POST /api/products/cart
// @access  Private
exports.addToCart = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { productId, quantity = 1 } = req.body;

  if (!productId) {
    throw new ValidationError('Product ID is required');
  }

  // Validate quantity
  const qty = parseInt(quantity);
  if (isNaN(qty) || qty < 1 || qty > 999) {
    throw new ValidationError('Quantity must be between 1 and 999');
  }

  // Verify product exists and has stock
  const product = await Product.findById(productId);
  if (!product) {
    throw new NotFoundError('Product not found');
  }

  if (!product.isActive) {
    throw new ValidationError('Product is not available');
  }

  if (product.stock < qty) {
    throw new ValidationError(`Only ${product.stock} items available in stock`);
  }

  const user = await User.findById(userId);

  // Check if product already in cart
  const existingItem = user.cart.find(item => item.product.toString() === productId);

  if (existingItem) {
    const newQty = existingItem.quantity + qty;
    if (product.stock < newQty) {
      throw new ValidationError(`Only ${product.stock} items available in stock`);
    }
    existingItem.quantity = newQty;
  } else {
    user.cart.push({ product: productId, quantity: qty });
  }

  await user.save();

  // Populate cart for response
  await user.populate({
    path: 'cart.product',
    populate: [
      { path: 'category', select: 'name slug icon' },
      { path: 'distributor', select: 'businessName slug' }
    ]
  });

  return sendSuccess(res, {
    message: 'Product added to cart',
    data: { cart: user.cart }
  });
});

// @desc    Update cart item quantity
// @route   PUT /api/products/cart/:productId
// @access  Private
exports.updateCartItem = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { productId } = req.params;
  const { quantity } = req.body;

  // Validate quantity
  const qty = parseInt(quantity);
  if (isNaN(qty) || qty < 1 || qty > 999) {
    throw new ValidationError('Quantity must be between 1 and 999');
  }

  // Verify stock availability
  const product = await Product.findById(productId);
  if (!product) {
    throw new NotFoundError('Product not found');
  }

  if (product.stock < qty) {
    throw new ValidationError(`Only ${product.stock} items available in stock`);
  }

  const user = await User.findById(userId);
  const cartItem = user.cart.find(item => item.product.toString() === productId);

  if (!cartItem) {
    throw new NotFoundError('Product not in cart');
  }

  cartItem.quantity = qty;
  await user.save();

  await user.populate({
    path: 'cart.product',
    populate: [
      { path: 'category', select: 'name slug icon' },
      { path: 'distributor', select: 'businessName slug' }
    ]
  });

  return sendSuccess(res, {
    message: 'Cart updated',
    data: { cart: user.cart }
  });
});

// @desc    Remove product from cart
// @route   DELETE /api/products/cart/:productId
// @access  Private
exports.removeFromCart = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { productId } = req.params;

  const user = await User.findById(userId);
  user.cart = user.cart.filter(item => item.product.toString() !== productId);
  await user.save();

  await user.populate({
    path: 'cart.product',
    populate: [
      { path: 'category', select: 'name slug icon' },
      { path: 'distributor', select: 'businessName slug' }
    ]
  });

  return sendSuccess(res, {
    message: 'Product removed from cart',
    data: { cart: user.cart }
  });
});

// @desc    Get user cart
// @route   GET /api/products/cart
// @access  Private
exports.getCart = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const user = await User.findById(userId).populate({
    path: 'cart.product',
    populate: [
      { path: 'category', select: 'name slug icon' },
      { path: 'distributor', select: 'businessName city state slug' }
    ]
  });

  return sendSuccess(res, { data: { cart: user.cart } });
});

// @desc    Clear cart
// @route   DELETE /api/products/cart
// @access  Private
exports.clearCart = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const user = await User.findById(userId);
  user.cart = [];
  await user.save();

  return sendSuccess(res, {
    message: 'Cart cleared',
    data: { cart: [] }
  });
});

module.exports = exports;
