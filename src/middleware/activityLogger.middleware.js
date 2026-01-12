const ActivityLog = require('../models/ActivityLog');

/**
 * Middleware to log admin activities
 * Usage: Add after authentication middleware on admin routes
 */
const logActivity = (action, entity, options = {}) => {
  return async (req, res, next) => {
    // Store original methods
    const originalJson = res.json;
    const originalSend = res.send;

    // Extract IP address
    const ipAddress = req.headers['x-forwarded-for'] ||
                     req.connection.remoteAddress ||
                     req.socket.remoteAddress;

    // Extract user agent
    const userAgent = req.headers['user-agent'];

    // Get admin info from authenticated user
    const admin = req.user?._id;
    const adminModel = req.userModel || 'User';
    const adminName = req.user?.name || req.user?.businessName;
    const adminEmail = req.user?.email;

    // Override res.json to capture response
    res.json = function(data) {
      // Only log successful operations
      if (data.success) {
        logActivityAsync({
          admin,
          adminModel,
          adminName,
          adminEmail,
          action,
          entity,
          entityId: extractEntityId(req, data, options),
          entityName: extractEntityName(req, data, options),
          changes: extractChanges(req, data, options),
          bulkDetails: extractBulkDetails(req, data, options),
          description: generateDescription(action, entity, req, data, options),
          ipAddress,
          userAgent,
          status: 'success',
          metadata: options.metadata
        });
      }

      // Call original json method
      return originalJson.call(this, data);
    };

    // Override res.send for non-JSON responses
    res.send = function(data) {
      return originalSend.call(this, data);
    };

    next();
  };
};

/**
 * Async function to log activity (non-blocking)
 */
async function logActivityAsync(logData) {
  try {
    await ActivityLog.log(logData);
  } catch (error) {
    console.error('Activity logging error:', error);
    // Don't throw error - logging should not affect main operation
  }
}

/**
 * Extract entity ID from request/response
 */
function extractEntityId(req, data, options) {
  // Priority: options > response data > params > body
  if (options.entityId) {
    return typeof options.entityId === 'function'
      ? options.entityId(req, data)
      : options.entityId;
  }

  // From response
  if (data.user?._id) return data.user._id;
  if (data.distributor?._id) return data.distributor._id;
  if (data.product?._id) return data.product._id;
  if (data.order?._id) return data.order._id;
  if (data.coupon?._id) return data.coupon._id;
  if (data.category?._id) return data.category._id;
  if (data.role?._id) return data.role._id;
  if (data.review?._id) return data.review._id;

  // From params
  if (req.params.userId) return req.params.userId;
  if (req.params.distributorId) return req.params.distributorId;
  if (req.params.productId) return req.params.productId;
  if (req.params.orderId) return req.params.orderId;
  if (req.params.couponId) return req.params.couponId;
  if (req.params.id) return req.params.id;

  return null;
}

/**
 * Extract entity name for display
 */
function extractEntityName(req, data, options) {
  if (options.entityName) {
    return typeof options.entityName === 'function'
      ? options.entityName(req, data)
      : options.entityName;
  }

  // Extract name from response
  if (data.user?.name) return data.user.name;
  if (data.distributor?.businessName) return data.distributor.businessName;
  if (data.product?.name) return data.product.name;
  if (data.order?.orderNumber) return data.order.orderNumber;
  if (data.coupon?.code) return data.coupon.code;
  if (data.category?.name) return data.category.name;
  if (data.role?.name) return data.role.name;

  return null;
}

/**
 * Extract before/after changes
 */
function extractChanges(req, data, options) {
  if (options.changes) {
    return typeof options.changes === 'function'
      ? options.changes(req, data)
      : options.changes;
  }

  // Only log changes for update actions
  if (!['update', 'activate', 'deactivate', 'approve', 'reject'].includes(options.action)) {
    return undefined;
  }

  return {
    before: options.before,
    after: req.body
  };
}

/**
 * Extract bulk operation details
 */
function extractBulkDetails(req, data, options) {
  if (options.bulkDetails) {
    return typeof options.bulkDetails === 'function'
      ? options.bulkDetails(req, data)
      : options.bulkDetails;
  }

  // Check if this is a bulk operation
  if (req.body.ids || req.body.entityIds) {
    return {
      count: req.body.ids?.length || req.body.entityIds?.length,
      entityIds: req.body.ids || req.body.entityIds,
      successCount: data.successCount,
      failureCount: data.failureCount
    };
  }

  return undefined;
}

/**
 * Generate human-readable description
 */
function generateDescription(action, entity, req, data, options) {
  if (options.description) {
    return typeof options.description === 'function'
      ? options.description(req, data)
      : options.description;
  }

  const actionMap = {
    create: 'Created',
    update: 'Updated',
    delete: 'Deleted',
    approve: 'Approved',
    reject: 'Rejected',
    activate: 'Activated',
    deactivate: 'Deactivated',
    bulk_action: 'Performed bulk action on',
    export: 'Exported',
    import: 'Imported'
  };

  const entityMap = {
    user: 'user',
    distributor: 'distributor',
    product: 'product',
    order: 'order',
    coupon: 'coupon',
    category: 'category',
    role: 'role',
    review: 'review',
    emailTemplate: 'email template',
    settings: 'system settings'
  };

  const entityName = extractEntityName(req, data, options);
  const bulkDetails = extractBulkDetails(req, data, options);

  if (bulkDetails) {
    return `${actionMap[action] || action} ${bulkDetails.count} ${entityMap[entity]}s`;
  }

  if (entityName) {
    return `${actionMap[action] || action} ${entityMap[entity]} "${entityName}"`;
  }

  return `${actionMap[action] || action} ${entityMap[entity]}`;
}

/**
 * Helper to create manual activity logs
 */
const createActivityLog = async ({
  admin,
  adminModel = 'User',
  adminName,
  adminEmail,
  action,
  entity,
  entityId,
  entityName,
  changes,
  description,
  ipAddress,
  userAgent,
  bulkDetails,
  metadata
}) => {
  try {
    await ActivityLog.log({
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
      status: 'success',
      metadata
    });
  } catch (error) {
    console.error('Manual activity log creation failed:', error);
  }
};

module.exports = {
  logActivity,
  createActivityLog
};
