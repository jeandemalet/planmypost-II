// ===============================
//  Fichier: controllers\publicationController.js
// ===============================
const Publication = require('../models/Publication');
const Gallery = require('../models/Gallery');
const Image = require('../models/Image'); // Ajouté pour peupler les images de la Publication
const mongoose = require('mongoose');
const archiver = require('archiver'); // Ajouté pour le ZIP
const path = require('path');       // Ajouté pour les chemins de fichiers
const fs = require('fs');           // Ajouté pour vérifier l'existence des fichiers

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads'); // S'assurer que UPLOAD_DIR est défini

exports.createPublication = async (req, res) => {
    const { galleryId } = req.params;

    try {
        const gallery = await Gallery.findById(galleryId);
        if (!gallery) {
            return res.status(404).json({ message: `Gallery with ID ${galleryId} not found.` });
        }

        const existingPublications = await Publication.find({ galleryId: galleryId }).select('index letter').sort({ index: 1 });
        const existingIndices = new Set(existingPublications.map(p => p.index));
        
        let nextAvailableIndex = 0;
        while (existingIndices.has(nextAvailableIndex) && nextAvailableIndex < 26) {
            nextAvailableIndex++;
        }

        if (nextAvailableIndex >= 26) {
            return res.status(400).json({ message: 'Maximum number of Publications (A-Z) reached for this gallery.' });
        }
        
        const letter = String.fromCharCode('A'.charCodeAt(0) + nextAvailableIndex);

        const alreadyExists = existingPublications.find(p => p.letter === letter);
        if (alreadyExists) {
            console.warn(`Attempt to create Publication ${letter} (index ${nextAvailableIndex}) which already exists for gallery ${galleryId}.`);
            const populatedExistingPublication = await Publication.findById(alreadyExists._id).populate('images.imageId');
            return res.status(200).json(populatedExistingPublication);
        }

        const newPublication = new Publication({
            galleryId,
            letter,
            index: nextAvailableIndex,
            images: [],
            descriptionText: ''
        });
        await newPublication.save();

        let galleryNextHintIndex = 0;
        const currentIndicesAfterCreation = new Set([...existingIndices, nextAvailableIndex]);
        while(currentIndicesAfterCreation.has(galleryNextHintIndex) && galleryNextHintIndex < 26) {
            galleryNextHintIndex++;
        }
        
        gallery.nextJourIndex = galleryNextHintIndex;
        await gallery.save(); 

        const populatedPublication = await Publication.findById(newPublication._id).populate('images.imageId');
        res.status(201).json(populatedPublication);

    } catch (error) {
        console.error("Error creating publication:", error);
        if (error.name === 'ValidationError') {
            res.status(400).json({ message: `Validation Error: ${error.message}` });
        } else if (error.code === 11000) { 
             res.status(409).json({ message: `Conflict: Publication with this letter/index likely already exists (DB Error). Original error: ${error.message}` });
        }
        else {
            res.status(500).json({ message: 'Server error creating publication.' });
        }
    }
};

exports.getPublicationsForGallery = async (req, res) => {
    const { galleryId } = req.params;
    try {
        const publications = await Publication.find({ galleryId: galleryId })
                              .populate('images.imageId') 
                              .sort({ index: 1 }); 
        res.json(publications);
    } catch (error) {
        console.error("Error getting publications for gallery:", error);
        res.status(500).send('Server error retrieving publications.');
    }
};

exports.updatePublication = async (req, res) => {
    const { galleryId, publicationId } = req.params;
    const { images, descriptionText, autoCropSettings } = req.body;

    if (images !== undefined && !Array.isArray(images)) {
        return res.status(400).send('Invalid images data format. Expected an array if provided.');
    }
    
    const updatePayload = {};

    if (Array.isArray(images)) {
        const validatedImages = [];
        for (let i = 0; i < images.length; i++) {
            const imgEntry = images[i];
            if (!imgEntry || !mongoose.Types.ObjectId.isValid(imgEntry.imageId)) {
                console.warn(`Invalid imageId found in update request for Publication ${publicationId}:`, imgEntry);
                continue; 
            }
            validatedImages.push({
                imageId: imgEntry.imageId,
                order: i 
            });
        }
        updatePayload.images = validatedImages;
    }

    if (typeof descriptionText === 'string') {
        updatePayload.descriptionText = descriptionText;
    }
    
    // Gérer la mise à jour des paramètres de recadrage automatique
    if (autoCropSettings && typeof autoCropSettings === 'object') {
        if (autoCropSettings.vertical) {
            updatePayload['autoCropSettings.vertical'] = autoCropSettings.vertical;
        }
        if (autoCropSettings.horizontal) {
            updatePayload['autoCropSettings.horizontal'] = autoCropSettings.horizontal;
        }
    }
    
    if (Object.keys(updatePayload).length === 0) {
        return res.status(400).send('No valid data provided for update.');
    }

    try {
        const updatedPublication = await Publication.findOneAndUpdate(
            { _id: publicationId, galleryId: galleryId }, 
            { $set: updatePayload },  
            { new: true, runValidators: true }     
        ).populate('images.imageId'); 

        if (!updatedPublication) {
            return res.status(404).send('Publication not found or does not belong to the specified gallery.');
        }
        res.json(updatedPublication); 
    } catch (error) {
        console.error("Error updating publication:", error);
         if (error.name === 'ValidationError') {
            res.status(400).send(`Validation Error: ${error.message}`);
        } else {
            res.status(500).send('Server error updating publication.');
        }
    }
};

exports.deletePublication = async (req, res) => {
    const { galleryId, publicationId } = req.params;
    try {
        const result = await Publication.deleteOne({ _id: publicationId, galleryId: galleryId });

        if (result.deletedCount === 0) {
            return res.status(404).send('Publication not found or does not belong to the specified gallery.');
        }
        
        const gallery = await Gallery.findById(galleryId);
        if (gallery) {
            const remainingPublications = await Publication.find({ galleryId: galleryId }).select('index').sort({ index: 1 });
            const remainingIndices = new Set(remainingPublications.map(p => p.index));
            let nextIndex = 0;
            while (remainingIndices.has(nextIndex) && nextIndex < 26) {
                nextIndex++;
            }
            gallery.nextJourIndex = nextIndex;
            await gallery.save();
        }

        res.status(200).send('Publication deleted successfully.');
    } catch (error) {
        console.error("Error deleting publication:", error);
        res.status(500).send('Server error deleting publication.');
    }
};

exports.exportPublicationImagesAsZip = async (req, res) => {
    const { galleryId, publicationId } = req.params;

    try {
        // NOUVEAU : On récupère les informations de la publication ET de la galerie en parallèle
        const [publication, gallery] = await Promise.all([
            Publication.findById(publicationId).populate({
                path: 'images.imageId',
                model: 'Image'
            }),
            Gallery.findById(galleryId).select('name').lean() // .lean() pour la performance
        ]);

        if (!publication || publication.galleryId.toString() !== galleryId) {
            return res.status(404).send('Publication not found or does not belong to the specified gallery.');
        }

        // NOUVEAU : Vérification pour la galerie
        if (!gallery) {
            return res.status(404).send('Gallery not found for this Publication.');
        }

        if (!publication.images || publication.images.length === 0) {
            return res.status(400).send('This Publication contains no images to export.');
        }

        const archive = archiver('zip', {
            zlib: { level: 9 }
        });

        archive.on('warning', function (err) {
            if (err.code === 'ENOENT') {
                console.warn('Archiver warning (ENOENT):', err);
            } else {
                console.error('Archiver warning:', err);
            }
        });
        archive.on('error', function (err) {
            console.error('Archiver error:', err);
            if (!res.headersSent) {
                res.status(500).send({ error: 'Failed to create zip archive.', details: err.message });
            }
        });

        // --- MODIFICATION 1 : NOM DU FICHIER ZIP ---
        const sanitizedGalleryName = gallery.name.replace(/[^a-zA-Z0-9_.\-]/g, '_');
        const zipFileName = `${sanitizedGalleryName} - Publication ${publication.letter} - Plan My Post.zip`;
        res.attachment(zipFileName);
        // --- FIN MODIFICATION 1 ---

        archive.pipe(res);

        for (let i = 0; i < publication.images.length; i++) {
            const imageEntry = publication.images[i];
            if (imageEntry.imageId && imageEntry.imageId.path) {
                const imageDoc = imageEntry.imageId;
                const filePath = path.join(UPLOAD_DIR, imageDoc.path);

                if (fs.existsSync(filePath)) {
                    // --- MODIFICATION 2 : NOM DES FICHIERS DANS LE ZIP ---
                    const position = String(i + 1).padStart(2, '0');
                    // On extrait l'extension originale pour la conserver
                    const extension = path.extname(imageDoc.originalFilename) || '.jpg';
                    
                    const filenameInZip = `${sanitizedGalleryName} - Publication ${publication.letter} - ${position} - Plan My Post${extension}`;
                    // --- FIN MODIFICATION 2 ---

                    archive.file(filePath, { name: filenameInZip });
                } else {
                    console.warn(`File not found, skipping: ${filePath}`);
                }
            }
        }

        await archive.finalize();

    } catch (error) {
        console.error(`Error exporting Publication ${publicationId} images:`, error);
        if (!res.headersSent) {
            res.status(500).send('Server error during Publication export.');
        }
    }
};