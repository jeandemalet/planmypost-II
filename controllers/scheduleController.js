
// ===============================
//  Fichier: controllers\scheduleController.js
// ===============================
const Schedule = require('../models/Schedule');
const Gallery = require('../models/Gallery'); // Pour vérifier l'existence de la galerie
const mongoose = require('mongoose'); // Pour validation ObjectId

// Obtenir le calendrier pour une galerie
exports.getScheduleForGallery = async (req, res) => {
    const { galleryId } = req.params;
    try {
        // Vérifier si la galerie existe (optionnel mais recommandé)
        const galleryExists = await Gallery.findOne({ _id: galleryId, owner: req.user._id }).select('_id');
        if (!galleryExists) {
            return res.status(404).send('Gallery not found or not owned by user.');
        }

        const scheduleEntries = await Schedule.find({ galleryId: galleryId, owner: req.user._id });

        // Formater pour le frontend : { 'YYYY-MM-DD': { 'A': {}, 'B': {} } }
        const scheduleData = scheduleEntries.reduce((acc, entry) => {
            if (!acc[entry.date]) acc[entry.date] = {};
            // Enrichir avec galleryId et galleryName pour le frontend
            acc[entry.date][entry.jourLetter] = {
                galleryId: entry.galleryId.toString(), // Assurez-vous que c'est une string
                // galleryName sera ajouté côté client ou ici si vous avez l'info facilement
            };
            return acc;
        }, {});

        res.json(scheduleData);

    } catch (error) {
        console.error(`Error getting schedule for gallery ${galleryId}:`, error);
        res.status(500).send('Server error getting schedule.');
    }
};

// Mettre à jour TOUT le calendrier pour une galerie
// Le frontend envoie l'état complet du calendrier tel qu'il doit être.
exports.updateSchedule = async (req, res) => {
    const { galleryId } = req.params;
    const scheduleData = req.body; // Format attendu: { 'YYYY-MM-DD': { 'A': { galleryId: '...', galleryName: '...' }, 'B': {...} } }

    if (typeof scheduleData !== 'object' || scheduleData === null) {
         return res.status(400).send('Invalid schedule data format. Expected an object.');
    }

    try {
        // 1. Vérifier si la galerie existe
         const galleryExists = await Gallery.findOne({ _id: galleryId, owner: req.user._id }).select('_id');
         if (!galleryExists) {
             return res.status(404).send('Gallery not found or not owned by user.');
         }

        // 2. Préparer les nouvelles entrées à insérer avec validation
        const newEntries = [];
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/; // Regex pour YYYY-MM-DD
        const letterRegex = /^[A-Z]$/; // Regex pour une seule lettre majuscule

        for (const date in scheduleData) {
            if (scheduleData.hasOwnProperty(date)) {
                // Valider le format de la date
                if (!dateRegex.test(date)) {
                    console.warn(`Skipping invalid date format in schedule update: ${date} for gallery ${galleryId}`);
                    continue; // Ignorer cette date invalide
                }
                const joursOnDate = scheduleData[date];
                for (const jourLetter in joursOnDate) {
                    if (joursOnDate.hasOwnProperty(jourLetter)) {
                         // Valider la lettre du jour
                         if (!letterRegex.test(jourLetter)) {
                             console.warn(`Skipping invalid jour letter format: ${jourLetter} for date ${date} in gallery ${galleryId}`);
                             continue; // Ignorer cette lettre invalide
                         }
                         // Récupérer galleryId de l'entrée individuelle, ou utiliser celui de la route si non fourni
                         const entryGalleryId = joursOnDate[jourLetter].galleryId || galleryId;

                        newEntries.push({
                            galleryId: entryGalleryId,
                            owner: req.user._id,
                            date: date,
                            jourLetter: jourLetter
                        });
                    }
                }
            }
        }

        // 3. Supprimer toutes les anciennes entrées pour CETTE galerie et insérer les nouvelles.
        // NOTE: Transactions retirées pour compatibilité avec les environnements de dev MongoDB non-replica set.
        // En production, envisager de remettre les transactions si MongoDB est configuré en replica set.
        try {
            // Important: On ne supprime que les entrées de la galerie courante.
            // Si scheduleData contient des entrées d'autres galeries, elles seront ajoutées,
            // mais la suppression ne concerne que galleryId. C'est un comportement à clarifier
            // si vous voulez gérer des planifications inter-galeries via une seule route.
            // Pour l'instant, on assume que updateSchedule met à jour uniquement le calendrier
            // de la `galleryId` passée en paramètre.
            await Schedule.deleteMany({ galleryId: galleryId, owner: req.user._id }); // Ne pas utiliser { session }

            // Filtrer newEntries pour ne garder que celles de la galerie actuelle si c'est la logique désirée,
            // ou ajuster la logique de suppression si le calendrier est global et non par galerie.
            // Actuellement, `deleteMany` supprime seulement pour `galleryId`, `insertMany` peut insérer pour d'autres.
            // Pour simplifier et aligner avec une gestion par galerie :
            const entriesForThisGallery = newEntries.filter(entry => entry.galleryId.toString() === galleryId.toString() && entry.owner.toString() === req.user._id.toString());

            if (entriesForThisGallery.length > 0) {
                await Schedule.insertMany(entriesForThisGallery); // Ne pas utiliser { session }
            }
            res.status(200).send('Schedule updated successfully.');
        } catch (dbError) {
            console.error(`Database error updating schedule for gallery ${galleryId}:`, dbError);
            res.status(500).send('Server error during schedule database update.');
        }

    } catch (error) { // Erreurs avant la base de données (ex: findById pour la galerie)
        console.error(`Error preparing schedule update for gallery ${galleryId}:`, error);
        res.status(500).send('Server error updating schedule.');
    }
};
