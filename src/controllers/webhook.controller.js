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
 * PhonePe v2 webhook handler (server-to-server callback)
 * No auth middleware — PhonePe calls this directly
 *
 * v2 webhook format:
 * {
 *   "event": "checkout.order.completed" | "checkout.order.failed" | "pg.refund.completed",
 *   "payload": {
 *     "merchantOrderId": "...",
 *     "orderId": "...",  // PhonePe's order ID
 *     "state": "COMPLETED" | "FAILED",
 *     "amount": 1000,
 *     "paymentDetails": [{ paymentMode, transactionId, ... }]
 *   }
 * }
 */
exports.handlePhonepeWebhook = async (req, res) => {
  try {
    // Verify webhook auth (SHA256 of username:password)
    const authHeader = req.headers['authorization'];
    const isValid = paymentService.verifyWebhookAuth(authHeader);
    if (!isValid) {
      console.error('Webhook: Invalid authorization header');
      return res.status(200).json({ success: false, message: 'Invalid auth' });
    }

    const { event, payload } = req.body;

    if (!event || !payload) {
      console.error('Webhook: Missing event or payload');
      return res.status(200).json({ success: false, message: 'Missing data' });
    }

    const { merchantOrderId, state, paymentDetails } = payload;
    console.log(`Webhook received: event=${event}, merchantOrderId=${merchantOrderId}, state=${state}`);

    // Extract transaction details from paymentDetails array
    const firstPayment = paymentDetails && paymentDetails.length > 0 ? paymentDetails[0] : {};
    const transactionId = firstPayment.transactionId || '';
    const paymentMode = firstPayment.paymentMode || '';

    switch (event) {
      case 'checkout.order.completed':
        if (merchantOrderId && merchantOrderId.startsWith('ORDER_')) {
          await handleOrderWebhook(merchantOrderId, transactionId, true, paymentMode);
        } else if (merchantOrderId && merchantOrderId.startsWith('SUB_')) {
          await handleSubscriptionWebhook(merchantOrderId, transactionId, true);
        }
        break;

      case 'checkout.order.failed':
        if (merchantOrderId && merchantOrderId.startsWith('ORDER_')) {
          await handleOrderWebhook(merchantOrderId, transactionId, false, paymentMode);
        } else if (merchantOrderId && merchantOrderId.startsWith('SUB_')) {
          await handleSubscriptionWebhook(merchantOrderId, transactionId, false);
        }
        break;

      case 'pg.refund.completed':
      case 'pg.refund.failed':
        console.log(`Webhook: Refund event ${event} for ${merchantOrderId}`);
        break;

      default:
        console.warn('Webhook: Unknown event type:', event);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(200).json({ success: false, message: 'Internal error' });
  }
};

async function handleOrderWebhook(merchantOrderId, transactionId, isSuccess, paymentMode) {
  const order = await Order.findOne({ phonepeMerchantTransactionId: merchantOrderId });
  if (!order) {
    console.error('Webhook: Order not found for', merchantOrderId);
    return;
  }

  // Idempotent: skip if already paid
  if (order.paymentStatus === 'paid') {
    console.log('Webhook: Order already paid, skipping', merchantOrderId);
    return;
  }

  if (isSuccess) {
    order.phonepeTransactionId = transactionId;
    order.phonepePaymentInstrument = paymentMode;
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

async function handleSubscriptionWebhook(merchantOrderId, transactionId, isSuccess) {
  const subscription = await Subscription.findOne({ phonepeMerchantTransactionId: merchantOrderId });
  if (!subscription) {
    console.error('Webhook: Subscription not found for', merchantOrderId);
    return;
  }

  // Idempotent: skip if already paid
  if (subscription.paymentStatus === 'paid') {
    console.log('Webhook: Subscription already paid, skipping', merchantOrderId);
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
