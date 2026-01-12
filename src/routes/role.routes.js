const express = require('express');
const router = express.Router();
const {
  getAllRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
  getRoleStats,
  checkPermission
} = require('../controllers/role.controller');
const authMiddleware = require('../middleware/auth.middleware');
const roleMiddleware = require('../middleware/role.middleware');

// Apply authentication middleware to all routes
router.use(authMiddleware.protect);

// Apply admin authorization to all routes
router.use(roleMiddleware.authorize('admin'));

// Role statistics
router.get('/stats', getRoleStats);

// Check permission
router.post('/check-permission', checkPermission);

// CRUD operations
router.route('/')
  .get(getAllRoles)
  .post(createRole);

router.route('/:id')
  .get(getRoleById)
  .put(updateRole)
  .delete(deleteRole);

module.exports = router;
