const productService = require('../services/product.service');
const Product = require('../models/Product');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { ValidationError, NotFoundError } = require('../utils/errors');

// Helper function to escape regex special characters
const escapeRegex = (text) => {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
};

// @desc    Get all products with filters
// @route   GET /api/products
// @access  Public
exports.getAllProducts = asyncHandler(async (req, res) => {
  const { category, minPrice, maxPrice, search, sortBy, page = 1, limit = 20 } = req.query;

  const filters = { isActive: true }; // Only show active products

  // Category filter with validation
  if (category) {
    const validCategories = ['Cement', 'Steel', 'Bricks', 'Sand', 'Paint', 'Tiles', 'Other'];
    if (validCategories.includes(category)) {
      filters.category = category;
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
  if (search && search.trim()) {
    const sanitizedSearch = escapeRegex(search.trim());
    filters.$or = [
      { name: { $regex: sanitizedSearch, $options: 'i' } },
      { description: { $regex: sanitizedSearch, $options: 'i' } }
    ];
  }

  // Validate and limit pagination
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit))); // Max 100 items

  const options = {
    page: pageNum,
    limit: limitNum,
    sort: sortBy || '-createdAt',
    populate: [
      { path: 'distributor', select: 'businessName email phone city state' }
    ]
  };

  const products = await productService.getProducts(filters, options);

  res.json({
    success: true,
    ...products
  });
});

// @desc    Get single product by ID
// @route   GET /api/products/:id
// @access  Public
exports.getProductById = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id)
    .populate('distributor', 'businessName email phone address city state rating');

  if (!product) {
    throw new NotFoundError('Product not found');
  }

  // Only show if active (or if user is the distributor/admin)
  if (!product.isActive && (!req.user || req.user._id.toString() !== product.distributor._id.toString())) {
    throw new NotFoundError('Product not found');
  }

  res.json({ success: true, product });
});

// @desc    Get products by category
// @route   GET /api/products/category/:categoryId
// @access  Public
exports.getProductsByCategory = asyncHandler(async (req, res) => {
  const { categoryId } = req.params;

  const validCategories = ['Cement', 'Steel', 'Bricks', 'Sand', 'Paint', 'Tiles', 'Other'];
  if (!validCategories.includes(categoryId)) {
    throw new ValidationError('Invalid category');
  }

  const products = await Product.find({
    category: categoryId,
    isActive: true
  }).populate('distributor', 'businessName city state');

  res.json({ success: true, count: products.length, products });
});

// @desc    Get products by distributor
// @route   GET /api/products/distributor/:distributorId
// @access  Public
exports.getProductsByDistributor = asyncHandler(async (req, res) => {
  const { distributorId } = req.params;

  const products = await Product.find({
    distributor: distributorId,
    isActive: true
  }).populate('distributor', 'businessName email phone city state rating');

  res.json({ success: true, count: products.length, products });
});

// @desc    Get all categories
// @route   GET /api/products/categories
// @access  Public
exports.getCategories = asyncHandler(async (req, res) => {
  const categories = [
    { id: 'Cement', name: 'Cement', icon: '🏗️' },
    { id: 'Steel', name: 'Steel', icon: '🔩' },
    { id: 'Bricks', name: 'Bricks', icon: '🧱' },
    { id: 'Sand', name: 'Sand', icon: '⏳' },
    { id: 'Paint', name: 'Paint', icon: '🎨' },
    { id: 'Tiles', name: 'Tiles', icon: '◽' },
    { id: 'Other', name: 'Other', icon: '📦' }
  ];

  // Get count for each category
  const categoriesWithCount = await Promise.all(
    categories.map(async (cat) => {
      const count = await Product.countDocuments({
        category: cat.id,
        isActive: true
      });
      return { ...cat, count };
    })
  );

  res.json({ success: true, categories: categoriesWithCount });
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
    return res.json({
      success: true,
      message: 'Product already in wishlist',
      wishlist: user.wishlist
    });
  }

  user.wishlist.push(productId);
  await user.save();

  res.json({
    success: true,
    message: 'Product added to wishlist',
    wishlist: user.wishlist
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

  res.json({
    success: true,
    message: 'Product removed from wishlist',
    wishlist: user.wishlist
  });
});

// @desc    Get user wishlist
// @route   GET /api/products/wishlist
// @access  Private
exports.getWishlist = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const user = await User.findById(userId).populate({
    path: 'wishlist',
    populate: { path: 'distributor', select: 'businessName city state' }
  });

  res.json({ success: true, wishlist: user.wishlist });
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
    populate: { path: 'distributor', select: 'businessName' }
  });

  res.json({
    success: true,
    message: 'Product added to cart',
    cart: user.cart
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
    populate: { path: 'distributor', select: 'businessName' }
  });

  res.json({
    success: true,
    message: 'Cart updated',
    cart: user.cart
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
    populate: { path: 'distributor', select: 'businessName' }
  });

  res.json({
    success: true,
    message: 'Product removed from cart',
    cart: user.cart
  });
});

// @desc    Get user cart
// @route   GET /api/products/cart
// @access  Private
exports.getCart = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const user = await User.findById(userId).populate({
    path: 'cart.product',
    populate: { path: 'distributor', select: 'businessName city state' }
  });

  res.json({ success: true, cart: user.cart });
});

// @desc    Clear cart
// @route   DELETE /api/products/cart
// @access  Private
exports.clearCart = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const user = await User.findById(userId);
  user.cart = [];
  await user.save();

  res.json({
    success: true,
    message: 'Cart cleared',
    cart: []
  });
});

module.exports = exports;
