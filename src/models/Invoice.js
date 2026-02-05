const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  // Invoice number (auto-generated: BA/2425/000001)
  invoiceNumber: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  // Financial year (e.g., "2425" for 2024-25)
  financialYear: {
    type: String,
    required: true
  },
  // Sequential number within financial year
  sequenceNumber: {
    type: Number,
    required: true
  },

  // Invoice type
  invoiceType: {
    type: String,
    enum: ['subscription', 'order', 'renewal'],
    required: true
  },

  // Reference to subscription or order
  subscription: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subscription'
  },
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },

  // Customer details (Distributor)
  customer: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'Distributor', required: true },
    name: { type: String, required: true },
    email: { type: String },
    phone: { type: String },
    address: {
      street: String,
      city: String,
      state: String,
      pincode: String,
      country: { type: String, default: 'India' }
    },
    gstin: { type: String }  // Customer's GSTIN if they have one
  },

  // Seller details (BuildAdda)
  seller: {
    name: { type: String, default: 'BuildAdda' },
    gstin: { type: String, required: true },  // Your GSTN
    pan: { type: String },
    address: {
      street: String,
      city: String,
      state: String,
      pincode: String,
      country: { type: String, default: 'India' }
    },
    email: String,
    phone: String
  },

  // Invoice items
  items: [{
    description: { type: String, required: true },
    hsn: { type: String },  // HSN/SAC code for services
    quantity: { type: Number, default: 1 },
    unitPrice: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    taxableValue: { type: Number, required: true },
    cgstRate: { type: Number, default: 9 },
    cgstAmount: { type: Number, default: 0 },
    sgstRate: { type: Number, default: 9 },
    sgstAmount: { type: Number, default: 0 },
    igstRate: { type: Number, default: 0 },  // For inter-state (not used for same-state)
    igstAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true }
  }],

  // Summary amounts
  subtotal: { type: Number, required: true },           // Total before GST
  discountAmount: { type: Number, default: 0 },         // Total discount
  taxableAmount: { type: Number, required: true },      // Amount after discount
  cgstTotal: { type: Number, default: 0 },
  sgstTotal: { type: Number, default: 0 },
  igstTotal: { type: Number, default: 0 },
  totalGst: { type: Number, required: true },
  grandTotal: { type: Number, required: true },         // Final amount including GST

  // Payment details
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending'
  },
  paymentMethod: { type: String },
  paymentDate: { type: Date },
  transactionId: { type: String },

  // Invoice status
  status: {
    type: String,
    enum: ['draft', 'issued', 'cancelled', 'credited'],
    default: 'issued'
  },

  // Dates
  invoiceDate: { type: Date, default: Date.now },
  dueDate: { type: Date },

  // Notes
  notes: { type: String },
  termsAndConditions: { type: String }

}, { timestamps: true });

// Compound index for financial year sequence
invoiceSchema.index({ financialYear: 1, sequenceNumber: 1 });

/**
 * Get current financial year string (e.g., "2425" for April 2024 - March 2025)
 */
invoiceSchema.statics.getCurrentFinancialYear = function() {
  const now = new Date();
  const month = now.getMonth(); // 0-11
  const year = now.getFullYear();

  // Financial year starts in April (month 3)
  if (month >= 3) { // April onwards
    return `${year.toString().slice(-2)}${(year + 1).toString().slice(-2)}`;
  } else { // Jan-March belongs to previous FY
    return `${(year - 1).toString().slice(-2)}${year.toString().slice(-2)}`;
  }
};

/**
 * Generate next invoice number for current financial year
 */
invoiceSchema.statics.generateInvoiceNumber = async function() {
  const financialYear = this.getCurrentFinancialYear();

  // Find the last invoice of this financial year
  const lastInvoice = await this.findOne({ financialYear })
    .sort({ sequenceNumber: -1 })
    .select('sequenceNumber');

  const nextSequence = lastInvoice ? lastInvoice.sequenceNumber + 1 : 1;

  // Format: BA/2425/000001
  const invoiceNumber = `BA/${financialYear}/${nextSequence.toString().padStart(6, '0')}`;

  return { invoiceNumber, financialYear, sequenceNumber: nextSequence };
};

/**
 * Calculate GST amounts
 * @param {number} baseAmount - Amount before GST (after discount)
 * @param {number} gstRate - Total GST rate (default 18)
 * @param {boolean} isInterState - If true, use IGST instead of CGST+SGST
 */
invoiceSchema.statics.calculateGST = function(baseAmount, gstRate = 18, isInterState = false) {
  const gstAmount = Math.round((baseAmount * gstRate / 100) * 100) / 100;

  if (isInterState) {
    return {
      cgstRate: 0,
      cgstAmount: 0,
      sgstRate: 0,
      sgstAmount: 0,
      igstRate: gstRate,
      igstAmount: gstAmount,
      totalGst: gstAmount,
      totalAmount: Math.round((baseAmount + gstAmount) * 100) / 100
    };
  }

  const halfRate = gstRate / 2;
  const halfGst = Math.round((gstAmount / 2) * 100) / 100;

  return {
    cgstRate: halfRate,
    cgstAmount: halfGst,
    sgstRate: halfRate,
    sgstAmount: halfGst,
    igstRate: 0,
    igstAmount: 0,
    totalGst: gstAmount,
    totalAmount: Math.round((baseAmount + gstAmount) * 100) / 100
  };
};

module.exports = mongoose.model('Invoice', invoiceSchema);
