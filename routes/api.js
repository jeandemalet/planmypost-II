const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const authController = require('../controllers/authController');
const galleryController = require('../controllers/galleryController');
const imageController = require('../controllers/imageController');
const publicationController = require('../controllers/publicationController');
const scheduleController = require('../controllers/scheduleController');
const adminController = require('../controllers/adminController');
const authMiddleware = require('../middleware/auth');
const adminAuthMiddleware = require('../middleware/adminAuth');

// --- Route d'Authentification ---
router.post('/auth/google-signin', authController.googleSignIn);
router.post('/auth/logout', authController.logout);
router.get('/auth/status', authController.status);

const TEMP_UPLOAD_DIR = path.join(__dirname, '..', 'temp_uploads');
if (!fs.existsSync(TEMP_UPLOAD_DIR)){
    fs.mkdirSync(TEMP_UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, TEMP_UPLOAD_DIR)
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, 'tempfile-' + uniqueSuffix + path.extname(file.originalname))
    }
});

const multerLimits = {
    fileSize: 50 * 1024 * 1024, 
    files: 3000 
};

const upload = multer({
    storage: storage,
    limits: multerLimits, 
    fileFilter: function (req, file, cb) {
        if (!file.mimetype.startsWith('image/')) {
            req.fileValidationError = 'Seuls les fichiers image sont autorisés !';
            return cb(null, false); 
        }
        cb(null, true); 
    }
});

// --- Routes Galerie ---
router.post('/galleries', authMiddleware, galleryController.createGallery);
router.get('/galleries', authMiddleware, galleryController.listGalleries);
router.get('/galleries/:galleryId', authMiddleware, galleryController.getGalleryDetails);
router.put('/galleries/:galleryId/state', authMiddleware, galleryController.updateGalleryState);
router.delete('/galleries/:galleryId', authMiddleware, galleryController.deleteGallery);

// --- Routes Images ---
const handleUploadErrors = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        console.error("Erreur Multer interceptée :", err);
        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).send('Trop de fichiers envoyés. La limite est de ' + multerLimits.files + '.');
        }
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).send('Un fichier est trop volumineux. La limite est de 50MB.');
        }
        return res.status(400).send(`Erreur d'upload: ${err.message}`);
    } else if (err) {
        console.error("Erreur non-Multer pendant l'upload :", err);
        return res.status(500).send('Erreur serveur lors de l\'upload.');
    }
    next();
};

router.post(
    '/galleries/:galleryId/images',
    authMiddleware,
    (req, res, next) => {
        next();
    },
    upload.any(), 
    handleUploadErrors, 
    imageController.uploadImages
);

router.get('/galleries/:galleryId/images', authMiddleware, imageController.getImagesForGallery);
router.get('/uploads/:galleryId/:imageName', authMiddleware, imageController.serveImage);
router.post('/galleries/:galleryId/images/:originalImageId/crop', authMiddleware, imageController.saveCroppedImage);
router.delete('/galleries/:galleryId/images/:imageId', authMiddleware, imageController.deleteImage);
router.delete('/galleries/:galleryId/images', authMiddleware, imageController.deleteAllImagesForGallery);

// --- Routes Publications ---
router.post('/galleries/:galleryId/publications', authMiddleware, publicationController.createPublication);
router.get('/galleries/:galleryId/publications', authMiddleware, publicationController.getPublicationsForGallery);
router.put('/galleries/:galleryId/publications/:publicationId', authMiddleware, publicationController.updatePublication);
router.delete('/galleries/:galleryId/publications/:publicationId', authMiddleware, publicationController.deletePublication);
// NOUVELLE ROUTE CI-DESSOUS
router.get('/galleries/:galleryId/publications/:publicationId/export', authMiddleware, publicationController.exportPublicationImagesAsZip);

// --- Routes Calendrier ---
router.get('/galleries/:galleryId/schedule', authMiddleware, scheduleController.getScheduleForGallery);
router.put('/galleries/:galleryId/schedule', authMiddleware, scheduleController.updateSchedule);

// --- Routes Admin (protégées) ---
router.get('/admin/users', authMiddleware, adminAuthMiddleware, adminController.listUsers);
router.get('/admin/users/:userId/galleries', authMiddleware, adminAuthMiddleware, adminController.getGalleriesForUser);
router.post('/auth/impersonate', authMiddleware, adminAuthMiddleware, adminController.impersonateUser);

module.exports = router;