// ===============================
// File: tests/unit/controllers/galleryController.test.js
// Comprehensive tests for gallery controller
// ===============================

const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const galleryController = require('../../../controllers/galleryController');
const Gallery = require('../../../models/Gallery');
const Publication = require('../../../models/Publication');
const User = require('../../../models/User');
const Image = require('../../../models/Image');

describe('Gallery Controller', () => {
    let app;
    let mockUser;
    let mockAdmin;
    
    beforeEach(async () => {
        app = express();
        app.use(express.json());
        
        // Create test users
        mockUser = await global.testUtils.connectToDatabase().then(() => {
            const User = require('../../../models/User');
            return User.create({
                googleId: 'test-google-id',
                email: 'test@example.com',
                name: 'Test User',
                role: 'user'
            });
        });
        
        mockAdmin = await User.create({
            googleId: 'admin-google-id', 
            email: 'admin@example.com',
            name: 'Admin User',
            role: 'admin'
        });
        
        // Setup routes
        app.post('/galleries', (req, res, next) => {
            req.userData = { userId: mockUser._id.toString() };
            next();
        }, galleryController.createGallery);
        
        app.get('/galleries', (req, res, next) => {
            req.userData = { userId: mockUser._id.toString() };
            next();
        }, galleryController.listGalleries);
        
        app.get('/galleries/:galleryId', (req, res, next) => {
            req.userData = { userId: mockUser._id.toString() };
            next();
        }, galleryController.getGalleryDetails);
        
        app.put('/galleries/:galleryId/state', (req, res, next) => {
            req.userData = { userId: mockUser._id.toString() };
            next();
        }, galleryController.updateGalleryState);
        
        app.delete('/galleries/:galleryId', (req, res, next) => {
            req.userData = { userId: mockUser._id.toString() };
            next();
        }, galleryController.deleteGallery);
    });
    
    describe('POST /galleries - Create Gallery', () => {
        test('should create a new gallery with default name', async () => {
            const response = await request(app)
                .post('/galleries')
                .send({})
                .expect(201);
            
            expect(response.body).toHaveProperty('_id');
            expect(response.body).toHaveProperty('name');
            expect(response.body.name).toMatch(/Galerie du/);
            expect(response.body.owner.toString()).toBe(mockUser._id.toString());
            
            // Verify initial publication was created
            const publication = await Publication.findOne({ 
                galleryId: response.body._id,
                letter: 'A',
                index: 0
            });
            expect(publication).toBeTruthy();
        });
        
        test('should create a gallery with custom name', async () => {
            const galleryName = 'Test Gallery Custom Name';
            
            const response = await request(app)
                .post('/galleries')
                .send({ name: galleryName })
                .expect(201);
            
            expect(response.body.name).toBe(galleryName);
            expect(response.body.owner.toString()).toBe(mockUser._id.toString());
        });
        
        test('should fail without authentication', async () => {
            const unauthenticatedApp = express();
            unauthenticatedApp.use(express.json());
            unauthenticatedApp.post('/galleries', galleryController.createGallery);
            
            await request(unauthenticatedApp)
                .post('/galleries')
                .send({ name: 'Test Gallery' })
                .expect(401);
        });
        
        test('should handle database errors gracefully', async () => {
            // Mock Gallery.save to throw an error
            const originalSave = Gallery.prototype.save;
            Gallery.prototype.save = jest.fn().mockRejectedValue(new Error('Database error'));
            
            await request(app)
                .post('/galleries')
                .send({ name: 'Test Gallery' })
                .expect(500);
            
            // Restore original method
            Gallery.prototype.save = originalSave;
        });
    });
    
    describe('GET /galleries - List Galleries', () => {
        beforeEach(async () => {
            // Create test galleries
            await Gallery.create([
                { name: 'Gallery A', owner: mockUser._id, createdAt: new Date('2023-01-01') },
                { name: 'Gallery B', owner: mockUser._id, createdAt: new Date('2023-01-02') },
                { name: 'Gallery C', owner: mockAdmin._id, createdAt: new Date('2023-01-03') } // Different owner
            ]);
        });
        
        test('should list user galleries with default sorting', async () => {
            const response = await request(app)
                .get('/galleries')
                .expect(200);
            
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body).toHaveLength(2); // Only user's galleries
            
            response.body.forEach(gallery => {
                expect(gallery.owner.toString()).toBe(mockUser._id.toString());
            });
        });
        
        test('should sort galleries by name ascending', async () => {
            const response = await request(app)
                .get('/galleries?sort=name_asc')
                .expect(200);
            
            expect(response.body[0].name).toBe('Gallery A');
            expect(response.body[1].name).toBe('Gallery B');
        });
        
        test('should sort galleries by creation date descending', async () => {
            const response = await request(app)
                .get('/galleries?sort=createdAt_desc')
                .expect(200);
            
            expect(new Date(response.body[0].createdAt).getTime())
                .toBeGreaterThan(new Date(response.body[1].createdAt).getTime());
        });
        
        test('should limit results', async () => {
            const response = await request(app)
                .get('/galleries?limit=1')
                .expect(200);
            
            expect(response.body).toHaveLength(1);
        });
        
        test('should fail without authentication', async () => {
            const unauthenticatedApp = express();
            unauthenticatedApp.use(express.json());
            unauthenticatedApp.get('/galleries', galleryController.listGalleries);
            
            await request(unauthenticatedApp)
                .get('/galleries')
                .expect(401);
        });
    });
    
    describe('GET /galleries/:galleryId - Get Gallery Details', () => {
        let testGallery;
        let otherUserGallery;
        
        beforeEach(async () => {
            testGallery = await Gallery.create({
                name: 'Test Gallery',
                owner: mockUser._id,
                currentThumbSize: { width: 200, height: 200 },
                sortOption: 'name_asc',
                activeTab: 'images'
            });
            
            otherUserGallery = await Gallery.create({
                name: 'Other User Gallery',
                owner: mockAdmin._id
            });
            
            // Create test images and publications
            const testImage = await Image.create({
                galleryId: testGallery._id,
                path: 'test/image.jpg',
                thumbnailPath: 'test/thumb.jpg',
                originalFilename: 'image.jpg',
                uploadDate: new Date()
            });
            
            await Publication.create({
                galleryId: testGallery._id,
                letter: 'A',
                index: 0,
                images: [{ imageId: testImage._id, order: 0 }],
                descriptionText: 'Test publication'
            });
        });
        
        test('should get gallery details with pagination', async () => {
            const response = await request(app)
                .get(`/galleries/${testGallery._id}`)
                .expect(200);
            
            expect(response.body).toHaveProperty('galleryState');
            expect(response.body).toHaveProperty('images');
            expect(response.body).toHaveProperty('jours');
            
            expect(response.body.galleryState.name).toBe('Test Gallery');
            expect(response.body.images).toHaveProperty('docs');
            expect(response.body.images).toHaveProperty('total');
            expect(response.body.images).toHaveProperty('page');
            expect(response.body.jours).toHaveLength(1);
        });
        
        test('should load full data when requested', async () => {
            const response = await request(app)
                .get(`/galleries/${testGallery._id}?loadFullData=true`)
                .expect(200);
            
            expect(response.body).toHaveProperty('galleryState');
            expect(response.body).toHaveProperty('images');
            expect(response.body).toHaveProperty('jours');
        });
        
        test('should handle pagination parameters', async () => {
            const response = await request(app)
                .get(`/galleries/${testGallery._id}?page=1&limit=10`)
                .expect(200);
            
            expect(response.body.images.page).toBe(1);
            expect(response.body.images.limit).toBe(10);
        });
        
        test('should deny access to other user gallery', async () => {
            await request(app)
                .get(`/galleries/${otherUserGallery._id}`)
                .expect(403);
        });
        
        test('should allow admin access to any gallery', async () => {
            const adminApp = express();
            adminApp.use(express.json());
            adminApp.get('/galleries/:galleryId', (req, res, next) => {
                req.userData = { userId: mockAdmin._id.toString() };
                next();
            }, galleryController.getGalleryDetails);
            
            const response = await request(adminApp)
                .get(`/galleries/${testGallery._id}`)
                .expect(200);
            
            expect(response.body.galleryState.name).toBe('Test Gallery');
        });
        
        test('should return 404 for non-existent gallery', async () => {
            const nonExistentId = new mongoose.Types.ObjectId();
            
            await request(app)
                .get(`/galleries/${nonExistentId}`)
                .expect(404);
        });
        
        test('should return 400 for invalid gallery ID format', async () => {
            await request(app)
                .get('/galleries/invalid-id')
                .expect(400);
        });
    });
    
    describe('PUT /galleries/:galleryId/state - Update Gallery State', () => {
        let testGallery;
        
        beforeEach(async () => {
            testGallery = await Gallery.create({
                name: 'Test Gallery',
                owner: mockUser._id,
                currentThumbSize: { width: 200, height: 200 },
                sortOption: 'name_asc',
                activeTab: 'images',
                nextPublicationIndex: 0
            });
        });
        
        test('should update gallery name', async () => {
            const newName = 'Updated Gallery Name';
            
            const response = await request(app)
                .put(`/galleries/${testGallery._id}/state`)
                .send({ name: newName })
                .expect(200);
            
            expect(response.body.name).toBe(newName);
            
            // Verify in database
            const updatedGallery = await Gallery.findById(testGallery._id);
            expect(updatedGallery.name).toBe(newName);
        });
        
        test('should update thumbnail size', async () => {
            const newThumbSize = { width: 300, height: 300 };
            
            await request(app)
                .put(`/galleries/${testGallery._id}/state`)
                .send({ currentThumbSize: newThumbSize })
                .expect(200);
            
            const updatedGallery = await Gallery.findById(testGallery._id);
            expect(updatedGallery.currentThumbSize.width).toBe(300);
            expect(updatedGallery.currentThumbSize.height).toBe(300);
        });
        
        test('should update sort option', async () => {
            const newSortOption = 'date_desc';
            
            await request(app)
                .put(`/galleries/${testGallery._id}/state`)
                .send({ sortOption: newSortOption })
                .expect(200);
            
            const updatedGallery = await Gallery.findById(testGallery._id);
            expect(updatedGallery.sortOption).toBe(newSortOption);
        });
        
        test('should update common description text', async () => {
            const newDescription = 'Updated common description';
            
            await request(app)
                .put(`/galleries/${testGallery._id}/state`)
                .send({ commonDescriptionText: newDescription })
                .expect(200);
            
            const updatedGallery = await Gallery.findById(testGallery._id);
            expect(updatedGallery.commonDescriptionText).toBe(newDescription);
        });
        
        test('should deny access to other user gallery', async () => {
            const otherUserGallery = await Gallery.create({
                name: 'Other User Gallery',
                owner: mockAdmin._id
            });
            
            await request(app)
                .put(`/galleries/${otherUserGallery._id}/state`)
                .send({ name: 'Hacked Name' })
                .expect(403);
        });
        
        test('should return 404 for non-existent gallery', async () => {
            const nonExistentId = new mongoose.Types.ObjectId();
            
            await request(app)
                .put(`/galleries/${nonExistentId}/state`)
                .send({ name: 'Test' })
                .expect(404);
        });
        
        test('should handle database errors gracefully', async () => {
            // Mock findByIdAndUpdate to throw an error
            const originalFindByIdAndUpdate = Gallery.findByIdAndUpdate;
            Gallery.findByIdAndUpdate = jest.fn().mockRejectedValue(new Error('Database error'));
            
            await request(app)
                .put(`/galleries/${testGallery._id}/state`)
                .send({ name: 'Test' })
                .expect(500);
            
            // Restore original method
            Gallery.findByIdAndUpdate = originalFindByIdAndUpdate;
        });
    });
    
    describe('DELETE /galleries/:galleryId - Delete Gallery', () => {
        let testGallery;
        let testImage;
        let testPublication;
        
        beforeEach(async () => {
            testGallery = await Gallery.create({
                name: 'Test Gallery to Delete',
                owner: mockUser._id
            });
            
            testImage = await Image.create({
                galleryId: testGallery._id,
                path: 'test/image.jpg',
                thumbnailPath: 'test/thumb.jpg',
                originalFilename: 'image.jpg'
            });
            
            testPublication = await Publication.create({
                galleryId: testGallery._id,
                letter: 'A',
                index: 0,
                images: [{ imageId: testImage._id, order: 0 }]
            });
        });
        
        test('should delete gallery and cascade related data', async () => {
            await request(app)
                .delete(`/galleries/${testGallery._id}`)
                .expect(200);
            
            // Verify gallery is deleted
            const deletedGallery = await Gallery.findById(testGallery._id);
            expect(deletedGallery).toBeNull();
            
            // Verify related data is deleted (due to cascade middleware)
            const relatedImages = await Image.find({ galleryId: testGallery._id });
            const relatedPublications = await Publication.find({ galleryId: testGallery._id });
            
            expect(relatedImages).toHaveLength(0);
            expect(relatedPublications).toHaveLength(0);
        });
        
        test('should deny deletion of other user gallery', async () => {
            const otherUserGallery = await Gallery.create({
                name: 'Other User Gallery',
                owner: mockAdmin._id
            });
            
            await request(app)
                .delete(`/galleries/${otherUserGallery._id}`)
                .expect(403);
            
            // Verify gallery still exists
            const stillExists = await Gallery.findById(otherUserGallery._id);
            expect(stillExists).toBeTruthy();
        });
        
        test('should return 404 for non-existent gallery', async () => {
            const nonExistentId = new mongoose.Types.ObjectId();
            
            await request(app)
                .delete(`/galleries/${nonExistentId}`)
                .expect(404);
        });
    });
    
    describe('Security Tests', () => {
        test('should prevent unauthorized access without token', async () => {
            const unauthenticatedApp = express();
            unauthenticatedApp.use(express.json());
            unauthenticatedApp.get('/galleries', galleryController.listGalleries);
            
            await request(unauthenticatedApp)
                .get('/galleries')
                .expect(401);
        });
        
        test('should prevent cross-user data access', async () => {
            const userAGallery = await Gallery.create({
                name: 'User A Gallery',
                owner: mockUser._id
            });
            
            const userBGallery = await Gallery.create({
                name: 'User B Gallery', 
                owner: mockAdmin._id
            });
            
            // User A should not see User B's gallery in list
            const response = await request(app)
                .get('/galleries')
                .expect(200);
            
            const galleryIds = response.body.map(g => g._id);
            expect(galleryIds).toContain(userAGallery._id.toString());
            expect(galleryIds).not.toContain(userBGallery._id.toString());
        });
        
        test('should validate MongoDB ObjectId format', async () => {
            await request(app)
                .get('/galleries/invalid-object-id')
                .expect(400);
        });
        
        test('should handle malicious input in gallery name', async () => {
            const maliciousPayloads = [
                '<script>alert("xss")</script>',
                '../../etc/passwd',
                '{"$ne": null}',
                'A'.repeat(10000) // Very long string
            ];
            
            for (const payload of maliciousPayloads) {
                // These should either be rejected or sanitized
                const response = await request(app)
                    .post('/galleries')
                    .send({ name: payload });
                
                if (response.status === 201) {
                    // If accepted, ensure it's sanitized
                    expect(response.body.name).not.toContain('<script>');
                    expect(response.body.name).not.toContain('$ne');
                }
            }
        });
    });
    
    describe('Performance Tests', () => {
        test('should handle large datasets efficiently', async () => {
            // Create gallery with many images
            const gallery = await Gallery.create({
                name: 'Large Gallery',
                owner: mockUser._id
            });
            
            // Create 100 test images
            const imagePromises = Array.from({ length: 100 }, (_, i) => 
                Image.create({
                    galleryId: gallery._id,
                    path: `test/image${i}.jpg`,
                    thumbnailPath: `test/thumb${i}.jpg`,
                    originalFilename: `image${i}.jpg`,
                    uploadDate: new Date()
                })
            );
            
            await Promise.all(imagePromises);
            
            const startTime = Date.now();
            
            const response = await request(app)
                .get(`/galleries/${gallery._id}?page=1&limit=20`)
                .expect(200);
            
            const endTime = Date.now();
            const responseTime = endTime - startTime;
            
            // Should respond within reasonable time (less than 2 seconds)
            expect(responseTime).toBeLessThan(2000);
            
            // Should return paginated results
            expect(response.body.images.docs).toHaveLength(20);
            expect(response.body.images.total).toBe(100);
            expect(response.body.images.totalPages).toBe(5);
        });
    });
});