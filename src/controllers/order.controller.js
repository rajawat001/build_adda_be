const orderService = require('../services/order.service');
const paymentService = require('../services/payment.service');
const emailService = require('../services/email.service');
const { bulkUpdateStock } = require('../services/stock.service');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const Distributor = require('../models/Distributor');
const asyncHandler = require('../utils/asyncHandler');
const { ValidationError, NotFoundError, AuthorizationError, AuthenticationError } = require('../utils/errors');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');

// @desc    Create new order
// @route   POST /api/orders
// @access  Public (optionalAuth — guests provide email)
exports.createOrder = asyncHandler(async (req, res) => {
  const userId = req.user?._id || null;

  const { items, shippingAddress, paymentMethod, couponCode, distributor, guestEmail } = req.body;

  // Validation: must be logged in OR provide guestEmail
  if (!userId && !guestEmail) {
    throw new ValidationError('Please provide an email address or log in');
  }

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
  }

  // Batch-fetch all products in one query instead of N separate queries
  const productIds = items.map(item => item.product);
  const products = await Product.find({ _id: { $in: productIds } }).lean();
  const productMap = new Map(products.map(p => [p._id.toString(), p]));

  for (const item of items) {
    const product = productMap.get(item.product.toString());

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

  // Validate distributor exists, is active, and has a plan
  const distributorDoc = await Distributor.findById(distributor);
  if (!distributorDoc) {
    throw new NotFoundError('Distributor not found');
  }

  if (!distributorDoc.isApproved || !distributorDoc.isActive || distributorDoc.planType === 'none') {
    throw new ValidationError('This distributor is currently not available for orders');
  }

  if (distributorDoc.isWalletLocked) {
    throw new ValidationError('This distributor is temporarily unavailable. Please try another distributor.');
  }

  const shipCity = shippingAddress.city?.toLowerCase().trim();
  const distCity = distributorDoc.city?.toLowerCase().trim();

  if (!shipCity || !distCity || shipCity !== distCity) {
    throw new ValidationError(
      `Delivery not available to ${shippingAddress.city || 'your city'}. ${distributorDoc.businessName} only delivers in ${distributorDoc.city}.`
    );
  }

  // Calculate pricing
  let discount = 0;
  let coupon = null;

  if (couponCode) {
    const result = await orderService.applyCoupon(couponCode, subtotal);
    discount = result.discount;
    coupon = result.couponId;
  }

  // No tax applied
  const tax = 0;
  // Delivery charge will be set by distributor after approval
  const deliveryCharge = 0;
  const totalAmount = subtotal + deliveryCharge - discount;

  const orderData = {
    user: userId || undefined,
    guestEmail: userId ? undefined : guestEmail,
    guestPhone: userId ? undefined : shippingAddress.phone,
    isGuestOrder: !userId,
    distributor,
    items: validatedItems,
    subtotal,
    discount,
    tax,
    taxPercentage: 0,
    deliveryCharge,
    totalAmount,
    shippingAddress,
    paymentMethod,
    couponCode,
    coupon
  };

  const order = await orderService.createOrder(orderData);

  // Debug: confirm guest order fields
  if (!userId) {
    console.log(`[Guest Order] Created order ${order.orderNumber} — guestEmail: "${order.guestEmail}", isGuestOrder: ${order.isGuestOrder}, user: ${order.user}`);
  }

  // Send email notifications (non-blocking)
  const dist = distributorDoc;
  if (userId) {
    const user = await User.findById(userId);
    if (user) {
      emailService.sendOrderConfirmationEmail(
        { ...order.toObject(), userEmail: user.email },
        user.name || 'Customer'
      );
    }
  } else if (guestEmail) {
    // Send confirmation to guest email
    emailService.sendOrderConfirmationEmail(
      { ...order.toObject(), userEmail: guestEmail },
      shippingAddress.fullName || 'Customer'
    );
  }
  if (dist) {
    emailService.sendNewOrderNotification(order, dist);
  }

  // Check low stock after order (reuse already-fetched product data)
  if (dist) {
    const lowStockItems = validatedItems
      .filter(item => {
        const product = productMap.get(item.product.toString());
        return product && product.stock <= 10;
      })
      .map(item => {
        const product = productMap.get(item.product.toString());
        return { name: product.name, stock: product.stock };
      });

    if (lowStockItems.length > 0) {
      emailService.sendLowStockAlertEmail(dist, lowStockItems);
    }
  }

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Order created successfully',
    data: { order }
  });
});

// @desc    Initiate PhonePe v2 payment for online order
// @route   POST /api/orders/phonepe/initiate
// @access  Public (optionalAuth)
exports.initiatePhonepePayment = asyncHandler(async (req, res) => {
  const { orderId, guestEmail } = req.body;
  const userId = req.user?._id || null;

  if (!orderId) {
    throw new ValidationError('Order ID is required');
  }

  const order = await Order.findById(orderId);

  if (!order) {
    throw new NotFoundError('Order not found');
  }

  // SECURITY: Verify ownership — logged-in user or guest email match
  if (userId) {
    if (order.user && order.user.toString() !== userId.toString()) {
      throw new AuthorizationError('You are not authorized to access this order');
    }
  } else if (order.isGuestOrder) {
    if (!guestEmail || order.guestEmail !== guestEmail.toLowerCase()) {
      throw new AuthorizationError('You are not authorized to access this order');
    }
  } else {
    throw new AuthorizationError('You are not authorized to access this order');
  }

  // Validate payment method
  if (order.paymentMethod !== 'Online') {
    throw new ValidationError('Order payment method is not Online');
  }

  const { redirectBaseUrl } = require('../config/phonepe');
  const merchantOrderId = `ORDER_${order._id}_${Date.now()}`;
  const redirectUrl = `${redirectBaseUrl}/payment/status?merchantOrderId=${merchantOrderId}&type=order&orderId=${order._id}`;

  const phonePeResponse = await paymentService.initiatePayment({
    merchantOrderId,
    amount: order.totalAmount,
    redirectUrl
  });

  // Store merchantOrderId on order (reuse existing field)
  order.phonepeMerchantTransactionId = merchantOrderId;
  await order.save();

  // v2 response: { orderId, state, redirectUrl }
  const paymentUrl = phonePeResponse.redirectUrl;

  return sendSuccess(res, {
    data: { paymentUrl, merchantOrderId, orderId: order._id }
  });
});

// @desc    Check PhonePe v2 payment status
// @route   POST /api/orders/phonepe/status
// @access  Public (no auth — payment callback)
exports.checkPaymentStatus = asyncHandler(async (req, res) => {
  // Support both old (merchantTransactionId) and new (merchantOrderId) field names
  const merchantOrderId = req.body.merchantOrderId || req.body.merchantTransactionId;
  const { orderId } = req.body;

  if (!merchantOrderId || !orderId) {
    throw new ValidationError('merchantOrderId and orderId are required');
  }

  const order = await Order.findById(orderId);

  if (!order) {
    throw new NotFoundError('Order not found');
  }

  // If already paid (e.g. by webhook), return success immediately
  if (order.paymentStatus === 'paid') {
    return sendSuccess(res, {
      message: 'Payment already verified',
      data: { paymentStatus: 'paid', order }
    });
  }

  // Check status with PhonePe v2 API
  const statusResponse = await paymentService.checkPaymentStatus(merchantOrderId);
  const state = statusResponse.state;

  if (state === 'COMPLETED') {
    // Extract payment details from v2 response
    const paymentDetails = statusResponse.paymentDetails || [];
    const firstPayment = paymentDetails.length > 0 ? paymentDetails[0] : {};

    order.phonepeTransactionId = firstPayment.transactionId || '';
    order.phonepePaymentInstrument = firstPayment.paymentMode || '';
    order.paymentStatus = 'paid';
    order.orderStatus = 'confirmed';
    await order.save();

    // Send payment confirmation email (non-blocking)
    if (order.user) {
      const payUser = await User.findById(order.user);
      if (payUser) {
        emailService.sendPaymentConfirmationEmail(order, payUser.name || 'Customer', payUser.email);
      }
    } else if (order.guestEmail) {
      emailService.sendPaymentConfirmationEmail(order, order.shippingAddress?.fullName || 'Customer', order.guestEmail);
    }

    return sendSuccess(res, {
      message: 'Payment verified successfully',
      data: { paymentStatus: 'paid', order }
    });
  }

  if (state === 'PENDING') {
    return sendSuccess(res, {
      message: 'Payment is still pending',
      data: { paymentStatus: 'pending', order }
    });
  }

  // Payment failed — cancel order and restore stock
  order.paymentStatus = 'failed';
  order.orderStatus = 'cancelled';
  await order.save();

  // Restore stock for each item
  if (order.items && order.items.length > 0) {
    await bulkUpdateStock(order.items, 'increment');
  }

  return sendError(res, {
    message: 'Payment failed',
    code: 'PAYMENT_FAILED',
    statusCode: 200,
    details: { paymentStatus: 'failed', order }
  });
});

// @desc    Confirm Cash on Delivery order
// @route   POST /api/orders/cod/confirm
// @access  Public (optionalAuth)
exports.confirmCOD = asyncHandler(async (req, res) => {
  const { orderId, guestEmail } = req.body;
  const userId = req.user?._id || null;

  if (!orderId) {
    throw new ValidationError('Order ID is required');
  }

  const order = await Order.findById(orderId);

  if (!order) {
    throw new NotFoundError('Order not found');
  }

  // SECURITY: Verify ownership — logged-in user or guest email match
  if (userId) {
    if (order.user && order.user.toString() !== userId.toString()) {
      throw new AuthorizationError('You are not authorized to access this order');
    }
  } else if (order.isGuestOrder) {
    if (!guestEmail || order.guestEmail !== guestEmail.toLowerCase()) {
      throw new AuthorizationError('You are not authorized to access this order');
    }
  } else {
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

  return sendSuccess(res, {
    message: 'Order confirmed with Cash on Delivery',
    data: { order }
  });
});

// @desc    Get user's orders
// @route   GET /api/orders
// @access  Private
exports.getMyOrders = asyncHandler(async (req, res) => {
  // FIX: Use _id consistently
  const userId = req.user._id;
  const { page = 1, limit = 20, status } = req.query;

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

  return sendPaginated(res, {
    data: { orders },
    page: options.page,
    limit: options.limit,
    total
  });
});

// @desc    Get single order by ID
// @route   GET /api/orders/:orderId
// @access  Private
exports.getOrderById = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const userId = req.user._id;

  const order = await Order.findById(orderId)
    .populate('distributor', 'businessName phone email slug')
    .populate('items.product', 'name image price');

  if (!order) {
    throw new NotFoundError('Order not found');
  }

  // SECURITY: Verify ownership (user or admin)
  if (order.user.toString() !== userId.toString() && req.userRole !== 'admin') {
    throw new AuthorizationError('You are not authorized to access this order');
  }

  return sendSuccess(res, { data: { order } });
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

  // Reverse commission if the order was delivered (commission plan distributors)
  if (order.orderStatus === 'delivered') {
    const cancelDistributor = await Distributor.findById(order.distributor);
    if (cancelDistributor && cancelDistributor.planType === 'commission') {
      try {
        const { reverseCommission } = require('../modules/commission/services/commission.service');
        await reverseCommission(order._id);
      } catch (commErr) {
        console.error('Error reversing commission:', commErr.message);
      }
    }
  }

  // Use the model method to cancel
  await order.cancel(reason || 'Cancelled by user', userId, 'User');

  // Auto-refund if order was paid online via PhonePe
  let refundInitiated = false;
  if (order.paymentMethod === 'Online' && order.paymentStatus === 'paid' && order.phonepeMerchantTransactionId) {
    try {
      const refundId = `REFUND_${order._id}_${Date.now()}`;
      await paymentService.createRefund({
        merchantOrderId: order.phonepeMerchantTransactionId,
        merchantRefundId: refundId,
        amount: order.totalAmount
      });
      order.refundAmount = order.totalAmount;
      order.refundStatus = 'pending';
      order.refundedAt = new Date();
      await order.save();
      refundInitiated = true;
    } catch (refundError) {
      console.error('Auto-refund failed for order', order._id, refundError.message);
      // Cancellation still proceeds — admin can process refund manually
    }
  }

  // Send cancellation emails (non-blocking)
  const cancelUser = await User.findById(userId);
  if (cancelUser) {
    emailService.sendOrderStatusEmail(order, cancelUser.name || 'Customer', cancelUser.email, 'cancelled');
  }
  const cancelDist = await Distributor.findById(order.distributor);
  if (cancelDist) {
    emailService.sendOrderCancelledToDistributor(order, cancelDist);
  }

  return sendSuccess(res, {
    message: refundInitiated
      ? 'Order cancelled and refund initiated successfully'
      : 'Order cancelled successfully',
    data: { order, refundInitiated }
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

  return sendSuccess(res, {
    data: {
      discount: result.discount,
      finalAmount: totalAmount - result.discount,
      coupon: result.coupon
    }
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

  return sendPaginated(res, {
    data: { orders },
    page: options.page,
    limit: options.limit,
    total
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

  // Charge commission when order is delivered (commission plan distributors only)
  if (status === 'delivered') {
    const distributor = await Distributor.findById(order.distributor);
    if (distributor && distributor.planType === 'commission') {
      try {
        const { chargeCommission } = require('../modules/commission/services/commission.service');
        await chargeCommission(order._id);
      } catch (commErr) {
        console.error('Error charging commission:', commErr.message);
      }
    }
  }

  // Send status update email to user (non-blocking)
  const statusUser = await User.findById(order.user);
  if (statusUser) {
    emailService.sendOrderStatusEmail(order, statusUser.name || 'Customer', statusUser.email, status);
  }

  return sendSuccess(res, {
    message: 'Order status updated successfully',
    data: { order }
  });
});

// @desc    Get guest order by ID + email
// @route   GET /api/orders/guest/:orderId?email=...
// @access  Public
exports.getGuestOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { email } = req.query;

  if (!email) {
    throw new ValidationError('Email is required to look up guest orders');
  }

  const order = await Order.findOne({
    _id: orderId,
    guestEmail: email.toLowerCase(),
    isGuestOrder: true
  })
    .populate('distributor', 'businessName phone email slug')
    .populate('items.product', 'name image price');

  if (!order) {
    throw new NotFoundError('Order not found');
  }

  return sendSuccess(res, { data: { order } });
});

module.exports = exports;
