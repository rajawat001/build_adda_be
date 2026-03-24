const mongoose = require('mongoose');

const offlineCustomerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Customer name is required'],
    trim: true,
    maxlength: 100
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    trim: true,
    lowercase: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email']
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    match: [/^[6-9]\d{9}$/, 'Please provide a valid 10-digit Indian phone number']
  },
  address: { type: String, trim: true, default: '' },
  city: { type: String, trim: true, default: '' },
  state: { type: String, trim: true, default: '' },
  pincode: {
    type: String,
    default: '',
    match: [/^(\d{6})?$/, 'Pincode must be 6 digits']
  },

  // Many-to-many: which distributors have used this customer
  distributors: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Distributor'
  }],

  // Auto-linked when email matches a registered User
  linkedUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  // Who created this customer
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Distributor'
  },

  notes: { type: String, trim: true, default: '' }
}, {
  timestamps: true
});

// Indexes for fast lookup
offlineCustomerSchema.index({ phone: 1 });
offlineCustomerSchema.index({ email: 1 }, { sparse: true });
offlineCustomerSchema.index({ distributors: 1 });
offlineCustomerSchema.index({ linkedUser: 1 }, { sparse: true });
offlineCustomerSchema.index({ phone: 1, distributors: 1 });

// Auto-link to User by email on save
offlineCustomerSchema.pre('save', async function(next) {
  if (this.isModified('email') && this.email && !this.linkedUser) {
    try {
      const User = mongoose.model('User');
      const user = await User.findOne({ email: this.email }).select('_id').lean();
      if (user) {
        this.linkedUser = user._id;
      }
    } catch {
      // Don't block save if User lookup fails
    }
  }
  next();
});

const OfflineCustomer = mongoose.model('OfflineCustomer', offlineCustomerSchema);
module.exports = OfflineCustomer;
