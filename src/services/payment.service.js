const crypto = require('crypto');
const {
  razorpayInstance,
  razorpayKeySecret,
  webhookSecret
} = require('../config/razorpay');

class PaymentService {
  constructor() {
    this.razorpay = razorpayInstance;
  }

  // Check if Razorpay is available
  _checkRazorpayAvailable() {
    if (!this.razorpay) {
      throw new Error('Razorpay is not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET environment variables.');
    }
  }

  // Create Razorpay order
  async createRazorpayOrder(orderId, amount) {
    this._checkRazorpayAvailable();

    const options = {
      amount: amount * 100,
      currency: 'INR',
      receipt: orderId.toString(),
      notes: { orderId: orderId.toString() }
    };

    return await this.razorpay.orders.create(options);
  }

  // Verify payment signature
  verifyRazorpaySignature(orderId, paymentId, signature) {
    if (!razorpayKeySecret) {
      throw new Error('Razorpay key secret is not configured.');
    }

    const text = `${orderId}|${paymentId}`;

    const generatedSignature = crypto
      .createHmac('sha256', razorpayKeySecret)
      .update(text)
      .digest('hex');

    return generatedSignature === signature;
  }

  // Fetch payment details
  async getPaymentDetails(paymentId) {
    this._checkRazorpayAvailable();
    return await this.razorpay.payments.fetch(paymentId);
  }

  // Capture payment
  async capturePayment(paymentId, amount) {
    this._checkRazorpayAvailable();
    return await this.razorpay.payments.capture(
      paymentId,
      amount * 100,
      'INR'
    );
  }

  // Refund payment
  async createRefund(paymentId, amount = null) {
    this._checkRazorpayAvailable();
    const data = amount ? { amount: amount * 100 } : {};
    return await this.razorpay.payments.refund(paymentId, data);
  }

  // Verify webhook
  verifyWebhookSignature(payload, signature) {
    const generatedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(JSON.stringify(payload))
      .digest('hex');

    return generatedSignature === signature;
  }

  // COD Payment
  processCODPayment(orderId) {
    return {
      paymentMethod: 'COD',
      paymentStatus: 'pending',
      orderId
    };
  }
}

module.exports = new PaymentService();
