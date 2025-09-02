// ===============================
// Fichier: controllers/zipExportController.js
// Contrôleur pour les exports ZIP en arrière-plan
// ===============================

const zipQueue = require('../utils/zipQueue');
const Publication = require('../models/Publication');
const Gallery = require('../models/Gallery');
const path = require('path');
const fs = require('fs');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

// Démarrer un export de publication en arrière-plan
exports.startPublicationExport = async (req, res) => {
    const { galleryId, publicationId } = req.params;
    const { priority = 5 } = req.body; // Lower number = higher priority

    try {
        // Récupérer la publication et la galerie
        const [publication, gallery] = await Promise.all([
            Publication.findById(publicationId).populate({
                path: 'images.imageId',
                model: 'Image'
            }),
            Gallery.findById(galleryId).select('name commonDescriptionText owner').lean()
        ]);

        if (!publication || publication.galleryId.toString() !== galleryId) {
            return res.status(404).json({ 
                error: 'Publication not found or does not belong to the specified gallery.' 
            });
        }

        if (!gallery) {
            return res.status(404).json({ error: 'Gallery not found for this Publication.' });
        }

        // Vérifier les permissions
        if (gallery.owner.toString() !== req.userData.userId) {
            return res.status(403).json({ error: 'Access denied to this gallery.' });
        }

        if (!publication.images || publication.images.length === 0) {
            return res.status(400).json({ 
                error: 'This Publication contains no images to export.' 
            });
        }

        // Créer le job d'export
        const jobId = zipQueue.addJob({
            type: 'publication_export',
            userId: req.userData.userId,
            galleryId: galleryId,
            publicationId: publicationId,
            priority: Math.max(1, Math.min(10, priority)), // Clamp between 1-10
            publication: publication,
            gallery: gallery,
            uploadDir: UPLOAD_DIR
        });

        res.status(202).json({
            message: 'Export job queued successfully',
            jobId: jobId,
            statusUrl: `/api/zip-exports/status/${jobId}`,
            estimatedWaitTime: zipQueue.getJobStatus(jobId).estimatedWaitTime
        });

    } catch (error) {
        console.error(`Error starting publication export for ${publicationId}:`, error);
        res.status(500).json({ 
            error: 'Server error starting export job',
            details: error.message 
        });
    }
};

// Obtenir le statut d'un job d'export
exports.getJobStatus = async (req, res) => {
    const { jobId } = req.params;

    try {
        const status = zipQueue.getJobStatus(jobId);
        
        if (status.status === 'not_found') {
            return res.status(404).json({ error: 'Job not found' });
        }

        res.json({
            jobId: jobId,
            ...status
        });

    } catch (error) {
        console.error(`Error getting job status for ${jobId}:`, error);
        res.status(500).json({ 
            error: 'Server error getting job status',
            details: error.message 
        });
    }
};

// Télécharger un fichier ZIP généré
exports.downloadZipFile = async (req, res) => {
    const { fileName } = req.params;

    try {
        // Sécurité: vérifier que le nom de fichier ne contient pas de caractères dangereux
        if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
            return res.status(400).json({ error: 'Invalid file name' });
        }

        const filePath = path.join(zipQueue.options.outputDir, fileName);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found or expired' });
        }

        // Vérifier que l'utilisateur a le droit de télécharger ce fichier
        // Le nom du fichier contient le jobId au début
        const jobId = fileName.split('_')[0];
        const status = zipQueue.getJobStatus(jobId);
        
        if (status.status !== 'completed') {
            return res.status(404).json({ error: 'File not available' });
        }

        // TODO: Ajouter une vérification plus stricte des permissions utilisateur
        // Pour l'instant, on fait confiance au fait que les jobIds sont difficiles à deviner

        const stats = fs.statSync(filePath);
        const originalFileName = fileName.substring(fileName.indexOf('_') + 1); // Remove jobId prefix

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Length', stats.size);
        res.setHeader('Content-Disposition', `attachment; filename="${originalFileName}"`);
        res.setHeader('Cache-Control', 'private, max-age=3600'); // Cache for 1 hour

        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);

        fileStream.on('error', (error) => {
            console.error(`Error streaming file ${fileName}:`, error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Error downloading file' });
            }
        });

    } catch (error) {
        console.error(`Error downloading file ${fileName}:`, error);
        res.status(500).json({ 
            error: 'Server error downloading file',
            details: error.message 
        });
    }
};

// Obtenir tous les jobs d'un utilisateur
exports.getUserJobs = async (req, res) => {
    try {
        const userJobs = zipQueue.getUserJobs(req.userData.userId);
        
        res.json({
            jobs: userJobs,
            totalJobs: userJobs.length
        });

    } catch (error) {
        console.error(`Error getting user jobs for ${req.userData.userId}:`, error);
        res.status(500).json({ 
            error: 'Server error getting user jobs',
            details: error.message 
        });
    }
};

// Annuler un job en attente
exports.cancelJob = async (req, res) => {
    const { jobId } = req.params;

    try {
        const status = zipQueue.getJobStatus(jobId);
        
        if (status.status === 'not_found') {
            return res.status(404).json({ error: 'Job not found' });
        }

        if (status.status === 'processing') {
            return res.status(400).json({ 
                error: 'Cannot cancel job that is currently processing' 
            });
        }

        if (status.status === 'completed') {
            return res.status(400).json({ 
                error: 'Cannot cancel completed job' 
            });
        }

        if (status.status === 'queued') {
            // Remove from queue
            const queueIndex = zipQueue.queue.findIndex(job => job.id === jobId);
            if (queueIndex !== -1) {
                const removedJob = zipQueue.queue.splice(queueIndex, 1)[0];
                
                // TODO: Vérifier que l'utilisateur est le propriétaire du job
                
                console.log(`❌ Job ${jobId} cancelled by user`);
                
                return res.json({
                    message: 'Job cancelled successfully',
                    jobId: jobId
                });
            }
        }

        res.status(400).json({ error: 'Job cannot be cancelled' });

    } catch (error) {
        console.error(`Error cancelling job ${jobId}:`, error);
        res.status(500).json({ 
            error: 'Server error cancelling job',
            details: error.message 
        });
    }
};

// Obtenir les statistiques de la file d'attente (admin seulement)
exports.getQueueStats = async (req, res) => {
    try {
        // Vérifier les permissions admin
        if (req.userData.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const stats = zipQueue.getStats();
        
        res.json({
            queueStats: stats,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error getting queue stats:', error);
        res.status(500).json({ 
            error: 'Server error getting queue stats',
            details: error.message 
        });
    }
};

// Export synchrone legacy (pour compatibilité)
exports.exportPublicationSync = async (req, res) => {
    const { galleryId, publicationId } = req.params;

    try {
        // Vérifier la taille de la publication
        const publication = await Publication.findById(publicationId)
            .populate('images.imageId')
            .lean();

        if (!publication) {
            return res.status(404).json({ error: 'Publication not found' });
        }

        const imageCount = publication.images ? publication.images.length : 0;
        
        // Si la publication est petite (< 10 images), traitement synchrone
        // Sinon, rediriger vers le traitement asynchrone
        if (imageCount >= 10) {
            return res.status(413).json({
                error: 'Publication too large for synchronous export',
                message: 'Use /api/zip-exports/publications/:galleryId/:publicationId/start for large exports',
                imageCount: imageCount,
                recommendAsync: true
            });
        }

        // Traitement synchrone pour les petites publications
        // ... (garder l'ancienne logique pour les petites publications)
        res.status(501).json({ 
            error: 'Synchronous export temporarily disabled',
            message: 'Please use the background export endpoint'
        });

    } catch (error) {
        console.error(`Error in sync export for ${publicationId}:`, error);
        res.status(500).json({ 
            error: 'Server error in sync export',
            details: error.message 
        });
    }
};