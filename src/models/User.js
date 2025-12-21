const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const addressSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    match: [/^[6-9]\d{9}$/, 'Please provide a valid 10-digit Indian phone number']
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
  pincode: {
    type: String,
    required: [true, 'Pincode is required'],
    match: [/^\d{6}$/, 'Please provide a valid 6-digit pincode']
  },
  isDefault: {
    type: Boolean,
    default: false
  }
});

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
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
  role: {
    type: String,
    enum: ['user', 'distributor', 'admin'],
    default: 'user'
  },
  addresses: [addressSchema],
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      default: undefined,  // FIX: Don't default to [0,0], let it be undefined until set
      validate: {
        validator: function(coords) {
          if (!coords || coords.length !== 2) return false;
          const [lng, lat] = coords;
          return lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
        },
        message: 'Invalid coordinates. Longitude must be between -180 and 180, Latitude must be between -90 and 90'
      }
    }
  },
  wishlist: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }],
  cart: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    quantity: {
      type: Number,
      default: 1,
      min: [1, 'Quantity must be at least 1'],
      max: [999, 'Quantity cannot exceed 999']
    }
  }],

  // SECURITY ENHANCEMENTS: Email verification
  emailVerified: {
    type: Boolean,
    default: false
  },
  verificationToken: String,
  verificationTokenExpiry: Date,

  // SECURITY ENHANCEMENTS: Password reset
  resetPasswordToken: String,
  resetPasswordExpiry: Date,

  // SECURITY ENHANCEMENTS: Account security
  failedLoginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: Date,
  lastLogin: Date,
  lastPasswordChange: Date,

  // ADDITIONAL FIELDS
  profileImage: {
    type: String,
    default: null
  },

  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// INDEXES for performance optimization
userSchema.index({ location: '2dsphere' });
userSchema.index({ email: 1 });
userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ 'addresses.pincode': 1 });

// VIRTUAL: Check if account is locked
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// PRE-SAVE MIDDLEWARE: Hash password if modified
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }

  // Use 12 rounds for better security (was 10)
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);

  // Update lastPasswordChange timestamp
  this.lastPasswordChange = Date.now();

  next();
});

// PRE-SAVE MIDDLEWARE: Ensure only one default address
userSchema.pre('save', function(next) {
  if (this.addresses && this.addresses.length > 0) {
    const defaultAddresses = this.addresses.filter(addr => addr.isDefault);
    if (defaultAddresses.length > 1) {
      // Keep first default, set others to false
      let foundFirst = false;
      this.addresses.forEach(addr => {
        if (addr.isDefault) {
          if (foundFirst) {
            addr.isDefault = false;
          }
          foundFirst = true;
        }
      });
    }
  }
  next();
});

// METHOD: Compare password
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// METHOD: Increment failed login attempts
userSchema.methods.incrementLoginAttempts = async function() {
  // If lock has expired, restart count at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $set: { failedLoginAttempts: 1 },
      $unset: { lockUntil: 1 }
    });
  }

  const updates = { $inc: { failedLoginAttempts: 1 } };

  // Lock account after 5 failed attempts for 2 hours
  if (this.failedLoginAttempts + 1 >= 5 && !this.lockUntil) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
  }

  return this.updateOne(updates);
};

// METHOD: Reset failed login attempts
userSchema.methods.resetLoginAttempts = async function() {
  return this.updateOne({
    $set: { failedLoginAttempts: 0, lastLogin: Date.now() },
    $unset: { lockUntil: 1 }
  });
};

// METHOD: Generate password reset token
userSchema.methods.createPasswordResetToken = function() {
  const resetToken = crypto.randomBytes(32).toString('hex');

  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  // Token expires in 10 minutes
  this.resetPasswordExpiry = Date.now() + 10 * 60 * 1000;

  return resetToken;
};

// METHOD: Generate email verification token
userSchema.methods.createVerificationToken = function() {
  const verificationToken = crypto.randomBytes(32).toString('hex');

  this.verificationToken = crypto
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex');

  // Token expires in 24 hours
  this.verificationTokenExpiry = Date.now() + 24 * 60 * 60 * 1000;

  return verificationToken;
};

module.exports = mongoose.model('User', userSchema);
