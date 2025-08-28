// ===============================
// Fichier: middleware/validation.js
// Middleware de validation et de sanitisation pour les routes API
// ===============================

const { body, param, query, validationResult } = require('express-validator');

// Middleware pour gérer les erreurs de validation
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            error: 'Données invalides',
            details: errors.array()
        });
    }
    next();
};

// === VALIDATIONS POUR LES GALERIES ===
const validateGalleryCreation = [
    body('name')
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Le nom de la galerie doit contenir entre 1 et 100 caractères')
        .escape(),
    handleValidationErrors
];

const validateGalleryId = [
    param('galleryId')
        .isMongoId()
        .withMessage('ID de galerie invalide'),
    handleValidationErrors
];

// === VALIDATIONS POUR LES PUBLICATIONS ===
const validatePublicationCreation = [
    param('galleryId')
        .isMongoId()
        .withMessage('ID de galerie invalide'),
    body('letter')
        .matches(/^[A-Z]$/)
        .withMessage('La lettre doit être une seule lettre majuscule (A-Z)'),
    body('index')
        .isInt({ min: 0, max: 25 })
        .withMessage('L\'index doit être un nombre entre 0 et 25'),
    body('descriptionText')
        .optional()
        .isLength({ max: 5000 })
        .withMessage('La description ne peut pas dépasser 5000 caractères')
        .trim(),
    handleValidationErrors
];

const validatePublicationUpdate = [
    param('galleryId')
        .isMongoId()
        .withMessage('ID de galerie invalide'),
    param('publicationId')
        .isMongoId()
        .withMessage('ID de publication invalide'),
    body('letter')
        .optional()
        .matches(/^[A-Z]$/)
        .withMessage('La lettre doit être une seule lettre majuscule (A-Z)'),
    body('index')
        .optional()
        .isInt({ min: 0, max: 25 })
        .withMessage('L\'index doit être un nombre entre 0 et 25'),
    body('descriptionText')
        .optional()
        .isLength({ max: 5000 })
        .withMessage('La description ne peut pas dépasser 5000 caractères')
        .trim(),
    body('images')
        .optional()
        .isArray()
        .withMessage('Les images doivent être un tableau'),
    body('images.*.imageId')
        .optional()
        .isMongoId()
        .withMessage('ID d\'image invalide'),
    body('images.*.order')
        .optional()
        .isInt({ min: 0 })
        .withMessage('L\'ordre doit être un nombre positif'),
    handleValidationErrors
];

// === VALIDATIONS POUR LES IMAGES ===
const validateImageId = [
    param('galleryId')
        .isMongoId()
        .withMessage('ID de galerie invalide'),
    param('imageId')
        .isMongoId()
        .withMessage('ID d\'image invalide'),
    handleValidationErrors
];

const validateCropData = [
    param('galleryId')
        .isMongoId()
        .withMessage('ID de galerie invalide'),
    param('originalImageId')
        .isMongoId()
        .withMessage('ID d\'image originale invalide'),
    body('cropType')
        .isIn(['barres_4x5', 'barres_1x1', 'split_gauche', 'split_droite'])
        .withMessage('Type de recadrage invalide'),
    body('x')
        .isFloat({ min: 0 })
        .withMessage('Coordonnée X invalide'),
    body('y')
        .isFloat({ min: 0 })
        .withMessage('Coordonnée Y invalide'),
    body('width')
        .isFloat({ min: 1 })
        .withMessage('Largeur invalide'),
    body('height')
        .isFloat({ min: 1 })
        .withMessage('Hauteur invalide'),
    handleValidationErrors
];

// === VALIDATIONS POUR LE CALENDRIER ===
const validateScheduleUpdate = [
    param('galleryId')
        .isMongoId()
        .withMessage('ID de galerie invalide'),
    body('schedule')
        .isObject()
        .withMessage('Le calendrier doit être un objet'),
    body('schedule.*.publicationId')
        .optional()
        .isMongoId()
        .withMessage('ID de publication invalide'),
    handleValidationErrors
];

// === VALIDATIONS POUR L'ADMINISTRATION ===
const validateUserId = [
    param('userId')
        .isMongoId()
        .withMessage('ID d\'utilisateur invalide'),
    handleValidationErrors
];

const validateImpersonation = [
    body('userId')
        .isMongoId()
        .withMessage('ID d\'utilisateur invalide'),
    handleValidationErrors
];

// === VALIDATIONS POUR LES REQUÊTES DE PAGINATION ===
const validatePagination = [
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Le numéro de page doit être un entier positif'),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('La limite doit être entre 1 et 100'),
    handleValidationErrors
];

module.exports = {
    handleValidationErrors,
    validateGalleryCreation,
    validateGalleryId,
    validatePublicationCreation,
    validatePublicationUpdate,
    validateImageId,
    validateCropData,
    validateScheduleUpdate,
    validateUserId,
    validateImpersonation,
    validatePagination
};