const Razorpay = require('razorpay');

// Initialize Razorpay only if credentials are available
let razorpayInstance = null;

if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  try {
    razorpayInstance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });
    console.log('Razorpay initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Razorpay:', error.message);
  }
} else {
  console.warn('Razorpay credentials not found. Payment features will be disabled.');
}

const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || '';

module.exports = {
  razorpayInstance,
  razorpayKeySecret,
  webhookSecret
};