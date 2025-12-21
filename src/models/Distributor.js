const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const distributorSchema = new mongoose.Schema({
  businessName: {
    type: String,
    required: [true, 'Business name is required'],
    trim: true,
    minlength: [2, 'Business name must be at least 2 characters'],
    maxlength: [200, 'Business name cannot exceed 200 characters']
  },
  name: {
    type: String,
    required: [true, 'Contact person name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false  // SECURITY FIX: Password never returned in queries by default
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    match: [/^[6-9]\d{9}$/, 'Please provide a valid 10-digit Indian phone number']
  },
  pincode: {
    type: String,
    required: [true, 'Pincode is required'],
    match: [/^\d{6}$/, 'Please provide a valid 6-digit pincode']
  },
  address: {
    type: String,
    required: [true, 'Address is required'],
    minlength: [10, 'Address must be at least 10 characters']
  },
  city: {
    type: String,
    required: [true, 'City is required']
  },
  state: {
    type: String,
    required: [true, 'State is required']
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      default: undefined,  // FIX: Don't default to [0,0]
      validate: {
        validator: function(coords) {
          if (!coords || coords.length !== 2) return false;
          const [lng, lat] = coords;
          return lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
        },
        message: 'Invalid coordinates'
      }
    }
  },

  // Business Details
  gstNumber: {
    type: String,
    sparse: true,
    match: [/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Please provide a valid GST number']
  },
  businessLicense: String,

  // Bank Details for settlements
  bankAccountNumber: String,
  bankIFSC: {
    type: String,
    match: [/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Please provide a valid IFSC code']
  },
  accountHolderName: String,

  // Service area
  serviceRadius: {
    type: Number,
    default: 10,  // in kilometers
    min: [1, 'Service radius must be at least 1 km'],
    max: [100, 'Service radius cannot exceed 100 km']
  },

  // Commission
  commission: {
    type: Number,
    default: 10,  // percentage
    min: [0, 'Commission cannot be negative'],
    max: [100, 'Commission cannot exceed 100%']
  },

  // Rating system
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  reviewCount: {
    type: Number,
    default: 0,
    min: 0
  },

  role: {
    type: String,
    default: 'distributor',
    immutable: true  // Cannot be changed
  },

  // Approval workflow
  isApproved: {
    type: Boolean,
    default: false
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: Date,
  rejectionReason: String,

  // Verification
  emailVerified: {
    type: Boolean,
    default: false
  },
  phoneVerified: {
    type: Boolean,
    default: false
  },
  verificationToken: String,
  verificationTokenExpiry: Date,

  // Security
  resetPasswordToken: String,
  resetPasswordExpiry: Date,
  failedLoginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: Date,
  lastLogin: Date,
  lastPasswordChange: Date,

  // Document uploads
  documents: [{
    type: {
      type: String,
      enum: ['business_license', 'gst_certificate', 'id_proof', 'address_proof', 'other']
    },
    url: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Profile
  profileImage: String,
  description: {
    type: String,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },

  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// INDEXES for performance optimization
distributorSchema.index({ location: '2dsphere' });
distributorSchema.index({ email: 1 });
distributorSchema.index({ isApproved: 1, isActive: 1 });
distributorSchema.index({ pincode: 1 });
distributorSchema.index({ rating: -1 });

// VIRTUAL: Check if account is locked
distributorSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// PRE-SAVE MIDDLEWARE: Hash password if modified
distributorSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }

  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  this.lastPasswordChange = Date.now();

  next();
});

// METHOD: Compare password
distributorSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// METHOD: Increment failed login attempts
distributorSchema.methods.incrementLoginAttempts = async function() {
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $set: { failedLoginAttempts: 1 },
      $unset: { lockUntil: 1 }
    });
  }

  const updates = { $inc: { failedLoginAttempts: 1 } };

  if (this.failedLoginAttempts + 1 >= 5 && !this.lockUntil) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 };
  }

  return this.updateOne(updates);
};

// METHOD: Reset failed login attempts
distributorSchema.methods.resetLoginAttempts = async function() {
  return this.updateOne({
    $set: { failedLoginAttempts: 0, lastLogin: Date.now() },
    $unset: { lockUntil: 1 }
  });
};

// METHOD: Generate password reset token
distributorSchema.methods.createPasswordResetToken = function() {
  const resetToken = crypto.randomBytes(32).toString('hex');

  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  this.resetPasswordExpiry = Date.now() + 10 * 60 * 1000;

  return resetToken;
};

// METHOD: Generate email verification token
distributorSchema.methods.createVerificationToken = function() {
  const verificationToken = crypto.randomBytes(32).toString('hex');

  this.verificationToken = crypto
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex');

  this.verificationTokenExpiry = Date.now() + 24 * 60 * 60 * 1000;

  return verificationToken;
};

// METHOD: Update rating
distributorSchema.methods.updateRating = async function(newRating) {
  const totalRating = this.rating * this.reviewCount + newRating;
  this.reviewCount += 1;
  this.rating = totalRating / this.reviewCount;
  return this.save();
};

module.exports = mongoose.model('Distributor', distributorSchema);
