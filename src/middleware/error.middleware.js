const { AppError } = require('../utils/errors');
const { sendError } = require('../utils/response');
const logger = require('../utils/logger');

// Map error names to standardized error codes
const ERROR_CODE_MAP = {
  'CastError': 'NOT_FOUND',
  'ValidationError': 'VALIDATION_ERROR',
  'JsonWebTokenError': 'INVALID_TOKEN',
  'TokenExpiredError': 'TOKEN_EXPIRED',
  'AuthenticationError': 'AUTHENTICATION_ERROR',
  'AuthorizationError': 'AUTHORIZATION_ERROR',
  'NotFoundError': 'NOT_FOUND',
  'ConflictError': 'CONFLICT'
};

// Enhanced error handler middleware
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  error.statusCode = err.statusCode;

  // Log error for debugging
  if (process.env.NODE_ENV === 'development') {
    logger.error('Request error', { message: err.message, stack: err.stack });
  } else {
    logger.error('Request error', { message: err.message, name: err.name });
  }

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = new AppError(message, 404);
    error.name = 'CastError';
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`;
    error = new AppError(message, 409);
    error.name = 'ConflictError';
  }

  // Mongoose validation error (from model validation)
  if (err.name === 'ValidationError' && err.errors) {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = new AppError(message, 400);
    error.name = 'ValidationError';
  }

  // JWT errors (if not already handled in auth middleware)
  if (err.name === 'JsonWebTokenError') {
    error = new AppError('Invalid token', 401);
    error.name = 'JsonWebTokenError';
  }

  if (err.name === 'TokenExpiredError') {
    error = new AppError('Token expired', 401);
    error.name = 'TokenExpiredError';
  }

  // Express-validator errors
  if (err.array && typeof err.array === 'function') {
    const message = err.array().map(e => e.msg).join(', ');
    error = new AppError(message, 400);
    error.name = 'ValidationError';
  }

  // Default to 500 server error
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Server Error';

  // Determine error code
  const code = err.errorCode || ERROR_CODE_MAP[err.name] || ERROR_CODE_MAP[error.name] || 'INTERNAL_ERROR';

  // Build details object
  const details = {};

  // Add validation details if available (for express-validator errors)
  if (err.details && Array.isArray(err.details)) {
    details.validationErrors = err.details;
  }

  // Add stack trace in development
  if (process.env.NODE_ENV === 'development') {
    details.stack = err.stack;
  }

  return sendError(res, {
    message,
    code,
    statusCode,
    details: Object.keys(details).length > 0 ? details : undefined
  });
};

// 404 Not Found handler
const notFound = (req, res, next) => {
  const error = new AppError(`Not Found - ${req.originalUrl}`, 404);
  next(error);
};

module.exports = {
  errorHandler,
  notFound
};
