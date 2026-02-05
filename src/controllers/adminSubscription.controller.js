const SubscriptionPlan = require('../models/SubscriptionPlan');
const Subscription = require('../models/Subscription');
const Coupon = require('../models/Coupon');
const Invoice = require('../models/Invoice');
const asyncHandler = require('../utils/asyncHandler');
const { ValidationError, NotFoundError, ConflictError } = require('../utils/errors');
const invoiceService = require('../services/invoice.service');

// ==================== SUBSCRIPTION PLANS ====================

// @desc    Get all subscription plans
// @route   GET /api/admin/subscription-plans
// @access  Private (Admin only)
exports.getAllPlans = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, isActive } = req.query;

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

  const filter = {};
  if (isActive !== undefined) {
    filter.isActive = isActive === 'true';
  }

  const plans = await SubscriptionPlan.find(filter)
    .sort({ durationInDays: 1 })
    .limit(limitNum)
    .skip((pageNum - 1) * limitNum);

  const total = await SubscriptionPlan.countDocuments(filter);

  res.json({
    success: true,
    plans,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum)
    }
  });
});

// @desc    Get single subscription plan
// @route   GET /api/admin/subscription-plans/:planId
// @access  Private (Admin only)
exports.getPlan = asyncHandler(async (req, res) => {
  const { planId } = req.params;

  const plan = await SubscriptionPlan.findById(planId);

  if (!plan) {
    throw new NotFoundError('Subscription plan not found');
  }

  res.json({
    success: true,
    plan
  });
});

// @desc    Create subscription plan
// @route   POST /api/admin/subscription-plans
// @access  Private (Admin only)
exports.createPlan = asyncHandler(async (req, res) => {
  const { name, duration, durationInDays, realPrice, offerPrice, features, description, isActive } = req.body;

  // Validate required fields
  if (!name || !['Monthly', 'Yearly'].includes(name)) {
    throw new ValidationError('Name must be either "Monthly" or "Yearly"');
  }

  if (!duration || !['monthly', 'yearly'].includes(duration)) {
    throw new ValidationError('Duration must be either "monthly" or "yearly"');
  }

  if (!durationInDays || durationInDays <= 0) {
    throw new ValidationError('Duration in days must be greater than 0');
  }

  if (realPrice === undefined || realPrice < 0) {
    throw new ValidationError('Real price must be 0 or greater');
  }

  if (offerPrice === undefined || offerPrice < 0) {
    throw new ValidationError('Offer price must be 0 or greater');
  }

  if (offerPrice > realPrice) {
    throw new ValidationError('Offer price cannot be greater than real price');
  }

  // Check if plan with same name already exists
  const existingPlan = await SubscriptionPlan.findOne({ name });
  if (existingPlan) {
    throw new ConflictError(`A ${name} plan already exists`);
  }

  const plan = await SubscriptionPlan.create({
    name,
    duration,
    durationInDays: parseInt(durationInDays),
    realPrice: parseFloat(realPrice),
    offerPrice: parseFloat(offerPrice),
    features: features || [],
    description: description || '',
    isActive: isActive !== false,
    createdBy: req.user._id
  });

  res.status(201).json({
    success: true,
    message: 'Subscription plan created successfully',
    plan
  });
});

// @desc    Update subscription plan
// @route   PUT /api/admin/subscription-plans/:planId
// @access  Private (Admin only)
exports.updatePlan = asyncHandler(async (req, res) => {
  const { planId } = req.params;
  const { durationInDays, realPrice, offerPrice, features, description, isActive } = req.body;

  const plan = await SubscriptionPlan.findById(planId);

  if (!plan) {
    throw new NotFoundError('Subscription plan not found');
  }

  // Field whitelisting - only update allowed fields
  if (durationInDays !== undefined) {
    const days = parseInt(durationInDays);
    if (days <= 0) {
      throw new ValidationError('Duration in days must be greater than 0');
    }
    plan.durationInDays = days;
  }

  if (realPrice !== undefined) {
    const price = parseFloat(realPrice);
    if (price < 0) {
      throw new ValidationError('Real price must be 0 or greater');
    }
    plan.realPrice = price;
  }

  if (offerPrice !== undefined) {
    const price = parseFloat(offerPrice);
    if (price < 0) {
      throw new ValidationError('Offer price must be 0 or greater');
    }
    plan.offerPrice = price;
  }

  // Validate offer price <= real price
  if (plan.offerPrice > plan.realPrice) {
    throw new ValidationError('Offer price cannot be greater than real price');
  }

  if (features !== undefined) {
    plan.features = Array.isArray(features) ? features : [];
  }

  if (description !== undefined) {
    plan.description = description;
  }

  if (typeof isActive === 'boolean') {
    plan.isActive = isActive;
  }

  await plan.save();

  res.json({
    success: true,
    message: 'Subscription plan updated successfully',
    plan
  });
});

// @desc    Delete subscription plan
// @route   DELETE /api/admin/subscription-plans/:planId
// @access  Private (Admin only)
exports.deletePlan = asyncHandler(async (req, res) => {
  const { planId } = req.params;

  const plan = await SubscriptionPlan.findById(planId);

  if (!plan) {
    throw new NotFoundError('Subscription plan not found');
  }

  // Check if any active subscriptions use this plan
  const activeSubscriptions = await Subscription.countDocuments({
    plan: planId,
    status: 'active'
  });

  if (activeSubscriptions > 0) {
    throw new ValidationError(`Cannot delete plan with ${activeSubscriptions} active subscription(s). Deactivate the plan instead.`);
  }

  await plan.deleteOne();

  res.json({
    success: true,
    message: 'Subscription plan deleted successfully'
  });
});

// @desc    Get subscription plan statistics
// @route   GET /api/admin/subscription-plans/stats
// @access  Private (Admin only)
exports.getPlanStats = asyncHandler(async (req, res) => {
  const [
    totalPlans,
    activePlans,
    totalSubscriptions,
    activeSubscriptions,
    revenueResult
  ] = await Promise.all([
    SubscriptionPlan.countDocuments(),
    SubscriptionPlan.countDocuments({ isActive: true }),
    Subscription.countDocuments(),
    Subscription.countDocuments({ status: 'active' }),
    Subscription.aggregate([
      { $match: { paymentStatus: 'paid' } },
      { $group: { _id: null, total: { $sum: '$finalAmount' } } }
    ])
  ]);

  const totalRevenue = revenueResult[0]?.total || 0;

  // Get subscription count by plan
  const subscriptionsByPlan = await Subscription.aggregate([
    {
      $group: {
        _id: '$plan',
        count: { $sum: 1 },
        activeCount: {
          $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
        },
        revenue: { $sum: '$finalAmount' }
      }
    },
    {
      $lookup: {
        from: 'subscriptionplans',
        localField: '_id',
        foreignField: '_id',
        as: 'planInfo'
      }
    },
    { $unwind: { path: '$planInfo', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        planName: '$planInfo.name',
        count: 1,
        activeCount: 1,
        revenue: 1
      }
    }
  ]);

  res.json({
    success: true,
    stats: {
      totalPlans,
      activePlans,
      totalSubscriptions,
      activeSubscriptions,
      totalRevenue,
      subscriptionsByPlan
    }
  });
});

// ==================== SUBSCRIPTIONS MANAGEMENT ====================

// @desc    Get all subscriptions
// @route   GET /api/admin/subscriptions
// @access  Private (Admin only)
exports.getAllSubscriptions = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, search } = req.query;

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

  const filter = {};

  if (status && ['active', 'expired', 'cancelled', 'pending'].includes(status)) {
    filter.status = status;
  }

  const subscriptions = await Subscription.find(filter)
    .populate('distributor', 'businessName email phone')
    .populate('plan', 'name duration realPrice offerPrice')
    .populate('couponApplied', 'code discountType discountValue freeMonths')
    .sort({ createdAt: -1 })
    .limit(limitNum)
    .skip((pageNum - 1) * limitNum);
    
  const total = await Subscription.countDocuments(filter);

  res.json({
    success: true,
    subscriptions,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum)
    }
  });
});

// @desc    Get subscription details
// @route   GET /api/admin/subscriptions/:subscriptionId
// @access  Private (Admin only)
exports.getSubscription = asyncHandler(async (req, res) => {
  const { subscriptionId } = req.params;

  const subscription = await Subscription.findById(subscriptionId)
    .populate('distributor', 'businessName email phone')
    .populate('plan', 'name duration realPrice offerPrice features')
    .populate('couponApplied', 'code discountType discountValue freeMonths');

  if (!subscription) {
    throw new NotFoundError('Subscription not found');
  }

  res.json({
    success: true,
    subscription
  });
});

// @desc    Cancel subscription (admin)
// @route   PUT /api/admin/subscriptions/:subscriptionId/cancel
// @access  Private (Admin only)
exports.cancelSubscription = asyncHandler(async (req, res) => {
  const { subscriptionId } = req.params;
  const { reason } = req.body;

  const subscription = await Subscription.findById(subscriptionId);

  if (!subscription) {
    throw new NotFoundError('Subscription not found');
  }

  if (subscription.status === 'cancelled') {
    throw new ValidationError('Subscription is already cancelled');
  }

  subscription.status = 'cancelled';
  subscription.cancelledAt = new Date();
  subscription.cancelReason = reason || 'Cancelled by admin';
  await subscription.save();

  res.json({
    success: true,
    message: 'Subscription cancelled successfully',
    subscription
  });
});

// @desc    Extend subscription
// @route   PUT /api/admin/subscriptions/:subscriptionId/extend
// @access  Private (Admin only)
exports.extendSubscription = asyncHandler(async (req, res) => {
  const { subscriptionId } = req.params;
  const { days } = req.body;

  if (!days || days <= 0) {
    throw new ValidationError('Days to extend must be greater than 0');
  }

  const subscription = await Subscription.findById(subscriptionId);

  if (!subscription) {
    throw new NotFoundError('Subscription not found');
  }

  // Extend from current end date or from now if expired
  const baseDate = subscription.endDate > new Date() ? subscription.endDate : new Date();
  const newEndDate = new Date(baseDate);
  newEndDate.setDate(newEndDate.getDate() + parseInt(days));

  subscription.endDate = newEndDate;
  if (subscription.status === 'expired') {
    subscription.status = 'active';
  }
  await subscription.save();

  await subscription.populate('distributor', 'businessName email');
  await subscription.populate('plan', 'name');

  res.json({
    success: true,
    message: `Subscription extended by ${days} days`,
    subscription
  });
});

// ==================== SUBSCRIPTION COUPONS ====================

// @desc    Get subscription coupons
// @route   GET /api/admin/subscription-coupons
// @access  Private (Admin only)
exports.getSubscriptionCoupons = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, isActive } = req.query;

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

  const filter = {
    applicableFor: { $in: ['subscription', 'both'] }
  };

  if (isActive !== undefined) {
    filter.isActive = isActive === 'true';
  }

  const coupons = await Coupon.find(filter)
    .sort({ createdAt: -1 })
    .limit(limitNum)
    .skip((pageNum - 1) * limitNum);

  const total = await Coupon.countDocuments(filter);

  res.json({
    success: true,
    coupons,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum)
    }
  });
});

// @desc    Create subscription coupon
// @route   POST /api/admin/subscription-coupons
// @access  Private (Admin only)
exports.createSubscriptionCoupon = asyncHandler(async (req, res) => {
  const {
    code,
    discountType,
    discountValue,
    freeMonths,
    maxDiscount,
    expiryDate,
    usageLimit,
    description,
    applicableFor
  } = req.body;

  // Validate required fields
  if (!code || !code.trim()) {
    throw new ValidationError('Coupon code is required');
  }

  // For free months coupon, discountType and discountValue are optional
  if (!freeMonths || freeMonths <= 0) {
    if (!discountType || !['percentage', 'fixed'].includes(discountType)) {
      throw new ValidationError('Discount type must be either "percentage" or "fixed"');
    }

    if (!discountValue || discountValue <= 0) {
      throw new ValidationError('Discount value must be greater than 0');
    }

    if (discountType === 'percentage' && (discountValue < 1 || discountValue > 100)) {
      throw new ValidationError('Percentage discount must be between 1 and 100');
    }
  }

  // Validate expiry date
  if (expiryDate && new Date(expiryDate) < new Date()) {
    throw new ValidationError('Expiry date must be in the future');
  }

  // Check if coupon code already exists
  const couponCode = code.trim().toUpperCase();
  const existingCoupon = await Coupon.findOne({ code: couponCode });

  if (existingCoupon) {
    throw new ConflictError('Coupon code already exists');
  }

  const coupon = await Coupon.create({
    code: couponCode,
    discountType: freeMonths > 0 ? 'percentage' : discountType,
    discountValue: freeMonths > 0 ? 100 : parseFloat(discountValue),
    freeMonths: freeMonths ? parseInt(freeMonths) : 0,
    maxDiscount: maxDiscount ? parseFloat(maxDiscount) : null,
    expiryDate: expiryDate ? new Date(expiryDate) : null,
    usageLimit: usageLimit ? parseInt(usageLimit) : null,
    description: description || '',
    applicableFor: applicableFor || 'subscription',
    isActive: true,
    createdBy: req.user._id
  });

  res.status(201).json({
    success: true,
    message: 'Subscription coupon created successfully',
    coupon
  });
});

// ==================== INVOICES ====================

// @desc    Get all invoices with filters
// @route   GET /api/admin/invoices
// @access  Private (Admin only)
exports.getAllInvoices = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    invoiceType,
    financialYear,
    paymentStatus,
    distributorId,
    startDate,
    endDate,
    search
  } = req.query;

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

  const filter = {};

  if (invoiceType) filter.invoiceType = invoiceType;
  if (financialYear) filter.financialYear = financialYear;
  if (paymentStatus) filter.paymentStatus = paymentStatus;
  if (distributorId) filter['customer.id'] = distributorId;

  if (startDate || endDate) {
    filter.invoiceDate = {};
    if (startDate) filter.invoiceDate.$gte = new Date(startDate);
    if (endDate) filter.invoiceDate.$lte = new Date(endDate);
  }

  if (search) {
    filter.$or = [
      { invoiceNumber: { $regex: search, $options: 'i' } },
      { 'customer.name': { $regex: search, $options: 'i' } },
      { 'customer.email': { $regex: search, $options: 'i' } }
    ];
  }

  const invoices = await Invoice.find(filter)
    .populate('subscription', 'plan startDate endDate')
    .populate('customer.id', 'businessName email phone')
    .sort({ createdAt: -1 })
    .limit(limitNum)
    .skip((pageNum - 1) * limitNum);

  const total = await Invoice.countDocuments(filter);

  // Calculate totals
  const totalsResult = await Invoice.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: '$grandTotal' },
        totalGst: { $sum: '$totalGst' },
        totalBase: { $sum: '$taxableAmount' }
      }
    }
  ]);

  const totals = totalsResult[0] || { totalAmount: 0, totalGst: 0, totalBase: 0 };

  res.json({
    success: true,
    invoices,
    totals,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum)
    }
  });
});

// @desc    Get single invoice details
// @route   GET /api/admin/invoices/:invoiceId
// @access  Private (Admin only)
exports.getInvoice = asyncHandler(async (req, res) => {
  const { invoiceId } = req.params;

  const invoice = await Invoice.findById(invoiceId)
    .populate('subscription')
    .populate('customer.id', 'businessName email phone address gstin');

  if (!invoice) {
    throw new NotFoundError('Invoice not found');
  }

  res.json({
    success: true,
    invoice
  });
});

// @desc    Get invoices for a specific distributor
// @route   GET /api/admin/distributors/:distributorId/invoices
// @access  Private (Admin only)
exports.getDistributorInvoices = asyncHandler(async (req, res) => {
  const { distributorId } = req.params;
  const { page = 1, limit = 20 } = req.query;

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

  const invoices = await Invoice.find({ 'customer.id': distributorId })
    .populate('subscription', 'plan startDate endDate status')
    .sort({ createdAt: -1 })
    .limit(limitNum)
    .skip((pageNum - 1) * limitNum);

  const total = await Invoice.countDocuments({ 'customer.id': distributorId });

  res.json({
    success: true,
    invoices,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum)
    }
  });
});

// @desc    Get invoice statistics
// @route   GET /api/admin/invoices/stats
// @access  Private (Admin only)
exports.getInvoiceStats = asyncHandler(async (req, res) => {
  const { financialYear } = req.query;

  const filter = {};
  if (financialYear) filter.financialYear = financialYear;

  const [
    totalInvoices,
    paidInvoices,
    pendingInvoices,
    revenueByMonth,
    gstSummary
  ] = await Promise.all([
    Invoice.countDocuments(filter),
    Invoice.countDocuments({ ...filter, paymentStatus: 'paid' }),
    Invoice.countDocuments({ ...filter, paymentStatus: 'pending' }),
    Invoice.aggregate([
      { $match: { ...filter, paymentStatus: 'paid' } },
      {
        $group: {
          _id: { $month: '$invoiceDate' },
          revenue: { $sum: '$grandTotal' },
          gst: { $sum: '$totalGst' },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]),
    Invoice.aggregate([
      { $match: { ...filter, paymentStatus: 'paid' } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$grandTotal' },
          totalTaxable: { $sum: '$taxableAmount' },
          totalCgst: { $sum: '$cgstTotal' },
          totalSgst: { $sum: '$sgstTotal' },
          totalIgst: { $sum: '$igstTotal' },
          totalGst: { $sum: '$totalGst' }
        }
      }
    ])
  ]);

  const summary = gstSummary[0] || {
    totalRevenue: 0,
    totalTaxable: 0,
    totalCgst: 0,
    totalSgst: 0,
    totalIgst: 0,
    totalGst: 0
  };

  res.json({
    success: true,
    stats: {
      totalInvoices,
      paidInvoices,
      pendingInvoices,
      revenueByMonth,
      summary
    }
  });
});

// @desc    Regenerate invoice for a subscription (if invoice was not created)
// @route   POST /api/admin/subscriptions/:subscriptionId/generate-invoice
// @access  Private (Admin only)
exports.regenerateInvoice = asyncHandler(async (req, res) => {
  const { subscriptionId } = req.params;

  const subscription = await Subscription.findById(subscriptionId);

  if (!subscription) {
    throw new NotFoundError('Subscription not found');
  }

  if (subscription.paymentStatus !== 'paid') {
    throw new ValidationError('Cannot generate invoice for unpaid subscription');
  }

  // Check if invoice already exists
  if (subscription.invoice) {
    const existingInvoice = await Invoice.findById(subscription.invoice);
    if (existingInvoice) {
      return res.json({
        success: true,
        message: 'Invoice already exists',
        invoice: existingInvoice
      });
    }
  }

  // Generate new invoice
  const invoice = await invoiceService.createSubscriptionInvoice(
    subscriptionId,
    subscription.phonepeTransactionId
  );

  res.json({
    success: true,
    message: 'Invoice generated successfully',
    invoice
  });
});

module.exports = exports;
