const Review = require('../models/Review');
const Product = require('../models/Product');
const Distributor = require('../models/Distributor');

// @desc    Get all reviews
// @route   GET /api/admin/reviews
// @access  Private/Admin
exports.getAllReviews = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, type, rating, search } = req.query;

    // Validate and limit pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    const filter = {};

    // Filter by status
    if (status === 'pending') {
      filter.isApproved = false;
      filter.isFlagged = false;
    } else if (status === 'approved') {
      filter.isApproved = true;
    } else if (status === 'rejected') {
      filter.isApproved = false;
    } else if (status === 'flagged') {
      filter.isFlagged = true;
    }

    // Filter by type
    if (type === 'product') {
      filter.product = { $exists: true, $ne: null };
    } else if (type === 'distributor') {
      filter.distributor = { $exists: true, $ne: null };
    }

    // Filter by rating
    if (rating) {
      filter.rating = parseInt(rating);
    }

    // Search by user name or comment
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      filter.$or = [
        { comment: searchRegex }
      ];
    }

    const reviews = await Review.find(filter)
      .populate('user', 'name email')
      .populate('product', 'name')
      .populate('distributor', 'businessName slug')
      .populate('approvedBy', 'name')
      .sort('-createdAt')
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum);

    const total = await Review.countDocuments(filter);

    res.json({
      success: true,
      reviews,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Get reviews error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reviews',
      error: error.message
    });
  }
};

// @desc    Approve review
// @route   PUT /api/admin/reviews/:id/approve
// @access  Private/Admin
exports.approveReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    review.isApproved = true;
    review.approvedBy = req.user._id;
    review.isFlagged = false; // Remove flag when approving

    await review.save();

    res.json({
      success: true,
      message: 'Review approved successfully',
      review
    });
  } catch (error) {
    console.error('Approve review error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve review',
      error: error.message
    });
  }
};

// @desc    Reject review
// @route   PUT /api/admin/reviews/:id/reject
// @access  Private/Admin
exports.rejectReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    review.isApproved = false;
    review.approvedBy = null;

    await review.save();

    res.json({
      success: true,
      message: 'Review rejected successfully',
      review
    });
  } catch (error) {
    console.error('Reject review error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject review',
      error: error.message
    });
  }
};

// @desc    Flag review
// @route   PUT /api/admin/reviews/:id/flag
// @access  Private/Admin
exports.flagReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    review.isFlagged = !review.isFlagged;

    await review.save();

    res.json({
      success: true,
      message: review.isFlagged ? 'Review flagged successfully' : 'Review unflagged successfully',
      review
    });
  } catch (error) {
    console.error('Flag review error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to flag review',
      error: error.message
    });
  }
};

// @desc    Reply to review
// @route   PUT /api/admin/reviews/:id/reply
// @access  Private/Admin
exports.replyToReview = async (req, res) => {
  try {
    const { adminReply } = req.body;

    if (!adminReply || !adminReply.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Reply text is required'
      });
    }

    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    review.adminReply = adminReply;

    await review.save();

    res.json({
      success: true,
      message: 'Reply added successfully',
      review
    });
  } catch (error) {
    console.error('Reply to review error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reply to review',
      error: error.message
    });
  }
};

// @desc    Delete review
// @route   DELETE /api/admin/reviews/:id
// @access  Private/Admin
exports.deleteReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    await review.deleteOne();

    res.json({
      success: true,
      message: 'Review deleted successfully'
    });
  } catch (error) {
    console.error('Delete review error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete review',
      error: error.message
    });
  }
};

// @desc    Bulk approve reviews
// @route   POST /api/admin/reviews/bulk-approve
// @access  Private/Admin
exports.bulkApproveReviews = async (req, res) => {
  try {
    const { reviewIds } = req.body;

    if (!Array.isArray(reviewIds) || reviewIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of review IDs'
      });
    }

    const result = await Review.updateMany(
      { _id: { $in: reviewIds } },
      {
        $set: {
          isApproved: true,
          approvedBy: req.user._id,
          isFlagged: false
        }
      }
    );

    res.json({
      success: true,
      message: `Successfully approved ${result.modifiedCount} review(s)`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Bulk approve reviews error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve reviews',
      error: error.message
    });
  }
};

// @desc    Bulk reject reviews
// @route   POST /api/admin/reviews/bulk-reject
// @access  Private/Admin
exports.bulkRejectReviews = async (req, res) => {
  try {
    const { reviewIds } = req.body;

    if (!Array.isArray(reviewIds) || reviewIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of review IDs'
      });
    }

    const result = await Review.updateMany(
      { _id: { $in: reviewIds } },
      {
        $set: {
          isApproved: false,
          approvedBy: null
        }
      }
    );

    res.json({
      success: true,
      message: `Successfully rejected ${result.modifiedCount} review(s)`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Bulk reject reviews error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject reviews',
      error: error.message
    });
  }
};

// @desc    Get review statistics
// @route   GET /api/admin/reviews/stats
// @access  Private/Admin
exports.getReviewStats = async (req, res) => {
  try {
    const [
      total,
      pending,
      approved,
      rejected,
      flagged,
      avgRatingResult
    ] = await Promise.all([
      Review.countDocuments(),
      Review.countDocuments({ isApproved: false, isFlagged: false }),
      Review.countDocuments({ isApproved: true }),
      Review.countDocuments({ isApproved: false }),
      Review.countDocuments({ isFlagged: true }),
      Review.aggregate([
        { $group: { _id: null, avgRating: { $avg: '$rating' } } }
      ])
    ]);

    const avgRating = avgRatingResult[0]?.avgRating || 0;

    res.json({
      success: true,
      stats: {
        total,
        pending,
        approved,
        rejected,
        flagged,
        avgRating
      }
    });
  } catch (error) {
    console.error('Get review stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch review statistics',
      error: error.message
    });
  }
};
