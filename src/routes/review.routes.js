const express = require('express');
const router = express.Router();
const {
  getAllReviews,
  approveReview,
  rejectReview,
  flagReview,
  replyToReview,
  deleteReview,
  bulkApproveReviews,
  bulkRejectReviews,
  getReviewStats
} = require('../controllers/review.controller');
const authMiddleware = require('../middleware/auth.middleware');
const roleMiddleware = require('../middleware/role.middleware');

// Apply authentication middleware to all routes
router.use(authMiddleware.protect);

// Apply admin authorization to all routes
router.use(roleMiddleware.authorize('admin'));

// Review statistics
router.get('/stats', getReviewStats);

// Bulk operations
router.post('/bulk-approve', bulkApproveReviews);
router.post('/bulk-reject', bulkRejectReviews);

// Single review operations
router.get('/', getAllReviews);
router.put('/:id/approve', approveReview);
router.put('/:id/reject', rejectReview);
router.put('/:id/flag', flagReview);
router.put('/:id/reply', replyToReview);
router.delete('/:id', deleteReview);

module.exports = router;
