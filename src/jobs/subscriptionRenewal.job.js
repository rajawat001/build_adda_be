const Subscription = require('../models/Subscription');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const autopayService = require('../services/autopay.service');
const notificationController = require('../controllers/notification.controller');

/**
 * Process automatic subscription renewals
 * This job should be run daily (e.g., via cron at midnight)
 *
 * It finds subscriptions that:
 * 1. Are active
 * 2. Have autopay enabled and authorized
 * 3. Are expiring within the next 3 days
 * 4. Haven't had a renewal attempt in the last 24 hours
 */
async function processSubscriptionRenewals() {
  console.log('Starting subscription renewal job...');

  const now = new Date();
  const threeDaysFromNow = new Date(now);
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

  const twentyFourHoursAgo = new Date(now);
  twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

  try {
    // Find subscriptions due for renewal
    const subscriptionsToRenew = await Subscription.find({
      status: 'active',
      'autopay.enabled': true,
      'autopay.authStatus': 'authorized',
      endDate: { $lte: threeDaysFromNow, $gt: now },
      $or: [
        { 'autopay.lastRenewalAttempt': { $exists: false } },
        { 'autopay.lastRenewalAttempt': { $lt: twentyFourHoursAgo } }
      ],
      'autopay.failedAttempts': { $lt: 3 }
    }).populate('plan');

    console.log(`Found ${subscriptionsToRenew.length} subscriptions to renew`);

    for (const subscription of subscriptionsToRenew) {
      await processRenewal(subscription);
    }

    // Also check for expired subscriptions that need to be marked as expired
    await markExpiredSubscriptions();

    console.log('Subscription renewal job completed');
  } catch (error) {
    console.error('Error in subscription renewal job:', error);
  }
}

/**
 * Process renewal for a single subscription
 */
async function processRenewal(subscription) {
  try {
    console.log(`Processing renewal for subscription ${subscription._id}`);

    const plan = subscription.plan;
    if (!plan) {
      console.error(`No plan found for subscription ${subscription._id}`);
      return;
    }

    const merchantOrderId = `RENEWAL_${subscription._id}_${Date.now()}`;
    const amount = plan.offerPrice;

    // Execute recurring payment via PhonePe
    const result = await autopayService.executeRecurringPayment({
      merchantSubscriptionId: subscription.autopay.phonepeSubscriptionId,
      merchantOrderId,
      amount
    });

    // Mark renewal attempt
    subscription.autopay.lastRenewalAttempt = new Date();
    subscription.autopay.lastRenewalStatus = 'pending';
    await subscription.save();

    console.log(`Renewal initiated for subscription ${subscription._id}, order: ${merchantOrderId}`);

    // The actual success/failure will be handled via webhook
    // subscription.notification.charged or subscription.notification.failed

  } catch (error) {
    console.error(`Error processing renewal for ${subscription._id}:`, error.message);

    subscription.autopay.lastRenewalAttempt = new Date();
    subscription.autopay.lastRenewalStatus = 'failed';
    subscription.autopay.failedAttempts = (subscription.autopay.failedAttempts || 0) + 1;
    await subscription.save();

    // Notify about failure
    notificationController.createNotification(
      subscription.distributor,
      {
        type: 'general',
        title: 'Subscription Renewal Issue',
        message: 'We encountered an issue with your subscription renewal. Please check your payment method.'
      },
      'Distributor'
    );
  }
}

/**
 * Mark expired subscriptions
 */
async function markExpiredSubscriptions() {
  const now = new Date();

  const result = await Subscription.updateMany(
    {
      status: 'active',
      endDate: { $lt: now }
    },
    {
      $set: { status: 'expired' }
    }
  );

  if (result.modifiedCount > 0) {
    console.log(`Marked ${result.modifiedCount} subscriptions as expired`);
  }
}

/**
 * Send renewal reminders for subscriptions expiring soon (without autopay)
 * Run daily to remind users to renew manually
 */
async function sendRenewalReminders() {
  const now = new Date();
  const sevenDaysFromNow = new Date(now);
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

  const threeDaysFromNow = new Date(now);
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

  try {
    // Find subscriptions expiring in 7 days without autopay
    const subscriptions = await Subscription.find({
      status: 'active',
      $or: [
        { 'autopay.enabled': false },
        { 'autopay.authStatus': { $ne: 'authorized' } }
      ],
      endDate: { $lte: sevenDaysFromNow, $gt: threeDaysFromNow }
    });

    for (const subscription of subscriptions) {
      const daysUntilExpiry = Math.ceil((subscription.endDate - now) / (1000 * 60 * 60 * 24));

      notificationController.createNotification(
        subscription.distributor,
        {
          type: 'general',
          title: 'Subscription Expiring Soon',
          message: `Your subscription expires in ${daysUntilExpiry} days. Renew now to avoid interruption.`
        },
        'Distributor'
      );
    }

    console.log(`Sent ${subscriptions.length} renewal reminders`);
  } catch (error) {
    console.error('Error sending renewal reminders:', error);
  }
}

module.exports = {
  processSubscriptionRenewals,
  markExpiredSubscriptions,
  sendRenewalReminders
};
