const CommissionWallet = require('../models/CommissionWallet');
const CommissionTransaction = require('../models/CommissionTransaction');
const CommissionPlan = require('../models/CommissionPlan');
const paymentService = require('../../../services/payment.service');
const { redirectBaseUrl } = require('../../../config/phonepe');
const { unlockWallet } = require('./wallet.service');

/**
 * Initiate a PhonePe payment for commission dues.
 */
async function initiateCommissionPayment(distributorId, amount) {
  const wallet = await CommissionWallet.findOne({ distributor: distributorId })
    .populate('commissionPlan');

  if (!wallet) {
    throw new Error('No commission wallet found');
  }

  const plan = wallet.commissionPlan;

  if (amount < plan.minPaymentAmount) {
    throw new Error(`Minimum payment amount is ₹${plan.minPaymentAmount}`);
  }

  if (amount > wallet.balance) {
    throw new Error('Payment amount cannot exceed wallet balance');
  }

  if (!plan.earlyPaymentAllowed && !wallet.isLimitExceeded) {
    throw new Error('Early payment is not allowed on this plan');
  }

  const merchantOrderId = `COMM_${wallet._id}_${Date.now()}`;
  const redirectUrl = `${redirectBaseUrl}/distributor/commission-payment?merchantOrderId=${merchantOrderId}&type=commission`;

  const phonePeResponse = await paymentService.initiatePayment({
    merchantOrderId,
    amount,
    redirectUrl
  });

  // Create pending transaction
  await CommissionTransaction.create({
    distributor: distributorId,
    wallet: wallet._id,
    type: 'payment',
    amount: -amount,
    balanceAfter: wallet.balance, // will be updated on success
    description: `Commission payment of ₹${amount}`,
    metadata: {
      paymentMethod: 'phonepe',
      phonepeMerchantTransactionId: merchantOrderId
    },
    status: 'pending'
  });

  return {
    paymentUrl: phonePeResponse.redirectUrl,
    merchantOrderId
  };
}

/**
 * Handle successful commission payment from webhook.
 */
async function handleCommissionPaymentSuccess(merchantOrderId, transactionId) {
  const transaction = await CommissionTransaction.findOne({
    'metadata.phonepeMerchantTransactionId': merchantOrderId,
    type: 'payment'
  });

  if (!transaction) {
    console.error(`[CommPayment] Transaction not found for ${merchantOrderId}`);
    return;
  }

  // Idempotent check
  if (transaction.status === 'completed') {
    console.log(`[CommPayment] Already processed ${merchantOrderId}, skipping`);
    return;
  }

  const paymentAmount = Math.abs(transaction.amount);

  // Atomic decrement wallet balance
  const updatedWallet = await CommissionWallet.findByIdAndUpdate(
    transaction.wallet,
    {
      $inc: {
        balance: -paymentAmount,
        totalCommissionPaid: paymentAmount
      },
      $set: { lastPaymentDate: new Date() }
    },
    { new: true }
  );

  // Update transaction
  await CommissionTransaction.findByIdAndUpdate(transaction._id, {
    status: 'completed',
    balanceAfter: updatedWallet.balance,
    'metadata.phonepeTransactionId': transactionId
  });

  // Check if balance dropped below limit — unlock if needed
  const plan = await CommissionPlan.findById(updatedWallet.commissionPlan);
  if (plan && updatedWallet.balance < plan.walletLimit) {
    await unlockWallet(transaction.distributor);
  }

  console.log(`[CommPayment] Payment of ₹${paymentAmount} processed for ${merchantOrderId}, new balance: ${updatedWallet.balance}`);
}

/**
 * Handle failed commission payment from webhook.
 */
async function handleCommissionPaymentFailure(merchantOrderId) {
  await CommissionTransaction.findOneAndUpdate(
    { 'metadata.phonepeMerchantTransactionId': merchantOrderId, type: 'payment' },
    { status: 'failed' }
  );
  console.log(`[CommPayment] Payment failed for ${merchantOrderId}`);
}

/**
 * Check payment status via PhonePe API.
 */
async function checkCommissionPaymentStatus(merchantOrderId) {
  const statusResponse = await paymentService.checkPaymentStatus(merchantOrderId);
  return statusResponse;
}

module.exports = {
  initiateCommissionPayment,
  handleCommissionPaymentSuccess,
  handleCommissionPaymentFailure,
  checkCommissionPaymentStatus
};
