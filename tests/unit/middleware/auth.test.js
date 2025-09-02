// ===============================
// File: tests/unit/middleware/auth.test.js
// Comprehensive tests for authentication middleware
// ===============================

const jwt = require('jsonwebtoken');
const authMiddleware = require('../../../middleware/auth');

describe('Authentication Middleware', () => {
    let req, res, next;
    const originalJWTSecret = process.env.JWT_SECRET;
    
    beforeEach(() => {
        // Setup mock request, response, and next function
        req = {
            cookies: {}
        };
        
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        
        next = jest.fn();
        
        // Ensure JWT_SECRET is set for tests
        process.env.JWT_SECRET = 'test-jwt-secret-key';
    });
    
    afterEach(() => {
        process.env.JWT_SECRET = originalJWTSecret;
        jest.clearAllMocks();
    });
    
    describe('Valid Token Scenarios', () => {
        test('should authenticate with valid token and set userData', () => {
            const payload = { userId: 'user123', googleId: 'google123' };
            const validToken = jwt.sign(payload, process.env.JWT_SECRET);
            
            req.cookies.token = validToken;
            
            authMiddleware(req, res, next);
            
            expect(next).toHaveBeenCalledWith();
            expect(req.userData).toEqual({
                userId: 'user123',
                googleId: 'google123'
            });
            expect(res.status).not.toHaveBeenCalled();
            expect(res.json).not.toHaveBeenCalled();
        });
        
        test('should handle token with additional claims', () => {
            const payload = { 
                userId: 'user123', 
                googleId: 'google123',
                role: 'admin',
                iat: Math.floor(Date.now() / 1000),
                exp: Math.floor(Date.now() / 1000) + 3600
            };
            const validToken = jwt.sign(payload, process.env.JWT_SECRET);
            
            req.cookies.token = validToken;
            
            authMiddleware(req, res, next);
            
            expect(next).toHaveBeenCalledWith();
            expect(req.userData.userId).toBe('user123');
            expect(req.userData.googleId).toBe('google123');
        });
        
        test('should handle token with minimum required claims', () => {
            const payload = { userId: 'user123', googleId: 'google123' };
            const validToken = jwt.sign(payload, process.env.JWT_SECRET);
            
            req.cookies.token = validToken;
            
            authMiddleware(req, res, next);
            
            expect(next).toHaveBeenCalledWith();
            expect(req.userData).toEqual(payload);
        });
    });
    
    describe('Invalid Token Scenarios', () => {
        test('should reject request when no token is provided', () => {
            // No token in cookies
            authMiddleware(req, res, next);
            
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                message: 'Authentification requise. Aucun token fourni.'
            });
            expect(next).not.toHaveBeenCalled();
            expect(req.userData).toBeUndefined();
        });
        
        test('should reject request with empty token', () => {
            req.cookies.token = '';
            
            authMiddleware(req, res, next);
            
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                message: 'Authentification requise. Aucun token fourni.'
            });
            expect(next).not.toHaveBeenCalled();
        });
        
        test('should reject request with null token', () => {
            req.cookies.token = null;
            
            authMiddleware(req, res, next);
            
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                message: 'Authentification requise. Aucun token fourni.'
            });
            expect(next).not.toHaveBeenCalled();
        });
        
        test('should reject request with malformed token', () => {
            req.cookies.token = 'invalid.token.format';
            
            authMiddleware(req, res, next);
            
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                message: 'Token invalide ou expiré.'
            });
            expect(next).not.toHaveBeenCalled();
            expect(req.userData).toBeUndefined();
        });
        
        test('should reject token with wrong secret', () => {
            const payload = { userId: 'user123', googleId: 'google123' };
            const tokenWithWrongSecret = jwt.sign(payload, 'wrong-secret');
            
            req.cookies.token = tokenWithWrongSecret;
            
            authMiddleware(req, res, next);
            
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                message: 'Token invalide ou expiré.'
            });
            expect(next).not.toHaveBeenCalled();
        });
        
        test('should reject expired token', () => {
            const payload = { 
                userId: 'user123', 
                googleId: 'google123',
                exp: Math.floor(Date.now() / 1000) - 3600 // Expired 1 hour ago
            };
            const expiredToken = jwt.sign(payload, process.env.JWT_SECRET);
            
            req.cookies.token = expiredToken;
            
            authMiddleware(req, res, next);
            
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                message: 'Token invalide ou expiré.'
            });
            expect(next).not.toHaveBeenCalled();
        });
        
        test('should reject token with invalid signature', () => {
            // Create a valid token and then modify it slightly
            const payload = { userId: 'user123', googleId: 'google123' };
            const validToken = jwt.sign(payload, process.env.JWT_SECRET);
            const tamperedToken = validToken.slice(0, -1) + 'X'; // Change last character
            
            req.cookies.token = tamperedToken;
            
            authMiddleware(req, res, next);
            
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                message: 'Token invalide ou expiré.'
            });
            expect(next).not.toHaveBeenCalled();
        });
    });
    
    describe('Security Edge Cases', () => {
        test('should handle token with missing required fields', () => {
            // Token missing userId
            const payload = { googleId: 'google123' };
            const invalidToken = jwt.sign(payload, process.env.JWT_SECRET);
            
            req.cookies.token = invalidToken;
            
            authMiddleware(req, res, next);
            
            // Should still pass but with incomplete userData
            expect(next).toHaveBeenCalledWith();
            expect(req.userData.userId).toBeUndefined();
            expect(req.userData.googleId).toBe('google123');
        });
        
        test('should handle token with malicious payload', () => {
            const maliciousPayload = { 
                userId: '<script>alert(\"xss\")</script>',
                googleId: 'google123',
                '__proto__': { isAdmin: true },
                'constructor': { prototype: { isAdmin: true } }
            };
            const maliciousToken = jwt.sign(maliciousPayload, process.env.JWT_SECRET);
            
            req.cookies.token = maliciousToken;
            
            authMiddleware(req, res, next);
            
            expect(next).toHaveBeenCalledWith();
            expect(req.userData.userId).toBe('<script>alert(\"xss\")</script>');
            expect(req.userData.googleId).toBe('google123');
            // Prototype pollution attempts should not affect the object
            expect(req.userData.__proto__).toBeUndefined();
            expect(req.userData.constructor).toBeUndefined();
        });
        
        test('should handle very large token payload', () => {
            const largePayload = { 
                userId: 'user123',
                googleId: 'google123',
                largeData: 'A'.repeat(1000) // Reduced size to 1KB for practical testing
            };
            const largeToken = jwt.sign(largePayload, process.env.JWT_SECRET);
            
            req.cookies.token = largeToken;
            
            authMiddleware(req, res, next);
            
            expect(next).toHaveBeenCalledWith();
            expect(req.userData.userId).toBe('user123');
            expect(req.userData.largeData).toBe('A'.repeat(1000));
        });
        
        test('should handle token with special characters in values', () => {
            const specialPayload = { 
                userId: 'user-123_test@domain.com',
                googleId: 'google/123+test=user'
            };
            const specialToken = jwt.sign(specialPayload, process.env.JWT_SECRET);
            
            req.cookies.token = specialToken;
            
            authMiddleware(req, res, next);
            
            expect(next).toHaveBeenCalledWith();
            expect(req.userData.userId).toBe('user-123_test@domain.com');
            expect(req.userData.googleId).toBe('google/123+test=user');
        });
    });
    
    describe('Environment and Configuration Tests', () => {
        test('should handle missing JWT_SECRET environment variable', () => {
            delete process.env.JWT_SECRET;
            
            const payload = { userId: 'user123', googleId: 'google123' };
            const token = jwt.sign(payload, 'some-secret');
            
            req.cookies.token = token;
            
            authMiddleware(req, res, next);
            
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                message: 'Token invalide ou expiré.'
            });
            expect(next).not.toHaveBeenCalled();
        });
        
        test('should handle empty JWT_SECRET environment variable', () => {
            process.env.JWT_SECRET = '';
            
            const payload = { userId: 'user123', googleId: 'google123' };
            const token = jwt.sign(payload, 'some-secret');
            
            req.cookies.token = token;
            
            authMiddleware(req, res, next);
            
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                message: 'Token invalide ou expiré.'
            });
            expect(next).not.toHaveBeenCalled();
        });
    });
    
    describe('Performance Tests', () => {
        test('should handle token verification efficiently', () => {
            const payload = { userId: 'user123', googleId: 'google123' };
            const validToken = jwt.sign(payload, process.env.JWT_SECRET);
            
            req.cookies.token = validToken;
            
            const startTime = process.hrtime.bigint();
            
            authMiddleware(req, res, next);
            
            const endTime = process.hrtime.bigint();
            const executionTime = Number(endTime - startTime) / 1000000; // Convert to milliseconds
            
            // JWT verification should be very fast (less than 10ms)
            expect(executionTime).toBeLessThan(10);
            expect(next).toHaveBeenCalledWith();
        });
        
        test('should handle multiple rapid authentications', () => {
            const payload = { userId: 'user123', googleId: 'google123' };
            const validToken = jwt.sign(payload, process.env.JWT_SECRET);
            
            const iterations = 100;
            const startTime = process.hrtime.bigint();
            
            for (let i = 0; i < iterations; i++) {
                const testReq = { cookies: { token: validToken } };
                const testRes = {
                    status: jest.fn().mockReturnThis(),
                    json: jest.fn()
                };
                const testNext = jest.fn();
                
                authMiddleware(testReq, testRes, testNext);
                expect(testNext).toHaveBeenCalledWith();
            }
            
            const endTime = process.hrtime.bigint();
            const totalTime = Number(endTime - startTime) / 1000000; // Convert to milliseconds
            const averageTime = totalTime / iterations;
            
            // Average time per authentication should be very fast
            expect(averageTime).toBeLessThan(1); // Less than 1ms per auth
        });
    });
    
    describe('Integration with Real JWT Library', () => {
        test('should work with different JWT algorithms', () => {
            const algorithms = ['HS256', 'HS384', 'HS512'];
            
            algorithms.forEach(algorithm => {
                const payload = { userId: 'user123', googleId: 'google123' };
                const token = jwt.sign(payload, process.env.JWT_SECRET, { algorithm });
                
                req.cookies.token = token;
                
                authMiddleware(req, res, next);
                
                expect(next).toHaveBeenCalledWith();
                expect(req.userData.userId).toBe('user123');
                
                // Reset mocks for next iteration
                jest.clearAllMocks();
            });
        });
        
        test('should handle token with custom issuer', () => {
            const payload = { 
                userId: 'user123', 
                googleId: 'google123',
                iss: 'publication-organizer-app'
            };
            const token = jwt.sign(payload, process.env.JWT_SECRET);
            
            req.cookies.token = token;
            
            authMiddleware(req, res, next);
            
            expect(next).toHaveBeenCalledWith();
            expect(req.userData.userId).toBe('user123');
        });
        
        test('should handle token with custom audience', () => {
            const payload = { 
                userId: 'user123', 
                googleId: 'google123',
                aud: 'publication-organizer-users'
            };
            const token = jwt.sign(payload, process.env.JWT_SECRET);
            
            req.cookies.token = token;
            
            authMiddleware(req, res, next);
            
            expect(next).toHaveBeenCalledWith();
            expect(req.userData.userId).toBe('user123');
        });
    });
});