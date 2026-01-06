const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  type: {
    type: String,
    enum: [
      'order_placed',
      'order_approved',
      'order_rejected',
      'order_confirmed',
      'order_shipped',
      'order_delivered',
      'price_update',
      'stock_update',
      'general'
    ],
    required: true
  },

  title: {
    type: String,
    required: true
  },

  message: {
    type: String,
    required: true
  },

  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },

  orderNumber: {
    type: String
  },

  read: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Index for faster queries
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, read: 1 });

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
