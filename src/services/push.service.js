const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');

// Initialize VAPID
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:support@buildadda.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

/**
 * Send push notification to all subscriptions for a user
 */
const sendPushToUser = async (userId, userModel, payload) => {
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

module.exports = {
  sendPushToUser,
  sendPushToMultiple
};
