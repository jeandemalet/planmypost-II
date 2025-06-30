const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const authController = require('../controllers/authController');
const galleryController = require('../controllers/galleryController');
const imageController = require('../controllers/imageController');
const jourController = require('../controllers/jourController');
const scheduleController = require('../controllers/scheduleController');
const adminController = require('../controllers/adminController'); // N'oubliez pas d'importer
const authMiddleware = require('../middleware/auth');
const adminAuthMiddleware = require('../middleware/adminAuth'); // N'oubliez pas d'importer

// --- Routes d'Authentification ---
router.post('/auth/google-signin', authController.googleSignIn);
router.post('/auth/logout', authController.logout);
router.get('/auth/status', authController.status);

// --- Route spéciale pour l'usurpation d'identité par l'admin ---
router.post('/auth/impersonate', authMiddleware, adminAuthMiddleware, adminController.impersonateUser);

const TEMP_UPLOAD_DIR = path.join(__dirname, '..', 'temp_uploads');
if (!fs.existsSync(TEMP_UPLOAD_DIR)){
    fs.mkdirSync(TEMP_UPLOAD_DIR, { recursive: true });
}

// ... (votre configuration Multer reste la même)
const storage = multer.diskStorage({ /*...*/ });
const upload = multer({ /*...*/ });


// --- Routes Galerie (maintenant protégées par authMiddleware) ---
router.use('/galleries', authMiddleware); // Applique le middleware à toutes les routes /galleries
router.post('/galleries', galleryController.createGallery);
router.get('/galleries', galleryController.listGalleries);
router.get('/galleries/:galleryId', galleryController.getGalleryDetails);
router.put('/galleries/:galleryId/state', galleryController.updateGalleryState);
router.delete('/galleries/:galleryId', galleryController.deleteGallery);


// --- Routes Images (maintenant protégées par authMiddleware) ---
const handleUploadErrors = (err, req, res, next) => { /*...*/ };
router.post('/galleries/:galleryId/images', authMiddleware, upload.any(), handleUploadErrors, imageController.uploadImages);
router.get('/galleries/:galleryId/images', authMiddleware, imageController.getImagesForGallery);
router.get('/uploads/:galleryId/:imageName', authMiddleware, imageController.serveImage);
router.post('/galleries/:galleryId/images/:originalImageId/crop', authMiddleware, imageController.saveCroppedImage);
router.delete('/galleries/:galleryId/images/:imageId', authMiddleware, imageController.deleteImage);
router.delete('/galleries/:galleryId/images', authMiddleware, imageController.deleteAllImagesForGallery);

// --- Routes Jours (maintenant protégées par authMiddleware)---
router.post('/galleries/:galleryId/jours', authMiddleware, jourController.createJour);
router.get('/galleries/:galleryId/jours', authMiddleware, jourController.getJoursForGallery);
router.put('/galleries/:galleryId/jours/:jourId', authMiddleware, jourController.updateJour);
router.delete('/galleries/:galleryId/jours/:jourId', authMiddleware, jourController.deleteJour);
router.get('/galleries/:galleryId/jours/:jourId/export', authMiddleware, jourController.exportJourImagesAsZip);

// --- Routes Calendrier (maintenant protégées par authMiddleware) ---
router.get('/galleries/:galleryId/schedule', authMiddleware, scheduleController.getScheduleForGallery);
router.put('/galleries/:galleryId/schedule', authMiddleware, scheduleController.updateSchedule);


// --- ROUTES SPÉCIFIQUES ADMIN ---
router.get('/admin/users', authMiddleware, adminAuthMiddleware, adminController.listUsers);
router.get('/admin/users/:userId/galleries', authMiddleware, adminAuthMiddleware, adminController.getGalleriesForUser);


module.exports = router;