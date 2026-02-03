const crypto = require('crypto');
const axios = require('axios');
const { baseUrl, getAccessToken } = require('../config/phonepe');

class PaymentService {
  /**
   * Initiate a PhonePe v2 Standard Checkout payment.
   * Returns the redirect URL for the user to complete payment.
   */
  async initiatePayment({ merchantOrderId, amount, redirectUrl }) {
    const token = await getAccessToken();

    const payload = {
      merchantOrderId,
      amount: Math.round(amount * 100), // Convert to paise
      paymentFlow: {
        type: 'PG_CHECKOUT',
        message: 'Payment for BuildAdda order',
        merchantUrls: {
          redirectUrl
        }
      }
    };

    const response = await axios.post(
      `${baseUrl}/checkout/v2/pay`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `O-Bearer ${token}`
        }
      }
    );

    return response.data;
  }

  /**
   * Check payment status from PhonePe v2 API.
   * Uses merchantOrderId (not merchantTransactionId).
   */
  async checkPaymentStatus(merchantOrderId) {
    const token = await getAccessToken();

    const response = await axios.get(
      `${baseUrl}/checkout/v2/order/${merchantOrderId}/status?details=true`,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `O-Bearer ${token}`
        }
      }
    );

    return response.data;
  }

  /**
   * Verify webhook authorization header.
   * PhonePe v2 sends SHA256(username:password) as the Authorization header.
   * For now, if no webhook credentials are configured, skip verification.
   */
  verifyWebhookAuth(authHeader) {
    const webhookUser = process.env.PHONEPE_WEBHOOK_USERNAME;
    const webhookPass = process.env.PHONEPE_WEBHOOK_PASSWORD;

    // If webhook credentials not configured, accept all (dev/test mode)
    if (!webhookUser || !webhookPass) {
      console.warn('PhonePe webhook credentials not configured — skipping verification');
      return true;
    }

    const expected = crypto.createHash('sha256')
      .update(`${webhookUser}:${webhookPass}`)
      .digest('hex');

    return authHeader === expected;
  }

  /**
   * Create a refund via PhonePe v2 API.
   */
  async createRefund({ merchantOrderId, merchantRefundId, amount }) {
    const token = await getAccessToken();

    const payload = {
      merchantRefundId,
      originalMerchantOrderId: merchantOrderId,
      amount: Math.round(amount * 100) // Convert to paise
    };

    const response = await axios.post(
      `${baseUrl}/payments/v2/refund`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `O-Bearer ${token}`
        }
      }
    );

    return response.data;
  }

  /**
   * COD Payment (unchanged)
   */
  processCODPayment(orderId) {
    return {
      paymentMethod: 'COD',
      paymentStatus: 'pending',
      orderId
    };
  }
}

module.exports = new PaymentService();
