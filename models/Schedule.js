
const mongoose = require('mongoose');

const ScheduleSchema = new mongoose.Schema({
    galleryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Gallery',
        required: true,
        index: true // Indexer pour recherche rapide par galerie
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    date: { // Date de publication prévue au format YYYY-MM-DD
        type: String,
        required: true,
        match: /^\d{4}-\d{2}-\d{2}$/ // Valider le format YYYY-MM-DD
    },
    jourLetter: { // Lettre du Jour (A, B, C...) prévu pour cette date
        type: String,
        required: true,
        match: /^[A-Z]$/ // Valider une seule lettre majuscule
    }
    // Pas besoin d'autres informations, l'existence de l'entrée suffit.
    // Les détails du Jour (images, etc.) sont récupérés via le modèle Jour.
});

// Index composite pour assurer l'unicité d'une entrée (une seule fois un Jour donné pour une date donnée dans une galerie)
ScheduleSchema.index({ galleryId: 1, date: 1, jourLetter: 1 }, { unique: true });
// Index pour trouver rapidement toutes les entrées pour une date donnée dans une galerie
ScheduleSchema.index({ galleryId: 1, date: 1 });

module.exports = mongoose.model('Schedule', ScheduleSchema);
