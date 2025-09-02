const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit'); // <-- NOUVEAU: Rate limiting
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const authController = require('../controllers/authController');
const galleryController = require('../controllers/galleryController');
const imageController = require('../controllers/imageController');
const publicationController = require('../controllers/publicationController');
const scheduleController = require('../controllers/scheduleController');
const adminController = require('../controllers/adminController');
const zipExportController = require('../controllers/zipExportController'); // NOUVEAU: Export ZIP en arrière-plan
const authMiddleware = require('../middleware/auth');
const adminAuthMiddleware = require('../middleware/adminAuth');
const validation = require('../middleware/validation'); // <-- NOUVEAU: Import des validations
const csrfProtection = require('../middleware/csrf'); // <-- NOUVEAU: Import CSRF
const {
    galleryCacheMiddleware,
    imageCacheMiddleware,
    publicationCacheMiddleware,
    scheduleCacheMiddleware,
    cacheInvalidationMiddleware,
    getCacheStats
} = require('../middleware/cache'); // <-- NOUVEAU: Import du cache

// === CONFIGURATION RATE LIMITING ===
// Rate limiting global pour toutes les routes API
const globalApiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // Limite chaque IP à 500 requêtes par fenêtre
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Trop de requêtes depuis cette IP, veuillez réessayer plus tard.'
    }
});

// Rate limiting strict pour les routes d'authentification
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limite les tentatives de connexion
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Trop de tentatives de connexion, veuillez réessayer plus tard.'
    }
});

// Rate limiting pour les uploads
const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 heure
    max: 50, // 50 uploads par heure
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Limite d\'upload atteinte, veuillez réessayer plus tard.'
    }
});

// Appliquer le rate limiting global à toutes les routes
router.use(globalApiLimiter);

// Appliquer la génération de token CSRF à toutes les routes
router.use(csrfProtection.generateToken);

// Appliquer l'invalidation de cache pour les opérations de modification
router.use(cacheInvalidationMiddleware);

// Route pour obtenir un token CSRF
router.get('/csrf-token', csrfProtection.getToken);

// Route pour les statistiques de cache (admin seulement)
router.get('/cache/stats', authMiddleware, adminAuthMiddleware, (req, res) => {
    res.json(getCacheStats());
});

// --- Route d'Authentification ---
router.post('/auth/google-signin', authLimiter, authController.googleSignIn);
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
router.post('/galleries', authMiddleware, csrfProtection.validateToken, validation.validateGalleryCreation, galleryController.createGallery);
router.get('/galleries', authMiddleware, galleryCacheMiddleware, galleryController.listGalleries);
router.get('/galleries/:galleryId', authMiddleware, galleryCacheMiddleware, validation.validateGalleryId, galleryController.getGalleryDetails);
// NOUVEAU: Endpoint pour chargement paginé des images
router.get('/galleries/:galleryId/images/paginated', authMiddleware, imageCacheMiddleware, validation.validateGalleryId, validation.validatePagination, imageController.getImagesForGallery);
// NOUVEAU: Endpoint pour les données de calendrier global
router.get('/galleries/:galleryId/calendar-data', authMiddleware, scheduleCacheMiddleware, validation.validateGalleryId, galleryController.getCalendarData);
router.put('/galleries/:galleryId/state', authMiddleware, csrfProtection.validateToken, validation.validateGalleryStateUpdate, galleryController.updateGalleryState);
router.delete('/galleries/:galleryId', authMiddleware, csrfProtection.validateToken, validation.validateGalleryId, galleryController.deleteGallery);

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
    uploadLimiter, // <-- NOUVEAU: Rate limiting pour les uploads
    csrfProtection.validateToken, // <-- NOUVEAU: Protection CSRF
    (req, res, next) => {
        next();
    },
    upload.any(), 
    handleUploadErrors, 
    imageController.uploadImages
);

router.get('/galleries/:galleryId/images', authMiddleware, imageCacheMiddleware, validation.validateGalleryId, validation.validatePagination, imageController.getImagesForGallery);
router.get('/uploads/:galleryId/:imageName', authMiddleware, validation.validateGalleryId, imageController.serveImage);
router.post('/galleries/:galleryId/images/:originalImageId/crop', authMiddleware, csrfProtection.validateToken, validation.validateCropData, imageController.saveCroppedImage);
router.delete('/galleries/:galleryId/images/:imageId', authMiddleware, csrfProtection.validateToken, validation.validateImageId, imageController.deleteImage);
router.delete('/galleries/:galleryId/images', authMiddleware, csrfProtection.validateToken, validation.validateGalleryId, imageController.deleteAllImagesForGallery);

// --- Routes Publications ---
router.post('/galleries/:galleryId/publications', authMiddleware, csrfProtection.validateToken, validation.validatePublicationCreation, publicationController.createPublication);
router.get('/galleries/:galleryId/publications', authMiddleware, publicationCacheMiddleware, validation.validateGalleryId, publicationController.getPublicationsForGallery);
router.put('/galleries/:galleryId/publications/:publicationId', authMiddleware, csrfProtection.validateToken, validation.validatePublicationUpdate, publicationController.updatePublication);
router.delete('/galleries/:galleryId/publications/:publicationId', authMiddleware, csrfProtection.validateToken, validation.validateImageId, publicationController.deletePublication);
// NOUVELLE ROUTE CI-DESSOUS
router.get('/galleries/:galleryId/publications/:publicationId/export', authMiddleware, validation.validateImageId, publicationController.exportPublicationImagesAsZip);

// NOUVELLE ROUTE POUR LE NETTOYAGE AUTOMATIQUE
router.post('/galleries/:galleryId/publications/cleanup', authMiddleware, csrfProtection.validateToken, validation.validateGalleryId, publicationController.cleanupAndResequence);

// --- Routes Calendrier ---
router.get('/galleries/:galleryId/schedule', authMiddleware, scheduleCacheMiddleware, validation.validateGalleryId, scheduleController.getScheduleForGallery);
router.put('/galleries/:galleryId/schedule', authMiddleware, csrfProtection.validateToken, validation.validateScheduleUpdate, scheduleController.updateSchedule);

// --- Routes Admin (protégées) ---
router.get('/admin/users', authMiddleware, adminAuthMiddleware, adminController.listUsers);
router.get('/admin/users/:userId/galleries', authMiddleware, adminAuthMiddleware, validation.validateUserId, adminController.getGalleriesForUser);
router.post('/auth/impersonate', authMiddleware, adminAuthMiddleware, csrfProtection.validateToken, validation.validateImpersonation, adminController.impersonateUser);

// --- Routes Export ZIP en Arrière-plan (NOUVEAU) ---
// Démarrer un export de publication en arrière-plan
router.post('/zip-exports/publications/:galleryId/:publicationId/start', authMiddleware, csrfProtection.validateToken, validation.validateImageId, zipExportController.startPublicationExport);

// Obtenir le statut d'un job d'export
router.get('/zip-exports/status/:jobId', authMiddleware, zipExportController.getJobStatus);

// Télécharger un fichier ZIP généré
router.get('/zip-exports/:fileName', authMiddleware, zipExportController.downloadZipFile);

// Obtenir tous les jobs d'un utilisateur
router.get('/zip-exports/user/jobs', authMiddleware, zipExportController.getUserJobs);

// Annuler un job en attente
router.delete('/zip-exports/jobs/:jobId', authMiddleware, csrfProtection.validateToken, zipExportController.cancelJob);

// Statistiques de la file d'attente (admin seulement)
router.get('/zip-exports/admin/stats', authMiddleware, adminAuthMiddleware, zipExportController.getQueueStats);

// Export synchrone legacy (pour petites publications)
router.get('/zip-exports/publications/:galleryId/:publicationId/sync', authMiddleware, validation.validateImageId, zipExportController.exportPublicationSync);

module.exports = router;