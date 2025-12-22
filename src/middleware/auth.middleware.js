const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Distributor = require('../models/Distributor');
const { AuthenticationError, AuthorizationError } = require('../utils/errors');

const protect = async (req, res, next) => {
  try {
    let token;

    // Check for token in Authorization header (case-insensitive)
    if (req.headers.authorization &&
        req.headers.authorization.toLowerCase().startsWith('bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    // ENHANCEMENT: Also check for token in cookies (for httpOnly cookie support)
    else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    // FIX: Moved inside main logic - was unreachable before
    if (!token) {
      throw new AuthenticationError('Not authorized, no token provided');
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch user based on role with password explicitly excluded
    if (decoded.role === 'distributor') {
      req.user = await Distributor.findById(decoded.id).select('+password').select('-password');
      req.userModel = 'Distributor';
    } else {
      req.user = await User.findById(decoded.id).select('+password').select('-password');
      req.userModel = 'User';
    }

    // Check if user exists
    if (!req.user) {
      throw new AuthenticationError('User no longer exists');
    }

    // SECURITY: Check if user is active
    if (!req.user.isActive) {
      throw new AuthorizationError('Your account has been deactivated');
    }

    // SECURITY: Check if account is locked
    if (req.user.isLocked) {
      throw new AuthorizationError('Your account is temporarily locked due to multiple failed login attempts');
    }

    // SECURITY: Check if distributor is approved (only for distributors)
    if (decoded.role === 'distributor' && !req.user.isApproved) {
      throw new AuthorizationError('Your distributor account is pending approval');
    }

    // SECURITY: Check if password was changed after token was issued
    if (req.user.lastPasswordChange) {
      const passwordChangedAt = parseInt(req.user.lastPasswordChange.getTime() / 1000, 10);
      if (decoded.iat < passwordChangedAt) {
        throw new AuthenticationError('Password was recently changed. Please login again');
      }
    }

    // Add user role to request for easy access
    req.user.role = decoded.role;  // CRITICAL: Set role on req.user object
    req.userRole = decoded.role;

    next();
  } catch (error) {
    // Handle specific JWT errors
    if (error.name === 'JsonWebTokenError') {
      return next(new AuthenticationError('Invalid token'));
    }
    if (error.name === 'TokenExpiredError') {
      return next(new AuthenticationError('Token expired. Please login again'));
    }

    next(error);
  }
};

// ENHANCEMENT: Optional authentication (doesn't throw error if no token)
const optionalAuth = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization &&
        req.headers.authorization.toLowerCase().startsWith('bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return next();  // No token, but that's okay
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role === 'distributor') {
      req.user = await Distributor.findById(decoded.id).select('-password');
    } else {
      req.user = await User.findById(decoded.id).select('-password');
    }

    if (req.user && req.user.isActive) {
      req.user.role = decoded.role;  // Set role on req.user object
      req.userRole = decoded.role;
      req.userModel = decoded.role === 'distributor' ? 'Distributor' : 'User';
    }

    next();
  } catch (error) {
    // If optional auth fails, just continue without user
    next();
  }
};

module.exports = {
  protect,
  optionalAuth
};
