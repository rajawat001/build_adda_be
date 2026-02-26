const express = require('express');
const router = express.Router();
const {
  register,
  login,
  getProfile,
  updateProfile,
  addAddress,
  updateAddress,
  deleteAddress,
  logout
} = require('../controllers/auth.controller');
const { googleAuth, googleRegisterDistributor } = require('../controllers/google-auth.controller');
const { protect } = require('../middleware/auth.middleware');
const { validators, validate, body } = require('../utils/validators');

// @route   POST /api/auth/register
// @desc    Register new user
// @access  Public
router.post('/register',
  validators.name('name'),
  validators.email(),
  validators.password(),
  validators.phone(),
  validate,
  register
);

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login',
  validators.email(),
  body('password').notEmpty().withMessage('Password is required'),
  validate,
  login
);

// @route   POST /api/auth/logout
// @desc    Logout user (clear cookie)
// @access  Private
router.post('/logout', protect, logout);

// @route   GET /api/auth/profile
// @desc    Get current user profile
// @access  Private
router.get('/profile', protect, getProfile);

// @route   PUT /api/auth/profile
// @desc    Update user profile
// @access  Private
router.put('/profile',
  protect,
  // Optional fields, only validate if present
  body('name').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
  body('phone').optional().matches(/^[6-9]\d{9}$/).withMessage('Invalid phone number'),
  body('newPassword').optional().isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  validate,
  updateProfile
);

// @route   POST /api/auth/addresses
// @desc    Add new address
// @access  Private
router.post('/addresses',
  protect,
  validators.name('fullName'),
  validators.phone(),
  body('address').trim().notEmpty().isLength({ min: 10 }).withMessage('Address must be at least 10 characters'),
  body('city').trim().notEmpty().withMessage('City is required'),
  body('state').trim().notEmpty().withMessage('State is required'),
  validators.pincode(),
  validate,
  addAddress
);

// @route   PUT /api/auth/addresses/:addressId
// @desc    Update address
// @access  Private
router.put('/addresses/:addressId',
  protect,
  validators.mongoId('addressId'),
  // All fields optional for updates
  body('fullName').optional().trim().isLength({ min: 2, max: 100 }),
  body('phone').optional().matches(/^[6-9]\d{9}$/),
  body('address').optional().trim().isLength({ min: 10 }),
  body('city').optional().trim().notEmpty(),
  body('state').optional().trim().notEmpty(),
  body('pincode').optional().matches(/^\d{6}$/),
  validate,
  updateAddress
);

// @route   DELETE /api/auth/addresses/:addressId
// @desc    Delete address
// @access  Private
router.delete('/addresses/:addressId',
  protect,
  validators.mongoId('addressId'),
  validate,
  deleteAddress
);

// @route   POST /api/auth/google
// @desc    Google OAuth login/register
// @access  Public
router.post('/google',
  body('credential').notEmpty().withMessage('Google credential is required'),
  validate,
  googleAuth
);

// @route   POST /api/auth/google/register-distributor
// @desc    Google OAuth register as distributor (with business details)
// @access  Public
router.post('/google/register-distributor',
  body('credential').notEmpty().withMessage('Google credential is required'),
  body('businessName').trim().notEmpty().withMessage('Business name is required'),
  body('phone').matches(/^[6-9]\d{9}$/).withMessage('Invalid phone number'),
  body('address').trim().isLength({ min: 10 }).withMessage('Address must be at least 10 characters'),
  body('city').trim().notEmpty().withMessage('City is required'),
  body('state').trim().notEmpty().withMessage('State is required'),
  body('pincode').matches(/^\d{6}$/).withMessage('Invalid pincode'),
  validate,
  googleRegisterDistributor
);

module.exports = router;
