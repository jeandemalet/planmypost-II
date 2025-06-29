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

// --- Route d'Authentification ---
router.post('/auth/google-signin', authController.googleSignIn);

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
router.post('/galleries', galleryController.createGallery);
router.get('/galleries', galleryController.listGalleries);
router.get('/galleries/:galleryId', galleryController.getGalleryDetails);
router.put('/galleries/:galleryId/state', galleryController.updateGalleryState);
router.delete('/galleries/:galleryId', galleryController.deleteGallery);

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
    (req, res, next) => {
        next();
    },
    upload.any(), 
    handleUploadErrors, 
    imageController.uploadImages
);

router.get('/galleries/:galleryId/images', imageController.getImagesForGallery);
router.get('/uploads/:galleryId/:imageName', imageController.serveImage);
router.post('/galleries/:galleryId/images/:originalImageId/crop', imageController.saveCroppedImage);
router.delete('/galleries/:galleryId/images/:imageId', imageController.deleteImage);
router.delete('/galleries/:galleryId/images', imageController.deleteAllImagesForGallery);

// --- Routes Jours ---
router.post('/galleries/:galleryId/jours', jourController.createJour);
router.get('/galleries/:galleryId/jours', jourController.getJoursForGallery);
router.put('/galleries/:galleryId/jours/:jourId', jourController.updateJour);
router.delete('/galleries/:galleryId/jours/:jourId', jourController.deleteJour);
// NOUVELLE ROUTE CI-DESSOUS
router.get('/galleries/:galleryId/jours/:jourId/export', jourController.exportJourImagesAsZip);

// --- Routes Calendrier ---
router.get('/galleries/:galleryId/schedule', scheduleController.getScheduleForGallery);
router.put('/galleries/:galleryId/schedule', scheduleController.updateSchedule);

module.exports = router;