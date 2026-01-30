const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const otpSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  otp: {
    type: String,
    required: true
  },
  purpose: {
    type: String,
    required: true,
    enum: ['login', 'register', 'reset-password']
  },
  attempts: {
    type: Number,
    default: 0,
    max: 5
  },
  verified: {
    type: Boolean,
    default: false
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 } // TTL index - auto-delete when expired
  }
}, {
  timestamps: true
});

// Compound index for lookup
otpSchema.index({ email: 1, purpose: 1 });

// Hash OTP before saving
otpSchema.pre('save', async function(next) {
  if (!this.isModified('otp')) return next();
  this.otp = await bcrypt.hash(this.otp, 10);
  next();
});

// Verify OTP
otpSchema.methods.matchOTP = async function(enteredOTP) {
  return bcrypt.compare(enteredOTP, this.otp);
};

const OTP = mongoose.model('OTP', otpSchema);

module.exports = OTP;
