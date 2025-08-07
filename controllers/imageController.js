// ===============================
//  Fichier: controllers\imageController.js (CORRIGÉ)
// ===============================

const Image = require('../models/Image');
const Gallery = require('../models/Gallery');
const Jour = require('../models/Jour');
const mongoose = require('mongoose');
const sharp = require('sharp');
const exifParser = require('exif-parser');
const path = require('path');
const fs = require('fs').promises;
const fse = require('fs-extra');
const { Worker } = require('worker_threads');
const os = require('os');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const THUMB_SIZE = 150;

// --- DÉBUT DE LA LOGIQUE D'OPTIMISATION (VERSION UNIQUE ET CORRECTE) ---

// Création d'un pool de workers pour ne pas les recréer à chaque requête.
// On prend la moitié des cœurs CPU disponibles pour ne pas saturer la machine.
const NUM_WORKERS = Math.max(1, Math.floor(os.cpus().length / 2));
const workers = [];
const taskQueue = [];
let activeTasks = 0;

for (let i = 0; i < NUM_WORKERS; i++) {
    // Note: Le fichier image-worker.js doit exister à la racine du projet.
    const worker = new Worker(path.join(__dirname, '..', 'image-worker.js'));
    worker.on('message', (result) => {
        const taskIndex = taskQueue.findIndex(t => t.data.tempPath === result.originalTempPath);
        if (taskIndex > -1) {
            const task = taskQueue.splice(taskIndex, 1)[0];
            if (result.status === 'success') {
                task.resolve(result);
            } else {
                task.reject(new Error(result.message));
            }
        }
        activeTasks--;
        processNextTask();
    });
    worker.on('error', (err) => {
        console.error('Worker error:', err);
        const task = taskQueue.shift();
        if (task) task.reject(err);
        activeTasks--;
    });
    workers.push(worker);
}

function processNextTask() {
    if (taskQueue.length > 0 && activeTasks < NUM_WORKERS) {
        const workerIndex = activeTasks % NUM_WORKERS; // Simple round-robin
        const task = taskQueue.find(t => !t.processing);
        if (task) {
            task.processing = true;
            workers[workerIndex].postMessage(task.data);
            activeTasks++;
        }
    }
}

function runImageProcessingTask(data) {
    return new Promise((resolve, reject) => {
        taskQueue.push({ data, resolve, reject, processing: false });
        processNextTask();
    });
}
// --- FIN DE LA LOGIQUE D'OPTIMISATION ---

// Fonction pour corriger l'encodage UTF-8 des noms de fichiers
const fixUTF8Encoding = (str) => {
    try {
        if (str.includes('Ã') || str.includes('Â') || str.includes('Ã¨') || str.includes('Ã©') || str.includes('Ã ')) {
            const buffer = Buffer.from(str, 'latin1');
            return buffer.toString('utf8');
        }
        return str;
    } catch (error) {
        console.warn(`[imageController] Impossible de corriger l'encodage pour: ${str}`, error);
        return str;
    }
};

const getExifDateTime = (buffer) => {
    // Cette fonction reste disponible si besoin, mais le worker s'en charge.
    return null;
};

// VERSION OPTIMISÉE DE UPLOADIMAGES
exports.uploadImages = async (req, res) => {
    const galleryId = req.params.galleryId;

    if (req.fileValidationError) {
        return res.status(400).send(req.fileValidationError);
    }
    if (!req.files || req.files.length === 0) {
        return res.status(400).send('No files uploaded.');
    }

    try {
        const galleryExists = await Gallery.findById(galleryId).select('_id').lean();
        if (!galleryExists) {
            await Promise.all(req.files.map(f => fse.unlink(f.path).catch(() => {})));
            return res.status(404).send(`Gallery with ID ${galleryId} not found.`);
        }

        const galleryUploadDir = path.join(UPLOAD_DIR, galleryId);
        await fse.ensureDir(galleryUploadDir);

        const originalFilenames = req.files.map(f => fixUTF8Encoding(f.originalname));
        const existingImages = await Image.find({
            galleryId: galleryId,
            originalFilename: { $in: originalFilenames }
        }).select('originalFilename').lean();
        const existingFilenamesSet = new Set(existingImages.map(img => img.originalFilename));

        const filesToProcess = req.files.filter(file => {
            const correctedName = fixUTF8Encoding(file.originalname);
            if (existingFilenamesSet.has(correctedName)) {
                fse.unlink(file.path).catch(e => console.error(`Cleanup failed for duplicate temp file ${file.path}:`, e));
                return false;
            }
            return true;
        });

        if (filesToProcess.length === 0) {
            return res.status(200).json([]);
        }
        
        const imageDocs = [];
        const processingPromises = filesToProcess.map(file => {
            const timestamp = Date.now();
            const safeOriginalName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
            const uniqueFilename = `${timestamp}-${safeOriginalName}`;
            const relativePath = path.join(galleryId, uniqueFilename);
            const thumbFilename = `thumb-${uniqueFilename}`;
            const relativeThumbPath = path.join(galleryId, thumbFilename);

            imageDocs.push({
                galleryId: galleryId,
                originalFilename: fixUTF8Encoding(file.originalname),
                filename: uniqueFilename,
                path: relativePath,
                thumbnailPath: relativeThumbPath,
                mimeType: file.mimetype,
                size: file.size,
                fileLastModified: (file.lastModifiedDate && !isNaN(new Date(file.lastModifiedDate))) ? new Date(file.lastModifiedDate) : new Date(),
            });

            return runImageProcessingTask({
                tempPath: file.path,
                originalTempPath: file.path,
                finalPath: path.join(galleryUploadDir, uniqueFilename),
                thumbPath: path.join(galleryUploadDir, thumbFilename),
                thumbSize: THUMB_SIZE
            });
        });

        await Promise.all(processingPromises);

        const insertedDocs = await Image.insertMany(imageDocs, { ordered: false });
        
        res.status(201).json(insertedDocs);

    } catch (error) {
        console.error("[imageController] ERREUR GLOBALE dans le processus d'upload:", error);
        if (!res.headersSent) {
            res.status(500).send('Server error during image upload process.');
        }
    }
};

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
                .select('-__v -mimeType -size') // Exclure des champs inutiles pour la grille
                .lean(), // Utilisation de .lean() pour la performance
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

        console.log(`[imageController] SERVING IMAGE: Tentative de servir ${imagePath}`);

        try {
            await fs.access(imagePath);
            console.log(`[imageController] ✅ Fichier trouvé. Envoi de : ${imagePath}`);
            res.sendFile(imagePath);
        } catch (accessError) {
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
            originalFilename: `[${cropInfo}] ${fixUTF8Encoding(originalImage.originalFilename)}`,
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