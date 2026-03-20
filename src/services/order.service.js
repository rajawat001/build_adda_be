const Order = require('../models/Order');
const Product = require('../models/Product');
const Coupon = require('../models/Coupon');
const Transaction = require('../models/Transaction');
const { createNotification } = require('../controllers/notification.controller');
const { bulkUpdateStock } = require('./stock.service');

class OrderService {
  // Generate unique order number
  generateOrderNumber() {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return `ORD${timestamp}${random}`;
  }

  // Create new order
  async createOrder(orderData) {
    // Use the orderData passed from controller which already has validated items and calculations
    const order = await Order.create({
      orderNumber: this.generateOrderNumber(),
      ...orderData  // Spread all fields from orderData (includes paymentMethod, distributor, etc.)
    });

    // Update product stock in batch
    await bulkUpdateStock(orderData.items, 'decrement');

    // Create notification for distributor about new order
    if (orderData.distributor) {
      await createNotification(orderData.distributor, {
        type: 'order_placed',
        title: 'New Order Received',
        message: `New order #${order.orderNumber} has been placed`,
        orderId: order._id,
        orderNumber: order.orderNumber
      }, 'Distributor');
    }

    return await this.getOrderById(order._id);
  }

  // Get order by ID
  async getOrderById(orderId) {
    return await Order.findById(orderId)
      .populate('user', 'name email phone')
      .populate({
        path: 'items.product',
        populate: [
          { path: 'category', select: 'name' },
          { path: 'distributor', select: 'businessName email phone' }
        ]
      });
  }

  // Get user orders
  async getUserOrders(filters, options = {}) {
    const { page = 1, limit = 10 } = options;

    const orders = await Order.find(filters)
      .populate('items.product', 'name image price')
      .sort('-createdAt')
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await Order.countDocuments(filters);

    return {
      orders,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      totalOrders: count
    };
  }

  // Get distributor orders
  async getDistributorOrders(filters, options = {}) {
    const { page = 1, limit = 20 } = options;
    const distributorId = filters['items.product.distributor'];

    // Use aggregation to filter at the database level instead of fetching all orders
    const pipeline = [
      // Unwind items to join with products
      { $unwind: '$items' },
      // Lookup product details
      {
        $lookup: {
          from: 'products',
          localField: 'items.product',
          foreignField: '_id',
          as: 'items.productDetails'
        }
      },
      { $unwind: '$items.productDetails' },
      // Filter only items belonging to this distributor
      { $match: { 'items.productDetails.distributor': new (require('mongoose').Types.ObjectId)(distributorId) } },
      // Group back to order level
      {
        $group: {
          _id: '$_id',
          orderNumber: { $first: '$orderNumber' },
          user: { $first: '$user' },
          orderStatus: { $first: '$orderStatus' },
          paymentStatus: { $first: '$paymentStatus' },
          paymentMethod: { $first: '$paymentMethod' },
          totalAmount: { $first: '$totalAmount' },
          subtotal: { $first: '$subtotal' },
          discount: { $first: '$discount' },
          deliveryCharge: { $first: '$deliveryCharge' },
          shippingAddress: { $first: '$shippingAddress' },
          createdAt: { $first: '$createdAt' },
          updatedAt: { $first: '$updatedAt' },
          approvalStatus: { $first: '$approvalStatus' },
          items: {
            $push: {
              product: '$items.productDetails',
              quantity: '$items.quantity',
              price: '$items.price',
              name: '$items.name',
              image: '$items.image'
            }
          }
        }
      },
      { $sort: { createdAt: -1 } },
      // Facet for pagination
      {
        $facet: {
          orders: [
            { $skip: (page - 1) * limit },
            { $limit: limit }
          ],
          totalCount: [{ $count: 'count' }]
        }
      }
    ];

    const [result] = await Order.aggregate(pipeline);
    const orders = result.orders || [];
    const totalCount = result.totalCount[0]?.count || 0;

    // Populate user details
    await Order.populate(orders, { path: 'user', select: 'name email phone' });

    return {
      orders,
      totalPages: Math.ceil(totalCount / limit),
      currentPage: page,
      totalOrders: totalCount
    };
  }

  // Update order status
  async updateOrderStatus(orderId, status) {
    const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
    
    if (!validStatuses.includes(status)) {
      throw new Error('Invalid order status');
    }

    const order = await Order.findByIdAndUpdate(
      orderId,
      { status },
      { new: true }
    );

    if (!order) {
      throw new Error('Order not found');
    }

    // If order is cancelled, restore stock in batch
    if (status === 'cancelled') {
      await bulkUpdateStock(order.items, 'increment');
    }

    return await this.getOrderById(orderId);
  }

  // Update order payment details
  async updateOrderPayment(orderId, paymentData) {
    const order = await Order.findByIdAndUpdate(
      orderId,
      {
        ...paymentData,
        paymentDate: new Date()
      },
      { new: true }
    );

    if (!order) {
      throw new Error('Order not found');
    }

    // Create transaction record if payment completed
    if (paymentData.paymentStatus === 'completed') {
      await Transaction.create({
        order: orderId,
        user: order.user,
        amount: order.totalAmount,
        paymentMethod: paymentData.paymentMethod || 'phonepe',
        transactionId: paymentData.phonepeTransactionId,
        status: 'success'
      });

      // Update order status to processing
      order.status = 'processing';
      await order.save();
    }

    return await this.getOrderById(orderId);
  }

  // Apply coupon
  async applyCoupon(couponCode, totalAmount) {
    const coupon = await Coupon.findOne({
      code: couponCode.toUpperCase(),
      isActive: true,
      expiryDate: { $gte: new Date() }
    });

    if (!coupon) {
      throw new Error('Invalid or expired coupon');
    }

    if (totalAmount < coupon.minPurchase) {
      throw new Error(`Minimum purchase of ₹${coupon.minPurchase} required`);
    }

    let discount = 0;

    if (coupon.discountType === 'percentage') {
      discount = (totalAmount * coupon.discountValue) / 100;
      
      if (coupon.maxDiscount > 0 && discount > coupon.maxDiscount) {
        discount = coupon.maxDiscount;
      }
    } else if (coupon.discountType === 'fixed') {
      discount = coupon.discountValue;
    }

    // Increment usage count
    coupon.usageCount += 1;
    await coupon.save();

    return discount;
  }

  // Get order statistics for distributor
  async getDistributorStats(distributorId) {
    const orders = await Order.find()
      .populate({
        path: 'items.product',
        match: { distributor: distributorId }
      });

    const filteredOrders = orders.filter(order => 
      order.items.some(item => item.product !== null)
    );

    let totalRevenue = 0;
    let ordersByStatus = {
      pending: 0,
      processing: 0,
      shipped: 0,
      delivered: 0,
      cancelled: 0
    };

    filteredOrders.forEach(order => {
      if (order.paymentStatus === 'completed') {
        totalRevenue += order.totalAmount;
      }
      ordersByStatus[order.status] = (ordersByStatus[order.status] || 0) + 1;
    });

    // Revenue by month (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const revenueByMonth = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: sixMonthsAgo },
          paymentStatus: 'completed'
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          revenue: { $sum: '$totalAmount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    return {
      totalRevenue,
      totalOrders: filteredOrders.length,
      ordersByStatus,
      revenueByMonth
    };
  }

  // Get recent orders
  async getRecentOrders(limit = 10) {
    return await Order.find()
      .populate('user', 'name email')
      .populate('items.product', 'name price image')
      .sort('-createdAt')
      .limit(limit);
  }
}

module.exports = new OrderService();