// Validation Utilities
const { body, param, query, validationResult } = require('express-validator');
const { ValidationError } = require('./errors');

// Validation middleware to check for errors
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(err => err.msg).join(', ');
    throw new ValidationError(errorMessages);
  }
  next();
};

// Common validation rules
const validators = {
  // Email validation
  email: () => body('email')
    .trim()
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),

  // Password validation
  password: () => body('password')
    .trim()
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),

  // Phone validation (Indian format)
  phone: () => body('phone')
    .trim()
    .matches(/^[6-9]\d{9}$/).withMessage('Please provide a valid 10-digit Indian phone number'),

  // Pincode validation (Indian format)
  pincode: () => body('pincode')
    .trim()
    .matches(/^\d{6}$/).withMessage('Please provide a valid 6-digit pincode'),

  // Name validation
  name: (field = 'name') => body(field)
    .trim()
    .notEmpty().withMessage(`${field} is required`)
    .isLength({ min: 2, max: 100 }).withMessage(`${field} must be between 2 and 100 characters`),

  // MongoDB ObjectId validation
  mongoId: (field = 'id') => param(field)
    .isMongoId().withMessage('Invalid ID format'),

  // Price validation
  price: () => body('price')
    .isFloat({ min: 0.01 }).withMessage('Price must be greater than 0')
    .toFloat(),

  // Stock validation
  stock: () => body('stock')
    .isInt({ min: 0 }).withMessage('Stock must be a non-negative integer')
    .toInt(),

  // Quantity validation
  quantity: () => body('quantity')
    .isInt({ min: 1 }).withMessage('Quantity must be at least 1')
    .toInt(),

  // Pagination validation
  pagination: () => [
    query('page')
      .optional()
      .isInt({ min: 1 }).withMessage('Page must be a positive integer')
      .toInt(),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
      .toInt()
  ],

  // Category validation
  category: () => body('category')
    .optional()
    .isIn(['Cement', 'Steel', 'Bricks', 'Sand', 'Paint', 'Tiles', 'Other'])
    .withMessage('Invalid category'),

  // Payment method validation
  paymentMethod: () => body('paymentMethod')
    .isIn(['COD', 'Online']).withMessage('Payment method must be either COD or Online'),

  // Order status validation
  orderStatus: () => body('status')
    .isIn(['pending', 'processing', 'shipped', 'delivered', 'cancelled'])
    .withMessage('Invalid order status'),

  // Discount type validation
  discountType: () => body('discountType')
    .isIn(['percentage', 'fixed']).withMessage('Discount type must be either percentage or fixed'),

  // Coordinates validation
  coordinates: () => [
    body('location.coordinates.0')
      .isFloat({ min: -180, max: 180 }).withMessage('Longitude must be between -180 and 180'),
    body('location.coordinates.1')
      .isFloat({ min: -90, max: 90 }).withMessage('Latitude must be between -90 and 90')
  ]
};

module.exports = {
  validate,
  validators,
  body,
  param,
  query
};
