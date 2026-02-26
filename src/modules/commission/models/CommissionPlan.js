const mongoose = require('mongoose');

const commissionPlanSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Plan name is required'],
    trim: true,
    maxlength: [100, 'Plan name cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  type: {
    type: String,
    enum: ['percentage', 'fixed'],
    required: [true, 'Commission type is required']
  },
  value: {
    type: Number,
    required: [true, 'Commission value is required'],
    min: [0, 'Commission value cannot be negative']
  },
  walletLimit: {
    type: Number,
    required: [true, 'Wallet limit is required'],
    min: [100, 'Wallet limit must be at least 100']
  },
  minPaymentAmount: {
    type: Number,
    required: [true, 'Minimum payment amount is required'],
    min: [1, 'Minimum payment must be at least 1']
  },
  gracePeriodDays: {
    type: Number,
    default: 3,
    min: [0, 'Grace period cannot be negative'],
    max: [30, 'Grace period cannot exceed 30 days']
  },
  earlyPaymentAllowed: {
    type: Boolean,
    default: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

commissionPlanSchema.index({ isActive: 1 });

module.exports = mongoose.model('CommissionPlan', commissionPlanSchema);
