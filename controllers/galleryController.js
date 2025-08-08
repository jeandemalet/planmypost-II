const Gallery = require('../models/Gallery');
const Image = require('../models/Image');
const Jour = require('../models/Jour');
const Schedule = require('../models/Schedule'); 
const User = require('../models/User'); // Ajout pour la logique utilisateur
const fse = require('fs-extra');
const path = require('path');
const mongoose = require('mongoose');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

// NOUVEAU : Fonction de nettoyage pour les données orphelines
/**
 * Recherche et supprime les Jours et les entrées de Calendrier (Schedule)
 * qui font référence à des galeries qui n'existent plus.
 * C'est une opération de maintenance pour garantir la propreté de la base de données.
 */
const cleanupOrphanedData = async () => {
    try {
        console.log('[CLEANUP] Démarrage du nettoyage des données orphelines...');
        
        // 1. Récupérer les IDs de toutes les galeries qui existent encore.
        const existingGalleries = await Gallery.find({}).select('_id').lean();
        const existingGalleryIds = new Set(existingGalleries.map(g => g._id.toString()));

        // 2. Supprimer tous les Jours dont le `galleryId` n'est PAS dans la liste des galeries existantes.
        const jourCleanupResult = await Jour.deleteMany({ galleryId: { $nin: Array.from(existingGalleryIds) } });
        if (jourCleanupResult.deletedCount > 0) {
            console.log(`[CLEANUP] ✅ ${jourCleanupResult.deletedCount} Jour(s) orphelin(s) supprimé(s).`);
        }

        // 3. Supprimer toutes les entrées du calendrier dont le `galleryId` n'est PAS dans la liste.
        const scheduleCleanupResult = await Schedule.deleteMany({ galleryId: { $nin: Array.from(existingGalleryIds) } });
        if (scheduleCleanupResult.deletedCount > 0) {
            console.log(`[CLEANUP] ✅ ${scheduleCleanupResult.deletedCount} entrée(s) de calendrier orpheline(s) supprimée(s).`);
        }

        console.log('[CLEANUP] Nettoyage terminé.');
    } catch (error) {
        console.error('[CLEANUP] Erreur lors du nettoyage des données orphelines:', error);
    }
};

const createInitialJour = async (galleryId) => {
    try {
        const newJour = new Jour({
            galleryId,
            letter: 'A',
            index: 0,
            images: [],
            descriptionText: ''
        });
        await newJour.save();

        const gallery = await Gallery.findById(galleryId);
        if (gallery) {
            gallery.nextJourIndex = 1;
            await gallery.save();
        }
    } catch (error) {
        console.error(`Failed to create initial Jour 'A' for gallery ${galleryId}:`, error);
        // We don't send a response here as this is an internal function
    }
};

// Créer une nouvelle galerie
exports.createGallery = async (req, res) => {
    try {
        const galleryName = req.body.name || `Galerie du ${new Date().toLocaleDateString('fr-FR')}`; // Nom par défaut si non fourni
        
        // MODIFIÉ : On assigne le propriétaire de la galerie
        if (!req.userData || !req.userData.userId) {
            return res.status(401).send('Utilisateur non authentifié, impossible de créer la galerie.');
        }

        const newGallery = new Gallery({
            name: galleryName,
            owner: req.userData.userId 
        });
        await newGallery.save();

        await createInitialJour(newGallery._id);

        res.status(201).json(newGallery);
    } catch (error) {
        console.error("Error creating gallery:", error);
        res.status(500).send('Server error creating gallery.');
    }
};

// Lister les galeries existantes de l'utilisateur
exports.listGalleries = async (req, res) => {
    try {
        if (!req.userData || !req.userData.userId) {
            return res.status(401).send('Utilisateur non authentifié.');
        }

        const limit = parseInt(req.query.limit) || 50; 
        const sortQuery = req.query.sort;
        let sort = { lastAccessed: -1 }; 
        if (sortQuery === 'createdAt_desc') {
            sort = { createdAt: -1 };
        } else if (sortQuery === 'createdAt_asc') {
             sort = { createdAt: 1 };
        } else if (sortQuery === 'name_asc') {
             sort = { name: 1 };
        } 

        const galleries = await Gallery.find({ owner: req.userData.userId }) // MODIFIÉ: On ne liste que les galeries de l'utilisateur
                                    .sort(sort)
                                    .limit(limit);
        res.json(galleries);
    } catch (error) {
        console.error("Error listing galleries:", error);
        res.status(500).send('Server error listing galleries.');
    }
};

// Obtenir les détails complets d'une galerie (état + données associées)
// Cette fonction reste en grande partie la même mais on s'assure que l'utilisateur a accès.
exports.getGalleryDetails = async (req, res) => {
    const { galleryId } = req.params;
    try {
        if (!mongoose.Types.ObjectId.isValid(galleryId)) {
            return res.status(400).send('Invalid Gallery ID format.');
        }

        // OPTIMISATION: .select() pour ne prendre que les champs nécessaires et .lean() pour la performance
        const gallery = await Gallery.findById(galleryId)
                                     .select('owner name currentThumbSize sortOption activeTab nextJourIndex')
                                     .lean();

        if (!gallery) {
            return res.status(404).send('Gallery not found.');
        }

        // Sécurité : Vérifier que l'utilisateur est le propriétaire ou admin
        if (gallery.owner.toString() !== req.userData.userId) {
            const user = await User.findById(req.userData.userId).select('role').lean();
            if (!user || user.role !== 'admin') {
                return res.status(403).send('Access denied to this gallery.');
            }
        }

        // 1. D'abord récupérer les galeries de l'utilisateur pour le contexte global
        const userGalleries = await Gallery.find({ owner: gallery.owner })
                                          .select('_id name')
                                          .lean();
        const userGalleryIds = userGalleries.map(g => g._id);

        // 2. OPTIMISATION: Lancer toutes les autres requêtes de données en parallèle
        const [images, jours, scheduleEntries, allJoursForUser] = await Promise.all([
            // Données spécifiques à la galerie actuelle (pour onglets Tri, Recadrage, etc.)
            Image.find({ galleryId: galleryId })
                 .sort({ uploadDate: 1 })
                 .select('-__v -mimeType -size') // Exclure des champs inutiles pour la grille
                 .lean(),
            Jour.find({ galleryId: galleryId })
                .populate({
                    path: 'images.imageId',
                    select: 'path thumbnailPath originalFilename isCroppedVersion parentImageId' // Ne peupler que les champs utiles
                })
                .sort({ index: 1 })
                .lean(),
            // CORRECTION CRUCIALE: Données globales pour l'utilisateur (pour onglet Calendrier)
            Schedule.find({ galleryId: { $in: userGalleryIds } }).select('date jourLetter galleryId').lean(),
            Jour.find({ galleryId: { $in: userGalleryIds } })
                .populate({ path: 'images.imageId', select: 'thumbnailPath' })
                .select('_id letter galleryId images')
                .lean()
        ]);

        // Mise à jour de lastAccessed en arrière-plan (non bloquant)
        Gallery.findByIdAndUpdate(galleryId, { lastAccessed: new Date() }).exec();

        // Traitement des données (rapide, car en mémoire)
        const galleryNameMap = userGalleries.reduce((acc, g) => {
            acc[g._id.toString()] = g.name;
            return acc;
        }, {});

        const scheduleData = scheduleEntries.reduce((acc, entry) => {
            if (!acc[entry.date]) acc[entry.date] = {};
            acc[entry.date][entry.jourLetter] = {
                galleryId: entry.galleryId.toString(),
                galleryName: galleryNameMap[entry.galleryId.toString()] || 'Galerie Inconnue'
            };
            return acc;
        }, {});

        const joursForScheduling = allJoursForUser.map(j => {
            if (j.images && Array.isArray(j.images) && j.images.length > 1) {
                j.images.sort((a, b) => (a.order || 0) - (b.order || 0));
            }
            const firstImage = j.images && j.images.length > 0 ? j.images[0]?.imageId : null;
            return {
                _id: j._id,
                letter: j.letter,
                galleryId: j.galleryId.toString(),
                galleryName: galleryNameMap[j.galleryId.toString()] || 'Galerie Inconnue',
                firstImageThumbnail: firstImage ? firstImage.thumbnailPath : null
            };
        });
                
        // La pagination a été retirée de cette fonction car le frontend la gère maintenant séparément
        // via la route /api/galleries/:galleryId/images. getGalleryDetails charge toutes les images pour l'onglet "Tri".
        res.json({
            galleryState: gallery,
            images: images, // Renvoie le tableau complet
            jours: jours,
            schedule: scheduleData,
            scheduleContext: {
                allUserJours: joursForScheduling
            }
        });

    } catch (error) {
        console.error(`Error getting gallery details for ${galleryId}:`, error);
        res.status(500).send('Server error getting gallery details.');
    }
};

// Mettre à jour l'état UI ET LE NOM de la galerie
exports.updateGalleryState = async (req, res) => {
    const { galleryId } = req.params;
    const updateData = { ...req.body, lastAccessed: new Date() };

    // Nettoyer les champs non modifiables
    delete updateData.owner;
    delete updateData._id;

    if (Object.keys(updateData).length === 1 && 'lastAccessed' in updateData) {
        return res.status(400).send('No valid update data provided.');
    }

    try {
        const gallery = await Gallery.findById(galleryId).select('owner');
        if (!gallery) {
            return res.status(404).send('Gallery not found for update.');
        }
        if (gallery.owner.toString() !== req.userData.userId) {
            return res.status(403).send('Access denied.');
        }
        const updatedGallery = await Gallery.findByIdAndUpdate(
            galleryId,
            { $set: updateData },
            { new: true, runValidators: true }
        ).lean();
        res.json(updatedGallery);
    } catch (error) {
        console.error(`Error updating gallery state for ${galleryId}:`, error);
        res.status(500).send('Server error updating gallery state.');
    }
};


// Supprimer une galerie et ses données associées
exports.deleteGallery = async (req, res) => {
    // MODIFIÉ : Ajout de l'appel à la fonction de nettoyage
    const { galleryId } = req.params;

    try {
        if (!mongoose.Types.ObjectId.isValid(galleryId)) {
            return res.status(400).send('Invalid Gallery ID format for deletion.');
        }
        const gallery = await Gallery.findById(galleryId);
        if (!gallery) {
            return res.status(404).send('Gallery not found for deletion.');
        }
        if (gallery.owner.toString() !== req.userData.userId) {
            return res.status(403).send('Access denied.');
        }

        const galleryUploadDir = path.join(UPLOAD_DIR, galleryId);
        
        // Suppression en parallèle des fichiers et des données en base de données
        await Promise.all([
            fse.remove(galleryUploadDir), 
            Image.deleteMany({ galleryId: galleryId }),
            Jour.deleteMany({ galleryId: galleryId }),
            Schedule.deleteMany({ galleryId: galleryId }),
            Gallery.findByIdAndDelete(galleryId)
        ]);

        res.status(200).send(`Gallery ${galleryId} and all associated data deleted successfully.`);

        // On lance le nettoyage des données orphelines après avoir envoyé la réponse
        // pour ne pas faire attendre l'utilisateur. C'est une tâche de fond.
        cleanupOrphanedData().catch(err => {
            console.error("Erreur lors du nettoyage en arrière-plan après la suppression de la galerie:", err);
        });

    } catch (error) {
        console.error(`Error deleting gallery ${galleryId}:`, error);
        if (error.name === 'CastError' && error.kind === 'ObjectId') {
             return res.status(400).send('Invalid Gallery ID format (CastError for deletion).');
        }
        res.status(500).send('Server error deleting gallery.');
    }
};