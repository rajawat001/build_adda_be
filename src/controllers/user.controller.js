const asyncHandler = require('../utils/asyncHandler');
const Distributor = require('../models/Distributor');
const Product = require('../models/Product');
const { sendSuccess, sendError } = require('../utils/response');

// @desc    Get all verified distributors (public)
// @route   GET /api/users/distributors
// @access  Public
exports.getAllDistributors = asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 20, city: queryCityParam } = req.query;
  const locationCity = queryCityParam || req.headers['x-client-city'] || '';
  const filters = { isApproved: true, isActive: true, planType: { $ne: 'none' }, isWalletLocked: { $ne: true } };

  // City-based filtering (auto from header or explicit from query)
  if (locationCity && locationCity.trim() && !search) {
    const escapedCity = locationCity.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filters.city = { $regex: `^${escapedCity}$`, $options: 'i' };
  }

  if (search && search.trim()) {
    const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filters.$or = [
      { businessName: { $regex: escaped, $options: 'i' } },
      { city: { $regex: escaped, $options: 'i' } },
      { state: { $regex: escaped, $options: 'i' } }
    ];
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const distributors = await Distributor.find(filters)
    .select('-password -resetPasswordToken -resetPasswordExpiry -verificationToken -bankAccountNumber -bankIFSC -failedLoginAttempts -lockUntil')
    .sort('-rating')
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

  // Attach product count for each distributor
  const distributorIds = distributors.map(d => d._id);
  const productCounts = await Product.aggregate([
    { $match: { distributor: { $in: distributorIds }, isActive: true } },
    { $group: { _id: '$distributor', count: { $sum: 1 } } }
  ]);
  const countMap = {};
  productCounts.forEach(pc => { countMap[pc._id.toString()] = pc.count; });
  distributors.forEach(d => { d.productCount = countMap[d._id.toString()] || 0; });

  return sendSuccess(res, {
    data: { distributors, count: distributors.length }
  });
});

// @desc    Get nearby distributors
// @route   GET /api/users/distributors/nearby
// @access  Public
// Query params: ?pincode=123456&city=Jaipur OR ?lat=12.34&lng=56.78&pincode=302001&city=Jaipur
exports.getNearbyDistributors = asyncHandler(async (req, res) => {
  const { pincode, city: queryCityParam, lat, lng } = req.query;
  const city = queryCityParam || req.headers['x-client-city'] || '';

  const sensitiveFields = '-password -resetPasswordToken -resetPasswordExpiry -verificationToken -bankAccountNumber -bankIFSC -failedLoginAttempts -lockUntil';

  // Strategy: pincode and city are the PRIMARY filters (trustworthy).
  // $geoNear is NOT used for filtering because distributor coordinates
  // can be wrong in DB. We only use text matching.
  //
  // Priority:
  // 1. Exact pincode match → distance = 0
  // 2. Same city match (case-insensitive) → distance = null
  // 3. Same pincode region (first 3 digits) → distance = null
  // 4. If all empty → return empty (frontend shows "expanding" message)

  if (!pincode && !city) {
    return sendError(res, {
      message: 'Please provide pincode or city',
      code: 'VALIDATION_ERROR',
      statusCode: 400
    });
  }

  const seenIds = new Set();
  let allDistributors = [];

  // 1) Exact pincode match — highest priority
  if (pincode) {
    const pincodeResults = await Distributor.find({
      pincode: pincode,
      isApproved: true,
      isActive: true,
      planType: { $ne: 'none' },
      isWalletLocked: { $ne: true }
    }).select(sensitiveFields).sort('-rating').lean();

    pincodeResults.forEach(d => {
      seenIds.add(d._id.toString());
      allDistributors.push({ ...d, distance: 0 });
    });
  }

  // 2) Same city match (case-insensitive) — catches distributors with different pincodes but same city
  if (city && city.trim()) {
    const escaped = city.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const cityResults = await Distributor.find({
      city: { $regex: `^${escaped}$`, $options: 'i' },
      isApproved: true,
      isActive: true,
      planType: { $ne: 'none' },
      isWalletLocked: { $ne: true }
    }).select(sensitiveFields).sort('-rating').lean();

    cityResults.forEach(d => {
      if (!seenIds.has(d._id.toString())) {
        seenIds.add(d._id.toString());
        allDistributors.push({ ...d, distance: null });
      }
    });
  }

  // 3) Same pincode region (first 3 digits) — only if still no results
  if (allDistributors.length === 0 && pincode && /^\d{6}$/.test(pincode)) {
    const pincodePrefix = pincode.substring(0, 3);
    const regionResults = await Distributor.find({
      pincode: { $regex: `^${pincodePrefix}` },
      isApproved: true,
      isActive: true,
      planType: { $ne: 'none' },
      isWalletLocked: { $ne: true }
    }).select(sensitiveFields).sort('-rating').lean();

    regionResults.forEach(d => {
      if (!seenIds.has(d._id.toString())) {
        seenIds.add(d._id.toString());
        allDistributors.push({ ...d, distance: null });
      }
    });
  }

  return sendSuccess(res, {
    data: { distributors: allDistributors, count: allDistributors.length }
  });
});

// @desc    Get single distributor profile (public)
// @route   GET /api/users/distributors/:id
// @access  Public
exports.getDistributorProfile = asyncHandler(async (req, res) => {
  const param = req.params.id;

  // Check if param is a valid MongoDB ObjectID or a slug
  const isObjectId = /^[0-9a-fA-F]{24}$/.test(param);
  const lookupQuery = isObjectId ? { _id: param } : { slug: param };

  const distributor = await Distributor.findOne({
    ...lookupQuery,
    isApproved: true,
    isActive: true,
    planType: { $ne: 'none' },
    isWalletLocked: { $ne: true }
  }).select('-password -resetPasswordToken -resetPasswordExpiry -verificationToken -bankAccountNumber -bankIFSC -failedLoginAttempts -lockUntil');

  if (!distributor) {
    return sendError(res, {
      message: 'Distributor not found',
      code: 'NOT_FOUND',
      statusCode: 404
    });
  }

  return sendSuccess(res, { data: { distributor } });
});
