const mongoose = require('mongoose');

const commissionTransactionSchema = new mongoose.Schema({
  distributor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Distributor',
    required: true
  },
  wallet: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CommissionWallet',
    required: true
  },
  type: {
    type: String,
    enum: ['commission_charge', 'payment', 'reversal', 'adjustment'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  balanceAfter: {
    type: Number,
    required: true
  },
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  description: {
    type: String,
    trim: true
  },
  metadata: {
    orderNumber: String,
    orderAmount: Number,
    commissionRate: Number,
    commissionType: String,
    paymentMethod: String,
    phonepeMerchantTransactionId: String,
    phonepeTransactionId: String,
    adjustedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    adjustmentReason: String
  },
  status: {
    type: String,
    enum: ['completed', 'pending', 'failed', 'reversed'],
    default: 'completed'
  }
}, {
  timestamps: true
});

commissionTransactionSchema.index({ distributor: 1, createdAt: -1 });
commissionTransactionSchema.index({ wallet: 1, createdAt: -1 });
commissionTransactionSchema.index({ order: 1, type: 1 });
commissionTransactionSchema.index({ 'metadata.phonepeMerchantTransactionId': 1 });

module.exports = mongoose.model('CommissionTransaction', commissionTransactionSchema);
