const Image = require('../models/Image');
const Gallery = require('../models/Gallery');
const Jour = require('../models/Jour');
const mongoose = require('mongoose'); 
const sharp = require('sharp');
const exifParser = require('exif-parser');
const path = require('path');
const fs = require('fs'); // Utiliser fs.promises est mieux, mais pour la cohérence on garde fs
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
    const { galleryId } = req.params;

    if (req.fileValidationError) {
        return res.status(400).send(req.fileValidationError);
    }
    if (!req.files || req.files.length === 0) {
        return res.status(400).send('No files uploaded.');
    }

    try {
        const galleryExists = await Gallery.findOne({ _id: galleryId, owner: req.user._id });
        if (!galleryExists) {
             return res.status(404).send(`Gallery with ID ${galleryId} not found or not owned by user.`);
        }
    } catch (error) {
        return res.status(400).send('Invalid Gallery ID format or error checking gallery.');
    }

    const galleryUploadDir = path.join(UPLOAD_DIR, galleryId);
    const uploadedImageDocs = [];

    try {
        await fse.ensureDir(galleryUploadDir);
        for (const file of req.files) {
            try {
                if (await Image.findOne({ galleryId: galleryId, originalFilename: file.originalname })) {
                    console.log(`Duplicate ignored: ${file.originalname}`);
                    continue;
                }

                const buffer = file.buffer;
                const timestamp = Date.now();
                const safeOriginalName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
                const uniqueFilename = `${timestamp}-${safeOriginalName}`;
                const finalFilePath = path.join(galleryUploadDir, uniqueFilename);
                const relativePath = path.join(galleryId, uniqueFilename);
                const exifDateTime = getExifDateTime(buffer);

                const thumbFilename = `thumb-${uniqueFilename}`;
                const thumbFilePath = path.join(galleryUploadDir, thumbFilename);
                const relativeThumbPath = path.join(galleryId, thumbFilename);

                await sharp(buffer)
                    .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'inside', withoutEnlargement: true })
                    .jpeg({ quality: 85 })
                    .toFile(thumbFilePath);

                await fs.promises.writeFile(finalFilePath, buffer);

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
                    fileLastModified: new Date()
                });
                await imageDoc.save();
                uploadedImageDocs.push(imageDoc);
            } catch (fileProcessingError) {
                console.error(`Error processing file ${file.originalname}:`, fileProcessingError);
            }
        }
        res.status(201).json(uploadedImageDocs);
    } catch (error) {
        console.error("Global error in upload process:", error);
        if (!res.headersSent) {
            res.status(500).send('Server error during image upload process.');
        }
    }
};

exports.getImagesForGallery = async (req, res) => {
    const { galleryId } = req.params;
    try {
        const query = { galleryId: galleryId, isCroppedVersion: { $ne: true } };
        if (req.user.role !== 'admin') {
            query.owner = req.user._id;
        }

        const images = await Image.find(query).sort({ uploadDate: 1 });
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
        
        // --- CORRECTION APPLIQUÉE ICI ---
        // On construit une requête de base pour l'ID de galerie et le propriétaire
        const baseQuery = { galleryId: cleanGalleryId };
        if (req.user.role !== 'admin') {
            baseQuery.owner = req.user._id;
        }

        // On cherche un document qui correspond à l'ID de la galerie ET
        // dont soit le `filename` correspond (image complète),
        // soit le `thumbnailPath` correspond au chemin complet de la miniature.
        const image = await Image.findOne({
            ...baseQuery,
            $or: [
                { filename: cleanImageName },
                { thumbnailPath: path.join(cleanGalleryId, cleanImageName) }
            ]
        });

        if (!image) {
            return res.status(404).send('Image not found or access denied.');
        }

        // On utilise cleanImageName, car c'est le nom de fichier demandé (soit original, soit thumb)
        const imagePath = path.join(UPLOAD_DIR, cleanGalleryId, cleanImageName);
        
        // Vérifier si le fichier existe physiquement avant de l'envoyer
        if (fs.existsSync(imagePath)) {
            res.sendFile(imagePath);
        } else {
            console.error(`File not found on disk for image record ${image._id}: ${imagePath}`);
            res.status(404).send('Image file not found on disk.');
        }

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
        const originalImageQuery = { _id: originalImageId, galleryId: galleryId };
        if (req.user.role !== 'admin') {
            originalImageQuery.owner = req.user._id;
        }
        const originalImage = await Image.findOne(originalImageQuery);
        
        if (!originalImage) {
            return res.status(404).send('Original image not found or access denied.');
        }

        const matches = imageDataUrl.match(/^data:(image\/(.+));base64,(.+)$/);
        if (!matches) {
             return res.status(400).send('Invalid image data URL format.');
        }
        const mimeType = matches[1];
        const base64Data = matches[3];
        const buffer = Buffer.from(base64Data, 'base64');

        const timestamp = Date.now();
        const originalBaseName = path.parse(originalImage.originalFilename).name.replace(/[^a-zA-Z0-9_-]/g, '_');
        const cleanSuffix = filenameSuffix.replace(/[^a-zA-Z0-9_-]/g, '_');
        
        let actualExtension = 'jpg'; 
        if (mimeType === 'image/png') actualExtension = 'png';
        else if (mimeType === 'image/webp') actualExtension = 'webp';

        const newFilename = `${originalBaseName}_${cleanSuffix}_${timestamp}.${actualExtension}`;

        const galleryUploadDir = path.join(UPLOAD_DIR, galleryId);
        await fse.ensureDir(galleryUploadDir);
        const newFilePath = path.join(galleryUploadDir, newFilename);
        const relativePath = path.join(galleryId, newFilename);

        await fs.promises.writeFile(newFilePath, buffer);

        const thumbFilename = `thumb-${newFilename}`;
        const thumbFilePath = path.join(galleryUploadDir, thumbFilename);
        const relativeThumbPath = path.join(galleryId, thumbFilename);
         await sharp(buffer) 
            .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 85 }) 
            .toFile(thumbFilePath);

        const croppedImageDoc = new Image({
            galleryId: galleryId,
            owner: req.user._id, // La version recadrée appartient à celui qui l'a faite
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
        const query = { _id: imageId, galleryId: galleryId };
        if (req.user.role !== 'admin') {
            query.owner = req.user._id;
        }
        const image = await Image.findOne(query);

        if (!image) {
            return res.status(404).send('Image not found or access denied.');
        }

        const allAffectedImageIds = [image._id.toString()];

        const fullPath = path.join(UPLOAD_DIR, image.path);
        const thumbFullPath = path.join(UPLOAD_DIR, image.thumbnailPath);
        await fs.promises.unlink(fullPath).catch(err => console.warn(`Failed to delete file ${fullPath}: ${err.message}`));
        await fs.promises.unlink(thumbFullPath).catch(err => console.warn(`Failed to delete thumbnail ${thumbFullPath}: ${err.message}`));

        if (!image.isCroppedVersion) {
            const croppedVersions = await Image.find({ parentImageId: image._id, galleryId: galleryId });
            for (const cropped of croppedVersions) {
                const croppedFullPath = path.join(UPLOAD_DIR, cropped.path);
                const croppedThumbFullPath = path.join(UPLOAD_DIR, cropped.thumbnailPath);
                await fs.promises.unlink(croppedFullPath).catch(err => console.warn(`Failed to delete cropped file ${croppedFullPath}: ${err.message}`));
                await fs.promises.unlink(croppedThumbFullPath).catch(err => console.warn(`Failed to delete cropped thumbnail ${croppedThumbFullPath}: ${err.message}`));
                allAffectedImageIds.push(cropped._id.toString());
            }
            await Image.deleteMany({ parentImageId: image._id });
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
        const galleryQuery = { _id: galleryId };
        if (req.user.role !== 'admin') {
            galleryQuery.owner = req.user._id;
        }
        const gallery = await Gallery.findOne(galleryQuery);
        
        if (!gallery) {
            return res.status(404).send('Gallery not found or access denied.');
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