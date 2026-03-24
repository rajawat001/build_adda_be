const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Distributor = require('../models/Distributor');
const OfflineCustomer = require('../models/OfflineCustomer');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendPaginated } = require('../utils/response');
const { ValidationError, NotFoundError, AuthorizationError } = require('../utils/errors');

// @desc    Create manual order (offline billing)
// @route   POST /api/distributor/manual-orders
// @access  Private (Distributor)
exports.createManualOrder = asyncHandler(async (req, res) => {
  const distributorId = req.user._id;
  const { offlineCustomerId, items, shippingAddress, paymentMethod, deliveryCharge, notes } = req.body;

  // 1. Validate distributor is active and eligible
  const distributor = await Distributor.findById(distributorId).select('isApproved isActive planType isWalletLocked').lean();
  if (!distributor || !distributor.isApproved || !distributor.isActive) {
    throw new AuthorizationError('Your account is not active. Cannot create orders.');
  }
  if (distributor.planType === 'none') {
    throw new AuthorizationError('You need an active plan to create orders.');
  }
  if (distributor.isWalletLocked) {
    throw new AuthorizationError('Your wallet is locked. Please contact support.');
  }

  // 2. Validate customer
  if (!offlineCustomerId) throw new ValidationError('Customer is required');
  const customer = await OfflineCustomer.findOne({
    _id: offlineCustomerId,
    distributors: distributorId
  });
  if (!customer) throw new NotFoundError('Customer not found or not linked to your account');

  // 3. Validate items
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new ValidationError('At least one item is required');
  }
  if (items.length > 50) {
    throw new ValidationError('Maximum 50 items per order');
  }

  // 4. Verify products belong to this distributor
  const productIds = items.map(item => item.product);
  const products = await Product.find({
    _id: { $in: productIds },
    distributor: distributorId
  }).lean();

  if (products.length !== productIds.length) {
    throw new ValidationError('One or more products are invalid or do not belong to your store');
  }

  const productMap = {};
  products.forEach(p => { productMap[p._id.toString()] = p; });

  // 5. Build order items with strict validation
  let subtotal = 0;
  const orderItems = [];

  for (const item of items) {
    const product = productMap[item.product];
    if (!product) throw new ValidationError(`Product ${item.product} not found`);

    const quantity = parseInt(item.quantity);
    if (!quantity || quantity < 1) throw new ValidationError(`Invalid quantity for ${product.name}`);
    if (quantity > 10000) throw new ValidationError(`Quantity too large for ${product.name}`);

    const price = item.price !== undefined && item.price !== null ? parseFloat(item.price) : product.price;
    if (isNaN(price) || price < 0) throw new ValidationError(`Invalid price for ${product.name}`);

    if (product.stock < quantity) {
      throw new ValidationError(`Insufficient stock for ${product.name}. Available: ${product.stock}`);
    }

    subtotal += Math.round(price * quantity * 100) / 100; // Prevent floating point issues
    orderItems.push({
      product: product._id,
      distributor: distributorId,
      quantity,
      price,
      name: product.name,
      image: product.image || ''
    });
  }

  const charge = Math.max(0, parseFloat(deliveryCharge) || 0);
  if (charge > 100000) throw new ValidationError('Delivery charge too high');
  const totalAmount = Math.round((subtotal + charge) * 100) / 100;

  // 6. Build shipping address
  const address = shippingAddress && shippingAddress.fullName ? shippingAddress : {
    fullName: customer.name,
    phone: customer.phone,
    address: customer.address || '-',
    city: customer.city || '-',
    state: customer.state || '-',
    pincode: customer.pincode || '000000'
  };
  if (!address.fullName) address.fullName = customer.name;
  if (!address.phone) address.phone = customer.phone;
  if (!address.address) address.address = '-';
  if (!address.city) address.city = '-';
  if (!address.state) address.state = '-';
  if (!address.pincode) address.pincode = '000000';

  // 7. Decrement stock FIRST (atomic — prevents overselling)
  const bulkOps = orderItems.map(item => ({
    updateOne: {
      filter: { _id: item.product, stock: { $gte: item.quantity } }, // Atomic stock check
      update: { $inc: { stock: -item.quantity } }
    }
  }));
  const stockResult = await Product.bulkWrite(bulkOps);

  // Verify all items had sufficient stock (atomic check)
  if (stockResult.modifiedCount !== orderItems.length) {
    // Rollback: restore stock for items that were decremented
    const rollbackOps = orderItems.map(item => ({
      updateOne: {
        filter: { _id: item.product },
        update: { $inc: { stock: item.quantity } }
      }
    }));
    await Product.bulkWrite(rollbackOps);
    throw new ValidationError('One or more products ran out of stock. Please try again.');
  }

  // 8. Create order (stock already decremented)
  let order;
  try {
    const pm = paymentMethod === 'COD' ? 'COD' : 'Offline';
    order = await Order.create({
      isManualOrder: true,
      offlineCustomer: customer._id,
      user: customer.linkedUser || undefined,
      distributor: distributorId,
      items: orderItems,
      subtotal,
      deliveryCharge: charge,
      totalAmount,
      shippingAddress: address,
      paymentMethod: pm,
      paymentStatus: pm === 'COD' ? 'pending' : 'paid',
      orderStatus: 'confirmed',
      approvalStatus: 'approved',
      approvedAt: new Date(),
      approvedBy: distributorId,
      deliveryNotes: (notes || '').substring(0, 500),
      statusHistory: [{
        status: 'Order Created (Manual)',
        timestamp: new Date(),
        note: 'Manual order created by distributor',
        updatedBy: distributorId,
        updatedByModel: 'Distributor'
      }]
    });
  } catch (err) {
    // Rollback stock if order creation fails
    const rollbackOps = orderItems.map(item => ({
      updateOne: {
        filter: { _id: item.product },
        update: { $inc: { stock: item.quantity } }
      }
    }));
    await Product.bulkWrite(rollbackOps);
    throw err;
  }

  // 9. Populate for response
  await order.populate([
    { path: 'offlineCustomer', select: 'name phone email' },
    { path: 'items.product', select: 'name price image' }
  ]);

  return sendSuccess(res, {
    data: { order },
    message: 'Manual order created successfully',
    statusCode: 201
  });
});

// @desc    Get distributor's manual orders
// @route   GET /api/distributor/manual-orders
// @access  Private (Distributor)
exports.getManualOrders = asyncHandler(async (req, res) => {
  const distributorId = req.user._id;
  const { page = 1, limit = 20, orderStatus, search } = req.query;

  const filter = { distributor: distributorId, isManualOrder: true };

  if (orderStatus) filter.orderStatus = orderStatus;

  // Search by customer name/phone/email or order number
  if (search && search.trim()) {
    const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = { $regex: escaped, $options: 'i' };

    // Find matching offline customers first
    const matchingCustomers = await OfflineCustomer.find({
      $or: [{ name: regex }, { phone: regex }, { email: regex }]
    }).select('_id').lean();

    const customerIds = matchingCustomers.map(c => c._id);

    filter.$or = [
      { orderNumber: regex },
      ...(customerIds.length > 0 ? [{ offlineCustomer: { $in: customerIds } }] : [])
    ];

    // If no $or conditions matched, ensure we still filter (empty result)
    if (filter.$or.length === 0) {
      filter.$or = [{ orderNumber: regex }];
    }
  }

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
  const skip = (pageNum - 1) * limitNum;

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate('offlineCustomer', 'name phone email')
      .populate('items.product', 'name price image')
      .sort('-createdAt')
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Order.countDocuments(filter)
  ]);

  return sendPaginated(res, {
    data: { orders },
    page: pageNum,
    limit: limitNum,
    total
  });
});

// @desc    Get manual order by ID
// @route   GET /api/distributor/manual-orders/:orderId
// @access  Private (Distributor)
exports.getManualOrderById = asyncHandler(async (req, res) => {
  const distributorId = req.user._id;
  const { orderId } = req.params;

  const order = await Order.findOne({
    _id: orderId,
    distributor: distributorId,
    isManualOrder: true
  })
    .populate('offlineCustomer', 'name phone email address city state pincode')
    .populate('items.product', 'name price image unit');

  if (!order) throw new NotFoundError('Manual order not found');

  return sendSuccess(res, { data: { order } });
});

// @desc    Get manual order stats
// @route   GET /api/distributor/manual-orders/stats
// @access  Private (Distributor)
exports.getManualOrderStats = asyncHandler(async (req, res) => {
  const distributorId = req.user._id;
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const baseMatch = { distributor: new mongoose.Types.ObjectId(distributorId) };

  const [
    totalManualOrders,
    offlineRevenue,
    thisMonthRevenue,
    lastMonthRevenue,
    onlineRevenue,
    customerCount
  ] = await Promise.all([
    Order.countDocuments({ ...baseMatch, isManualOrder: true }),
    Order.aggregate([
      { $match: { ...baseMatch, isManualOrder: true, orderStatus: { $ne: 'cancelled' } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]),
    Order.aggregate([
      { $match: { ...baseMatch, isManualOrder: true, createdAt: { $gte: startOfMonth }, orderStatus: { $ne: 'cancelled' } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]),
    Order.aggregate([
      { $match: { ...baseMatch, isManualOrder: true, createdAt: { $gte: startOfLastMonth, $lt: startOfMonth }, orderStatus: { $ne: 'cancelled' } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]),
    Order.aggregate([
      { $match: { ...baseMatch, isManualOrder: { $ne: true }, orderStatus: 'delivered' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]),
    OfflineCustomer.countDocuments({ distributors: distributorId })
  ]);

  const offlineTotal = offlineRevenue[0]?.total || 0;
  const onlineTotal = onlineRevenue[0]?.total || 0;
  const thisMonth = thisMonthRevenue[0]?.total || 0;
  const lastMonth = lastMonthRevenue[0]?.total || 0;

  return sendSuccess(res, {
    data: {
      totalManualOrders,
      offlineRevenue: offlineTotal,
      onlineRevenue: onlineTotal,
      totalRevenue: offlineTotal + onlineTotal,
      thisMonthOffline: thisMonth,
      lastMonthOffline: lastMonth,
      customerCount
    }
  });
});
