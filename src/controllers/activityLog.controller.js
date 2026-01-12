const ActivityLog = require('../models/ActivityLog');

// @desc    Get all activity logs
// @route   GET /api/admin/activity-logs
// @access  Private/Admin
exports.getAllActivityLogs = async (req, res) => {
  try {
    const { page = 1, limit = 20, action, entity, adminId, search } = req.query;

    // Validate and limit pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    const filter = {};

    // Filter by action
    if (action) {
      filter.action = action;
    }

    // Filter by entity
    if (entity) {
      filter.entity = entity;
    }

    // Filter by admin
    if (adminId) {
      filter.admin = adminId;
    }

    // Search by entity ID
    if (search && search.trim()) {
      filter.entityId = new RegExp(search.trim(), 'i');
    }

    const logs = await ActivityLog.find(filter)
      .populate('admin', 'name email')
      .sort('-timestamp')
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum);

    const total = await ActivityLog.countDocuments(filter);

    res.json({
      success: true,
      logs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Get activity logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch activity logs',
      error: error.message
    });
  }
};

// @desc    Get activity log by ID
// @route   GET /api/admin/activity-logs/:id
// @access  Private/Admin
exports.getActivityLogById = async (req, res) => {
  try {
    const log = await ActivityLog.findById(req.params.id)
      .populate('admin', 'name email');

    if (!log) {
      return res.status(404).json({
        success: false,
        message: 'Activity log not found'
      });
    }

    res.json({
      success: true,
      log
    });
  } catch (error) {
    console.error('Get activity log error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch activity log',
      error: error.message
    });
  }
};

// @desc    Get activity logs for specific entity
// @route   GET /api/admin/activity-logs/entity/:entity/:entityId
// @access  Private/Admin
exports.getEntityHistory = async (req, res) => {
  try {
    const { entity, entityId } = req.params;

    const logs = await ActivityLog.find({
      entity,
      entityId
    })
      .populate('admin', 'name email')
      .sort('-timestamp');

    res.json({
      success: true,
      logs,
      count: logs.length
    });
  } catch (error) {
    console.error('Get entity history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch entity history',
      error: error.message
    });
  }
};

// @desc    Get activity log statistics
// @route   GET /api/admin/activity-logs/stats
// @access  Private/Admin
exports.getActivityLogStats = async (req, res) => {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [total, today, thisWeek, thisMonth] = await Promise.all([
      ActivityLog.countDocuments(),
      ActivityLog.countDocuments({ timestamp: { $gte: startOfToday } }),
      ActivityLog.countDocuments({ timestamp: { $gte: startOfWeek } }),
      ActivityLog.countDocuments({ timestamp: { $gte: startOfMonth } })
    ]);

    res.json({
      success: true,
      stats: {
        total,
        today,
        thisWeek,
        thisMonth
      }
    });
  } catch (error) {
    console.error('Get activity log stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch activity log statistics',
      error: error.message
    });
  }
};

// @desc    Get activity summary (grouped by action/entity)
// @route   GET /api/admin/activity-logs/summary
// @access  Private/Admin
exports.getActivitySummary = async (req, res) => {
  try {
    const { period = 'week' } = req.query;

    const now = new Date();
    let startDate;

    switch (period) {
      case 'day':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    const [byAction, byEntity, byAdmin] = await Promise.all([
      ActivityLog.aggregate([
        { $match: { timestamp: { $gte: startDate } } },
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      ActivityLog.aggregate([
        { $match: { timestamp: { $gte: startDate } } },
        { $group: { _id: '$entity', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      ActivityLog.aggregate([
        { $match: { timestamp: { $gte: startDate } } },
        { $group: { _id: '$admin', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'adminInfo'
          }
        },
        { $unwind: '$adminInfo' },
        {
          $project: {
            adminName: '$adminInfo.name',
            count: 1
          }
        }
      ])
    ]);

    res.json({
      success: true,
      summary: {
        period,
        byAction,
        byEntity,
        byAdmin
      }
    });
  } catch (error) {
    console.error('Get activity summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch activity summary',
      error: error.message
    });
  }
};

// @desc    Delete old activity logs
// @route   DELETE /api/admin/activity-logs/cleanup
// @access  Private/Admin
exports.cleanupOldLogs = async (req, res) => {
  try {
    const { daysToKeep = 90 } = req.body;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(daysToKeep));

    const result = await ActivityLog.deleteMany({
      timestamp: { $lt: cutoffDate }
    });

    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} old activity log(s)`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Cleanup activity logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cleanup activity logs',
      error: error.message
    });
  }
};
