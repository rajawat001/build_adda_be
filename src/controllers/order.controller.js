const orderService = require('../services/order.service');
const paymentService = require('../services/payment.service');
const Order = require('../models/Order');
const Product = require('../models/Product');
const asyncHandler = require('../utils/asyncHandler');
const { ValidationError, NotFoundError, AuthorizationError, AuthenticationError } = require('../utils/errors');

// @desc    Create new order
// @route   POST /api/orders
// @access  Private
exports.createOrder = asyncHandler(async (req, res) => {
  // FIX: Use _id consistently
  const userId = req.user._id;

  console.log('=== CREATE ORDER DEBUG ===');
  console.log('Request body:', JSON.stringify(req.body, null, 2));
  console.log('Payment method:', req.body.paymentMethod);
  console.log('Distributor:', req.body.distributor);
  console.log('=========================');

  const { items, shippingAddress, paymentMethod, couponCode, distributor } = req.body;

  // Validate required fields
  if (!items || items.length === 0) {
    throw new ValidationError('Order must contain at least one item');
  }

  if (!shippingAddress) {
    throw new ValidationError('Shipping address is required');
  }

  if (!paymentMethod) {
    throw new ValidationError('Payment method is required');
  }

  if (!distributor) {
    throw new ValidationError('Distributor is required');
  }

  // Validate items structure
  const validatedItems = [];
  let subtotal = 0;

  for (const item of items) {
    if (!item.product || !item.quantity) {
      throw new ValidationError('Each item must have product and quantity');
    }

    // Fetch product to validate price and stock
    const product = await Product.findById(item.product);

    if (!product) {
      throw new NotFoundError(`Product ${item.product} not found`);
    }

    if (!product.isActive) {
      throw new ValidationError(`Product ${product.name} is not available`);
    }

    if (product.stock < item.quantity) {
      throw new ValidationError(`Insufficient stock for ${product.name}. Available: ${product.stock}`);
    }

    validatedItems.push({
      product: product._id,
      distributor: product.distributor,
      quantity: item.quantity,
      price: product.price,  // Use current price from DB
      name: product.name,
      image: product.image
    });

    subtotal += product.price * item.quantity;
  }

  // Calculate pricing
  let discount = 0;
  let coupon = null;

  if (couponCode) {
    const result = await orderService.applyCoupon(couponCode, subtotal);
    discount = result.discount;
    coupon = result.couponId;
  }

  const tax = subtotal * 0.18; // 18% GST
  const deliveryCharge = subtotal > 1000 ? 0 : 50; // Free delivery above ₹1000
  const totalAmount = subtotal + tax + deliveryCharge - discount;

  const orderData = {
    user: userId,
    distributor,
    items: validatedItems,
    subtotal,
    discount,
    tax,
    taxPercentage: 18,
    deliveryCharge,
    totalAmount,
    shippingAddress,
    paymentMethod,
    couponCode,
    coupon
  };

  const order = await orderService.createOrder(orderData);

  res.status(201).json({
    success: true,
    message: 'Order created successfully',
    order
  });
});

// @desc    Create Razorpay order for online payment
// @route   POST /api/orders/razorpay
// @access  Private
exports.createRazorpayOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.body;
  const userId = req.user._id;

  if (!orderId) {
    throw new ValidationError('Order ID is required');
  }

  const order = await Order.findById(orderId);

  if (!order) {
    throw new NotFoundError('Order not found');
  }

  // SECURITY: Verify user owns this order
  if (order.user.toString() !== userId.toString()) {
    throw new AuthorizationError('You are not authorized to access this order');
  }

  // Validate payment method
  if (order.paymentMethod !== 'Online') {
    throw new ValidationError('Order payment method is not Online');
  }

  const razorpayOrder = await paymentService.createRazorpayOrder(
    order._id.toString(),
    order.totalAmount
  );

  // Update order with Razorpay order ID
  order.razorpayOrderId = razorpayOrder.id;
  await order.save();

  res.json({
    success: true,
    razorpayOrder,
    order: {
      _id: order._id,
      totalAmount: order.totalAmount,
      razorpayOrderId: razorpayOrder.id
    }
  });
});

// @desc    Verify Razorpay payment
// @route   POST /api/orders/razorpay/verify
// @access  Private
exports.verifyPayment = asyncHandler(async (req, res) => {
  const {
    orderId,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature
  } = req.body;
  const userId = req.user._id;

  if (!orderId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    throw new ValidationError('All payment verification fields are required');
  }

  const order = await Order.findById(orderId);

  if (!order) {
    throw new NotFoundError('Order not found');
  }

  // SECURITY: Verify ownership
  if (order.user.toString() !== userId.toString()) {
    throw new AuthorizationError('You are not authorized to access this order');
  }

  // Verify signature
  const isValid = paymentService.verifyRazorpaySignature(
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature
  );

  if (!isValid) {
    // Mark payment as failed
    order.paymentStatus = 'failed';
    await order.save();

    throw new ValidationError('Payment verification failed. Please try again.');
  }

  // Update order with payment details
  order.razorpayPaymentId = razorpayPaymentId;
  order.razorpaySignature = razorpaySignature;
  order.paymentStatus = 'paid';
  order.orderStatus = 'confirmed';
  await order.save();

  res.json({
    success: true,
    message: 'Payment verified successfully',
    order
  });
});

// @desc    Confirm Cash on Delivery order
// @route   POST /api/orders/cod/confirm
// @access  Private
exports.confirmCOD = asyncHandler(async (req, res) => {
  const { orderId } = req.body;
  const userId = req.user._id;

  if (!orderId) {
    throw new ValidationError('Order ID is required');
  }

  const order = await Order.findById(orderId);

  if (!order) {
    throw new NotFoundError('Order not found');
  }

  // CRITICAL FIX: Verify user owns this order (was missing!)
  if (order.user.toString() !== userId.toString()) {
    throw new AuthorizationError('You are not authorized to access this order');
  }

  // Validate payment method
  if (order.paymentMethod !== 'COD') {
    throw new ValidationError('Order payment method is not Cash on Delivery');
  }

  // Update order status
  order.paymentStatus = 'pending';
  order.orderStatus = 'confirmed';
  await order.save();

  res.json({
    success: true,
    message: 'Order confirmed with Cash on Delivery',
    order
  });
});

// @desc    Get user's orders
// @route   GET /api/orders
// @access  Private
exports.getMyOrders = asyncHandler(async (req, res) => {
  // FIX: Use _id consistently
  const userId = req.user._id;
  const { page = 1, limit = 10, status } = req.query;

  const filters = { user: userId };
  if (status) {
    filters.orderStatus = status;
  }

  const options = {
    page: parseInt(page),
    limit: Math.min(parseInt(limit), 100), // Max 100 items
    sort: { createdAt: -1 },
    populate: [
      { path: 'distributor', select: 'businessName phone' },
      { path: 'items.product', select: 'name image price' }
    ]
  };

  const orders = await Order.find(filters)
    .populate(options.populate)
    .sort(options.sort)
    .limit(options.limit)
    .skip((options.page - 1) * options.limit);

  const total = await Order.countDocuments(filters);

  res.json({
    success: true,
    orders,
    pagination: {
      page: options.page,
      limit: options.limit,
      total,
      pages: Math.ceil(total / options.limit)
    }
  });
});

// @desc    Get single order by ID
// @route   GET /api/orders/:orderId
// @access  Private
exports.getOrderById = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const userId = req.user._id;

  const order = await Order.findById(orderId)
    .populate('distributor', 'businessName phone email')
    .populate('items.product', 'name image price');

  if (!order) {
    throw new NotFoundError('Order not found');
  }

  // SECURITY: Verify ownership (user or admin)
  if (order.user.toString() !== userId.toString() && req.userRole !== 'admin') {
    throw new AuthorizationError('You are not authorized to access this order');
  }

  res.json({
    success: true,
    order
  });
});

// @desc    Cancel order
// @route   PUT /api/orders/:orderId/cancel
// @access  Private
exports.cancelOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { reason } = req.body;
  const userId = req.user._id;

  const order = await Order.findById(orderId);

  if (!order) {
    throw new NotFoundError('Order not found');
  }

  // SECURITY: Verify ownership
  if (order.user.toString() !== userId.toString()) {
    throw new AuthorizationError('You are not authorized to cancel this order');
  }

  // Use the model method to cancel
  await order.cancel(reason || 'Cancelled by user', userId, 'User');

  res.json({
    success: true,
    message: 'Order cancelled successfully',
    order
  });
});

// @desc    Apply coupon
// @route   POST /api/orders/coupon/apply
// @access  Private
exports.applyCoupon = asyncHandler(async (req, res) => {
  const { couponCode, totalAmount } = req.body;

  if (!couponCode) {
    throw new ValidationError('Coupon code is required');
  }

  if (!totalAmount || totalAmount <= 0) {
    throw new ValidationError('Valid total amount is required');
  }

  const result = await orderService.applyCoupon(couponCode, totalAmount);

  res.json({
    success: true,
    discount: result.discount,
    finalAmount: totalAmount - result.discount,
    coupon: result.coupon
  });
});

// @desc    Get distributor's orders
// @route   GET /api/orders/distributor
// @access  Private (Distributor only)
exports.getDistributorOrders = asyncHandler(async (req, res) => {
  const distributorId = req.user._id;
  const { page = 1, limit = 20, status } = req.query;

  // Filter by distributor field in order
  const filters = { distributor: distributorId };
  if (status) {
    filters.orderStatus = status;
  }

  const options = {
    page: parseInt(page),
    limit: Math.min(parseInt(limit), 100),
    sort: { createdAt: -1 },
    populate: [
      { path: 'user', select: 'name email phone' },
      { path: 'items.product', select: 'name image price' }
    ]
  };

  const orders = await Order.find(filters)
    .populate(options.populate)
    .sort(options.sort)
    .limit(options.limit)
    .skip((options.page - 1) * options.limit);

  const total = await Order.countDocuments(filters);

  res.json({
    success: true,
    orders,
    pagination: {
      page: options.page,
      limit: options.limit,
      total,
      pages: Math.ceil(total / options.limit)
    }
  });
});

// @desc    Update order status (Distributor)
// @route   PUT /api/orders/:orderId/status
// @access  Private (Distributor only)
exports.updateOrderStatus = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { status, note } = req.body;
  const distributorId = req.user._id;

  if (!status) {
    throw new ValidationError('Status is required');
  }

  const order = await Order.findById(orderId);

  if (!order) {
    throw new NotFoundError('Order not found');
  }

  // SECURITY: Verify distributor owns this order
  if (order.distributor.toString() !== distributorId.toString()) {
    throw new AuthorizationError('You are not authorized to update this order');
  }

  // Use model method for status update with validation
  await order.updateStatus(status, note, distributorId, 'Distributor');

  res.json({
    success: true,
    message: 'Order status updated successfully',
    order
  });
});

module.exports = exports;
