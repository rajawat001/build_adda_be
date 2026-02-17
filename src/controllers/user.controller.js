const asyncHandler = require('../utils/asyncHandler');
const Distributor = require('../models/Distributor');

// @desc    Get all verified distributors (public)
// @route   GET /api/users/distributors
// @access  Public
exports.getAllDistributors = asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 20 } = req.query;
  const filters = { isApproved: true, isActive: true };

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
    .limit(parseInt(limit));

  res.status(200).json({
    success: true,
    count: distributors.length,
    distributors
  });
});

// @desc    Get nearby distributors
// @route   GET /api/users/distributors/nearby
// @access  Public
// Query params: ?pincode=123456&distance=50 OR ?lat=12.34&lng=56.78&distance=50
exports.getNearbyDistributors = asyncHandler(async (req, res) => {
  const { pincode, lat, lng, distance = 50 } = req.query;

  const sensitiveFields = '-password -resetPasswordToken -resetPasswordExpiry -verificationToken -bankAccountNumber -bankIFSC -failedLoginAttempts -lockUntil';

  // Strategy: try $geoNear for distributors with coordinates, then ALSO
  // match by pincode/city since many distributors may lack geo coordinates.
  // Merge results, sort by distance (geo first, then pincode matches).

  if (lat && lng) {
    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    const maxDistanceMeters = parseFloat(distance) * 1000;
    const seenIds = new Set();
    let allDistributors = [];

    // 1) Try $geoNear for distributors that have coordinates
    try {
      const geoResults = await Distributor.aggregate([
        {
          $geoNear: {
            near: { type: 'Point', coordinates: [parsedLng, parsedLat] },
            distanceField: 'distance',
            maxDistance: maxDistanceMeters,
            spherical: true,
            query: { isApproved: true, isActive: true }
          }
        },
        {
          $addFields: {
            distance: { $divide: ['$distance', 1000] } // meters → km
          }
        },
        {
          $project: {
            password: 0, resetPasswordToken: 0, resetPasswordExpiry: 0,
            verificationToken: 0, bankAccountNumber: 0, bankIFSC: 0,
            failedLoginAttempts: 0, lockUntil: 0
          }
        },
        { $sort: { distance: 1, rating: -1 } }
      ]);

      geoResults.forEach(d => {
        seenIds.add(d._id.toString());
        allDistributors.push(d);
      });
    } catch (geoErr) {
      // $geoNear can fail if no documents have coordinates — ignore
    }

    // 2) Also find distributors by pincode match (covers those without coordinates)
    if (pincode) {
      const pincodeResults = await Distributor.find({
        pincode: pincode,
        isApproved: true,
        isActive: true
      }).select(sensitiveFields).sort('-rating').lean();

      pincodeResults.forEach(d => {
        if (!seenIds.has(d._id.toString())) {
          seenIds.add(d._id.toString());
          allDistributors.push({ ...d, distance: 0 }); // same pincode = closest
        }
      });
    }

    // 3) If still no results, try matching by city (extracted from reverse geocoding)
    if (allDistributors.length === 0 && pincode) {
      // Try nearby pincodes (same first 3 digits = same region in India)
      const pincodePrefix = pincode.toString().substring(0, 3);
      const regionResults = await Distributor.find({
        pincode: { $regex: `^${pincodePrefix}` },
        isApproved: true,
        isActive: true
      }).select(sensitiveFields).sort('-rating').lean();

      regionResults.forEach(d => {
        if (!seenIds.has(d._id.toString())) {
          seenIds.add(d._id.toString());
          allDistributors.push({ ...d, distance: null });
        }
      });
    }

    return res.status(200).json({
      success: true,
      count: allDistributors.length,
      distributors: allDistributors
    });
  }

  // Only pincode provided (no lat/lng)
  if (pincode) {
    const seenIds = new Set();
    let allDistributors = [];

    // Exact pincode match
    const exactMatch = await Distributor.find({
      pincode: pincode,
      isApproved: true,
      isActive: true
    }).select(sensitiveFields).sort('-rating').lean();

    exactMatch.forEach(d => {
      seenIds.add(d._id.toString());
      allDistributors.push({ ...d, distance: 0 });
    });

    // If no exact match, try same region (first 3 digits)
    if (allDistributors.length === 0) {
      const pincodePrefix = pincode.toString().substring(0, 3);
      const regionResults = await Distributor.find({
        pincode: { $regex: `^${pincodePrefix}` },
        isApproved: true,
        isActive: true
      }).select(sensitiveFields).sort('-rating').lean();

      regionResults.forEach(d => {
        if (!seenIds.has(d._id.toString())) {
          allDistributors.push({ ...d, distance: null });
        }
      });
    }

    return res.status(200).json({
      success: true,
      count: allDistributors.length,
      distributors: allDistributors
    });
  }

  return res.status(400).json({
    success: false,
    error: 'Please provide either pincode or lat/lng coordinates'
  });
});

// @desc    Get single distributor profile (public)
// @route   GET /api/users/distributors/:id
// @access  Public
exports.getDistributorProfile = asyncHandler(async (req, res) => {
  const distributor = await Distributor.findOne({
    _id: req.params.id,
    isApproved: true,
    isActive: true
  }).select('-password -resetPasswordToken -resetPasswordExpiry -verificationToken -bankAccountNumber -bankIFSC -failedLoginAttempts -lockUntil');

  if (!distributor) {
    return res.status(404).json({
      success: false,
      error: 'Distributor not found'
    });
  }

  res.status(200).json({
    success: true,
    distributor
  });
});
