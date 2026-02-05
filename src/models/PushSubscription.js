const mongoose = require('mongoose');

const pushSubscriptionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'userModel',
    required: true
  },
  userModel: {
    type: String,
    enum: ['User', 'Distributor'],
    default: 'User'
  },
  subscription: {
    endpoint: { type: String, required: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true }
    }
  }
}, { timestamps: true });

// One subscription per endpoint per user
pushSubscriptionSchema.index({ user: 1, 'subscription.endpoint': 1 }, { unique: true });
// Quick lookup when sending pushes
pushSubscriptionSchema.index({ user: 1, userModel: 1 });

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);
