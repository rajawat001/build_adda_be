const CommissionWallet = require('../models/CommissionWallet');
const CommissionTransaction = require('../models/CommissionTransaction');
const CommissionPlan = require('../models/CommissionPlan');
const Distributor = require('../../../models/Distributor');

/**
 * Get existing wallet or create a new one for a distributor.
 */
async function getOrCreateWallet(distributorId, planId) {
  let wallet = await CommissionWallet.findOne({ distributor: distributorId });
  if (wallet) return wallet;

  wallet = await CommissionWallet.create({
    distributor: distributorId,
    commissionPlan: planId,
    balance: 0,
    totalCommissionCharged: 0,
    totalCommissionPaid: 0,
    totalOrders: 0,
    status: 'active'
  });

  return wallet;
}

/**
 * Get wallet details with recent transactions for a distributor.
 */
async function getWalletDetails(distributorId) {
  const wallet = await CommissionWallet.findOne({ distributor: distributorId })
    .populate('commissionPlan');

  if (!wallet) return null;

  const recentTransactions = await CommissionTransaction.find({ wallet: wallet._id })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  return {
    ...wallet.toObject(),
    recentTransactions
  };
}

/**
 * Check a single wallet and lock the distributor if grace period has expired.
 */
async function checkAndLockWallet(walletId) {
  const wallet = await CommissionWallet.findById(walletId);
  if (!wallet) return;

  if (!wallet.isLimitExceeded || wallet.status === 'locked') return;

  if (wallet.graceExpiresAt && wallet.graceExpiresAt < new Date()) {
    // Grace period expired — lock
    await CommissionWallet.findByIdAndUpdate(walletId, { status: 'locked' });
    await Distributor.findByIdAndUpdate(wallet.distributor, { isWalletLocked: true });
    console.log(`[Wallet] Distributor ${wallet.distributor} locked — grace period expired`);
  }
}

/**
 * Unlock a distributor's wallet after payment brings balance below limit.
 */
async function unlockWallet(distributorId) {
  const wallet = await CommissionWallet.findOne({ distributor: distributorId });
  if (!wallet) return;

  await CommissionWallet.findByIdAndUpdate(wallet._id, {
    status: 'active',
    isLimitExceeded: false,
    limitReachedAt: null,
    graceExpiresAt: null
  });

  await Distributor.findByIdAndUpdate(distributorId, { isWalletLocked: false });
  console.log(`[Wallet] Distributor ${distributorId} unlocked`);
}

module.exports = {
  getOrCreateWallet,
  getWalletDetails,
  checkAndLockWallet,
  unlockWallet
};
