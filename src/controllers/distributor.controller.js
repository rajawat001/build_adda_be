const Product = require('../models/Product');
const Order = require('../models/Order');
const Distributor = require('../models/Distributor');
const { uploadToCloudinary } = require('../config/cloudinary');
const asyncHandler = require('../utils/asyncHandler');
const { ValidationError, NotFoundError, AuthorizationError } = require('../utils/errors');

// @desc    Get distributor's products with pagination
// @route   GET /api/distributor/products
// @access  Private (Distributor only)
exports.getDistributorProducts = asyncHandler(async (req, res) => {
  // FIX: Use _id consistently
  const distributorId = req.user._id;
  const { page = 1, limit = 20, category, isActive } = req.query;

  // Validate and limit pagination
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

  const filter = { distributor: distributorId };

  // Filter by category
  if (category) {
    filter.category = category;
  }

  // Filter by active status
  if (isActive !== undefined) {
    filter.isActive = isActive === 'true';
  }

  const products = await Product.find(filter)
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

// @desc    Add new product with image upload
// @route   POST /api/distributor/products
// @access  Private (Distributor only)
exports.addProduct = asyncHandler(async (req, res) => {
  // FIX: Use _id consistently
  const distributorId = req.user._id;
  const { name, description, price, category, stock, unit, minQuantity, maxQuantity, acceptedPaymentMethods } = req.body;

  // Validate required fields
  if (!name || !name.trim()) {
    throw new ValidationError('Product name is required');
  }

  if (!description || !description.trim()) {
    throw new ValidationError('Product description is required');
  }

  if (!price || price <= 0) {
    throw new ValidationError('Product price must be greater than 0');
  }

  if (!category) {
    throw new ValidationError('Product category is required');
  }

  const validCategories = ['Cement', 'Steel', 'Bricks', 'Sand', 'Paint', 'Tiles', 'Other'];
  if (!validCategories.includes(category)) {
    throw new ValidationError(`Category must be one of: ${validCategories.join(', ')}`);
  }

  if (stock === undefined || stock < 0) {
    throw new ValidationError('Stock must be 0 or greater');
  }

  // Validate min/max quantity
  if (minQuantity !== undefined && minQuantity < 1) {
    throw new ValidationError('Minimum quantity must be at least 1');
  }

  if (maxQuantity !== undefined && maxQuantity !== null && minQuantity !== undefined && maxQuantity < minQuantity) {
    throw new ValidationError('Maximum quantity must be greater than or equal to minimum quantity');
  }

  // Validate payment methods
  let parsedPaymentMethods = acceptedPaymentMethods;
  if (acceptedPaymentMethods) {
    // Parse if it's a JSON string (from FormData)
    if (typeof acceptedPaymentMethods === 'string') {
      try {
        parsedPaymentMethods = JSON.parse(acceptedPaymentMethods);
      } catch (e) {
        throw new ValidationError('Invalid payment methods format');
      }
    }

    if (!Array.isArray(parsedPaymentMethods) || parsedPaymentMethods.length === 0) {
      throw new ValidationError('At least one payment method must be selected');
    }
    const validPaymentMethods = ['COD', 'Online'];
    const invalidMethods = parsedPaymentMethods.filter(method => !validPaymentMethods.includes(method));
    if (invalidMethods.length > 0) {
      throw new ValidationError(`Invalid payment methods: ${invalidMethods.join(', ')}`);
    }
  }

  let imageUrl = '';

  // Upload image to Cloudinary if provided
  if (req.file) {
    try {
      const result = await uploadToCloudinary(req.file.buffer);
      imageUrl = result.secure_url;
    } catch (error) {
      throw new ValidationError('Image upload failed. Please try again.');
    }
  }

  // Create product with field whitelisting
  const product = await Product.create({
    name: name.trim(),
    description: description.trim(),
    price: parseFloat(price),
    category,
    stock: parseInt(stock),
    unit: unit || 'unit',
    image: imageUrl,
    distributor: distributorId,
    minQuantity: minQuantity !== undefined ? parseInt(minQuantity) : 1,
    maxQuantity: maxQuantity !== undefined && maxQuantity !== null ? parseInt(maxQuantity) : null,
    acceptedPaymentMethods: parsedPaymentMethods || ['COD', 'Online'],
    isActive: true
  });

  res.status(201).json({
    success: true,
    message: 'Product added successfully',
    product
  });
});

// @desc    Update product
// @route   PUT /api/distributor/products/:productId
// @access  Private (Distributor only)
exports.updateProduct = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  // FIX: Use _id consistently
  const distributorId = req.user._id;
  const { name, description, price, category, stock, unit, isActive, minQuantity, maxQuantity, acceptedPaymentMethods } = req.body;

  // Check if product belongs to distributor
  const product = await Product.findOne({
    _id: productId,
    distributor: distributorId
  });

  if (!product) {
    throw new NotFoundError('Product not found or access denied');
  }

  // Field whitelisting - only update allowed fields
  if (name !== undefined) {
    if (!name.trim()) {
      throw new ValidationError('Product name cannot be empty');
    }
    product.name = name.trim();
  }

  if (description !== undefined) {
    if (!description.trim()) {
      throw new ValidationError('Product description cannot be empty');
    }
    product.description = description.trim();
  }

  if (price !== undefined) {
    const priceNum = parseFloat(price);
    if (priceNum <= 0) {
      throw new ValidationError('Product price must be greater than 0');
    }
    product.price = priceNum;
  }

  if (category !== undefined) {
    const validCategories = ['Cement', 'Steel', 'Bricks', 'Sand', 'Paint', 'Tiles', 'Other'];
    if (!validCategories.includes(category)) {
      throw new ValidationError(`Category must be one of: ${validCategories.join(', ')}`);
    }
    product.category = category;
  }

  if (stock !== undefined) {
    const stockNum = parseInt(stock);
    if (stockNum < 0) {
      throw new ValidationError('Stock cannot be negative');
    }
    product.stock = stockNum;
  }

  if (unit !== undefined) {
    product.unit = unit;
  }

  if (typeof isActive === 'boolean') {
    product.isActive = isActive;
  }

  // Update min/max quantity
  if (minQuantity !== undefined) {
    const minQty = parseInt(minQuantity);
    if (minQty < 1) {
      throw new ValidationError('Minimum quantity must be at least 1');
    }
    product.minQuantity = minQty;
  }

  if (maxQuantity !== undefined) {
    if (maxQuantity === null || maxQuantity === '') {
      product.maxQuantity = null;
    } else {
      const maxQty = parseInt(maxQuantity);
      if (maxQty < 1) {
        throw new ValidationError('Maximum quantity must be at least 1');
      }
      if (maxQty < product.minQuantity) {
        throw new ValidationError('Maximum quantity must be greater than or equal to minimum quantity');
      }
      product.maxQuantity = maxQty;
    }
  }

  // Update payment methods
  if (acceptedPaymentMethods !== undefined) {
    let parsedPaymentMethods = acceptedPaymentMethods;
    // Parse if it's a JSON string (from FormData)
    if (typeof acceptedPaymentMethods === 'string') {
      try {
        parsedPaymentMethods = JSON.parse(acceptedPaymentMethods);
      } catch (e) {
        throw new ValidationError('Invalid payment methods format');
      }
    }

    if (!Array.isArray(parsedPaymentMethods) || parsedPaymentMethods.length === 0) {
      throw new ValidationError('At least one payment method must be selected');
    }
    const validPaymentMethods = ['COD', 'Online'];
    const invalidMethods = parsedPaymentMethods.filter(method => !validPaymentMethods.includes(method));
    if (invalidMethods.length > 0) {
      throw new ValidationError(`Invalid payment methods: ${invalidMethods.join(', ')}`);
    }
    product.acceptedPaymentMethods = parsedPaymentMethods;
  }

  // Upload new image if provided
  if (req.file) {
    try {
      const result = await uploadToCloudinary(req.file.buffer);
      product.image = result.secure_url;
    } catch (error) {
      throw new ValidationError('Image upload failed. Please try again.');
    }
  }

  await product.save();

  res.json({
    success: true,
    message: 'Product updated successfully',
    product
  });
});

// @desc    Delete product
// @route   DELETE /api/distributor/products/:productId
// @access  Private (Distributor only)
exports.deleteProduct = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  // FIX: Use _id consistently
  const distributorId = req.user._id;

  const product = await Product.findOne({
    _id: productId,
    distributor: distributorId
  });

  if (!product) {
    throw new NotFoundError('Product not found or access denied');
  }

  await product.deleteOne();

  res.json({
    success: true,
    message: 'Product deleted successfully'
  });
});

// @desc    Get distributor dashboard statistics
// @route   GET /api/distributor/stats
// @access  Private (Distributor only)
exports.getDistributorStats = asyncHandler(async (req, res) => {
  // FIX: Use _id consistently
  const distributorId = req.user._id;

  // Run queries in parallel for better performance
  const [
    totalProducts,
    lowStockProducts,
    allOrders,
    lowStockData
  ] = await Promise.all([
    Product.countDocuments({ distributor: distributorId }),
    Product.countDocuments({
      distributor: distributorId,
      stock: { $lte: 10 }
    }),
    // FIX: Query using distributor field directly, not nested path
    Order.find({ distributor: distributorId })
      .populate('items.product', 'name price')
      .sort('-createdAt'),
    Product.find({
      distributor: distributorId,
      stock: { $lte: 10 }
    }).select('name stock').limit(10).sort('stock')
  ]);

  // Calculate order statistics
  const totalOrders = allOrders.length;
  const pendingOrders = allOrders.filter(o => o.orderStatus === 'pending').length;
  const processingOrders = allOrders.filter(o => o.orderStatus === 'processing').length;
  const shippedOrders = allOrders.filter(o => o.orderStatus === 'shipped').length;
  const deliveredOrders = allOrders.filter(o => o.orderStatus === 'delivered').length;

  // Calculate total revenue (only from paid orders)
  const totalRevenue = allOrders
    .filter(o => o.paymentStatus === 'paid')
    .reduce((sum, order) => sum + order.totalAmount, 0);

  // Calculate revenue by month for the last 6 months
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const recentOrders = allOrders.filter(o =>
    new Date(o.createdAt) >= sixMonthsAgo && o.paymentStatus === 'paid'
  );

  const revenueByMonth = {};
  recentOrders.forEach(order => {
    const month = new Date(order.createdAt).toLocaleString('default', { month: 'short', year: 'numeric' });
    revenueByMonth[month] = (revenueByMonth[month] || 0) + order.totalAmount;
  });

  const revenueData = Object.entries(revenueByMonth).map(([month, revenue]) => ({
    month,
    revenue
  }));

  // Order status breakdown
  const orderData = [
    { status: 'pending', count: pendingOrders },
    { status: 'processing', count: processingOrders },
    { status: 'shipped', count: shippedOrders },
    { status: 'delivered', count: deliveredOrders }
  ];

  // Low stock products
  const stockData = lowStockData.map(p => ({
    product: p.name,
    stock: p.stock
  }));

  res.json({
    success: true,
    stats: {
      totalRevenue,
      totalOrders,
      totalProducts,
      pendingOrders,
      lowStockProducts,
      revenueData,
      orderData,
      stockData
    }
  });
});

// @desc    Get distributor's orders with pagination
// @route   GET /api/distributor/orders
// @access  Private (Distributor only)
exports.getDistributorOrders = asyncHandler(async (req, res) => {
  // FIX: Use _id consistently
  const distributorId = req.user._id;
  const { page = 1, limit = 20, orderStatus } = req.query;

  // Validate and limit pagination
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

  // FIX: Use distributor field directly
  const filter = { distributor: distributorId };

  // Filter by order status
  if (orderStatus) {
    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
    if (validStatuses.includes(orderStatus)) {
      filter.orderStatus = orderStatus;
    }
  }

  const orders = await Order.find(filter)
    .populate('user', 'name email phone')
    .populate('items.product', 'name price image')
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

// @desc    Update order status
// @route   PUT /api/distributor/orders/:orderId/status
// @access  Private (Distributor only)
exports.updateOrderStatus = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { orderStatus, note } = req.body;
  // FIX: Use _id consistently
  const distributorId = req.user._id;

  // Validate order status
  const validStatuses = ['confirmed', 'processing', 'shipped', 'delivered'];
  if (!orderStatus || !validStatuses.includes(orderStatus)) {
    throw new ValidationError(`Order status must be one of: ${validStatuses.join(', ')}`);
  }

  const order = await Order.findById(orderId);

  if (!order) {
    throw new NotFoundError('Order not found');
  }

  // SECURITY: Verify distributor owns this order
  if (order.distributor.toString() !== distributorId.toString()) {
    throw new AuthorizationError('You are not authorized to update this order');
  }

  // Prevent updating cancelled orders
  if (order.orderStatus === 'cancelled') {
    throw new ValidationError('Cannot update status of cancelled orders');
  }

  // Use the Order model's updateStatus method
  await order.updateStatus(orderStatus, note || '', distributorId, 'Distributor');

  res.json({
    success: true,
    message: 'Order status updated successfully',
    order
  });
});

// @desc    Approve order with delivery price
// @route   PUT /api/distributor/orders/:orderId/approve
// @access  Private (Distributor only)
exports.approveOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { deliveryCharge } = req.body;
  const distributorId = req.user._id;

  // Validate delivery charge
  if (deliveryCharge !== undefined && deliveryCharge !== null) {
    const deliveryChargeNum = parseFloat(deliveryCharge);
    if (isNaN(deliveryChargeNum) || deliveryChargeNum < 0) {
      throw new ValidationError('Delivery charge must be a non-negative number');
    }
  }

  const order = await Order.findById(orderId);

  if (!order) {
    throw new NotFoundError('Order not found');
  }

  // SECURITY: Verify distributor owns this order
  if (order.distributor.toString() !== distributorId.toString()) {
    throw new AuthorizationError('You are not authorized to approve this order');
  }

  // Use the Order model's approveOrder method
  await order.approveOrder(distributorId, deliveryCharge !== undefined ? parseFloat(deliveryCharge) : undefined);

  // Populate order details before sending response
  await order.populate('user', 'name email phone');
  await order.populate('items.product', 'name price image');

  res.json({
    success: true,
    message: 'Order approved successfully',
    order
  });
});

// @desc    Reject order
// @route   PUT /api/distributor/orders/:orderId/reject
// @access  Private (Distributor only)
exports.rejectOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { reason } = req.body;
  const distributorId = req.user._id;

  // Validate rejection reason
  if (!reason || !reason.trim()) {
    throw new ValidationError('Rejection reason is required');
  }

  const order = await Order.findById(orderId);

  if (!order) {
    throw new NotFoundError('Order not found');
  }

  // SECURITY: Verify distributor owns this order
  if (order.distributor.toString() !== distributorId.toString()) {
    throw new AuthorizationError('You are not authorized to reject this order');
  }

  // Use the Order model's rejectOrder method
  await order.rejectOrder(distributorId, reason.trim());

  // Populate order details before sending response
  await order.populate('user', 'name email phone');
  await order.populate('items.product', 'name price image');

  res.json({
    success: true,
    message: 'Order rejected successfully',
    order
  });
});

// @desc    Get distributor profile
// @route   GET /api/distributor/profile
// @access  Private (Distributor only)
exports.getProfile = asyncHandler(async (req, res) => {
  const distributorId = req.user._id;

  const distributor = await Distributor.findById(distributorId).select('-password');

  if (!distributor) {
    throw new NotFoundError('Distributor not found');
  }

  res.json({
    success: true,
    distributor
  });
});

// @desc    Update distributor profile
// @route   PUT /api/distributor/profile
// @access  Private (Distributor only)
exports.updateProfile = asyncHandler(async (req, res) => {
  const distributorId = req.user._id;
  const { businessName, phone, address, pincode } = req.body;

  const distributor = await Distributor.findById(distributorId);

  if (!distributor) {
    throw new NotFoundError('Distributor not found');
  }

  // Field whitelisting - only update allowed fields
  if (businessName !== undefined) {
    if (!businessName.trim()) {
      throw new ValidationError('Business name cannot be empty');
    }
    distributor.businessName = businessName.trim();
  }

  if (phone !== undefined) {
    if (!phone.trim()) {
      throw new ValidationError('Phone number cannot be empty');
    }
    // Basic phone validation
    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(phone.replace(/[\s-]/g, ''))) {
      throw new ValidationError('Please provide a valid 10-digit phone number');
    }
    distributor.phone = phone.trim();
  }

  if (address !== undefined) {
    if (!address.trim()) {
      throw new ValidationError('Address cannot be empty');
    }
    distributor.address = address.trim();
  }

  if (pincode !== undefined) {
    if (!pincode.trim()) {
      throw new ValidationError('Pincode cannot be empty');
    }
    // Basic pincode validation
    const pincodeRegex = /^[0-9]{6}$/;
    if (!pincodeRegex.test(pincode)) {
      throw new ValidationError('Please provide a valid 6-digit pincode');
    }
    distributor.pincode = pincode.trim();
  }

  await distributor.save();

  // Return distributor without password
  const updatedDistributor = await Distributor.findById(distributorId).select('-password');

  res.json({
    success: true,
    message: 'Profile updated successfully',
    distributor: updatedDistributor
  });
});

module.exports = exports;
