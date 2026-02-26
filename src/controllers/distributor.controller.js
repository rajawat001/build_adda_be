const Product = require('../models/Product');
const Order = require('../models/Order');
const Distributor = require('../models/Distributor');
const { uploadToCloudinary } = require('../config/cloudinary');
const asyncHandler = require('../utils/asyncHandler');
const { ValidationError, NotFoundError, AuthorizationError } = require('../utils/errors');
const { createNotification } = require('./notification.controller');

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
  const {
    name, description, price, realPrice, category, stock, unit, minQuantity, maxQuantity, acceptedPaymentMethods,
    unitType, brand, manufacturer, origin, material, color, weight, warranty, hsnCode, dimensions, specifications
  } = req.body;

  // Validate required fields
  if (!name || !name.trim()) {
    throw new ValidationError('Product name is required');
  }

  if (!description || !description.trim()) {
    throw new ValidationError('Product description is required');
  }

  const priceNum = parseFloat(price);
  if (!price || priceNum <= 0) {
    throw new ValidationError('Product price must be greater than 0');
  }

  // Validate realPrice (MRP) if provided
  const realPriceNum = realPrice ? parseFloat(realPrice) : null;
  if (realPriceNum !== null && realPriceNum < priceNum) {
    throw new ValidationError('Real price (MRP) must be greater than or equal to selling price');
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

  // Parse dimensions and specifications from JSON strings (FormData sends strings)
  let parsedDimensions = undefined;
  if (dimensions) {
    try {
      parsedDimensions = typeof dimensions === 'string' ? JSON.parse(dimensions) : dimensions;
    } catch (e) {
      throw new ValidationError('Invalid dimensions format');
    }
  }

  let parsedSpecifications = undefined;
  if (specifications) {
    try {
      parsedSpecifications = typeof specifications === 'string' ? JSON.parse(specifications) : specifications;
    } catch (e) {
      throw new ValidationError('Invalid specifications format');
    }
  }

  // Upload images to Cloudinary if provided
  let imageUrls = [];
  if (req.files && req.files.length > 0) {
    try {
      const uploadPromises = req.files.map(file => uploadToCloudinary(file.buffer));
      const results = await Promise.all(uploadPromises);
      imageUrls = results.map(result => result.secure_url);
    } catch (error) {
      throw new ValidationError('Image upload failed. Please try again.');
    }
  }

  // Create product with field whitelisting
  const productData = {
    name: name.trim(),
    description: description.trim(),
    price: priceNum,
    category,
    stock: parseInt(stock),
    unit: unit || 'unit',
    unitType: unitType || 'unit',
    image: imageUrls.length > 0 ? imageUrls[0] : '',
    images: imageUrls,
    distributor: distributorId,
    minQuantity: minQuantity !== undefined ? parseInt(minQuantity) : 1,
    maxQuantity: maxQuantity !== undefined && maxQuantity !== null ? parseInt(maxQuantity) : null,
    acceptedPaymentMethods: parsedPaymentMethods || ['COD', 'Online'],
    isActive: true,
    brand: brand ? brand.trim() : '',
    manufacturer: manufacturer ? manufacturer.trim() : '',
    origin: origin ? origin.trim() : '',
    material: material ? material.trim() : '',
    color: color ? color.trim() : '',
    weight: weight ? weight.trim() : '',
    warranty: warranty ? warranty.trim() : '',
    hsnCode: hsnCode ? hsnCode.trim() : '',
  };

  if (realPriceNum !== null) {
    productData.realPrice = realPriceNum;
  }

  if (parsedDimensions) {
    productData.dimensions = parsedDimensions;
  }

  if (parsedSpecifications) {
    productData.specifications = parsedSpecifications;
  }

  const product = await Product.create(productData);

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
  const {
    name, description, price, realPrice, category, stock, unit, isActive, minQuantity, maxQuantity, acceptedPaymentMethods,
    unitType, brand, manufacturer, origin, material, color, weight, warranty, hsnCode, dimensions, specifications, existingImages
  } = req.body;

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

  if (realPrice !== undefined) {
    if (realPrice === null || realPrice === '') {
      product.realPrice = undefined;
    } else {
      const realPriceNum = parseFloat(realPrice);
      if (realPriceNum < 0) {
        throw new ValidationError('Real price (MRP) cannot be negative');
      }
      const currentPrice = price !== undefined ? parseFloat(price) : product.price;
      if (realPriceNum < currentPrice) {
        throw new ValidationError('Real price (MRP) must be greater than or equal to selling price');
      }
      product.realPrice = realPriceNum;
    }
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

  // Handle new detail fields
  if (unitType !== undefined) product.unitType = unitType;
  if (brand !== undefined) product.brand = brand.trim();
  if (manufacturer !== undefined) product.manufacturer = manufacturer.trim();
  if (origin !== undefined) product.origin = origin.trim();
  if (material !== undefined) product.material = material.trim();
  if (color !== undefined) product.color = color.trim();
  if (weight !== undefined) product.weight = weight.trim();
  if (warranty !== undefined) product.warranty = warranty.trim();
  if (hsnCode !== undefined) product.hsnCode = hsnCode.trim();

  if (dimensions !== undefined) {
    try {
      product.dimensions = typeof dimensions === 'string' ? JSON.parse(dimensions) : dimensions;
    } catch (e) {
      throw new ValidationError('Invalid dimensions format');
    }
  }

  if (specifications !== undefined) {
    try {
      product.specifications = typeof specifications === 'string' ? JSON.parse(specifications) : specifications;
    } catch (e) {
      throw new ValidationError('Invalid specifications format');
    }
  }

  // Handle multi-image upload
  let keptImages = [];
  if (existingImages) {
    try {
      keptImages = typeof existingImages === 'string' ? JSON.parse(existingImages) : existingImages;
      if (!Array.isArray(keptImages)) keptImages = [];
    } catch (e) {
      keptImages = [];
    }
  }

  let newImageUrls = [];
  if (req.files && req.files.length > 0) {
    try {
      const uploadPromises = req.files.map(file => uploadToCloudinary(file.buffer));
      const results = await Promise.all(uploadPromises);
      newImageUrls = results.map(result => result.secure_url);
    } catch (error) {
      throw new ValidationError('Image upload failed. Please try again.');
    }
  }

  // If we have any image changes (new files or existing images list provided)
  if (req.files?.length > 0 || existingImages !== undefined) {
    const allImages = [...keptImages, ...newImageUrls];
    product.images = allImages;
    if (allImages.length > 0) {
      product.image = allImages[0];
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
  const distributorId = req.user._id;

  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);
  const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const baseMatch = { distributor: distributorId };

  // Run all queries in parallel using aggregations
  const [
    totalProducts,
    lowStockCount,
    lowStockData,
    revenueResult,
    totalOrders,
    statusCounts,
    revenueTrend,
    currentMonthRevResult,
    prevMonthRevResult,
    currentMonthOrders,
    prevMonthOrders,
    recentOrders
  ] = await Promise.all([
    // 1. Total products
    Product.countDocuments({ distributor: distributorId }),
    // 2. Low stock count
    Product.countDocuments({ distributor: distributorId, stock: { $lte: 10 } }),
    // 3. Low stock product details
    Product.find({ distributor: distributorId, stock: { $lte: 10 } })
      .select('name stock').limit(10).sort('stock'),
    // 4. Total revenue (delivered only)
    Order.aggregate([
      { $match: { ...baseMatch, orderStatus: 'delivered' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }
    ]),
    // 5. Total order count
    Order.countDocuments(baseMatch),
    // 6. Order counts by status
    Order.aggregate([
      { $match: baseMatch },
      { $group: { _id: '$orderStatus', count: { $sum: 1 } } }
    ]),
    // 7. Revenue by month (last 6 months, delivered only)
    Order.aggregate([
      { $match: { ...baseMatch, orderStatus: 'delivered', createdAt: { $gte: sixMonthsAgo } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
        revenue: { $sum: '$totalAmount' },
        label: { $first: { $dateToString: { format: '%b %Y', date: '$createdAt' } } }
      }},
      { $sort: { _id: 1 } }
    ]),
    // 8. Current month revenue
    Order.aggregate([
      { $match: { ...baseMatch, orderStatus: 'delivered', createdAt: { $gte: startOfCurrentMonth } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]),
    // 9. Previous month revenue
    Order.aggregate([
      { $match: { ...baseMatch, orderStatus: 'delivered', createdAt: { $gte: startOfPreviousMonth, $lt: startOfCurrentMonth } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]),
    // 10. Current month order count
    Order.countDocuments({ ...baseMatch, createdAt: { $gte: startOfCurrentMonth } }),
    // 11. Previous month order count
    Order.countDocuments({ ...baseMatch, createdAt: { $gte: startOfPreviousMonth, $lt: startOfCurrentMonth } }),
    // 12. Recent orders for activity feed
    Order.find(baseMatch)
      .select('orderNumber orderStatus totalAmount updatedAt createdAt')
      .sort('-updatedAt')
      .limit(10)
      .lean()
  ]);

  // Extract revenue and delivered count
  const totalRevenue = revenueResult[0]?.total || 0;
  const deliveredCount = revenueResult[0]?.count || 0;
  const averageOrderValue = deliveredCount > 0 ? Math.round(totalRevenue / deliveredCount) : 0;

  // Growth calculations
  const currentMonthRev = currentMonthRevResult[0]?.total || 0;
  const prevMonthRev = prevMonthRevResult[0]?.total || 0;
  const revenueGrowth = prevMonthRev > 0
    ? ((currentMonthRev - prevMonthRev) / prevMonthRev) * 100
    : currentMonthRev > 0 ? 100 : 0;
  const ordersGrowth = prevMonthOrders > 0
    ? ((currentMonthOrders - prevMonthOrders) / prevMonthOrders) * 100
    : currentMonthOrders > 0 ? 100 : 0;

  // Revenue data for chart
  const revenueData = revenueTrend.map(r => ({ month: r.label, revenue: r.revenue }));

  // Order status breakdown (all 6 statuses)
  const allStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
  const orderData = allStatuses.map(status => ({
    status,
    count: statusCounts.find(s => s._id === status)?.count || 0
  }));

  const pendingOrders = orderData.find(s => s.status === 'pending')?.count || 0;

  // Low stock products
  const stockData = lowStockData.map(p => ({ product: p.name, stock: p.stock }));

  // Recent activity from real orders
  const statusMessages = {
    pending: 'New order received',
    confirmed: 'Order confirmed',
    processing: 'Order being processed',
    shipped: 'Order shipped',
    delivered: 'Order delivered',
    cancelled: 'Order cancelled',
  };
  const recentActivity = recentOrders.map(order => ({
    id: order._id,
    orderNumber: order.orderNumber,
    status: order.orderStatus,
    amount: order.totalAmount,
    timestamp: order.updatedAt || order.createdAt,
    message: `${statusMessages[order.orderStatus] || 'Order updated'} — #${order.orderNumber}`
  }));

  res.json({
    success: true,
    stats: {
      totalRevenue,
      totalOrders,
      totalProducts,
      pendingOrders,
      lowStockProducts: lowStockCount,
      averageOrderValue,
      growth: {
        revenue: { value: Math.round(Math.abs(revenueGrowth) * 10) / 10, isPositive: revenueGrowth >= 0 },
        orders: { value: Math.round(Math.abs(ordersGrowth) * 10) / 10, isPositive: ordersGrowth >= 0 },
      },
      revenueData,
      orderData,
      stockData,
      recentActivity,
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

  // Charge commission when order is delivered (for commission-plan distributors)
  if (orderStatus === 'delivered') {
    try {
      const distributor = await Distributor.findById(distributorId).select('planType').lean();
      if (distributor && distributor.planType === 'commission') {
        const { chargeCommission } = require('../modules/commission/services/commission.service');
        await chargeCommission(order._id);
      }
    } catch (commErr) {
      console.error('Commission charge error:', commErr.message);
    }
  }

  // Populate order to get user details
  await order.populate('user', 'name email phone');

  // Create notification for user about status update
  const statusMessages = {
    confirmed: 'Your order has been confirmed',
    processing: 'Your order is being processed',
    shipped: 'Your order has been shipped',
    delivered: 'Your order has been delivered'
  };

  const notificationTypes = {
    confirmed: 'order_confirmed',
    processing: 'order_confirmed',
    shipped: 'order_shipped',
    delivered: 'order_delivered'
  };

  if (order.user) {
    await createNotification(order.user._id, {
      type: notificationTypes[orderStatus] || 'general',
      title: 'Order Status Updated',
      message: `${statusMessages[orderStatus] || 'Your order status has been updated'} - #${order.orderNumber}`,
      orderId: order._id,
      orderNumber: order.orderNumber
    });
  }

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

  // Create notification for user about order approval
  if (order.user) {
    await createNotification(order.user._id, {
      type: 'order_approved',
      title: 'Order Approved',
      message: `Your order #${order.orderNumber} has been approved and confirmed`,
      orderId: order._id,
      orderNumber: order.orderNumber
    });
  }

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

  // Create notification for user about order rejection
  if (order.user) {
    await createNotification(order.user._id, {
      type: 'order_rejected',
      title: 'Order Rejected',
      message: `Your order #${order.orderNumber} has been rejected. Reason: ${reason.trim()}`,
      orderId: order._id,
      orderNumber: order.orderNumber
    });
  }

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
  const { businessName, phone, address, pincode, city, state, location } = req.body;

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

  if (city !== undefined) {
    if (!city.trim()) {
      throw new ValidationError('City cannot be empty');
    }
    distributor.city = city.trim();
  }

  if (state !== undefined) {
    if (!state.trim()) {
      throw new ValidationError('State cannot be empty');
    }
    distributor.state = state.trim();
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

  if (location !== undefined && location !== null) {
    if (location.coordinates && Array.isArray(location.coordinates) && location.coordinates.length === 2) {
      const [lng, lat] = location.coordinates;
      if (typeof lng === 'number' && typeof lat === 'number' &&
          lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90) {
        distributor.location = { type: 'Point', coordinates: [lng, lat] };
      } else {
        throw new ValidationError('Invalid coordinates: longitude must be -180 to 180, latitude -90 to 90');
      }
    }
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

// @desc    Get distributor analytics data
// @route   GET /api/distributor/analytics
// @access  Private (Distributor only)
exports.getDistributorAnalytics = asyncHandler(async (req, res) => {
  const distributorId = req.user._id;
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    throw new ValidationError('startDate and endDate query parameters are required');
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new ValidationError('Invalid date format. Use ISO date strings.');
  }

  const periodLength = end.getTime() - start.getTime();
  const prevStart = new Date(start.getTime() - periodLength);
  const prevEnd = new Date(start);

  const baseMatch = { distributor: distributorId };
  const currentDateMatch = { createdAt: { $gte: start, $lte: end } };
  const prevDateMatch = { createdAt: { $gte: prevStart, $lt: prevEnd } };

  // Determine grouping interval: daily if <= 90 days, monthly otherwise
  const daysDiff = Math.ceil(periodLength / (1000 * 60 * 60 * 24));
  const groupByMonth = daysDiff > 90;

  const dateGroupExpression = groupByMonth
    ? { $dateToString: { format: '%Y-%m', date: '$createdAt' } }
    : { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };

  const labelFormat = groupByMonth
    ? { $dateToString: { format: '%b %Y', date: '$createdAt' } }
    : { $dateToString: { format: '%b %d', date: '$createdAt' } };

  // Run all aggregations in parallel
  const [
    currentRevenue,
    prevRevenue,
    revenueTrend,
    currentOrderCount,
    prevOrderCount,
    ordersByStatus,
    totalProducts,
    topSelling,
    byCategory,
    totalCustomers,
    newCustomers,
  ] = await Promise.all([
    // 1. Current period revenue (delivered orders only)
    Order.aggregate([
      { $match: { ...baseMatch, ...currentDateMatch, orderStatus: 'delivered' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]),

    // 2. Previous period revenue (delivered orders only)
    Order.aggregate([
      { $match: { ...baseMatch, ...prevDateMatch, orderStatus: 'delivered' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]),

    // 3. Revenue trend grouped by day/month (delivered orders)
    Order.aggregate([
      { $match: { ...baseMatch, ...currentDateMatch, orderStatus: 'delivered' } },
      {
        $group: {
          _id: dateGroupExpression,
          total: { $sum: '$totalAmount' },
          label: { $first: labelFormat },
        },
      },
      { $sort: { _id: 1 } },
    ]),

    // 4. Current period order count
    Order.countDocuments({ ...baseMatch, ...currentDateMatch }),

    // 5. Previous period order count
    Order.countDocuments({ ...baseMatch, ...prevDateMatch }),

    // 6. Orders by status in current period
    Order.aggregate([
      { $match: { ...baseMatch, ...currentDateMatch } },
      { $group: { _id: '$orderStatus', count: { $sum: 1 } } },
    ]),

    // 7. Total products for this distributor
    Product.countDocuments({ distributor: distributorId }),

    // 8. Top selling products (from order items in current period)
    Order.aggregate([
      { $match: { ...baseMatch, ...currentDateMatch, orderStatus: { $ne: 'cancelled' } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          sales: { $sum: '$items.quantity' },
          revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'productInfo',
        },
      },
      { $unwind: { path: '$productInfo', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          id: '$_id',
          name: { $ifNull: ['$productInfo.name', 'Deleted Product'] },
          sales: 1,
          revenue: 1,
        },
      },
    ]),

    // 9. Products by category (from order items, joined with product for category)
    Order.aggregate([
      { $match: { ...baseMatch, ...currentDateMatch, orderStatus: { $ne: 'cancelled' } } },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.product',
          foreignField: '_id',
          as: 'productInfo',
        },
      },
      { $unwind: { path: '$productInfo', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { $ifNull: ['$productInfo.category', 'Other'] },
          count: { $addToSet: '$items.product' },
          revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
        },
      },
      {
        $project: {
          category: '$_id',
          count: { $size: '$count' },
          revenue: 1,
          _id: 0,
        },
      },
      { $sort: { revenue: -1 } },
    ]),

    // 10. Total distinct customers in current period
    Order.aggregate([
      { $match: { ...baseMatch, ...currentDateMatch } },
      { $group: { _id: '$user' } },
      { $count: 'total' },
    ]),

    // 11. New customers: users whose first order from this distributor is within the date range
    Order.aggregate([
      { $match: { distributor: distributorId } },
      { $sort: { createdAt: 1 } },
      {
        $group: {
          _id: '$user',
          firstOrderDate: { $first: '$createdAt' },
        },
      },
      {
        $match: {
          firstOrderDate: { $gte: start, $lte: end },
        },
      },
      { $count: 'total' },
    ]),
  ]);

  // Extract values with safe defaults
  const currentRevenueTotal = currentRevenue[0]?.total || 0;
  const prevRevenueTotal = prevRevenue[0]?.total || 0;
  const revenueGrowth = prevRevenueTotal > 0
    ? ((currentRevenueTotal - prevRevenueTotal) / prevRevenueTotal) * 100
    : currentRevenueTotal > 0 ? 100 : 0;

  const currentOrders = currentOrderCount;
  const prevOrders = prevOrderCount;
  const ordersGrowth = prevOrders > 0
    ? ((currentOrders - prevOrders) / prevOrders) * 100
    : currentOrders > 0 ? 100 : 0;

  // Build orders by status with percentages
  const totalOrdersInPeriod = ordersByStatus.reduce((sum, s) => sum + s.count, 0);
  const statusMap = {
    pending: 'Pending',
    confirmed: 'Confirmed',
    processing: 'Processing',
    shipped: 'Shipped',
    delivered: 'Completed',
    cancelled: 'Cancelled',
  };
  const byStatusFormatted = ordersByStatus.map(s => ({
    status: statusMap[s._id] || s._id,
    count: s.count,
    percentage: totalOrdersInPeriod > 0
      ? Math.round((s.count / totalOrdersInPeriod) * 1000) / 10
      : 0,
  }));

  const customerTotal = totalCustomers[0]?.total || 0;
  const newCustomerCount = newCustomers[0]?.total || 0;

  res.json({
    success: true,
    analytics: {
      revenue: {
        total: currentRevenueTotal,
        growth: Math.round(revenueGrowth * 10) / 10,
        trend: revenueTrend.map(r => r.total),
        labels: revenueTrend.map(r => r.label),
      },
      orders: {
        total: currentOrders,
        growth: Math.round(ordersGrowth * 10) / 10,
        byStatus: byStatusFormatted,
      },
      products: {
        total: totalProducts,
        topSelling: topSelling.map(p => ({
          id: p.id,
          name: p.name,
          sales: p.sales,
          revenue: p.revenue,
        })),
        byCategory: byCategory,
      },
      customers: {
        total: customerTotal,
        new: newCustomerCount,
        returning: Math.max(0, customerTotal - newCustomerCount),
      },
    },
  });
});

module.exports = exports;
