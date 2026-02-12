const User = require('../models/User');
const Distributor = require('../models/Distributor');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Transaction = require('../models/Transaction');
const Coupon = require('../models/Coupon');
const asyncHandler = require('../utils/asyncHandler');
const { ValidationError, NotFoundError, ConflictError } = require('../utils/errors');
const paymentService = require('../services/payment.service');
const emailService = require('../services/email.service');

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
      {
        $match: {
          $or: [
            { paymentStatus: 'paid' },
            { orderStatus: 'delivered' }
          ]
        }
      },
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

  // Search by name, email, or phone
  if (search && search.trim()) {
    const escapedSearch = search.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    const searchRegex = new RegExp(escapedSearch, 'i');
    filter.$or = [
      { name: searchRegex },
      { email: searchRegex },
      { phone: searchRegex }
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

  // Search by business name, owner name, email, phone, or city
  if (search && search.trim()) {
    const escapedSearch = search.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    const searchRegex = new RegExp(escapedSearch, 'i');
    filter.$or = [
      { businessName: searchRegex },
      { name: searchRegex },
      { email: searchRegex },
      { phone: searchRegex },
      { city: searchRegex }
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
  const { isActive, businessName, ownerName, email, phone, city, state, address, gstNumber } = req.body;

  const distributor = await Distributor.findById(distributorId).select('-password');

  if (!distributor) {
    throw new NotFoundError('Distributor not found');
  }

  // Field whitelisting — update only allowed fields
  if (typeof isActive === 'boolean') {
    distributor.isActive = isActive;
  }

  if (businessName !== undefined && businessName.trim()) {
    distributor.businessName = businessName.trim();
  }

  if (ownerName !== undefined && ownerName.trim()) {
    distributor.ownerName = ownerName.trim();
  }

  if (email !== undefined && email.trim()) {
    distributor.email = email.trim();
  }

  if (phone !== undefined && phone.trim()) {
    distributor.phone = phone.trim();
  }

  if (city !== undefined && city.trim()) {
    distributor.city = city.trim();
  }

  if (state !== undefined && state.trim()) {
    distributor.state = state.trim();
  }

  if (address !== undefined && address.trim()) {
    distributor.address = address.trim();
  }

  if (gstNumber !== undefined) {
    distributor.gstNumber = gstNumber.trim();
  }

  await distributor.save();

  res.json({
    success: true,
    message: 'Distributor updated successfully',
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
  const { page = 1, limit = 20, category, isActive, status, stock, priceRange, search, distributor } = req.query;

  // Validate and limit pagination
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

  const filter = {};

  // Filter by category (case-insensitive match against enum)
  if (category) {
    const validCategories = ['Cement', 'Steel', 'Bricks', 'Sand', 'Paint', 'Tiles', 'Other'];
    const matched = validCategories.find(c => c.toLowerCase() === category.toLowerCase());
    if (matched) {
      filter.category = matched;
    }
  }

  // Filter by status (maps 'active'/'inactive' to isActive boolean)
  if (status === 'active') {
    filter.isActive = true;
  } else if (status === 'inactive') {
    filter.isActive = false;
  } else if (isActive !== undefined) {
    filter.isActive = isActive === 'true';
  }

  // Filter by stock level
  if (stock === 'outofstock') {
    filter.stock = 0;
  } else if (stock === 'lowstock') {
    filter.stock = { $gt: 0, $lte: 10 };
  } else if (stock === 'instock') {
    filter.stock = { $gt: 10 };
  }

  // Filter by price range (format: "min-max")
  if (priceRange && priceRange.includes('-')) {
    const [minStr, maxStr] = priceRange.split('-');
    const min = parseFloat(minStr);
    const max = parseFloat(maxStr);
    if (!isNaN(min) && !isNaN(max)) {
      filter.price = { $gte: min, $lte: max };
    } else if (!isNaN(min)) {
      filter.price = { $gte: min };
    } else if (!isNaN(max)) {
      filter.price = { $lte: max };
    }
  }

  // Search by product name
  if (search && search.trim()) {
    const escapedSearch = search.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    filter.name = { $regex: escapedSearch, $options: 'i' };
  }

  // Filter by distributor name (Product.distributor refs the Distributor model)
  if (distributor && distributor.trim()) {
    const escapedDist = distributor.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    const matchingDistributors = await Distributor.find({
      businessName: { $regex: escapedDist, $options: 'i' }
    }).select('_id');
    if (matchingDistributors.length > 0) {
      filter.distributor = { $in: matchingDistributors.map(d => d._id) };
    } else {
      // No matching distributors — return empty results
      filter.distributor = null;
    }
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
  const {
    code,
    discountType,
    discountValue,
    minPurchase,
    maxDiscount,
    expiryDate,
    usageLimit,
    applicableFor,
    freeMonths,
    description
  } = req.body;

  // Validate required fields
  if (!code || !code.trim()) {
    throw new ValidationError('Coupon code is required');
  }

  // For free months coupon, discountType and discountValue can be defaulted
  const hasFreeMonths = freeMonths && parseInt(freeMonths) > 0;

  if (!hasFreeMonths) {
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
  }

  // Validate expiry date
  if (expiryDate && new Date(expiryDate) < new Date()) {
    throw new ValidationError('Expiry date must be in the future');
  }

  // Validate applicableFor
  const validApplicableFor = ['products', 'subscription', 'both'];
  const applicableForValue = applicableFor && validApplicableFor.includes(applicableFor) ? applicableFor : 'products';

  // Check if coupon code already exists
  const couponCode = code.trim().toUpperCase();
  const existingCoupon = await Coupon.findOne({ code: couponCode });

  if (existingCoupon) {
    throw new ConflictError('Coupon code already exists');
  }

  // Create coupon with field whitelisting
  const coupon = await Coupon.create({
    code: couponCode,
    discountType: hasFreeMonths ? 'percentage' : discountType,
    discountValue: hasFreeMonths ? 100 : parseFloat(discountValue),
    minOrderAmount: minPurchase ? parseFloat(minPurchase) : 0,
    maxDiscount: maxDiscount ? parseFloat(maxDiscount) : null,
    expiryDate: expiryDate ? new Date(expiryDate) : null,
    usageLimit: usageLimit ? parseInt(usageLimit) : null,
    applicableFor: applicableForValue,
    freeMonths: hasFreeMonths ? parseInt(freeMonths) : 0,
    description: description || '',
    createdBy: req.user._id
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
  const {
    discountValue,
    minPurchase,
    maxDiscount,
    expiryDate,
    isActive,
    usageLimit,
    applicableFor,
    freeMonths,
    description
  } = req.body;

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
    coupon.minOrderAmount = Math.max(0, parseFloat(minPurchase));
  }

  if (maxDiscount !== undefined) {
    coupon.maxDiscount = maxDiscount ? Math.max(0, parseFloat(maxDiscount)) : null;
  }

  if (expiryDate !== undefined) {
    if (expiryDate) {
      const expiry = new Date(expiryDate);
      if (expiry < new Date()) {
        throw new ValidationError('Expiry date must be in the future');
      }
      coupon.expiryDate = expiry;
    } else {
      coupon.expiryDate = null;
    }
  }

  if (typeof isActive === 'boolean') {
    coupon.isActive = isActive;
  }

  if (usageLimit !== undefined) {
    coupon.usageLimit = usageLimit ? parseInt(usageLimit) : null;
  }

  if (applicableFor !== undefined) {
    const validApplicableFor = ['products', 'subscription', 'both'];
    if (validApplicableFor.includes(applicableFor)) {
      coupon.applicableFor = applicableFor;
    }
  }

  if (freeMonths !== undefined) {
    coupon.freeMonths = freeMonths ? Math.max(0, parseInt(freeMonths)) : 0;
  }

  if (description !== undefined) {
    coupon.description = description;
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
  const { orderStatus, paymentStatus, search, page = 1, limit = 20 } = req.query;

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

  // Search by order number, guest email, or shipping address fields
  if (search && search.trim()) {
    const searchRegex = new RegExp(search.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'i');
    filter.$or = [
      { orderNumber: searchRegex },
      { guestEmail: searchRegex },
      { 'shippingAddress.fullName': searchRegex },
      { 'shippingAddress.phone': searchRegex }
    ];
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

// @desc    Process refund for an order (PhonePe)
// @route   POST /api/admin/orders/:orderId/refund
// @access  Private (Admin only)
exports.processRefund = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { amount } = req.body; // Optional partial refund amount

  const order = await Order.findById(orderId).populate('user', 'name email');

  if (!order) {
    throw new NotFoundError('Order not found');
  }

  if (order.paymentStatus === 'refunded') {
    throw new ValidationError('Order has already been refunded');
  }

  if (order.paymentStatus !== 'paid') {
    throw new ValidationError('Can only refund paid orders');
  }

  if (order.paymentMethod !== 'Online') {
    throw new ValidationError('Can only process online payment refunds. COD orders do not require refund processing.');
  }

  if (!order.phonepeMerchantTransactionId) {
    throw new ValidationError('No PhonePe transaction found for this order');
  }

  const refundAmount = amount || order.totalAmount;

  if (refundAmount <= 0 || refundAmount > order.totalAmount) {
    throw new ValidationError(`Refund amount must be between 1 and ${order.totalAmount}`);
  }

  // Create refund via PhonePe v2
  const refundId = `REFUND_${order._id}_${Date.now()}`;

  const refundResponse = await paymentService.createRefund({
    merchantOrderId: order.phonepeMerchantTransactionId,
    merchantRefundId: refundId,
    amount: refundAmount
  });

  // Update order
  order.refundAmount = refundAmount;
  order.refundStatus = 'pending';
  order.refundedAt = new Date();

  // v2 refund response uses state instead of code
  if (refundResponse.state === 'COMPLETED') {
    order.refundStatus = 'processed';
    order.paymentStatus = 'refunded';
  }

  await order.save();

  // Send refund notification email
  if (order.user && order.user.email) {
    emailService.sendRefundNotificationEmail(order, order.user.name || 'Customer', order.user.email);
  }

  res.json({
    success: true,
    message: `Refund of ₹${refundAmount} initiated successfully`,
    order,
    refundTransactionId
  });
});

// ==================== BULK OPERATIONS ====================

// @desc    Bulk activate users
// @route   POST /api/admin/users/bulk-activate
// @access  Private (Admin only)
exports.bulkActivateUsers = asyncHandler(async (req, res) => {
  const { userIds } = req.body;

  if (!Array.isArray(userIds) || userIds.length === 0) {
    throw new ValidationError('Please provide an array of user IDs');
  }

  const result = await User.updateMany(
    { _id: { $in: userIds }, role: 'user' },
    { $set: { isActive: true } }
  );

  res.json({
    success: true,
    message: `Successfully activated ${result.modifiedCount} user(s)`,
    modifiedCount: result.modifiedCount
  });
});

// @desc    Bulk deactivate users
// @route   POST /api/admin/users/bulk-deactivate
// @access  Private (Admin only)
exports.bulkDeactivateUsers = asyncHandler(async (req, res) => {
  const { userIds } = req.body;
  const adminId = req.user._id;

  if (!Array.isArray(userIds) || userIds.length === 0) {
    throw new ValidationError('Please provide an array of user IDs');
  }

  // Prevent admin from deactivating themselves
  if (userIds.includes(adminId.toString())) {
    throw new ValidationError('You cannot deactivate your own account');
  }

  const result = await User.updateMany(
    { _id: { $in: userIds }, role: 'user', _id: { $ne: adminId } },
    { $set: { isActive: false } }
  );

  res.json({
    success: true,
    message: `Successfully deactivated ${result.modifiedCount} user(s)`,
    modifiedCount: result.modifiedCount
  });
});

// @desc    Bulk delete users
// @route   DELETE /api/admin/users/bulk-delete
// @access  Private (Admin only)
exports.bulkDeleteUsers = asyncHandler(async (req, res) => {
  const { userIds } = req.body;
  const adminId = req.user._id;

  if (!Array.isArray(userIds) || userIds.length === 0) {
    throw new ValidationError('Please provide an array of user IDs');
  }

  // Prevent admin from deleting themselves
  if (userIds.includes(adminId.toString())) {
    throw new ValidationError('You cannot delete your own account');
  }

  const result = await User.deleteMany({
    _id: { $in: userIds },
    role: 'user',
    _id: { $ne: adminId }
  });

  res.json({
    success: true,
    message: `Successfully deleted ${result.deletedCount} user(s)`,
    deletedCount: result.deletedCount
  });
});

// @desc    Bulk approve distributors
// @route   POST /api/admin/distributors/bulk-approve
// @access  Private (Admin only)
exports.bulkApproveDistributors = asyncHandler(async (req, res) => {
  const { distributorIds } = req.body;
  const adminId = req.user._id;

  if (!Array.isArray(distributorIds) || distributorIds.length === 0) {
    throw new ValidationError('Please provide an array of distributor IDs');
  }

  const result = await Distributor.updateMany(
    { _id: { $in: distributorIds } },
    {
      $set: {
        isApproved: true,
        approvedBy: adminId,
        approvedAt: new Date(),
        rejectionReason: null
      }
    }
  );

  res.json({
    success: true,
    message: `Successfully approved ${result.modifiedCount} distributor(s)`,
    modifiedCount: result.modifiedCount
  });
});

// @desc    Bulk reject distributors
// @route   POST /api/admin/distributors/bulk-reject
// @access  Private (Admin only)
exports.bulkRejectDistributors = asyncHandler(async (req, res) => {
  const { distributorIds, rejectionReason = 'Rejected by admin' } = req.body;

  if (!Array.isArray(distributorIds) || distributorIds.length === 0) {
    throw new ValidationError('Please provide an array of distributor IDs');
  }

  const result = await Distributor.updateMany(
    { _id: { $in: distributorIds } },
    {
      $set: {
        isApproved: false,
        approvedBy: null,
        approvedAt: null,
        rejectionReason
      }
    }
  );

  res.json({
    success: true,
    message: `Successfully rejected ${result.modifiedCount} distributor(s)`,
    modifiedCount: result.modifiedCount
  });
});

// @desc    Bulk delete distributors
// @route   DELETE /api/admin/distributors/bulk-delete
// @access  Private (Admin only)
exports.bulkDeleteDistributors = asyncHandler(async (req, res) => {
  const { distributorIds } = req.body;

  if (!Array.isArray(distributorIds) || distributorIds.length === 0) {
    throw new ValidationError('Please provide an array of distributor IDs');
  }

  // Delete all products from these distributors first
  await Product.deleteMany({ distributor: { $in: distributorIds } });

  // Delete the distributors
  const result = await Distributor.deleteMany({
    _id: { $in: distributorIds }
  });

  res.json({
    success: true,
    message: `Successfully deleted ${result.deletedCount} distributor(s) and their products`,
    deletedCount: result.deletedCount
  });
});

// @desc    Bulk delete products
// @route   DELETE /api/admin/products/bulk-delete
// @access  Private (Admin only)
exports.bulkDeleteProducts = asyncHandler(async (req, res) => {
  const { productIds } = req.body;

  if (!Array.isArray(productIds) || productIds.length === 0) {
    throw new ValidationError('Please provide an array of product IDs');
  }

  const result = await Product.deleteMany({
    _id: { $in: productIds }
  });

  res.json({
    success: true,
    message: `Successfully deleted ${result.deletedCount} product(s)`,
    deletedCount: result.deletedCount
  });
});

// ==================== ANALYTICS ENDPOINTS ====================

// @desc    Get comprehensive dashboard analytics
// @route   GET /api/admin/analytics/dashboard
// @access  Private (Admin only)
exports.getDashboardAnalytics = asyncHandler(async (req, res) => {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  // Revenue metrics (include delivered orders)
  const [currentRevenue, previousRevenue] = await Promise.all([
    Order.aggregate([
      {
        $match: {
          $or: [
            { paymentStatus: 'paid' },
            { orderStatus: 'delivered' }
          ],
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]),
    Order.aggregate([
      {
        $match: {
          $or: [
            { paymentStatus: 'paid' },
            { orderStatus: 'delivered' }
          ],
          createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo }
        }
      },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ])
  ]);

  const totalRevenue = currentRevenue[0]?.total || 0;
  const previousPeriodRevenue = previousRevenue[0]?.total || 0;
  const revenueTrend = previousPeriodRevenue > 0
    ? ((totalRevenue - previousPeriodRevenue) / previousPeriodRevenue * 100).toFixed(1)
    : 100;

  // Order metrics
  const [currentOrders, previousOrders, totalOrders] = await Promise.all([
    Order.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
    Order.countDocuments({ createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo } }),
    Order.countDocuments()
  ]);

  const orderTrend = previousOrders > 0
    ? ((currentOrders - previousOrders) / previousOrders * 100).toFixed(1)
    : 100;

  // User metrics
  const [currentUsers, previousUsers, totalUsers] = await Promise.all([
    User.countDocuments({ role: 'user', createdAt: { $gte: thirtyDaysAgo } }),
    User.countDocuments({ role: 'user', createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo } }),
    User.countDocuments({ role: 'user' })
  ]);

  const userTrend = previousUsers > 0
    ? ((currentUsers - previousUsers) / previousUsers * 100).toFixed(1)
    : 100;

  // Distributor metrics
  const [approvedDistributors, pendingDistributors, totalDistributors] = await Promise.all([
    Distributor.countDocuments({ isApproved: true, isActive: true }),
    Distributor.countDocuments({ isApproved: false }),
    Distributor.countDocuments()
  ]);

  // Revenue by day for last 30 days (include delivered orders)
  const revenueByDay = await Order.aggregate([
    {
      $match: {
        $or: [
          { paymentStatus: 'paid' },
          { orderStatus: 'delivered' }
        ],
        createdAt: { $gte: thirtyDaysAgo }
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        revenue: { $sum: '$totalAmount' }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  // Order status distribution
  const orderStatusDistribution = await Order.aggregate([
    {
      $group: {
        _id: '$orderStatus',
        count: { $sum: 1 }
      }
    }
  ]);

  // Convert order status distribution to chart format
  const statusMap = {
    'pending': 'Pending',
    'confirmed': 'Confirmed',
    'processing': 'Processing',
    'shipped': 'Shipped',
    'delivered': 'Delivered',
    'cancelled': 'Cancelled'
  };

  const orderStatusLabels = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
  const orderStatusData = orderStatusLabels.map(label => {
    const statusKey = Object.keys(statusMap).find(key => statusMap[key] === label);
    const statusItem = orderStatusDistribution.find(item => item._id === statusKey);
    return statusItem ? statusItem.count : 0;
  });

  // Category performance - sales by category
  const Category = require('../models/Category');
  const categoryPerformance = await Order.aggregate([
    {
      $match: {
        $or: [
          { paymentStatus: 'paid' },
          { orderStatus: 'delivered' }
        ]
      }
    },
    { $unwind: '$items' },
    {
      $lookup: {
        from: 'products',
        localField: 'items.product',
        foreignField: '_id',
        as: 'productInfo'
      }
    },
    { $unwind: '$productInfo' },
    {
      $lookup: {
        from: 'categories',
        localField: 'productInfo.category',
        foreignField: '_id',
        as: 'categoryInfo'
      }
    },
    { $unwind: { path: '$categoryInfo', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: '$categoryInfo.name',
        sales: { $sum: { $multiply: ['$items.quantity', '$items.price'] } }
      }
    },
    { $sort: { sales: -1 } },
    { $limit: 10 }
  ]);

  const categoryLabels = categoryPerformance.map(item => item._id || 'Uncategorized');
  const categorySales = categoryPerformance.map(item => item.sales);

  // Other metrics
  const pendingOrders = await Order.countDocuments({ orderStatus: 'pending' });
  const lowStockProducts = await Product.countDocuments({ stock: { $lt: 10 } });

  res.json({
    success: true,
    stats: {
      revenue: {
        total: totalRevenue,
        trend: parseFloat(revenueTrend),
        label: 'Last 30 days'
      },
      orders: {
        total: totalOrders,
        trend: parseFloat(orderTrend),
        label: 'Last 30 days'
      },
      users: {
        total: totalUsers,
        trend: parseFloat(userTrend),
        label: 'Last 30 days'
      },
      distributors: {
        total: totalDistributors,
        approved: approvedDistributors,
        pending: pendingDistributors,
        label: 'Active distributors'
      },
      pendingOrders,
      lowStockProducts,
      pendingApprovals: pendingDistributors,
      trends: {
        revenue: parseFloat(revenueTrend),
        orders: parseFloat(orderTrend),
        users: parseFloat(userTrend),
        distributors: 0
      },
      revenueData: {
        labels: revenueByDay.map(item => item._id),
        data: revenueByDay.map(item => item.revenue)
      },
      orderStatusData: {
        labels: orderStatusLabels,
        data: orderStatusData
      },
      categoryData: {
        labels: categoryLabels,
        data: categorySales
      }
    }
  });
});

// @desc    Get revenue analytics
// @route   GET /api/admin/analytics/revenue
// @access  Private (Admin only)
exports.getRevenueAnalytics = asyncHandler(async (req, res) => {
  const { period = 'month' } = req.query;

  const now = new Date();
  let startDate, groupFormat;

  switch (period) {
    case 'week':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      groupFormat = '%Y-%m-%d';
      break;
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      groupFormat = '%Y-%m-%d';
      break;
    case 'year':
      startDate = new Date(now.getFullYear(), 0, 1);
      groupFormat = '%Y-%m';
      break;
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      groupFormat = '%Y-%m-%d';
  }

  const revenueData = await Order.aggregate([
    { $match: { paymentStatus: 'paid', createdAt: { $gte: startDate } } },
    {
      $group: {
        _id: { $dateToString: { format: groupFormat, date: '$createdAt' } },
        revenue: { $sum: '$totalAmount' },
        orders: { $sum: 1 },
        avgOrderValue: { $avg: '$totalAmount' }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  const totalRevenue = revenueData.reduce((sum, item) => sum + item.revenue, 0);
  const totalOrders = revenueData.reduce((sum, item) => sum + item.orders, 0);
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  res.json({
    success: true,
    period,
    totalRevenue,
    totalOrders,
    avgOrderValue,
    data: revenueData
  });
});

// @desc    Get user growth analytics
// @route   GET /api/admin/analytics/users
// @access  Private (Admin only)
exports.getUserGrowthAnalytics = asyncHandler(async (req, res) => {
  const { period = 'month' } = req.query;

  const now = new Date();
  let startDate, groupFormat;

  switch (period) {
    case 'week':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      groupFormat = '%Y-%m-%d';
      break;
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      groupFormat = '%Y-%m-%d';
      break;
    case 'year':
      startDate = new Date(now.getFullYear(), 0, 1);
      groupFormat = '%Y-%m';
      break;
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      groupFormat = '%Y-%m-%d';
  }

  const [userGrowth, distributorGrowth] = await Promise.all([
    User.aggregate([
      { $match: { role: 'user', createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: groupFormat, date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]),
    Distributor.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: groupFormat, date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ])
  ]);

  res.json({
    success: true,
    period,
    userGrowth,
    distributorGrowth
  });
});

// @desc    Get order analytics
// @route   GET /api/admin/analytics/orders
// @access  Private (Admin only)
exports.getOrderAnalytics = asyncHandler(async (req, res) => {
  const [
    statusDistribution,
    paymentStatusDistribution,
    topDistributors
  ] = await Promise.all([
    Order.aggregate([
      {
        $group: {
          _id: '$orderStatus',
          count: { $sum: 1 },
          totalAmount: { $sum: '$totalAmount' }
        }
      }
    ]),
    Order.aggregate([
      {
        $group: {
          _id: '$paymentStatus',
          count: { $sum: 1 },
          totalAmount: { $sum: '$totalAmount' }
        }
      }
    ]),
    Order.aggregate([
      { $match: { paymentStatus: 'paid' } },
      {
        $group: {
          _id: '$distributor',
          orders: { $sum: 1 },
          revenue: { $sum: '$totalAmount' }
        }
      },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'distributors',
          localField: '_id',
          foreignField: '_id',
          as: 'distributorInfo'
        }
      },
      { $unwind: '$distributorInfo' },
      {
        $project: {
          businessName: '$distributorInfo.businessName',
          orders: 1,
          revenue: 1
        }
      }
    ])
  ]);

  res.json({
    success: true,
    statusDistribution,
    paymentStatusDistribution,
    topDistributors
  });
});

// @desc    Get category performance analytics
// @route   GET /api/admin/analytics/categories
// @access  Private (Admin only)
exports.getCategoryPerformance = asyncHandler(async (req, res) => {
  const Category = require('../models/Category');

  const categoryPerformance = await Order.aggregate([
    { $match: { paymentStatus: 'paid' } },
    { $unwind: '$items' },
    {
      $lookup: {
        from: 'products',
        localField: 'items.product',
        foreignField: '_id',
        as: 'productInfo'
      }
    },
    { $unwind: '$productInfo' },
    {
      $lookup: {
        from: 'categories',
        localField: 'productInfo.category',
        foreignField: '_id',
        as: 'categoryInfo'
      }
    },
    { $unwind: { path: '$categoryInfo', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: '$categoryInfo._id',
        categoryName: { $first: '$categoryInfo.name' },
        orders: { $sum: 1 },
        revenue: { $sum: { $multiply: ['$items.quantity', '$items.price'] } },
        quantity: { $sum: '$items.quantity' }
      }
    },
    { $sort: { revenue: -1 } },
    { $limit: 10 }
  ]);

  res.json({
    success: true,
    categoryPerformance
  });
});

// @desc    Get user statistics
// @route   GET /api/admin/users/stats
// @access  Private (Admin only)
exports.getUserStats = asyncHandler(async (req, res) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [total, active, inactive, verified, newThisMonth] = await Promise.all([
    User.countDocuments({ role: 'user' }),
    User.countDocuments({ role: 'user', isActive: true }),
    User.countDocuments({ role: 'user', isActive: false }),
    User.countDocuments({ role: 'user', isVerified: true }),
    User.countDocuments({ role: 'user', createdAt: { $gte: startOfMonth } })
  ]);

  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const previousMonthUsers = await User.countDocuments({
    role: 'user',
    createdAt: { $gte: previousMonth, $lte: previousMonthEnd }
  });

  const trend = previousMonthUsers > 0
    ? ((newThisMonth - previousMonthUsers) / previousMonthUsers * 100).toFixed(1)
    : 100;

  res.json({
    success: true,
    stats: {
      total,
      active,
      inactive,
      verified,
      newThisMonth,
      trend: parseFloat(trend)
    }
  });
});

// @desc    Get distributor statistics
// @route   GET /api/admin/distributors/stats
// @access  Private (Admin only)
exports.getDistributorStats = asyncHandler(async (req, res) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [total, approved, pending, active] = await Promise.all([
    Distributor.countDocuments(),
    Distributor.countDocuments({ isApproved: true }),
    Distributor.countDocuments({ isApproved: false }),
    Distributor.countDocuments({ isActive: true })
  ]);

  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const previousMonthDistributors = await Distributor.countDocuments({
    createdAt: { $gte: previousMonth, $lte: previousMonthEnd }
  });

  const currentMonthDistributors = await Distributor.countDocuments({
    createdAt: { $gte: startOfMonth }
  });

  const trend = previousMonthDistributors > 0
    ? ((currentMonthDistributors - previousMonthDistributors) / previousMonthDistributors * 100).toFixed(1)
    : 100;

  res.json({
    success: true,
    stats: {
      total,
      approved,
      pending,
      active,
      trend: parseFloat(trend)
    }
  });
});

// @desc    Get product statistics
// @route   GET /api/admin/products/stats
// @access  Private (Admin only)
exports.getProductStats = asyncHandler(async (req, res) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [total, active, lowStock, outOfStock] = await Promise.all([
    Product.countDocuments(),
    Product.countDocuments({ isActive: true }),
    Product.countDocuments({ stockQuantity: { $lt: 10, $gt: 0 } }),
    Product.countDocuments({ stockQuantity: 0 })
  ]);

  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const previousMonthProducts = await Product.countDocuments({
    createdAt: { $gte: previousMonth, $lte: previousMonthEnd }
  });

  const currentMonthProducts = await Product.countDocuments({
    createdAt: { $gte: startOfMonth }
  });

  const trend = previousMonthProducts > 0
    ? ((currentMonthProducts - previousMonthProducts) / previousMonthProducts * 100).toFixed(1)
    : 100;

  res.json({
    success: true,
    stats: {
      total,
      active,
      lowStock,
      outOfStock,
      trend: parseFloat(trend)
    }
  });
});

// @desc    Get order statistics
// @route   GET /api/admin/orders/stats
// @access  Private (Admin only)
exports.getOrderStats = asyncHandler(async (req, res) => {
  const [
    total,
    pending,
    processing,
    shipped,
    delivered,
    cancelled,
    revenueResult
  ] = await Promise.all([
    Order.countDocuments(),
    Order.countDocuments({ orderStatus: 'pending' }),
    Order.countDocuments({ orderStatus: 'processing' }),
    Order.countDocuments({ orderStatus: 'shipped' }),
    Order.countDocuments({ orderStatus: 'delivered' }),
    Order.countDocuments({ orderStatus: 'cancelled' }),
    Order.aggregate([
      { $match: { paymentStatus: 'paid' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ])
  ]);

  const totalRevenue = revenueResult[0]?.total || 0;

  res.json({
    success: true,
    stats: {
      total,
      pending,
      processing,
      shipped,
      delivered,
      cancelled,
      totalRevenue
    }
  });
});

// @desc    Get coupon statistics
// @route   GET /api/admin/coupons/stats
// @access  Private (Admin only)
exports.getCouponStats = asyncHandler(async (req, res) => {
  const now = new Date();

  const [total, active, allCoupons] = await Promise.all([
    Coupon.countDocuments(),
    Coupon.countDocuments({ isActive: true, $or: [{ expiryDate: { $gte: now } }, { expiryDate: null }] }),
    Coupon.find()
  ]);

  const expired = allCoupons.filter(coupon =>
    coupon.expiryDate && new Date(coupon.expiryDate) < now
  ).length;

  const totalUsage = allCoupons.reduce((sum, coupon) => sum + (coupon.usageCount || 0), 0);

  // Approximate total discount (would need order data for exact calculation)
  const totalDiscount = 0; // TODO: Calculate from orders if needed

  res.json({
    success: true,
    stats: {
      total,
      active,
      expired,
      totalUsage,
      totalDiscount
    }
  });
});

// @desc    Global search across users, distributors, orders, products
// @route   GET /api/admin/search
// @access  Private (Admin only)
exports.globalSearch = asyncHandler(async (req, res) => {
  const { q } = req.query;

  if (!q || !q.trim()) {
    return res.json({ success: true, users: [], distributors: [], orders: [], products: [] });
  }

  const escapedQuery = q.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
  const searchRegex = new RegExp(escapedQuery, 'i');

  const [users, distributors, orders, products] = await Promise.all([
    User.find({
      role: 'user',
      $or: [
        { name: searchRegex },
        { email: searchRegex },
        { phone: searchRegex }
      ]
    })
      .select('name email phone isActive')
      .limit(5),

    Distributor.find({
      $or: [
        { businessName: searchRegex },
        { name: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
        { city: searchRegex }
      ]
    })
      .select('businessName name email phone city isApproved')
      .limit(5),

    Order.find({
      $or: [
        { orderNumber: searchRegex },
        { guestEmail: searchRegex },
        { 'shippingAddress.fullName': searchRegex },
        { 'shippingAddress.phone': searchRegex }
      ]
    })
      .select('orderNumber totalAmount orderStatus createdAt')
      .populate('user', 'name email')
      .limit(5),

    Product.find({
      $or: [
        { name: searchRegex },
        { brand: searchRegex },
        { manufacturer: searchRegex }
      ]
    })
      .select('name price category brand isActive')
      .limit(5)
  ]);

  res.json({ success: true, users, distributors, orders, products });
});

module.exports = exports;
