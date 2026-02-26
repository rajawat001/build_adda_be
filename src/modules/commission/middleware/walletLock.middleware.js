const { AuthorizationError } = require('../../../utils/errors');

/**
 * Middleware that blocks wallet-locked distributors from most routes.
 * Allows only wallet/payment/profile endpoints.
 *
 * Note: The primary wallet lock check is in auth.middleware.js.
 * This middleware provides an additional layer for commission-specific routes.
 */
const checkWalletLock = async (req, res, next) => {
  if (req.user && req.user.isWalletLocked) {
    // Allow wallet and payment endpoints
    const allowedPaths = [
      '/api/commission/wallet',
      '/api/commission/payment',
      '/api/commission/transactions',
      '/api/commission/dashboard'
    ];
    const isAllowed = allowedPaths.some(p => req.originalUrl.startsWith(p));

    if (!isAllowed) {
      throw new AuthorizationError('Your account is locked due to unpaid commission. Please clear your dues to continue.');
    }
  }
  next();
};

module.exports = { checkWalletLock };
