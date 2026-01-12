const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const Distributor = require('../models/Distributor');

// @desc    Get dashboard analytics with charts data
// @route   GET /api/admin/analytics/dashboard
// @access  Private/Admin
exports.getDashboardAnalytics = async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    // Get revenue data for last 6 months
    const revenueByMonth = await Order.aggregate([
      {
        $match: {
          $or: [
            { paymentStatus: 'paid' },
            { orderStatus: 'delivered' }
          ],
          createdAt: {
            $gte: new Date(now.getFullYear(), now.getMonth() - 5, 1)
          }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          total: { $sum: '$totalAmount' }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      }
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

    // Get order status distribution
    const orderStatusCounts = await Order.aggregate([
      {
        $group: {
          _id: '$orderStatus',
          count: { $sum: 1 }
        }
      }
    ]);

    const statusMap = {
      pending: 'Pending',
      processing: 'Processing',
      shipped: 'Shipped',
      delivered: 'Delivered',
      cancelled: 'Cancelled'
    };

    const orderStatusLabels = [];
    const orderStatusData = [];

    ['pending', 'processing', 'shipped', 'delivered', 'cancelled'].forEach(status => {
      const statusCount = orderStatusCounts.find(item => item._id === status);
      orderStatusLabels.push(statusMap[status]);
      orderStatusData.push(statusCount ? statusCount.count : 0);
    });

    // Get top 5 categories by sales
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
          _id: '$categoryInfo.name',
          total: {
            $sum: { $multiply: ['$items.quantity', '$items.price'] }
          }
        }
      },
      { $sort: { total: -1 } },
      { $limit: 5 }
    ]);

    const categoryLabels = categoryPerformance.map(cat => cat._id || 'Uncategorized');
    const categoryData = categoryPerformance.map(cat => cat.total);

    // Get pending counts
    const [pendingOrders, lowStockProducts, pendingDistributors] = await Promise.all([
      Order.countDocuments({ orderStatus: 'pending' }),
      Product.countDocuments({ stock: { $lt: 10 } }),
      Distributor.countDocuments({ isVerified: false, isActive: true })
    ]);

    // Calculate trends (compare this month vs last month)
    const [thisMonthRevenue, lastMonthRevenue] = await Promise.all([
      Order.aggregate([
        {
          $match: {
            $or: [
              { paymentStatus: 'paid' },
              { orderStatus: 'delivered' }
            ],
            createdAt: { $gte: startOfMonth }
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
            createdAt: { $gte: lastMonthStart, $lt: lastMonthEnd }
          }
        },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ])
    ]);

    const [thisMonthOrders, lastMonthOrders] = await Promise.all([
      Order.countDocuments({ createdAt: { $gte: startOfMonth } }),
      Order.countDocuments({ createdAt: { $gte: lastMonthStart, $lt: lastMonthEnd } })
    ]);

    const [thisMonthUsers, lastMonthUsers] = await Promise.all([
      User.countDocuments({ role: 'user', createdAt: { $gte: startOfMonth } }),
      User.countDocuments({ role: 'user', createdAt: { $gte: lastMonthStart, $lt: lastMonthEnd } })
    ]);

    const [thisMonthDistributors, lastMonthDistributors] = await Promise.all([
      Distributor.countDocuments({ createdAt: { $gte: startOfMonth } }),
      Distributor.countDocuments({ createdAt: { $gte: lastMonthStart, $lt: lastMonthEnd } })
    ]);

    const calculateTrend = (current, previous) => {
      if (!previous) return 100;
      return ((current - previous) / previous) * 100;
    };

    const trends = {
      revenue: calculateTrend(
        thisMonthRevenue[0]?.total || 0,
        lastMonthRevenue[0]?.total || 0
      ),
      orders: calculateTrend(thisMonthOrders, lastMonthOrders),
      users: calculateTrend(thisMonthUsers, lastMonthUsers),
      distributors: calculateTrend(thisMonthDistributors, lastMonthDistributors)
    };

    res.json({
      success: true,
      analytics: {
        revenueData: {
          labels: revenueLabels,
          data: revenueData
        },
        orderStatusData: {
          labels: orderStatusLabels,
          data: orderStatusData
        },
        categoryData: {
          labels: categoryLabels,
          data: categoryData
        },
        pendingOrders,
        lowStockProducts,
        pendingApprovals: pendingDistributors,
        trends
      }
    });
  } catch (error) {
    console.error('Get dashboard analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard analytics',
      error: error.message
    });
  }
};
