// ===============================
// File: tests/unit/middleware/validation.test.js
// Comprehensive tests for validation middleware
// ===============================

const request = require('supertest');
const express = require('express');
const {
    validateGalleryCreation,
    validateGalleryStateUpdate,
    validateGalleryId,
    validatePublicationCreation,
    validatePublicationUpdate,
    validateImageId,
    validateCropData,
    validateScheduleUpdate,
    validateUserId,
    validateImpersonation,
    validatePagination,
    handleValidationErrors
} = require('../../../middleware/validation');

describe('Validation Middleware', () => {
    let app;
    
    beforeEach(() => {
        app = express();
        app.use(express.json());
    });
    
    describe('Gallery Validation', () => {
        beforeEach(() => {
            app.post('/test/gallery', validateGalleryCreation, (req, res) => {
                res.json({ success: true, body: req.body });
            });
            
            app.put('/test/gallery/:galleryId/state', validateGalleryStateUpdate, (req, res) => {
                res.json({ success: true, body: req.body, params: req.params });
            });
            
            app.get('/test/gallery/:galleryId', validateGalleryId, (req, res) => {
                res.json({ success: true, params: req.params });
            });
        });
        
        describe('validateGalleryCreation', () => {
            test('should accept valid gallery name', async () => {
                const response = await request(app)
                    .post('/test/gallery')
                    .send({ name: 'Valid Gallery Name' })
                    .expect(200);
                
                expect(response.body.success).toBe(true);
                expect(response.body.body.name).toBe('Valid Gallery Name');
            });
            
            test('should trim whitespace from gallery name', async () => {
                const response = await request(app)
                    .post('/test/gallery')
                    .send({ name: '  Gallery With Spaces  ' })
                    .expect(200);
                
                expect(response.body.body.name).toBe('Gallery With Spaces');
            });
            
            test('should reject empty gallery name', async () => {
                const response = await request(app)
                    .post('/test/gallery')
                    .send({ name: '' })
                    .expect(400);
                
                expect(response.body.error).toBe('Données invalides');
                expect(response.body.details).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            path: 'name',
                            msg: expect.stringContaining('entre 1 et 100 caractères')
                        })
                    ])
                );
            });
            
            test('should reject gallery name that is too long', async () => {
                const longName = 'A'.repeat(101);
                
                const response = await request(app)
                    .post('/test/gallery')
                    .send({ name: longName })
                    .expect(400);
                
                expect(response.body.details).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            path: 'name',
                            msg: expect.stringContaining('entre 1 et 100 caractères')
                        })
                    ])
                );
            });
            
            test('should sanitize HTML in gallery name', async () => {
                const response = await request(app)
                    .post('/test/gallery')
                    .send({ name: '<script>alert("xss")</script>Gallery' })
                    .expect(200);
                
                // Should be escaped
                expect(response.body.body.name).not.toContain('<script>');
                expect(response.body.body.name).toContain('&lt;');
            });
        });
        
        describe('validateGalleryStateUpdate', () => {
            const validGalleryId = '507f1f77bcf86cd799439011';
            
            test('should accept valid gallery state update', async () => {
                const updateData = {
                    name: 'Updated Gallery',
                    currentThumbSize: { width: 300, height: 300 },
                    sortOption: 'date_desc',
                    activeTab: 'currentGallery',
                    nextPublicationIndex: 5,
                    commonDescriptionText: 'Updated description'
                };
                
                const response = await request(app)
                    .put(`/test/gallery/${validGalleryId}/state`)
                    .send(updateData)
                    .expect(200);
                
                expect(response.body.success).toBe(true);
                expect(response.body.body.name).toBe('Updated Gallery');
            });
            
            test('should validate thumbnail size ranges', async () => {
                const invalidSizes = [
                    { width: 49, height: 200 }, // Too small
                    { width: 1001, height: 200 }, // Too large
                    { width: 200, height: 49 }, // Too small
                    { width: 200, height: 1001 } // Too large
                ];
                
                for (const invalidSize of invalidSizes) {
                    await request(app)
                        .put(`/test/gallery/${validGalleryId}/state`)
                        .send({ currentThumbSize: invalidSize })
                        .expect(400);
                }
            });
            
            test('should validate sort options', async () => {
                const validOptions = ['date_asc', 'date_desc', 'name_asc', 'name_desc', 'size_asc', 'size_desc'];
                const invalidOptions = ['invalid_sort', 'date_invalid', 'name_unknown'];
                
                // Test valid options
                for (const option of validOptions) {
                    await request(app)
                        .put(`/test/gallery/${validGalleryId}/state`)
                        .send({ sortOption: option })
                        .expect(200);
                }
                
                // Test invalid options
                for (const option of invalidOptions) {
                    await request(app)
                        .put(`/test/gallery/${validGalleryId}/state`)
                        .send({ sortOption: option })
                        .expect(400);
                }
            });
            
            test('should validate active tab options', async () => {
                // CORRECTED: Use the actual tab values from the HTML
                const validTabs = ['galleries', 'currentGallery', 'cropping', 'description', 'calendar'];
                const invalidTabs = ['admin', 'secret', 'unknown', 'images', 'publications', 'settings'];
                
                // Test valid tabs
                for (const tab of validTabs) {
                    await request(app)
                        .put(`/test/gallery/${validGalleryId}/state`)
                        .send({ activeTab: tab })
                        .expect(200);
                }
                
                // Test invalid tabs
                for (const tab of invalidTabs) {
                    await request(app)
                        .put(`/test/gallery/${validGalleryId}/state`)
                        .send({ activeTab: tab })
                        .expect(400);
                }
            });
            
            test('should validate nextPublicationIndex range', async () => {
                const validIndexes = [0, 12, 25];
                const invalidIndexes = [-1, 26, 100];
                
                // Test valid indexes
                for (const index of validIndexes) {
                    await request(app)
                        .put(`/test/gallery/${validGalleryId}/state`)
                        .send({ nextPublicationIndex: index })
                        .expect(200);
                }
                
                // Test invalid indexes
                for (const index of invalidIndexes) {
                    await request(app)
                        .put(`/test/gallery/${validGalleryId}/state`)
                        .send({ nextPublicationIndex: index })
                        .expect(400);
                }
            });
            
            test('should validate description length', async () => {
                const validDescription = 'A'.repeat(5000); // Max length
                const invalidDescription = 'A'.repeat(5001); // Too long
                
                await request(app)
                    .put(`/test/gallery/${validGalleryId}/state`)
                    .send({ commonDescriptionText: validDescription })
                    .expect(200);
                
                await request(app)
                    .put(`/test/gallery/${validGalleryId}/state`)
                    .send({ commonDescriptionText: invalidDescription })
                    .expect(400);
            });
            
            test('should prevent modification of protected fields', async () => {
                const protectedFields = {
                    owner: 'new-owner-id',
                    _id: 'new-id',
                    createdAt: new Date(),
                    __v: 1
                };
                
                const response = await request(app)
                    .put(`/test/gallery/${validGalleryId}/state`)
                    .send(protectedFields)
                    .expect(400);
                
                expect(response.body.details.length).toBeGreaterThan(0);
            });
            
            test('should reject invalid gallery ID format', async () => {
                const invalidIds = ['invalid-id', '123', 'not-object-id'];
                
                for (const invalidId of invalidIds) {
                    await request(app)
                        .put(`/test/gallery/${invalidId}/state`)
                        .send({ name: 'Test' })
                        .expect(400);
                }
            });
        });
        
        describe('validateGalleryId', () => {
            test('should accept valid MongoDB ObjectId', async () => {
                const validId = '507f1f77bcf86cd799439011';
                
                await request(app)
                    .get(`/test/gallery/${validId}`)
                    .expect(200);
            });
            
            test('should reject invalid ObjectId formats', async () => {
                const invalidIds = [
                    'invalid-id',
                    '123',
                    'not-an-object-id',
                    '',
                    'g07f1f77bcf86cd799439011' // Invalid character
                ];
                
                for (const invalidId of invalidIds) {
                    await request(app)
                        .get(`/test/gallery/${invalidId}`)
                        .expect(400);
                }
            });
        });
    });
    
    describe('Publication Validation', () => {
        beforeEach(() => {
            app.post('/test/gallery/:galleryId/publication', validatePublicationCreation, (req, res) => {
                res.json({ success: true, body: req.body, params: req.params });
            });
            
            app.put('/test/gallery/:galleryId/publication/:publicationId', validatePublicationUpdate, (req, res) => {
                res.json({ success: true, body: req.body, params: req.params });
            });
        });
        
        describe('validatePublicationCreation', () => {
            const validGalleryId = '507f1f77bcf86cd799439011';
            
            test('should accept empty body for publication creation', async () => {
                // CORRECTION: La création de publication ne nécessite plus de données dans le body
                // car la lettre et l'index sont générés automatiquement par le serveur
                const response = await request(app)
                    .post(`/test/gallery/${validGalleryId}/publication`)
                    .send({}) // Corps vide, comme dans la vraie application
                    .expect(200);
                
                expect(response.body.success).toBe(true);
            });
            
            test('should accept publication creation with optional data', async () => {
                // Les données optionnelles peuvent toujours être envoyées mais ne sont pas requises
                const response = await request(app)
                    .post(`/test/gallery/${validGalleryId}/publication`)
                    .send({
                        // Aucune donnée requise - le serveur génère tout automatiquement
                    })
                    .expect(200);
                
                expect(response.body.success).toBe(true);
            });
            
            // SUPPRIMÉ: Les tests de validation de letter et index car ces champs
            // ne sont plus validés lors de la création (ils sont auto-générés)
                }
            });
            
            test('should validate description length', async () => {
                const validDescription = 'A'.repeat(5000);
                const invalidDescription = 'A'.repeat(5001);
                
                await request(app)
                    .post(`/test/gallery/${validGalleryId}/publication`)
                    .send({
                        letter: 'A',
                        index: 0,
                        descriptionText: validDescription
                    })
                    .expect(200);
                
                await request(app)
                    .post(`/test/gallery/${validGalleryId}/publication`)
                    .send({
                        letter: 'A',
                        index: 0,
                        descriptionText: invalidDescription
                    })
                    .expect(400);
            });
        });
        
        describe('validatePublicationUpdate', () => {
            const validGalleryId = '507f1f77bcf86cd799439011';
            const validPublicationId = '507f1f77bcf86cd799439012';
            
            test('should accept valid publication update', async () => {
                const response = await request(app)
                    .put(`/test/gallery/${validGalleryId}/publication/${validPublicationId}`)
                    .send({
                        letter: 'B',
                        index: 1,
                        descriptionText: 'Updated description',
                        images: [
                            { imageId: '507f1f77bcf86cd799439013', order: 0 },
                            { imageId: '507f1f77bcf86cd799439014', order: 1 }
                        ]
                    })
                    .expect(200);
                
                expect(response.body.success).toBe(true);
            });
            
            test('should validate images array structure', async () => {
                const validImages = [
                    { imageId: '507f1f77bcf86cd799439013', order: 0 },
                    { imageId: '507f1f77bcf86cd799439014', order: 1 }
                ];
                
                await request(app)
                    .put(`/test/gallery/${validGalleryId}/publication/${validPublicationId}`)
                    .send({ images: validImages })
                    .expect(200);
            });
            
            test('should reject invalid image IDs in images array', async () => {
                const invalidImages = [
                    { imageId: 'invalid-id', order: 0 }
                ];
                
                await request(app)
                    .put(`/test/gallery/${validGalleryId}/publication/${validPublicationId}`)
                    .send({ images: invalidImages })
                    .expect(400);
            });
            
            test('should reject negative order values', async () => {
                const invalidImages = [
                    { imageId: '507f1f77bcf86cd799439013', order: -1 }
                ];
                
                await request(app)
                    .put(`/test/gallery/${validGalleryId}/publication/${validPublicationId}`)
                    .send({ images: invalidImages })
                    .expect(400);
            });
        });
    });
    
    describe('Image Validation', () => {
        beforeEach(() => {
            app.get('/test/gallery/:galleryId/image/:imageId', validateImageId, (req, res) => {
                res.json({ success: true, params: req.params });
            });
            
            app.post('/test/gallery/:galleryId/crop/:originalImageId', validateCropData, (req, res) => {
                res.json({ success: true, body: req.body, params: req.params });
            });
        });
        
        describe('validateImageId', () => {
            const validGalleryId = '507f1f77bcf86cd799439011';
            const validImageId = '507f1f77bcf86cd799439012';
            
            test('should accept valid gallery and image IDs', async () => {
                await request(app)
                    .get(`/test/gallery/${validGalleryId}/image/${validImageId}`)
                    .expect(200);
            });
            
            test('should reject invalid gallery ID', async () => {
                await request(app)
                    .get(`/test/gallery/invalid-id/image/${validImageId}`)
                    .expect(400);
            });
            
            test('should reject invalid image ID', async () => {
                await request(app)
                    .get(`/test/gallery/${validGalleryId}/image/invalid-id`)
                    .expect(400);
            });
        });
        
        describe('validateCropData', () => {
            const validGalleryId = '507f1f77bcf86cd799439011';
            const validImageId = '507f1f77bcf86cd799439012';
            
            test('should accept valid crop data', async () => {
                const response = await request(app)
                    .post(`/test/gallery/${validGalleryId}/crop/${validImageId}`)
                    .send({
                        cropType: 'barres_4x5',
                        x: 10.5,
                        y: 20.5,
                        width: 100.0,
                        height: 150.0
                    })
                    .expect(200);
                
                expect(response.body.success).toBe(true);
            });
            
            test('should validate crop type options', async () => {
                const validTypes = ['barres_4x5', 'barres_1x1', 'split_gauche', 'split_droite'];
                const invalidTypes = ['invalid_type', 'custom_crop', ''];
                
                // Test valid types
                for (const cropType of validTypes) {
                    await request(app)
                        .post(`/test/gallery/${validGalleryId}/crop/${validImageId}`)
                        .send({
                            cropType,
                            x: 0,
                            y: 0,
                            width: 100,
                            height: 100
                        })
                        .expect(200);
                }
                
                // Test invalid types
                for (const cropType of invalidTypes) {
                    await request(app)
                        .post(`/test/gallery/${validGalleryId}/crop/${validImageId}`)
                        .send({
                            cropType,
                            x: 0,
                            y: 0,
                            width: 100,
                            height: 100
                        })
                        .expect(400);
                }
            });
            
            test('should validate coordinate ranges', async () => {
                const invalidCoordinates = [
                    { x: -1, y: 0, width: 100, height: 100 }, // Negative x
                    { x: 0, y: -1, width: 100, height: 100 }, // Negative y
                    { x: 0, y: 0, width: 0, height: 100 },    // Zero width
                    { x: 0, y: 0, width: 100, height: 0 }     // Zero height
                ];
                
                for (const coords of invalidCoordinates) {
                    await request(app)
                        .post(`/test/gallery/${validGalleryId}/crop/${validImageId}`)
                        .send({
                            cropType: 'barres_4x5',
                            ...coords
                        })
                        .expect(400);
                }
            });
        });
    });
    
    describe('Pagination Validation', () => {
        beforeEach(() => {
            app.get('/test/paginated', validatePagination, (req, res) => {
                res.json({ success: true, query: req.query });
            });
        });
        
        test('should accept valid pagination parameters', async () => {
            const response = await request(app)
                .get('/test/paginated?page=1&limit=20')
                .expect(200);
            
            expect(response.body.success).toBe(true);
        });
        
        test('should accept missing pagination parameters', async () => {
            await request(app)
                .get('/test/paginated')
                .expect(200);
        });
        
        test('should validate page number', async () => {
            const invalidPages = ['0', '-1', 'abc', '1.5'];
            
            for (const page of invalidPages) {
                await request(app)
                    .get(`/test/paginated?page=${page}`)
                    .expect(400);
            }
        });
        
        test('should validate limit range', async () => {
            const invalidLimits = ['0', '101', '-1', 'abc'];
            
            for (const limit of invalidLimits) {
                await request(app)
                    .get(`/test/paginated?limit=${limit}`)
                    .expect(400);
            }
        });
    });
    
    describe('Security Tests', () => {
        beforeEach(() => {
            app.post('/test/security', validateGalleryCreation, (req, res) => {
                res.json({ success: true, body: req.body });
            });
        });
        
        test('should handle malicious input attempts', async () => {
            const maliciousInputs = [
                '<script>alert("xss")</script>',
                '../../etc/passwd',
                '{"$ne": null}',
                'javascript:alert(1)',
                '<img src="x" onerror="alert(1)">'
            ];
            
            for (const input of maliciousInputs) {
                const response = await request(app)
                    .post('/test/security')
                    .send({ name: input });
                
                if (response.status === 200) {
                    // If accepted, ensure it's properly escaped
                    expect(response.body.body.name).not.toContain('<script>');
                    expect(response.body.body.name).not.toContain('javascript:');
                } else {
                    expect(response.status).toBe(400);
                }
            }
        });
        
        test('should handle oversized payloads', async () => {
            const oversizedName = 'A'.repeat(10000);
            
            await request(app)
                .post('/test/security')
                .send({ name: oversizedName })
                .expect(400);
        });
    });
});