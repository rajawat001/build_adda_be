const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');

// Check if VAPID keys are configured
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:support@buildadda.com';

let pushEnabled = false;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    pushEnabled = true;
    console.log('Web Push initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Web Push:', error.message);
  }
} else {
  console.warn('Web Push disabled: VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY not set in environment');
}

/**
 * Send push notification to all subscriptions for a user
 */
const sendPushToUser = async (userId, userModel, payload) => {
  if (!pushEnabled) {
    // Push notifications not configured, silently skip
    return;
  }

  try {
    const subscriptions = await PushSubscription.find({ user: userId, userModel });

    if (subscriptions.length === 0) return;

    const payloadStr = JSON.stringify(payload);

    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(sub.subscription, payloadStr);
        } catch (error) {
          // 410 Gone or 404 means subscription is expired/invalid — remove it
          if (error.statusCode === 410 || error.statusCode === 404) {
            await PushSubscription.findByIdAndDelete(sub._id);
            console.log(`Removed expired push subscription for user ${userId}`);
          } else {
            console.error(`Push send failed for subscription ${sub._id}:`, error.message);
          }
        }
      })
    );

    return results;
  } catch (error) {
    console.error('Error in sendPushToUser:', error);
  }
};

/**
 * Send push notification to multiple users
 */
const sendPushToMultiple = async (userIds, userModel, payload) => {
  try {
    await Promise.allSettled(
      userIds.map((userId) => sendPushToUser(userId, userModel, payload))
    );
  } catch (error) {
    console.error('Error in sendPushToMultiple:', error);
  }
};

/**
 * Get VAPID public key for frontend subscription
 */
const getVapidPublicKey = () => {
  return VAPID_PUBLIC_KEY || null;
};

/**
 * Check if push notifications are enabled
 */
const isPushEnabled = () => {
  return pushEnabled;
};

module.exports = {
  sendPushToUser,
  sendPushToMultiple,
  getVapidPublicKey,
  isPushEnabled
};
