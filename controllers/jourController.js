// ===============================
//  Fichier: controllers\jourController.js
// ===============================
const Jour = require('../models/Jour');
const Gallery = require('../models/Gallery');
const Image = require('../models/Image'); // Ajouté pour peupler les images du Jour
const mongoose = require('mongoose');
const archiver = require('archiver'); // Ajouté pour le ZIP
const path = require('path');       // Ajouté pour les chemins de fichiers
const fs = require('fs');           // Ajouté pour vérifier l'existence des fichiers

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads'); // S'assurer que UPLOAD_DIR est défini

exports.createJour = async (req, res) => {
    const { galleryId } = req.params;

    try {
        const gallery = await Gallery.findOne({ _id: galleryId, owner: req.user._id });
        if (!gallery) {
            return res.status(404).json({ message: `Gallery with ID ${galleryId} not found or not owned by user.` });
        }

        const existingJours = await Jour.find({ galleryId: galleryId }).select('index letter').sort({ index: 1 });
        const existingIndices = new Set(existingJours.map(j => j.index));
        
        let nextAvailableIndex = 0;
        while (existingIndices.has(nextAvailableIndex) && nextAvailableIndex < 26) {
            nextAvailableIndex++;
        }

        if (nextAvailableIndex >= 26) {
            return res.status(400).json({ message: 'Maximum number of Jours (A-Z) reached for this gallery.' });
        }
        
        const letter = String.fromCharCode('A'.charCodeAt(0) + nextAvailableIndex);

        const alreadyExists = existingJours.find(j => j.letter === letter);
        if (alreadyExists) {
            console.warn(`Attempt to create Jour ${letter} (index ${nextAvailableIndex}) which already exists for gallery ${galleryId}.`);
            const populatedExistingJour = await Jour.findById(alreadyExists._id).populate('images.imageId');
            return res.status(200).json(populatedExistingJour);
        }

        const newJour = new Jour({
            galleryId,
            owner: req.user._id,
            letter,
            index,
            images: [],
            descriptionText: '',
            descriptionHashtags: ''
        });
        await newJour.save();

        let galleryNextHintIndex = 0;
        const currentIndicesAfterCreation = new Set([...existingIndices, nextAvailableIndex]);
        while(currentIndicesAfterCreation.has(galleryNextHintIndex) && galleryNextHintIndex < 26) {
            galleryNextHintIndex++;
        }
        
        gallery.nextJourIndex = galleryNextHintIndex;
        await gallery.save(); 

        const populatedJour = await Jour.findById(newJour._id).populate('images.imageId');
        res.status(201).json(populatedJour);

    } catch (error) {
        console.error("Error creating jour:", error);
        if (error.name === 'ValidationError') {
            res.status(400).json({ message: `Validation Error: ${error.message}` });
        } else if (error.code === 11000) { 
             res.status(409).json({ message: `Conflict: Jour with this letter/index likely already exists (DB Error). Original error: ${error.message}` });
        }
        else {
            res.status(500).json({ message: 'Server error creating jour.' });
        }
    }
};

exports.getJoursForGallery = async (req, res) => {
    const { galleryId } = req.params;
    try {
        const jours = await Jour.find({ galleryId: galleryId, owner: req.user._id })
                              .populate('images.imageId') 
                              .sort({ index: 1 }); 
        res.json(jours);
    } catch (error) {
        console.error("Error getting jours for gallery:", error);
        res.status(500).send('Server error retrieving jours.');
    }
};

exports.updateJour = async (req, res) => {
    const { galleryId, jourId } = req.params;
    const { images, descriptionText, descriptionHashtags } = req.body;

    if (images !== undefined && !Array.isArray(images)) {
        return res.status(400).send('Invalid images data format. Expected an array if provided.');
    }
    
    const updatePayload = {};

    if (Array.isArray(images)) {
        const validatedImages = [];
        for (let i = 0; i < images.length; i++) {
            const imgEntry = images[i];
            if (!imgEntry || !mongoose.Types.ObjectId.isValid(imgEntry.imageId)) {
                console.warn(`Invalid imageId found in update request for Jour ${jourId}:`, imgEntry);
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
    if (typeof descriptionHashtags === 'string') {
        updatePayload.descriptionHashtags = descriptionHashtags;
    }
    
    if (Object.keys(updatePayload).length === 0) {
        return res.status(400).send('No valid data provided for update.');
    }

    try {
        const updatedJour = await Jour.findOneAndUpdate(
            { _id: jourId, galleryId: galleryId, owner: req.user._id }, 
            { $set: updatePayload },  
            { new: true, runValidators: true }     
        ).populate('images.imageId'); 

        if (!updatedJour) {
            return res.status(404).send('Jour not found or does not belong to the specified gallery.');
        }
        res.json(updatedJour); 
    } catch (error) {
        console.error("Error updating jour:", error);
         if (error.name === 'ValidationError') {
            res.status(400).send(`Validation Error: ${error.message}`);
        } else {
            res.status(500).send('Server error updating jour.');
        }
    }
};

exports.deleteJour = async (req, res) => {
    const { galleryId, jourId } = req.params;
    try {
        const result = await Jour.deleteOne({ _id: jourId, galleryId: galleryId, owner: req.user._id });

        if (result.deletedCount === 0) {
            return res.status(404).send('Jour not found or does not belong to the specified gallery or user.');
        }
        
        const gallery = await Gallery.findById(galleryId);
        if (gallery) {
            const remainingJours = await Jour.find({ galleryId: galleryId }).select('index').sort({ index: 1 });
            const remainingIndices = new Set(remainingJours.map(j => j.index));
            let nextIndex = 0;
            while (remainingIndices.has(nextIndex) && nextIndex < 26) {
                nextIndex++;
            }
            gallery.nextJourIndex = nextIndex;
            await gallery.save();
        }

        res.status(200).send('Jour deleted successfully.');
    } catch (error) {
        console.error("Error deleting jour:", error);
        res.status(500).send('Server error deleting jour.');
    }
};

// NOUVELLE FONCTION: Exporter les images d'un Jour en tant que ZIP
exports.exportJourImagesAsZip = async (req, res) => {
    const { galleryId, jourId } = req.params;

    try {
        const jour = await Jour.findOne({ _id: jourId, owner: req.user._id })
            .populate({
                path: 'images.imageId',
                model: 'Image' // Assurez-vous que 'Image' est le nom correct de votre modèle
            });

        if (!jour || jour.galleryId.toString() !== galleryId) {
            return res.status(404).send('Jour not found or does not belong to the specified gallery or user.');
        }

        if (!jour.images || jour.images.length === 0) {
            return res.status(400).send('This Jour contains no images to export.');
        }

        const archive = archiver('zip', {
            zlib: { level: 9 } // Niveau de compression
        });

        // Gérer les erreurs de l'archiveur
        archive.on('warning', function (err) {
            if (err.code === 'ENOENT') {
                console.warn('Archiver warning (ENOENT):', err);
            } else {
                console.error('Archiver warning:', err);
            }
        });
        archive.on('error', function (err) {
            console.error('Archiver error:', err);
            // Si les en-têtes ne sont pas encore envoyés, envoyez une erreur 500
            if (!res.headersSent) {
                res.status(500).send({ error: 'Failed to create zip archive.', details: err.message });
            }
        });

        // Définir le nom du fichier ZIP pour le téléchargement
        const zipFileName = `Jour${jour.letter}.zip`;
        res.attachment(zipFileName); // Définit Content-Disposition et Content-Type

        // Pipe de l'archive vers la réponse HTTP
        archive.pipe(res);

        // Ajouter les fichiers à l'archive
        for (let i = 0; i < jour.images.length; i++) {
            const imageEntry = jour.images[i];
            if (imageEntry.imageId && imageEntry.imageId.path) {
                const imageDoc = imageEntry.imageId;
                const filePath = path.join(UPLOAD_DIR, imageDoc.path);

                // Vérifier si le fichier existe avant de l'ajouter
                if (fs.existsSync(filePath)) {
                    // Nettoyer le nom de fichier original pour l'utiliser dans le ZIP
                    const originalFilenameSafe = (imageDoc.originalFilename || imageDoc.filename)
                                                .replace(/[^a-zA-Z0-9_.\-]/g, '_');
                    const filenameInZip = `Jour${jour.letter}_${String(i + 1).padStart(2, '0')}_${originalFilenameSafe}`;
                    archive.file(filePath, { name: filenameInZip });
                } else {
                    console.warn(`File not found, skipping: ${filePath}`);
                }
            }
        }

        // Finaliser l'archive (ne plus ajouter de fichiers après cela)
        await archive.finalize();

    } catch (error) {
        console.error(`Error exporting Jour ${jourId} images:`, error);
        if (!res.headersSent) {
            res.status(500).send('Server error during Jour export.');
        }
    }
};