const CommissionPlan = require('../models/CommissionPlan');
const CommissionWallet = require('../models/CommissionWallet');
const CommissionTransaction = require('../models/CommissionTransaction');
const Order = require('../../../models/Order');
const Distributor = require('../../../models/Distributor');

/**
 * Calculate commission amount for an order based on plan type.
 */
function getCommissionForOrder(order, plan) {
  if (plan.type === 'percentage') {
    return Math.round((order.totalAmount * plan.value / 100) * 100) / 100;
  }
  // fixed amount per order
  return plan.value;
}

/**
 * Charge commission when an order is delivered.
 * Idempotent: skips if commission already charged for this order.
 */
async function chargeCommission(orderId) {
  const order = await Order.findById(orderId);
  if (!order) {
    console.error(`[Commission] Order ${orderId} not found`);
    return null;
  }

  // Check if already charged (idempotent)
  const existing = await CommissionTransaction.findOne({
    order: orderId,
    type: 'commission_charge',
    status: 'completed'
  });
  if (existing) {
    console.log(`[Commission] Already charged for order ${orderId}, skipping`);
    return existing;
  }

  const distributor = await Distributor.findById(order.distributor);
  if (!distributor || distributor.planType !== 'commission') {
    return null;
  }

  const wallet = await CommissionWallet.findOne({ distributor: distributor._id });
  if (!wallet) {
    console.error(`[Commission] No wallet found for distributor ${distributor._id}`);
    return null;
  }

  const plan = await CommissionPlan.findById(wallet.commissionPlan);
  if (!plan) {
    console.error(`[Commission] Plan not found for wallet ${wallet._id}`);
    return null;
  }

  const commissionAmount = getCommissionForOrder(order, plan);

  // Atomic update on wallet balance
  const updatedWallet = await CommissionWallet.findByIdAndUpdate(
    wallet._id,
    {
      $inc: {
        balance: commissionAmount,
        totalCommissionCharged: commissionAmount,
        totalOrders: 1
      }
    },
    { new: true }
  );

  // Create transaction record
  const transaction = await CommissionTransaction.create({
    distributor: distributor._id,
    wallet: wallet._id,
    type: 'commission_charge',
    amount: commissionAmount,
    balanceAfter: updatedWallet.balance,
    order: orderId,
    description: `Commission for order #${order.orderNumber}`,
    metadata: {
      orderNumber: order.orderNumber,
      orderAmount: order.totalAmount,
      commissionRate: plan.value,
      commissionType: plan.type
    },
    status: 'completed'
  });

  // Check if balance crossed wallet limit
  if (updatedWallet.balance >= plan.walletLimit && !updatedWallet.isLimitExceeded) {
    const graceExpiresAt = new Date();
    graceExpiresAt.setDate(graceExpiresAt.getDate() + plan.gracePeriodDays);

    await CommissionWallet.findByIdAndUpdate(wallet._id, {
      isLimitExceeded: true,
      limitReachedAt: new Date(),
      graceExpiresAt
    });

    console.log(`[Commission] Wallet limit reached for distributor ${distributor._id}, grace expires at ${graceExpiresAt}`);
  }

  return transaction;
}

/**
 * Reverse commission when a delivered order is cancelled/refunded.
 */
async function reverseCommission(orderId) {
  // Find the original charge transaction
  const chargeTransaction = await CommissionTransaction.findOne({
    order: orderId,
    type: 'commission_charge',
    status: 'completed'
  });

  if (!chargeTransaction) {
    console.log(`[Commission] No charge found for order ${orderId}, nothing to reverse`);
    return null;
  }

  // Check if already reversed
  const existingReversal = await CommissionTransaction.findOne({
    order: orderId,
    type: 'reversal',
    status: 'completed'
  });
  if (existingReversal) {
    console.log(`[Commission] Already reversed for order ${orderId}, skipping`);
    return existingReversal;
  }

  const wallet = await CommissionWallet.findById(chargeTransaction.wallet);
  if (!wallet) return null;

  const plan = await CommissionPlan.findById(wallet.commissionPlan);

  // Atomic decrement
  const updatedWallet = await CommissionWallet.findByIdAndUpdate(
    wallet._id,
    {
      $inc: {
        balance: -chargeTransaction.amount,
        totalCommissionCharged: -chargeTransaction.amount,
        totalOrders: -1
      }
    },
    { new: true }
  );

  const transaction = await CommissionTransaction.create({
    distributor: chargeTransaction.distributor,
    wallet: wallet._id,
    type: 'reversal',
    amount: -chargeTransaction.amount,
    balanceAfter: updatedWallet.balance,
    order: orderId,
    description: `Commission reversal for order #${chargeTransaction.metadata.orderNumber}`,
    metadata: {
      orderNumber: chargeTransaction.metadata.orderNumber,
      orderAmount: chargeTransaction.metadata.orderAmount,
      commissionRate: chargeTransaction.metadata.commissionRate,
      commissionType: chargeTransaction.metadata.commissionType
    },
    status: 'completed'
  });

  // If balance dropped below limit, clear limit flags and unlock
  if (plan && updatedWallet.balance < plan.walletLimit && updatedWallet.isLimitExceeded) {
    await CommissionWallet.findByIdAndUpdate(wallet._id, {
      isLimitExceeded: false,
      limitReachedAt: null,
      graceExpiresAt: null
    });

    // Unlock distributor if locked
    if (updatedWallet.status === 'locked') {
      await CommissionWallet.findByIdAndUpdate(wallet._id, { status: 'active' });
      await Distributor.findByIdAndUpdate(chargeTransaction.distributor, { isWalletLocked: false });
      console.log(`[Commission] Distributor ${chargeTransaction.distributor} unlocked after reversal`);
    }
  }

  return transaction;
}

module.exports = {
  chargeCommission,
  reverseCommission,
  getCommissionForOrder
};
