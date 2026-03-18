const mongoose = require('mongoose');

const commissionWalletSchema = new mongoose.Schema({
  distributor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Distributor',
    required: true,
    unique: true
  },
  commissionPlan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CommissionPlan',
    required: true
  },
  balance: {
    type: Number,
    default: 0,
    min: [0, 'Balance cannot be negative']
  },
  totalCommissionCharged: {
    type: Number,
    default: 0
  },
  totalCommissionPaid: {
    type: Number,
    default: 0
  },
  totalOrders: {
    type: Number,
    default: 0
  },
  limitReachedAt: {
    type: Date,
    default: null
  },
  graceExpiresAt: {
    type: Date,
    default: null
  },
  isLimitExceeded: {
    type: Boolean,
    default: false
  },
  lastPaymentDate: {
    type: Date,
    default: null
  },
  status: {
    type: String,
    enum: ['active', 'locked', 'cleared'],
    default: 'active'
  }
}, {
  timestamps: true
});

// distributor already indexed via unique:true in schema
commissionWalletSchema.index({ status: 1 });
commissionWalletSchema.index({ isLimitExceeded: 1, graceExpiresAt: 1 });

module.exports = mongoose.model('CommissionWallet', commissionWalletSchema);
