const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notification.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Public route — no auth needed
router.get('/vapid-key', notificationController.getVapidKey);

// All routes below require authentication
router.use(authMiddleware.protect);

// Push subscription management
router.post('/subscribe', notificationController.subscribePush);
router.post('/unsubscribe', notificationController.unsubscribePush);

// Get all notifications for logged-in user
router.get('/', notificationController.getNotifications);

// Get unread count
router.get('/unread-count', notificationController.getUnreadCount);

// Mark all as read
router.put('/mark-all-read', notificationController.markAllAsRead);

// Mark specific notification as read
router.put('/:id/read', notificationController.markAsRead);

// Delete specific notification
router.delete('/:id', notificationController.deleteNotification);

// Delete all notifications
router.delete('/', notificationController.deleteAllNotifications);

module.exports = router;
