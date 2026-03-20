const Product = require('../models/Product');
const Category = require('../models/Category');
const User = require('../models/User');

class ProductService {
  // Get all products with filters and pagination
  async getProducts(filters = {}, options = {}) {
    const { page = 1, limit = 20, sort = '-createdAt', populate = [] } = options;

    const query = Product.find(filters);

    // Always populate category if not already in the populate list
    const hasCategory = populate.some(p =>
      (typeof p === 'string' && p === 'category') ||
      (typeof p === 'object' && p.path === 'category')
    );
    if (!hasCategory) {
      query.populate({ path: 'category', select: 'name slug icon' });
    }

    if (populate.length > 0) {
      populate.forEach(pop => {
        query.populate(pop);
      });
    }

    const products = await query
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const count = await Product.countDocuments(filters);

    return {
      products,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      totalProducts: count
    };
  }

  // Get single product by ID
  async getProductById(productId) {
    return await Product.findById(productId)
      .populate({ path: 'category', select: 'name slug icon' })
      .populate('distributor', 'businessName email phone address city state pincode slug');
  }

  // Get products by category — accepts ObjectId, name, or slug
  async getProductsByCategory(categoryIdentifier) {
    let categoryId = categoryIdentifier;

    // If not a valid ObjectId, resolve by name or slug
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(categoryIdentifier);
    if (!isObjectId && typeof categoryIdentifier === 'string') {
      const escapedVal = categoryIdentifier.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
      const categoryDoc = await Category.findOne({
        $or: [
          { name: { $regex: new RegExp(`^${escapedVal}$`, 'i') } },
          { slug: categoryIdentifier.toLowerCase() }
        ]
      });
      if (!categoryDoc) return [];
      categoryId = categoryDoc._id;
    }

    return await Product.find({ category: categoryId })
      .populate({ path: 'category', select: 'name slug icon' })
      .populate('distributor', 'businessName slug')
      .sort('-createdAt')
      .lean();
  }

  // Get products by distributor
  async getProductsByDistributor(distributorId) {
    return await Product.find({ distributor: distributorId })
      .populate({ path: 'category', select: 'name slug icon' })
      .sort('-createdAt')
      .lean();
  }

  // Get all categories
  async getCategories() {
    return await Category.find({ isActive: true }).sort('name');
  }

  // Wishlist operations
  async addToWishlist(userId, productId) {
    const user = await User.findById(userId);

    if (!user) {
      throw new Error('User not found');
    }

    const product = await Product.findById(productId);
    if (!product) {
      throw new Error('Product not found');
    }

    if (!user.wishlist) {
      user.wishlist = [];
    }

    // Check if already in wishlist
    if (user.wishlist.includes(productId)) {
      throw new Error('Product already in wishlist');
    }

    user.wishlist.push(productId);
    await user.save();

    return await this.getWishlist(userId);
  }

  async removeFromWishlist(userId, productId) {
    const user = await User.findById(userId);

    if (!user) {
      throw new Error('User not found');
    }

    user.wishlist = user.wishlist.filter(id => id.toString() !== productId);
    await user.save();

    return user.wishlist;
  }

  async getWishlist(userId) {
    const user = await User.findById(userId).populate({
      path: 'wishlist',
      populate: [
        { path: 'category', select: 'name slug icon' },
        { path: 'distributor', select: 'businessName' }
      ]
    });

    return user.wishlist || [];
  }

  // Cart operations
  async addToCart(userId, productId, quantity) {
    const user = await User.findById(userId);

    if (!user) {
      throw new Error('User not found');
    }

    const product = await Product.findById(productId);
    if (!product) {
      throw new Error('Product not found');
    }

    if (product.stock < quantity) {
      throw new Error('Insufficient stock');
    }

    if (!user.cart) {
      user.cart = [];
    }

    // Check if product already in cart
    const existingItem = user.cart.find(item => item.product.toString() === productId);

    if (existingItem) {
      existingItem.quantity += quantity;
    } else {
      user.cart.push({ product: productId, quantity });
    }

    await user.save();
    return await this.getCart(userId);
  }

  async updateCartItem(userId, productId, quantity) {
    const user = await User.findById(userId);

    if (!user) {
      throw new Error('User not found');
    }

    const product = await Product.findById(productId);
    if (!product) {
      throw new Error('Product not found');
    }

    if (product.stock < quantity) {
      throw new Error('Insufficient stock');
    }

    const cartItem = user.cart.find(item => item.product.toString() === productId);

    if (!cartItem) {
      throw new Error('Product not in cart');
    }

    cartItem.quantity = quantity;
    await user.save();

    return await this.getCart(userId);
  }

  async removeFromCart(userId, productId) {
    const user = await User.findById(userId);

    if (!user) {
      throw new Error('User not found');
    }

    user.cart = user.cart.filter(item => item.product.toString() !== productId);
    await user.save();

    return await this.getCart(userId);
  }

  async getCart(userId) {
    const user = await User.findById(userId).populate({
      path: 'cart.product',
      populate: [
        { path: 'category', select: 'name slug icon' },
        { path: 'distributor', select: 'businessName' }
      ]
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Calculate total
    let total = 0;
    const cart = user.cart.map(item => {
      const subtotal = item.product.price * item.quantity;
      total += subtotal;
      return {
        ...item.toObject(),
        subtotal
      };
    });

    return {
      items: cart,
      total,
      itemCount: cart.length
    };
  }

  async clearCart(userId) {
    const user = await User.findById(userId);

    if (!user) {
      throw new Error('User not found');
    }

    user.cart = [];
    await user.save();
  }

  // Search products
  async searchProducts(searchTerm, filters = {}) {
    const searchQuery = {
      $or: [
        { name: { $regex: searchTerm, $options: 'i' } },
        { description: { $regex: searchTerm, $options: 'i' } }
      ],
      ...filters
    };

    return await Product.find(searchQuery)
      .populate({ path: 'category', select: 'name slug icon' })
      .populate('distributor', 'businessName slug')
      .sort('-createdAt')
      .lean();
  }

  // Get featured products
  async getFeaturedProducts(limit = 10) {
    return await Product.find({ isFeatured: true, stock: { $gt: 0 } })
      .populate({ path: 'category', select: 'name slug icon' })
      .populate('distributor', 'businessName slug')
      .limit(limit)
      .sort('-createdAt')
      .lean();
  }

  // Get low stock products (for distributor dashboard)
  async getLowStockProducts(distributorId, threshold = 10) {
    return await Product.find({
      distributor: distributorId,
      stock: { $lte: threshold }
    })
      .populate({ path: 'category', select: 'name slug icon' })
      .sort('stock');
  }
}

module.exports = new ProductService();
