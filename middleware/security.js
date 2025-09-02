/**
 * Middleware de sécurité spécialisé pour l'application
 * Optimisé pour la compatibilité avec Google OAuth
 */

const helmet = require('helmet');

/**
 * Configuration CSP optimisée pour Google Sign-In
 */
const getCSPConfig = (isDevelopment = false) => {
    const baseConfig = {
        defaultSrc: ["'self'"],
        styleSrc: [
            "'self'", 
            "'unsafe-inline'", 
            "https://fonts.googleapis.com"
        ],
        fontSrc: [
            "'self'", 
            "https://fonts.gstatic.com"
        ],
        scriptSrc: [
            "'self'", 
            "'unsafe-inline'", 
            "https://accounts.google.com", 
            "https://apis.google.com", 
            "https://gstatic.com"
        ],
        imgSrc: [
            "'self'", 
            "data:", 
            "blob:", 
            "https://lh3.googleusercontent.com",
            "https://ssl.gstatic.com"
        ],
        connectSrc: [
            "'self'", 
            "https://accounts.google.com", 
            "https://content-googleapis.com",
            "https://oauth2.googleapis.com"
        ],
        frameSrc: [
            "'self'", 
            "https://accounts.google.com"
        ],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"]
    };

    // En développement, ajouter localhost et les domaines de test
    if (isDevelopment) {
        baseConfig.connectSrc.push('http://localhost:*', 'ws://localhost:*');
        baseConfig.scriptSrc.push('http://localhost:*');
    }

    return baseConfig;
};

/**
 * Configuration Helmet complète
 */
const getHelmetConfig = (isDevelopment = false) => ({
    contentSecurityPolicy: {
        directives: getCSPConfig(isDevelopment)
    },
    crossOriginEmbedderPolicy: false, // Nécessaire pour Google Sign-In
    crossOriginOpenerPolicy: { 
        policy: "same-origin-allow-popups" // Autorise les popups OAuth
    },
    crossOriginResourcePolicy: { 
        policy: "cross-origin" // Nécessaire pour les ressources Google
    },
    dnsPrefetchControl: { allow: true },
    frameguard: { action: 'deny' },
    hidePoweredBy: true,
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    },
    ieNoOpen: true,
    noSniff: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    xssFilter: true
});

/**
 * Middleware principal de sécurité
 */
const securityMiddleware = (isDevelopment = false) => {
    return helmet(getHelmetConfig(isDevelopment));
};

/**
 * Middleware pour les routes d'authentification
 * Configuration plus permissive pour Google OAuth
 */
const authSecurityMiddleware = () => {
    return helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
                fontSrc: ["'self'", "https://fonts.gstatic.com"],
                scriptSrc: [
                    "'self'", 
                    "'unsafe-inline'", 
                    "https://accounts.google.com", 
                    "https://apis.google.com", 
                    "https://gstatic.com",
                    "https://ssl.gstatic.com"
                ],
                imgSrc: [
                    "'self'", 
                    "data:", 
                    "blob:", 
                    "https://lh3.googleusercontent.com",
                    "https://ssl.gstatic.com",
                    "https://www.gstatic.com"
                ],
                connectSrc: [
                    "'self'", 
                    "https://accounts.google.com", 
                    "https://content-googleapis.com",
                    "https://oauth2.googleapis.com",
                    "https://www.googleapis.com"
                ],
                frameSrc: [
                    "'self'", 
                    "https://accounts.google.com"
                ],
                formAction: [
                    "'self'",
                    "https://accounts.google.com"
                ]
            }
        },
        crossOriginEmbedderPolicy: false,
        crossOriginOpenerPolicy: { policy: "unsafe-none" }, // Plus permissif pour l'auth
        crossOriginResourcePolicy: { policy: "cross-origin" }
    });
};

/**
 * Middleware de logging de sécurité
 */
const securityLogger = (req, res, next) => {
    // Logger les tentatives d'accès suspects
    const suspiciousPatterns = [
        /\.\.\//, // Path traversal
        /<script/i, // XSS potentiel
        /union.*select/i, // SQL injection potentiel
        /javascript:/i // JavaScript injection
    ];

    const url = req.originalUrl;
    const userAgent = req.get('User-Agent') || '';
    
    if (suspiciousPatterns.some(pattern => pattern.test(url))) {
        console.warn(`🔒 Suspicious request detected: ${url} from ${req.ip} (${userAgent})`);
    }

    next();
};

module.exports = {
    securityMiddleware,
    authSecurityMiddleware,
    securityLogger,
    getCSPConfig,
    getHelmetConfig
};