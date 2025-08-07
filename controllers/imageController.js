// ===============================
//  Fichier: controllers\imageController.js
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

exports.uploadImages = async (req, res) => {
    const galleryId = req.params.galleryId;
    console.log(`[imageController] Début uploadImages pour galleryId: ${galleryId}. Nombre de fichiers reçus par Multer: ${req.files ? req.files.length : 0}`);

    if (req.fileValidationError) {
        console.warn(`[imageController] Validation de fichier échouée: ${req.fileValidationError}`);
        if (req.files && req.files.length > 0) {
            await Promise.all(req.files.map(f => fse.unlink(f.path).catch(e => console.error(`[imageController] Cleanup failed for rejected file ${f.path}:`, e.message))));
        }
        return res.status(400).send(req.fileValidationError);
    }

    if (!req.files || req.files.length === 0) {
        console.log('[imageController] Aucun fichier reçu ou tous les fichiers ont été rejetés.');
        return res.status(400).send('No files uploaded or files were rejected by filter.');
    }

    try {
        const galleryExists = await Gallery.findById(galleryId).select('_id');
        if (!galleryExists) {
            console.log(`[imageController] Galerie ${galleryId} non trouvée.`);
            // Nettoyer les fichiers temporaires car la galerie n'existe pas
            await Promise.all(req.files.map(f => fse.unlink(f.path).catch(e => console.error(`[imageController] Cleanup failed for non-existent gallery file ${f.path}:`, e.message))));
            return res.status(404).send(`Gallery with ID ${galleryId} not found.`);
        }
    } catch (error) {
        console.error(`[imageController] Erreur vérification gallery ID ${galleryId}:`, error);
        await Promise.all(req.files.map(f => fse.unlink(f.path).catch(e => console.error(`[imageController] Cleanup failed due to gallery check error ${f.path}:`, e.message))));
        return res.status(400).send('Invalid Gallery ID format or error checking gallery.');
    }

    const galleryUploadDir = path.join(UPLOAD_DIR, galleryId);

    try {
        await fse.ensureDir(galleryUploadDir);
        console.log(`[imageController] Traitement parallèle de ${req.files.length} fichiers.`);

        // Transformation de la boucle séquentielle en traitement parallèle
        const processingPromises = req.files.map(async (file) => {
            console.log(`[imageController] Traitement du fichier : ${file.originalname}`);
            let currentTempFilePath = file.path;

            try {
                // Vérification du doublon
                const existingImage = await Image.findOne({ galleryId: galleryId, originalFilename: file.originalname });
                if (existingImage) {
                    console.log(`[imageController] Doublon ignoré: ${file.originalname}`);
                    await fse.unlink(currentTempFilePath).catch(e => console.error(`Échec nettoyage temp duplicate`, e));
                    return null; // Retourne null pour ce fichier, il sera filtré plus tard
                }

                const buffer = await fs.readFile(currentTempFilePath);

                const timestamp = Date.now();
                const safeOriginalName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
                const uniqueFilename = `${timestamp}-${safeOriginalName}`;
                const finalFilePath = path.join(galleryUploadDir, uniqueFilename);
                const relativePath = path.join(galleryId, uniqueFilename);

                const thumbFilename = `thumb-${uniqueFilename}`;
                const thumbFilePath = path.join(galleryUploadDir, thumbFilename);
                const relativeThumbPath = path.join(galleryId, thumbFilename);

                // Les opérations I/O et CPU peuvent maintenant s'exécuter en parallèle pour chaque image
                await Promise.all([
                    sharp(buffer)
                        .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'inside', withoutEnlargement: true })
                        .jpeg({ quality: 85 })
                        .toFile(thumbFilePath),
                    fse.move(currentTempFilePath, finalFilePath, { overwrite: false })
                ]);

                const imageDoc = new Image({
                    galleryId: galleryId,
                    originalFilename: file.originalname,
                    filename: uniqueFilename,
                    path: relativePath,
                    thumbnailPath: relativeThumbPath,
                    mimeType: file.mimetype,
                    size: file.size,
                    exifDateTimeOriginal: getExifDateTime(buffer),
                    fileLastModified: (file.lastModifiedDate && !isNaN(new Date(file.lastModifiedDate))) ? new Date(file.lastModifiedDate) : new Date(),
                });

                // On ne sauvegarde pas encore, on retourne le document
                return imageDoc;

            } catch (fileProcessingError) {
                console.error(`[imageController] ERREUR lors du traitement du fichier ${file.originalname}:`, fileProcessingError);
                // En cas d'erreur sur un fichier, on nettoie son fichier temporaire s'il existe
                if (currentTempFilePath) await fse.unlink(currentTempFilePath).catch(() => { });
                return null; // On signale l'échec pour ce fichier
            }
        });

        // On attend que toutes les promesses de traitement se terminent
        const imageDocsToSave = (await Promise.all(processingPromises)).filter(doc => doc !== null);

        // On peut insérer tous les documents en une seule fois pour plus d'efficacité
        if (imageDocsToSave.length > 0) {
            const insertedDocs = await Image.insertMany(imageDocsToSave, { ordered: false });
            console.log(`[imageController] ${insertedDocs.length} documents image sauvegardés en DB.`);
            res.status(201).json(insertedDocs);
        } else {
            res.status(200).json([]);
        }

    } catch (error) {
        console.error("[imageController] ERREUR GLOBALE dans le processus d'upload:", error);
        if (!res.headersSent) {
            res.status(500).send('Server error during image upload process.');
        }
    }
};

// ... reste du fichier imageController.js inchangé ...
exports.getImagesForGallery = async (req, res) => {
    const galleryId = req.params.galleryId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    try {
        const [images, totalImages] = await Promise.all([
            Image.find({ galleryId: galleryId, isCroppedVersion: { $ne: true } })
                .sort({ uploadDate: 1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Image.countDocuments({ galleryId: galleryId, isCroppedVersion: { $ne: true } })
        ]);

        res.json({
            docs: images,
            total: totalImages,
            page: page,
            limit: limit,
            totalPages: Math.ceil(totalImages / limit)
        });
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

        const imagePath = path.join(UPLOAD_DIR, cleanGalleryId, cleanImageName);

        // [LOG] Log pour vérifier le chemin de l'image demandée
        console.log(`[imageController] SERVING IMAGE: Tentative de servir ${imagePath}`);

        try {
            await fs.access(imagePath);
            // [LOG] Log de succès
            console.log(`[imageController] ✅ Fichier trouvé. Envoi de : ${imagePath}`);
            res.sendFile(imagePath);
        } catch (accessError) {
            // [LOG] Log d'erreur si le fichier n'est pas trouvé
            console.error(`[imageController] ❌ SERVE IMAGE FAILED: Fichier non trouvé à ${imagePath}: `, accessError);
            res.status(404).send(`Image not found at path: ${cleanGalleryId}/${cleanImageName}.`);
        }
    } catch (error) {
        console.error("[imageController] Erreur serveur en servant l'image:", error);
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
        const originalImage = await Image.findById(originalImageId);
        if (!originalImage || originalImage.galleryId.toString() !== galleryId) {
            return res.status(404).send('Original image not found or does not belong to the specified gallery.');
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
        const image = await Image.findOne({ _id: imageId, galleryId: galleryId });
        if (!image) {
            return res.status(404).send('Image not found in this gallery.');
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
        const gallery = await Gallery.findById(galleryId);
        if (!gallery) {
            return res.status(404).send('Gallery not found.');
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