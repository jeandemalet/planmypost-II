const Gallery = require('../models/Gallery');
const Image = require('../models/Image');
const Jour = require('../models/Jour');
const Schedule = require('../models/Schedule'); 
const User = require('../models/User'); // Ajout pour la logique utilisateur
const fse = require('fs-extra');
const path = require('path');
const mongoose = require('mongoose');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

const createInitialJour = async (galleryId) => {
    try {
        const newJour = new Jour({
            galleryId,
            letter: 'A',
            index: 0,
            images: [],
            descriptionText: '',
            descriptionHashtags: ''
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
        const gallery = await Gallery.findById(galleryId);
        if (!gallery) {
            return res.status(404).send('Gallery not found.');
        }
        
        // Sécurité : Vérifier que l'utilisateur est le propriétaire
        if (gallery.owner.toString() !== req.userData.userId) {
            // Gérer le cas des admins qui peuvent voir tout
            const user = await User.findById(req.userData.userId);
            if (!user || user.role !== 'admin') {
                return res.status(403).send('Access denied to this gallery.');
            }
        }

        gallery.lastAccessed = new Date();
        await gallery.save();

        // ======================= CORRECTION CI-DESSOUS =======================
        // On supprime le filtre `{ isCroppedVersion: { $ne: true } }` pour
        // charger TOUTES les images (originales ET recadrées).
        // Ligne corrigée
        const images = await Image.find({ galleryId: galleryId, isCroppedVersion: { $ne: true } })
                                .sort({ uploadDate: 1 }); 

        const jours = await Jour.find({ galleryId: galleryId })
                              .populate('images.imageId') 
                              .sort({ index: 1 });
        
        // NOUVELLE LOGIQUE : Récupérer le calendrier pour tout l'utilisateur
        const userGalleries = await Gallery.find({ owner: gallery.owner }).select('_id name');
        const userGalleryIds = userGalleries.map(g => g._id);
        const galleryNameMap = userGalleries.reduce((acc, g) => {
            acc[g._id.toString()] = g.name;
            return acc;
        }, {});

        const scheduleEntries = await Schedule.find({ galleryId: { $in: userGalleryIds } });
        const allJoursForUser = await Jour.find({ galleryId: { $in: userGalleryIds } }).select('_id letter galleryId');

        const scheduleData = scheduleEntries.reduce((acc, entry) => {
            if (!acc[entry.date]) acc[entry.date] = {};
            acc[entry.date][entry.jourLetter] = {
                galleryId: entry.galleryId.toString(),
                galleryName: galleryNameMap[entry.galleryId.toString()] || 'Galerie Inconnue'
            };
            return acc;
        }, {});

        // Données complètes pour la planification automatique
        const joursForScheduling = allJoursForUser.map(j => ({
            _id: j._id,
            letter: j.letter,
            galleryId: j.galleryId.toString(),
            galleryName: galleryNameMap[j.galleryId.toString()] || 'Galerie Inconnue'
        }));


        res.json({
            galleryState: gallery,
            images: images,
            jours: jours,
            schedule: scheduleData,
            scheduleContext: {
                allUserJours: joursForScheduling
            }
        });

    } catch (error) {
        console.error(`Error getting gallery details for ${galleryId}:`, error);
        if (error.name === 'CastError' && error.kind === 'ObjectId') {
             return res.status(400).send('Invalid Gallery ID format (CastError).');
        }
        res.status(500).send('Server error getting gallery details.');
    }
};

// Mettre à jour l'état UI ET LE NOM de la galerie
exports.updateGalleryState = async (req, res) => {
    // ... (Logique inchangée, la vérification de propriété se fait dans getGalleryDetails)
    // On pourrait ajouter une vérification ici aussi pour la sécurité.
    const { galleryId } = req.params;
    const { name, currentThumbSize, sortOption, activeTab, nextJourIndex } = req.body;

    const updateData = {};
    
    if (name && typeof name === 'string' && name.trim() !== '') {
        updateData.name = name.trim();
    }
    if (currentThumbSize && typeof currentThumbSize.width === 'number' && typeof currentThumbSize.height === 'number') {
         updateData.currentThumbSize = currentThumbSize;
    }
    if (typeof sortOption === 'string') updateData.sortOption = sortOption;
    if (typeof activeTab === 'string') updateData.activeTab = activeTab;
    if (typeof nextJourIndex === 'number' && nextJourIndex >= 0) {
         updateData.nextJourIndex = nextJourIndex;
    }

    if (Object.keys(updateData).length === 0) {
        return res.status(400).send('No valid update data provided for gallery state.');
    }

    updateData.lastAccessed = new Date(); 

    try {
        if (!mongoose.Types.ObjectId.isValid(galleryId)) {
            return res.status(400).send('Invalid Gallery ID format for update.');
        }
        
        const gallery = await Gallery.findById(galleryId);
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
        );

        if (!updatedGallery) {
            return res.status(404).send('Gallery not found for update.');
        }
        res.json(updatedGallery); 
    } catch (error) {
        console.error(`Error updating gallery state for ${galleryId}:`, error);
         if (error.name === 'CastError' && error.kind === 'ObjectId') {
             return res.status(400).send('Invalid Gallery ID format (CastError for update).');
        }
        res.status(500).send('Server error updating gallery state.');
    }
};


// Supprimer une galerie et ses données associées
exports.deleteGallery = async (req, res) => {
    // ... (Logique inchangée, la vérification de propriété est une bonne pratique)
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
        await fse.remove(galleryUploadDir); 

        await Image.deleteMany({ galleryId: galleryId });
        await Jour.deleteMany({ galleryId: galleryId });
        await Schedule.deleteMany({ galleryId: galleryId });
        await Gallery.findByIdAndDelete(galleryId);

        res.status(200).send(`Gallery ${galleryId} and all associated data deleted successfully.`);

    } catch (error) {
        console.error(`Error deleting gallery ${galleryId}:`, error);
        if (error.name === 'CastError' && error.kind === 'ObjectId') {
             return res.status(400).send('Invalid Gallery ID format (CastError for deletion).');
        }
        res.status(500).send('Server error deleting gallery.');
    }
};