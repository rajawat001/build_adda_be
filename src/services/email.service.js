const nodemailer = require('nodemailer');
const {
  otpTemplate,
  welcomeTemplate,
  orderConfirmationTemplate,
  newOrderDistributorTemplate,
  orderStatusTemplate,
  deliveryPriceUpdateTemplate,
  lowStockAlertTemplate,
  distributorApprovalTemplate,
  distributorRejectionTemplate,
  paymentConfirmationTemplate,
  refundNotificationTemplate,
  newReviewNotificationTemplate,
  orderCancelledDistributorTemplate
} = require('../utils/emailTemplates');

// Create Brevo SMTP transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com',
    port: parseInt(process.env.BREVO_SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.BREVO_SMTP_USER,
      pass: process.env.BREVO_SMTP_PASS
    }
  });
};

/**
 * Send an email via Brevo SMTP
 */
const sendEmail = async (to, subject, html) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || 'BuildAdda'}" <${process.env.EMAIL_FROM || 'noreply@buildadda.com'}>`,
      to,
      subject,
      html
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${to}: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`Failed to send email to ${to}:`, error.message);
    // Don't throw - email failures should not break the main flow
    return { success: false, error: error.message };
  }
};

/**
 * Send OTP email for login/register/password-reset
 */
const sendOTPEmail = async (email, otp, purpose, userName = '') => {
  const purposeSubjects = {
    'login': 'Your Login OTP - BuildAdda',
    'register': 'Verify Your Email - BuildAdda',
    'reset-password': 'Password Reset OTP - BuildAdda'
  };

  const subject = purposeSubjects[purpose] || 'Your OTP Code - BuildAdda';
  const html = otpTemplate(otp, purpose, userName);

  return sendEmail(email, subject, html);
};

/**
 * Send welcome email after registration
 */
const sendWelcomeEmail = async (user, role = 'user') => {
  const userName = user.name || user.businessName || 'User';
  const html = welcomeTemplate(userName, role);
  return sendEmail(user.email, 'Welcome to BuildAdda!', html);
};

/**
 * Send order confirmation to user
 */
const sendOrderConfirmationEmail = async (order, userName) => {
  const html = orderConfirmationTemplate(order, userName);
  const userEmail = order.user?.email || order.userEmail;
  if (!userEmail) return { success: false, error: 'No user email' };
  return sendEmail(userEmail, `Order Confirmed - ${order.orderNumber}`, html);
};

/**
 * Send new order notification to distributor
 */
const sendNewOrderNotification = async (order, distributor) => {
  const distributorName = distributor.businessName || distributor.name || 'Distributor';
  const html = newOrderDistributorTemplate(order, distributorName);
  return sendEmail(distributor.email, `New Order Received - ${order.orderNumber}`, html);
};

/**
 * Send order status update email to user
 */
const sendOrderStatusEmail = async (order, userName, userEmail, status) => {
  const html = orderStatusTemplate(order, userName, status);
  const statusSubjects = {
    'approved': `Order Approved - ${order.orderNumber}`,
    'rejected': `Order Update - ${order.orderNumber}`,
    'processing': `Order Being Processed - ${order.orderNumber}`,
    'shipped': `Order Shipped - ${order.orderNumber}`,
    'delivered': `Order Delivered - ${order.orderNumber}`,
    'cancelled': `Order Cancelled - ${order.orderNumber}`
  };
  const subject = statusSubjects[status] || `Order Update - ${order.orderNumber}`;
  return sendEmail(userEmail, subject, html);
};

/**
 * Send delivery price update email to user
 */
const sendDeliveryPriceUpdateEmail = async (order, userName, userEmail, deliveryCharge) => {
  const html = deliveryPriceUpdateTemplate(order, userName, deliveryCharge);
  return sendEmail(userEmail, `Delivery Price Updated - ${order.orderNumber}`, html);
};

/**
 * Send low stock alert to distributor
 */
const sendLowStockAlertEmail = async (distributor, products) => {
  const distributorName = distributor.businessName || distributor.name || 'Distributor';
  const html = lowStockAlertTemplate(distributorName, products);
  return sendEmail(distributor.email, `Low Stock Alert - ${products.length} product(s)`, html);
};

/**
 * Send distributor approval email
 */
const sendDistributorApprovalEmail = async (distributor) => {
  const businessName = distributor.businessName || distributor.name;
  const html = distributorApprovalTemplate(businessName);
  return sendEmail(distributor.email, 'Your BuildAdda Distributor Account is Approved!', html);
};

/**
 * Send distributor rejection email
 */
const sendDistributorRejectionEmail = async (distributor, reason) => {
  const businessName = distributor.businessName || distributor.name;
  const html = distributorRejectionTemplate(businessName, reason);
  return sendEmail(distributor.email, 'BuildAdda Application Status Update', html);
};

/**
 * Send payment confirmation email
 */
const sendPaymentConfirmationEmail = async (order, userName, userEmail) => {
  const html = paymentConfirmationTemplate(order, userName);
  return sendEmail(userEmail, `Payment Confirmed - ${order.orderNumber}`, html);
};

/**
 * Send refund notification email
 */
const sendRefundNotificationEmail = async (order, userName, userEmail) => {
  const html = refundNotificationTemplate(order, userName);
  return sendEmail(userEmail, `Refund Processed - ${order.orderNumber}`, html);
};

/**
 * Send new review notification to distributor
 */
const sendNewReviewNotificationEmail = async (review, distributor, productName) => {
  const distributorName = distributor.businessName || distributor.name;
  const html = newReviewNotificationTemplate(review, distributorName, productName);
  return sendEmail(distributor.email, `New Review for ${productName}`, html);
};

/**
 * Send order cancelled notification to distributor
 */
const sendOrderCancelledToDistributor = async (order, distributor) => {
  const distributorName = distributor.businessName || distributor.name;
  const html = orderCancelledDistributorTemplate(order, distributorName);
  return sendEmail(distributor.email, `Order Cancelled - ${order.orderNumber}`, html);
};

module.exports = {
  sendEmail,
  sendOTPEmail,
  sendWelcomeEmail,
  sendOrderConfirmationEmail,
  sendNewOrderNotification,
  sendOrderStatusEmail,
  sendDeliveryPriceUpdateEmail,
  sendLowStockAlertEmail,
  sendDistributorApprovalEmail,
  sendDistributorRejectionEmail,
  sendPaymentConfirmationEmail,
  sendRefundNotificationEmail,
  sendNewReviewNotificationEmail,
  sendOrderCancelledToDistributor
};
