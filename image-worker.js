// ===============================
//  Fichier: image-worker.js
//  Worker Thread pour le traitement d'images
// ===============================

const { parentPort } = require('worker_threads');
const sharp = require('sharp');
const fse = require('fs-extra');

parentPort.on('message', async (task) => {
    const { tempPath, finalPath, thumbPath, thumbSize } = task;
    
    try {
        // Traitement parallèle de la miniature et du déplacement du fichier
        await Promise.all([
            sharp(tempPath)
                .resize(thumbSize, thumbSize, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 85 })
                .toFile(thumbPath),
            fse.move(tempPath, finalPath, { overwrite: false })
        ]);
        
        parentPort.postMessage({
            status: 'success',
            finalPath,
            thumbPath,
            originalTempPath: tempPath
        });
        
    } catch (error) {
        parentPort.postMessage({
            status: 'error',
            message: error.message
        });
        
        // S'assurer de nettoyer le fichier temporaire en cas d'erreur
        await fse.unlink(tempPath).catch(() => {});
    }
});