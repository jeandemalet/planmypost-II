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
        // Lecture unique du buffer pour optimiser la mémoire
        const imageBuffer = await fse.readFile(tempPath);
        const imageProcessor = sharp(imageBuffer);
        const metadata = await imageProcessor.metadata();

        // Traitement parallèle optimisé
        await Promise.all([
            // Miniature JPEG avec letterboxing (fond blanc)
            sharp(imageBuffer)
                .resize(thumbSize, thumbSize, {
                    fit: sharp.fit.contain, // Fait tenir l'image à l'intérieur du carré
                    background: { r: 255, g: 255, b: 255, alpha: 1 } // Fond blanc
                })
                .jpeg({
                    quality: 85,
                    mozjpeg: true,
                    progressive: true,
                    optimizeScans: true
                })
                .toFile(thumbPath),

            // Miniature WebP avec letterboxing (fond blanc)
            sharp(imageBuffer)
                .resize(thumbSize, thumbSize, {
                    fit: sharp.fit.contain, // Fait tenir l'image à l'intérieur du carré
                    background: { r: 255, g: 255, b: 255, alpha: 1 } // Fond blanc
                })
                .webp({
                    quality: 75,
                    effort: 6  // Meilleure compression
                })
                .toFile(thumbWebpPath),
                
            // Image principale WebP avec qualité optimisée
            sharp(imageBuffer)
                .webp({
                    quality: 80,
                    effort: 6  // Meilleure compression
                })
                .toFile(finalWebpPath),

            // Déplacement du fichier original
            fse.move(tempPath, finalPath, { overwrite: true })
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