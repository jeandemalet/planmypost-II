// ===============================
//  Fichier: models\Publication.js
// ===============================

const mongoose = require('mongoose');

// Sous-document pour stocker la référence à une image et son ordre dans la Publication
const PublicationImageSchema = new mongoose.Schema({
    imageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Image', // Référence au modèle Image
        required: true
    },
    order: { // Ordre de cette image dans la séquence de la Publication (0, 1, 2...)
        type: Number,
        required: true,
        min: 0
    }
}, { _id: false }); // Pas besoin d'un ID MongoDB distinct pour ce sous-document

const PublicationSchema = new mongoose.Schema({
    galleryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Gallery',
        required: true,
        index: true // Indexer pour recherche rapide par galerie
    },
    letter: { // Lettre identifiant la publication (A, B, C...)
        type: String,
        required: true,
        match: /^[A-Z]$/ // Doit être une seule lettre majuscule
    },
    index: { // Index numérique (0, 1, 2...) correspondant à la lettre (pour tri et logique couleur)
        type: Number,
        required: true,
        min: 0,
        max: 25 // Correspond à A-Z
    },
    images: [PublicationImageSchema], // Tableau ordonné des images de cette publication
    
    // NOUVEAU : Paramètres pour le recadrage automatique
    autoCropSettings: {
        vertical: {
            type: String,
            enum: ['auto', 'whitebars', 'none'],
            default: 'none'
        },
        horizontal: {
            type: String,
            enum: ['whitebars', 'none'],
            default: 'none'
        }
    },

    descriptionText: { // MODIFIÉ: Ajout du champ pour le texte de la description
        type: String,
        default: ''
    }
    // `hasBeenProcessedByCropper` est dérivable côté client en vérifiant si une image
    // dans le tableau `images` (après population) a `isCroppedVersion: true`.
    // Pas besoin de le stocker explicitement ici.
});

// Index composite pour assurer l'unicité de la lettre de la Publication au sein d'une galerie
PublicationSchema.index({ galleryId: 1, letter: 1 }, { unique: true });
// Index pour trier les publications par leur index (ordre A, B, C...)
PublicationSchema.index({ galleryId: 1, index: 1 });

// === INDEX OPTIMIZATIONS SUPPLÉMENTAIRES ===
// Index pour les requêtes sur le contenu des descriptions
PublicationSchema.index({ galleryId: 1, descriptionText: 'text' });
// Index pour les publications avec des paramètres de recadrage automatique
PublicationSchema.index({ galleryId: 1, 'autoCropSettings.vertical': 1, 'autoCropSettings.horizontal': 1 });

// MODIFICATION CRUCIALE : On renomme le modèle en 'Publication', mais on lui dit de continuer à utiliser
// l'ancienne collection 'jours' dans la base de données. CELA ÉVITE DE DEVOIR FAIRE UNE MIGRATION DE DONNÉES.
module.exports = mongoose.model('Publication', PublicationSchema, 'jours');