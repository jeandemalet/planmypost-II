

const mongoose = require('mongoose');

const ImageSchema = new mongoose.Schema({
    galleryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Gallery',
        required: true,
        index: true // Indexer pour recherche rapide par galerie
    },
    originalFilename: { // Nom original du fichier uploadé
        type: String,
        required: true,
        trim: true
    },
    filename: { // Nom unique du fichier stocké sur le serveur
        type: String,
        required: true,
        unique: true // Assurer l'unicité du nom de fichier serveur
    },
    path: { // Chemin relatif vers le fichier image complet (depuis UPLOAD_DIR)
        type: String,
        required: true
    },
    thumbnailPath: { // Chemin relatif vers la miniature
        type: String,
        required: true
    },
    mimeType: {
        type: String
    },
    size: { // Taille en octets
        type: Number
    },
    exifDateTimeOriginal: { // Date/heure extraite des métadonnées EXIF
        type: Date
    },
    fileLastModified: { // Date de dernière modification du fichier source (si disponible)
        type: Date
    },
    isCroppedVersion: { // True si cette image est le résultat d'un recadrage
        type: Boolean,
        default: false
    },
    parentImageId: { // Si isCroppedVersion est true, référence l'ID de l'image originale
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Image'
    },
    cropInfo: { // Description textuelle du recadrage appliqué (ex: "barres_4x5", "split_gauche")
        type: String
    },
    uploadDate: { // Date d'upload de cette image (originale ou recadrée) sur le serveur
        type: Date,
        default: Date.now
    }
});

// Index composite pour vérifier rapidement les doublons (même nom original dans la même galerie)
ImageSchema.index({ galleryId: 1, originalFilename: 1 });
// Index pour trouver les images d'une galerie
ImageSchema.index({ galleryId: 1, uploadDate: 1 }); // Utile pour tri par date d'upload
ImageSchema.index({ galleryId: 1, isCroppedVersion: 1 }); // Utile pour filtrer les originales

module.exports = mongoose.model('Image', ImageSchema);
