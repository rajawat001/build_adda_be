const crypto = require('crypto');
const axios = require('axios');
const {
  merchantId,
  baseUrl,
  callbackUrl,
  generateChecksum,
  generateStatusChecksum
} = require('../config/phonepe');

class PaymentService {
  /**
   * Initiate a PhonePe payment (redirect-based)
   * Returns the redirect URL for the user to complete payment
   */
  async initiatePayment({ merchantTransactionId, amount, userId, redirectUrl }) {
    const payload = {
      merchantId,
      merchantTransactionId,
      merchantUserId: userId.toString(),
      amount: Math.round(amount * 100), // Convert to paise
      redirectUrl,
      redirectMode: 'REDIRECT',
      callbackUrl,
      paymentInstrument: {
        type: 'PAY_PAGE'
      }
    };

    const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
    const apiEndpoint = '/pg/v1/pay';
    const checksum = generateChecksum(base64Payload, apiEndpoint);

    const response = await axios.post(
      `${baseUrl}${apiEndpoint}`,
      { request: base64Payload },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': checksum
        }
      }
    );

    return response.data;
  }

  /**
   * Check payment status from PhonePe
   */
  async checkPaymentStatus(merchantTransactionId) {
    const apiEndpoint = `/pg/v1/status/${merchantId}/${merchantTransactionId}`;
    const checksum = generateStatusChecksum(apiEndpoint);

    const response = await axios.get(
      `${baseUrl}${apiEndpoint}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': checksum,
          'X-MERCHANT-ID': merchantId
        }
      }
    );

    return response.data;
  }

  /**
   * Verify webhook checksum from PhonePe server-to-server callback
   */
  verifyWebhookChecksum(xVerifyHeader, base64ResponsePayload) {
    const apiEndpoint = '/pg/v1/pay';
    const string = base64ResponsePayload + apiEndpoint + require('../config/phonepe').saltKey;
    const sha256 = crypto.createHash('sha256').update(string).digest('hex');
    const expectedChecksum = sha256 + '###' + require('../config/phonepe').saltIndex;
    return xVerifyHeader === expectedChecksum;
  }

  /**
   * Create a refund via PhonePe
   */
  async createRefund({ originalTransactionId, merchantTransactionId, amount }) {
    const payload = {
      merchantId,
      merchantUserId: '',
      originalTransactionId,
      merchantTransactionId,
      amount: Math.round(amount * 100)
    };

    const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
    const apiEndpoint = '/pg/v1/refund';
    const checksum = generateChecksum(base64Payload, apiEndpoint);

    const response = await axios.post(
      `${baseUrl}${apiEndpoint}`,
      { request: base64Payload },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': checksum
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
