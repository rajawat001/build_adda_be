const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const Distributor = require('../models/Distributor');
const cache = require('../utils/cache');

// @desc    Get dashboard analytics with charts data
// @route   GET /api/admin/analytics/dashboard
// @access  Private/Admin
exports.getDashboardAnalytics = async (req, res) => {
  try {
    // Check cache first (5 minute TTL)
    const cached = cache.get('dashboard_analytics');
    if (cached) {
      return res.json({ success: true, analytics: cached });
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    // Run ALL queries in parallel for maximum speed
    const [
      revenueByMonth,
      orderStatusCounts,
      categoryPerformance,
      pendingOrders,
      lowStockProducts,
      pendingDistributors,
      thisMonthRevenue,
      lastMonthRevenue,
      thisMonthOrders,
      lastMonthOrders,
      thisMonthUsers,
      lastMonthUsers,
      thisMonthDistributors,
      lastMonthDistributors
    ] = await Promise.all([
      // Revenue by month (last 6 months)
      Order.aggregate([
        {
          $match: {
            $or: [
              { paymentStatus: 'paid' },
              { orderStatus: 'delivered' }
            ],
            createdAt: { $gte: sixMonthsAgo }
          }
        },
        {
          $group: {
            _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
            total: { $sum: '$totalAmount' }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]).allowDiskUse(true),

      // Order status distribution
      Order.aggregate([
        { $group: { _id: '$orderStatus', count: { $sum: 1 } } }
      ]),

      // Top 5 categories by sales - optimized pipeline
      Order.aggregate([
        { $match: { paymentStatus: 'paid' } },
        { $unwind: '$items' },
        {
          $lookup: {
            from: 'products',
            localField: 'items.product',
            foreignField: '_id',
            pipeline: [{ $project: { category: 1 } }],
            as: 'productInfo'
          }
        },
        { $unwind: '$productInfo' },
        {
          $lookup: {
            from: 'categories',
            localField: 'productInfo.category',
            foreignField: '_id',
            pipeline: [{ $project: { name: 1 } }],
            as: 'categoryInfo'
          }
        },
        { $unwind: { path: '$categoryInfo', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: '$categoryInfo.name',
            total: { $sum: { $multiply: ['$items.quantity', '$items.price'] } }
          }
        },
        { $sort: { total: -1 } },
        { $limit: 5 }
      ]).allowDiskUse(true),

      // Pending counts
      Order.countDocuments({ orderStatus: 'pending' }),
      Product.countDocuments({ stock: { $lt: 10 } }),
      Distributor.countDocuments({ isVerified: false, isActive: true }),

      // This month revenue
      Order.aggregate([
        {
          $match: {
            $or: [{ paymentStatus: 'paid' }, { orderStatus: 'delivered' }],
            createdAt: { $gte: startOfMonth }
          }
        },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ]),
      // Last month revenue
      Order.aggregate([
        {
          $match: {
            $or: [{ paymentStatus: 'paid' }, { orderStatus: 'delivered' }],
            createdAt: { $gte: lastMonthStart, $lt: lastMonthEnd }
          }
        },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ]),

      // Order counts
      Order.countDocuments({ createdAt: { $gte: startOfMonth } }),
      Order.countDocuments({ createdAt: { $gte: lastMonthStart, $lt: lastMonthEnd } }),

      // User counts
      User.countDocuments({ role: 'user', createdAt: { $gte: startOfMonth } }),
      User.countDocuments({ role: 'user', createdAt: { $gte: lastMonthStart, $lt: lastMonthEnd } }),

      // Distributor counts
      Distributor.countDocuments({ createdAt: { $gte: startOfMonth } }),
      Distributor.countDocuments({ createdAt: { $gte: lastMonthStart, $lt: lastMonthEnd } })
    ]);

    // Format revenue data for chart
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const revenueLabels = [];
    const revenueData = [];

    for (let i = 5; i >= 0; i--) {
      const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthIndex = targetDate.getMonth();
      revenueLabels.push(monthNames[monthIndex]);

      const monthData = revenueByMonth.find(
        item => item._id.month === monthIndex + 1 && item._id.year === targetDate.getFullYear()
      );
      revenueData.push(monthData ? monthData.total : 0);
    }

    // Format order status
    const statusMap = { pending: 'Pending', processing: 'Processing', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled' };
    const orderStatusLabels = [];
    const orderStatusData = [];

    ['pending', 'processing', 'shipped', 'delivered', 'cancelled'].forEach(status => {
      const statusCount = orderStatusCounts.find(item => item._id === status);
      orderStatusLabels.push(statusMap[status]);
      orderStatusData.push(statusCount ? statusCount.count : 0);
    });

    // Format category data
    const categoryLabels = categoryPerformance.map(cat => cat._id || 'Uncategorized');
    const categoryData = categoryPerformance.map(cat => cat.total);

    // Calculate trends
    const calculateTrend = (current, previous) => {
      if (!previous) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100 * 10) / 10;
    };

    const trends = {
      revenue: calculateTrend(thisMonthRevenue[0]?.total || 0, lastMonthRevenue[0]?.total || 0),
      orders: calculateTrend(thisMonthOrders, lastMonthOrders),
      users: calculateTrend(thisMonthUsers, lastMonthUsers),
      distributors: calculateTrend(thisMonthDistributors, lastMonthDistributors)
    };

    const analytics = {
      revenueData: { labels: revenueLabels, data: revenueData },
      orderStatusData: { labels: orderStatusLabels, data: orderStatusData },
      categoryData: { labels: categoryLabels, data: categoryData },
      pendingOrders,
      lowStockProducts,
      pendingApprovals: pendingDistributors,
      trends
    };

    // Cache for 5 minutes
    cache.set('dashboard_analytics', analytics, 300);

    res.json({ success: true, analytics });
  } catch (error) {
    console.error('Get dashboard analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard analytics',
      error: error.message
    });
  }
};
