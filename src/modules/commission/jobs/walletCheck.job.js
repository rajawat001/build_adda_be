const CommissionWallet = require('../models/CommissionWallet');
const Distributor = require('../../../models/Distributor');

/**
 * Check all wallets where limit is exceeded and grace period has expired.
 * Lock distributors whose grace period has passed.
 * Runs every 6 hours via cron.
 */
async function checkAllWallets() {
  try {
    const now = new Date();

    // Find wallets that have exceeded limit, grace has expired, and not yet locked
    const walletsToLock = await CommissionWallet.find({
      isLimitExceeded: true,
      graceExpiresAt: { $lt: now },
      status: { $ne: 'locked' }
    });

    let lockedCount = 0;

    for (const wallet of walletsToLock) {
      await CommissionWallet.findByIdAndUpdate(wallet._id, { status: 'locked' });
      await Distributor.findByIdAndUpdate(wallet.distributor, { isWalletLocked: true });
      lockedCount++;
      console.log(`[WalletCheck] Locked distributor ${wallet.distributor} — balance: ${wallet.balance}`);
    }

    if (lockedCount > 0) {
      console.log(`[WalletCheck] Locked ${lockedCount} distributor(s)`);
    } else {
      console.log('[WalletCheck] No wallets to lock');
    }
  } catch (error) {
    console.error('[WalletCheck] Error:', error.message);
  }
}

module.exports = { checkAllWallets };
