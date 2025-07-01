const Schedule = require('../models/Schedule');
const Jour = require('../models/Jour');
const Gallery = require('../models/Gallery');
const mongoose = require('mongoose');

// Obtenir le calendrier pour TOUTES les galeries de l'utilisateur
exports.getScheduleForGallery = async (req, res) => {
    // La route contient un galleryId, on s'en sert pour trouver l'utilisateur propriétaire
    const { galleryId } = req.params;
    try {
        const contextGallery = await Gallery.findById(galleryId).select('owner');
        if (!contextGallery) {
            return res.status(404).send('Context gallery not found.');
        }
        const userId = contextGallery.owner;

        // Récupérer toutes les galeries de cet utilisateur pour construire le calendrier complet
        const userGalleries = await Gallery.find({ owner: userId }).select('_id name');
        const userGalleryIds = userGalleries.map(g => g._id);
        const galleryNameMap = userGalleries.reduce((acc, g) => {
            acc[g._id.toString()] = g.name;
            return acc;
        }, {});

        const scheduleEntries = await Schedule.find({ galleryId: { $in: userGalleryIds } });

        const scheduleData = scheduleEntries.reduce((acc, entry) => {
            const date = entry.date;
            if (!acc[date]) acc[date] = {};
            acc[date][entry.jourLetter] = {
                galleryId: entry.galleryId.toString(),
                galleryName: galleryNameMap[entry.galleryId.toString()] || 'Galerie Inconnue'
            };
            return acc;
        }, {});

        res.json(scheduleData);

    } catch (error) {
        console.error(`Error getting user schedule via gallery ${galleryId}:`, error);
        res.status(500).send('Server error getting schedule.');
    }
};

// Mettre à jour TOUT le calendrier pour l'utilisateur
exports.updateSchedule = async (req, res) => {
    const { galleryId } = req.params; // galleryId de contexte pour trouver l'utilisateur
    const scheduleData = req.body;

    if (typeof scheduleData !== 'object' || scheduleData === null) {
         return res.status(400).send('Invalid schedule data format.');
    }

    try {
        const contextGallery = await Gallery.findById(galleryId).select('owner');
        if (!contextGallery) {
            return res.status(404).send('Context gallery not found.');
        }
        const userId = contextGallery.owner;

        const userGalleries = await Gallery.find({ owner: userId }).select('_id');
        const userGalleryIds = userGalleries.map(g => g._id);

        const newEntries = [];
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        const letterRegex = /^[A-Z]$/;

        for (const date in scheduleData) {
            if (dateRegex.test(date)) {
                const joursOnDate = scheduleData[date];
                for (const jourLetter in joursOnDate) {
                    if (letterRegex.test(jourLetter)) {
                         const entryData = joursOnDate[jourLetter];
                         // Important: on vérifie que le galleryId de l'entrée est bien à l'utilisateur
                         if (entryData && entryData.galleryId && userGalleryIds.some(id => id.toString() === entryData.galleryId)) {
                             newEntries.push({
                                 galleryId: entryData.galleryId,
                                 date: date,
                                 jourLetter: jourLetter
                             });
                         }
                    }
                }
            }
        }

        // Transaction : supprimer toutes les anciennes entrées de l'utilisateur et insérer les nouvelles
        await Schedule.deleteMany({ galleryId: { $in: userGalleryIds } });

        if (newEntries.length > 0) {
            await Schedule.insertMany(newEntries, { ordered: false }).catch(err => {
                // ignorer les erreurs de duplicatas si plusieurs personnes modifient en même temps, mais logguer
                if (err.code !== 11000) {
                    throw err; // relancer les autres erreurs
                }
                console.warn('Ignored duplicate key error during schedule update, likely a race condition.');
            });
        }
        
                res.status(200).send('User schedule updated successfully.');

    } catch (error) {
        console.error(`Error updating user schedule via gallery ${galleryId}:`, error);
        res.status(500).send('Server error updating schedule.');
    }
};

// Ajoute ou met à jour un jour spécifique dans le calendrier
exports.addOrUpdateJourInSchedule = async (req, res) => {
    const { galleryId, jourId } = req.params;
    const { date } = req.body; // La date à laquelle assigner le jour

    // Validation de la date
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).send('Format de date invalide. Attendu: YYYY-MM-DD.');
    }

    try {
        // 1. Vérifier que le jour et la galerie existent
        const jour = await Jour.findOne({ _id: jourId, galleryId: galleryId }).select('letter');
        if (!jour) {
            return res.status(404).send('Jour non trouvé dans cette galerie.');
        }

        // 2. Vérifier les permissions (le propriétaire de la galerie est l'utilisateur actuel)
        const gallery = await Gallery.findById(galleryId).select('owner');
        if (!gallery || !req.user || gallery.owner.toString() !== req.user.id) {
             return res.status(403).send('Permission refusée.');
        }

        // 3. Supprimer toutes les anciennes entrées de calendrier pour ce jour
        await Schedule.deleteMany({
            galleryId: galleryId,
            jourLetter: jour.letter
        });

        // 4. Créer la nouvelle entrée de calendrier
        const newScheduleEntry = new Schedule({
            galleryId: galleryId,
            date: date,
            jourLetter: jour.letter
        });
        await newScheduleEntry.save();

        // 5. Renvoyer la nouvelle entrée créée
        res.status(201).json(newScheduleEntry);

    } catch (error) {
        console.error(`Erreur lors de l'ajout/mise à jour du jour ${jourId} au calendrier:`, error);
        // Gérer les conflits (par exemple, si une contrainte d'unicité est violée)
        if (error.code === 11000) {
            return res.status(409).send('Conflit: Un jour avec la même lettre est déjà planifié à cette date dans cette galerie.');
        }
        res.status(500).send('Erreur serveur lors de la mise à jour du calendrier.');
    }
};