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
const adminController = require('../controllers/adminController');
const authMiddleware = require('../middleware/auth');
const adminAuthMiddleware = require('../middleware/adminAuth');

// --- Routes d'Authentification ---
router.post('/auth/google-signin', authController.googleSignIn);
router.post('/auth/logout', authController.logout);
router.get('/auth/status', authController.status);

// --- Route spéciale pour l'usurpation d'identité par l'admin ---
router.post('/auth/impersonate', authMiddleware, adminAuthMiddleware, adminController.impersonateUser);


// ======================= CORRECTION PRINCIPALE CI-DESSOUS =======================
// On passe de `diskStorage` à `memoryStorage` pour que `req.files[i].buffer` soit disponible dans le contrôleur.
// Cela correspond à la nouvelle logique dans `imageController.js`.

const storage = multer.memoryStorage(); // <-- Utilisation du stockage en mémoire

const multerLimits = {
    fileSize: 50 * 1024 * 1024, // 50 MB
    files: 3000 // Limite arbitraire
};

const upload = multer({
    storage: storage, // <-- Application du memoryStorage
    limits: multerLimits, 
    fileFilter: function (req, file, cb) {
        if (!file.mimetype.startsWith('image/')) {
            req.fileValidationError = 'Seuls les fichiers image sont autorisés !';
            return cb(null, false); 
        }
        cb(null, true); 
    }
});

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
// ========================= FIN DE LA CORRECTION PRINCIPALE =========================


// --- Routes Galerie ---
router.post('/galleries', authMiddleware, galleryController.createGallery);
router.get('/galleries', authMiddleware, galleryController.listGalleries);
router.get('/galleries/:galleryId', authMiddleware, galleryController.getGalleryDetails);
router.put('/galleries/:galleryId/state', authMiddleware, galleryController.updateGalleryState);
router.delete('/galleries/:galleryId', authMiddleware, galleryController.deleteGallery);

// --- Routes Images ---
router.post(
    '/galleries/:galleryId/images',
    authMiddleware,
    upload.array('images', 3000), // Utilisation de `.array()` qui est plus standard avec `memoryStorage`
    handleUploadErrors, 
    imageController.uploadImages
);

router.get('/galleries/:galleryId/images', authMiddleware, imageController.getImagesForGallery);
router.get('/uploads/:galleryId/:imageName', authMiddleware, imageController.serveImage);
router.post('/galleries/:galleryId/images/:originalImageId/crop', authMiddleware, imageController.saveCroppedImage);
router.delete('/galleries/:galleryId/images/:imageId', authMiddleware, imageController.deleteImage);
router.delete('/galleries/:galleryId/images', authMiddleware, imageController.deleteAllImagesForGallery);

// --- Routes Jours ---
router.post('/galleries/:galleryId/jours', authMiddleware, jourController.createJour);
router.get('/galleries/:galleryId/jours', authMiddleware, jourController.getJoursForGallery);
router.put('/galleries/:galleryId/jours/:jourId', authMiddleware, jourController.updateJour);
router.delete('/galleries/:galleryId/jours/:jourId', authMiddleware, jourController.deleteJour);
router.get('/galleries/:galleryId/jours/:jourId/export', authMiddleware, jourController.exportJourImagesAsZip);

// --- Routes Calendrier ---
router.get('/galleries/:galleryId/schedule', authMiddleware, scheduleController.getScheduleForGallery);
router.put('/galleries/:galleryId/schedule', authMiddleware, scheduleController.updateSchedule);

// --- ROUTES SPÉCIFIQUES ADMIN ---
router.get('/admin/users', authMiddleware, adminAuthMiddleware, adminController.listUsers);
router.get('/admin/users/:userId/galleries', authMiddleware, adminAuthMiddleware, adminController.getGalleriesForUser);


module.exports = router;