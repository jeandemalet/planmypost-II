// ===============================
// File: tests/setup.js
// Jest setup and configuration
// ===============================

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const path = require('path');

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key';
process.env.SESSION_SECRET = 'test-session-secret-key';
process.env.LOG_LEVEL = 'error'; // Suppress logs during tests

// Mock localStorage for frontend tests
if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', {
        value: {
            storage: {},
            getItem: function(key) {
                return this.storage[key] || null;
            },
            setItem: function(key, value) {
                this.storage[key] = value;
            },
            removeItem: function(key) {
                delete this.storage[key];
            },
            clear: function() {
                this.storage = {};
            }
        },
        writable: true
    });
} else {
    // For Node.js environment
    global.localStorage = {
        storage: {},
        getItem: function(key) {
            return this.storage[key] || null;
        },
        setItem: function(key, value) {
            this.storage[key] = value;
        },
        removeItem: function(key) {
            delete this.storage[key];
        },
        clear: function() {
            this.storage = {};
        }
    };
}

// Mock performance API for frontend tests
if (typeof performance === 'undefined') {
    global.performance = {
        now: function() {
            return Date.now();
        }
    };
}

// Global test utilities
global.testUtils = {
    // Database utilities
    async connectToDatabase() {
        if (!global.mongoServer) {
            global.mongoServer = await MongoMemoryServer.create();
        }
        
        const uri = global.mongoServer.getUri();
        process.env.MONGODB_URI = uri;
        
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(uri);
        }
        
        return uri;
    },
    
    async disconnectDatabase() {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
        
        if (global.mongoServer) {
            await global.mongoServer.stop();
            global.mongoServer = null;
        }
    },
    
    async clearDatabase() {
        if (mongoose.connection.readyState !== 0) {
            const collections = mongoose.connection.collections;
            
            for (const key in collections) {
                const collection = collections[key];
                await collection.deleteMany({});
            }
        }
    },
    
    // Test data factories
    createTestUser(overrides = {}) {
        return {
            email: 'test@example.com',
            name: 'Test User',
            googleId: 'test-google-id',
            ...overrides
        };
    },
    
    createTestGallery(overrides = {}) {
        return {
            name: 'Test Gallery',
            commonDescriptionText: 'Test common description',
            currentThumbSize: { width: 200, height: 200 },
            sortOption: 'name_asc',
            activeTab: 'currentGallery',
            nextPublicationIndex: 0,
            ...overrides
        };
    },
    
    createTestImage(overrides = {}) {
        return {
            originalFilename: 'test-image.jpg',
            path: 'test-gallery/test-image.jpg',
            thumbnailPath: 'test-gallery/thumb-test-image.jpg',
            fileSize: 1024000,
            dimensions: { width: 1920, height: 1080 },
            mimeType: 'image/jpeg',
            uploadDate: new Date(),
            ...overrides
        };
    },
    
    createTestPublication(overrides = {}) {
        return {
            letter: 'A',
            index: 0,
            images: [],
            descriptionText: 'Test publication description',
            autoCropSettings: { vertical: 'none', horizontal: 'none' },
            ...overrides
        };
    },
    
    createTestSchedule(overrides = {}) {
        return {
            date: '2025-01-01',
            publicationLetter: 'A',
            ...overrides
        };
    },
    
    // Authentication utilities
    createMockAuthMiddleware(userData = null) {
        return (req, res, next) => {
            req.userData = userData || { userId: 'test-user-id' };
            next();
        };
    },
    
    createMockJWT(payload = {}) {
        const jwt = require('jsonwebtoken');
        return jwt.sign(
            { userId: 'test-user-id', ...payload },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );
    },
    
    // HTTP utilities
    createTestRequest() {
        return {
            body: {},
            params: {},
            query: {},
            headers: {},
            cookies: {},
            userData: { userId: 'test-user-id' }
        };
    },
    
    createTestResponse() {
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis(),
            send: jest.fn().mockReturnThis(),
            redirect: jest.fn().mockReturnThis(),
            cookie: jest.fn().mockReturnThis(),
            clearCookie: jest.fn().mockReturnThis(),
            setHeader: jest.fn().mockReturnThis()
        };
        return res;
    },
    
    // Security test utilities
    createMaliciousPayloads() {
        return {
            xss: [
                '<script>alert("xss")</script>',
                'javascript:alert("xss")',
                '<img src="x" onerror="alert(\'xss\')">'
            ],
            sqlInjection: [
                "'; DROP TABLE users; --",
                "1' OR '1'='1",
                "admin'--",
                "' UNION SELECT NULL--"
            ],
            pathTraversal: [
                '../../../etc/passwd',
                '..\\..\\..\\windows\\system32\\config\\sam',
                '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd'
            ],
            oversizedData: {
                string: 'A'.repeat(10000000), // 10MB string
                array: new Array(100000).fill('test'),
                object: Object.fromEntries(
                    Array.from({ length: 10000 }, (_, i) => [`key${i}`, `value${i}`])
                )
            }
        };
    },
    
    // File system utilities
    createMockFile(overrides = {}) {
        return {
            fieldname: 'image',
            originalname: 'test-image.jpg',
            encoding: '7bit',
            mimetype: 'image/jpeg',
            size: 1024000,
            destination: '/tmp/uploads',
            filename: 'test-image-123.jpg',
            path: '/tmp/uploads/test-image-123.jpg',
            buffer: Buffer.from('fake-image-data'),
            ...overrides
        };
    },
    
    // Validation utilities
    async expectValidationError(promise, expectedField = null) {
        await expect(promise).rejects.toThrow();
        
        try {
            await promise;
        } catch (error) {
            if (expectedField && error.errors) {
                expect(error.errors).toHaveProperty(expectedField);
            }
            return error;
        }
    },
    
    // Performance utilities
    async measureExecutionTime(fn) {
        const start = process.hrtime.bigint();
        const result = await fn();
        const end = process.hrtime.bigint();
        const executionTime = Number(end - start) / 1000000; // Convert to milliseconds
        
        return {
            result,
            executionTime
        };
    }
};

// Global test hooks
beforeAll(async () => {
    // Connect to test database
    await global.testUtils.connectToDatabase();
});

afterAll(async () => {
    // Disconnect from test database
    await global.testUtils.disconnectDatabase();
});

beforeEach(async () => {
    // Clear database before each test
    await global.testUtils.clearDatabase();
});

// Global error handling for tests
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection in test:', reason);
});

// Suppress console output during tests unless explicitly needed
if (!process.env.VERBOSE_TESTS) {
    global.console = {
        ...console,
        log: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn()
    };
}

// Export for direct imports
module.exports = global.testUtils;