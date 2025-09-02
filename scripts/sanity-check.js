#!/usr/bin/env node
// ===============================
// File: scripts/sanity-check.js
// Database and file system synchronization checker
// ===============================

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs-extra');
const path = require('path');
const logger = require('../utils/logger');

// Import models
const Image = require('../models/Image');
const Gallery = require('../models/Gallery');
const Publication = require('../models/Publication');
const Schedule = require('../models/Schedule');

class SanityChecker {
    constructor() {
        this.uploadsDir = path.join(__dirname, '..', 'uploads');
        this.tempZipDir = path.join(__dirname, '..', 'temp_zip_exports');
        this.logFile = path.join(__dirname, '..', 'logs', 'sanity-check.log');
        
        this.issues = {
            orphanedFiles: [],
            missingFiles: [],
            orphanedImages: [],
            orphanedPublications: [],
            orphanedSchedules: [],
            invalidGalleryReferences: [],
            duplicateImages: [],
            inconsistentIndexes: []
        };
        
        this.stats = {
            totalFiles: 0,
            totalImages: 0,
            totalGalleries: 0,
            totalPublications: 0,
            totalSchedules: 0,
            issuesFound: 0,
            totalSpaceWasted: 0
        };
    }

    async connectToDatabase() {
        try {
            await mongoose.connect(process.env.MONGODB_URI);
            logger.info('Connected to MongoDB for sanity check');
        } catch (error) {
            logger.error('Failed to connect to MongoDB:', error);
            throw error;
        }
    }

    async checkFileSystemToDatabase() {
        logger.info('Starting file system to database consistency check...');
        
        if (!await fs.pathExists(this.uploadsDir)) {
            logger.warn('Uploads directory does not exist');
            return;
        }

        // Get all files in uploads directory recursively
        const files = await this.getAllFiles(this.uploadsDir);
        this.stats.totalFiles = files.length;
        
        logger.info(`Found ${files.length} files in uploads directory`);

        for (const filePath of files) {
            const relativePath = path.relative(this.uploadsDir, filePath);
            
            // Skip system files and directories
            if (relativePath.startsWith('.') || relativePath.includes('Thumbs.db')) {
                continue;
            }

            // Check if file has corresponding database entry
            const image = await Image.findOne({ path: relativePath });
            
            if (!image) {
                const stats = await fs.stat(filePath);
                this.issues.orphanedFiles.push({
                    path: relativePath,
                    fullPath: filePath,
                    size: stats.size,
                    lastModified: stats.mtime
                });
                this.stats.totalSpaceWasted += stats.size;
            }
        }

        logger.info(`Found ${this.issues.orphanedFiles.length} orphaned files`);
    }

    async checkDatabaseToFileSystem() {
        logger.info('Starting database to file system consistency check...');
        
        const images = await Image.find({}).lean();
        this.stats.totalImages = images.length;
        
        logger.info(`Found ${images.length} image records in database`);

        for (const image of images) {
            const fullPath = path.join(this.uploadsDir, image.path);
            
            if (!await fs.pathExists(fullPath)) {
                this.issues.missingFiles.push({
                    imageId: image._id,
                    path: image.path,
                    originalFilename: image.originalFilename,
                    galleryId: image.galleryId,
                    uploadDate: image.uploadDate
                });
            }
        }

        logger.info(`Found ${this.issues.missingFiles.length} missing files`);
    }

    async checkOrphanedImages() {
        logger.info('Checking for orphaned image records...');
        
        const images = await Image.find({}).lean();
        
        for (const image of images) {
            // Check if gallery exists
            const gallery = await Gallery.findById(image.galleryId);
            if (!gallery) {
                this.issues.orphanedImages.push({
                    imageId: image._id,
                    path: image.path,
                    originalFilename: image.originalFilename,
                    galleryId: image.galleryId,
                    uploadDate: image.uploadDate
                });
            }
        }

        logger.info(`Found ${this.issues.orphanedImages.length} orphaned image records`);
    }

    async checkOrphanedPublications() {
        logger.info('Checking for orphaned publication records...');
        
        const publications = await Publication.find({}).lean();
        this.stats.totalPublications = publications.length;
        
        for (const publication of publications) {
            // Check if gallery exists
            const gallery = await Gallery.findById(publication.galleryId);
            if (!gallery) {
                this.issues.orphanedPublications.push({
                    publicationId: publication._id,
                    letter: publication.letter,
                    galleryId: publication.galleryId,
                    imageCount: publication.images ? publication.images.length : 0
                });
            }
        }

        logger.info(`Found ${this.issues.orphanedPublications.length} orphaned publication records`);
    }

    async checkOrphanedSchedules() {
        logger.info('Checking for orphaned schedule records...');
        
        const schedules = await Schedule.find({}).lean();
        this.stats.totalSchedules = schedules.length;
        
        for (const schedule of schedules) {
            // Check if publication exists
            const publication = await Publication.findById(schedule.publicationId);
            if (!publication) {
                this.issues.orphanedSchedules.push({
                    scheduleId: schedule._id,
                    date: schedule.date,
                    publicationId: schedule.publicationId,
                    galleryId: schedule.galleryId
                });
            }
        }

        logger.info(`Found ${this.issues.orphanedSchedules.length} orphaned schedule records`);
    }

    async checkDuplicateImages() {
        logger.info('Checking for duplicate image records...');
        
        // Find images with same path but different IDs
        const duplicatePaths = await Image.aggregate([
            {
                $group: {
                    _id: '$path',
                    count: { $sum: 1 },
                    images: { $push: { id: '$_id', galleryId: '$galleryId', originalFilename: '$originalFilename' } }
                }
            },
            {
                $match: { count: { $gt: 1 } }
            }
        ]);

        for (const duplicate of duplicatePaths) {
            this.issues.duplicateImages.push({
                path: duplicate._id,
                count: duplicate.count,
                images: duplicate.images
            });
        }

        logger.info(`Found ${this.issues.duplicateImages.length} sets of duplicate images`);
    }

    async checkGalleryIndexConsistency() {
        logger.info('Checking gallery index consistency...');
        
        const galleries = await Gallery.find({}).lean();
        this.stats.totalGalleries = galleries.length;
        
        for (const gallery of galleries) {
            // Check if nextPublicationIndex is consistent with existing publications
            const publications = await Publication.find({ galleryId: gallery._id }).sort({ index: 1 }).lean();
            const usedIndexes = publications.map(p => p.index);
            const expectedNextIndex = this.findNextAvailableIndex(usedIndexes);
            
            if (gallery.nextPublicationIndex !== expectedNextIndex) {
                this.issues.inconsistentIndexes.push({
                    galleryId: gallery._id,
                    galleryName: gallery.name,
                    currentNextIndex: gallery.nextPublicationIndex,
                    expectedNextIndex: expectedNextIndex,
                    usedIndexes: usedIndexes
                });
            }
        }

        logger.info(`Found ${this.issues.inconsistentIndexes.length} galleries with inconsistent indexes`);
    }

    findNextAvailableIndex(usedIndexes) {
        for (let i = 0; i < 26; i++) {
            if (!usedIndexes.includes(i)) {
                return i;
            }
        }
        return 26; // All indexes used
    }

    async getAllFiles(dir) {
        const files = [];
        
        async function scan(directory) {
            const items = await fs.readdir(directory);
            
            for (const item of items) {
                const fullPath = path.join(directory, item);
                const stats = await fs.stat(fullPath);
                
                if (stats.isDirectory()) {
                    await scan(fullPath);
                } else {
                    files.push(fullPath);
                }
            }
        }
        
        await scan(dir);
        return files;
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    generateReport() {
        const totalIssues = Object.values(this.issues).reduce((sum, issues) => sum + issues.length, 0);
        this.stats.issuesFound = totalIssues;

        const report = {
            timestamp: new Date().toISOString(),
            stats: {
                ...this.stats,
                totalSpaceWastedFormatted: this.formatBytes(this.stats.totalSpaceWasted)
            },
            issues: this.issues,
            summary: {
                healthy: totalIssues === 0,
                criticalIssues: this.issues.missingFiles.length + this.issues.orphanedImages.length,
                warningIssues: this.issues.orphanedFiles.length + this.issues.duplicateImages.length,
                infoIssues: this.issues.inconsistentIndexes.length
            },
            recommendations: this.generateRecommendations()
        };

        // Save detailed report
        const reportPath = path.join(__dirname, '..', 'logs', `sanity-check-report-${new Date().toISOString().split('T')[0]}.json`);
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

        return report;
    }

    generateRecommendations() {
        const recommendations = [];

        if (this.issues.orphanedFiles.length > 0) {
            recommendations.push({
                type: 'cleanup',
                priority: 'medium',
                title: 'Remove orphaned files',
                description: `${this.issues.orphanedFiles.length} files exist on disk but have no database records`,
                action: 'Run cleanup script to remove these files and free up space',
                spaceToFree: this.formatBytes(this.stats.totalSpaceWasted)
            });
        }

        if (this.issues.missingFiles.length > 0) {
            recommendations.push({
                type: 'critical',
                priority: 'high',
                title: 'Fix missing file references',
                description: `${this.issues.missingFiles.length} database records point to missing files`,
                action: 'Remove database records for missing files or restore files from backup'
            });
        }

        if (this.issues.orphanedImages.length > 0) {
            recommendations.push({
                type: 'cleanup',
                priority: 'high',
                title: 'Clean orphaned image records',
                description: `${this.issues.orphanedImages.length} image records reference non-existent galleries`,
                action: 'Remove these database records'
            });
        }

        if (this.issues.duplicateImages.length > 0) {
            recommendations.push({
                type: 'optimization',
                priority: 'medium',
                title: 'Resolve duplicate image records',
                description: `${this.issues.duplicateImages.length} sets of duplicate image records found`,
                action: 'Investigate and merge or remove duplicate records'
            });
        }

        if (this.issues.inconsistentIndexes.length > 0) {
            recommendations.push({
                type: 'maintenance',
                priority: 'low',
                title: 'Fix gallery index consistency',
                description: `${this.issues.inconsistentIndexes.length} galleries have inconsistent nextPublicationIndex values`,
                action: 'Update gallery nextJourIndex to correct values'
            });
        }

        return recommendations;
    }

    async runSanityCheck() {
        const startTime = Date.now();
        logger.info('🔍 Starting comprehensive sanity check...');

        try {
            await this.connectToDatabase();
            
            // Run all checks
            await this.checkFileSystemToDatabase();
            await this.checkDatabaseToFileSystem();
            await this.checkOrphanedImages();
            await this.checkOrphanedPublications();
            await this.checkOrphanedSchedules();
            await this.checkDuplicateImages();
            await this.checkGalleryIndexConsistency();

            // Generate report
            const report = this.generateReport();
            
            const duration = Date.now() - startTime;
            logger.info(`✅ Sanity check completed in ${duration}ms`);
            
            // Summary
            if (report.summary.healthy) {
                logger.info('🎉 System is healthy - no issues found!');
            } else {
                logger.warn(`⚠️ Found ${report.stats.issuesFound} issues requiring attention`);
                logger.info(`Critical: ${report.summary.criticalIssues}, Warnings: ${report.summary.warningIssues}, Info: ${report.summary.infoIssues}`);
            }

            return report;
        } catch (error) {
            logger.error(`💥 Sanity check failed: ${error.message}`, { stack: error.stack });
            throw error;
        } finally {
            await mongoose.disconnect();
        }
    }
}

// CLI interface
if (require.main === module) {
    const checker = new SanityChecker();
    
    const args = process.argv.slice(2);
    const options = {
        verbose: args.includes('--verbose'),
        fix: args.includes('--fix'),
        dryRun: args.includes('--dry-run')
    };
    
    checker.runSanityCheck()
        .then(report => {
            console.log('\n📊 Sanity Check Summary:');
            console.log(`Total Issues: ${report.stats.issuesFound}`);
            console.log(`Critical: ${report.summary.criticalIssues}`);
            console.log(`Warnings: ${report.summary.warningIssues}`);
            console.log(`Info: ${report.summary.infoIssues}`);
            
            if (report.stats.totalSpaceWasted > 0) {
                console.log(`Space wasted: ${report.stats.totalSpaceWastedFormatted}`);
            }
            
            if (options.verbose) {
                console.log('\n📋 Detailed Issues:');
                console.log(JSON.stringify(report.issues, null, 2));
            }
            
            process.exit(report.summary.healthy ? 0 : 1);
        })
        .catch(error => {
            console.error('Sanity check failed:', error);
            process.exit(1);
        });
}

module.exports = SanityChecker;