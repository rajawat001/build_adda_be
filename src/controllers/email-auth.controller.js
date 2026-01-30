const User = require('../models/User');
const Distributor = require('../models/Distributor');
const authService = require('../services/auth.service');
const otpService = require('../services/otp.service');
const emailService = require('../services/email.service');
const asyncHandler = require('../utils/asyncHandler');
const { ValidationError, AuthenticationError, NotFoundError } = require('../utils/errors');

// Cookie options based on environment
const getCookieOptions = (req) => {
  const isSecure = req?.secure || req?.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: isSecure ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/'
  };
};

// Helper: find user in both collections
const findUserByEmail = async (email) => {
  let user = await User.findOne({ email: email.toLowerCase() });
  let role = 'user';

  if (!user) {
    user = await Distributor.findOne({ email: email.toLowerCase() });
    role = 'distributor';
  } else {
    role = user.role || 'user';
  }

  return { user, role };
};

// @desc    Send OTP for login
// @route   POST /api/auth/otp/send-login
// @access  Public
const sendLoginOTP = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    throw new ValidationError('Email is required');
  }

  const { user, role } = await findUserByEmail(email);

  if (!user) {
    throw new NotFoundError('No account found with this email');
  }

  if (!user.isActive) {
    throw new AuthenticationError('Your account has been deactivated');
  }

  if (role === 'distributor' && !user.isApproved) {
    throw new AuthenticationError('Your distributor account is pending approval');
  }

  // Check rate limit
  const canResend = await otpService.canResendOTP(email, 'login');
  if (!canResend) {
    throw new ValidationError('Please wait 60 seconds before requesting a new OTP');
  }

  const otp = otpService.generateOTP();
  await otpService.storeOTP(email, otp, 'login');
  await emailService.sendOTPEmail(email, otp, 'login', user.name || user.businessName);

  res.json({
    success: true,
    message: 'OTP sent to your email address'
  });
});

// @desc    Verify OTP and login
// @route   POST /api/auth/otp/verify-login
// @access  Public
const verifyLoginOTP = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    throw new ValidationError('Email and OTP are required');
  }

  const { user, role } = await findUserByEmail(email);

  if (!user) {
    throw new NotFoundError('No account found with this email');
  }

  const result = await otpService.verifyOTP(email, otp, 'login');

  if (!result.valid) {
    throw new AuthenticationError(result.reason);
  }

  // Consume OTP after successful verification
  await otpService.consumeOTP(email, 'login');

  // Reset failed login attempts
  if (user.resetLoginAttempts) {
    await user.resetLoginAttempts();
  }

  // Generate token
  const token = authService.generateToken(user._id, role);

  // Set httpOnly cookie
  res.cookie('token', token, getCookieOptions(req));

  res.json({
    success: true,
    message: 'Login successful',
    user: {
      _id: user._id,
      name: user.name || user.businessName,
      email: user.email,
      phone: user.phone,
      role,
      emailVerified: user.emailVerified
    }
  });
});

// @desc    Send OTP for registration email verification
// @route   POST /api/auth/otp/send-register
// @access  Public
const sendRegisterOTP = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    throw new ValidationError('Email is required');
  }

  // Check if email already exists
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  const existingDistributor = await Distributor.findOne({ email: email.toLowerCase() });

  if (existingUser || existingDistributor) {
    throw new ValidationError('An account with this email already exists');
  }

  // Check rate limit
  const canResend = await otpService.canResendOTP(email, 'register');
  if (!canResend) {
    throw new ValidationError('Please wait 60 seconds before requesting a new OTP');
  }

  const otp = otpService.generateOTP();
  await otpService.storeOTP(email, otp, 'register');
  await emailService.sendOTPEmail(email, otp, 'register');

  res.json({
    success: true,
    message: 'Verification OTP sent to your email'
  });
});

// @desc    Verify OTP and complete registration
// @route   POST /api/auth/otp/verify-register
// @access  Public
const verifyRegisterOTP = asyncHandler(async (req, res) => {
  const { email, otp, name, password, phone, role, businessName, pincode, address, city, state, location } = req.body;

  if (!email || !otp) {
    throw new ValidationError('Email and OTP are required');
  }

  if (!name || !password || !phone) {
    throw new ValidationError('Name, password and phone are required');
  }

  // Verify OTP
  const result = await otpService.verifyOTP(email, otp, 'register');

  if (!result.valid) {
    throw new AuthenticationError(result.reason);
  }

  // Check if email already taken (race condition check)
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  const existingDistributor = await Distributor.findOne({ email: email.toLowerCase() });

  if (existingUser || existingDistributor) {
    throw new ValidationError('An account with this email already exists');
  }

  let user;

  if (role === 'distributor') {
    user = await Distributor.create({
      businessName: businessName || name,
      name,
      email,
      password,
      phone,
      pincode,
      address,
      city,
      state,
      location,
      emailVerified: true,
      isApproved: false
    });
  } else {
    const userData = {
      name,
      email,
      password,
      phone,
      location,
      role: 'user',
      emailVerified: true
    };

    // If address fields provided, save as first default address
    if (address && city && state && pincode) {
      userData.addresses = [{
        fullName: name,
        phone,
        address,
        city,
        state,
        pincode,
        isDefault: true
      }];
    }

    user = await User.create(userData);
  }

  // Consume OTP
  await otpService.consumeOTP(email, 'register');

  // Generate token
  const userRole = role === 'distributor' ? 'distributor' : 'user';
  const token = authService.generateToken(user._id, userRole);

  // Set httpOnly cookie
  res.cookie('token', token, getCookieOptions(req));

  // Send welcome email (non-blocking)
  emailService.sendWelcomeEmail(user, userRole);

  res.status(201).json({
    success: true,
    message: 'Registration successful',
    user: {
      _id: user._id,
      name: user.name || user.businessName,
      email: user.email,
      phone: user.phone,
      role: userRole
    }
  });
});

// @desc    Send OTP for password reset
// @route   POST /api/auth/otp/send-reset
// @access  Public
const sendResetPasswordOTP = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    throw new ValidationError('Email is required');
  }

  const { user } = await findUserByEmail(email);

  if (!user) {
    // Don't reveal if email exists or not for security
    res.json({
      success: true,
      message: 'If an account exists with this email, an OTP has been sent'
    });
    return;
  }

  // Check rate limit
  const canResend = await otpService.canResendOTP(email, 'reset-password');
  if (!canResend) {
    throw new ValidationError('Please wait 60 seconds before requesting a new OTP');
  }

  const otp = otpService.generateOTP();
  await otpService.storeOTP(email, otp, 'reset-password');
  await emailService.sendOTPEmail(email, otp, 'reset-password', user.name || user.businessName);

  res.json({
    success: true,
    message: 'If an account exists with this email, an OTP has been sent'
  });
});

// @desc    Verify reset password OTP
// @route   POST /api/auth/otp/verify-reset
// @access  Public
const verifyResetPasswordOTP = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    throw new ValidationError('Email and OTP are required');
  }

  const result = await otpService.verifyOTP(email, otp, 'reset-password');

  if (!result.valid) {
    throw new AuthenticationError(result.reason);
  }

  // OTP is now marked as verified in DB
  res.json({
    success: true,
    message: 'OTP verified successfully. You can now set a new password.'
  });
});

// @desc    Reset password after OTP verification
// @route   POST /api/auth/otp/reset-password
// @access  Public
const resetPasswordWithOTP = asyncHandler(async (req, res) => {
  const { email, newPassword } = req.body;

  if (!email || !newPassword) {
    throw new ValidationError('Email and new password are required');
  }

  // Password strength validation
  if (newPassword.length < 8) {
    throw new ValidationError('Password must be at least 8 characters');
  }

  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/.test(newPassword)) {
    throw new ValidationError('Password must contain uppercase, lowercase, number, and special character');
  }

  // Check if OTP was verified
  const isVerified = await otpService.isOTPVerified(email, 'reset-password');

  if (!isVerified) {
    throw new AuthenticationError('Please verify your OTP first');
  }

  const { user, role } = await findUserByEmail(email);

  if (!user) {
    throw new NotFoundError('No account found with this email');
  }

  // Get user with password field for updating
  let userWithPassword;
  if (role === 'distributor') {
    userWithPassword = await Distributor.findById(user._id).select('+password');
  } else {
    userWithPassword = await User.findById(user._id).select('+password');
  }

  userWithPassword.password = newPassword;
  await userWithPassword.save();

  // Consume OTP
  await otpService.consumeOTP(email, 'reset-password');

  res.json({
    success: true,
    message: 'Password reset successful. You can now login with your new password.'
  });
});

// @desc    Resend OTP
// @route   POST /api/auth/otp/resend
// @access  Public
const resendOTP = asyncHandler(async (req, res) => {
  const { email, purpose } = req.body;

  if (!email || !purpose) {
    throw new ValidationError('Email and purpose are required');
  }

  const validPurposes = ['login', 'register', 'reset-password'];
  if (!validPurposes.includes(purpose)) {
    throw new ValidationError('Invalid purpose');
  }

  // Check rate limit
  const canResend = await otpService.canResendOTP(email, purpose);
  if (!canResend) {
    throw new ValidationError('Please wait 60 seconds before requesting a new OTP');
  }

  // For login and reset, verify user exists
  if (purpose !== 'register') {
    const { user } = await findUserByEmail(email);
    if (!user) {
      // Don't reveal account existence
      res.json({ success: true, message: 'If an account exists, a new OTP has been sent' });
      return;
    }
  }

  const otp = otpService.generateOTP();
  await otpService.storeOTP(email, otp, purpose);

  let userName = '';
  if (purpose !== 'register') {
    const { user } = await findUserByEmail(email);
    if (user) {
      userName = user.name || user.businessName || '';
    }
  }

  await emailService.sendOTPEmail(email, otp, purpose, userName);

  res.json({
    success: true,
    message: 'A new OTP has been sent to your email'
  });
});

module.exports = {
  sendLoginOTP,
  verifyLoginOTP,
  sendRegisterOTP,
  verifyRegisterOTP,
  sendResetPasswordOTP,
  verifyResetPasswordOTP,
  resetPasswordWithOTP,
  resendOTP
};
