const express = require('express');
const router = express.Router();
const multer = require('multer');
const {
  getExportStats,
  exportCollection,
  exportAll,
  importCollection,
  importAll
} = require('../controllers/export.controller');
const authMiddleware = require('../middleware/auth.middleware');
const roleMiddleware = require('../middleware/role.middleware');

// Apply authentication and admin authorization to all routes
router.use(authMiddleware.protect);
router.use(roleMiddleware.authorize('admin'));

// Configure multer for CSV file uploads (memory storage)
const uploadCSV = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  }
});

// Configure multer for JSON file uploads (for import-all)
const uploadJSON = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit for full backup
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/json' || file.originalname.endsWith('.json')) {
      cb(null, true);
    } else {
      cb(new Error('Only JSON files are allowed'), false);
    }
  }
});

// Export stats
router.get('/stats', getExportStats);

// Export all collections
router.get('/all', exportAll);

// Import all collections from JSON backup
router.post('/all', uploadJSON.single('file'), importAll);

// Export single collection
router.get('/:collection', exportCollection);

// Import single collection
router.post('/:collection', uploadCSV.single('file'), importCollection);

module.exports = router;
