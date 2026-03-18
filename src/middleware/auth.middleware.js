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

    // Fetch user based on role — select only fields needed for auth checks
    const authFields = 'name businessName email role phone isActive assignedRole isLocked failedLoginAttempts lastPasswordChange isApproved planType isWalletLocked';
    if (decoded.role === 'distributor') {
      req.user = await Distributor.findById(decoded.id).select(authFields).lean();
      req.userModel = 'Distributor';
    } else {
      req.user = await User.findById(decoded.id).select(authFields).lean();
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
    // Allow non-approved distributors to access subscription, commission, and profile endpoints
    if (decoded.role === 'distributor' && !req.user.isApproved) {
      const allowedPaths = [
        '/api/subscriptions',
        '/api/commission',
        '/api/auth/profile',
        '/api/auth/logout'
      ];
      const isAllowedPath = allowedPaths.some(path => req.originalUrl.startsWith(path));

      if (!isAllowedPath) {
        throw new AuthorizationError('Your distributor account is pending approval. Please purchase a subscription or select a commission plan to activate your account.');
      }
    }

    // SECURITY: Check if distributor wallet is locked (commission plan only)
    if (decoded.role === 'distributor' && req.user.isWalletLocked) {
      const allowedWalletLockedPaths = [
        '/api/commission/wallet',
        '/api/commission/payment',
        '/api/commission/transactions',
        '/api/commission/dashboard',
        '/api/auth/profile',
        '/api/auth/logout'
      ];
      const isWalletAllowed = allowedWalletLockedPaths.some(p => req.originalUrl.startsWith(p));
      if (!isWalletAllowed) {
        throw new AuthorizationError('Your account is locked due to unpaid commission. Please clear your dues to continue.');
      }
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
      req.user = await Distributor.findById(decoded.id).select('-password').lean();
    } else {
      req.user = await User.findById(decoded.id).select('-password').lean();
    }

    if (req.user && req.user.isActive) {
      req.user.role = decoded.role;
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
