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

// Product detail - public with optional auth
// Regex ensures only valid MongoDB ObjectIDs match, so /wishlist, /cart etc. pass through
router.get('/:id([0-9a-fA-F]{24})', authMiddleware.optionalAuth, productController.getProductById);

// Protected routes - authentication REQUIRED (define specific routes first)
router.use(authMiddleware.protect);

// Wishlist routes
router.get('/wishlist', productController.getWishlist);
router.post('/wishlist', productController.addToWishlist);
router.delete('/wishlist/:productId', productController.removeFromWishlist);

// Cart routes
router.get('/cart', productController.getCart);
router.post('/cart', productController.addToCart);
router.put('/cart/:productId', productController.updateCartItem);
router.delete('/cart/:productId', productController.removeFromCart);
router.delete('/cart', productController.clearCart);

module.exports = router;
