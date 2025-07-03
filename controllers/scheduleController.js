const Schedule = require('../models/Schedule');
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