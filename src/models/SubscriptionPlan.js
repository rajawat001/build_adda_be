const mongoose = require('mongoose');

const subscriptionPlanSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    enum: ['Monthly', 'Yearly']
  },
  duration: {
    type: String,
    required: true,
    enum: ['monthly', 'yearly']
  },
  durationInDays: {
    type: Number,
    required: true
  },
  realPrice: {
    type: Number,
    required: true,
    min: 0
  },
  offerPrice: {
    type: Number,
    required: true,
    min: 0
  },
  features: [{
    type: String
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  description: {
    type: String
  },
  discount: {
    type: Number,
    default: 0
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Calculate discount percentage
subscriptionPlanSchema.pre('save', function(next) {
  if (this.realPrice > 0) {
    this.discount = Math.round(((this.realPrice - this.offerPrice) / this.realPrice) * 100);
  }
  next();
});

module.exports = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);
