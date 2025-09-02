// ===============================
//  Fichier: models\Gallery.js
// ===============================
const mongoose = require('mongoose');
const path = require('path');
const fse = require('fs-extra');
const logger = require('../utils/logger');

const GallerySchema = new mongoose.Schema({
    owner: { // CHAMP AJOUTÉ - INDISPENSABLE POUR LA LOGIQUE UTILISATEUR
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    name: {
        type: String,
        required: true,
        trim: true,
        default: () => `Galerie du ${new Date().toLocaleDateString('fr-FR')}`
    },
    // NOUVEAU : Champ pour la description commune
    commonDescriptionText: {
        type: String,
        default: ''
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    lastAccessed: {
        type: Date,
        default: Date.now
    },
    // UI State fields
    currentThumbSize: {
        width: { type: Number, default: 200 },
        height: { type: Number, default: 200 }
    },
    sortOption: { // Option de tri pour la grille d'images
        type: String,
        default: 'date_desc' // Par exemple: 'name_asc', 'date_desc'
    },
    activeTab: { // Onglet actif lors de la dernière session
        type: String,
        default: 'currentGallery'
    },
    nextPublicationIndex: { // Prochain index disponible pour créer une Publication (A=0, B=1, etc.)
        type: Number,
        default: 0,
        min: 0,
        max: 26 // Permet de suggérer jusqu'à Z, puis s'arrête à 26 si plein
    }
});

// Pre-delete middleware for cascading deletes
GallerySchema.pre('deleteOne', { document: true, query: false }, async function(next) {
    const galleryId = this._id;
    
    try {
        logger.info('Starting cascading delete for gallery', { galleryId: galleryId.toString() });
        
        // Get models
        const Image = mongoose.model('Image');
        const Publication = mongoose.model('Publication');
        const Schedule = mongoose.model('Schedule');
        
        // Count related data for logging
        const [imageCount, publicationCount, scheduleCount] = await Promise.all([
            Image.countDocuments({ galleryId }),
            Publication.countDocuments({ galleryId }),
            Schedule.countDocuments({ galleryId })
        ]);
        
        logger.info('Found related data to delete', {
            galleryId: galleryId.toString(),
            images: imageCount,
            publications: publicationCount,
            schedules: scheduleCount
        });
        
        // Delete related data
        await Promise.all([
            Image.deleteMany({ galleryId }),
            Publication.deleteMany({ galleryId }),
            Schedule.deleteMany({ galleryId })
        ]);
        
        // Remove physical files
        const galleryUploadDir = path.join(__dirname, '..', 'uploads', galleryId.toString());
        if (await fse.pathExists(galleryUploadDir)) {
            const stats = await fse.stat(galleryUploadDir);
            await fse.remove(galleryUploadDir);
            logger.info('Removed gallery upload directory', {
                galleryId: galleryId.toString(),
                path: galleryUploadDir,
                sizeFreed: stats.size || 0
            });
        }
        
        logger.info('Cascading delete completed successfully', {
            galleryId: galleryId.toString(),
            deletedImages: imageCount,
            deletedPublications: publicationCount,
            deletedSchedules: scheduleCount
        });
        
    } catch (error) {
        logger.error('Cascading delete failed', {
            galleryId: galleryId.toString(),
            error: error.message,
            stack: error.stack
        });
        throw error; // Re-throw to prevent the gallery deletion
    }
    
    next();
});

GallerySchema.pre('save', function(next) {
    this.lastAccessed = new Date();
    next();
});

// === INDEX OPTIMIZATIONS ===
// Index composite pour les requêtes par utilisateur et date d'accès
GallerySchema.index({ owner: 1, lastAccessed: -1 });
// Index pour les requêtes par utilisateur et date de création
GallerySchema.index({ owner: 1, createdAt: -1 });
// Index de recherche par nom (pour futures fonctionnalités de recherche)
GallerySchema.index({ name: 'text' });
// Index pour les requêtes de tri par nom
GallerySchema.index({ owner: 1, name: 1 });

module.exports = mongoose.model('Gallery', GallerySchema);