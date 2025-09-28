const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const authMiddleware = require('../middleware/auth');
const adminAuthMiddleware = require('../middleware/adminAuth');
const csrfProtection = require('../middleware/csrf');

// All admin routes require authentication first, then admin privileges
router.use(authMiddleware);
router.use(adminAuthMiddleware);

// --- Admin Routes ---

// List all users
router.get('/users', csrfProtection.validateToken, adminController.listUsers);

// Get galleries for a specific user
router.get('/users/:userId/galleries', csrfProtection.validateToken, adminController.getGalleriesForUser);

// Impersonate a user
router.post('/auth/impersonate', csrfProtection.validateToken, adminController.impersonateUser);

module.exports = router;