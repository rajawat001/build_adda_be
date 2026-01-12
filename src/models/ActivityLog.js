const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  admin: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'adminModel',
    required: true
  },

  adminModel: {
    type: String,
    required: true,
    enum: ['User', 'Distributor']
  },

  adminName: {
    type: String,
    required: true
  },

  adminEmail: {
    type: String,
    required: true
  },

  action: {
    type: String,
    required: true,
    enum: [
      'create',
      'update',
      'delete',
      'approve',
      'reject',
      'activate',
      'deactivate',
      'bulk_action',
      'login',
      'logout',
      'export',
      'import',
      'send_email'
    ]
  },

  entity: {
    type: String,
    required: true,
    enum: [
      'user',
      'distributor',
      'product',
      'order',
      'coupon',
      'category',
      'role',
      'review',
      'emailTemplate',
      'settings',
      'system'
    ]
  },

  entityId: {
    type: mongoose.Schema.Types.ObjectId
  },

  entityName: {
    type: String // Descriptive name of the entity for display
  },

  changes: {
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed
  },

  bulkDetails: {
    count: Number,
    entityIds: [mongoose.Schema.Types.ObjectId],
    successCount: Number,
    failureCount: Number
  },

  description: {
    type: String,
    required: true
  },

  ipAddress: {
    type: String
  },

  userAgent: {
    type: String
  },

  status: {
    type: String,
    enum: ['success', 'failed', 'partial'],
    default: 'success'
  },

  errorMessage: {
    type: String
  },

  metadata: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Indexes for faster queries
activityLogSchema.index({ admin: 1, createdAt: -1 });
activityLogSchema.index({ action: 1, createdAt: -1 });
activityLogSchema.index({ entity: 1, createdAt: -1 });
activityLogSchema.index({ entityId: 1 });
activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ status: 1 });

// Compound index for common query patterns
activityLogSchema.index({ admin: 1, entity: 1, createdAt: -1 });
activityLogSchema.index({ entity: 1, action: 1, createdAt: -1 });

// Virtual for formatted timestamp
activityLogSchema.virtual('formattedTime').get(function() {
  const options = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  };
  return this.createdAt.toLocaleDateString('en-US', options);
});

// Static method to create activity log
activityLogSchema.statics.log = async function({
  admin,
  adminModel = 'User',
  adminName,
  adminEmail,
  action,
  entity,
  entityId,
  entityName,
  changes,
  bulkDetails,
  description,
  ipAddress,
  userAgent,
  status = 'success',
  errorMessage,
  metadata
}) {
  try {
    const log = await this.create({
      admin,
      adminModel,
      adminName,
      adminEmail,
      action,
      entity,
      entityId,
      entityName,
      changes,
      bulkDetails,
      description,
      ipAddress,
      userAgent,
      status,
      errorMessage,
      metadata
    });

    return log;
  } catch (error) {
    console.error('Failed to create activity log:', error);
    return null;
  }
};

// Static method to get logs with filters
activityLogSchema.statics.getFilteredLogs = async function({
  admin,
  action,
  entity,
  startDate,
  endDate,
  page = 1,
  limit = 50
}) {
  const filter = {};

  if (admin) filter.admin = admin;
  if (action) filter.action = action;
  if (entity) filter.entity = entity;

  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }

  const logs = await this.find(filter)
    .populate('admin', 'name email')
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip((page - 1) * limit);

  const total = await this.countDocuments(filter);

  return {
    logs,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};

// Static method to get activity summary
activityLogSchema.statics.getActivitySummary = async function(days = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const summary = await this.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          action: '$action',
          entity: '$entity'
        },
        count: { $sum: 1 },
        lastActivity: { $max: '$createdAt' }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);

  return summary;
};

// Static method to get recent activity for an entity
activityLogSchema.statics.getEntityHistory = async function(entityId, limit = 10) {
  const history = await this.find({ entityId })
    .populate('admin', 'name email')
    .sort({ createdAt: -1 })
    .limit(limit);

  return history;
};

// TTL index to auto-delete logs older than 90 days (optional - for data retention)
// Uncomment if you want to auto-delete old logs
// activityLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 }); // 90 days

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

module.exports = ActivityLog;
