const express = require('express');
const router = express.Router();
const {
  getAllCategories,
  getCategoryTree,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
  getCategoryStats
} = require('../controllers/category.controller');
const authMiddleware = require('../middleware/auth.middleware');
const roleMiddleware = require('../middleware/role.middleware');

// Apply authentication middleware to all routes
router.use(authMiddleware.protect);

// Apply admin authorization to all routes
router.use(roleMiddleware.authorize('admin'));

// Category statistics
router.get('/stats', getCategoryStats);

// Category tree view
router.get('/tree', getCategoryTree);

// Reorder categories
router.put('/reorder', reorderCategories);

// CRUD operations
router.route('/')
  .get(getAllCategories)
  .post(createCategory);

router.route('/:id')
  .get(getCategoryById)
  .put(updateCategory)
  .delete(deleteCategory);

module.exports = router;
