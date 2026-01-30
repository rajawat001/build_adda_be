const express = require('express');
const router = express.Router();
const { validators, validate, body } = require('../utils/validators');
const emailAuthController = require('../controllers/email-auth.controller');

// Common validation chains
const otpValidation = [
  body('otp')
    .trim()
    .notEmpty().withMessage('OTP is required')
    .isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits')
    .isNumeric().withMessage('OTP must contain only digits')
];

const passwordValidation = [
  body('newPassword')
    .notEmpty().withMessage('New password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
    .withMessage('Password must contain uppercase, lowercase, number, and special character')
];

// Login OTP
router.post(
  '/send-login',
  validators.email(),
  validate,
  emailAuthController.sendLoginOTP
);

router.post(
  '/verify-login',
  validators.email(),
  ...otpValidation,
  validate,
  emailAuthController.verifyLoginOTP
);

// Registration OTP
router.post(
  '/send-register',
  validators.email(),
  validate,
  emailAuthController.sendRegisterOTP
);

router.post(
  '/verify-register',
  validators.email(),
  ...otpValidation,
  validators.name('name'),
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  validators.phone(),
  validate,
  emailAuthController.verifyRegisterOTP
);

// Password Reset OTP
router.post(
  '/send-reset',
  validators.email(),
  validate,
  emailAuthController.sendResetPasswordOTP
);

router.post(
  '/verify-reset',
  validators.email(),
  ...otpValidation,
  validate,
  emailAuthController.verifyResetPasswordOTP
);

router.post(
  '/reset-password',
  validators.email(),
  ...passwordValidation,
  validate,
  emailAuthController.resetPasswordWithOTP
);

// Resend OTP
router.post(
  '/resend',
  validators.email(),
  body('purpose')
    .notEmpty().withMessage('Purpose is required')
    .isIn(['login', 'register', 'reset-password']).withMessage('Invalid purpose'),
  validate,
  emailAuthController.resendOTP
);

module.exports = router;
