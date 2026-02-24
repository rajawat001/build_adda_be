const express = require('express');
const router = express.Router();
const productController = require('../controllers/product.controller');
const authMiddleware = require('../middleware/auth.middleware');

// CRITICAL FIX: Route ordering matters! Specific routes MUST come before generic patterns like /:id

// Public routes - NO authentication needed
router.get('/', productController.getAllProducts);
router.get('/categories', productController.getCategories);
router.get('/category/:categoryId', productController.getProductsByCategory);
router.get('/distributor/:distributorId', productController.getProductsByDistributor);

// Protected routes - authentication REQUIRED (define specific routes first)
// These specific named routes (/wishlist, /cart) are matched before /:id below
router.get('/wishlist', authMiddleware.protect, productController.getWishlist);
router.post('/wishlist', authMiddleware.protect, productController.addToWishlist);
router.delete('/wishlist/:productId', authMiddleware.protect, productController.removeFromWishlist);

router.get('/cart', authMiddleware.protect, productController.getCart);
router.post('/cart', authMiddleware.protect, productController.addToCart);
router.put('/cart/:productId', authMiddleware.protect, productController.updateCartItem);
router.delete('/cart/:productId', authMiddleware.protect, productController.removeFromCart);
router.delete('/cart', authMiddleware.protect, productController.clearCart);

// Product detail - public with optional auth
// Accepts both MongoDB ObjectID and slug. MUST be last to avoid catching /wishlist, /cart, etc.
router.get('/:id', authMiddleware.optionalAuth, productController.getProductById);

module.exports = router;
