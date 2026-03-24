const OfflineCustomer = require('../models/OfflineCustomer');
const Order = require('../models/Order');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendPaginated } = require('../utils/response');
const { ValidationError, NotFoundError } = require('../utils/errors');

// @desc    Search offline customers (autocomplete)
// @route   GET /api/distributor/customers/search
// @access  Private (Distributor)
exports.searchCustomers = asyncHandler(async (req, res) => {
  const distributorId = req.user._id;
  const { q = '', limit = 10 } = req.query;

  if (!q.trim()) {
    // No query — return distributor's recent customers
    const customers = await OfflineCustomer.find({ distributors: distributorId })
      .sort('-updatedAt')
      .limit(parseInt(limit))
      .lean();
    return sendSuccess(res, { data: { customers } });
  }

  const escaped = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = { $regex: escaped, $options: 'i' };

  // Search all customers matching query
  const customers = await OfflineCustomer.aggregate([
    {
      $match: {
        $or: [
          { name: regex },
          { phone: regex },
          { email: regex }
        ]
      }
    },
    {
      // Prioritize distributor's own customers
      $addFields: {
        isMyCustomer: { $in: [distributorId, '$distributors'] }
      }
    },
    { $sort: { isMyCustomer: -1, updatedAt: -1 } },
    { $limit: parseInt(limit) },
    { $project: { isMyCustomer: 0 } }
  ]);

  return sendSuccess(res, { data: { customers } });
});

// @desc    Create offline customer
// @route   POST /api/distributor/customers
// @access  Private (Distributor)
exports.createCustomer = asyncHandler(async (req, res) => {
  const distributorId = req.user._id;
  const { name, email, phone, address, city, state, pincode, notes } = req.body;

  if (!name || !name.trim()) throw new ValidationError('Customer name is required');
  if (!phone || !phone.trim()) throw new ValidationError('Phone number is required');
  if (!email || !email.trim()) throw new ValidationError('Email is required');

  // Check if customer with same phone OR email already exists globally
  const globalExisting = await OfflineCustomer.findOne({
    $or: [
      { phone: phone.trim() },
      { email: email.trim().toLowerCase() }
    ]
  });

  if (globalExisting) {
    // Atomic: add distributor only if not already present (prevents race condition)
    const result = await OfflineCustomer.findByIdAndUpdate(
      globalExisting._id,
      { $addToSet: { distributors: distributorId } },
      { new: true }
    );
    const wasAlreadyLinked = globalExisting.distributors.some(
      d => d.toString() === distributorId.toString()
    );
    return sendSuccess(res, {
      data: { customer: result },
      message: wasAlreadyLinked ? 'Customer already exists' : 'Customer linked to your account'
    });
  }

  // Create new customer
  const customer = await OfflineCustomer.create({
    name: name.trim(),
    email: email.trim(),
    phone: phone.trim(),
    address: address?.trim() || '',
    city: city?.trim() || '',
    state: state?.trim() || '',
    pincode: pincode?.trim() || '',
    notes: notes?.trim() || '',
    distributors: [distributorId],
    createdBy: distributorId
  });

  return sendSuccess(res, {
    data: { customer },
    message: 'Customer created successfully',
    statusCode: 201
  });
});

// @desc    Get distributor's own customers
// @route   GET /api/distributor/customers
// @access  Private (Distributor)
exports.getMyCustomers = asyncHandler(async (req, res) => {
  const distributorId = req.user._id;
  const { search, page = 1, limit = 20 } = req.query;

  const filter = { distributors: distributorId };

  if (search && search.trim()) {
    const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = { $regex: escaped, $options: 'i' };
    filter.$or = [{ name: regex }, { phone: regex }, { email: regex }];
  }

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
  const skip = (pageNum - 1) * limitNum;

  const [customers, total] = await Promise.all([
    OfflineCustomer.find(filter)
      .sort('-updatedAt')
      .skip(skip)
      .limit(limitNum)
      .lean(),
    OfflineCustomer.countDocuments(filter)
  ]);

  return sendPaginated(res, {
    data: { customers },
    page: pageNum,
    limit: limitNum,
    total
  });
});

// @desc    Get customer by ID with distributor-wise order history
// @route   GET /api/distributor/customers/:customerId OR GET /api/admin/offline-customers/:customerId
// @access  Private (Distributor / Admin)
exports.getCustomerById = asyncHandler(async (req, res) => {
  const { customerId } = req.params;

  const customer = await OfflineCustomer.findById(customerId)
    .populate('distributors', 'businessName city phone email slug')
    .populate('linkedUser', 'name email phone');

  if (!customer) throw new NotFoundError('Customer not found');

  // Get ALL orders for this customer
  const allOrders = await Order.find({ offlineCustomer: customerId })
    .populate('distributor', 'businessName city slug')
    .populate('items.product', 'name price image')
    .sort('-createdAt')
    .lean();

  // Group orders by distributor
  const distributorOrderMap = {};
  let lifetimePurchase = 0;

  allOrders.forEach(order => {
    const distId = order.distributor?._id?.toString() || 'unknown';
    if (!distributorOrderMap[distId]) {
      distributorOrderMap[distId] = {
        distributor: order.distributor || { businessName: 'Unknown' },
        orders: [],
        totalPurchase: 0,
        orderCount: 0
      };
    }
    distributorOrderMap[distId].orders.push({
      _id: order._id,
      orderNumber: order.orderNumber,
      totalAmount: order.totalAmount,
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      items: order.items,
      createdAt: order.createdAt
    });
    if (order.orderStatus !== 'cancelled') {
      distributorOrderMap[distId].totalPurchase += order.totalAmount;
      lifetimePurchase += order.totalAmount;
    }
    distributorOrderMap[distId].orderCount++;
  });

  const distributorWiseOrders = Object.values(distributorOrderMap);

  return sendSuccess(res, {
    data: {
      customer,
      lifetimePurchase,
      totalOrders: allOrders.length,
      distributorWiseOrders
    }
  });
});

// @desc    Update customer
// @route   PUT /api/distributor/customers/:customerId
// @access  Private (Distributor)
exports.updateCustomer = asyncHandler(async (req, res) => {
  const distributorId = req.user._id;
  const { customerId } = req.params;
  const { name, email, phone, address, city, state, pincode, notes } = req.body;

  const customer = await OfflineCustomer.findOne({
    _id: customerId,
    distributors: distributorId
  });

  if (!customer) throw new NotFoundError('Customer not found or not linked to your account');

  if (name !== undefined) customer.name = name.trim();
  if (email !== undefined) customer.email = email.trim() || undefined;
  if (phone !== undefined) customer.phone = phone.trim();
  if (address !== undefined) customer.address = address.trim();
  if (city !== undefined) customer.city = city.trim();
  if (state !== undefined) customer.state = state.trim();
  if (pincode !== undefined) customer.pincode = pincode.trim();
  if (notes !== undefined) customer.notes = notes.trim();

  await customer.save();

  return sendSuccess(res, {
    data: { customer },
    message: 'Customer updated successfully'
  });
});

// @desc    Get all offline customers (Admin)
// @route   GET /api/admin/offline-customers
// @access  Private (Admin)
exports.getAllCustomers = asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 20 } = req.query;

  const filter = {};

  if (search && search.trim()) {
    const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = { $regex: escaped, $options: 'i' };
    filter.$or = [{ name: regex }, { phone: regex }, { email: regex }, { city: regex }];
  }

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
  const skip = (pageNum - 1) * limitNum;

  const [customers, total] = await Promise.all([
    OfflineCustomer.find(filter)
      .populate('distributors', 'businessName city')
      .populate('linkedUser', 'name email')
      .sort('-createdAt')
      .skip(skip)
      .limit(limitNum)
      .lean(),
    OfflineCustomer.countDocuments(filter)
  ]);

  return sendPaginated(res, {
    data: { customers },
    page: pageNum,
    limit: limitNum,
    total
  });
});
