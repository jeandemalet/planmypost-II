const { parentPort } = require('worker_threads');
const sharp = require('sharp');
const fse = require('fs-extra');
const path = require('path');

parentPort.on('message', async (task) => {
    const { tempPath, originalTempPath, finalPath, thumbPath, thumbSize } = task;

    // Définir les chemins pour les versions WebP
    const finalWebpPath = finalPath.replace(path.extname(finalPath), '.webp');
    const thumbWebpPath = thumbPath.replace(path.extname(thumbPath), '.webp');

    try {
        const imageProcessor = sharp(tempPath);
        const metadata = await imageProcessor.metadata(); // <-- AJOUT

        // Traitement parallèle de toutes les versions
        await Promise.all([
            // Créer la miniature JPEG (fallback)
            imageProcessor.clone()
                .resize(thumbSize, thumbSize, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 85, mozjpeg: true })
                .toFile(thumbPath),

            // Créer la miniature WebP (prioritaire)
            imageProcessor.clone()
                .resize(thumbSize, thumbSize, { fit: 'inside', withoutEnlargement: true })
                .webp({ quality: 80 })
                .toFile(thumbWebpPath),
                
            // Créer l'image principale WebP
            imageProcessor.clone()
                .webp({ quality: 85 })
                .toFile(finalWebpPath),

            // Déplacer le fichier original
            fse.move(tempPath, finalPath, { overwrite: true }) // overwrite: true pour la sécurité
        ]);

        parentPort.postMessage({
            status: 'success',
            finalPath,
            thumbPath,
            finalWebpPath,      // Renvoyer le nouveau chemin
            thumbWebpPath,      // Renvoyer le nouveau chemin
            width: metadata.width,   // <-- AJOUT
            height: metadata.height, // <-- AJOUT
            originalTempPath
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