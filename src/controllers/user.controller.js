const asyncHandler = require('../utils/asyncHandler');
const Distributor = require('../models/Distributor');

// @desc    Get all verified distributors (public)
// @route   GET /api/users/distributors
// @access  Public
exports.getAllDistributors = asyncHandler(async (req, res) => {
  const distributors = await Distributor.find({
    isApproved: true,
    isActive: true
  }).select('-password -resetPasswordToken -resetPasswordExpiry -verificationToken -bankAccountNumber -bankIFSC -failedLoginAttempts -lockUntil')
    .sort('-rating');

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

  let coordinates;

  // If lat/lng provided, use directly
  if (lat && lng) {
    coordinates = [parseFloat(lng), parseFloat(lat)]; // GeoJSON format: [lng, lat]
  }
  // If pincode provided, geocode it
  else if (pincode) {
    try {
      // Use a geocoding service to convert pincode to coordinates
      // For now, we'll search by pincode field directly
      const distributors = await Distributor.find({
        pincode: pincode,
        isApproved: true,
        isActive: true
      }).select('-password -resetPasswordToken -resetPasswordExpiry -verificationToken -bankAccountNumber -bankIFSC -failedLoginAttempts -lockUntil')
        .sort('-rating');

      return res.status(200).json({
        success: true,
        count: distributors.length,
        distributors
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'Error searching by pincode'
      });
    }
  }
  else {
    return res.status(400).json({
      success: false,
      error: 'Please provide either pincode or lat/lng coordinates'
    });
  }

  // If we have coordinates, do geospatial search
  if (coordinates) {
    const maxDistanceInMeters = distance * 1000; // Convert km to meters

    const distributors = await Distributor.aggregate([
      {
        $geoNear: {
          near: {
            type: 'Point',
            coordinates: coordinates
          },
          distanceField: 'distance',
          maxDistance: maxDistanceInMeters,
          spherical: true,
          query: {
            isApproved: true,
            isActive: true
          }
        }
      },
      {
        $addFields: {
          distance: {
            $divide: ['$distance', 1000] // Convert meters to km
          }
        }
      },
      {
        $project: {
          password: 0,
          resetPasswordToken: 0,
          resetPasswordExpiry: 0,
          verificationToken: 0,
          bankAccountNumber: 0,
          bankIFSC: 0,
          failedLoginAttempts: 0,
          lockUntil: 0
        }
      },
      {
        $sort: { distance: 1, rating: -1 }
      }
    ]);

    return res.status(200).json({
      success: true,
      count: distributors.length,
      distributors
    });
  }
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
