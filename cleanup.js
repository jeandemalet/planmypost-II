// cleanup.js
require('dotenv').config();
const mongoose = require('mongoose');
const Gallery = require('./models/Gallery');
const Jour = require('./models/Jour');
const Schedule = require('./models/Schedule');

const MONGODB_URI = process.env.MONGODB_URI;

/**
 * Recherche et supprime les Jours et les entrées de Calendrier (Schedule)
 * qui font référence à des galeries qui n'existent plus.
 */
async function runCleanup() {
    if (!MONGODB_URI) {
        console.error('Erreur: La variable d\'environnement MONGODB_URI n\'est pas définie.');
        process.exit(1);
    }

    try {
        console.log('Connexion à MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connecté à la base de données.');

        console.log('\n--- Démarrage du nettoyage des données orphelines ---');

        // 1. Récupérer les IDs de toutes les galeries qui existent encore.
        const existingGalleries = await Gallery.find({}).select('_id').lean();
        const existingGalleryIds = new Set(existingGalleries.map(g => g._id.toString()));
        console.log(`ℹ️  ${existingGalleryIds.size} galeries existantes trouvées.`);

        // 2. Trouver et supprimer les Jours orphelins.
        console.log('\n🔍 Recherche des Jours orphelins...');
        const orphanedJours = await Jour.find({ galleryId: { $nin: Array.from(existingGalleryIds) } }).select('_id galleryId letter');
        if (orphanedJours.length > 0) {
            console.log(`Trouvé ${orphanedJours.length} Jour(s) orphelin(s). Exemples:`);
            orphanedJours.slice(0, 5).forEach(j => console.log(`  - Jour '${j.letter}' de la galerie supprimée ${j.galleryId}`));
            const jourCleanupResult = await Jour.deleteMany({ _id: { $in: orphanedJours.map(j => j._id) } });
            console.log(`✅ ${jourCleanupResult.deletedCount} Jour(s) orphelin(s) supprimé(s).`);
        } else {
            console.log('👍 Aucun Jour orphelin trouvé.');
        }

        // 3. Trouver et supprimer les entrées de calendrier orphelines.
        console.log('\n🔍 Recherche des entrées de calendrier orphelines...');
        const orphanedSchedules = await Schedule.find({ galleryId: { $nin: Array.from(existingGalleryIds) } }).select('_id galleryId jourLetter date');

        if (orphanedSchedules.length > 0) {
            console.log(`Trouvé ${orphanedSchedules.length} entrée(s) de calendrier orpheline(s). Exemples:`);
            orphanedSchedules.slice(0, 5).forEach(s => console.log(`  - Planification du ${s.date} pour le Jour '${s.jourLetter}' de la galerie supprimée ${s.galleryId}`));
            const scheduleCleanupResult = await Schedule.deleteMany({ _id: { $in: orphanedSchedules.map(s => s._id) } });
            console.log(`✅ ${scheduleCleanupResult.deletedCount} entrée(s) de calendrier orpheline(s) supprimée(s).`);
        } else {
            console.log('👍 Aucune entrée de calendrier orpheline trouvée.');
        }

        console.log('\n--- Nettoyage terminé ---');

    } catch (error) {
        console.error('\n❌ Une erreur est survenue pendant le nettoyage:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Déconnecté de la base de données.');
    }
}

// Lancer le script
runCleanup();