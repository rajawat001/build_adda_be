const CommissionPlan = require('../models/CommissionPlan');
const CommissionWallet = require('../models/CommissionWallet');
const CommissionTransaction = require('../models/CommissionTransaction');
const Distributor = require('../../../models/Distributor');
const Subscription = require('../../../models/Subscription');
const asyncHandler = require('../../../utils/asyncHandler');
const { ValidationError, NotFoundError } = require('../../../utils/errors');
const { getOrCreateWallet, getWalletDetails } = require('../services/wallet.service');
const { initiateCommissionPayment, checkCommissionPaymentStatus } = require('../services/commission-payment.service');

// @desc    Get available commission plans
// @route   GET /api/commission/plans
// @access  Private (distributor)
exports.getAvailablePlans = asyncHandler(async (req, res) => {
  const plans = await CommissionPlan.find({ isActive: true })
    .select('-createdBy')
    .sort({ value: 1 });

  res.json({ success: true, plans });
});

// @desc    Select a commission plan (auto-approves distributor)
// @route   POST /api/commission/select-plan
// @access  Private (distributor)
exports.selectCommissionPlan = asyncHandler(async (req, res) => {
  const distributorId = req.user._id;
  const { planId } = req.body;

  if (!planId) {
    throw new ValidationError('Plan ID is required');
  }

  const distributor = await Distributor.findById(distributorId);
  if (!distributor) {
    throw new NotFoundError('Distributor not found');
  }

  // Only allow if planType is 'none' OR switching from expired subscription
  if (distributor.planType === 'commission') {
    throw new ValidationError('You are already on a commission plan');
  }

  if (distributor.planType === 'subscription') {
    // Check if subscription is expired/cancelled
    const activeSub = await Subscription.findOne({
      distributor: distributorId,
      status: 'active',
      endDate: { $gt: new Date() }
    });
    if (activeSub) {
      throw new ValidationError('You have an active subscription. Cancel or wait for it to expire before switching to a commission plan.');
    }
  }

  const plan = await CommissionPlan.findOne({ _id: planId, isActive: true });
  if (!plan) {
    throw new NotFoundError('Commission plan not found or inactive');
  }

  // Update distributor
  distributor.planType = 'commission';
  distributor.commissionPlan = plan._id;
  distributor.isApproved = true;
  distributor.approvedAt = new Date();
  await distributor.save();

  // Create wallet
  const wallet = await getOrCreateWallet(distributorId, plan._id);

  res.json({
    success: true,
    message: 'Commission plan selected. Your account is now active!',
    planType: 'commission',
    wallet
  });
});

// @desc    Get my wallet details
// @route   GET /api/commission/wallet
// @access  Private (distributor)
exports.getMyWallet = asyncHandler(async (req, res) => {
  const details = await getWalletDetails(req.user._id);

  if (!details) {
    throw new NotFoundError('No commission wallet found');
  }

  res.json({ success: true, wallet: details });
});

// @desc    Get my transactions (paginated)
// @route   GET /api/commission/transactions
// @access  Private (distributor)
exports.getMyTransactions = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, type } = req.query;
  const distributorId = req.user._id;

  const wallet = await CommissionWallet.findOne({ distributor: distributorId });
  if (!wallet) {
    throw new NotFoundError('No commission wallet found');
  }

  const filters = { wallet: wallet._id };
  if (type) filters.type = type;

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

  const transactions = await CommissionTransaction.find(filters)
    .sort({ createdAt: -1 })
    .limit(limitNum)
    .skip((pageNum - 1) * limitNum)
    .lean();

  const total = await CommissionTransaction.countDocuments(filters);

  res.json({
    success: true,
    transactions,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum)
    }
  });
});

// @desc    Initiate commission payment via PhonePe
// @route   POST /api/commission/payment/initiate
// @access  Private (distributor)
exports.initiatePayment = asyncHandler(async (req, res) => {
  const { amount } = req.body;

  if (!amount || amount <= 0) {
    throw new ValidationError('Valid payment amount is required');
  }

  const result = await initiateCommissionPayment(req.user._id, amount);

  res.json({
    success: true,
    paymentUrl: result.paymentUrl,
    merchantOrderId: result.merchantOrderId
  });
});

// @desc    Check commission payment status
// @route   GET /api/commission/payment/status/:merchantOrderId
// @access  Private (distributor)
exports.checkPaymentStatus = asyncHandler(async (req, res) => {
  const { merchantOrderId } = req.params;

  if (!merchantOrderId) {
    throw new ValidationError('merchantOrderId is required');
  }

  // Check if we already processed it
  const transaction = await CommissionTransaction.findOne({
    'metadata.phonepeMerchantTransactionId': merchantOrderId,
    type: 'payment'
  });

  if (transaction && transaction.status === 'completed') {
    return res.json({
      success: true,
      paymentStatus: 'completed',
      message: 'Payment already processed'
    });
  }

  const statusResponse = await checkCommissionPaymentStatus(merchantOrderId);

  res.json({
    success: true,
    paymentStatus: statusResponse.state === 'COMPLETED' ? 'completed' :
                   statusResponse.state === 'PENDING' ? 'pending' : 'failed'
  });
});

// @desc    Get commission dashboard stats
// @route   GET /api/commission/dashboard
// @access  Private (distributor)
exports.getCommissionDashboard = asyncHandler(async (req, res) => {
  const distributorId = req.user._id;

  const wallet = await CommissionWallet.findOne({ distributor: distributorId })
    .populate('commissionPlan');

  if (!wallet) {
    throw new NotFoundError('No commission wallet found');
  }

  const plan = wallet.commissionPlan;

  res.json({
    success: true,
    dashboard: {
      balance: wallet.balance,
      walletLimit: plan ? plan.walletLimit : 0,
      totalCharged: wallet.totalCommissionCharged,
      totalPaid: wallet.totalCommissionPaid,
      totalOrders: wallet.totalOrders,
      status: wallet.status,
      isLimitExceeded: wallet.isLimitExceeded,
      limitReachedAt: wallet.limitReachedAt,
      graceExpiresAt: wallet.graceExpiresAt,
      lastPaymentDate: wallet.lastPaymentDate,
      plan: plan ? {
        name: plan.name,
        type: plan.type,
        value: plan.value,
        minPaymentAmount: plan.minPaymentAmount,
        earlyPaymentAllowed: plan.earlyPaymentAllowed
      } : null
    }
  });
});
