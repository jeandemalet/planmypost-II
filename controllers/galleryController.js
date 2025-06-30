const Gallery = require('../models/Gallery');
const Image = require('../models/Image');
const Jour = require('../models/Jour');
const Schedule = require('../models/Schedule'); 
const fse = require('fs-extra');
const path = require('path');
const mongoose = require('mongoose');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

/**
 * Helper de sécurité : Construit une requête Mongoose.
 * - Si l'utilisateur n'est pas admin, il ajoute une condition sur l'owner.
 * - Si l'utilisateur est admin, il n'ajoute PAS la condition, donnant un accès total.
 * @param {object} req - L'objet requête Express
 * @param {object} [initialQuery={}] - Conditions de requête de base
 * @returns {object} La requête Mongoose finale
 */
const buildOwnerQuery = (req, initialQuery = {}) => {
    const query = { ...initialQuery };
    // Si l'utilisateur connecté N'EST PAS un admin, on force le filtrage par son ID.
    if (req.user.role !== 'admin') {
        query.owner = req.user._id;
    }
    return query;
};


// Créer une nouvelle galerie
exports.createGallery = async (req, res) => {
    try {
        const galleryName = req.body.name || `Galerie du ${new Date().toLocaleDateString('fr-FR')}`;
        const newGallery = new Gallery({
            name: galleryName,
            owner: req.user._id // Une galerie est toujours créée pour l'utilisateur courant
        });
        await newGallery.save();
        res.status(201).json(newGallery);
    } catch (error) {
        console.error("Error creating gallery:", error);
        res.status(500).send('Server error creating gallery.');
    }
};

// Lister les galeries existantes (pour soi-même ou toutes si admin)
exports.listGalleries = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const sortQuery = req.query.sort;
        let sort = { lastAccessed: -1 }; 

        if (sortQuery === 'createdAt_desc') sort = { createdAt: -1 };
        else if (sortQuery === 'createdAt_asc') sort = { createdAt: 1 };
        else if (sortQuery === 'name_asc') sort = { name: 1 };

        const query = buildOwnerQuery(req);

        const galleries = await Gallery.find(query)
                                    .populate('owner', 'displayName email') // Utile pour l'admin
                                    .sort(sort)
                                    .limit(limit);
        res.json(galleries);
    } catch (error) {
        console.error("Error listing galleries:", error);
        res.status(500).send('Server error listing galleries.');
    }
};

// Obtenir les détails complets d'une galerie
exports.getGalleryDetails = async (req, res) => {
    const { galleryId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(galleryId)) {
        return res.status(400).send('Invalid Gallery ID format.');
    }

    try {
        const query = buildOwnerQuery(req, { _id: galleryId });
        const gallery = await Gallery.findOne(query);
        
        if (!gallery) {
            return res.status(404).send('Gallery not found or access denied.');
        }

        gallery.lastAccessed = new Date();
        await gallery.save();

        const images = await Image.find({ galleryId: galleryId, isCroppedVersion: { $ne: true } }).sort({ uploadDate: 1 }); 
        const jours = await Jour.find({ galleryId: galleryId }).populate('images.imageId').sort({ index: 1 });
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
        res.status(500).send('Server error getting gallery details.');
    }
};

// Mettre à jour l'état UI ET LE NOM de la galerie
exports.updateGalleryState = async (req, res) => {
    const { galleryId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(galleryId)) {
        return res.status(400).send('Invalid Gallery ID format for update.');
    }
    
    const { name, currentThumbSize, sortOption, activeTab, nextJourIndex } = req.body;
    const updateData = {};
    
    if (name && typeof name === 'string' && name.trim() !== '') updateData.name = name.trim();
    if (currentThumbSize) updateData.currentThumbSize = currentThumbSize;
    if (typeof sortOption === 'string') updateData.sortOption = sortOption;
    if (typeof activeTab === 'string') updateData.activeTab = activeTab;
    if (typeof nextJourIndex === 'number') updateData.nextJourIndex = nextJourIndex;

    if (Object.keys(updateData).length === 0) {
        return res.status(400).send('No valid update data provided.');
    }
    updateData.lastAccessed = new Date(); 

    try {
        const query = buildOwnerQuery(req, { _id: galleryId });
        const updatedGallery = await Gallery.findOneAndUpdate(
            query,
            { $set: updateData },
            { new: true, runValidators: true } 
        );

        if (!updatedGallery) {
            return res.status(404).send('Gallery not found or access denied for update.');
        }
        res.json(updatedGallery); 
    } catch (error) {
        console.error(`Error updating gallery state for ${galleryId}:`, error);
        res.status(500).send('Server error updating gallery state.');
    }
};

// Supprimer une galerie et ses données associées
exports.deleteGallery = async (req, res) => {
    const { galleryId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(galleryId)) {
        return res.status(400).send('Invalid Gallery ID format for deletion.');
    }

    try {
        const query = buildOwnerQuery(req, { _id: galleryId });
        const gallery = await Gallery.findOneAndDelete(query);
        
        if (!gallery) {
            return res.status(404).send('Gallery not found or access denied for deletion.');
        }

        const galleryUploadDir = path.join(UPLOAD_DIR, galleryId);
        await fse.remove(galleryUploadDir); 

        await Image.deleteMany({ galleryId: galleryId });
        await Jour.deleteMany({ galleryId: galleryId });
        await Schedule.deleteMany({ galleryId: galleryId });

        res.status(200).send(`Gallery ${galleryId} and all associated data deleted successfully.`);
    } catch (error) {
        console.error(`Error deleting gallery ${galleryId}:`, error);
        res.status(500).send('Server error deleting gallery.');
    }
};