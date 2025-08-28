// ===============================
//  Fichier: models\Gallery.js
// ===============================
const mongoose = require('mongoose');

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
    nextJourIndex: { // Prochain index disponible pour créer un Jour (A=0, B=1, etc.)
        type: Number,
        default: 0,
        min: 0,
        max: 26 // Permet de suggérer jusqu'à Z, puis s'arrête à 26 si plein
    }
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