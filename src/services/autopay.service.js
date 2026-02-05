const axios = require('axios');
const { baseUrl, getAccessToken, redirectBaseUrl, backendPublicUrl } = require('../config/phonepe');

/**
 * PhonePe Recurring Payments / Autopay Service
 * Uses PhonePe v2 Subscription APIs for automatic subscription renewal
 */
class AutopayService {
  /**
   * Create a subscription with autopay mandate
   * User will be redirected to authorize the recurring payment
   *
   * @param {Object} params
   * @param {string} params.merchantSubscriptionId - Unique ID for this subscription (e.g., SUB_<userId>_<timestamp>)
   * @param {string} params.merchantUserId - Your user/distributor ID
   * @param {number} params.amount - Amount in rupees (will be converted to paise)
   * @param {string} params.frequency - MONTHLY or YEARLY
   * @param {number} params.maxAmount - Max amount that can be debited per cycle (in rupees)
   * @param {string} params.subscriptionName - Display name for the subscription
   * @param {string} params.redirectUrl - URL to redirect after authorization
   */
  async createSubscriptionWithMandate({
    merchantSubscriptionId,
    merchantUserId,
    amount,
    frequency,
    maxAmount,
    subscriptionName,
    redirectUrl
  }) {
    const token = await getAccessToken();

    // Calculate subscription validity (1 year for yearly, 5 years for monthly)
    const now = new Date();
    const validityYears = frequency === 'YEARLY' ? 5 : 5;
    const validUntil = new Date(now.setFullYear(now.getFullYear() + validityYears));

    const payload = {
      merchantSubscriptionId,
      merchantUserId,
      authWorkflowType: 'TRANSACTION', // Collect first payment during auth
      amountType: 'FIXED',
      amount: Math.round(amount * 100), // Convert to paise
      frequency,
      recurringCount: frequency === 'YEARLY' ? validityYears : validityYears * 12,
      mobileNumber: '', // Optional - can be filled if available
      subscriptionValidityConfig: {
        validUntilTimestamp: validUntil.getTime()
      },
      paymentFlow: {
        type: 'PG_CHECKOUT',
        message: subscriptionName || 'BuildAdda Subscription',
        merchantUrls: {
          redirectUrl
        }
      }
    };

    try {
      const response = await axios.post(
        `${baseUrl}/subscriptions/v2/create`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `O-Bearer ${token}`
          }
        }
      );

      console.log('PhonePe Subscription created:', response.data);
      return response.data;
    } catch (error) {
      console.error('Error creating PhonePe subscription:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Check subscription/mandate status
   */
  async getSubscriptionStatus(merchantSubscriptionId) {
    const token = await getAccessToken();

    try {
      const response = await axios.get(
        `${baseUrl}/subscriptions/v2/${merchantSubscriptionId}/status`,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `O-Bearer ${token}`
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error checking subscription status:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Execute a recurring payment (charge the mandate)
   * Called when subscription needs to be renewed
   *
   * @param {Object} params
   * @param {string} params.merchantSubscriptionId - The PhonePe subscription ID
   * @param {string} params.merchantOrderId - Unique order ID for this charge (e.g., RENEWAL_<subId>_<timestamp>)
   * @param {number} params.amount - Amount to charge in rupees
   */
  async executeRecurringPayment({ merchantSubscriptionId, merchantOrderId, amount }) {
    const token = await getAccessToken();

    const payload = {
      merchantOrderId,
      amount: Math.round(amount * 100) // Convert to paise
    };

    try {
      const response = await axios.post(
        `${baseUrl}/subscriptions/v2/${merchantSubscriptionId}/notify`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `O-Bearer ${token}`
          }
        }
      );

      console.log('Recurring payment executed:', response.data);
      return response.data;
    } catch (error) {
      console.error('Error executing recurring payment:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Revoke/Cancel a subscription mandate
   */
  async revokeMandate(merchantSubscriptionId) {
    const token = await getAccessToken();

    try {
      const response = await axios.post(
        `${baseUrl}/subscriptions/v2/${merchantSubscriptionId}/cancel`,
        {},
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `O-Bearer ${token}`
          }
        }
      );

      console.log('Mandate revoked:', response.data);
      return response.data;
    } catch (error) {
      console.error('Error revoking mandate:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Pause a subscription
   */
  async pauseSubscription(merchantSubscriptionId) {
    const token = await getAccessToken();

    try {
      const response = await axios.post(
        `${baseUrl}/subscriptions/v2/${merchantSubscriptionId}/pause`,
        {},
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `O-Bearer ${token}`
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error pausing subscription:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Resume a paused subscription
   */
  async resumeSubscription(merchantSubscriptionId) {
    const token = await getAccessToken();

    try {
      const response = await axios.post(
        `${baseUrl}/subscriptions/v2/${merchantSubscriptionId}/resume`,
        {},
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `O-Bearer ${token}`
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error resuming subscription:', error.response?.data || error.message);
      throw error;
    }
  }
}

module.exports = new AutopayService();
