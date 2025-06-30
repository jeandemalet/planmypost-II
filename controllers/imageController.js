// ===============================
//  Fichier: controllers\imageController.js (Corrigé)
// ===============================

const Image = require('../models/Image');
const Gallery = require('../models/Gallery');
const Jour = require('../models/Jour'); // Assurez-vous que mongoose est importé si vous utilisez mongoose.Types.ObjectId
const mongoose = require('mongoose'); 
const sharp = require('sharp');
const exifParser = require('exif-parser');
const path = require('path');
const fs = require('fs').promises;
const fse = require('fs-extra');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const THUMB_SIZE = 150;

const getExifDateTime = (buffer) => {
    try {
        const parser = exifParser.create(buffer);
        const result = parser.parse();
        const dateTimeStr = result.tags.DateTimeOriginal || result.tags.CreateDate || result.tags.ModifyDate;
        
        if (typeof dateTimeStr === 'string') {
            const regex = /(\d{4}):(\d{2}):(\d{2})\s(\d{2}):(\d{2}):(\d{2})/;
            const match = dateTimeStr.match(regex);
            if (match) {
                return new Date(
                    parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]),
                    parseInt(match[4]), parseInt(match[5]), parseInt(match[6])
                );
            }
            const parsedDate = new Date(dateTimeStr);
            if (!isNaN(parsedDate)) {
                return parsedDate;
            }
        } else if (typeof dateTimeStr === 'number' && dateTimeStr > 0) { 
            const parsedDate = new Date(dateTimeStr * 1000); 
             if (!isNaN(parsedDate)) {
                return parsedDate;
            }
        }
    } catch (error) {
        console.warn("Could not parse EXIF data for a file:", error.message);
    }
    return null;
};

// ======================= CORRECTION CI-DESSOUS =======================

exports.uploadImages = async (req, res) => {
    const galleryId = req.params.galleryId;
    console.log(`[imageController] Début uploadImages pour galleryId: ${galleryId}. Nombre de fichiers reçus par Multer: ${req.files ? req.files.length : 0}`);

    if (req.fileValidationError) {
        console.warn(`[imageController] Validation de fichier échouée: ${req.fileValidationError}`);
        return res.status(400).send(req.fileValidationError);
    }
    
    if (!req.files || req.files.length === 0) {
        console.log('[imageController] Aucun fichier reçu ou tous les fichiers ont été rejetés.');
        return res.status(400).send('No files uploaded or files were rejected by filter.');
    }

    try {
        const galleryExists = await Gallery.findOne({ _id: galleryId, owner: req.user._id }).select('_id');
        if (!galleryExists) {
             console.log(`[imageController] Galerie ${galleryId} non trouvée ou non possédée par l'utilisateur.`);
             return res.status(404).send(`Gallery with ID ${galleryId} not found or not owned by user.`);
        }
    } catch (error) {
        console.error(`[imageController] Erreur vérification gallery ID ${galleryId}:`, error);
        return res.status(400).send('Invalid Gallery ID format or error checking gallery.');
    }

    const galleryUploadDir = path.join(UPLOAD_DIR, galleryId);
    const uploadedImageDocs = [];
    let filesProcessedSuccessfully = 0;

    try {
        await fse.ensureDir(galleryUploadDir);
        console.log(`[imageController] Traitement de ${req.files.length} fichiers.`);

        for (let i = 0; i < req.files.length; i++) {
            const file = req.files[i];
            console.log(`[imageController] Traitement du fichier ${i + 1}/${req.files.length}: ${file.originalname}`);

            try {
                const existingImage = await Image.findOne({ galleryId: galleryId, originalFilename: file.originalname });
                if (existingImage) {
                    console.log(`[imageController] Doublon ignoré: ${file.originalname} pour galerie ${galleryId}`);
                    continue;
                }
                
                // CORRECTION: Utiliser file.buffer directement, car Multer est configuré pour le stockage en mémoire.
                const buffer = file.buffer;
                if (!buffer) {
                    console.error(`[imageController] ERREUR : Le fichier ${file.originalname} n'a pas de buffer. Il a peut-être été mal uploadé.`);
                    continue;
                }

                const timestamp = Date.now();
                const safeOriginalName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
                const uniqueFilename = `${timestamp}-${safeOriginalName}`; 
                const finalFilePath = path.join(galleryUploadDir, uniqueFilename);
                const relativePath = path.join(galleryId, uniqueFilename); 

                const exifDateTime = getExifDateTime(buffer);

                const thumbFilename = `thumb-${uniqueFilename}`; 
                const thumbFilePath = path.join(galleryUploadDir, thumbFilename);
                const relativeThumbPath = path.join(galleryId, thumbFilename); 
                
                console.log(`[imageController] Création miniature pour ${file.originalname}`);
                await sharp(buffer)
                    .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'inside', withoutEnlargement: true })
                    .jpeg({ quality: 85 })
                    .toFile(thumbFilePath);
                console.log(`[imageController] Miniature créée pour ${file.originalname}`);

                // CORRECTION: Écrire le buffer dans un fichier au lieu de le déplacer.
                console.log(`[imageController] Écriture du fichier vers ${finalFilePath}`);
                await fs.writeFile(finalFilePath, buffer);
                console.log(`[imageController] Fichier écrit: ${file.originalname}`);

                const imageDoc = new Image({
                    galleryId: galleryId,
                    owner: req.user._id,
                    originalFilename: file.originalname,
                    filename: uniqueFilename, 
                    path: relativePath,
                    thumbnailPath: relativeThumbPath,
                    mimeType: file.mimetype,
                    size: file.size,
                    exifDateTimeOriginal: exifDateTime,
                    fileLastModified: new Date() // lastModifiedDate n'est pas fiable avec memoryStorage
                });
                await imageDoc.save();
                uploadedImageDocs.push(imageDoc);
                filesProcessedSuccessfully++;
                console.log(`[imageController] Document image sauvegardé en DB pour: ${file.originalname}`);

            } catch (fileProcessingError) {
                console.error(`[imageController] ERREUR lors du traitement du fichier ${file.originalname}:`, fileProcessingError);
            }
        }
        
        console.log(`[imageController] Fin de la boucle de traitement. ${filesProcessedSuccessfully} fichiers traités avec succès.`);
        console.log(`[imageController] Envoi de la réponse au client avec ${uploadedImageDocs.length} documents.`);
        res.status(201).json(uploadedImageDocs);

    } catch (error) { 
        console.error("[imageController] ERREUR GLOBALE dans le processus d'upload:", error);
        if (!res.headersSent) {
             res.status(500).send('Server error during image upload process.');
        }
    } finally {
        // CORRECTION: Il n'y a plus de fichiers temporaires à nettoyer avec le stockage en mémoire.
        console.log('[imageController] Bloc finally atteint. Pas de nettoyage de fichiers temporaires requis.');
        console.log('[imageController] Fin de uploadImages.');
    }
};

// =========================================================================

// ... Le reste du fichier reste inchangé ...
exports.getImagesForGallery = async (req, res) => {
    const galleryId = req.params.galleryId;
    try {
        const images = await Image.find({ galleryId: galleryId, owner: req.user._id, isCroppedVersion: { $ne: true } })
                               .sort({ uploadDate: 1 });
        res.json(images);
    } catch (error) {
        console.error("Error getting images for gallery:", error);
        res.status(500).send('Server error retrieving images.');
    }
};

exports.serveImage = async (req, res) => {
    try {
        const imageNameParam = req.params.imageName;
        const galleryIdParam = req.params.galleryId;

        if (!imageNameParam || !galleryIdParam) {
             return res.status(400).send('Missing image name or gallery ID.');
        }

        const cleanImageName = path.basename(imageNameParam);
        const cleanGalleryId = path.basename(galleryIdParam);

        if (cleanImageName !== imageNameParam || cleanGalleryId !== galleryIdParam) {
            console.warn(`Potential path traversal attempt blocked: ${galleryIdParam}/${imageNameParam}`);
            return res.status(400).send('Invalid path components.');
        }
        
        const image = await Image.findOne({ filename: cleanImageName, galleryId: cleanGalleryId, owner: req.user._id });
        if (!image) {
            return res.status(404).send('Image not found or not owned by user.');
        }

        const imagePath = path.join(UPLOAD_DIR, image.path);
        res.sendFile(imagePath);

    } catch (error) { 
         console.error("Server error serving image:", error);
         res.status(500).send('Server error serving image.');
    }
};

exports.saveCroppedImage = async (req, res) => {
    const { galleryId, originalImageId } = req.params;
    const { imageDataUrl, cropInfo, filenameSuffix } = req.body;

    if (!imageDataUrl || !cropInfo || !filenameSuffix) {
        return res.status(400).send('Missing required cropping data.');
    }

    try {
        const originalImage = await Image.findOne({ _id: originalImageId, owner: req.user._id });
        if (!originalImage || originalImage.galleryId.toString() !== galleryId) {
            return res.status(404).send('Original image not found or does not belong to the specified gallery or user.');
        }

        const matches = imageDataUrl.match(/^data:(image\/(.+));base64,(.+)$/);
        if (!matches || matches.length !== 4) {
             return res.status(400).send('Invalid image data URL format.');
        }
        const mimeType = matches[1];
        const extension = matches[2] || 'jpg'; 
        const base64Data = matches[3];
        const buffer = Buffer.from(base64Data, 'base64');

        const timestamp = Date.now();
        const originalBaseName = path.parse(originalImage.originalFilename).name.replace(/[^a-zA-Z0-9_-]/g, '_');
        const cleanSuffix = filenameSuffix.replace(/[^a-zA-Z0-9_-]/g, '_');
        
        let actualExtension = extension;
        if (mimeType === 'image/png') actualExtension = 'png';
        else if (mimeType === 'image/webp') actualExtension = 'webp';
        else actualExtension = 'jpg'; 

        const newFilename = `${originalBaseName}_${cleanSuffix}_${timestamp}.${actualExtension}`;

        const galleryUploadDir = path.join(UPLOAD_DIR, galleryId);
        await fse.ensureDir(galleryUploadDir);
        const newFilePath = path.join(galleryUploadDir, newFilename);
        const relativePath = path.join(galleryId, newFilename);

        await fs.writeFile(newFilePath, buffer);

        const thumbFilename = `thumb-${newFilename}`;
        const thumbFilePath = path.join(galleryUploadDir, thumbFilename);
        const relativeThumbPath = path.join(galleryId, thumbFilename);
         await sharp(buffer) 
            .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 85 }) 
            .toFile(thumbFilePath);

        const croppedImageDoc = new Image({
            galleryId: galleryId,
            owner: req.user._id,
            originalFilename: `[${cropInfo}] ${originalImage.originalFilename}`,
            filename: newFilename,
            path: relativePath,
            thumbnailPath: relativeThumbPath,
            mimeType: mimeType, 
            size: buffer.length,
            exifDateTimeOriginal: originalImage.exifDateTimeOriginal, 
            fileLastModified: new Date(), 
            isCroppedVersion: true,
            parentImageId: originalImage._id,
            cropInfo: cropInfo, 
            uploadDate: new Date() 
        });
        await croppedImageDoc.save();
        res.status(201).json(croppedImageDoc);
    } catch (error) {
        console.error("Error saving cropped image:", error);
        res.status(500).send('Server error during crop saving.');
    }
};

exports.deleteImage = async (req, res) => {
    const { galleryId, imageId } = req.params;
    try {
        const image = await Image.findOne({ _id: imageId, galleryId: galleryId, owner: req.user._id });
        if (!image) {
            return res.status(404).send('Image not found in this gallery or not owned by user.');
        }

        const allAffectedImageIds = [image._id.toString()];

        const fullPath = path.join(UPLOAD_DIR, image.path);
        const thumbFullPath = path.join(UPLOAD_DIR, image.thumbnailPath);
        await fs.unlink(fullPath).catch(err => console.warn(`Failed to delete file ${fullPath}: ${err.message}`));
        await fs.unlink(thumbFullPath).catch(err => console.warn(`Failed to delete thumbnail ${thumbFullPath}: ${err.message}`));

        if (!image.isCroppedVersion) {
            const croppedVersions = await Image.find({ parentImageId: image._id, galleryId: galleryId });
            for (const cropped of croppedVersions) {
                const croppedFullPath = path.join(UPLOAD_DIR, cropped.path);
                const croppedThumbFullPath = path.join(UPLOAD_DIR, cropped.thumbnailPath);
                await fs.unlink(croppedFullPath).catch(err => console.warn(`Failed to delete cropped file ${croppedFullPath}: ${err.message}`));
                await fs.unlink(croppedThumbFullPath).catch(err => console.warn(`Failed to delete cropped thumbnail ${croppedThumbFullPath}: ${err.message}`));
                await Image.deleteOne({ _id: cropped._id });
                allAffectedImageIds.push(cropped._id.toString());
            }
        }
        
        await Image.deleteOne({ _id: imageId });

        await Jour.updateMany(
            { galleryId: galleryId },
            { $pull: { images: { imageId: { $in: allAffectedImageIds.map(id => new mongoose.Types.ObjectId(id)) } } } }
        );

        res.status(200).send({ 
            message: `Image ${imageId} and associated data deleted successfully.`, 
            deletedImageIds: allAffectedImageIds
        });

    } catch (error) {
        console.error(`Error deleting image ${imageId}:`, error);
        res.status(500).send('Server error deleting image.');
    }
};

exports.deleteAllImagesForGallery = async (req, res) => {
    const { galleryId } = req.params;
    try {
        const gallery = await Gallery.findOne({ _id: galleryId, owner: req.user._id });
        if (!gallery) {
            return res.status(404).send('Gallery not found or not owned by user.');
        }

        const galleryImageDir = path.join(UPLOAD_DIR, galleryId);
        await fse.emptyDir(galleryImageDir).catch(err => { 
            if (err.code !== 'ENOENT') { 
                console.warn(`Could not empty directory ${galleryImageDir}: ${err.message}`);
            }
        });
        await Image.deleteMany({ galleryId: galleryId });
        await Jour.updateMany({ galleryId: galleryId }, { $set: { images: [] } });

        res.status(200).send(`All images for gallery ${galleryId} deleted successfully.`);
    } catch (error) {
        console.error(`Error deleting all images for gallery ${galleryId}:`, error);
        res.status(500).send('Server error deleting all images for gallery.');
    }
};