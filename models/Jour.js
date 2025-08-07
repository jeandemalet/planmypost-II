// ===============================
//  Fichier: models\Jour.js
// ===============================

const mongoose = require('mongoose');

// Sous-document pour stocker la référence à une image et son ordre dans le Jour
const JourImageSchema = new mongoose.Schema({
    imageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Image', // Référence au modèle Image
        required: true
    },
    order: { // Ordre de cette image dans la séquence du Jour (0, 1, 2...)
        type: Number,
        required: true,
        min: 0
    }
}, { _id: false }); // Pas besoin d'un ID MongoDB distinct pour ce sous-document

const JourSchema = new mongoose.Schema({
    galleryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Gallery',
        required: true,
        index: true // Indexer pour recherche rapide par galerie
    },
    letter: { // Lettre identifiant le jour (A, B, C...)
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
    images: [JourImageSchema], // Tableau ordonné des images de ce jour
    
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

// Index composite pour assurer l'unicité de la lettre du Jour au sein d'une galerie
JourSchema.index({ galleryId: 1, letter: 1 }, { unique: true });
// Index pour trier les jours par leur index (ordre A, B, C...)
JourSchema.index({ galleryId: 1, index: 1 });

module.exports = mongoose.model('Jour', JourSchema);