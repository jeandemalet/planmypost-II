# 🔒 Security & Performance Guide

This document outlines all the security and performance improvements implemented in the Publication Organizer application.

## 📋 Table of Contents

- [Security Features](#security-features)
- [Performance Optimizations](#performance-optimizations)
- [Environment Configuration](#environment-configuration)
- [Deployment Guidelines](#deployment-guidelines)
- [Monitoring & Maintenance](#monitoring--maintenance)
- [API Optimizations](#api-optimizations)
- [Automated Security](#automated-security)

## 🛡️ Security Features

### 1. Comprehensive Input Validation & Sanitization
**Implementation**: `middleware/validation.js`

- **Express-Validator**: Comprehensive input validation for all API routes
- **Sanitization**: Automatic escaping and trimming of user inputs
- **Type Validation**: Strict validation of data types, formats, and constraints
- **Custom Validators**: Business logic validation (e.g., MongoDB ObjectId format)
- **Gallery State Protection**: Enhanced validation for the `PUT /galleries/:galleryId/state` endpoint

```javascript
// Example: Enhanced gallery state validation
const validateGalleryStateUpdate = [
    param('galleryId').isMongoId().withMessage('Invalid gallery ID'),
    body('name').optional().trim().isLength({ min: 1, max: 100 }).escape(),
    body('currentThumbSize.width').optional().isInt({ min: 50, max: 1000 }),
    body('sortOption').optional().isIn(['date_asc', 'date_desc', 'name_asc', 'name_desc']),
    // Prevent modification of sensitive fields
    body('owner').not().exists().withMessage('Owner cannot be modified'),
    handleValidationErrors
];
```

### 2. Enhanced CORS Security
**Implementation**: `server.js` with environment-aware configuration

- **Production Restrictions**: Strict origin validation for production environments
- **Development Flexibility**: Permissive settings for local development
- **Environment Variables**: Configurable allowed origins via `FRONTEND_URL` and `ADMIN_URL`
- **Security Headers**: Comprehensive allowed headers and methods specification

```javascript
// Production-ready CORS configuration
const corsOptions = {
    origin: function (origin, callback) {
        if (process.env.NODE_ENV === 'production') {
            const allowedOrigins = [process.env.FRONTEND_URL, process.env.ADMIN_URL].filter(Boolean);
            if (allowedOrigins.indexOf(origin) !== -1) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        } else {
            callback(null, true); // Allow all in development
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
};
```

### 3. Automated Security Auditing
**Implementation**: `scripts/security-check.js` and GitHub Actions

- **Automated Dependency Audits**: Regular npm audit checks
- **Environment Security Validation**: Detection of weak secrets and missing variables
- **File Permission Checks**: Basic security assessment of sensitive files
- **Continuous Integration**: Automated security checks on every PR and push
- **Weekly Security Scans**: Scheduled vulnerability assessments

**Available Scripts:**
```bash
npm run security:check      # Comprehensive security audit
npm run security:report     # Generate detailed security reports
npm run security:update     # Update dependencies and fix vulnerabilities
```

### 4. Security Headers (Helmet)
**Implementation**: Updated Helmet configuration with CSP

- **Content Security Policy**: Restrictive CSP allowing only trusted domains
- **XSS Protection**: Multiple layers of XSS prevention
- **Clickjacking Protection**: X-Frame-Options and frame-ancestors
- **MIME Sniffing Protection**: X-Content-Type-Options header
- **Google Sign-In Compatible**: CSP configured for Google authentication

### 5. Rate Limiting & CSRF Protection
**Implementation**: Multi-tier rate limiting with CSRF tokens

- **Global API Limits**: 500 requests per 15 minutes
- **Authentication Limits**: 10 login attempts per 15 minutes
- **Upload Limits**: 50 uploads per hour
- **CSRF Tokens**: Required for all state-changing operations
- **Session-based Protection**: Secure session management

## ⚡ Performance Optimizations

### 1. API Endpoint Optimization
**Major Enhancement**: Paginated and lazy-loaded data

#### Gallery Details Endpoint (`GET /galleries/:galleryId`)
- **Conditional Loading**: Use `?loadFullData=true` for calendar data
- **Image Pagination**: Built-in pagination with configurable limits
- **Selective Data Loading**: Only load necessary data for current view
- **Database Query Optimization**: `.lean()` and `.select()` for faster queries

```javascript
// Optimized pagination response
{
  "galleryState": { /* gallery info */ },
  "images": {
    "docs": [ /* image array */ ],
    "total": 1250,
    "limit": 50,
    "page": 1,
    "totalPages": 25,
    "hasNextPage": true,
    "hasPrevPage": false
  },
  "jours": [ /* publications */ ]
  // Calendar data only loaded when needed
}
```

#### New Performance Endpoints
- **`GET /galleries/:galleryId/images/paginated`**: Dedicated image pagination
- **`GET /galleries/:galleryId/calendar-data`**: On-demand calendar data loading
- **Month/Year Filtering**: Reduce calendar data by date ranges

### 2. Database Query Optimization
**Implementation**: Enhanced Mongoose usage

- **Lean Queries**: Return plain JavaScript objects for read operations
- **Field Selection**: Only fetch required fields with `.select()`
- **Parallel Execution**: Use `Promise.all()` for independent queries
- **Background Updates**: Non-blocking `lastAccessed` updates
- **Index Optimization**: Proper indexing on frequently queried fields

### 3. Enhanced Caching Strategy
**Implementation**: Improved cache middleware

- **Endpoint-Specific TTL**: Different cache durations per resource type
- **User-Scoped Caching**: Cache keys include user context
- **Automatic Invalidation**: Smart cache clearing on data modifications
- **Cache Statistics**: Monitor cache hit ratios via `/api/cache/stats`

### 4. Image Processing Optimization
**Implementation**: Worker threads and progressive loading

- **Worker Thread Processing**: Non-blocking image operations
- **Thumbnail Generation**: Optimized sharp usage
- **Progressive Loading**: Lazy loading for gallery views
- **Memory Management**: Efficient handling of large image sets

## 🚀 Deployment Optimizations

### 1. Zero-Downtime Deployments
**Implementation**: Enhanced GitHub Actions workflow

- **PM2 Graceful Reload**: No service interruption during updates
- **Health Checks**: Automated verification of deployment success
- **Rollback Capability**: Automatic rollback on deployment failure
- **Environment Validation**: Pre-deployment configuration checks
- **Dependency Management**: Smart dependency installation

### 2. Local Deployment Tools
**Implementation**: `scripts/deploy.js`

```bash
npm run deploy:dev      # Development deployment
npm run deploy:prod     # Production deployment
npm run deploy:test     # Quick deployment (skip tests)
```

**Features:**
- Pre-deployment validation
- Security checks integration
- Health monitoring
- Deployment reporting
- Cleanup automation

## 🔍 Monitoring & Maintenance

### 1. Security Monitoring
**Automated Checks:**
- Weekly dependency vulnerability scans
- Environment security validation
- File permission monitoring
- API security assessment

### 2. Performance Monitoring
**Available Metrics:**
- Cache hit ratios: Check `/api/cache/stats`
- Database query performance
- API response times
- Memory usage patterns

### 3. Deployment Monitoring
**GitHub Actions Integration:**
- Automated security reports on PRs
- Deployment success/failure notifications
- Performance regression detection
- Dependency review automation

## 📚 Configuration Reference

### Environment Variables
```bash
# Security Configuration
JWT_SECRET=<32+ character secret>
SESSION_SECRET=<32+ character secret>
FRONTEND_URL=https://your-frontend-domain.com  # Production only
ADMIN_URL=https://admin.your-domain.com        # Optional

# Performance Configuration
RATE_LIMIT_WINDOW=15      # minutes
RATE_LIMIT_MAX=500        # requests per window
MAX_FILE_SIZE=50          # MB

# Database & Core
MONGODB_URI=mongodb://...
GOOGLE_CLIENT_ID=...
PORT=3000
NODE_ENV=production
```

### Performance Tuning
```javascript
// Cache TTL Configuration (middleware/cache.js)
const galleryCacheMiddleware = cacheMiddleware(1800); // 30 minutes
const imageCacheMiddleware = cacheMiddleware(900);    // 15 minutes
const scheduleCacheMiddleware = cacheMiddleware(600); // 10 minutes

// Pagination Limits
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
```

## 🛠️ Development Workflow

### Pre-commit Checks
```bash
npm run security:check    # Run before committing
npm run audit:security    # Check for vulnerabilities
```

### Deployment Process
1. **Local Testing**: `npm run deploy:test`
2. **Security Validation**: Automated in GitHub Actions
3. **Production Deployment**: Zero-downtime via PM2 reload
4. **Health Verification**: Automated post-deployment checks

### Troubleshooting
- **Security Issues**: Check `security-report.json`
- **Performance Issues**: Monitor `/api/cache/stats`
- **Deployment Issues**: Review `deployment-report.json`
- **API Issues**: Check PM2 logs and error monitoring

---

*Last updated: August 2024*
*Version: 2.0 - Enhanced Security & Performance*
**Implementation**: `server.js`

- **X-Content-Type-Options**: Prevents MIME sniffing attacks
- **X-Frame-Options**: Clickjacking protection
- **X-XSS-Protection**: Browser XSS filter activation
- **Strict-Transport-Security**: HTTPS enforcement (production)
- **Content Security Policy**: Strict resource loading policies

### 4. Rate Limiting
**Implementation**: `routes/api.js`

- **Global API Limiting**: 500 requests per 15-minute window
- **Authentication Limiting**: 10 login attempts per 15 minutes
- **Upload Limiting**: 50 uploads per hour
- **IP-based Tracking**: Individual limits per client IP

### 5. CSRF Protection
**Implementation**: `middleware/csrf.js`

- **Token Generation**: Secure CSRF tokens for all sessions
- **State-changing Operations**: CSRF validation for POST/PUT/DELETE
- **Session-based Storage**: Tokens stored in server sessions
- **Header & Body Support**: Flexible token transmission

### 6. Environment Security
**Implementation**: `config/environment.js`

- **Variable Validation**: Automatic validation of all environment variables
- **Security Checks**: Detection of weak/default secrets
- **Production Hardening**: Additional checks for production deployment
- **Secret Management**: Guidelines for secure secret generation

## ⚡ Performance Optimizations

### 1. Database Optimization
**Implementation**: Enhanced model indexes

- **Composite Indexes**: Optimized queries for common access patterns
- **Text Search Indexes**: Fast full-text search capabilities
- **Sorting Optimization**: Indexes for date, name, and size sorting
- **Foreign Key Optimization**: Efficient relationship queries

```javascript
// Example: Optimized gallery queries
GallerySchema.index({ owner: 1, lastAccessed: -1 });
GallerySchema.index({ owner: 1, name: 1 });
```

### 2. Server-side Caching
**Implementation**: `middleware/cache.js`

- **In-Memory Caching**: Fast access to frequently requested data
- **TTL Management**: Automatic cache expiration (5-30 minutes)
- **Smart Invalidation**: Cache clearing on data modifications
- **Statistics Tracking**: Cache hit/miss monitoring

```javascript
// Cache configuration by data type
- Galleries: 30 minutes (rarely change)
- Images: 15 minutes (moderate changes)  
- Publications: 5 minutes (frequent changes)
- Calendar: 10 minutes (moderate changes)
```

### 3. Frontend Optimization
**Implementation**: `scripts/build.js`

- **JavaScript Minification**: Terser-based compression with source maps
- **CSS Minification**: CleanCSS optimization
- **HTML Minification**: Full HTML optimization
- **Cache Busting**: Automatic versioning for assets
- **Asset Optimization**: Optimized file serving

### 4. Compression & Delivery
**Implementation**: `server.js`

- **Gzip Compression**: All HTTP responses compressed
- **Static File Optimization**: Efficient static asset serving
- **HTTP/2 Ready**: Optimized for modern protocols

## 🔧 Environment Configuration

### Required Variables

```bash
# Database
MONGODB_URI=mongodb://localhost:27017/publication_organizer_db

# Authentication
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
JWT_SECRET=your_secure_jwt_secret_min_32_chars
SESSION_SECRET=your_secure_session_secret_min_32_chars

# Server
PORT=3000
NODE_ENV=development
```

### Optional Variables

```bash
# Performance Tuning
MAX_FILE_SIZE=50
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=500
LOG_LEVEL=info

# External Services (Optional)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
REDIS_URL=redis://localhost:6379
```

### Security Best Practices

1. **Secret Generation**:
   ```bash
   # Generate secure secrets
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **Environment Validation**:
   - Automatic validation on startup
   - Production security checks
   - Warning system for weak configurations

## 🚀 Deployment Guidelines

### Development Deployment
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build optimized assets
npm run build
```

### Production Deployment
```bash
# Set production environment
export NODE_ENV=production

# Validate environment
node config/environment.js

# Build production assets
npm run build

# Start with optimized assets
npm run serve:dist
```

### Production Checklist

- [ ] All environment variables configured
- [ ] Strong secrets generated (min 32 characters)
- [ ] HTTPS enabled
- [ ] Database secured
- [ ] CORS configured for your domain
- [ ] Rate limiting adjusted for your traffic
- [ ] Monitoring configured
- [ ] Backup strategy implemented

## 📊 Monitoring & Maintenance

### Performance Monitoring

1. **Cache Statistics**:
   ```bash
   GET /api/cache/stats (Admin only)
   ```

2. **Database Performance**:
   - Monitor query execution times
   - Check index usage
   - Review slow query logs

3. **Rate Limiting Metrics**:
   - Track rate limit hits
   - Monitor suspicious activity
   - Adjust limits based on usage

### Security Monitoring

1. **Failed Authentication Attempts**:
   - Monitor login failures
   - Track rate limit violations
   - Review CSRF token failures

2. **Input Validation Failures**:
   - Log validation errors
   - Monitor for attack patterns
   - Review sanitization logs

3. **Environment Monitoring**:
   - Regular secret rotation
   - Security configuration validation
   - Dependency vulnerability scanning

### Maintenance Tasks

**Weekly**:
- Review security logs
- Check cache performance
- Monitor database growth

**Monthly**:
- Update dependencies
- Review rate limit settings
- Validate backup procedures

**Quarterly**:
- Rotate secrets
- Security audit
- Performance optimization review

## 🛠️ Troubleshooting

### Common Issues

**Cache Problems**:
```bash
# Clear all cache
POST /api/cache/clear (Admin only)

# Check cache statistics
GET /api/cache/stats
```

**Rate Limiting Issues**:
- Adjust `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW`
- Whitelist trusted IPs if needed
- Monitor for legitimate high-traffic users

**Environment Validation Errors**:
- Check `.env` file exists and is readable
- Verify all required variables are set
- Ensure secrets meet minimum length requirements

**CSRF Token Issues**:
- Ensure client includes X-CSRF-Token header
- Check session configuration
- Verify cookie settings

## 📈 Performance Metrics

Expected improvements after implementation:

- **Database Queries**: 40-60% faster with optimized indexes
- **API Response Times**: 50-70% faster with caching
- **Asset Loading**: 30-50% smaller with minification
- **Security Rating**: A+ with comprehensive protection

## 🔗 Related Files

- `middleware/validation.js` - Input validation
- `middleware/csrf.js` - CSRF protection
- `middleware/cache.js` - Caching system
- `config/environment.js` - Environment validation
- `scripts/build.js` - Build optimization
- `utils/envValidator.js` - Environment utilities

---

**Last Updated**: December 2024  
**Version**: 1.0  
**Security Level**: Production Ready