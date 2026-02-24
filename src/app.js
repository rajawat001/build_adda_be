// Load environment variables FIRST before any other imports
const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const morgan = require('morgan');
const cron = require('node-cron');
const connectDB = require('./config/db');
const { errorHandler, notFound } = require('./middleware/error.middleware');
const { processSubscriptionRenewals, sendRenewalReminders } = require('./jobs/subscriptionRenewal.job');
const { runSlugMigration } = require('./scripts/migrateSlug');

// Validate required environment variables
const requiredEnvVars = ['JWT_SECRET', 'MONGODB_URI'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

const app = express();

// Trust proxy (required for ngrok, Vercel, etc. to get correct client IP for rate limiting)
app.set('trust proxy', 1);

// Connect to database
connectDB();

// SECURITY: Helmet - Set security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      frameSrc: ["'self'"],
    }
  },
  crossOriginEmbedderPolicy: false
}));

// SECURITY: CORS configuration for cross-domain cookies
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://192.168.1.3:3000',
  'http://10.113.173.206:3000',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // Allow Vercel and ngrok URLs
      if (origin.includes('.vercel.app') || origin.includes('.ngrok-free.app') || origin.includes('.ngrok.io')) {
        callback(null, true);
      } else {
        console.log('Blocked by CORS:', origin);
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true, // CRITICAL: Allow cookies to be sent
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  exposedHeaders: ['Set-Cookie']
}));

// SECURITY: Rate limiting to prevent brute force attacks
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 50000 : 100, // Higher limit in development
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});

// Stricter rate limit for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: 'Too many login attempts, please try again later',
  skipSuccessfulRequests: true  // Don't count successful requests
});

// Apply rate limiting
app.use('/api/', limiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Rate limiter for OTP endpoints (3 requests per 15 min per IP)
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'development' ? 50 : 3,
  message: 'Too many OTP requests, please try again later',
  skipSuccessfulRequests: false
});
app.use('/api/auth/otp', otpLimiter);

// Body parser middleware with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie parser
app.use(cookieParser());

// SECURITY: Sanitize data to prevent NoSQL injection
app.use(mongoSanitize({
  replaceWith: '_',  // Replace prohibited characters with underscore
  onSanitize: ({ req, key }) => {
    console.warn(`Sanitized potentially malicious input: ${key}`);
  }
}));

// PERFORMANCE: Compress responses
app.use(compression());

// LOGGING: HTTP request logger (only in development)
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  // In production, log only errors
  app.use(morgan('combined', {
    skip: (req, res) => res.statusCode < 400
  }));
}

// API Routes
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/auth/otp', require('./routes/email-auth.routes'));
app.use('/api/products', require('./routes/product.routes'));
app.use('/api/orders', require('./routes/order.routes'));
app.use('/api/users', require('./routes/user.routes'));
app.use('/api/admin', require('./routes/admin.routes'));
app.use('/api/admin/categories', require('./routes/category.routes'));
app.use('/api/admin/roles', require('./routes/role.routes'));
app.use('/api/admin/email-templates', require('./routes/emailTemplate.routes'));
app.use('/api/admin/reviews', require('./routes/review.routes'));
app.use('/api/admin/activity-logs', require('./routes/activityLog.routes'));
app.get('/api/settings/public', require('./controllers/settings.controller').getPublicSettings);
app.use('/api/admin/settings', require('./routes/settings.routes'));
app.use('/api/admin/export', require('./routes/export.routes'));
app.use('/api/admin/import', require('./routes/export.routes'));
app.use('/api/admin/analytics', require('./routes/analytics.routes'));
app.use('/api/distributor', require('./routes/distributor.routes'));
app.use('/api/notifications', require('./routes/notification.routes'));
app.use('/api/subscriptions', require('./routes/subscription.routes'));
app.use('/api/payments', require('./routes/webhook.routes'));
app.use('/api/contact', require('./routes/contact.routes'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'BuildAdda API is running',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'BuildAdda API',
    version: '1.0.0',
    documentation: '/api/docs'  // Add API documentation later
  });
});

// 404 handler (must be after all routes)
app.use(notFound);

// Error handler (must be last)
app.use(errorHandler);

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION! Shutting down...');
  console.error(err.name, err.message);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION! Shutting down...');
  console.error(err.name, err.message);
  process.exit(1);
});

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   BuildAdda E-commerce API Server      ║
║   Port: ${PORT}                           ║
║   Environment: ${process.env.NODE_ENV || 'development'}         ║
║   Status: READY ✓                      ║
╚════════════════════════════════════════╝
  `);

  // Run one-time slug migration (idempotent — skips if already done)
  runSlugMigration();

  // Schedule subscription renewal job (runs daily at 6 AM)
  cron.schedule('0 6 * * *', async () => {
    console.log('Running scheduled subscription renewal job...');
    await processSubscriptionRenewals();
  });

  // Schedule renewal reminder job (runs daily at 10 AM)
  cron.schedule('0 10 * * *', async () => {
    console.log('Running scheduled renewal reminder job...');
    await sendRenewalReminders();
  });

  console.log('Scheduled jobs: Subscription renewal (6 AM), Renewal reminders (10 AM)');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Process terminated');
  });
});

module.exports = app;
