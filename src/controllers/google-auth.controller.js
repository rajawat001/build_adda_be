const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const Distributor = require('../models/Distributor');
const Order = require('../models/Order');
const Role = require('../models/Role');
const authService = require('../services/auth.service');
const asyncHandler = require('../utils/asyncHandler');
const { ValidationError, AuthenticationError } = require('../utils/errors');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Default admin permissions (same as auth.controller.js)
const DEFAULT_ADMIN_PERMISSIONS = [
  'users.view', 'distributors.view', 'products.view', 'orders.view',
  'categories.view', 'coupons.view', 'subscriptions.view', 'reviews.view',
  'contacts.view', 'activityLogs.view', 'emailTemplates.view', 'settings.view'
];

const getCookieOptions = (req) => {
  const isSecure = req?.secure || req?.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: isSecure ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/'
  };
};

// Verify Google ID token and extract payload
const verifyGoogleToken = async (credential) => {
  const ticket = await client.verifyIdToken({
    idToken: credential,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  return ticket.getPayload();
};

// Build the user response (same format as existing login)
const buildUserResponse = async (user, userRole) => {
  let permissions;
  if (userRole === 'admin') {
    if (user.assignedRole) {
      const assignedRole = await Role.findById(user.assignedRole);
      permissions = assignedRole ? assignedRole.permissions : DEFAULT_ADMIN_PERMISSIONS;
    } else {
      permissions = DEFAULT_ADMIN_PERMISSIONS;
    }
  }

  return {
    _id: user._id,
    name: user.name || user.businessName,
    email: user.email,
    phone: user.phone,
    role: userRole,
    emailVerified: true, // Google accounts are email-verified
    isApproved: userRole === 'distributor' ? user.isApproved : true,
    planType: user.planType,
    permissions,
  };
};

// @desc    Google OAuth login/register for users
// @route   POST /api/auth/google
// @access  Public
const googleAuth = asyncHandler(async (req, res) => {
  const { credential } = req.body;

  if (!credential) {
    throw new ValidationError('Google credential is required');
  }

  let payload;
  try {
    payload = await verifyGoogleToken(credential);
  } catch (err) {
    throw new AuthenticationError('Invalid Google token');
  }

  const { sub: googleId, email, name, picture } = payload;

  if (!email) {
    throw new AuthenticationError('Google account does not have an email');
  }

  // 1. Check if user exists by googleId (in User or Distributor)
  let user = await User.findOne({ googleId });
  let userRole = 'user';

  if (!user) {
    const dist = await Distributor.findOne({ googleId });
    if (dist) {
      user = dist;
      userRole = 'distributor';
    }
  }

  // 2. If not found by googleId, check by email
  if (!user) {
    user = await User.findOne({ email: email.toLowerCase() });
    if (user) {
      // Link Google ID to existing account
      user.googleId = googleId;
      if (picture && !user.profileImage) user.profileImage = picture;
      user.emailVerified = true;
      await user.save({ validateModifiedOnly: true });

      const dbRole = (user.role || '').toLowerCase().trim();
      if (dbRole === 'admin' || dbRole.includes('admin')) {
        userRole = 'admin';
      } else {
        userRole = 'user';
      }
    } else {
      // Check Distributor model
      const dist = await Distributor.findOne({ email: email.toLowerCase() });
      if (dist) {
        dist.googleId = googleId;
        if (picture && !dist.profileImage) dist.profileImage = picture;
        dist.emailVerified = true;
        await dist.save({ validateModifiedOnly: true });
        user = dist;
        userRole = 'distributor';
      }
    }
  } else {
    // Found by googleId, determine role
    const dbRole = (user.role || '').toLowerCase().trim();
    if (dbRole === 'admin' || dbRole.includes('admin')) {
      userRole = 'admin';
    } else if (userRole !== 'distributor') {
      userRole = 'user';
    }
  }

  // 3. If user still not found, create a new user account
  if (!user) {
    user = await User.create({
      name: name || email.split('@')[0],
      email: email.toLowerCase(),
      googleId,
      profileImage: picture || null,
      emailVerified: true,
      role: 'user',
    });
    userRole = 'user';

    // Link any guest orders to this new user
    try {
      await Order.updateMany(
        { guestEmail: email.toLowerCase(), user: null },
        { $set: { user: user._id } }
      );
    } catch (e) {
      console.error('Error linking guest orders:', e.message);
    }
  }

  // 4. Check account status
  if (!user.isActive) {
    throw new AuthenticationError('Your account has been deactivated');
  }

  if (user.isLocked) {
    const lockTime = Math.ceil((user.lockUntil - Date.now()) / (1000 * 60));
    throw new AuthenticationError(`Account is locked. Try again in ${lockTime} minutes`);
  }

  // Reset failed attempts on Google login
  if (user.failedLoginAttempts > 0) {
    await user.resetLoginAttempts();
  }

  // 5. Generate JWT and set cookie
  const token = authService.generateToken(user._id, userRole);
  res.cookie('token', token, getCookieOptions(req));

  const needsSubscription = userRole === 'distributor' && !user.isApproved;
  const userData = await buildUserResponse(user, userRole);

  res.json({
    success: true,
    message: 'Login successful',
    user: userData,
    needsSubscription,
    isNewUser: false,
  });
});

// @desc    Google OAuth register as distributor
// @route   POST /api/auth/google/register-distributor
// @access  Public
const googleRegisterDistributor = asyncHandler(async (req, res) => {
  const { credential, businessName, phone, address, city, state, pincode, location } = req.body;

  if (!credential) {
    throw new ValidationError('Google credential is required');
  }
  if (!businessName || !phone || !address || !city || !state || !pincode) {
    throw new ValidationError('All business details are required');
  }

  let payload;
  try {
    payload = await verifyGoogleToken(credential);
  } catch (err) {
    throw new AuthenticationError('Invalid Google token');
  }

  const { sub: googleId, email, name, picture } = payload;

  if (!email) {
    throw new AuthenticationError('Google account does not have an email');
  }

  // Check if email already exists in either collection
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  const existingDist = await Distributor.findOne({ email: email.toLowerCase() });

  if (existingDist) {
    throw new ValidationError('A distributor account with this email already exists. Please login instead.');
  }

  // If user account exists, delete it (they want to be a distributor)
  if (existingUser) {
    // Only allow conversion if the user was created via Google (no orders, etc.)
    const orderCount = await Order.countDocuments({ user: existingUser._id });
    if (orderCount > 0) {
      throw new ValidationError('A user account with this email already has orders. Please contact support to switch to distributor.');
    }
    await User.findByIdAndDelete(existingUser._id);
  }

  // Create distributor
  const distributorData = {
    businessName,
    name: name || email.split('@')[0],
    email: email.toLowerCase(),
    phone,
    address,
    city,
    state,
    pincode,
    googleId,
    profileImage: picture || null,
    emailVerified: true,
    planType: 'none',
  };

  if (location?.coordinates) {
    distributorData.location = {
      type: 'Point',
      coordinates: location.coordinates,
    };
  }

  const distributor = await Distributor.create(distributorData);

  // Generate JWT and set cookie
  const token = authService.generateToken(distributor._id, 'distributor');
  res.cookie('token', token, getCookieOptions(req));

  const userData = await buildUserResponse(distributor, 'distributor');

  res.json({
    success: true,
    message: 'Distributor registration successful',
    user: userData,
    needsSubscription: true,
  });
});

module.exports = { googleAuth, googleRegisterDistributor };
