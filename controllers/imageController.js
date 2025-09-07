// ===============================
//  Fichier: controllers\imageController.js (CORRIGÉ)
// ===============================

const Image = require('../models/Image');
const Gallery = require('../models/Gallery');
const Publication = require('../models/Publication');
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

// --- DÉBUT DE LA LOGIQUE D'OPTIMISATION (POOL DE WORKERS) ---

// Création d'un pool de workers pour ne pas les recréer à chaque requête.
// On prend la moitié des cœurs CPU disponibles pour ne pas saturer la machine.
const NUM_WORKERS = Math.max(1, Math.floor(os.cpus().length / 2));
const workers = [];
const taskQueue = [];
let workerIndex = 0;

console.log(`🤖 Initializing image processing pool with ${NUM_WORKERS} worker(s).`);

for (let i = 0; i < NUM_WORKERS; i++) {
    const worker = new Worker(path.resolve(__dirname, '..', 'image-worker.js'));
    worker.on('message', (result) => {
        // Trouver la tâche correspondante dans la file et résoudre/rejeter la promesse
        const task = taskQueue.shift();
        if (task) {
            if (result.status === 'success') {
                task.resolve(result);
            } else {
                task.reject(new Error(result.message));
            }
        }
    });
    worker.on('error', (err) => {
        console.error('Unhandled Worker error:', err);
        const task = taskQueue.shift();
        if (task) task.reject(err);
    });
    worker.on('exit', (code) => {
        if (code !== 0) console.error(`Worker stopped with exit code ${code}`);
    });
    workers.push(worker);
}

function runImageProcessingTask(data) {
    return new Promise((resolve, reject) => {
        taskQueue.push({ resolve, reject });
        // Distribution des tâches en mode round-robin
        const currentWorker = workers[workerIndex];
        currentWorker.postMessage(data);
        workerIndex = (workerIndex + 1) % NUM_WORKERS;
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

// VERSION ULTRA-OPTIMISÉE DE UPLOADIMAGES
exports.uploadImages = async (req, res) => {
    const { galleryId } = req.params;

    if (req.fileValidationError) {
        return res.status(400).send(req.fileValidationError);
    }
    if (!req.files || req.files.length === 0) {
        return res.status(400).send('No files uploaded.');
    }

    try {
        const galleryExists = await Gallery.findById(galleryId).select('_id').lean();
        if (!galleryExists) {
            // Nettoyer les fichiers temporaires si la galerie n'existe pas
            await Promise.all(req.files.map(f => fse.unlink(f.path).catch(() => {})));
            return res.status(404).send(`Gallery with ID ${galleryId} not found.`);
        }

        const galleryUploadDir = path.join(UPLOAD_DIR, galleryId);
        await fse.ensureDir(galleryUploadDir);

        // OPTIMISATION : Vérifier les doublons en une seule requête DB
        const originalFilenames = req.files.map(f => fixUTF8Encoding(f.originalname));
        const existingImages = await Image.find({
            galleryId: galleryId,
            originalFilename: { $in: originalFilenames }
        }).select('originalFilename').lean();
        const existingFilenamesSet = new Set(existingImages.map(img => img.originalFilename));

        const filesToProcess = [];
        const imageDocsToCreate = [];

        req.files.forEach(file => {
            const correctedName = fixUTF8Encoding(file.originalname);
            if (existingFilenamesSet.has(correctedName)) {
                // Fichier en double, on le supprime
                fse.unlink(file.path).catch(e => console.error(`Cleanup failed for duplicate temp file ${file.path}:`, e));
            } else {
                filesToProcess.push(file);

                // Préparer le document Mongoose
                const timestamp = Date.now();
                const safeOriginalName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
                const uniqueFilename = `${timestamp}-${safeOriginalName}`;
                const relativePath = path.join(galleryId, uniqueFilename);
                const thumbFilename = `thumb-${uniqueFilename}`;
                const relativeThumbPath = path.join(galleryId, thumbFilename);

                imageDocsToCreate.push({
                    galleryId: galleryId,
                    originalFilename: correctedName,
                    filename: uniqueFilename,
                    path: relativePath,
                    thumbnailPath: relativeThumbPath,
                    mimeType: file.mimetype,
                    size: file.size
                });
            }
        });

        if (filesToProcess.length === 0) {
            return res.status(200).json([]);
        }

        // Lancer toutes les tâches de traitement d'image en parallèle via les workers
        const processingPromises = filesToProcess.map((file, index) => {
            const doc = imageDocsToCreate[index];
            return runImageProcessingTask({
                tempPath: file.path,
                originalTempPath: file.path, // Garder une référence
                finalPath: path.join(UPLOAD_DIR, doc.path),
                thumbPath: path.join(UPLOAD_DIR, doc.thumbnailPath),
                thumbSize: THUMB_SIZE
            });
        });

        // Attendre que TOUS les workers aient terminé
        const processingResults = await Promise.all(processingPromises);

        // NOUVEAU : Mettre à jour les documents avec les chemins WebP
        processingResults.forEach(result => {
            if (result.status === 'success') {
                const docToUpdate = imageDocsToCreate.find(doc => path.join(UPLOAD_DIR, doc.path) === result.finalPath);
                if (docToUpdate) {
                    docToUpdate.webpPath = path.relative(UPLOAD_DIR, result.finalWebpPath);
                    docToUpdate.thumbnailWebpPath = path.relative(UPLOAD_DIR, result.thumbWebpPath);
                    // AJOUTEZ CES DEUX LIGNES
                    docToUpdate.width = result.width;
                    docToUpdate.height = result.height;
                }
            }
        });

        // OPTIMISATION : Insérer tous les documents en une seule opération
        const insertedDocs = await Image.insertMany(imageDocsToCreate, { ordered: false });

        res.status(201).json(insertedDocs);

    } catch (error) {
        console.error("Global error in upload process:", error);
        // Nettoyer les fichiers temporaires restants en cas d'erreur globale
        await Promise.all(req.files.map(f => fse.unlink(f.path).catch(() => {})));
        if (!res.headersSent) {
            res.status(500).send('Server error during image upload process.');
        }
    }
};

exports.getImagesForGallery = async (req, res) => {
    const galleryId = req.params.galleryId;
    const sortOption = req.query.sort || 'uploadDate_asc';
    
    // Détecter si une pagination est demandée
    const usePagination = req.query.limit || req.query.page;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 200; // Augmentation de la limite par défaut à 200
    const skip = (page - 1) * limit;

    try {
        let images;

        if (sortOption === 'ratio_asc' || sortOption === 'ratio_desc') {
            const sortDirection = sortOption === 'ratio_asc' ? 1 : -1;
            let pipeline = [
                { $match: { galleryId: new mongoose.Types.ObjectId(galleryId), isCroppedVersion: { $ne: true } } },
                {
                    $addFields: {
                        // Ajouter un champ ratio calculé, en gérant le cas où height est 0
                        aspectRatio: {
                            $cond: { if: { $gt: ['$height', 0] }, then: { $divide: ['$width', '$height'] }, else: 0 }
                        }
                    }
                },
                { $sort: { aspectRatio: sortDirection, uploadDate: 1 } }
            ];

            // Appliquer la pagination si demandée
            if (usePagination) {
                pipeline.push({ $skip: skip });
                pipeline.push({ $limit: limit });
            }

            images = await Image.aggregate(pipeline);
        } else {
            // Logique de tri existante pour les autres options
            let sort = { uploadDate: 1 }; // Fallback
            if (sortOption === 'name_asc') sort = { originalFilename: 1 };
            if (sortOption === 'name_desc') sort = { originalFilename: -1 };

            let query = Image.find({ galleryId: galleryId, isCroppedVersion: { $ne: true } })
                .sort(sort)
                .select('-__v -mimeType -size')
                .lean();

            // Appliquer la pagination SEULEMENT si elle est demandée
            if (usePagination) {
                query = query.skip(skip).limit(limit);
            }

            images = await query.exec();
        }

        const totalImages = await Image.countDocuments({ galleryId: galleryId, isCroppedVersion: { $ne: true } });

        res.json({
            docs: images,
            total: totalImages,
            // Renvoyer les infos de pagination seulement si elles ont été utilisées
            ...(usePagination && {
                page: page,
                limit: limit,
                totalPages: Math.ceil(totalImages / limit)
            })
        });
    } catch (error) {
        console.error("Error getting images for gallery:", error);
        res.status(500).send('Server error retrieving images.');
    }
};

// NOUVELLE VERSION CORRIGÉE de serveImage()
exports.serveImage = async (req, res) => {
    try {
        const imageNameParam = req.params.imageName;
        const galleryIdParam = req.params.galleryId;

        // SÉCURITÉ : Empêcher les attaques de type Path Traversal
        const cleanImageName = path.basename(imageNameParam);
        const cleanGalleryId = path.basename(galleryIdParam);

        if (cleanImageName !== imageNameParam || cleanGalleryId !== galleryIdParam) {
            console.warn(`Tentative potentielle de path traversal bloquée: ${galleryIdParam}/${imageNameParam}`);
            return res.status(400).send('Invalid path components.');
        }

        const browserAcceptsWebp = req.headers.accept && req.headers.accept.includes('image/webp');
        const baseImagePath = path.join(UPLOAD_DIR, cleanGalleryId, cleanImageName);
        const webpPath = baseImagePath.replace(/\.(jpg|jpeg|png)$/i, '.webp');

        // Fonction pour envoyer un fichier ou une erreur 404
        const sendFileOr404 = (filePath) => {
            res.sendFile(filePath, (err) => {
                if (err) {
                    if (res.headersSent) {
                        console.error(`[serveImage] Erreur après le début de la réponse (probablement une annulation du client): ${err.message}`);
                    } else if (err.code === "ENOENT") {
                        console.error(`[serveImage] Fichier non trouvé (même en fallback): ${filePath}`);
                        res.status(404).send('Image not found.');
                    } else {
                        console.error(`[serveImage] Erreur serveur lors de l'envoi de l'image ${filePath}:`, err);
                        res.status(500).send('Server error serving image.');
                    }
                }
            });
        };

        // Logique de service : Priorité au WebP
        if (browserAcceptsWebp) {
            // Vérifier si la version WebP existe
            fse.pathExists(webpPath, (err, exists) => {
                if (exists) {
                    // Servir la version WebP si elle existe
                    sendFileOr404(webpPath);
                } else {
                    // Sinon, servir la version originale (JPEG/PNG)
                    sendFileOr404(baseImagePath);
                }
            });
        } else {
            // Le navigateur ne supporte pas le WebP, servir directement la version originale
            sendFileOr404(baseImagePath);
        }

    } catch (error) {
        console.error("[serveImage] Erreur inattendue dans le bloc try/catch principal:", error);
        if (!res.headersSent) {
            res.status(500).send('Server error serving image.');
        }
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

        // Convertir en WebP pour économiser l'espace et améliorer les performances
        const webpFilename = `${originalBaseName}_${cleanSuffix}_${timestamp}.webp`;
        const galleryUploadDir = path.join(UPLOAD_DIR, galleryId);
        await fse.ensureDir(galleryUploadDir);
        const webpFilePath = path.join(galleryUploadDir, webpFilename);

        // Traitement avec sharp pour obtenir les métadonnées et convertir en WebP
        const imageProcessor = sharp(buffer);
        const metadata = await imageProcessor.metadata();
        const webpBuffer = await imageProcessor.webp({
            quality: 80,
            effort: 6  // Meilleure compression
        }).toBuffer();
        await fs.writeFile(webpFilePath, webpBuffer);

        // Création de la miniature WebP
        const thumbWebpFilename = `thumb-${webpFilename}`;
        const thumbWebpFilePath = path.join(galleryUploadDir, thumbWebpFilename);
        const relativeThumbPath = path.join(galleryId, thumbWebpFilename);
        await sharp(webpBuffer)
            .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'inside', withoutEnlargement: true })
            .webp({
                quality: 75,
                effort: 6  // Meilleure compression
            })
            .toFile(thumbWebpFilePath);

        const croppedImageDoc = new Image({
            galleryId: galleryId,
            originalFilename: `[${cropInfo}] ${fixUTF8Encoding(originalImage.originalFilename)}`,
            filename: webpFilename,
            path: path.join(galleryId, webpFilename),
            thumbnailPath: relativeThumbPath,
            mimeType: 'image/webp',
            size: webpBuffer.length,
            exifDateTimeOriginal: originalImage.exifDateTimeOriginal,
            fileLastModified: new Date(),
            isCroppedVersion: true,
            parentImageId: originalImage._id,
            cropInfo: cropInfo,
            uploadDate: new Date(),
            width: metadata.width,
            height: metadata.height
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

        await Publication.updateMany(
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
        await Publication.updateMany({ galleryId: galleryId }, { $set: { images: [] } });

        res.status(200).send(`All images for gallery ${galleryId} deleted successfully.`);
    } catch (error) {
        console.error(`Error deleting all images for gallery ${galleryId}:`, error);
        res.status(500).send('Server error deleting all images for gallery.');
    }
};

// Nouvel endpoint pour nettoyer les images cassées
exports.cleanupBrokenImages = async (req, res) => {
    const { brokenImages } = req.body;

    if (!brokenImages || !Array.isArray(brokenImages)) {
        return res.status(400).json({ error: 'Liste d\'images cassées requise' });
    }

    try {
        const cleanupResults = {
            cleaned: 0,
            errors: [],
            details: []
        };

        for (const brokenImage of brokenImages) {
            try {
                const { imageId, originalPath } = brokenImage;

                // Vérifier si l'image existe dans la base de données
                const imageDoc = await Image.findById(imageId);
                if (!imageDoc) {
                    cleanupResults.details.push({
                        imageId,
                        originalPath,
                        action: 'skipped',
                        reason: 'Image non trouvée en base de données'
                    });
                    continue;
                }

                // Vérifier si le fichier physique existe
                const fullPath = path.join(UPLOAD_DIR, imageDoc.path);
                const fileExists = await fse.pathExists(fullPath);

                if (!fileExists) {
                    // Supprimer la référence de la base de données
                    await Image.deleteOne({ _id: imageId });

                    // Supprimer les références dans les publications
                    await Publication.updateMany(
                        {},
                        { $pull: { images: { imageId: new mongoose.Types.ObjectId(imageId) } } }
                    );

                    cleanupResults.cleaned++;
                    cleanupResults.details.push({
                        imageId,
                        originalPath,
                        action: 'cleaned',
                        reason: 'Fichier physique manquant, référence supprimée'
                    });
                } else {
                    cleanupResults.details.push({
                        imageId,
                        originalPath,
                        action: 'skipped',
                        reason: 'Fichier physique existe, pas de nettoyage nécessaire'
                    });
                }

            } catch (error) {
                cleanupResults.errors.push({
                    imageId: brokenImage.imageId,
                    originalPath: brokenImage.originalPath,
                    error: error.message
                });
            }
        }

        res.status(200).json({
            message: `Nettoyage terminé. ${cleanupResults.cleaned} images nettoyées.`,
            results: cleanupResults
        });

    } catch (error) {
        console.error('Erreur lors du nettoyage des images cassées:', error);
        res.status(500).json({ error: 'Erreur serveur lors du nettoyage' });
    }
};