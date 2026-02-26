const paymentService = require('../services/payment.service');
const Order = require('../models/Order');
const Subscription = require('../models/Subscription');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const Coupon = require('../models/Coupon');
const Distributor = require('../models/Distributor');
const User = require('../models/User');
const emailService = require('../services/email.service');
const notificationController = require('./notification.controller');
const invoiceService = require('../services/invoice.service');

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
        } else if (merchantOrderId && merchantOrderId.startsWith('COMM_')) {
          await handleCommissionWebhook(merchantOrderId, transactionId, true);
        }
        break;

      case 'checkout.order.failed':
        if (merchantOrderId && merchantOrderId.startsWith('ORDER_')) {
          await handleOrderWebhook(merchantOrderId, transactionId, false, paymentMode);
        } else if (merchantOrderId && merchantOrderId.startsWith('SUB_')) {
          await handleSubscriptionWebhook(merchantOrderId, transactionId, false);
        } else if (merchantOrderId && merchantOrderId.startsWith('COMM_')) {
          await handleCommissionWebhook(merchantOrderId, transactionId, false);
        }
        break;

      case 'pg.refund.completed':
      case 'pg.refund.failed':
        console.log(`Webhook: Refund event ${event} for ${merchantOrderId}`);
        break;

      // ─── AUTOPAY / SUBSCRIPTION EVENTS ───
      case 'subscription.setup.order.completed':
        // User authorized the autopay mandate (first payment + mandate setup)
        await handleAutopayAuthCompleted(payload);
        break;

      case 'subscription.setup.order.failed':
        // User cancelled or failed to authorize mandate
        await handleAutopayAuthFailed(payload);
        break;

      case 'subscription.notification.completed':
        // Recurring payment was successfully charged
        await handleRecurringChargeSuccess(payload);
        break;

      case 'subscription.notification.failed':
        // Recurring payment failed
        await handleRecurringChargeFailed(payload);
        break;

      case 'subscription.redemption.order.completed':
        // Subscription redemption completed (alternative event)
        await handleRecurringChargeSuccess(payload);
        break;

      case 'subscription.redemption.transaction.completed':
        // Subscription transaction completed
        await handleRecurringChargeSuccess(payload);
        break;

      case 'subscription.paused':
        console.log(`Webhook: Subscription paused - ${merchantOrderId}`);
        await handleSubscriptionPaused(payload);
        break;

      case 'subscription.unpaused':
        console.log(`Webhook: Subscription unpaused - ${merchantOrderId}`);
        break;

      case 'subscription.cancelled':
        await handleSubscriptionCancelled(payload);
        break;

      case 'subscription.revoked':
        await handleSubscriptionCancelled(payload);
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

    // Generate GST invoice
    try {
      await invoiceService.createSubscriptionInvoice(subscription._id, transactionId);
    } catch (invoiceErr) {
      console.error('Error creating invoice:', invoiceErr);
    }
  } else {
    subscription.paymentStatus = 'failed';
    await subscription.save();
  }
}

// ─────────────────────────────────────────────────────────────
// AUTOPAY WEBHOOK HANDLERS
// ─────────────────────────────────────────────────────────────

/**
 * Handle subscription.auth.completed - User authorized autopay mandate
 */
async function handleAutopayAuthCompleted(payload) {
  const { merchantSubscriptionId, subscriptionId: phonePeSubId, paymentDetails } = payload;

  console.log(`Webhook: Autopay authorized - ${merchantSubscriptionId}`);

  const subscription = await Subscription.findOne({
    'autopay.phonepeSubscriptionId': merchantSubscriptionId
  });

  if (!subscription) {
    console.error('Webhook: Subscription not found for autopay auth:', merchantSubscriptionId);
    return;
  }

  // Idempotent check
  if (subscription.autopay?.authStatus === 'authorized' && subscription.paymentStatus === 'paid') {
    console.log('Webhook: Autopay already authorized, skipping');
    return;
  }

  // Extract transaction details from first payment (auth with transaction)
  const firstPayment = paymentDetails && paymentDetails.length > 0 ? paymentDetails[0] : {};

  subscription.autopay.authStatus = 'authorized';
  subscription.autopay.authorizedAt = new Date();
  subscription.phonepeTransactionId = firstPayment.transactionId || '';
  subscription.status = 'active';
  subscription.paymentStatus = 'paid';
  await subscription.save();

  // Increment coupon usage
  if (subscription.couponApplied) {
    await Coupon.findByIdAndUpdate(subscription.couponApplied, { $inc: { usedCount: 1 } });
  }

  // Auto-approve distributor
  await approveDistributorAfterSubscription(subscription.distributor);

  // Generate GST invoice
  try {
    await invoiceService.createSubscriptionInvoice(subscription._id, firstPayment.transactionId);
  } catch (invoiceErr) {
    console.error('Error creating invoice for autopay:', invoiceErr);
  }

  // Send notification
  notificationController.createNotification(
    subscription.distributor,
    {
      type: 'general',
      title: 'Subscription Activated!',
      message: 'Your subscription with auto-renewal is now active.'
    },
    'Distributor'
  );
}

/**
 * Handle subscription.auth.failed - User cancelled or failed authorization
 */
async function handleAutopayAuthFailed(payload) {
  const { merchantSubscriptionId } = payload;

  console.log(`Webhook: Autopay auth failed - ${merchantSubscriptionId}`);

  const subscription = await Subscription.findOne({
    'autopay.phonepeSubscriptionId': merchantSubscriptionId
  });

  if (!subscription) {
    console.error('Webhook: Subscription not found for failed auth:', merchantSubscriptionId);
    return;
  }

  subscription.autopay.authStatus = 'failed';
  subscription.paymentStatus = 'failed';
  await subscription.save();
}

/**
 * Handle subscription.notification.charged - Recurring payment success
 */
async function handleRecurringChargeSuccess(payload) {
  const { merchantSubscriptionId, merchantOrderId, amount, paymentDetails } = payload;

  console.log(`Webhook: Recurring charge success - ${merchantSubscriptionId}, order: ${merchantOrderId}`);

  const subscription = await Subscription.findOne({
    'autopay.phonepeSubscriptionId': merchantSubscriptionId
  });

  if (!subscription) {
    console.error('Webhook: Subscription not found for recurring charge:', merchantSubscriptionId);
    return;
  }

  // Get the plan to calculate new end date
  const plan = await SubscriptionPlan.findById(subscription.plan);
  if (!plan) {
    console.error('Webhook: Plan not found for subscription:', subscription._id);
    return;
  }

  // Extend subscription end date
  const newEndDate = new Date(subscription.endDate);
  newEndDate.setDate(newEndDate.getDate() + plan.durationInDays);

  const firstPayment = paymentDetails && paymentDetails.length > 0 ? paymentDetails[0] : {};

  subscription.endDate = newEndDate;
  subscription.status = 'active';
  subscription.paymentStatus = 'paid';
  subscription.phonepeTransactionId = firstPayment.transactionId || '';
  subscription.autopay.lastRenewalAttempt = new Date();
  subscription.autopay.lastRenewalStatus = 'success';
  subscription.autopay.failedAttempts = 0;
  await subscription.save();

  // Generate renewal invoice
  try {
    const chargedAmount = (amount || 0) / 100;  // Convert paise to rupees
    await invoiceService.createRenewalInvoice(subscription._id, chargedAmount || plan.offerPrice, firstPayment.transactionId);
  } catch (invoiceErr) {
    console.error('Error creating renewal invoice:', invoiceErr);
  }

  // Send notification to distributor
  notificationController.createNotification(
    subscription.distributor,
    {
      type: 'general',
      title: 'Subscription Renewed!',
      message: `Your subscription has been automatically renewed until ${newEndDate.toLocaleDateString()}.`
    },
    'Distributor'
  );

  console.log(`Subscription ${subscription._id} renewed until ${newEndDate}`);
}

/**
 * Handle subscription.notification.failed - Recurring payment failed
 */
async function handleRecurringChargeFailed(payload) {
  const { merchantSubscriptionId, merchantOrderId, errorCode, errorMessage } = payload;

  console.log(`Webhook: Recurring charge failed - ${merchantSubscriptionId}, error: ${errorCode}`);

  const subscription = await Subscription.findOne({
    'autopay.phonepeSubscriptionId': merchantSubscriptionId
  });

  if (!subscription) {
    console.error('Webhook: Subscription not found for failed charge:', merchantSubscriptionId);
    return;
  }

  subscription.autopay.lastRenewalAttempt = new Date();
  subscription.autopay.lastRenewalStatus = 'failed';
  subscription.autopay.failedAttempts = (subscription.autopay.failedAttempts || 0) + 1;

  // After 3 failed attempts, disable autopay
  if (subscription.autopay.failedAttempts >= 3) {
    subscription.autopay.enabled = false;
    subscription.autoRenew = false;
  }

  await subscription.save();

  // Notify distributor
  notificationController.createNotification(
    subscription.distributor,
    {
      type: 'general',
      title: 'Subscription Renewal Failed',
      message: subscription.autopay.failedAttempts >= 3
        ? 'Auto-renewal has been disabled after multiple failed attempts. Please renew manually.'
        : 'We could not process your subscription renewal. We will retry soon.'
    },
    'Distributor'
  );
}

/**
 * Handle subscription.cancelled / subscription.revoked - Mandate was cancelled
 */
async function handleSubscriptionCancelled(payload) {
  const { merchantSubscriptionId } = payload;

  console.log(`Webhook: Subscription cancelled/revoked - ${merchantSubscriptionId}`);

  const subscription = await Subscription.findOne({
    'autopay.phonepeSubscriptionId': merchantSubscriptionId
  });

  if (!subscription) return;

  subscription.autopay.authStatus = 'revoked';
  subscription.autopay.enabled = false;
  subscription.autoRenew = false;
  await subscription.save();

  notificationController.createNotification(
    subscription.distributor,
    {
      type: 'general',
      title: 'Auto-Renewal Cancelled',
      message: 'Your subscription auto-renewal has been cancelled. You can renew manually before expiration.'
    },
    'Distributor'
  );
}

/**
 * Handle subscription.paused - Mandate was paused
 */
async function handleSubscriptionPaused(payload) {
  const { merchantSubscriptionId } = payload;

  console.log(`Webhook: Subscription paused - ${merchantSubscriptionId}`);

  const subscription = await Subscription.findOne({
    'autopay.phonepeSubscriptionId': merchantSubscriptionId
  });

  if (!subscription) return;

  subscription.autopay.enabled = false;
  await subscription.save();

  notificationController.createNotification(
    subscription.distributor,
    {
      type: 'general',
      title: 'Auto-Renewal Paused',
      message: 'Your subscription auto-renewal has been paused.'
    },
    'Distributor'
  );
}

// ─────────────────────────────────────────────────────────────
// COMMISSION PAYMENT WEBHOOK HANDLER
// ─────────────────────────────────────────────────────────────

async function handleCommissionWebhook(merchantOrderId, transactionId, isSuccess) {
  const { handleCommissionPaymentSuccess, handleCommissionPaymentFailure } = require('../modules/commission/services/commission-payment.service');

  if (isSuccess) {
    await handleCommissionPaymentSuccess(merchantOrderId, transactionId);
  } else {
    await handleCommissionPaymentFailure(merchantOrderId);
  }
}

module.exports = exports;
