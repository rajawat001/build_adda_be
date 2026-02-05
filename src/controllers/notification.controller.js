const Notification = require('../models/Notification');
const PushSubscription = require('../models/PushSubscription');
const { AppError } = require('../utils/errors');
const pushService = require('../services/push.service');

// Get all notifications for the logged-in user
exports.getNotifications = async (req, res, next) => {
  try {
    const notifications = await Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);

    res.status(200).json({
      success: true,
      count: notifications.length,
      notifications
    });
  } catch (error) {
    next(error);
  }
};

// Get unread notifications count
exports.getUnreadCount = async (req, res, next) => {
  try {
    const count = await Notification.countDocuments({
      user: req.user._id,
      read: false
    });

    res.status(200).json({
      success: true,
      count
    });
  } catch (error) {
    next(error);
  }
};

// Mark notification as read
exports.markAsRead = async (req, res, next) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      {
        _id: req.params.id,
        user: req.user._id
      },
      { read: true },
      { new: true }
    );

    if (!notification) {
      return next(new AppError('Notification not found', 404));
    }

    res.status(200).json({
      success: true,
      notification
    });
  } catch (error) {
    next(error);
  }
};

// Mark all notifications as read
exports.markAllAsRead = async (req, res, next) => {
  try {
    await Notification.updateMany(
      { user: req.user._id, read: false },
      { read: true }
    );

    res.status(200).json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    next(error);
  }
};

// Delete a notification
exports.deleteNotification = async (req, res, next) => {
  try {
    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id
    });

    if (!notification) {
      return next(new AppError('Notification not found', 404));
    }

    res.status(200).json({
      success: true,
      message: 'Notification deleted'
    });
  } catch (error) {
    next(error);
  }
};

// Delete all notifications for user
exports.deleteAllNotifications = async (req, res, next) => {
  try {
    await Notification.deleteMany({ user: req.user._id });

    res.status(200).json({
      success: true,
      message: 'All notifications deleted'
    });
  } catch (error) {
    next(error);
  }
};

// Create a notification (internal use - for order updates, etc.)
exports.createNotification = async (userId, data, userModel = 'User') => {
  try {
    const notification = await Notification.create({
      user: userId,
      userModel: userModel,
      ...data
    });

    // Send web push notification (fire-and-forget)
    pushService.sendPushToUser(userId, userModel, {
      title: data.title,
      message: data.message,
      type: data.type || 'general',
      tag: `${data.type || 'general'}_${notification._id}`,
      url: data.orderNumber ? '/orders' : '/',
      actions: data.orderNumber
        ? [{ action: 'view', title: 'View Order' }]
        : []
    }).catch((err) => console.error('Push notification error:', err));

    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    return null;
  }
};

// Return public VAPID key (no auth required)
exports.getVapidKey = async (req, res) => {
  res.status(200).json({
    success: true,
    publicKey: process.env.VAPID_PUBLIC_KEY
  });
};

// Save push subscription
exports.subscribePush = async (req, res, next) => {
  try {
    const { subscription } = req.body;

    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return next(new AppError('Invalid push subscription', 400));
    }

    // Determine user model from role
    const userModel = req.user.role === 'distributor' ? 'Distributor' : 'User';

    await PushSubscription.findOneAndUpdate(
      { user: req.user._id, 'subscription.endpoint': subscription.endpoint },
      {
        user: req.user._id,
        userModel,
        subscription: {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth
          }
        }
      },
      { upsert: true, new: true }
    );

    res.status(200).json({
      success: true,
      message: 'Push subscription saved'
    });
  } catch (error) {
    next(error);
  }
};

// Remove push subscription
exports.unsubscribePush = async (req, res, next) => {
  try {
    const { endpoint } = req.body;

    if (!endpoint) {
      return next(new AppError('Endpoint is required', 400));
    }

    await PushSubscription.findOneAndDelete({
      user: req.user._id,
      'subscription.endpoint': endpoint
    });

    res.status(200).json({
      success: true,
      message: 'Push subscription removed'
    });
  } catch (error) {
    next(error);
  }
};
