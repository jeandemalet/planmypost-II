// ===============================
// File: tests/unit/models/Gallery.test.js
// Comprehensive tests for Gallery model
// ===============================

const mongoose = require('mongoose');
const Gallery = require('../../../models/Gallery');
const Publication = require('../../../models/Publication');
const Image = require('../../../models/Image');
const Schedule = require('../../../models/Schedule');

describe('Gallery Model', () => {
    beforeEach(async () => {
        await global.testUtils.clearDatabase();
    });
    
    describe('Schema Validation', () => {
        test('should create gallery with valid data', async () => {
            const galleryData = global.testUtils.createTestGallery({
                name: 'Test Gallery',
                owner: new mongoose.Types.ObjectId()
            });
            
            const gallery = new Gallery(galleryData);
            const savedGallery = await gallery.save();
            
            expect(savedGallery._id).toBeDefined();
            expect(savedGallery.name).toBe('Test Gallery');
            expect(savedGallery.owner).toBeDefined();
            expect(savedGallery.createdAt).toBeDefined();
            expect(savedGallery.lastAccessed).toBeDefined();
        });
        
        test('should set default values correctly', async () => {
            const minimalGallery = new Gallery({
                name: 'Minimal Gallery',
                owner: new mongoose.Types.ObjectId()
            });
            
            const savedGallery = await minimalGallery.save();
            
            expect(savedGallery.commonDescriptionText).toBe('');
            expect(savedGallery.currentThumbSize.width).toBe(200);
            expect(savedGallery.currentThumbSize.height).toBe(200);
            expect(savedGallery.sortOption).toBe('name_asc');
            expect(savedGallery.activeTab).toBe('currentGallery');
            expect(savedGallery.nextPublicationIndex).toBe(0);
        });
        
        test('should require name field', async () => {
            const gallery = new Gallery({
                owner: new mongoose.Types.ObjectId()
            });
            
            await expect(gallery.save()).rejects.toThrow(/name.*required/i);
        });
        
        test('should require owner field', async () => {
            const gallery = new Gallery({
                name: 'Test Gallery'
            });
            
            await expect(gallery.save()).rejects.toThrow(/owner.*required/i);
        });
        
        test('should validate name length', async () => {
            const gallery = new Gallery({
                name: 'A'.repeat(101), // Exceeds maxlength of 100
                owner: new mongoose.Types.ObjectId()
            });
            
            await expect(gallery.save()).rejects.toThrow();
        });
        
        test('should validate owner is ObjectId', async () => {
            const gallery = new Gallery({
                name: 'Test Gallery',
                owner: 'invalid-object-id'
            });
            
            await expect(gallery.save()).rejects.toThrow();
        });
        
        test('should validate thumbnail size ranges', async () => {
            const invalidSizes = [
                { width: 49, height: 200 },   // width too small
                { width: 1001, height: 200 }, // width too large
                { width: 200, height: 49 },   // height too small
                { width: 200, height: 1001 }  // height too large
            ];
            
            for (const size of invalidSizes) {
                const gallery = new Gallery({
                    name: 'Test Gallery',
                    owner: new mongoose.Types.ObjectId(),
                    currentThumbSize: size
                });
                
                await expect(gallery.save()).rejects.toThrow();
            }
        });
        
        test('should validate sort option enum', async () => {
            const invalidSortOptions = ['invalid_sort', 'date_invalid', 'unknown'];
            
            for (const sortOption of invalidSortOptions) {
                const gallery = new Gallery({
                    name: 'Test Gallery',
                    owner: new mongoose.Types.ObjectId(),
                    sortOption
                });
                
                await expect(gallery.save()).rejects.toThrow();
            }
        });
        
        test('should validate active tab enum', async () => {
            const invalidTabs = ['admin', 'secret', 'unknown'];
            
            for (const activeTab of invalidTabs) {
                const gallery = new Gallery({
                    name: 'Test Gallery',
                    owner: new mongoose.Types.ObjectId(),
                    activeTab
                });
                
                await expect(gallery.save()).rejects.toThrow();
            }
        });
        
        test('should validate nextPublicationIndex range', async () => {
            const invalidIndexes = [-1, 26, 100];
            
            for (const index of invalidIndexes) {
                const gallery = new Gallery({
                    name: 'Test Gallery',
                    owner: new mongoose.Types.ObjectId(),
                    nextPublicationIndex: index
                });
                
                await expect(gallery.save()).rejects.toThrow();
            }
        });
        
        test('should validate description length', async () => {
            const gallery = new Gallery({
                name: 'Test Gallery',
                owner: new mongoose.Types.ObjectId(),
                commonDescriptionText: 'A'.repeat(5001) // Exceeds maxlength
            });
            
            await expect(gallery.save()).rejects.toThrow();
        });
    });
    
    describe('Cascade Delete Middleware', () => {
        let testGallery;
        
        beforeEach(async () => {
            testGallery = await Gallery.create({
                name: 'Test Gallery for Deletion',
                owner: new mongoose.Types.ObjectId()
            });
        });
        
        test('should delete related images when gallery is deleted', async () => {
            // Create test images
            const image1 = await Image.create({
                galleryId: testGallery._id,
                path: 'test/image1.jpg',
                thumbnailPath: 'test/thumb1.jpg',
                originalFilename: 'image1.jpg'
            });
            
            const image2 = await Image.create({
                galleryId: testGallery._id,
                path: 'test/image2.jpg',
                thumbnailPath: 'test/thumb2.jpg',
                originalFilename: 'image2.jpg'
            });
            
            // Verify images exist
            expect(await Image.countDocuments({ galleryId: testGallery._id })).toBe(2);
            
            // Delete gallery
            await Gallery.findByIdAndDelete(testGallery._id);
            
            // Verify images are deleted
            expect(await Image.countDocuments({ galleryId: testGallery._id })).toBe(0);
        });
        
        test('should delete related publications when gallery is deleted', async () => {
            // Create test publications
            const publication1 = await Publication.create({
                galleryId: testGallery._id,
                letter: 'A',
                index: 0,
                images: [],
                descriptionText: 'Test publication 1'
            });
            
            const publication2 = await Publication.create({
                galleryId: testGallery._id,
                letter: 'B',
                index: 1,
                images: [],
                descriptionText: 'Test publication 2'
            });
            
            // Verify publications exist
            expect(await Publication.countDocuments({ galleryId: testGallery._id })).toBe(2);
            
            // Delete gallery
            await Gallery.findByIdAndDelete(testGallery._id);
            
            // Verify publications are deleted
            expect(await Publication.countDocuments({ galleryId: testGallery._id })).toBe(0);
        });
        
        test('should delete related schedule entries when gallery is deleted', async () => {
            // Create test schedule entries
            const schedule1 = await Schedule.create({
                galleryId: testGallery._id,
                date: '2025-01-01',
                publicationLetter: 'A'
            });
            
            const schedule2 = await Schedule.create({
                galleryId: testGallery._id,
                date: '2025-01-02',
                publicationLetter: 'B'
            });
            
            // Verify schedule entries exist
            expect(await Schedule.countDocuments({ galleryId: testGallery._id })).toBe(2);
            
            // Delete gallery
            await Gallery.findByIdAndDelete(testGallery._id);
            
            // Verify schedule entries are deleted
            expect(await Schedule.countDocuments({ galleryId: testGallery._id })).toBe(0);
        });
        
        test('should delete all related data in complex scenario', async () => {
            // Create complex related data structure
            const image = await Image.create({
                galleryId: testGallery._id,
                path: 'test/image.jpg',
                thumbnailPath: 'test/thumb.jpg',
                originalFilename: 'image.jpg'
            });
            
            const publication = await Publication.create({
                galleryId: testGallery._id,
                letter: 'A',
                index: 0,
                images: [{ imageId: image._id, order: 0 }],
                descriptionText: 'Complex publication'
            });
            
            const schedule = await Schedule.create({
                galleryId: testGallery._id,
                date: '2025-01-01',
                publicationLetter: 'A'
            });
            
            // Verify all data exists
            expect(await Image.countDocuments({ galleryId: testGallery._id })).toBe(1);
            expect(await Publication.countDocuments({ galleryId: testGallery._id })).toBe(1);
            expect(await Schedule.countDocuments({ galleryId: testGallery._id })).toBe(1);
            
            // Delete gallery
            await Gallery.findByIdAndDelete(testGallery._id);
            
            // Verify all related data is deleted
            expect(await Image.countDocuments({ galleryId: testGallery._id })).toBe(0);
            expect(await Publication.countDocuments({ galleryId: testGallery._id })).toBe(0);
            expect(await Schedule.countDocuments({ galleryId: testGallery._id })).toBe(0);
        });
        
        test('should not affect other galleries data', async () => {
            // Create another gallery with data
            const otherGallery = await Gallery.create({
                name: 'Other Gallery',
                owner: new mongoose.Types.ObjectId()
            });
            
            const otherImage = await Image.create({
                galleryId: otherGallery._id,
                path: 'other/image.jpg',
                thumbnailPath: 'other/thumb.jpg',
                originalFilename: 'other_image.jpg'
            });
            
            const otherPublication = await Publication.create({
                galleryId: otherGallery._id,
                letter: 'A',
                index: 0,
                images: [{ imageId: otherImage._id, order: 0 }],
                descriptionText: 'Other publication'
            });
            
            // Create data for test gallery
            await Image.create({
                galleryId: testGallery._id,
                path: 'test/image.jpg',
                thumbnailPath: 'test/thumb.jpg',
                originalFilename: 'test_image.jpg'
            });
            
            // Delete test gallery
            await Gallery.findByIdAndDelete(testGallery._id);
            
            // Verify other gallery data is untouched
            expect(await Gallery.findById(otherGallery._id)).toBeTruthy();
            expect(await Image.countDocuments({ galleryId: otherGallery._id })).toBe(1);
            expect(await Publication.countDocuments({ galleryId: otherGallery._id })).toBe(1);
        });
    });
    
    describe('Instance Methods and Virtuals', () => {
        test('should update lastAccessed when accessed', async () => {
            const gallery = await Gallery.create({
                name: 'Test Gallery',
                owner: new mongoose.Types.ObjectId()
            });
            
            const originalLastAccessed = gallery.lastAccessed;
            
            // Wait a bit to ensure timestamp difference
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // Update lastAccessed
            gallery.lastAccessed = new Date();
            await gallery.save();
            
            expect(gallery.lastAccessed.getTime()).toBeGreaterThan(originalLastAccessed.getTime());
        });
        
        test('should maintain referential integrity with ObjectId fields', async () => {
            const ownerId = new mongoose.Types.ObjectId();
            
            const gallery = await Gallery.create({
                name: 'Test Gallery',
                owner: ownerId
            });
            
            expect(gallery.owner.toString()).toBe(ownerId.toString());
            expect(mongoose.Types.ObjectId.isValid(gallery.owner)).toBe(true);
        });
    });
    
    describe('Indexing and Performance', () => {
        test('should have proper indexes for performance', async () => {
            const gallery = await Gallery.create({
                name: 'Test Gallery',
                owner: new mongoose.Types.ObjectId()
            });
            
            // Test compound index on owner and lastAccessed
            const indexes = await Gallery.collection.getIndexes();
            
            // Should have indexes for owner (for user gallery listing)
            expect(indexes).toHaveProperty('owner_1');
            
            // Should have index for efficient sorting
            expect(indexes).toHaveProperty('lastAccessed_-1');
        });
        
        test('should perform efficiently with large datasets', async () => {
            const ownerId = new mongoose.Types.ObjectId();
            
            // Create multiple galleries for the same user
            const galleryPromises = Array.from({ length: 50 }, (_, i) => 
                Gallery.create({
                    name: `Gallery ${i}`,
                    owner: ownerId,
                    lastAccessed: new Date(Date.now() - i * 1000) // Different timestamps
                })
            );
            
            await Promise.all(galleryPromises);
            
            const startTime = Date.now();
            
            // Query with sorting (should use index)
            const galleries = await Gallery.find({ owner: ownerId })
                                          .sort({ lastAccessed: -1 })
                                          .limit(10);
            
            const endTime = Date.now();
            
            expect(galleries).toHaveLength(10);
            expect(endTime - startTime).toBeLessThan(100); // Should be very fast
            
            // Verify sorting is correct
            for (let i = 0; i < galleries.length - 1; i++) {
                expect(galleries[i].lastAccessed.getTime())
                    .toBeGreaterThanOrEqual(galleries[i + 1].lastAccessed.getTime());
            }
        });
    });
    
    describe('Error Handling', () => {
        test('should handle duplicate key errors gracefully', async () => {
            // If there were unique constraints, test them here
            // Currently Gallery model doesn't have unique constraints
            // This is a placeholder for future unique constraints
        });
        
        test('should handle invalid data types', async () => {
            const gallery = new Gallery({
                name: 123, // Should be string
                owner: new mongoose.Types.ObjectId()
            });
            
            await expect(gallery.save()).rejects.toThrow();
        });
        
        test('should handle missing required fields', async () => {
            const gallery = new Gallery({
                // Missing name and owner
                currentThumbSize: { width: 200, height: 200 }
            });
            
            await expect(gallery.save()).rejects.toThrow();
        });
        
        test('should handle invalid enum values', async () => {
            const gallery = new Gallery({
                name: 'Test Gallery',
                owner: new mongoose.Types.ObjectId(),
                sortOption: 'invalid_enum_value'
            });
            
            await expect(gallery.save()).rejects.toThrow();
        });
    });
    
    describe('Business Logic', () => {
        test('should maintain nextPublicationIndex consistency', async () => {
            const gallery = await Gallery.create({
                name: 'Test Gallery',
                owner: new mongoose.Types.ObjectId(),
                nextPublicationIndex: 5
            });
            
            expect(gallery.nextPublicationIndex).toBe(5);
            
            // Simulate creating publications and updating index
            gallery.nextPublicationIndex = 6;
            await gallery.save();
            
            const updatedGallery = await Gallery.findById(gallery._id);
            expect(updatedGallery.nextPublicationIndex).toBe(6);
        });
        
        test('should handle concurrent updates safely', async () => {
            const gallery = await Gallery.create({
                name: 'Test Gallery',
                owner: new mongoose.Types.ObjectId(),
                nextPublicationIndex: 0
            });
            
            // Simulate concurrent updates
            const promises = Array.from({ length: 5 }, async (_, i) => {
                const g = await Gallery.findById(gallery._id);
                g.nextPublicationIndex = i + 1;
                return g.save();
            });
            
            const results = await Promise.allSettled(promises);
            
            // At least one should succeed
            const successCount = results.filter(r => r.status === 'fulfilled').length;
            expect(successCount).toBeGreaterThan(0);
            
            // Final state should be consistent
            const finalGallery = await Gallery.findById(gallery._id);
            expect(finalGallery.nextPublicationIndex).toBeGreaterThan(0);
            expect(finalGallery.nextPublicationIndex).toBeLessThanOrEqual(5);
        });
    });
});