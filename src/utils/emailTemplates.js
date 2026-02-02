// Modern HTML Email Templates for BuildAdda
// All templates use inline CSS for email client compatibility

const baseTemplate = (content, preheader = '') => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>BuildAdda</title>
  <!--[if mso]>
  <style>table,td{font-family:Arial,sans-serif!important}</style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}</div>` : ''}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f9;">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#FF6B35 0%,#e85d2a 100%);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:800;letter-spacing:-0.5px;">
                Build<span style="color:#FFC107;">Adda</span>
              </h1>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:12px;letter-spacing:1.5px;text-transform:uppercase;">
                Your Building Materials Partner
              </p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f8f9fa;padding:24px 40px;border-top:1px solid #eee;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="text-align:center;">
                    <p style="margin:0 0 8px;color:#6c757d;font-size:13px;">
                      This email was sent by BuildAdda. Please do not reply directly.
                    </p>
                    <p style="margin:0;color:#adb5bd;font-size:12px;">
                      &copy; ${new Date().getFullYear()} BuildAdda. All rights reserved.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

const otpTemplate = (otp, purpose, userName = '') => {
  const purposeText = {
    'login': 'sign in to your account',
    'register': 'verify your email and complete registration',
    'reset-password': 'reset your password'
  };

  const purposeTitle = {
    'login': 'Sign In Verification',
    'register': 'Email Verification',
    'reset-password': 'Password Reset'
  };

  const content = `
    <div style="text-align:center;">
      <div style="width:64px;height:64px;margin:0 auto 20px;background:linear-gradient(135deg,#FF6B35,#FFC107);border-radius:50%;display:flex;align-items:center;justify-content:center;">
        <span style="display:block;width:64px;height:64px;line-height:64px;text-align:center;font-size:28px;">&#128274;</span>
      </div>
      <h2 style="margin:0 0 8px;color:#1a1a2e;font-size:24px;font-weight:700;">
        ${purposeTitle[purpose] || 'Verification Code'}
      </h2>
      ${userName ? `<p style="margin:0 0 16px;color:#6c757d;font-size:15px;">Hi ${userName},</p>` : ''}
      <p style="margin:0 0 32px;color:#6c757d;font-size:15px;line-height:1.6;">
        Use the code below to ${purposeText[purpose] || 'verify your identity'}.
      </p>

      <!-- OTP Display -->
      <div style="background:linear-gradient(135deg,#f8f9fa,#e9ecef);border-radius:12px;padding:24px;margin:0 0 24px;border:2px dashed #dee2e6;">
        <p style="margin:0 0 8px;color:#6c757d;font-size:12px;text-transform:uppercase;letter-spacing:2px;">Your OTP Code</p>
        <div style="font-size:40px;font-weight:800;letter-spacing:12px;color:#FF6B35;font-family:'Courier New',monospace;">
          ${otp}
        </div>
      </div>

      <div style="background-color:#fff3cd;border-radius:8px;padding:12px 16px;margin:0 0 24px;border-left:4px solid #FFC107;">
        <p style="margin:0;color:#856404;font-size:13px;">
          <strong>Expires in 10 minutes.</strong> Do not share this code with anyone.
        </p>
      </div>

      <p style="margin:0;color:#adb5bd;font-size:13px;">
        If you didn't request this code, please ignore this email or contact support.
      </p>
    </div>
  `;

  return baseTemplate(content, `Your BuildAdda OTP is ${otp}`);
};

const welcomeTemplate = (userName, role) => {
  const isDistributor = role === 'distributor';
  const content = `
    <div style="text-align:center;">
      <div style="width:80px;height:80px;margin:0 auto 20px;background:linear-gradient(135deg,#28a745,#20c997);border-radius:50%;line-height:80px;font-size:36px;">
        &#127881;
      </div>
      <h2 style="margin:0 0 8px;color:#1a1a2e;font-size:24px;font-weight:700;">
        Welcome to BuildAdda!
      </h2>
      <p style="margin:0 0 24px;color:#6c757d;font-size:15px;">Hi ${userName},</p>
      <p style="margin:0 0 32px;color:#495057;font-size:15px;line-height:1.7;">
        ${isDistributor
          ? 'Thank you for registering as a distributor on BuildAdda! Your account is under review and will be approved by our admin team shortly.'
          : 'Thank you for joining BuildAdda! Start exploring our wide range of building materials from trusted distributors near you.'
        }
      </p>

      <div style="background-color:#f8f9fa;border-radius:12px;padding:24px;margin:0 0 24px;">
        <h3 style="margin:0 0 16px;color:#1a1a2e;font-size:16px;">What You Can Do:</h3>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${isDistributor ? `
          <tr>
            <td style="padding:8px 0;color:#495057;font-size:14px;">&#10004; List and manage your products</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#495057;font-size:14px;">&#10004; Receive and process orders</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#495057;font-size:14px;">&#10004; Track sales analytics</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#495057;font-size:14px;">&#10004; Manage delivery charges</td>
          </tr>
          ` : `
          <tr>
            <td style="padding:8px 0;color:#495057;font-size:14px;">&#10004; Browse building materials</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#495057;font-size:14px;">&#10004; Order from nearby distributors</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#495057;font-size:14px;">&#10004; Track your orders in real-time</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#495057;font-size:14px;">&#10004; Save addresses for quick checkout</td>
          </tr>
          `}
        </table>
      </div>

      <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}" style="display:inline-block;background:linear-gradient(135deg,#FF6B35,#e85d2a);color:#ffffff;padding:14px 40px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
        ${isDistributor ? 'Go to Dashboard' : 'Start Shopping'}
      </a>
    </div>
  `;

  return baseTemplate(content, `Welcome to BuildAdda, ${userName}!`);
};

const orderConfirmationTemplate = (order, userName) => {
  const itemsHtml = (order.items || []).map(item => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #f0f0f0;color:#495057;font-size:14px;">
        ${item.name || 'Product'}
      </td>
      <td style="padding:12px 0;border-bottom:1px solid #f0f0f0;color:#495057;font-size:14px;text-align:center;">
        ${item.quantity}
      </td>
      <td style="padding:12px 0;border-bottom:1px solid #f0f0f0;color:#495057;font-size:14px;text-align:right;">
        &#8377;${(item.price * item.quantity).toLocaleString('en-IN')}
      </td>
    </tr>
  `).join('');

  const content = `
    <div>
      <div style="text-align:center;margin-bottom:32px;">
        <div style="width:64px;height:64px;margin:0 auto 16px;background:linear-gradient(135deg,#28a745,#20c997);border-radius:50%;line-height:64px;font-size:28px;">
          &#10004;
        </div>
        <h2 style="margin:0 0 8px;color:#1a1a2e;font-size:22px;font-weight:700;">Order Confirmed!</h2>
        <p style="margin:0;color:#6c757d;font-size:14px;">Hi ${userName}, your order has been placed successfully.</p>
      </div>

      <!-- Order Info Card -->
      <div style="background:linear-gradient(135deg,#f8f9fa,#e9ecef);border-radius:12px;padding:20px;margin-bottom:24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="color:#6c757d;font-size:13px;padding:4px 0;">Order Number</td>
            <td style="color:#1a1a2e;font-size:14px;font-weight:600;text-align:right;padding:4px 0;">${order.orderNumber}</td>
          </tr>
          <tr>
            <td style="color:#6c757d;font-size:13px;padding:4px 0;">Payment Method</td>
            <td style="color:#1a1a2e;font-size:14px;font-weight:600;text-align:right;padding:4px 0;">${order.paymentMethod}</td>
          </tr>
          <tr>
            <td style="color:#6c757d;font-size:13px;padding:4px 0;">Status</td>
            <td style="text-align:right;padding:4px 0;">
              <span style="display:inline-block;background:#FFC107;color:#000;padding:2px 10px;border-radius:20px;font-size:12px;font-weight:600;">Pending Approval</span>
            </td>
          </tr>
        </table>
      </div>

      <!-- Items Table -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr>
          <th style="text-align:left;padding:8px 0;border-bottom:2px solid #FF6B35;color:#1a1a2e;font-size:13px;text-transform:uppercase;">Item</th>
          <th style="text-align:center;padding:8px 0;border-bottom:2px solid #FF6B35;color:#1a1a2e;font-size:13px;text-transform:uppercase;">Qty</th>
          <th style="text-align:right;padding:8px 0;border-bottom:2px solid #FF6B35;color:#1a1a2e;font-size:13px;text-transform:uppercase;">Amount</th>
        </tr>
        ${itemsHtml}
      </table>

      <!-- Price Summary -->
      <div style="background-color:#f8f9fa;border-radius:8px;padding:16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:4px 0;color:#6c757d;font-size:14px;">Subtotal</td>
            <td style="padding:4px 0;color:#495057;font-size:14px;text-align:right;">&#8377;${(order.subtotal || 0).toLocaleString('en-IN')}</td>
          </tr>
          ${order.discount > 0 ? `
          <tr>
            <td style="padding:4px 0;color:#28a745;font-size:14px;">Discount</td>
            <td style="padding:4px 0;color:#28a745;font-size:14px;text-align:right;">-&#8377;${order.discount.toLocaleString('en-IN')}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:4px 0;color:#6c757d;font-size:14px;">Delivery Charge</td>
            <td style="padding:4px 0;color:#6c757d;font-size:14px;text-align:right;font-style:italic;">Pending</td>
          </tr>
          <tr>
            <td style="padding:12px 0 0;border-top:2px solid #dee2e6;color:#1a1a2e;font-size:18px;font-weight:700;">Total</td>
            <td style="padding:12px 0 0;border-top:2px solid #dee2e6;color:#FF6B35;font-size:18px;font-weight:700;text-align:right;">&#8377;${(order.totalAmount || 0).toLocaleString('en-IN')}</td>
          </tr>
        </table>
      </div>

      <div style="text-align:center;margin-top:32px;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/orders" style="display:inline-block;background:linear-gradient(135deg,#FF6B35,#e85d2a);color:#ffffff;padding:14px 40px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
          Track Your Order
        </a>
      </div>
    </div>
  `;

  return baseTemplate(content, `Order ${order.orderNumber} confirmed`);
};

const newOrderDistributorTemplate = (order, distributorName) => {
  const content = `
    <div>
      <div style="text-align:center;margin-bottom:32px;">
        <div style="width:64px;height:64px;margin:0 auto 16px;background:linear-gradient(135deg,#007bff,#0056b3);border-radius:50%;line-height:64px;font-size:28px;">
          &#128230;
        </div>
        <h2 style="margin:0 0 8px;color:#1a1a2e;font-size:22px;font-weight:700;">New Order Received!</h2>
        <p style="margin:0;color:#6c757d;font-size:14px;">Hi ${distributorName}, you have a new order to review.</p>
      </div>

      <div style="background:linear-gradient(135deg,#e3f2fd,#bbdefb);border-radius:12px;padding:20px;margin-bottom:24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="color:#0d47a1;font-size:13px;padding:4px 0;">Order Number</td>
            <td style="color:#1a1a2e;font-size:14px;font-weight:600;text-align:right;padding:4px 0;">${order.orderNumber}</td>
          </tr>
          <tr>
            <td style="color:#0d47a1;font-size:13px;padding:4px 0;">Items</td>
            <td style="color:#1a1a2e;font-size:14px;font-weight:600;text-align:right;padding:4px 0;">${order.items?.length || 0} item(s)</td>
          </tr>
          <tr>
            <td style="color:#0d47a1;font-size:13px;padding:4px 0;">Total Amount</td>
            <td style="color:#1a1a2e;font-size:14px;font-weight:600;text-align:right;padding:4px 0;">&#8377;${(order.totalAmount || 0).toLocaleString('en-IN')}</td>
          </tr>
          <tr>
            <td style="color:#0d47a1;font-size:13px;padding:4px 0;">Payment Method</td>
            <td style="color:#1a1a2e;font-size:14px;font-weight:600;text-align:right;padding:4px 0;">${order.paymentMethod}</td>
          </tr>
        </table>
      </div>

      <div style="text-align:center;">
        <p style="margin:0 0 16px;color:#495057;font-size:14px;">Please review and approve/reject the order from your dashboard.</p>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/distributor/orders" style="display:inline-block;background:linear-gradient(135deg,#007bff,#0056b3);color:#ffffff;padding:14px 40px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
          Review Order
        </a>
      </div>
    </div>
  `;

  return baseTemplate(content, `New order ${order.orderNumber} received`);
};

const orderStatusTemplate = (order, userName, status) => {
  const statusConfig = {
    'approved': {
      icon: '&#10004;',
      color: '#28a745',
      gradient: 'linear-gradient(135deg,#28a745,#20c997)',
      title: 'Order Approved!',
      message: `Your order <strong>${order.orderNumber}</strong> has been approved by the distributor.`,
      details: order.deliveryCharge !== undefined ? `<p style="margin:8px 0;color:#495057;font-size:14px;">Delivery Charge: <strong>&#8377;${(order.deliveryCharge || 0).toLocaleString('en-IN')}</strong></p><p style="margin:8px 0;color:#FF6B35;font-size:18px;font-weight:700;">Total: &#8377;${(order.totalAmount || 0).toLocaleString('en-IN')}</p>` : ''
    },
    'rejected': {
      icon: '&#10060;',
      color: '#dc3545',
      gradient: 'linear-gradient(135deg,#dc3545,#c82333)',
      title: 'Order Declined',
      message: `We regret to inform you that your order <strong>${order.orderNumber}</strong> has been declined.`,
      details: order.rejectionReason ? `<div style="background-color:#f8d7da;border-radius:8px;padding:12px;margin:16px 0;border-left:4px solid #dc3545;"><p style="margin:0;color:#721c24;font-size:13px;"><strong>Reason:</strong> ${order.rejectionReason}</p></div><p style="margin:8px 0;color:#6c757d;font-size:13px;">Your payment (if any) will be refunded within 5-7 business days.</p>` : ''
    },
    'processing': {
      icon: '&#9881;',
      color: '#17a2b8',
      gradient: 'linear-gradient(135deg,#17a2b8,#138496)',
      title: 'Order Being Processed',
      message: `Your order <strong>${order.orderNumber}</strong> is now being processed and prepared for shipment.`,
      details: ''
    },
    'shipped': {
      icon: '&#128666;',
      color: '#6f42c1',
      gradient: 'linear-gradient(135deg,#6f42c1,#5a32a3)',
      title: 'Order Shipped!',
      message: `Your order <strong>${order.orderNumber}</strong> has been shipped and is on its way!`,
      details: order.trackingNumber ? `<p style="margin:8px 0;color:#495057;font-size:14px;">Tracking Number: <strong>${order.trackingNumber}</strong></p>` : ''
    },
    'delivered': {
      icon: '&#127881;',
      color: '#28a745',
      gradient: 'linear-gradient(135deg,#28a745,#218838)',
      title: 'Order Delivered!',
      message: `Your order <strong>${order.orderNumber}</strong> has been delivered successfully.`,
      details: '<p style="margin:8px 0;color:#495057;font-size:14px;">We hope you\'re satisfied! Please rate and review your purchase.</p>'
    },
    'cancelled': {
      icon: '&#10060;',
      color: '#6c757d',
      gradient: 'linear-gradient(135deg,#6c757d,#495057)',
      title: 'Order Cancelled',
      message: `Your order <strong>${order.orderNumber}</strong> has been cancelled.`,
      details: order.cancellationReason ? `<p style="margin:8px 0;color:#6c757d;font-size:13px;"><strong>Reason:</strong> ${order.cancellationReason}</p>` : ''
    }
  };

  const config = statusConfig[status] || statusConfig['processing'];

  const content = `
    <div style="text-align:center;">
      <div style="width:64px;height:64px;margin:0 auto 16px;background:${config.gradient};border-radius:50%;line-height:64px;font-size:28px;">
        ${config.icon}
      </div>
      <h2 style="margin:0 0 8px;color:#1a1a2e;font-size:22px;font-weight:700;">${config.title}</h2>
      <p style="margin:0 0 16px;color:#6c757d;font-size:14px;">Hi ${userName},</p>
      <p style="margin:0 0 16px;color:#495057;font-size:15px;line-height:1.6;">${config.message}</p>
      ${config.details}

      <div style="margin-top:32px;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/orders" style="display:inline-block;background:${config.gradient};color:#ffffff;padding:14px 40px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
          View Order Details
        </a>
      </div>
    </div>
  `;

  return baseTemplate(content, `Order ${order.orderNumber} - ${config.title}`);
};

const deliveryPriceUpdateTemplate = (order, userName, deliveryCharge) => {
  const content = `
    <div style="text-align:center;">
      <div style="width:64px;height:64px;margin:0 auto 16px;background:linear-gradient(135deg,#17a2b8,#138496);border-radius:50%;line-height:64px;font-size:28px;">
        &#128666;
      </div>
      <h2 style="margin:0 0 8px;color:#1a1a2e;font-size:22px;font-weight:700;">Delivery Price Updated</h2>
      <p style="margin:0 0 24px;color:#6c757d;font-size:14px;">Hi ${userName},</p>
      <p style="margin:0 0 24px;color:#495057;font-size:15px;line-height:1.6;">
        The delivery charge for your order <strong>${order.orderNumber}</strong> has been updated by the distributor.
      </p>

      <div style="background-color:#f8f9fa;border-radius:12px;padding:20px;margin-bottom:24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:4px 0;color:#6c757d;font-size:14px;">Subtotal</td>
            <td style="padding:4px 0;color:#495057;font-size:14px;text-align:right;">&#8377;${(order.subtotal || 0).toLocaleString('en-IN')}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#17a2b8;font-size:14px;font-weight:600;">Delivery Charge</td>
            <td style="padding:4px 0;color:#17a2b8;font-size:14px;font-weight:600;text-align:right;">&#8377;${(deliveryCharge || 0).toLocaleString('en-IN')}</td>
          </tr>
          ${order.discount > 0 ? `
          <tr>
            <td style="padding:4px 0;color:#28a745;font-size:14px;">Discount</td>
            <td style="padding:4px 0;color:#28a745;font-size:14px;text-align:right;">-&#8377;${order.discount.toLocaleString('en-IN')}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:12px 0 0;border-top:2px solid #dee2e6;color:#1a1a2e;font-size:18px;font-weight:700;">New Total</td>
            <td style="padding:12px 0 0;border-top:2px solid #dee2e6;color:#FF6B35;font-size:18px;font-weight:700;text-align:right;">&#8377;${(order.totalAmount || 0).toLocaleString('en-IN')}</td>
          </tr>
        </table>
      </div>

      <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/orders" style="display:inline-block;background:linear-gradient(135deg,#FF6B35,#e85d2a);color:#ffffff;padding:14px 40px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
        View Order
      </a>
    </div>
  `;

  return baseTemplate(content, `Delivery charge updated for ${order.orderNumber}`);
};

const lowStockAlertTemplate = (distributorName, products) => {
  const productsHtml = products.map(p => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;color:#495057;font-size:14px;">${p.name}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;text-align:center;">
        <span style="display:inline-block;background:${p.stock <= 5 ? '#dc3545' : '#FFC107'};color:${p.stock <= 5 ? '#fff' : '#000'};padding:2px 12px;border-radius:20px;font-size:13px;font-weight:600;">
          ${p.stock}
        </span>
      </td>
    </tr>
  `).join('');

  const content = `
    <div>
      <div style="text-align:center;margin-bottom:32px;">
        <div style="width:64px;height:64px;margin:0 auto 16px;background:linear-gradient(135deg,#dc3545,#c82333);border-radius:50%;line-height:64px;font-size:28px;">
          &#9888;
        </div>
        <h2 style="margin:0 0 8px;color:#1a1a2e;font-size:22px;font-weight:700;">Low Stock Alert!</h2>
        <p style="margin:0;color:#6c757d;font-size:14px;">Hi ${distributorName}, some of your products are running low.</p>
      </div>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #f0f0f0;border-radius:8px;overflow:hidden;">
        <tr>
          <th style="text-align:left;padding:12px;background:#f8f9fa;color:#1a1a2e;font-size:13px;text-transform:uppercase;border-bottom:2px solid #dc3545;">Product</th>
          <th style="text-align:center;padding:12px;background:#f8f9fa;color:#1a1a2e;font-size:13px;text-transform:uppercase;border-bottom:2px solid #dc3545;">Stock Left</th>
        </tr>
        ${productsHtml}
      </table>

      <div style="text-align:center;">
        <p style="margin:0 0 16px;color:#495057;font-size:14px;">Please restock these products to avoid order rejections.</p>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/distributor/products" style="display:inline-block;background:linear-gradient(135deg,#FF6B35,#e85d2a);color:#ffffff;padding:14px 40px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
          Manage Products
        </a>
      </div>
    </div>
  `;

  return baseTemplate(content, `Low stock alert for ${products.length} product(s)`);
};

const distributorApprovalTemplate = (businessName) => {
  const content = `
    <div style="text-align:center;">
      <div style="width:80px;height:80px;margin:0 auto 20px;background:linear-gradient(135deg,#28a745,#20c997);border-radius:50%;line-height:80px;font-size:36px;">
        &#127881;
      </div>
      <h2 style="margin:0 0 8px;color:#1a1a2e;font-size:24px;font-weight:700;">Account Approved!</h2>
      <p style="margin:0 0 24px;color:#6c757d;font-size:15px;">Hi ${businessName},</p>
      <p style="margin:0 0 32px;color:#495057;font-size:15px;line-height:1.7;">
        Congratulations! Your distributor account has been approved. You can now start listing products and accepting orders.
      </p>

      <div style="background-color:#d4edda;border-radius:12px;padding:24px;margin-bottom:24px;">
        <h3 style="margin:0 0 12px;color:#155724;font-size:16px;">Next Steps:</h3>
        <p style="margin:4px 0;color:#155724;font-size:14px;">1. Complete your subscription plan</p>
        <p style="margin:4px 0;color:#155724;font-size:14px;">2. Add your products with pricing</p>
        <p style="margin:4px 0;color:#155724;font-size:14px;">3. Start receiving orders!</p>
      </div>

      <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/distributor/dashboard" style="display:inline-block;background:linear-gradient(135deg,#28a745,#20c997);color:#ffffff;padding:14px 40px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
        Go to Dashboard
      </a>
    </div>
  `;

  return baseTemplate(content, `${businessName}, your distributor account is approved!`);
};

const distributorRejectionTemplate = (businessName, reason) => {
  const content = `
    <div style="text-align:center;">
      <div style="width:64px;height:64px;margin:0 auto 16px;background:linear-gradient(135deg,#6c757d,#495057);border-radius:50%;line-height:64px;font-size:28px;">
        &#128233;
      </div>
      <h2 style="margin:0 0 8px;color:#1a1a2e;font-size:22px;font-weight:700;">Application Update</h2>
      <p style="margin:0 0 24px;color:#6c757d;font-size:15px;">Hi ${businessName},</p>
      <p style="margin:0 0 16px;color:#495057;font-size:15px;line-height:1.6;">
        After careful review, we're unable to approve your distributor application at this time.
      </p>
      ${reason ? `
      <div style="background-color:#f8d7da;border-radius:8px;padding:16px;margin:0 0 24px;border-left:4px solid #dc3545;">
        <p style="margin:0;color:#721c24;font-size:14px;"><strong>Reason:</strong> ${reason}</p>
      </div>` : ''}
      <p style="margin:0;color:#6c757d;font-size:14px;line-height:1.6;">
        You may address the concerns above and reapply. For questions, contact our support team.
      </p>
    </div>
  `;

  return baseTemplate(content, `BuildAdda application status update`);
};

const paymentConfirmationTemplate = (order, userName) => {
  const content = `
    <div style="text-align:center;">
      <div style="width:64px;height:64px;margin:0 auto 16px;background:linear-gradient(135deg,#28a745,#218838);border-radius:50%;line-height:64px;font-size:28px;">
        &#128176;
      </div>
      <h2 style="margin:0 0 8px;color:#1a1a2e;font-size:22px;font-weight:700;">Payment Received!</h2>
      <p style="margin:0 0 24px;color:#6c757d;font-size:14px;">Hi ${userName}, we've received your payment.</p>

      <div style="background-color:#d4edda;border-radius:12px;padding:20px;margin-bottom:24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:4px 0;color:#155724;font-size:13px;">Order</td>
            <td style="padding:4px 0;color:#155724;font-size:14px;font-weight:600;text-align:right;">${order.orderNumber}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#155724;font-size:13px;">Amount Paid</td>
            <td style="padding:4px 0;color:#155724;font-size:14px;font-weight:600;text-align:right;">&#8377;${(order.totalAmount || 0).toLocaleString('en-IN')}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#155724;font-size:13px;">Payment Method</td>
            <td style="padding:4px 0;color:#155724;font-size:14px;font-weight:600;text-align:right;">${order.paymentMethod}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#155724;font-size:13px;">Payment ID</td>
            <td style="padding:4px 0;color:#155724;font-size:14px;font-weight:600;text-align:right;">${order.phonepeTransactionId || 'N/A'}</td>
          </tr>
        </table>
      </div>

      <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/orders" style="display:inline-block;background:linear-gradient(135deg,#FF6B35,#e85d2a);color:#ffffff;padding:14px 40px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
        View Order
      </a>
    </div>
  `;

  return baseTemplate(content, `Payment confirmed for ${order.orderNumber}`);
};

const refundNotificationTemplate = (order, userName) => {
  const content = `
    <div style="text-align:center;">
      <div style="width:64px;height:64px;margin:0 auto 16px;background:linear-gradient(135deg,#17a2b8,#138496);border-radius:50%;line-height:64px;font-size:28px;">
        &#128179;
      </div>
      <h2 style="margin:0 0 8px;color:#1a1a2e;font-size:22px;font-weight:700;">Refund Processed</h2>
      <p style="margin:0 0 24px;color:#6c757d;font-size:14px;">Hi ${userName}, your refund has been processed.</p>

      <div style="background-color:#d1ecf1;border-radius:12px;padding:20px;margin-bottom:24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:4px 0;color:#0c5460;font-size:13px;">Order</td>
            <td style="padding:4px 0;color:#0c5460;font-size:14px;font-weight:600;text-align:right;">${order.orderNumber}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#0c5460;font-size:13px;">Refund Amount</td>
            <td style="padding:4px 0;color:#0c5460;font-size:14px;font-weight:600;text-align:right;">&#8377;${(order.refundAmount || order.totalAmount || 0).toLocaleString('en-IN')}</td>
          </tr>
        </table>
      </div>

      <p style="margin:0;color:#6c757d;font-size:13px;">The refund will reflect in your account within 5-7 business days.</p>
    </div>
  `;

  return baseTemplate(content, `Refund processed for ${order.orderNumber}`);
};

const newReviewNotificationTemplate = (review, distributorName, productName) => {
  const stars = '&#9733;'.repeat(review.rating) + '&#9734;'.repeat(5 - review.rating);
  const content = `
    <div style="text-align:center;">
      <div style="width:64px;height:64px;margin:0 auto 16px;background:linear-gradient(135deg,#FFC107,#e0a800);border-radius:50%;line-height:64px;font-size:28px;">
        &#9733;
      </div>
      <h2 style="margin:0 0 8px;color:#1a1a2e;font-size:22px;font-weight:700;">New Product Review</h2>
      <p style="margin:0 0 24px;color:#6c757d;font-size:14px;">Hi ${distributorName},</p>
      <p style="margin:0 0 16px;color:#495057;font-size:15px;">Your product <strong>${productName}</strong> received a new review.</p>

      <div style="background-color:#fff3cd;border-radius:12px;padding:20px;margin-bottom:24px;">
        <p style="margin:0 0 8px;font-size:24px;color:#FFC107;">${stars}</p>
        <p style="margin:0 0 4px;color:#856404;font-size:16px;font-weight:600;">${review.rating}/5 Stars</p>
        ${review.comment ? `<p style="margin:12px 0 0;color:#495057;font-size:14px;font-style:italic;">"${review.comment}"</p>` : ''}
        ${review.userName ? `<p style="margin:8px 0 0;color:#6c757d;font-size:13px;">- ${review.userName}</p>` : ''}
      </div>

      <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/distributor/products" style="display:inline-block;background:linear-gradient(135deg,#FF6B35,#e85d2a);color:#ffffff;padding:14px 40px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
        View Reviews
      </a>
    </div>
  `;

  return baseTemplate(content, `New review for ${productName}`);
};

const orderCancelledDistributorTemplate = (order, distributorName) => {
  const content = `
    <div style="text-align:center;">
      <div style="width:64px;height:64px;margin:0 auto 16px;background:linear-gradient(135deg,#6c757d,#495057);border-radius:50%;line-height:64px;font-size:28px;">
        &#10060;
      </div>
      <h2 style="margin:0 0 8px;color:#1a1a2e;font-size:22px;font-weight:700;">Order Cancelled</h2>
      <p style="margin:0 0 24px;color:#6c757d;font-size:14px;">Hi ${distributorName},</p>
      <p style="margin:0 0 16px;color:#495057;font-size:15px;line-height:1.6;">
        Order <strong>${order.orderNumber}</strong> has been cancelled by the customer.
      </p>
      ${order.cancellationReason ? `
      <div style="background-color:#f8f9fa;border-radius:8px;padding:12px;margin:0 0 24px;">
        <p style="margin:0;color:#6c757d;font-size:13px;"><strong>Reason:</strong> ${order.cancellationReason}</p>
      </div>` : ''}

      <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/distributor/orders" style="display:inline-block;background:linear-gradient(135deg,#6c757d,#495057);color:#ffffff;padding:14px 40px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
        View Orders
      </a>
    </div>
  `;

  return baseTemplate(content, `Order ${order.orderNumber} cancelled`);
};

module.exports = {
  baseTemplate,
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
};
