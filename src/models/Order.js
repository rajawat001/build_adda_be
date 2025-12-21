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
  const calculatedTotal = this.subtotal + this.tax + this.deliveryCharge - this.discount;

  // Allow small rounding differences (1 rupee)
  if (Math.abs(calculatedTotal - this.totalAmount) > 1) {
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
  const validTransitions = {
    'pending': ['confirmed', 'cancelled'],
    'confirmed': ['processing', 'cancelled'],
    'processing': ['shipped', 'cancelled'],
    'shipped': ['delivered', 'cancelled'],
    'delivered': [],
    'cancelled': []
  };

  const allowedStatuses = validTransitions[this.orderStatus];

  if (!allowedStatuses.includes(newStatus)) {
    throw new Error(`Cannot transition from ${this.orderStatus} to ${newStatus}`);
  }

  this.orderStatus = newStatus;
  this.statusHistory.push({
    status: newStatus,
    timestamp: new Date(),
    note: note || `Status updated to ${newStatus}`,
    updatedBy,
    updatedByModel
  });

  return this.save();
};

module.exports = mongoose.model('Order', orderSchema);
