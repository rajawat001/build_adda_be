const User = require('../models/User');
const Distributor = require('../models/Distributor');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Transaction = require('../models/Transaction');
const Coupon = require('../models/Coupon');
const asyncHandler = require('../utils/asyncHandler');
const { ValidationError, NotFoundError, ConflictError } = require('../utils/errors');

// @desc    Get admin dashboard statistics
// @route   GET /api/admin/stats
// @access  Private (Admin only)
exports.getAdminStats = asyncHandler(async (req, res) => {
  // Run all queries in parallel for better performance
  const [
    totalUsers,
    totalDistributors,
    totalProducts,
    totalOrders,
    revenueResult
  ] = await Promise.all([
    User.countDocuments({ role: 'user' }),
    Distributor.countDocuments(),
    Product.countDocuments(),
    Order.countDocuments(),
    Order.aggregate([
      { $match: { paymentStatus: 'paid' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ])
  ]);

  const totalRevenue = revenueResult[0]?.total || 0;

  res.json({
    success: true,
    stats: {
      totalRevenue,
      totalOrders,
      totalUsers,
      totalDistributors,
      totalProducts
    }
  });
});

// @desc    Get all users with pagination
// @route   GET /api/admin/users
// @access  Private (Admin only)
exports.getAllUsers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search } = req.query;

  // Validate and limit pagination
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit))); // Max 100 items

  const filter = { role: 'user' };

  // Search by name or email
  if (search && search.trim()) {
    const searchRegex = new RegExp(search.trim(), 'i');
    filter.$or = [
      { name: searchRegex },
      { email: searchRegex }
    ];
  }

  const users = await User.find(filter)
    .select('-password')
    .sort('-createdAt')
    .limit(limitNum)
    .skip((pageNum - 1) * limitNum);

  const total = await User.countDocuments(filter);

  res.json({
    success: true,
    users,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum)
    }
  });
});

// @desc    Update user status
// @route   PUT /api/admin/users/:userId
// @access  Private (Admin only)
exports.updateUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { isActive } = req.body;

  // Validate input
  if (typeof isActive !== 'boolean') {
    throw new ValidationError('isActive must be a boolean value');
  }

  const user = await User.findById(userId).select('-password');

  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Prevent admin from deactivating themselves
  if (req.user._id.toString() === userId && !isActive) {
    throw new ValidationError('You cannot deactivate your own account');
  }

  // Update only the isActive field (field whitelisting)
  user.isActive = isActive;
  await user.save();

  res.json({
    success: true,
    message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
    user
  });
});

// @desc    Delete user
// @route   DELETE /api/admin/users/:userId
// @access  Private (Admin only)
exports.deleteUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const user = await User.findById(userId);

  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Prevent admin from deleting themselves
  if (req.user._id.toString() === userId) {
    throw new ValidationError('You cannot delete your own account');
  }

  await user.deleteOne();

  res.json({
    success: true,
    message: 'User deleted successfully'
  });
});

// @desc    Get all distributors with pagination
// @route   GET /api/admin/distributors
// @access  Private (Admin only)
exports.getAllDistributors = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, isApproved, search } = req.query;

  // Validate and limit pagination
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

  const filter = {};

  // Filter by approval status
  if (isApproved !== undefined) {
    filter.isApproved = isApproved === 'true';
  }

  // Search by business name or email
  if (search && search.trim()) {
    const searchRegex = new RegExp(search.trim(), 'i');
    filter.$or = [
      { businessName: searchRegex },
      { email: searchRegex }
    ];
  }

  const distributors = await Distributor.find(filter)
    .select('-password')
    .sort('-createdAt')
    .limit(limitNum)
    .skip((pageNum - 1) * limitNum);

  const total = await Distributor.countDocuments(filter);

  res.json({
    success: true,
    distributors,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum)
    }
  });
});

// @desc    Approve or reject distributor
// @route   PUT /api/admin/distributors/:distributorId/approve
// @access  Private (Admin only)
exports.approveDistributor = asyncHandler(async (req, res) => {
  const { distributorId } = req.params;
  const { isApproved, rejectionReason } = req.body;
  const adminId = req.user._id;

  // Validate input
  if (typeof isApproved !== 'boolean') {
    throw new ValidationError('isApproved must be a boolean value');
  }

  if (!isApproved && !rejectionReason) {
    throw new ValidationError('Rejection reason is required when rejecting distributor');
  }

  const distributor = await Distributor.findById(distributorId).select('-password');

  if (!distributor) {
    throw new NotFoundError('Distributor not found');
  }

  // Update approval status with proper field whitelisting
  distributor.isApproved = isApproved;
  distributor.approvedBy = isApproved ? adminId : null;
  distributor.approvedAt = isApproved ? new Date() : null;
  distributor.rejectionReason = !isApproved ? rejectionReason : null;

  await distributor.save();

  res.json({
    success: true,
    message: `Distributor ${isApproved ? 'approved' : 'rejected'} successfully`,
    distributor
  });
});

// @desc    Update distributor status
// @route   PUT /api/admin/distributors/:distributorId
// @access  Private (Admin only)
exports.updateDistributor = asyncHandler(async (req, res) => {
  const { distributorId } = req.params;
  const { isActive } = req.body;

  // Validate input
  if (typeof isActive !== 'boolean') {
    throw new ValidationError('isActive must be a boolean value');
  }

  const distributor = await Distributor.findById(distributorId).select('-password');

  if (!distributor) {
    throw new NotFoundError('Distributor not found');
  }

  // Update only the isActive field (field whitelisting)
  distributor.isActive = isActive;
  await distributor.save();

  res.json({
    success: true,
    message: `Distributor ${isActive ? 'activated' : 'deactivated'} successfully`,
    distributor
  });
});

// @desc    Delete distributor and associated products
// @route   DELETE /api/admin/distributors/:distributorId
// @access  Private (Admin only)
exports.deleteDistributor = asyncHandler(async (req, res) => {
  const { distributorId } = req.params;

  const distributor = await Distributor.findById(distributorId);

  if (!distributor) {
    throw new NotFoundError('Distributor not found');
  }

  // Delete distributor's products first
  await Product.deleteMany({ distributor: distributorId });

  // Delete distributor
  await distributor.deleteOne();

  res.json({
    success: true,
    message: 'Distributor and associated products deleted successfully'
  });
});

// @desc    Get all products with pagination
// @route   GET /api/admin/products
// @access  Private (Admin only)
exports.getAllProducts = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, category, isActive } = req.query;

  // Validate and limit pagination
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

  const filter = {};

  // Filter by category
  if (category) {
    filter.category = category;
  }

  // Filter by active status
  if (isActive !== undefined) {
    filter.isActive = isActive === 'true';
  }

  const products = await Product.find(filter)
    .populate('distributor', 'businessName email')
    .sort('-createdAt')
    .limit(limitNum)
    .skip((pageNum - 1) * limitNum);

  const total = await Product.countDocuments(filter);

  res.json({
    success: true,
    products,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum)
    }
  });
});

// @desc    Delete product
// @route   DELETE /api/admin/products/:productId
// @access  Private (Admin only)
exports.deleteProduct = asyncHandler(async (req, res) => {
  const { productId } = req.params;

  const product = await Product.findById(productId);

  if (!product) {
    throw new NotFoundError('Product not found');
  }

  await product.deleteOne();

  res.json({
    success: true,
    message: 'Product deleted successfully'
  });
});

// @desc    Create new coupon
// @route   POST /api/admin/coupons
// @access  Private (Admin only)
exports.createCoupon = asyncHandler(async (req, res) => {
  const { code, discountType, discountValue, minPurchase, maxDiscount, expiryDate } = req.body;

  // Validate required fields
  if (!code || !code.trim()) {
    throw new ValidationError('Coupon code is required');
  }

  if (!discountType || !['percentage', 'fixed'].includes(discountType)) {
    throw new ValidationError('Discount type must be either "percentage" or "fixed"');
  }

  if (!discountValue || discountValue <= 0) {
    throw new ValidationError('Discount value must be greater than 0');
  }

  // Validate percentage range
  if (discountType === 'percentage' && (discountValue < 1 || discountValue > 100)) {
    throw new ValidationError('Percentage discount must be between 1 and 100');
  }

  // Validate expiry date
  if (expiryDate && new Date(expiryDate) < new Date()) {
    throw new ValidationError('Expiry date must be in the future');
  }

  // Check if coupon code already exists
  const couponCode = code.trim().toUpperCase();
  const existingCoupon = await Coupon.findOne({ code: couponCode });

  if (existingCoupon) {
    throw new ConflictError('Coupon code already exists');
  }

  // Create coupon with field whitelisting
  const coupon = await Coupon.create({
    code: couponCode,
    discountType,
    discountValue: parseFloat(discountValue),
    minPurchase: minPurchase ? parseFloat(minPurchase) : 0,
    maxDiscount: maxDiscount ? parseFloat(maxDiscount) : 0,
    expiryDate: expiryDate ? new Date(expiryDate) : null
  });

  res.status(201).json({
    success: true,
    message: 'Coupon created successfully',
    coupon
  });
});

// @desc    Get all coupons
// @route   GET /api/admin/coupons
// @access  Private (Admin only)
exports.getAllCoupons = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, isActive } = req.query;

  // Validate and limit pagination
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

  const filter = {};

  // Filter by active status
  if (isActive !== undefined) {
    filter.isActive = isActive === 'true';
  }

  const coupons = await Coupon.find(filter)
    .sort('-createdAt')
    .limit(limitNum)
    .skip((pageNum - 1) * limitNum);

  const total = await Coupon.countDocuments(filter);

  res.json({
    success: true,
    coupons,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum)
    }
  });
});

// @desc    Update coupon
// @route   PUT /api/admin/coupons/:couponId
// @access  Private (Admin only)
exports.updateCoupon = asyncHandler(async (req, res) => {
  const { couponId } = req.params;
  const { discountValue, minPurchase, maxDiscount, expiryDate, isActive } = req.body;

  const coupon = await Coupon.findById(couponId);

  if (!coupon) {
    throw new NotFoundError('Coupon not found');
  }

  // Field whitelisting - only update allowed fields
  if (discountValue !== undefined) {
    const value = parseFloat(discountValue);
    if (value <= 0) {
      throw new ValidationError('Discount value must be greater than 0');
    }
    if (coupon.discountType === 'percentage' && (value < 1 || value > 100)) {
      throw new ValidationError('Percentage discount must be between 1 and 100');
    }
    coupon.discountValue = value;
  }

  if (minPurchase !== undefined) {
    coupon.minPurchase = Math.max(0, parseFloat(minPurchase));
  }

  if (maxDiscount !== undefined) {
    coupon.maxDiscount = Math.max(0, parseFloat(maxDiscount));
  }

  if (expiryDate !== undefined) {
    const expiry = new Date(expiryDate);
    if (expiry < new Date()) {
      throw new ValidationError('Expiry date must be in the future');
    }
    coupon.expiryDate = expiry;
  }

  if (typeof isActive === 'boolean') {
    coupon.isActive = isActive;
  }

  await coupon.save();

  res.json({
    success: true,
    message: 'Coupon updated successfully',
    coupon
  });
});

// @desc    Delete coupon
// @route   DELETE /api/admin/coupons/:couponId
// @access  Private (Admin only)
exports.deleteCoupon = asyncHandler(async (req, res) => {
  const { couponId } = req.params;

  const coupon = await Coupon.findById(couponId);

  if (!coupon) {
    throw new NotFoundError('Coupon not found');
  }

  await coupon.deleteOne();

  res.json({
    success: true,
    message: 'Coupon deleted successfully'
  });
});

// @desc    Get transaction reports
// @route   GET /api/admin/transactions
// @access  Private (Admin only)
exports.getTransactionReports = asyncHandler(async (req, res) => {
  const { startDate, endDate, page = 1, limit = 20 } = req.query;

  // Validate and limit pagination
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

  const filter = {};

  // Date range filter
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start > end) {
      throw new ValidationError('Start date must be before end date');
    }

    filter.createdAt = {
      $gte: start,
      $lte: end
    };
  }

  const transactions = await Transaction.find(filter)
    .populate('order', 'orderNumber totalAmount')
    .populate('user', 'name email')
    .sort('-createdAt')
    .limit(limitNum)
    .skip((pageNum - 1) * limitNum);

  const total = await Transaction.countDocuments(filter);
  const totalAmount = transactions.reduce((sum, txn) => sum + txn.amount, 0);

  res.json({
    success: true,
    transactions,
    totalAmount,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum)
    }
  });
});

// @desc    Get all orders with pagination
// @route   GET /api/admin/orders
// @access  Private (Admin only)
exports.getAllOrders = asyncHandler(async (req, res) => {
  const { orderStatus, paymentStatus, page = 1, limit = 20 } = req.query;

  // Validate and limit pagination
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

  const filter = {};

  // Filter by order status
  if (orderStatus) {
    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
    if (validStatuses.includes(orderStatus)) {
      filter.orderStatus = orderStatus;
    }
  }

  // Filter by payment status
  if (paymentStatus) {
    const validPaymentStatuses = ['pending', 'paid', 'failed', 'refunded'];
    if (validPaymentStatuses.includes(paymentStatus)) {
      filter.paymentStatus = paymentStatus;
    }
  }

  const orders = await Order.find(filter)
    .populate('user', 'name email phone')
    .populate('distributor', 'businessName email')
    .populate('items.product', 'name price')
    .sort('-createdAt')
    .limit(limitNum)
    .skip((pageNum - 1) * limitNum);

  const total = await Order.countDocuments(filter);

  res.json({
    success: true,
    orders,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum)
    }
  });
});

// @desc    Update order status (Admin override)
// @route   PUT /api/admin/orders/:orderId/status
// @access  Private (Admin only)
exports.updateOrderStatus = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { orderStatus, note } = req.body;
  const adminId = req.user._id;

  // Validate order status
  const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
  if (!orderStatus || !validStatuses.includes(orderStatus)) {
    throw new ValidationError(`Order status must be one of: ${validStatuses.join(', ')}`);
  }

  const order = await Order.findById(orderId);

  if (!order) {
    throw new NotFoundError('Order not found');
  }

  // Use the Order model's updateStatus method
  await order.updateStatus(orderStatus, note || 'Updated by admin', adminId, 'User');

  res.json({
    success: true,
    message: 'Order status updated successfully',
    order
  });
});

module.exports = exports;
