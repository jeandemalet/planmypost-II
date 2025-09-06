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

const validateGalleryStateUpdate = [
    param('galleryId')
        .isMongoId()
        .withMessage('ID de galerie invalide'),
    body('name')
        .optional()
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Le nom de la galerie doit contenir entre 1 et 100 caractères')
        .escape(),
    body('currentThumbSize')
        .optional()
        .isObject()
        .withMessage('currentThumbSize doit être un objet'),
    body('currentThumbSize.width')
        .optional()
        .isInt({ min: 50, max: 1000 })
        .withMessage('La largeur des vignettes doit être entre 50 et 1000 pixels'),
    body('currentThumbSize.height')
        .optional()
        .isInt({ min: 50, max: 1000 })
        .withMessage('La hauteur des vignettes doit être entre 50 et 1000 pixels'),
    body('sortOption')
        .optional()
        .isIn(['date_asc', 'date_desc', 'name_asc', 'name_desc', 'size_asc', 'size_desc'])
        .withMessage('Option de tri invalide'),
    body('activeTab')
        .optional()
        .isIn(['galleries', 'currentGallery', 'cropping', 'description', 'calendar'])
        .withMessage('Onglet actif invalide'),
    body('nextPublicationIndex')
        .optional()
        .isInt({ min: 0, max: 25 })
        .withMessage('L\'index de la prochaine publication doit être entre 0 et 25'),
    body('commonDescriptionText')
        .optional()
        .isLength({ max: 5000 })
        .withMessage('La description commune ne peut pas dépasser 5000 caractères')
        .trim(),
    // Empêcher la modification de champs sensibles
    body('owner').not().exists().withMessage('Le propriétaire ne peut pas être modifié'),
    body('_id').not().exists().withMessage('L\'ID ne peut pas être modifié'),
    body('createdAt').not().exists().withMessage('La date de création ne peut pas être modifiée'),
    body('__v').not().exists().withMessage('La version ne peut pas être modifiée'),
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
    // CORRECTION: On ne valide que l'ID de la galerie, car la lettre et l'index sont générés par le serveur
    param('galleryId')
        .isMongoId()
        .withMessage('ID de galerie invalide'),
    // Les validations pour 'letter' et 'index' ont été retirées car ces champs sont auto-générés
    // La validation pour 'descriptionText' est également retirée car non pertinente lors de la création initiale
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
    // CORRECTION: Le client envoie directement l'objet de planification, pas un objet contenant "schedule"
    body()
        .isObject()
        .withMessage('Le corps de la requête doit être un objet représentant le calendrier.'),
    // CORRECTION: Valide la structure imbriquée : { "YYYY-MM-DD": { "A": { galleryId: "..." } } }
    // Le '*' est un joker qui correspond à n'importe quelle date et n'importe quelle lettre.
    body('*.*.galleryId')
        .if(body('*.*.galleryId').exists()) // N'exécute la validation que si le champ existe
        .isMongoId()
        .withMessage('Chaque entrée du calendrier doit avoir un ID de galerie valide.'),
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
    validateGalleryStateUpdate,
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