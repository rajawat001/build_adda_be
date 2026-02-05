const Invoice = require('../models/Invoice');
const Subscription = require('../models/Subscription');
const Distributor = require('../models/Distributor');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const Settings = require('../models/Settings');

// Cache for settings (refreshed every 5 minutes)
let settingsCache = null;
let settingsCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get settings from DB (with caching)
 */
async function getSettings() {
  const now = Date.now();
  if (settingsCache && (now - settingsCacheTime) < CACHE_TTL) {
    return settingsCache;
  }

  settingsCache = await Settings.findOne() || {};
  settingsCacheTime = now;
  return settingsCache;
}

/**
 * Get company details from settings
 */
async function getCompanyDetails() {
  const settings = await getSettings();

  return {
    name: settings.company?.name || settings.siteName || 'BuildAdda',
    gstin: settings.gst?.gstin || '08DPEPR6934A1ZT',
    pan: settings.gst?.pan || '',
    address: {
      street: settings.company?.street || settings.address || 'Vaishali west,Bhuvneshwari vatika vistar 3rd',
      city: settings.company?.city || 'Jaipur',
      state: settings.company?.state || 'Rajasthan',
      pincode: settings.company?.pincode || '302034',
      country: settings.company?.country || 'India'
    },
    email: settings.company?.email || settings.contactEmail || 'support@buildadda.in',
    phone: settings.company?.phone || settings.contactPhone || '+91 6377845721'
  };
}

/**
 * Get GST configuration from settings
 */
async function getGstConfig() {
  const settings = await getSettings();

  return {
    enabled: settings.gst?.enabled !== false,
    cgstRate: settings.gst?.cgstRate ?? 9,
    sgstRate: settings.gst?.sgstRate ?? 9,
    igstRate: settings.gst?.igstRate ?? 18,
    totalRate: (settings.gst?.cgstRate ?? 9) + (settings.gst?.sgstRate ?? 9),
    sacCode: settings.gst?.subscriptionSacCode || '998361',
    invoicePrefix: settings.gst?.invoicePrefix || 'BA'
  };
}

/**
 * Create invoice for a subscription payment
 */
async function createSubscriptionInvoice(subscriptionId, transactionId) {
  try {
    const subscription = await Subscription.findById(subscriptionId)
      .populate('plan')
      .populate('distributor');

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    const distributor = subscription.distributor;
    const plan = subscription.plan;

    // Get settings from database
    const companyDetails = await getCompanyDetails();
    const gstConfig = await getGstConfig();

    // Generate invoice number
    const { invoiceNumber, financialYear, sequenceNumber } = await Invoice.generateInvoiceNumber();

    // Calculate GST on the discounted amount (baseAmount)
    const totalGstRate = gstConfig.totalRate;
    const baseAmount = subscription.gst?.baseAmount || subscription.finalAmount / (1 + totalGstRate / 100);
    const gstCalc = Invoice.calculateGST(baseAmount, totalGstRate, false);  // Intra-state (CGST + SGST)

    const invoice = new Invoice({
      invoiceNumber,
      financialYear,
      sequenceNumber,
      invoiceType: 'subscription',
      subscription: subscription._id,

      customer: {
        id: distributor._id,
        name: distributor.businessName || distributor.name || 'Distributor',
        email: distributor.email,
        phone: distributor.phone,
        address: {
          street: distributor.address?.street || distributor.businessAddress || '',
          city: distributor.address?.city || '',
          state: distributor.address?.state || 'Rajasthan',
          pincode: distributor.address?.pincode || '',
          country: 'India'
        },
        gstin: distributor.gstNumber || ''
      },

      seller: companyDetails,

      items: [{
        description: `${plan.name} Subscription (${plan.duration})`,
        hsn: gstConfig.sacCode,
        quantity: 1,
        unitPrice: subscription.amount,  // Original price
        discount: subscription.discount,
        taxableValue: baseAmount,
        cgstRate: gstCalc.cgstRate,
        cgstAmount: gstCalc.cgstAmount,
        sgstRate: gstCalc.sgstRate,
        sgstAmount: gstCalc.sgstAmount,
        igstRate: 0,
        igstAmount: 0,
        totalAmount: gstCalc.totalAmount
      }],

      subtotal: subscription.amount,
      discountAmount: subscription.discount,
      taxableAmount: baseAmount,
      cgstTotal: gstCalc.cgstAmount,
      sgstTotal: gstCalc.sgstAmount,
      igstTotal: 0,
      totalGst: gstCalc.totalGst,
      grandTotal: gstCalc.totalAmount,

      paymentStatus: 'paid',
      paymentMethod: subscription.paymentMethod || 'phonepe',
      paymentDate: new Date(),
      transactionId: transactionId || subscription.phonepeTransactionId,

      status: 'issued',
      invoiceDate: new Date(),

      notes: `Subscription period: ${subscription.startDate.toLocaleDateString()} to ${subscription.endDate.toLocaleDateString()}`,
      termsAndConditions: 'This is a computer-generated invoice and does not require a signature.'
    });

    await invoice.save();

    // Update subscription with invoice reference and GST details
    subscription.invoice = invoice._id;
    subscription.gst = {
      baseAmount: baseAmount,
      cgstRate: gstCalc.cgstRate,
      cgstAmount: gstCalc.cgstAmount,
      sgstRate: gstCalc.sgstRate,
      sgstAmount: gstCalc.sgstAmount,
      totalGst: gstCalc.totalGst,
      gstRate: totalGstRate
    };
    await subscription.save();

    console.log(`Invoice ${invoiceNumber} created for subscription ${subscription._id}`);

    return invoice;
  } catch (error) {
    console.error('Error creating subscription invoice:', error);
    throw error;
  }
}

/**
 * Create invoice for subscription renewal
 */
async function createRenewalInvoice(subscriptionId, amount, transactionId) {
  try {
    const subscription = await Subscription.findById(subscriptionId)
      .populate('plan')
      .populate('distributor');

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    const distributor = subscription.distributor;
    const plan = subscription.plan;

    // Get settings from database
    const companyDetails = await getCompanyDetails();
    const gstConfig = await getGstConfig();

    // Generate invoice number
    const { invoiceNumber, financialYear, sequenceNumber } = await Invoice.generateInvoiceNumber();

    // Calculate GST
    const totalGstRate = gstConfig.totalRate;
    const baseAmount = Math.round((amount / (1 + totalGstRate / 100)) * 100) / 100;
    const gstCalc = Invoice.calculateGST(baseAmount, totalGstRate, false);

    const invoice = new Invoice({
      invoiceNumber,
      financialYear,
      sequenceNumber,
      invoiceType: 'renewal',
      subscription: subscription._id,

      customer: {
        id: distributor._id,
        name: distributor.businessName || distributor.name || 'Distributor',
        email: distributor.email,
        phone: distributor.phone,
        address: {
          street: distributor.address?.street || distributor.businessAddress || '',
          city: distributor.address?.city || '',
          state: distributor.address?.state || 'Rajasthan',
          pincode: distributor.address?.pincode || '',
          country: 'India'
        },
        gstin: distributor.gstNumber || ''
      },

      seller: companyDetails,

      items: [{
        description: `${plan.name} Subscription Renewal (${plan.duration})`,
        hsn: gstConfig.sacCode,
        quantity: 1,
        unitPrice: amount,
        discount: 0,
        taxableValue: baseAmount,
        cgstRate: gstCalc.cgstRate,
        cgstAmount: gstCalc.cgstAmount,
        sgstRate: gstCalc.sgstRate,
        sgstAmount: gstCalc.sgstAmount,
        igstRate: 0,
        igstAmount: 0,
        totalAmount: gstCalc.totalAmount
      }],

      subtotal: amount,
      discountAmount: 0,
      taxableAmount: baseAmount,
      cgstTotal: gstCalc.cgstAmount,
      sgstTotal: gstCalc.sgstAmount,
      igstTotal: 0,
      totalGst: gstCalc.totalGst,
      grandTotal: gstCalc.totalAmount,

      paymentStatus: 'paid',
      paymentMethod: 'autopay',
      paymentDate: new Date(),
      transactionId: transactionId,

      status: 'issued',
      invoiceDate: new Date(),

      notes: `Auto-renewal for subscription ${subscription._id}`,
      termsAndConditions: 'This is a computer-generated invoice and does not require a signature.'
    });

    await invoice.save();

    console.log(`Renewal invoice ${invoiceNumber} created for subscription ${subscription._id}`);

    return invoice;
  } catch (error) {
    console.error('Error creating renewal invoice:', error);
    throw error;
  }
}

/**
 * Get invoice by ID
 */
async function getInvoiceById(invoiceId) {
  return Invoice.findById(invoiceId)
    .populate('subscription')
    .populate('customer.id');
}

/**
 * Get all invoices for a distributor
 */
async function getDistributorInvoices(distributorId) {
  return Invoice.find({ 'customer.id': distributorId })
    .sort({ createdAt: -1 });
}

/**
 * Get all invoices (for admin)
 */
async function getAllInvoices(filters = {}) {
  const query = {};

  if (filters.invoiceType) query.invoiceType = filters.invoiceType;
  if (filters.financialYear) query.financialYear = filters.financialYear;
  if (filters.paymentStatus) query.paymentStatus = filters.paymentStatus;
  if (filters.distributorId) query['customer.id'] = filters.distributorId;

  if (filters.startDate || filters.endDate) {
    query.invoiceDate = {};
    if (filters.startDate) query.invoiceDate.$gte = new Date(filters.startDate);
    if (filters.endDate) query.invoiceDate.$lte = new Date(filters.endDate);
  }

  return Invoice.find(query)
    .populate('subscription')
    .populate('customer.id')
    .sort({ createdAt: -1 });
}

module.exports = {
  createSubscriptionInvoice,
  createRenewalInvoice,
  getInvoiceById,
  getDistributorInvoices,
  getAllInvoices,
  getCompanyDetails,
  getGstConfig
};
