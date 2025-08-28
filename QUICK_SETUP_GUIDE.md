# 🚀 Quick Setup Guide - Security & Performance

This guide helps you quickly implement all security and performance improvements in your Publication Organizer application.

## ⚡ Quick Start (5 minutes)

### 1. Install Security Dependencies
```bash
npm install helmet express-validator express-rate-limit csrf dompurify express-session node-cache
```

### 2. Update Environment Variables
Copy the `.env.example` to `.env` and update:
```bash
cp .env.example .env
```

**Critical variables to update**:
- `JWT_SECRET` - Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `SESSION_SECRET` - Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `GOOGLE_CLIENT_ID` - Your Google OAuth client ID

### 3. Build Optimized Assets
```bash
npm install --save-dev terser clean-css-cli html-minifier-terser
npm run build
```

### 4. Start with Security Features
```bash
npm start
```

## 🔒 Security Features Checklist

- [x] **Helmet** - Security headers protection
- [x] **Input Validation** - All API routes validated
- [x] **XSS Protection** - DOMPurify sanitization
- [x] **Rate Limiting** - DoS attack prevention
- [x] **CSRF Protection** - Cross-site request forgery prevention
- [x] **Environment Validation** - Secure configuration checks

## ⚡ Performance Features Checklist

- [x] **Database Indexes** - Optimized query performance
- [x] **Server Caching** - In-memory response caching
- [x] **Asset Minification** - JavaScript, CSS, HTML optimization
- [x] **Gzip Compression** - Response compression
- [x] **Static File Optimization** - Efficient asset serving

## 🛠️ Development Commands

```bash
# Development with auto-restart
npm run dev

# Build production assets
npm run build

# Serve with optimized assets
npm run serve:dist

# Security audit
npm run audit:security

# View cache statistics (admin only)
curl http://localhost:3000/api/cache/stats
```

## 🚨 Production Deployment

1. **Set Production Environment**:
   ```bash
   NODE_ENV=production
   ```

2. **Generate Strong Secrets**:
   ```bash
   # JWT Secret
   JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
   
   # Session Secret  
   SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
   ```

3. **Build & Deploy**:
   ```bash
   npm run build
   npm run serve:dist
   ```

## 📊 Monitoring & Testing

### Test Security Features
```bash
# Test rate limiting
for i in {1..100}; do curl http://localhost:3000/api/galleries; done

# Test input validation
curl -X POST http://localhost:3000/api/galleries -H "Content-Type: application/json" -d '{"name": ""}'

# Test XSS protection (should be sanitized)
# Try entering <script>alert('xss')</script> in description editor
```

### Monitor Performance
- Cache hit ratio: Check `/api/cache/stats`
- Database query times: Monitor MongoDB logs
- Asset loading: Use browser dev tools

## 🔧 Customization

### Adjust Rate Limits
In `.env`:
```bash
RATE_LIMIT_WINDOW=15    # minutes
RATE_LIMIT_MAX=500      # requests per window
```

### Configure Cache TTL
In `middleware/cache.js`:
```javascript
const galleryCacheMiddleware = cacheMiddleware(1800); // 30 minutes
const imageCacheMiddleware = cacheMiddleware(900);    // 15 minutes
```

### Custom Validation Rules
In `middleware/validation.js`:
```javascript
const customValidator = [
    body('yourField')
        .custom((value) => {
            // Your validation logic
            return true;
        }),
    handleValidationErrors
];
```

## ⚠️ Important Notes

1. **Never commit secrets** - Use environment variables
2. **Test thoroughly** - Validate all features before production
3. **Monitor actively** - Set up logging and alerting
4. **Update regularly** - Keep dependencies current
5. **Backup data** - Implement proper backup strategy

## 🆘 Troubleshooting

**Environment validation fails**:
- Check `.env` file exists in project root
- Verify all required variables are set
- Ensure secrets are at least 32 characters

**Cache not working**:
- Check if Redis is running (if using Redis)
- Verify cache middleware is applied to routes
- Monitor cache stats for hit/miss ratio

**Rate limiting too strict**:
- Increase `RATE_LIMIT_MAX` in environment
- Extend `RATE_LIMIT_WINDOW` for longer time periods
- Consider IP whitelisting for trusted sources

**Build process fails**:
- Ensure all dev dependencies are installed
- Check Node.js version compatibility
- Verify file permissions on scripts directory

## 📚 Additional Resources

- [Security & Performance Guide](./SECURITY_PERFORMANCE_GUIDE.md) - Detailed documentation
- [Environment Examples](./.env.example) - Configuration templates
- [Build Scripts](./scripts/build.js) - Asset optimization details

---

**Quick Setup Complete!** 🎉

Your application now has enterprise-grade security and performance optimizations. Monitor the logs and adjust settings based on your specific needs.