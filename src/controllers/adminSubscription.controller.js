const SubscriptionPlan = require('../models/SubscriptionPlan');
const Subscription = require('../models/Subscription');
const Coupon = require('../models/Coupon');
const asyncHandler = require('../utils/asyncHandler');
const { ValidationError, NotFoundError, ConflictError } = require('../utils/errors');

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

module.exports = exports;
