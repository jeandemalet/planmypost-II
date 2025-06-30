

const Gallery = require('../models/Gallery');
const Image = require('../models/Image');
const Jour = require('../models/Jour');
const Schedule = require('../models/Schedule'); 
const fse = require('fs-extra');
const path = require('path');
const mongoose = require('mongoose'); // Ajouté pour mongoose.Types.ObjectId.isValid

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

// Créer une nouvelle galerie
exports.createGallery = async (req, res) => {
    try {
        const galleryName = req.body.name || `Galerie du ${new Date().toLocaleDateString('fr-FR')}`; // Nom par défaut si non fourni
        const newGallery = new Gallery({
            name: galleryName,
            owner: req.user._id
        });
        await newGallery.save();
        res.status(201).json(newGallery);
    } catch (error) {
        console.error("Error creating gallery:", error);
        res.status(500).send('Server error creating gallery.');
    }
};

// Lister les galeries existantes
exports.listGalleries = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50; // Augmenter la limite par défaut
        const sortQuery = req.query.sort;
        let sort = { lastAccessed: -1 }; 
        if (sortQuery === 'createdAt_desc') {
            sort = { createdAt: -1 };
        } else if (sortQuery === 'createdAt_asc') {
             sort = { createdAt: 1 };
        } else if (sortQuery === 'name_asc') {
             sort = { name: 1 };
        } 

        const galleries = await Gallery.find({ owner: req.user._id })
                                    .sort(sort)
                                    .limit(limit);
        res.json(galleries);
    } catch (error) {
        console.error("Error listing galleries:", error);
        res.status(500).send('Server error listing galleries.');
    }
};

// Obtenir les détails complets d'une galerie (état + données associées)
exports.getGalleryDetails = async (req, res) => {
    const { galleryId } = req.params;
    try {
        // Vérifier la validité de l'ID ObjectId avant la requête
        if (!mongoose.Types.ObjectId.isValid(galleryId)) {
            return res.status(400).send('Invalid Gallery ID format.');
        }
        const gallery = await Gallery.findOne({ _id: galleryId, owner: req.user._id });
        if (!gallery) {
            return res.status(404).send('Gallery not found or not owned by user.');
        }

        gallery.lastAccessed = new Date();
        await gallery.save();

        const images = await Image.find({ galleryId: galleryId, isCroppedVersion: { $ne: true } })
                                  .sort({ uploadDate: 1 }); 

        const jours = await Jour.find({ galleryId: galleryId })
                              .populate('images.imageId') 
                              .sort({ index: 1 });

        const scheduleEntries = await Schedule.find({ galleryId: galleryId });
        const scheduleData = scheduleEntries.reduce((acc, entry) => {
            if (!acc[entry.date]) acc[entry.date] = {};
            acc[entry.date][entry.jourLetter] = {};
            return acc;
        }, {});

        res.json({
            galleryState: gallery,
            images: images,
            jours: jours,
            schedule: scheduleData 
        });

    } catch (error) {
        console.error(`Error getting gallery details for ${galleryId}:`, error);
        // Distinguer les erreurs d'ID invalide des erreurs serveur
        if (error.name === 'CastError' && error.kind === 'ObjectId') { // Mongoose < v7
             return res.status(400).send('Invalid Gallery ID format (CastError).');
        }
        res.status(500).send('Server error getting gallery details.');
    }
};

// Mettre à jour l'état UI ET LE NOM de la galerie
exports.updateGalleryState = async (req, res) => {
    const { galleryId } = req.params;
    // Destructure les champs attendus du modèle Gallery
    const { name, currentThumbSize, sortOption, activeTab, nextJourIndex } = req.body;

    const updateData = {};
    
    // Valider et ajouter les champs à mettre à jour
    if (name && typeof name === 'string' && name.trim() !== '') { // MODIFIÉ: Ajout de la gestion du nom
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
        // Vérifier la validité de l'ID ObjectId avant la requête
        if (!mongoose.Types.ObjectId.isValid(galleryId)) {
            return res.status(400).send('Invalid Gallery ID format for update.');
        }
        const updatedGallery = await Gallery.findOneAndUpdate(
            { _id: galleryId, owner: req.user._id },
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


// Supprimer une galerie et ses données associées (images, jours, calendrier)
exports.deleteGallery = async (req, res) => {
    const { galleryId } = req.params;

    try {
        // Vérifier la validité de l'ID ObjectId avant la requête
        if (!mongoose.Types.ObjectId.isValid(galleryId)) {
            return res.status(400).send('Invalid Gallery ID format for deletion.');
        }
        const gallery = await Gallery.findOneAndDelete({ _id: galleryId, owner: req.user._id });
        if (!gallery) {
            return res.status(404).send('Gallery not found or not owned by user for deletion.');
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
