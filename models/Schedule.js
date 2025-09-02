
const mongoose = require('mongoose');

const ScheduleSchema = new mongoose.Schema({
    galleryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Gallery',
        required: true,
        index: true // Indexer pour recherche rapide par galerie
    },
    date: { // Date de publication prévue au format YYYY-MM-DD
        type: String,
        required: true,
        match: /^\d{4}-\d{2}-\d{2}$/ // Valider le format YYYY-MM-DD
    },
    publicationLetter: { // Lettre de la Publication (A, B, C...) prévue pour cette date
        type: String,
        required: true,
        match: /^[A-Z]$/ // Valider une seule lettre majuscule
    }
    // Pas besoin d'autres informations, l'existence de l'entrée suffit.
    // Les détails du Jour (images, etc.) sont récupérés via le modèle Jour.
});

// Index composite pour assurer l'unicité d'une entrée (une seule fois une Publication donnée pour une date donnée dans une galerie)
ScheduleSchema.index({ galleryId: 1, date: 1, publicationLetter: 1 }, { unique: true });
// Index pour trouver rapidement toutes les entrées pour une date donnée dans une galerie
ScheduleSchema.index({ galleryId: 1, date: 1 });

// === INDEX OPTIMIZATIONS SUPPLÉMENTAIRES ===
// Index pour les requêtes par mois (optimisation pour les vues calendrier) - removed duplicate
// ScheduleSchema.index({ galleryId: 1, date: 1 }); // REMOVED: duplicate of index defined above
// Index pour les requêtes par lettre de publication
ScheduleSchema.index({ galleryId: 1, publicationLetter: 1 });
// Index pour les tris par date (ordre chronologique)
ScheduleSchema.index({ date: 1 });

module.exports = mongoose.model('Schedule', ScheduleSchema);
