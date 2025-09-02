// ===============================
// File: tests/unit/models/Publication.test.js
// Comprehensive tests for Publication model
// ===============================

const mongoose = require('mongoose');
const Publication = require('../../../models/Publication');
const Gallery = require('../../../models/Gallery');
const Image = require('../../../models/Image');

describe('Publication Model', () => {
    let testGallery;
    
    beforeEach(async () => {
        await global.testUtils.clearDatabase();
        
        // Create a test gallery for publications
        testGallery = await Gallery.create({
            name: 'Test Gallery',
            owner: new mongoose.Types.ObjectId()
        });
    });
    
    describe('Schema Validation', () => {
        test('should create publication with valid data', async () => {
            const publicationData = {
                galleryId: testGallery._id,
                letter: 'A',
                index: 0,
                images: [],
                descriptionText: 'Test publication description'
            };
            
            const publication = new Publication(publicationData);
            const savedPublication = await publication.save();
            
            expect(savedPublication._id).toBeDefined();
            expect(savedPublication.galleryId.toString()).toBe(testGallery._id.toString());
            expect(savedPublication.letter).toBe('A');
            expect(savedPublication.index).toBe(0);
            expect(savedPublication.descriptionText).toBe('Test publication description');
            expect(savedPublication.createdAt).toBeDefined();
            expect(savedPublication.updatedAt).toBeDefined();
        });
        
        test('should set default values correctly', async () => {
            const minimalPublication = new Publication({
                galleryId: testGallery._id,
                letter: 'A',
                index: 0
            });
            
            const savedPublication = await minimalPublication.save();
            
            expect(savedPublication.images).toEqual([]);
            expect(savedPublication.descriptionText).toBe('');
            expect(savedPublication.autoCropSettings).toEqual({
                vertical: 'none',
                horizontal: 'none'
            });
        });
        
        test('should require galleryId field', async () => {
            const publication = new Publication({
                letter: 'A',
                index: 0
            });
            
            await expect(publication.save()).rejects.toThrow(/galleryId.*required/i);
        });
        
        test('should require letter field', async () => {
            const publication = new Publication({
                galleryId: testGallery._id,
                index: 0
            });
            
            await expect(publication.save()).rejects.toThrow(/letter.*required/i);
        });
        
        test('should require index field', async () => {
            const publication = new Publication({
                galleryId: testGallery._id,
                letter: 'A'
            });
            
            await expect(publication.save()).rejects.toThrow(/index.*required/i);
        });
        
        test('should validate letter format', async () => {
            const invalidLetters = ['a', 'AA', '1', '@', '', 'AB'];
            
            for (const letter of invalidLetters) {
                const publication = new Publication({
                    galleryId: testGallery._id,
                    letter,
                    index: 0
                });
                
                await expect(publication.save()).rejects.toThrow();
            }
        });
        
        test('should validate index range', async () => {
            const invalidIndexes = [-1, 26, 100, 1.5];
            
            for (const index of invalidIndexes) {
                const publication = new Publication({
                    galleryId: testGallery._id,
                    letter: 'A',
                    index
                });
                
                await expect(publication.save()).rejects.toThrow();
            }
        });
        
        test('should validate description length', async () => {
            const publication = new Publication({
                galleryId: testGallery._id,
                letter: 'A',
                index: 0,
                descriptionText: 'A'.repeat(5001) // Exceeds maxlength
            });
            
            await expect(publication.save()).rejects.toThrow();
        });
        
        test('should validate autoCropSettings enum values', async () => {
            const invalidSettings = [
                { vertical: 'invalid', horizontal: 'none' },
                { vertical: 'none', horizontal: 'invalid' },
                { vertical: 'unknown', horizontal: 'unknown' }
            ];
            
            for (const autoCropSettings of invalidSettings) {
                const publication = new Publication({
                    galleryId: testGallery._id,
                    letter: 'A',
                    index: 0,
                    autoCropSettings
                });
                
                await expect(publication.save()).rejects.toThrow();
            }
        });
        
        test('should validate images array structure', async () => {
            const testImage = await Image.create({
                galleryId: testGallery._id,
                path: 'test/image.jpg',
                thumbnailPath: 'test/thumb.jpg',
                originalFilename: 'image.jpg'
            });
            
            const validImages = [
                { imageId: testImage._id, order: 0 },
                { imageId: testImage._id, order: 1 }
            ];
            
            const publication = new Publication({
                galleryId: testGallery._id,
                letter: 'A',
                index: 0,
                images: validImages
            });
            
            const savedPublication = await publication.save();
            expect(savedPublication.images).toHaveLength(2);
            expect(savedPublication.images[0].order).toBe(0);
            expect(savedPublication.images[1].order).toBe(1);
        });
        
        test('should reject invalid image order values', async () => {
            const testImage = await Image.create({
                galleryId: testGallery._id,
                path: 'test/image.jpg',
                thumbnailPath: 'test/thumb.jpg',
                originalFilename: 'image.jpg'
            });
            
            const invalidImages = [
                { imageId: testImage._id, order: -1 }, // Negative order
                { imageId: testImage._id, order: 1.5 }, // Decimal order
            ];
            
            for (const images of invalidImages) {
                const publication = new Publication({
                    galleryId: testGallery._id,
                    letter: 'A',
                    index: 0,
                    images: [images]
                });
                
                await expect(publication.save()).rejects.toThrow();
            }
        });
        
        test('should reject invalid imageId in images array', async () => {
            const invalidImages = [
                { imageId: 'invalid-object-id', order: 0 },
                { imageId: '123', order: 0 }
            ];
            
            for (const images of invalidImages) {
                const publication = new Publication({
                    galleryId: testGallery._id,
                    letter: 'A',
                    index: 0,
                    images: [images]
                });
                
                await expect(publication.save()).rejects.toThrow();
            }
        });
    });
    
    describe('Compound Index Validation', () => {
        test('should enforce unique compound index on galleryId, letter, and index', async () => {
            // Create first publication
            const publication1 = new Publication({
                galleryId: testGallery._id,
                letter: 'A',
                index: 0
            });
            await publication1.save();
            
            // Try to create duplicate publication with same galleryId, letter, and index
            const publication2 = new Publication({
                galleryId: testGallery._id,
                letter: 'A',
                index: 0
            });
            
            await expect(publication2.save()).rejects.toThrow(/duplicate key/i);
        });
        
        test('should allow same letter and index in different galleries', async () => {
            // Create another gallery
            const otherGallery = await Gallery.create({
                name: 'Other Gallery',
                owner: new mongoose.Types.ObjectId()
            });
            
            // Create publication in first gallery
            const publication1 = new Publication({
                galleryId: testGallery._id,
                letter: 'A',
                index: 0
            });
            await publication1.save();
            
            // Create publication with same letter and index in different gallery
            const publication2 = new Publication({
                galleryId: otherGallery._id,
                letter: 'A',
                index: 0
            });
            
            // This should succeed
            const savedPublication2 = await publication2.save();
            expect(savedPublication2._id).toBeDefined();
        });
        
        test('should allow different combinations in same gallery', async () => {
            const publications = [
                { letter: 'A', index: 0 },
                { letter: 'A', index: 1 },
                { letter: 'B', index: 0 },
                { letter: 'B', index: 1 }
            ];
            
            for (const pub of publications) {
                const publication = new Publication({
                    galleryId: testGallery._id,
                    ...pub
                });
                
                const saved = await publication.save();
                expect(saved._id).toBeDefined();
            }
        });
    });
    
    describe('Image Management', () => {
        let testImages;
        
        beforeEach(async () => {
            testImages = await Promise.all([
                Image.create({
                    galleryId: testGallery._id,
                    path: 'test/image1.jpg',
                    thumbnailPath: 'test/thumb1.jpg',
                    originalFilename: 'image1.jpg'
                }),
                Image.create({
                    galleryId: testGallery._id,
                    path: 'test/image2.jpg',
                    thumbnailPath: 'test/thumb2.jpg',
                    originalFilename: 'image2.jpg'
                })
            ]);
        });
        
        test('should add images to publication', async () => {
            const publication = await Publication.create({
                galleryId: testGallery._id,
                letter: 'A',
                index: 0
            });
            
            publication.images = [
                { imageId: testImages[0]._id, order: 0 },
                { imageId: testImages[1]._id, order: 1 }
            ];
            
            const savedPublication = await publication.save();
            expect(savedPublication.images).toHaveLength(2);
        });
        
        test('should maintain image order', async () => {
            const publication = await Publication.create({
                galleryId: testGallery._id,
                letter: 'A',
                index: 0,
                images: [
                    { imageId: testImages[1]._id, order: 1 },
                    { imageId: testImages[0]._id, order: 0 }
                ]
            });
            
            // Images should maintain their assigned order
            expect(publication.images[0].order).toBe(1);
            expect(publication.images[1].order).toBe(0);
        });
        
        test('should remove images from publication', async () => {
            const publication = await Publication.create({
                galleryId: testGallery._id,
                letter: 'A',
                index: 0,
                images: [
                    { imageId: testImages[0]._id, order: 0 },
                    { imageId: testImages[1]._id, order: 1 }
                ]
            });
            
            // Remove one image
            publication.images = publication.images.filter(img => 
                img.imageId.toString() !== testImages[0]._id.toString()
            );
            
            const savedPublication = await publication.save();
            expect(savedPublication.images).toHaveLength(1);
            expect(savedPublication.images[0].imageId.toString()).toBe(testImages[1]._id.toString());
        });
        
        test('should handle duplicate images in same publication', async () => {
            const publication = new Publication({
                galleryId: testGallery._id,
                letter: 'A',
                index: 0,
                images: [
                    { imageId: testImages[0]._id, order: 0 },
                    { imageId: testImages[0]._id, order: 1 } // Duplicate image
                ]
            });
            
            // This should be allowed (same image can appear multiple times with different orders)
            const savedPublication = await publication.save();
            expect(savedPublication.images).toHaveLength(2);
        });
    });
    
    describe('Population and References', () => {
        let testImage;
        
        beforeEach(async () => {
            testImage = await Image.create({
                galleryId: testGallery._id,
                path: 'test/image.jpg',
                thumbnailPath: 'test/thumb.jpg',
                originalFilename: 'image.jpg'
            });
        });
        
        test('should populate gallery reference', async () => {
            const publication = await Publication.create({
                galleryId: testGallery._id,
                letter: 'A',
                index: 0
            });
            
            const populatedPublication = await Publication.findById(publication._id)
                .populate('galleryId');
            
            expect(populatedPublication.galleryId).toBeDefined();
            expect(populatedPublication.galleryId.name).toBe('Test Gallery');
        });
        
        test('should populate image references in images array', async () => {
            const publication = await Publication.create({
                galleryId: testGallery._id,
                letter: 'A',
                index: 0,
                images: [{ imageId: testImage._id, order: 0 }]
            });
            
            const populatedPublication = await Publication.findById(publication._id)
                .populate('images.imageId');
            
            expect(populatedPublication.images[0].imageId).toBeDefined();
            expect(populatedPublication.images[0].imageId.originalFilename).toBe('image.jpg');
        });
        
        test('should handle missing referenced images gracefully', async () => {
            const publication = await Publication.create({
                galleryId: testGallery._id,
                letter: 'A',
                index: 0,
                images: [{ imageId: testImage._id, order: 0 }]
            });
            
            // Delete the referenced image
            await Image.findByIdAndDelete(testImage._id);
            
            // Population should still work, but imageId will be null
            const populatedPublication = await Publication.findById(publication._id)
                .populate('images.imageId');
            
            expect(populatedPublication.images[0].imageId).toBeNull();
        });
    });
    
    describe('Auto Crop Settings', () => {
        test('should handle all valid autoCrop combinations', async () => {
            const validCombinations = [
                { vertical: 'none', horizontal: 'none' },
                { vertical: 'top', horizontal: 'none' },
                { vertical: 'center', horizontal: 'none' },
                { vertical: 'bottom', horizontal: 'none' },
                { vertical: 'none', horizontal: 'left' },
                { vertical: 'none', horizontal: 'center' },
                { vertical: 'none', horizontal: 'right' },
                { vertical: 'center', horizontal: 'center' }
            ];
            
            for (let i = 0; i < validCombinations.length; i++) {
                const publication = await Publication.create({
                    galleryId: testGallery._id,
                    letter: String.fromCharCode(65 + i), // A, B, C, etc.
                    index: 0,
                    autoCropSettings: validCombinations[i]
                });
                
                expect(publication.autoCropSettings).toEqual(validCombinations[i]);
            }
        });
        
        test('should use default autoCrop settings when not specified', async () => {
            const publication = await Publication.create({
                galleryId: testGallery._id,
                letter: 'A',
                index: 0
            });
            
            expect(publication.autoCropSettings).toEqual({
                vertical: 'none',
                horizontal: 'none'
            });
        });
    });
    
    describe('Business Logic and Queries', () => {
        beforeEach(async () => {
            // Create multiple publications for testing
            await Publication.create([
                { galleryId: testGallery._id, letter: 'A', index: 0, descriptionText: 'First' },
                { galleryId: testGallery._id, letter: 'A', index: 1, descriptionText: 'Second' },
                { galleryId: testGallery._id, letter: 'B', index: 0, descriptionText: 'Third' },
                { galleryId: testGallery._id, letter: 'B', index: 1, descriptionText: 'Fourth' }
            ]);
        });
        
        test('should find publications by gallery', async () => {
            const publications = await Publication.find({ galleryId: testGallery._id });
            expect(publications).toHaveLength(4);
        });
        
        test('should find publications by letter', async () => {
            const publicationsA = await Publication.find({ 
                galleryId: testGallery._id, 
                letter: 'A' 
            });
            expect(publicationsA).toHaveLength(2);
        });
        
        test('should sort publications by index', async () => {
            const publications = await Publication.find({ galleryId: testGallery._id })
                .sort({ letter: 1, index: 1 });
            
            expect(publications[0].letter).toBe('A');
            expect(publications[0].index).toBe(0);
            expect(publications[1].letter).toBe('A');
            expect(publications[1].index).toBe(1);
            expect(publications[2].letter).toBe('B');
            expect(publications[2].index).toBe(0);
        });
        
        test('should find next available index for letter', async () => {
            const existingIndexes = await Publication.find({ 
                galleryId: testGallery._id, 
                letter: 'A' 
            }).distinct('index');
            
            const maxIndex = Math.max(...existingIndexes);
            const nextIndex = maxIndex + 1;
            
            expect(nextIndex).toBe(2); // A0, A1 exist, so next is A2
        });
        
        test('should handle pagination efficiently', async () => {
            const page1 = await Publication.find({ galleryId: testGallery._id })
                .sort({ letter: 1, index: 1 })
                .limit(2);
            
            const page2 = await Publication.find({ galleryId: testGallery._id })
                .sort({ letter: 1, index: 1 })
                .skip(2)
                .limit(2);
            
            expect(page1).toHaveLength(2);
            expect(page2).toHaveLength(2);
            expect(page1[0].letter).toBe('A');
            expect(page2[0].letter).toBe('B');
        });
    });
    
    describe('Performance Tests', () => {
        test('should handle large images arrays efficiently', async () => {
            // Create many test images
            const imagePromises = Array.from({ length: 100 }, (_, i) => 
                Image.create({
                    galleryId: testGallery._id,
                    path: `test/image${i}.jpg`,
                    thumbnailPath: `test/thumb${i}.jpg`,
                    originalFilename: `image${i}.jpg`
                })
            );
            
            const images = await Promise.all(imagePromises);
            
            // Create publication with many images
            const imagesArray = images.map((img, index) => ({
                imageId: img._id,
                order: index
            }));
            
            const startTime = Date.now();
            
            const publication = await Publication.create({
                galleryId: testGallery._id,
                letter: 'A',
                index: 0,
                images: imagesArray
            });
            
            const endTime = Date.now();
            
            expect(publication.images).toHaveLength(100);
            expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
        });
        
        test('should query publications efficiently with indexes', async () => {
            // Create many publications
            const publicationPromises = Array.from({ length: 100 }, (_, i) => 
                Publication.create({
                    galleryId: testGallery._id,
                    letter: String.fromCharCode(65 + (i % 26)), // A-Z
                    index: Math.floor(i / 26),
                    descriptionText: `Publication ${i}`
                })
            );
            
            await Promise.all(publicationPromises);
            
            const startTime = Date.now();
            
            // This query should use the compound index
            const publications = await Publication.find({ 
                galleryId: testGallery._id,
                letter: 'A' 
            }).sort({ index: 1 });
            
            const endTime = Date.now();
            
            expect(publications.length).toBeGreaterThan(0);
            expect(endTime - startTime).toBeLessThan(50); // Should be very fast with index
        });
    });
    
    describe('Error Handling', () => {
        test('should handle concurrent creation of same publication', async () => {
            const publicationData = {
                galleryId: testGallery._id,
                letter: 'A',
                index: 0
            };
            
            // Try to create the same publication concurrently
            const promises = Array.from({ length: 3 }, () => 
                Publication.create(publicationData)
            );
            
            const results = await Promise.allSettled(promises);
            
            // Only one should succeed due to unique index
            const successCount = results.filter(r => r.status === 'fulfilled').length;
            const errorCount = results.filter(r => r.status === 'rejected').length;
            
            expect(successCount).toBe(1);
            expect(errorCount).toBe(2);
        });
        
        test('should handle invalid ObjectId references', async () => {
            const publication = new Publication({
                galleryId: 'invalid-object-id',
                letter: 'A',
                index: 0
            });
            
            await expect(publication.save()).rejects.toThrow();
        });
        
        test('should handle malformed images array', async () => {
            const publication = new Publication({
                galleryId: testGallery._id,
                letter: 'A',
                index: 0,
                images: ['not-an-object'] // Should be objects with imageId and order
            });
            
            await expect(publication.save()).rejects.toThrow();
        });
    });
});