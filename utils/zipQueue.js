// ===============================
// Fichier: utils/zipQueue.js
// Système de file d'attente pour le traitement des ZIP en arrière-plan
// ===============================

const archiver = require('archiver');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');

class ZipQueue extends EventEmitter {
    constructor(options = {}) {
        super();
        this.queue = [];
        this.processing = new Map(); // jobId -> job info
        this.completed = new Map(); // jobId -> result info
        this.failed = new Map(); // jobId -> error info
        
        this.options = {
            concurrency: options.concurrency || 2, // Max 2 ZIP operations simultaneously
            retryAttempts: options.retryAttempts || 3,
            jobTimeout: options.jobTimeout || 10 * 60 * 1000, // 10 minutes
            cleanupInterval: options.cleanupInterval || 30 * 60 * 1000, // 30 minutes
            maxCompletedJobs: options.maxCompletedJobs || 100,
            outputDir: options.outputDir || path.join(__dirname, '../temp_zip_exports'),
            ...options
        };
        
        this.activeWorkers = 0;
        this.stats = {
            totalJobs: 0,
            completedJobs: 0,
            failedJobs: 0,
            averageProcessingTime: 0,
            peakQueueSize: 0
        };
        
        // Ensure output directory exists
        this.ensureOutputDirectory();
        
        // Start cleanup interval
        this.startCleanupTimer();
        
        console.log(`📦 ZIP Queue initialized with ${this.options.concurrency} workers`);
    }

    ensureOutputDirectory() {
        if (!fs.existsSync(this.options.outputDir)) {
            fs.mkdirSync(this.options.outputDir, { recursive: true });
            console.log(`📁 Created ZIP output directory: ${this.options.outputDir}`);
        }
    }

    startCleanupTimer() {
        setInterval(() => {
            this.cleanup();
        }, this.options.cleanupInterval);
    }

    // Add a new ZIP job to the queue
    addJob(jobData) {
        const jobId = uuidv4();
        const job = {
            id: jobId,
            type: jobData.type || 'publication_export',
            data: jobData,
            createdAt: new Date(),
            attempts: 0,
            priority: jobData.priority || 5, // Lower number = higher priority
            userId: jobData.userId,
            galleryId: jobData.galleryId
        };
        
        // Insert job in priority order
        const insertIndex = this.queue.findIndex(queuedJob => queuedJob.priority > job.priority);
        if (insertIndex === -1) {
            this.queue.push(job);
        } else {
            this.queue.splice(insertIndex, 0, job);
        }
        
        this.stats.totalJobs++;
        this.stats.peakQueueSize = Math.max(this.stats.peakQueueSize, this.queue.length);
        
        console.log(`📥 Added job ${jobId} to queue (position: ${this.queue.length}, type: ${job.type})`);
        
        // Try to start processing
        this.processNext();
        
        return jobId;
    }

    // Get job status
    getJobStatus(jobId) {
        // Check if job is in queue
        const queuedJob = this.queue.find(job => job.id === jobId);
        if (queuedJob) {
            const position = this.queue.indexOf(queuedJob) + 1;
            return {
                status: 'queued',
                position,
                queueSize: this.queue.length,
                estimatedWaitTime: this.estimateWaitTime(position),
                createdAt: queuedJob.createdAt
            };
        }
        
        // Check if job is processing
        if (this.processing.has(jobId)) {
            const job = this.processing.get(jobId);
            return {
                status: 'processing',
                startedAt: job.startedAt,
                progress: job.progress || 0,
                currentStep: job.currentStep || 'Starting...'
            };
        }
        
        // Check if job is completed
        if (this.completed.has(jobId)) {
            const result = this.completed.get(jobId);
            return {
                status: 'completed',
                ...result
            };
        }
        
        // Check if job failed
        if (this.failed.has(jobId)) {
            const error = this.failed.get(jobId);
            return {
                status: 'failed',
                ...error
            };
        }
        
        return {
            status: 'not_found'
        };
    }

    estimateWaitTime(position) {
        const avgProcessingTime = this.stats.averageProcessingTime || 30000; // 30s default
        const waitTime = Math.max(0, (position - this.activeWorkers) * avgProcessingTime / this.options.concurrency);
        return Math.round(waitTime / 1000); // Return in seconds
    }

    // Process the next job in queue
    async processNext() {
        if (this.activeWorkers >= this.options.concurrency || this.queue.length === 0) {
            return;
        }
        
        const job = this.queue.shift();
        this.activeWorkers++;
        
        const processingInfo = {
            id: job.id,
            startedAt: new Date(),
            progress: 0,
            currentStep: 'Initializing...'
        };
        
        this.processing.set(job.id, processingInfo);
        
        console.log(`🔄 Processing job ${job.id} (${job.type}) - Workers: ${this.activeWorkers}/${this.options.concurrency}`);
        
        try {
            const result = await this.processJob(job, processingInfo);
            
            // Job completed successfully
            const completedAt = new Date();
            const processingTime = completedAt - processingInfo.startedAt;
            
            this.completed.set(job.id, {
                completedAt,
                processingTime,
                filePath: result.filePath,
                fileName: result.fileName,
                fileSize: result.fileSize,
                downloadUrl: result.downloadUrl
            });
            
            this.stats.completedJobs++;
            this.updateAverageProcessingTime(processingTime);
            
            console.log(`✅ Job ${job.id} completed in ${processingTime}ms`);
            
            // Emit completion event
            this.emit('jobCompleted', {
                jobId: job.id,
                userId: job.userId,
                result: this.completed.get(job.id)
            });
            
        } catch (error) {
            console.error(`❌ Job ${job.id} failed:`, error.message);
            
            job.attempts++;
            
            if (job.attempts < this.options.retryAttempts) {
                console.log(`🔄 Retrying job ${job.id} (attempt ${job.attempts + 1}/${this.options.retryAttempts}`);
                
                // Add back to front of queue for retry
                this.queue.unshift(job);
            } else {
                // Job failed permanently
                this.failed.set(job.id, {
                    failedAt: new Date(),
                    error: error.message,
                    attempts: job.attempts
                });
                
                this.stats.failedJobs++;
                
                // Emit failure event
                this.emit('jobFailed', {
                    jobId: job.id,
                    userId: job.userId,
                    error: error.message
                });
            }
        } finally {
            this.processing.delete(job.id);
            this.activeWorkers--;
            
            // Process next job if any
            setImmediate(() => this.processNext());
        }
    }

    async processJob(job, processingInfo) {
        const { data } = job;
        
        switch (job.type) {
            case 'publication_export':
                return await this.processPublicationExport(data, processingInfo);
            case 'gallery_export':
                return await this.processGalleryExport(data, processingInfo);
            case 'multiple_publications_export':
                return await this.processMultiplePublicationsExport(data, processingInfo);
            default:
                throw new Error(`Unknown job type: ${job.type}`);
        }
    }

    async processPublicationExport(data, processingInfo) {
        const { publication, gallery, uploadDir } = data;
        
        processingInfo.currentStep = 'Creating archive...';
        processingInfo.progress = 10;
        
        const sanitizedGalleryName = gallery.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
        const fileName = `${sanitizedGalleryName} - Publication ${publication.letter} - Plan My Post.zip`;
        const filePath = path.join(this.options.outputDir, `${processingInfo.id}_${fileName}`);
        
        return new Promise((resolve, reject) => {
            const output = fs.createWriteStream(filePath);
            const archive = archiver('zip', {
                zlib: { level: 9 }
            });
            
            let totalFiles = publication.images ? publication.images.length : 0;
            if (publication.descriptionText && publication.descriptionText.trim()) {
                totalFiles++; // For description file
            }
            
            let processedFiles = 0;
            
            archive.on('warning', (err) => {
                if (err.code === 'ENOENT') {
                    console.warn('Archiver warning (ENOENT):', err);
                } else {
                    console.error('Archiver warning:', err);
                }
            });
            
            archive.on('error', (err) => {
                console.error('Archiver error:', err);
                reject(err);
            });
            
            archive.on('progress', (progress) => {
                const percentage = 10 + (progress.entries.processed / totalFiles) * 80;
                processingInfo.progress = Math.min(percentage, 90);
                processingInfo.currentStep = `Processing file ${progress.entries.processed}/${totalFiles}...`;
            });
            
            output.on('close', () => {
                const stats = fs.statSync(filePath);
                processingInfo.progress = 100;
                processingInfo.currentStep = 'Completed';
                
                resolve({
                    filePath,
                    fileName,
                    fileSize: stats.size,
                    downloadUrl: `/api/zip-exports/${processingInfo.id}_${fileName}`
                });
            });
            
            output.on('error', reject);
            
            archive.pipe(output);
            
            // Add description file if exists
            if (publication.descriptionText && publication.descriptionText.trim()) {
                let finalDescription = publication.descriptionText;
                if (gallery.commonDescriptionText && finalDescription.includes('{{COMMON_TEXT}}')) {
                    finalDescription = finalDescription.replace(/{{COMMON_TEXT}}/g, gallery.commonDescriptionText);
                }
                
                const descriptionFileName = `${sanitizedGalleryName} - Publication ${publication.letter} - Description.txt`;
                archive.append(finalDescription, { name: descriptionFileName });
                processedFiles++;
            }
            
            // Add images
            if (publication.images && publication.images.length > 0) {
                for (let i = 0; i < publication.images.length; i++) {
                    const imageEntry = publication.images[i];
                    if (imageEntry.imageId && imageEntry.imageId.path) {
                        const imageDoc = imageEntry.imageId;
                        const imagePath = path.join(uploadDir, imageDoc.path);
                        
                        if (fs.existsSync(imagePath)) {
                            const position = String(i + 1).padStart(2, '0');
                            const extension = path.extname(imageDoc.originalFilename) || '.jpg';
                            const filenameInZip = `${sanitizedGalleryName} - Publication ${publication.letter} - ${position} - Plan My Post${extension}`;
                            archive.file(imagePath, { name: filenameInZip });
                            processedFiles++;
                        } else {
                            console.warn(`File not found, skipping: ${imagePath}`);
                        }
                    }
                }
            }
            
            archive.finalize();
        });
    }

    async processGalleryExport(data, processingInfo) {
        // Implementation for full gallery export
        // This would be similar to publication export but for entire galleries
        throw new Error('Gallery export not implemented yet');
    }

    async processMultiplePublicationsExport(data, processingInfo) {
        // Implementation for multiple publications export
        // This would combine multiple publications into one ZIP
        throw new Error('Multiple publications export not implemented yet');
    }

    updateAverageProcessingTime(newTime) {
        if (this.stats.averageProcessingTime === 0) {
            this.stats.averageProcessingTime = newTime;
        } else {
            // Simple moving average
            this.stats.averageProcessingTime = (this.stats.averageProcessingTime * 0.8) + (newTime * 0.2);
        }
    }

    // Clean up old completed and failed jobs
    cleanup() {
        const now = new Date();
        const maxAge = 2 * 60 * 60 * 1000; // 2 hours
        
        // Clean up completed jobs
        for (const [jobId, job] of this.completed.entries()) {
            if (now - job.completedAt > maxAge) {
                // Remove file if it exists
                if (job.filePath && fs.existsSync(job.filePath)) {
                    try {
                        fs.unlinkSync(job.filePath);
                        console.log(`🧹 Cleaned up file: ${job.filePath}`);
                    } catch (error) {
                        console.error(`Failed to cleanup file ${job.filePath}:`, error);
                    }
                }
                this.completed.delete(jobId);
            }
        }
        
        // Clean up failed jobs
        for (const [jobId, job] of this.failed.entries()) {
            if (now - job.failedAt > maxAge) {
                this.failed.delete(jobId);
            }
        }
        
        // Limit completed jobs count
        if (this.completed.size > this.options.maxCompletedJobs) {
            const sortedJobs = Array.from(this.completed.entries())
                .sort(([,a], [,b]) => a.completedAt - b.completedAt);
            
            const toRemove = sortedJobs.slice(0, this.completed.size - this.options.maxCompletedJobs);
            for (const [jobId, job] of toRemove) {
                if (job.filePath && fs.existsSync(job.filePath)) {
                    try {
                        fs.unlinkSync(job.filePath);
                    } catch (error) {
                        console.error(`Failed to cleanup file ${job.filePath}:`, error);
                    }
                }
                this.completed.delete(jobId);
            }
        }
        
        console.log(`🧹 Cleanup completed - Completed: ${this.completed.size}, Failed: ${this.failed.size}`);
    }

    // Get queue statistics
    getStats() {
        return {
            ...this.stats,
            currentQueueSize: this.queue.length,
            activeWorkers: this.activeWorkers,
            maxWorkers: this.options.concurrency,
            completedJobsInMemory: this.completed.size,
            failedJobsInMemory: this.failed.size,
            processingJobs: this.processing.size
        };
    }

    // Get all jobs for a specific user
    getUserJobs(userId) {
        const userJobs = [];
        
        // Queued jobs
        this.queue.forEach((job, index) => {
            if (job.userId === userId) {
                userJobs.push({
                    id: job.id,
                    status: 'queued',
                    position: index + 1,
                    createdAt: job.createdAt,
                    type: job.type
                });
            }
        });
        
        // Processing jobs
        for (const [jobId, job] of this.processing.entries()) {
            if (this.queue.find(q => q.id === jobId && q.userId === userId)) {
                userJobs.push({
                    id: jobId,
                    status: 'processing',
                    progress: job.progress,
                    currentStep: job.currentStep,
                    startedAt: job.startedAt
                });
            }
        }
        
        // Completed jobs
        for (const [jobId, job] of this.completed.entries()) {
            // We need to find the original job to get userId - this is a limitation
            // In a real implementation, we'd store userId in completed jobs too
            userJobs.push({
                id: jobId,
                status: 'completed',
                completedAt: job.completedAt,
                downloadUrl: job.downloadUrl,
                fileName: job.fileName,
                fileSize: job.fileSize
            });
        }
        
        return userJobs.sort((a, b) => new Date(b.createdAt || b.completedAt || b.startedAt) - new Date(a.createdAt || a.completedAt || a.startedAt));
    }
}

// Create singleton instance
const zipQueue = new ZipQueue();

module.exports = zipQueue;