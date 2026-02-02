const paymentService = require('../services/payment.service');
const Order = require('../models/Order');
const Subscription = require('../models/Subscription');
const Coupon = require('../models/Coupon');
const Distributor = require('../models/Distributor');
const User = require('../models/User');
const emailService = require('../services/email.service');

const approveDistributorAfterSubscription = async (distributorId) => {
  try {
    await Distributor.findByIdAndUpdate(distributorId, {
      isApproved: true,
      approvedAt: new Date()
    });
    console.log(`Distributor ${distributorId} auto-approved after subscription`);
  } catch (error) {
    console.error('Error auto-approving distributor:', error);
  }
};

/**
 * PhonePe webhook handler (server-to-server callback)
 * No auth middleware — PhonePe calls this directly
 * Always returns 200 to prevent retries
 */
exports.handlePhonepeWebhook = async (req, res) => {
  try {
    const xVerifyHeader = req.headers['x-verify'];
    const base64Response = req.body.response;

    if (!xVerifyHeader || !base64Response) {
      console.error('Webhook: Missing x-verify header or response body');
      return res.status(200).json({ success: false, message: 'Missing data' });
    }

    // Verify checksum
    const isValid = paymentService.verifyWebhookChecksum(xVerifyHeader, base64Response);
    if (!isValid) {
      console.error('Webhook: Invalid checksum');
      return res.status(200).json({ success: false, message: 'Invalid checksum' });
    }

    // Decode payload
    const decodedPayload = JSON.parse(Buffer.from(base64Response, 'base64').toString('utf-8'));
    const { merchantTransactionId, transactionId, code, paymentInstrument } = decodedPayload.data || {};
    const isSuccess = code === 'PAYMENT_SUCCESS';

    console.log(`Webhook received: txnId=${merchantTransactionId}, code=${code}`);

    // Route by prefix
    if (merchantTransactionId && merchantTransactionId.startsWith('ORDER_')) {
      await handleOrderWebhook(merchantTransactionId, transactionId, isSuccess, paymentInstrument);
    } else if (merchantTransactionId && merchantTransactionId.startsWith('SUB_')) {
      await handleSubscriptionWebhook(merchantTransactionId, transactionId, isSuccess);
    } else {
      console.warn('Webhook: Unknown merchantTransactionId prefix:', merchantTransactionId);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(200).json({ success: false, message: 'Internal error' });
  }
};

async function handleOrderWebhook(merchantTransactionId, transactionId, isSuccess, paymentInstrument) {
  const order = await Order.findOne({ phonepeMerchantTransactionId: merchantTransactionId });
  if (!order) {
    console.error('Webhook: Order not found for', merchantTransactionId);
    return;
  }

  // Idempotent: skip if already paid
  if (order.paymentStatus === 'paid') {
    console.log('Webhook: Order already paid, skipping', merchantTransactionId);
    return;
  }

  if (isSuccess) {
    order.phonepeTransactionId = transactionId;
    order.phonepePaymentInstrument = paymentInstrument?.type || '';
    order.paymentStatus = 'paid';
    order.orderStatus = 'confirmed';
    await order.save();

    // Send payment confirmation email
    const user = await User.findById(order.user);
    if (user) {
      emailService.sendPaymentConfirmationEmail(order, user.name || 'Customer', user.email);
    }
  } else {
    order.paymentStatus = 'failed';
    await order.save();
  }
}

async function handleSubscriptionWebhook(merchantTransactionId, transactionId, isSuccess) {
  const subscription = await Subscription.findOne({ phonepeMerchantTransactionId: merchantTransactionId });
  if (!subscription) {
    console.error('Webhook: Subscription not found for', merchantTransactionId);
    return;
  }

  // Idempotent: skip if already paid
  if (subscription.paymentStatus === 'paid') {
    console.log('Webhook: Subscription already paid, skipping', merchantTransactionId);
    return;
  }

  if (isSuccess) {
    subscription.phonepeTransactionId = transactionId;
    subscription.status = 'active';
    subscription.paymentStatus = 'paid';
    await subscription.save();

    // Increment coupon usage
    if (subscription.couponApplied) {
      await Coupon.findByIdAndUpdate(subscription.couponApplied, { $inc: { usedCount: 1 } });
    }

    // Auto-approve distributor
    await approveDistributorAfterSubscription(subscription.distributor);
  } else {
    subscription.paymentStatus = 'failed';
    await subscription.save();
  }
}

module.exports = exports;
