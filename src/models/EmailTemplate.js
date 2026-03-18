const mongoose = require('mongoose');

const emailTemplateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Template name is required'],
    unique: true,
    trim: true,
    maxlength: [100, 'Template name cannot exceed 100 characters']
  },

  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    enum: [
      'order-confirmation',
      'order-approved',
      'order-rejected',
      'order-shipped',
      'order-delivered',
      'distributor-approval',
      'distributor-rejection',
      'welcome-email',
      'password-reset',
      'order-cancelled',
      'payment-confirmation',
      'low-stock-alert',
      'new-review',
      'otp-verification',
      'otp-login',
      'delivery-price-update',
      'refund-notification',
      'new-order-distributor',
      'order-cancelled-distributor'
    ]
  },

  subject: {
    type: String,
    required: [true, 'Email subject is required'],
    maxlength: [200, 'Subject cannot exceed 200 characters']
  },

  body: {
    type: String,
    required: [true, 'Email body is required']
  },

  variables: {
    type: [String],
    default: [],
    // Available variables: {{userName}}, {{orderNumber}}, {{totalAmount}}, etc.
  },

  category: {
    type: String,
    enum: ['order', 'user', 'distributor', 'system', 'notification'],
    default: 'system'
  },

  isActive: {
    type: Boolean,
    default: true
  },

  isDraft: {
    type: Boolean,
    default: false
  },

  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  previewText: {
    type: String,
    maxlength: [150, 'Preview text cannot exceed 150 characters']
  },

  // Email metadata
  fromName: {
    type: String,
    default: 'BuildAdda'
  },

  fromEmail: {
    type: String,
    default: 'noreply@buildadda.com'
  },

  replyTo: {
    type: String
  }
}, {
  timestamps: true
});

// Index for faster queries
// slug already indexed via unique:true in schema
emailTemplateSchema.index({ isActive: 1 });
emailTemplateSchema.index({ category: 1 });

// Method to replace variables in template
emailTemplateSchema.methods.render = function(data) {
  let renderedSubject = this.subject;
  let renderedBody = this.body;

  // Replace all variables in subject and body
  Object.keys(data).forEach(key => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    renderedSubject = renderedSubject.replace(regex, data[key]);
    renderedBody = renderedBody.replace(regex, data[key]);
  });

  return {
    subject: renderedSubject,
    body: renderedBody,
    from: {
      name: this.fromName,
      email: this.fromEmail
    },
    replyTo: this.replyTo
  };
};

// Static method to get default templates
emailTemplateSchema.statics.getDefaultTemplates = function() {
  return [
    {
      name: 'Order Confirmation',
      slug: 'order-confirmation',
      subject: 'Order Confirmed - {{orderNumber}}',
      body: `
        <h2>Thank you for your order!</h2>
        <p>Hi {{userName}},</p>
        <p>Your order <strong>{{orderNumber}}</strong> has been confirmed.</p>
        <h3>Order Details:</h3>
        <p>Total Amount: ₹{{totalAmount}}</p>
        <p>Payment Method: {{paymentMethod}}</p>
        <p>We'll notify you once your order is shipped.</p>
        <p>Thank you for shopping with BuildAdda!</p>
      `,
      variables: ['userName', 'orderNumber', 'totalAmount', 'paymentMethod'],
      category: 'order',
      isActive: true
    },
    {
      name: 'Order Approved',
      slug: 'order-approved',
      subject: 'Your order has been approved - {{orderNumber}}',
      body: `
        <h2>Order Approved!</h2>
        <p>Hi {{userName}},</p>
        <p>Great news! Your order <strong>{{orderNumber}}</strong> has been approved by the distributor.</p>
        <p>Delivery Charge: ₹{{deliveryCharge}}</p>
        <p>Total Amount: ₹{{totalAmount}}</p>
        <p>Your order will be processed shortly.</p>
      `,
      variables: ['userName', 'orderNumber', 'deliveryCharge', 'totalAmount'],
      category: 'order',
      isActive: true
    },
    {
      name: 'Order Rejected',
      slug: 'order-rejected',
      subject: 'Order Update - {{orderNumber}}',
      body: `
        <h2>Order Status Update</h2>
        <p>Hi {{userName}},</p>
        <p>We regret to inform you that your order <strong>{{orderNumber}}</strong> has been declined by the distributor.</p>
        <p>Reason: {{rejectionReason}}</p>
        <p>Your payment (if any) will be refunded within 5-7 business days.</p>
        <p>For questions, please contact our support team.</p>
      `,
      variables: ['userName', 'orderNumber', 'rejectionReason'],
      category: 'order',
      isActive: true
    },
    {
      name: 'Order Shipped',
      slug: 'order-shipped',
      subject: 'Your order is on the way - {{orderNumber}}',
      body: `
        <h2>Order Shipped!</h2>
        <p>Hi {{userName}},</p>
        <p>Your order <strong>{{orderNumber}}</strong> has been shipped and is on its way to you!</p>
        <p>Expected Delivery: {{expectedDelivery}}</p>
        <p>You can track your order status in your account.</p>
      `,
      variables: ['userName', 'orderNumber', 'expectedDelivery'],
      category: 'order',
      isActive: true
    },
    {
      name: 'Order Delivered',
      slug: 'order-delivered',
      subject: 'Order Delivered - {{orderNumber}}',
      body: `
        <h2>Order Delivered Successfully!</h2>
        <p>Hi {{userName}},</p>
        <p>Your order <strong>{{orderNumber}}</strong> has been delivered.</p>
        <p>We hope you're satisfied with your purchase!</p>
        <p>Please take a moment to rate and review the products.</p>
      `,
      variables: ['userName', 'orderNumber'],
      category: 'order',
      isActive: true
    },
    {
      name: 'Distributor Approval',
      slug: 'distributor-approval',
      subject: 'Welcome to BuildAdda - Your account is approved!',
      body: `
        <h2>Congratulations! Your distributor account is approved</h2>
        <p>Hi {{businessName}},</p>
        <p>Your distributor account has been approved by our admin team.</p>
        <p>You can now:</p>
        <ul>
          <li>Add and manage your products</li>
          <li>Receive and process orders</li>
          <li>Track your sales and analytics</li>
        </ul>
        <p>Login to your dashboard to get started!</p>
      `,
      variables: ['businessName'],
      category: 'distributor',
      isActive: true
    },
    {
      name: 'Distributor Rejection',
      slug: 'distributor-rejection',
      subject: 'BuildAdda - Application Status Update',
      body: `
        <h2>Application Status Update</h2>
        <p>Hi {{businessName}},</p>
        <p>Thank you for your interest in becoming a distributor on BuildAdda.</p>
        <p>After careful review, we are unable to approve your application at this time.</p>
        <p>Reason: {{rejectionReason}}</p>
        <p>You may reapply after addressing the concerns mentioned above.</p>
      `,
      variables: ['businessName', 'rejectionReason'],
      category: 'distributor',
      isActive: true
    },
    {
      name: 'Welcome Email',
      slug: 'welcome-email',
      subject: 'Welcome to BuildAdda!',
      body: `
        <h2>Welcome to BuildAdda!</h2>
        <p>Hi {{userName}},</p>
        <p>Thank you for joining BuildAdda - your one-stop destination for building materials.</p>
        <p>Explore our wide range of products from trusted distributors.</p>
        <p>Happy shopping!</p>
      `,
      variables: ['userName'],
      category: 'user',
      isActive: true
    },
    {
      name: 'Password Reset',
      slug: 'password-reset',
      subject: 'Reset Your Password - BuildAdda',
      body: `
        <h2>Password Reset Request</h2>
        <p>Hi {{userName}},</p>
        <p>We received a request to reset your password.</p>
        <p>Click the link below to reset your password:</p>
        <a href="{{resetLink}}">Reset Password</a>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request this, please ignore this email.</p>
      `,
      variables: ['userName', 'resetLink'],
      category: 'user',
      isActive: true
    }
  ];
};

const EmailTemplate = mongoose.model('EmailTemplate', emailTemplateSchema);

module.exports = EmailTemplate;
