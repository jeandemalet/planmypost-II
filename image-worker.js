// ===============================
//  Fichier: image-worker.js
//  Worker Thread pour le traitement d'images non-bloquant
// ===============================

const { parentPort } = require('worker_threads');
const sharp = require('sharp');
const fse = require('fs-extra');

parentPort.on('message', async (task) => {
    const { tempPath, originalTempPath, finalPath, thumbPath, thumbSize } = task;

    try {
        // Traitement parallèle de la miniature et du déplacement/copie du fichier
        await Promise.all([
            // Créer la miniature
            sharp(tempPath)
                .resize(thumbSize, thumbSize, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 85, mozjpeg: true })
                .toFile(thumbPath),
            // Déplacer le fichier original
            fse.move(tempPath, finalPath, { overwrite: false })
        ]);

        parentPort.postMessage({
            status: 'success',
            finalPath,
            thumbPath,
            originalTempPath // Renvoyer l'identifiant de la tâche
        });

    } catch (error) {
        console.error(`[Worker] Error processing ${tempPath}:`, error);
        parentPort.postMessage({
            status: 'error',
            message: error.message,
            originalTempPath
        });

        // S'assurer de nettoyer le fichier temporaire en cas d'erreur
        await fse.unlink(tempPath).catch(() => {});
    }
});