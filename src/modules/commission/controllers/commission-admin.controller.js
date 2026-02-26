const CommissionPlan = require('../models/CommissionPlan');
const CommissionWallet = require('../models/CommissionWallet');
const CommissionTransaction = require('../models/CommissionTransaction');
const Distributor = require('../../../models/Distributor');
const asyncHandler = require('../../../utils/asyncHandler');
const { ValidationError, NotFoundError } = require('../../../utils/errors');
const { unlockWallet } = require('../services/wallet.service');

// ─── PLAN MANAGEMENT ───

// @desc    Create commission plan
// @route   POST /api/admin/commission/plans
exports.createPlan = asyncHandler(async (req, res) => {
  const { name, description, type, value, walletLimit, minPaymentAmount, gracePeriodDays, earlyPaymentAllowed } = req.body;

  if (!name || !type || value == null || !walletLimit || !minPaymentAmount) {
    throw new ValidationError('name, type, value, walletLimit, and minPaymentAmount are required');
  }

  if (type === 'percentage' && (value <= 0 || value > 100)) {
    throw new ValidationError('Percentage value must be between 0 and 100');
  }

  const plan = await CommissionPlan.create({
    name,
    description,
    type,
    value,
    walletLimit,
    minPaymentAmount,
    gracePeriodDays: gracePeriodDays || 3,
    earlyPaymentAllowed: earlyPaymentAllowed !== false,
    createdBy: req.user._id
  });

  res.status(201).json({ success: true, plan });
});

// @desc    Get all plans (active + inactive)
// @route   GET /api/admin/commission/plans
exports.getAllPlans = asyncHandler(async (req, res) => {
  const plans = await CommissionPlan.find()
    .populate('createdBy', 'name email')
    .sort({ createdAt: -1 });

  res.json({ success: true, plans });
});

// @desc    Update commission plan
// @route   PUT /api/admin/commission/plans/:id
exports.updatePlan = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  // Don't allow changing type if distributors are using this plan
  if (updates.type) {
    const walletsUsingPlan = await CommissionWallet.countDocuments({ commissionPlan: id });
    if (walletsUsingPlan > 0) {
      throw new ValidationError('Cannot change plan type while distributors are using it');
    }
  }

  const plan = await CommissionPlan.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
  if (!plan) {
    throw new NotFoundError('Plan not found');
  }

  res.json({ success: true, plan });
});

// @desc    Toggle plan active status
// @route   PATCH /api/admin/commission/plans/:id/toggle
exports.togglePlanStatus = asyncHandler(async (req, res) => {
  const plan = await CommissionPlan.findById(req.params.id);
  if (!plan) {
    throw new NotFoundError('Plan not found');
  }

  plan.isActive = !plan.isActive;
  await plan.save();

  res.json({ success: true, plan, message: `Plan ${plan.isActive ? 'activated' : 'deactivated'}` });
});

// ─── WALLET MANAGEMENT ───

// @desc    Get all wallets with filters
// @route   GET /api/admin/commission/wallets
exports.getAllWallets = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const filters = {};

  if (status === 'locked') filters.status = 'locked';
  else if (status === 'limit_exceeded') filters.isLimitExceeded = true;
  else if (status === 'active') filters.status = 'active';

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

  const wallets = await CommissionWallet.find(filters)
    .populate('distributor', 'businessName name email phone city pincode')
    .populate('commissionPlan', 'name type value walletLimit')
    .sort({ balance: -1 })
    .limit(limitNum)
    .skip((pageNum - 1) * limitNum)
    .lean();

  const total = await CommissionWallet.countDocuments(filters);

  res.json({
    success: true,
    wallets,
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
  });
});

// @desc    Get specific distributor's wallet
// @route   GET /api/admin/commission/wallets/:distributorId
exports.getWalletDetails = asyncHandler(async (req, res) => {
  const wallet = await CommissionWallet.findOne({ distributor: req.params.distributorId })
    .populate('distributor', 'businessName name email phone city')
    .populate('commissionPlan');

  if (!wallet) {
    throw new NotFoundError('Wallet not found');
  }

  const recentTransactions = await CommissionTransaction.find({ wallet: wallet._id })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  res.json({
    success: true,
    wallet: { ...wallet.toObject(), recentTransactions }
  });
});

// @desc    Manual wallet adjustment
// @route   POST /api/admin/commission/wallets/:distributorId/adjust
exports.adjustWallet = asyncHandler(async (req, res) => {
  const { amount, reason } = req.body;
  const { distributorId } = req.params;

  if (amount == null || !reason) {
    throw new ValidationError('Amount and reason are required');
  }

  const wallet = await CommissionWallet.findOne({ distributor: distributorId });
  if (!wallet) {
    throw new NotFoundError('Wallet not found');
  }

  // Prevent negative final balance
  if (wallet.balance + amount < 0) {
    throw new ValidationError('Adjustment would result in negative balance');
  }

  const updatedWallet = await CommissionWallet.findByIdAndUpdate(
    wallet._id,
    { $inc: { balance: amount } },
    { new: true }
  );

  await CommissionTransaction.create({
    distributor: distributorId,
    wallet: wallet._id,
    type: 'adjustment',
    amount,
    balanceAfter: updatedWallet.balance,
    description: `Admin adjustment: ${reason}`,
    metadata: {
      adjustedBy: req.user._id,
      adjustmentReason: reason
    },
    status: 'completed'
  });

  // Check if we should unlock after adjustment
  const plan = await CommissionPlan.findById(wallet.commissionPlan);
  if (plan && updatedWallet.balance < plan.walletLimit && updatedWallet.isLimitExceeded) {
    await unlockWallet(distributorId);
  }

  res.json({ success: true, message: 'Wallet adjusted', balance: updatedWallet.balance });
});

// @desc    Force unlock distributor
// @route   POST /api/admin/commission/wallets/:distributorId/unlock
exports.forceUnlock = asyncHandler(async (req, res) => {
  const { distributorId } = req.params;

  await unlockWallet(distributorId);

  res.json({ success: true, message: 'Distributor unlocked' });
});

// ─── TRANSACTIONS ───

// @desc    Get all transactions with filters
// @route   GET /api/admin/commission/transactions
exports.getAllTransactions = asyncHandler(async (req, res) => {
  const { type, distributorId, page = 1, limit = 20 } = req.query;
  const filters = {};

  if (type) filters.type = type;
  if (distributorId) filters.distributor = distributorId;

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

  const transactions = await CommissionTransaction.find(filters)
    .populate('distributor', 'businessName name email')
    .sort({ createdAt: -1 })
    .limit(limitNum)
    .skip((pageNum - 1) * limitNum)
    .lean();

  const total = await CommissionTransaction.countDocuments(filters);

  res.json({
    success: true,
    transactions,
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
  });
});

// ─── DASHBOARD ───

// @desc    Get admin commission dashboard
// @route   GET /api/admin/commission/dashboard
exports.getAdminDashboard = asyncHandler(async (req, res) => {
  const [
    totalWallets,
    lockedWallets,
    limitExceededWallets,
    aggregation
  ] = await Promise.all([
    CommissionWallet.countDocuments(),
    CommissionWallet.countDocuments({ status: 'locked' }),
    CommissionWallet.countDocuments({ isLimitExceeded: true }),
    CommissionWallet.aggregate([
      {
        $group: {
          _id: null,
          totalOutstanding: { $sum: '$balance' },
          totalCharged: { $sum: '$totalCommissionCharged' },
          totalCollected: { $sum: '$totalCommissionPaid' }
        }
      }
    ])
  ]);

  const stats = aggregation[0] || { totalOutstanding: 0, totalCharged: 0, totalCollected: 0 };

  res.json({
    success: true,
    dashboard: {
      totalWallets,
      lockedWallets,
      limitExceededWallets,
      totalOutstanding: stats.totalOutstanding,
      totalCharged: stats.totalCharged,
      totalCollected: stats.totalCollected
    }
  });
});
