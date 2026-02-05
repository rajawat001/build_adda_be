const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  // General Settings
  siteName: {
    type: String,
    default: 'BuildAdda'
  },
  siteDescription: {
    type: String,
    default: 'Building Materials E-commerce Platform'
  },
  contactEmail: {
    type: String,
    default: 'contact@buildadda.com'
  },
  contactPhone: {
    type: String,
    default: '+91 1234567890'
  },
  address: {
    type: String,
    default: '123 Main Street, City, State, PIN'
  },
  currency: {
    type: String,
    enum: ['INR', 'USD', 'EUR'],
    default: 'INR'
  },
  timezone: {
    type: String,
    default: 'Asia/Kolkata'
  },
  logo: {
    type: String,
    default: ''
  },
  favicon: {
    type: String,
    default: ''
  },

  // Payment Settings
  phonepeMerchantId: {
    type: String,
    default: ''
  },
  phonepeSaltKey: {
    type: String,
    default: ''
  },
  phonepeSaltIndex: {
    type: String,
    default: '1'
  },
  phonepeEnv: {
    type: String,
    enum: ['sandbox', 'production'],
    default: 'sandbox'
  },
  codEnabled: {
    type: Boolean,
    default: true
  },
  minOrderAmount: {
    type: Number,
    default: 500
  },

  // Shipping Settings
  defaultShippingCharge: {
    type: Number,
    default: 50
  },
  freeShippingThreshold: {
    type: Number,
    default: 1000
  },
  shippingZones: {
    type: [String],
    default: ['Local', 'Regional', 'National']
  },

  // Tax/GST Settings
  taxRate: {
    type: Number,
    default: 18,
    min: 0,
    max: 100
  },
  taxCalculationMethod: {
    type: String,
    enum: ['inclusive', 'exclusive'],
    default: 'exclusive'
  },
  taxEnabled: {
    type: Boolean,
    default: true
  },

  // GST Configuration
  gst: {
    enabled: { type: Boolean, default: true },
    gstin: { type: String, default: '' },           // Company GSTIN
    pan: { type: String, default: '' },             // Company PAN
    legalName: { type: String, default: 'BuildAdda' },
    tradeName: { type: String, default: 'BuildAdda' },
    cgstRate: { type: Number, default: 9, min: 0, max: 50 },
    sgstRate: { type: Number, default: 9, min: 0, max: 50 },
    igstRate: { type: Number, default: 18, min: 0, max: 50 },
    subscriptionSacCode: { type: String, default: '998361' },  // SAC code for subscription services
    invoicePrefix: { type: String, default: 'BA' },
    stateCode: { type: String, default: '24' }  // Gujarat = 24
  },

  // Company Details (for invoices)
  company: {
    name: { type: String, default: 'BuildAdda' },
    street: { type: String, default: 'Vaishali west,Bhuvneshwari vatika vistar 3rd' },
    city: { type: String, default: 'Jaipur' },
    state: { type: String, default: 'Rajasthan' },
    pincode: { type: String, default: '302034' },
    country: { type: String, default: 'India' },
    phone: { type: String, default: '+91 6377845721' },
    email: { type: String, default: 'support@buildadda.in' },
    website: { type: String, default: 'https://www.buildadda.in' },
    bankName: { type: String, default: '' },
    bankAccount: { type: String, default: '' },
    bankIfsc: { type: String, default: '' },
    bankBranch: { type: String, default: '' }
  },

  // Email Settings
  smtpHost: {
    type: String,
    default: 'smtp.gmail.com'
  },
  smtpPort: {
    type: Number,
    default: 587
  },
  smtpUser: {
    type: String,
    default: ''
  },
  smtpPassword: {
    type: String,
    default: ''
  },
  smtpFromEmail: {
    type: String,
    default: 'noreply@buildadda.com'
  },
  smtpFromName: {
    type: String,
    default: 'BuildAdda'
  },
  emailSignature: {
    type: String,
    default: 'Best regards,\nBuildAdda Team'
  },

  // Notification Settings
  adminNotifications: {
    type: Boolean,
    default: true
  },
  orderNotifications: {
    type: Boolean,
    default: true
  },
  distributorNotifications: {
    type: Boolean,
    default: true
  },
  smsEnabled: {
    type: Boolean,
    default: false
  },
  smsApiKey: {
    type: String,
    default: ''
  },
  pushEnabled: {
    type: Boolean,
    default: false
  },

  // Advanced Settings
  maintenanceMode: {
    type: Boolean,
    default: false
  },
  debugMode: {
    type: Boolean,
    default: false
  },
  cacheEnabled: {
    type: Boolean,
    default: true
  },
  apiRateLimit: {
    type: Number,
    default: 100,
    min: 10
  },

  // Metadata
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Update lastUpdated timestamp before saving
settingsSchema.pre('save', function(next) {
  this.lastUpdated = new Date();
  next();
});

const Settings = mongoose.model('Settings', settingsSchema);

module.exports = Settings;
