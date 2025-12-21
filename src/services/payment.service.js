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

  // Create Razorpay order
  async createRazorpayOrder(orderId, amount) {
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
    const text = `${orderId}|${paymentId}`;

    const generatedSignature = crypto
      .createHmac('sha256', razorpayKeySecret)
      .update(text)
      .digest('hex');

    return generatedSignature === signature;
  }

  // Fetch payment details
  async getPaymentDetails(paymentId) {
    return await this.razorpay.payments.fetch(paymentId);
  }

  // Capture payment
  async capturePayment(paymentId, amount) {
    return await this.razorpay.payments.capture(
      paymentId,
      amount * 100,
      'INR'
    );
  }

  // Refund payment
  async createRefund(paymentId, amount = null) {
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
