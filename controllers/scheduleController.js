const Schedule = require('../models/Schedule');
const Gallery = require('../models/Gallery');
const User = require('../models/User'); // Ajouté pour la vérification des droits
const mongoose = require('mongoose');

// Obtenir le calendrier pour TOUTES les galeries de l'utilisateur
exports.getScheduleForGallery = async (req, res) => {
    // La route contient un galleryId, mais on ne s'en sert que pour trouver l'utilisateur propriétaire
    try {
        const user = await User.findById(req.userData.userId).select('_id').lean();
        if (!user) {
            return res.status(404).send('User not found.');
        }

        // Récupérer toutes les galeries de cet utilisateur pour construire le calendrier complet
        const userGalleries = await Gallery.find({ owner: user._id }).select('_id name').lean();
        const userGalleryIds = userGalleries.map(g => g._id);
        const galleryNameMap = userGalleries.reduce((acc, g) => {
            acc[g._id.toString()] = g.name;
            return acc;
        }, {});

        const scheduleEntries = await Schedule.find({ galleryId: { $in: userGalleryIds } }).lean();

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
        console.error(`Error getting user schedule for user ${req.userData.userId}:`, error);
        res.status(500).send('Server error getting schedule.');
    }
};

// Mettre à jour TOUT le calendrier pour l'utilisateur de manière plus sécurisée
exports.updateSchedule = async (req, res) => {
    const scheduleData = req.body;
    const userId = req.userData.userId; // On utilise directement l'ID de l'utilisateur authentifié

    if (typeof scheduleData !== 'object' || scheduleData === null) {
        return res.status(400).send('Invalid schedule data format.');
    }

    try {

        // 1. Récupérer les galeries et l'ancien calendrier de l'utilisateur
        const userGalleries = await Gallery.find({ owner: userId }).select('_id').lean();
        const userGalleryIds = userGalleries.map(g => g._id.toString());
        const userGalleryIdsSet = new Set(userGalleryIds);

        const oldScheduleEntries = await Schedule.find({ galleryId: { $in: userGalleryIds } }).lean();
        const oldScheduleSet = new Set(
            oldScheduleEntries.map(e => `${e.date}_${e.jourLetter}_${e.galleryId.toString()}`)
        );

        // 2. Traiter les nouvelles données du calendrier
        const newScheduleSet = new Set();
        const newEntriesToInsert = [];
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        const letterRegex = /^[A-Z]$/;

        for (const date in scheduleData) {
            if (!dateRegex.test(date)) continue;

            const joursOnDate = scheduleData[date];
            for (const jourLetter in joursOnDate) {
                if (!letterRegex.test(jourLetter)) continue;

                const entryData = joursOnDate[jourLetter];
                // Sécurité: Vérifier que le galleryId de l'entrée est valide et appartient bien à l'utilisateur
                if (entryData && entryData.galleryId && userGalleryIdsSet.has(entryData.galleryId)) {
                    const uniqueKey = `${date}_${jourLetter}_${entryData.galleryId}`;
                    if (!newScheduleSet.has(uniqueKey)) {
                        newScheduleSet.add(uniqueKey);
                        newEntriesToInsert.push({
                            galleryId: new mongoose.Types.ObjectId(entryData.galleryId),
                            date: date,
                            jourLetter: jourLetter,
                            owner: userId // On pourrait ajouter un champ owner pour simplifier les requêtes
                        });
                    }
                }
            }
        }

        // 3. Déterminer les entrées à ajouter et à supprimer
        const entriesToAdd = [];
        const newScheduleKeysForDb = new Set();
        for (const entry of newEntriesToInsert) {
            const key = `${entry.date}_${entry.jourLetter}_${entry.galleryId}`;
            newScheduleKeysForDb.add(key);
            if (!oldScheduleSet.has(key)) {
                entriesToAdd.push(entry);
            }
        }

        const entriesToDelete = oldScheduleEntries.filter(entry => {
            const key = `${entry.date}_${entry.jourLetter}_${entry.galleryId.toString()}`;
            return !newScheduleKeysForDb.has(key);
        });

        // 4. Exécuter les opérations sur la base de données
        const promises = [];
        if (entriesToDelete.length > 0) {
            const deleteQuery = {
                _id: { $in: entriesToDelete.map(e => e._id) }
            };
            promises.push(Schedule.deleteMany(deleteQuery));
        }

        if (entriesToAdd.length > 0) {
            promises.push(
                Schedule.insertMany(entriesToAdd, { ordered: false }).catch(err => {
                    if (err.code !== 11000) { // Ignorer les erreurs de clé dupliquée (sécurité)
                        throw err;
                    }
                    console.warn('Ignored duplicate key error during schedule update, likely a race condition.');
                })
            );
        }

        await Promise.all(promises);

        res.status(200).send('User schedule updated successfully.');

    } catch (error) {
        console.error(`Error updating user schedule for user ${userId}:`, error);
        res.status(500).send('Server error updating schedule.');
    }
};