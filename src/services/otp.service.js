const crypto = require('crypto');
const OTP = require('../models/OTP');

const OTP_EXPIRY_MINUTES = 10;
const MAX_ATTEMPTS = 5;

/**
 * Generate a 6-digit OTP
 */
const generateOTP = () => {
  return crypto.randomInt(100000, 999999).toString();
};

/**
 * Store OTP in database (invalidates any previous OTP for same email+purpose)
 */
const storeOTP = async (email, otp, purpose) => {
  // Delete any existing OTP for this email and purpose
  await OTP.deleteMany({ email: email.toLowerCase(), purpose });

  // Create new OTP record
  const otpRecord = await OTP.create({
    email: email.toLowerCase(),
    otp, // Will be hashed by pre-save hook
    purpose,
    expiresAt: new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000)
  });

  return otpRecord;
};

/**
 * Verify OTP
 * Returns { valid: true } on success, { valid: false, reason: string } on failure
 */
const verifyOTP = async (email, enteredOTP, purpose) => {
  const otpRecord = await OTP.findOne({
    email: email.toLowerCase(),
    purpose,
    expiresAt: { $gt: new Date() }
  });

  if (!otpRecord) {
    return { valid: false, reason: 'OTP has expired or does not exist. Please request a new one.' };
  }

  if (otpRecord.attempts >= MAX_ATTEMPTS) {
    await OTP.deleteOne({ _id: otpRecord._id });
    return { valid: false, reason: 'Too many failed attempts. Please request a new OTP.' };
  }

  const isMatch = await otpRecord.matchOTP(enteredOTP);

  if (!isMatch) {
    otpRecord.attempts += 1;
    await otpRecord.save();
    const remaining = MAX_ATTEMPTS - otpRecord.attempts;
    return { valid: false, reason: `Invalid OTP. ${remaining} attempt(s) remaining.` };
  }

  // Mark as verified (for reset-password flow where we need a verified state)
  otpRecord.verified = true;
  await otpRecord.save();

  return { valid: true };
};

/**
 * Check if OTP was verified (for multi-step flows like password reset)
 */
const isOTPVerified = async (email, purpose) => {
  const otpRecord = await OTP.findOne({
    email: email.toLowerCase(),
    purpose,
    verified: true,
    expiresAt: { $gt: new Date() }
  });

  return !!otpRecord;
};

/**
 * Consume (delete) a verified OTP after use
 */
const consumeOTP = async (email, purpose) => {
  await OTP.deleteMany({ email: email.toLowerCase(), purpose });
};

/**
 * Check if an OTP was recently sent (rate limiting)
 */
const canResendOTP = async (email, purpose) => {
  const recentOTP = await OTP.findOne({
    email: email.toLowerCase(),
    purpose,
    createdAt: { $gt: new Date(Date.now() - 60 * 1000) } // Within last 60 seconds
  });

  return !recentOTP;
};

module.exports = {
  generateOTP,
  storeOTP,
  verifyOTP,
  isOTPVerified,
  consumeOTP,
  canResendOTP
};
