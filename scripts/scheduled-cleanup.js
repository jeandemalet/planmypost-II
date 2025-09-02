#!/usr/bin/env node
// ===============================
// File: scripts/scheduled-cleanup.js
// Automated cleanup task for orphaned data and maintenance
// ===============================

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs-extra');
const path = require('path');
const cron = require('node-cron');

// Import models
const Gallery = require('../models/Gallery');
const Image = require('../models/Image');
const Publication = require('../models/Publication');
const Schedule = require('../models/Schedule');

class ScheduledCleanup {
    constructor() {
        this.uploadsDir = path.join(__dirname, '..', 'uploads');
        this.tempZipDir = path.join(__dirname, '..', 'temp_zip_exports');
        this.logFile = path.join(__dirname, '..', 'logs', 'cleanup.log');
        this.stats = {
            orphanedImages: 0,
            orphanedFiles: 0,
            orphanedPublications: 0,
            orphanedSchedules: 0,
            tempFilesRemoved: 0,
            oldZipFiles: 0,
            totalSpaceFreed: 0
        };
    }

    log(message, level = 'info') {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
        
        console.log(logMessage);
        
        // Ensure logs directory exists
        const logsDir = path.dirname(this.logFile);
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
        
        // Append to log file
        fs.appendFileSync(this.logFile, logMessage + '\n');
    }

    async connectToDatabase() {
        try {
            await mongoose.connect(process.env.MONGODB_URI);
            this.log('Connected to MongoDB');
        } catch (error) {
            this.log(`Failed to connect to MongoDB: ${error.message}`, 'error');
            throw error;
        }
    }

    async cleanOrphanedImages() {
        this.log('Starting orphaned images cleanup...');
        
        try {
            // Find images that don't belong to any gallery
            const orphanedImages = await Image.find({
                $or: [
                    { galleryId: { $exists: false } },
                    { galleryId: null }
                ]
            });

            for (const image of orphanedImages) {
                // Check if gallery exists
                const gallery = await Gallery.findById(image.galleryId);
                if (!gallery) {
                    this.log(`Removing orphaned image: ${image.originalFilename} (Gallery not found)`);
                    
                    // Remove physical file
                    const filePath = path.join(this.uploadsDir, image.path);
                    if (fs.existsSync(filePath)) {
                        const stats = fs.statSync(filePath);
                        this.stats.totalSpaceFreed += stats.size;
                        fs.unlinkSync(filePath);
                    }
                    
                    // Remove from database
                    await Image.deleteOne({ _id: image._id });
                    this.stats.orphanedImages++;
                }
            }

            this.log(`Cleaned ${this.stats.orphanedImages} orphaned images`);
        } catch (error) {
            this.log(`Error cleaning orphaned images: ${error.message}`, 'error');
        }
    }

    async cleanOrphanedPublications() {
        this.log('Starting orphaned publications cleanup...');
        
        try {
            // Find publications that reference non-existent galleries
            const publications = await Publication.find({});
            
            for (const publication of publications) {
                const gallery = await Gallery.findById(publication.galleryId);
                if (!gallery) {
                    this.log(`Removing orphaned publication: ${publication.letter} (Gallery not found)`);
                    await Publication.deleteOne({ _id: publication._id });
                    this.stats.orphanedPublications++;
                }
            }

            this.log(`Cleaned ${this.stats.orphanedPublications} orphaned publications`);
        } catch (error) {
            this.log(`Error cleaning orphaned publications: ${error.message}`, 'error');
        }
    }

    async cleanOrphanedSchedules() {
        this.log('Starting orphaned schedules cleanup...');
        
        try {
            // Find schedules that reference non-existent publications
            const schedules = await Schedule.find({});
            
            for (const schedule of schedules) {
                const publication = await Publication.findById(schedule.publicationId);
                if (!publication) {
                    this.log(`Removing orphaned schedule: ${schedule.date} (Publication not found)`);
                    await Schedule.deleteOne({ _id: schedule._id });
                    this.stats.orphanedSchedules++;
                }
            }

            this.log(`Cleaned ${this.stats.orphanedSchedules} orphaned schedules`);
        } catch (error) {
            this.log(`Error cleaning orphaned schedules: ${error.message}`, 'error');
        }
    }

    async cleanOrphanedFiles() {
        this.log('Starting orphaned files cleanup...');
        
        try {
            if (!fs.existsSync(this.uploadsDir)) {
                this.log('Uploads directory does not exist, skipping file cleanup');
                return;
            }

            const files = fs.readdirSync(this.uploadsDir);
            
            for (const file of files) {
                const filePath = path.join(this.uploadsDir, file);
                
                // Skip directories and system files
                if (fs.statSync(filePath).isDirectory() || file.startsWith('.')) {
                    continue;
                }
                
                // Check if file is referenced in database
                const image = await Image.findOne({ path: file });
                if (!image) {
                    this.log(`Removing orphaned file: ${file}`);
                    const stats = fs.statSync(filePath);
                    this.stats.totalSpaceFreed += stats.size;
                    fs.unlinkSync(filePath);
                    this.stats.orphanedFiles++;
                }
            }

            this.log(`Cleaned ${this.stats.orphanedFiles} orphaned files`);
        } catch (error) {
            this.log(`Error cleaning orphaned files: ${error.message}`, 'error');
        }
    }

    async cleanTempZipFiles() {
        this.log('Starting temporary ZIP files cleanup...');
        
        try {
            if (!fs.existsSync(this.tempZipDir)) {
                this.log('Temp ZIP directory does not exist, skipping ZIP cleanup');
                return;
            }

            const files = fs.readdirSync(this.tempZipDir);
            const now = Date.now();
            const maxAge = 4 * 60 * 60 * 1000; // 4 hours

            for (const file of files) {
                const filePath = path.join(this.tempZipDir, file);
                const stats = fs.statSync(filePath);
                
                if (now - stats.mtime.getTime() > maxAge) {
                    this.log(`Removing old ZIP file: ${file}`);
                    this.stats.totalSpaceFreed += stats.size;
                    fs.unlinkSync(filePath);
                    this.stats.oldZipFiles++;
                }
            }

            this.log(`Cleaned ${this.stats.oldZipFiles} old ZIP files`);
        } catch (error) {
            this.log(`Error cleaning temporary ZIP files: ${error.message}`, 'error');
        }
    }

    async cleanupLogs() {
        this.log('Starting logs cleanup...');
        
        try {
            const logsDir = path.dirname(this.logFile);
            if (!fs.existsSync(logsDir)) {
                return;
            }

            const files = fs.readdirSync(logsDir);
            const now = Date.now();
            const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days

            for (const file of files) {
                if (!file.endsWith('.log')) continue;
                
                const filePath = path.join(logsDir, file);
                const stats = fs.statSync(filePath);
                
                if (now - stats.mtime.getTime() > maxAge) {
                    this.log(`Removing old log file: ${file}`);
                    this.stats.totalSpaceFreed += stats.size;
                    fs.unlinkSync(filePath);
                }
            }
        } catch (error) {
            this.log(`Error cleaning logs: ${error.message}`, 'error');
        }
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    generateReport() {
        const report = {
            timestamp: new Date().toISOString(),
            stats: {
                ...this.stats,
                totalSpaceFreedFormatted: this.formatBytes(this.stats.totalSpaceFreed)
            },
            summary: `Cleanup completed: ${this.stats.orphanedImages} images, ${this.stats.orphanedFiles} files, ${this.stats.orphanedPublications} publications, ${this.stats.orphanedSchedules} schedules, ${this.stats.oldZipFiles} ZIP files removed. Total space freed: ${this.formatBytes(this.stats.totalSpaceFreed)}`
        };

        // Save report
        const reportPath = path.join(__dirname, '..', 'logs', `cleanup-report-${new Date().toISOString().split('T')[0]}.json`);
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

        return report;
    }

    async runCleanup() {
        const startTime = Date.now();
        this.log('🧹 Starting scheduled cleanup task...');

        try {
            await this.connectToDatabase();
            
            // Run all cleanup operations
            await this.cleanOrphanedImages();
            await this.cleanOrphanedPublications();
            await this.cleanOrphanedSchedules();
            await this.cleanOrphanedFiles();
            await this.cleanTempZipFiles();
            await this.cleanupLogs();

            // Generate report
            const report = this.generateReport();
            
            const duration = Date.now() - startTime;
            this.log(`✅ Cleanup completed in ${duration}ms`);
            this.log(report.summary);

            return report;
        } catch (error) {
            this.log(`💥 Cleanup failed: ${error.message}`, 'error');
            throw error;
        } finally {
            await mongoose.disconnect();
        }
    }

    setupScheduledTask() {
        // Run every day at 2 AM
        cron.schedule('0 2 * * *', async () => {
            try {
                await this.runCleanup();
            } catch (error) {
                console.error('Scheduled cleanup failed:', error);
            }
        }, {
            timezone: "Europe/Paris"
        });

        this.log('📅 Scheduled cleanup task registered (daily at 2 AM)');
    }
}

// CLI interface
if (require.main === module) {
    const cleanup = new ScheduledCleanup();
    
    const args = process.argv.slice(2);
    
    if (args.includes('--schedule')) {
        // Set up scheduled task
        cleanup.setupScheduledTask();
        console.log('Cleanup scheduler started. Press Ctrl+C to stop.');
        
        // Keep the process alive
        process.on('SIGINT', () => {
            console.log('\n📅 Cleanup scheduler stopped.');
            process.exit(0);
        });
    } else {
        // Run cleanup once
        cleanup.runCleanup()
            .then(report => {
                console.log('\n📊 Cleanup Report:');
                console.log(JSON.stringify(report.stats, null, 2));
                process.exit(0);
            })
            .catch(error => {
                console.error('Cleanup failed:', error);
                process.exit(1);
            });
    }
}

module.exports = ScheduledCleanup;