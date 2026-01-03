const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const shippingAddressSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    required: true,
    match: [/^[6-9]\d{9}$/, 'Please provide a valid phone number']
  },
  address: {
    type: String,
    required: true
  },
  city: {
    type: String,
    required: true
  },
  state: {
    type: String,
    required: true
  },
  pincode: {
    type: String,
    required: true,
    match: [/^\d{6}$/, 'Please provide a valid 6-digit pincode']
  }
});

const orderSchema = new mongoose.Schema({
  // CRITICAL FIX: Added order number for unique identification
  orderNumber: {
    type: String,
    unique: true,
    default: () => `ORD-${Date.now()}-${uuidv4().substring(0, 8).toUpperCase()}`
  },

  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required'],
    index: true
  },

  // CRITICAL FIX: Added distributor field for multi-distributor support
  distributor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Distributor',
    required: [true, 'Distributor is required'],
    index: true
  },

  items: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    // Per-item distributor tracking (for future multi-distributor orders)
    distributor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Distributor'
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, 'Quantity must be at least 1']
    },
    price: {
      type: Number,
      required: true,
      min: [0, 'Price cannot be negative']
    },
    name: String,  // Store product name for historical record
    image: String  // Store product image for historical record
  }],

  // Pricing breakdown
  subtotal: {
    type: Number,
    required: true,
    min: [0, 'Subtotal cannot be negative']
  },
  discount: {
    type: Number,
    default: 0,
    min: [0, 'Discount cannot be negative']
  },
  tax: {
    type: Number,
    default: 0,
    min: [0, 'Tax cannot be negative']
  },
  taxPercentage: {
    type: Number,
    default: 0,
    min: [0, 'Tax percentage cannot be negative']
  },
  deliveryCharge: {
    type: Number,
    default: 0,
    min: [0, 'Delivery charge cannot be negative']
  },
  totalAmount: {
    type: Number,
    required: true,
    min: [0, 'Total amount cannot be negative']
  },

  // FIX: Structured shipping address instead of string
  shippingAddress: {
    type: shippingAddressSchema,
    required: [true, 'Shipping address is required']
  },

  // Payment details
  paymentMethod: {
    type: String,
    enum: {
      values: ['Online', 'COD'],
      message: 'Payment method must be either Online or COD'
    },
    required: [true, 'Payment method is required']
  },
  paymentStatus: {
    type: String,
    enum: {
      values: ['pending', 'paid', 'failed', 'refunded'],
      message: 'Invalid payment status'
    },
    default: 'pending',
    index: true
  },

  // Razorpay details
  razorpayOrderId: String,
  razorpayPaymentId: String,
  razorpaySignature: String,

  // Order tracking
  orderStatus: {
    type: String,
    enum: {
      values: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'],
      message: 'Invalid order status'
    },
    default: 'pending',
    index: true
  },

  // Status history for tracking
  statusHistory: [{
    status: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    note: String,
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'statusHistory.updatedByModel'
    },
    updatedByModel: {
      type: String,
      enum: ['User', 'Distributor']
    }
  }],

  // Delivery tracking
  trackingNumber: String,
  trackingUrl: String,
  estimatedDelivery: Date,
  actualDelivery: Date,

  // Coupon details
  couponCode: {
    type: String,
    uppercase: true
  },
  coupon: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Coupon'
  },

  // Cancellation details
  cancellationReason: String,
  cancelledAt: Date,
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'cancelledByModel'
  },
  cancelledByModel: {
    type: String,
    enum: ['User', 'Distributor']
  },

  // Additional information
  deliveryNotes: {
    type: String,
    maxlength: [500, 'Delivery notes cannot exceed 500 characters']
  },
  invoice: String,  // URL to invoice PDF

  // Approval details (distributor approval)
  approvalStatus: {
    type: String,
    enum: {
      values: ['pending', 'approved', 'rejected'],
      message: 'Invalid approval status'
    },
    default: 'pending',
    index: true
  },
  approvedAt: Date,
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Distributor'
  },
  rejectionReason: String,

  // Refund details
  refundAmount: {
    type: Number,
    default: 0
  },
  refundStatus: {
    type: String,
    enum: ['none', 'pending', 'processed', 'failed'],
    default: 'none'
  },
  refundedAt: Date

}, {
  timestamps: true
});

// INDEXES for performance optimization
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ distributor: 1, orderStatus: 1 });
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ paymentStatus: 1, orderStatus: 1 });

// VIRTUAL: Check if order can be cancelled
orderSchema.virtual('canBeCancelled').get(function() {
  const cancellableStatuses = ['pending', 'confirmed', 'processing'];
  return cancellableStatuses.includes(this.orderStatus);
});

// VIRTUAL: Check if order is completed
orderSchema.virtual('isCompleted').get(function() {
  return this.orderStatus === 'delivered';
});

// PRE-SAVE MIDDLEWARE: Add to status history when status changes
orderSchema.pre('save', function(next) {
  if (this.isModified('orderStatus')) {
    this.statusHistory.push({
      status: this.orderStatus,
      timestamp: new Date(),
      note: `Order status changed to ${this.orderStatus}`
    });
  }
  next();
});

// PRE-SAVE MIDDLEWARE: Validate totalAmount calculation
orderSchema.pre('save', function(next) {
  // Skip validation if only status-related fields are being updated
  // This prevents validation errors for orders created before tax removal
  const modifiedPaths = this.modifiedPaths();
  const pricingFields = ['subtotal', 'discount', 'deliveryCharge', 'totalAmount', 'tax'];
  const pricingFieldsModified = modifiedPaths.some(path => pricingFields.includes(path));

  // Only validate total if pricing fields are being modified
  if (!pricingFieldsModified) {
    return next();
  }

  // No tax applied in calculation (for new orders)
  const calculatedTotal = this.subtotal + this.deliveryCharge - this.discount;

  // Allow small rounding differences (5 rupees to account for old orders with tax)
  if (Math.abs(calculatedTotal - this.totalAmount) > 5) {
    return next(new Error(
      `Total amount mismatch. Expected ${calculatedTotal}, got ${this.totalAmount}`
    ));
  }

  next();
});

// METHOD: Cancel order
orderSchema.methods.cancel = async function(reason, cancelledBy, cancelledByModel) {
  if (!this.canBeCancelled) {
    throw new Error('Order cannot be cancelled in current status');
  }

  this.orderStatus = 'cancelled';
  this.cancellationReason = reason;
  this.cancelledAt = new Date();
  this.cancelledBy = cancelledBy;
  this.cancelledByModel = cancelledByModel;

  return this.save();
};

// METHOD: Update status with history
orderSchema.methods.updateStatus = async function(newStatus, note, updatedBy, updatedByModel) {
  // Allow distributors to move forward to any future status or cancel
  const statusOrder = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];
  const currentIndex = statusOrder.indexOf(this.orderStatus);
  const newIndex = statusOrder.indexOf(newStatus);

  // Validate status transitions
  if (this.orderStatus === 'delivered') {
    const ValidationError = require('../utils/errors').ValidationError;
    throw new ValidationError('Cannot update status of delivered orders');
  }

  if (this.orderStatus === 'cancelled') {
    const ValidationError = require('../utils/errors').ValidationError;
    throw new ValidationError('Cannot update status of cancelled orders');
  }

  // Allow moving forward in the status chain or cancelling
  if (newStatus === 'cancelled') {
    // Allow cancellation from any status except delivered
    this.orderStatus = newStatus;
  } else if (newIndex > currentIndex) {
    // Allow moving forward to any future status
    this.orderStatus = newStatus;
  } else {
    const ValidationError = require('../utils/errors').ValidationError;
    throw new ValidationError(`Cannot transition from ${this.orderStatus} to ${newStatus}. Can only move forward or cancel.`);
  }

  this.statusHistory.push({
    status: newStatus,
    timestamp: new Date(),
    note: note || `Status updated to ${newStatus}`,
    updatedBy,
    updatedByModel
  });

  return this.save();
};

// METHOD: Approve order with delivery price
orderSchema.methods.approveOrder = async function(distributorId, deliveryCharge) {
  if (this.approvalStatus !== 'pending') {
    throw new Error('Order has already been approved or rejected');
  }

  this.approvalStatus = 'approved';
  this.approvedAt = new Date();
  this.approvedBy = distributorId;

  if (deliveryCharge !== undefined && deliveryCharge !== null) {
    this.deliveryCharge = deliveryCharge;
    // Recalculate total amount (no tax applied)
    this.totalAmount = this.subtotal + this.deliveryCharge - this.discount;
  }

  // Update order status to confirmed after approval
  if (this.orderStatus === 'pending') {
    this.orderStatus = 'confirmed';
  }

  return this.save();
};

// METHOD: Reject order
orderSchema.methods.rejectOrder = async function(distributorId, reason) {
  if (this.approvalStatus !== 'pending') {
    throw new Error('Order has already been approved or rejected');
  }

  this.approvalStatus = 'rejected';
  this.rejectionReason = reason;
  this.approvedBy = distributorId;
  this.orderStatus = 'cancelled';
  this.cancelledAt = new Date();
  this.cancelledBy = distributorId;
  this.cancelledByModel = 'Distributor';

  return this.save();
};

module.exports = mongoose.model('Order', orderSchema);
