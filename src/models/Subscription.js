const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  distributor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Distributor',
    required: true
  },
  plan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubscriptionPlan',
    required: true
  },
  startDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  endDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'expired', 'cancelled', 'pending'],
    default: 'pending'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending'
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  couponApplied: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Coupon'
  },
  discount: {
    type: Number,
    default: 0
  },
  // GST breakdown (18% total = 9% CGST + 9% SGST)
  gst: {
    baseAmount: { type: Number, default: 0 },      // Amount before GST
    cgstRate: { type: Number, default: 9 },        // CGST percentage
    cgstAmount: { type: Number, default: 0 },      // CGST amount
    sgstRate: { type: Number, default: 9 },        // SGST percentage
    sgstAmount: { type: Number, default: 0 },      // SGST amount
    totalGst: { type: Number, default: 0 },        // Total GST (CGST + SGST)
    gstRate: { type: Number, default: 18 }         // Total GST rate
  },
  finalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  // Invoice reference
  invoice: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice'
  },
  phonepeMerchantTransactionId: {
    type: String,
    index: true
  },
  phonepeTransactionId: {
    type: String
  },
  paymentMethod: {
    type: String,
    default: 'phonepe'
  },
  autoRenew: {
    type: Boolean,
    default: false
  },
  // PhonePe Autopay/Mandate fields
  autopay: {
    enabled: { type: Boolean, default: false },
    // PhonePe subscription ID (different from our subscription _id)
    phonepeSubscriptionId: { type: String, index: true },
    // Mandate authorization status
    authStatus: {
      type: String,
      enum: ['pending', 'authorized', 'failed', 'revoked', 'none'],
      default: 'none'
    },
    // Max amount authorized for auto-debit
    maxAmount: { type: Number },
    // Frequency: MONTHLY, YEARLY
    frequency: { type: String, enum: ['MONTHLY', 'YEARLY'] },
    // Auth request ID for tracking
    authRequestId: { type: String },
    // Date when mandate was authorized
    authorizedAt: { type: Date },
    // Last auto-renewal attempt
    lastRenewalAttempt: { type: Date },
    lastRenewalStatus: { type: String, enum: ['success', 'failed', 'pending'] },
    // Number of failed renewal attempts
    failedAttempts: { type: Number, default: 0 }
  },
  // Pause tracking for temp-disable
  pausedAt: {
    type: Date,
    default: null
  },
  totalPausedDays: {
    type: Number,
    default: 0
  },
  cancelledAt: {
    type: Date
  },
  cancelReason: {
    type: String
  }
}, {
  timestamps: true
});

// Index for faster queries
subscriptionSchema.index({ distributor: 1, status: 1 });
subscriptionSchema.index({ endDate: 1, status: 1 });
subscriptionSchema.index({ 'autopay.enabled': 1, 'autopay.authStatus': 1, endDate: 1 });

// Check if subscription is active
subscriptionSchema.methods.isActive = function() {
  return this.status === 'active' && this.endDate > new Date();
};

// Mark subscription as expired
subscriptionSchema.methods.markExpired = async function() {
  if (this.endDate <= new Date() && this.status === 'active') {
    this.status = 'expired';
    await this.save();
  }
};

module.exports = mongoose.model('Subscription', subscriptionSchema);
