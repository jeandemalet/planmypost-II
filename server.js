
// =======================================================
//  Fichier: server.js (Version finale et corrigée)
// =======================================================
require('dotenv').config();

// Initialize logger first
const logger = require('./utils/logger'); // NOUVEAU: Logger structuré

// === VALIDATION D'ENVIRONNEMENT ===
const { 
    validateEnvironment, 
    configureForProduction, 
    displayConfiguration 
} = require('./config/environment');

// Valider l'environnement avant de continuer
try {
    validateEnvironment();
    configureForProduction();
    displayConfiguration();
    logger.info('Environment validation successful');
} catch (error) {
    logger.error('Environment validation failed', { error: error.message });
    console.error('\n💥 Environment validation failed:');
    console.error(error.message);
    console.error('\n📝 Please check your .env file and ensure all required variables are set.');
    process.exit(1);
}

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const apiRoutes = require('./routes/api');
const fse = require('fs-extra');
const http = require('http');
const cookieParser = require('cookie-parser');
const compression = require('compression'); // <-- NOUVEAU: Importation de la compression
const { securityMiddleware, securityLogger } = require('./middleware/security'); // <-- NOUVEAU: Middleware de sécurité
const session = require('express-session'); // <-- NOUVEAU: Importation des sessions
const jwt = require('jsonwebtoken'); // Ajouté pour la logique de redirection
const authMiddleware = require('./middleware/auth'); // Import du middleware d'authentification

// ======================= BLOC DE SÉCURITÉ POUR INTERCEPTER LES CRASHES =======================
// Ce bloc doit être placé tout en haut pour intercepter toutes les erreurs fatales.

process.on('uncaughtException', (error, origin) => {
    console.error('🚨 ERREUR FATALE INTERCEPTÉE (UNCAUGHT EXCEPTION) ! Le serveur va s\'arrêter.');
    console.error('📍 Erreur:', error);
    console.error('📍 Stack trace:', error.stack);
    console.error('📍 Origine:', origin);
    console.error('📍 Timestamp:', new Date().toISOString());
    // Dans un environnement de production, vous devriez enregistrer l'erreur et redémarrer le processus.
    process.exit(1); // Arrêt forcé mais propre
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 PROMESSE NON GÉRÉE (UNHANDLED REJECTION) !');
    console.error('📍 Raison:', reason);
    console.error('📍 Stack trace:', reason?.stack);
    console.error('📍 Promesse:', promise);
    console.error('📍 Timestamp:', new Date().toISOString());
    // Vous pouvez également choisir d'arrêter le serveur ici si c'est une erreur critique.
});

// ======================= FIN DU BLOC DE SÉCURITÉ =======================



const app = express();
// Use validated configuration as single source of truth
const PORT = process.env.PORT; // Already validated by environment.js with default 3000
const MONGODB_URI = process.env.MONGODB_URI;

// --- MIDDLEWARES DE BASE ---
// Configuration de sécurité optimisée
const isDevelopment = process.env.NODE_ENV !== 'production';
app.use(securityMiddleware(isDevelopment));
app.use(securityLogger); // Logging des tentatives d'accès suspects
app.use(compression()); // <-- NOUVEAU: Activer la compression Gzip pour toutes les réponses
// Configuration des sessions pour CSRF
app.use(session({
    secret: process.env.SESSION_SECRET || 'default-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // HTTPS uniquement en production
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 heures
    }
}));
// NOUVEAU: Middleware de logging des requêtes
app.use(logger.requestLogger());
// Configuration CORS sécurisée
const corsOptions = {
    origin: function (origin, callback) {
        // Autoriser les requêtes sans origine (ex: applications mobiles, Postman)
        if (!origin) return callback(null, true);
        
        if (process.env.NODE_ENV === 'production') {
            // En production, restreindre aux domaines autorisés
            const allowedOrigins = [
                process.env.FRONTEND_URL,
                process.env.ADMIN_URL,
                // Ajoutez d'autres domaines autorisés ici
            ].filter(Boolean); // Filtrer les valeurs undefined/null
            
            if (allowedOrigins.length === 0) {
                console.warn('⚠️  WARNING: No allowed origins configured for production. Check FRONTEND_URL environment variable.');
                return callback(null, true); // Fallback sécurisé
            }
            
            if (allowedOrigins.indexOf(origin) !== -1) {
                callback(null, true);
            } else {
                console.warn(`🚫 CORS blocked request from unauthorized origin: ${origin}`);
                callback(new Error('Not allowed by CORS'));
            }
        } else {
            // En développement, autoriser toutes les origines
            callback(null, true);
        }
    },
    credentials: true,
    optionsSuccessStatus: 200, // Support pour les anciens navigateurs
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' })); // Limite raisonnable pour les métadonnées
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());


// --- CONNEXION À LA BASE DE DONNÉES ---
mongoose.connect(MONGODB_URI)
.then(() => {
    logger.info('MongoDB connected successfully', { uri: MONGODB_URI.replace(/\/\/.*@/, '//***:***@') });
    console.log('MongoDB Connected');
})
.catch(err => {
    logger.error('MongoDB connection failed', { error: err.message });
    console.error('MongoDB Connection Error:', err);
});

mongoose.connection.on('error', err => {
  logger.error('MongoDB connection error', { error: err.message });
  console.error(`MongoDB connection error: ${err}`);
  process.exit(-1);
});


// =======================================================
// --- GESTION DES ROUTES (L'ORDRE EST CRUCIAL) ---
// =======================================================

// 1. Les routes de l'API sont traitées en premier.
//    Elles commencent toutes par /api/ et gèrent leur propre authentification.
app.use('/api', apiRoutes);

// 2. Les fichiers statiques sont servis ENSUITE.
//    Lorsqu'une requête pour /script.js, /style.css, /welcome.html ou une image arrive,
//    ce middleware la trouve dans le dossier 'public' et la sert directement.
//    La requête s'arrête ici et ne va pas plus loin.

// Middleware spécial pour welcome.html avec sécurité optimisée pour OAuth
const { authSecurityMiddleware } = require('./middleware/security');
app.get('/welcome.html', authSecurityMiddleware(), (req, res, next) => {
    // Vérifier si l'utilisateur est déjà connecté
    const token = req.cookies.token;
    if (token) {
        try {
            jwt.verify(token, process.env.JWT_SECRET);
            // Utilisateur déjà connecté, rediriger vers l'app principale
            return res.redirect('/index.html');
        } catch (error) {
            // Token invalide, nettoyer et continuer vers welcome
            res.clearCookie('token');
        }
    }
    next(); // Continuer vers express.static
});

// Servir les fichiers statiques depuis 'dist' en production, 'public' en développement
const staticDir = process.env.NODE_ENV === 'production' && process.argv.includes('--static-dir=dist') 
    ? path.join(__dirname, 'dist') 
    : path.join(__dirname, 'public');

logger.info('Static files configuration', { 
    staticDir, 
    environment: process.env.NODE_ENV,
    useDistDirectory: process.argv.includes('--static-dir=dist')
});
console.log(`📁 Serving static files from: ${staticDir}`);
app.use(express.static(staticDir));

// 3. La route de "catch-all" pour l'application principale vient en DERNIER.
//    Logique améliorée pour rediriger si l'utilisateur n'est pas connecté.
app.get('*', (req, res) => {
    // Exclure les chemins qui ne doivent pas être gérés par cette logique (ex: API, fichiers statiques)
    if (req.path.startsWith('/api/') || req.path.includes('.')) {
        // Laissez express.static ou le routeur API gérer cela. Si on arrive ici, c'est une 404.
        return res.status(404).send('Resource not found');
    }

    const token = req.cookies.token;

    if (!token) {
        // Pas de token, on redirige vers la page de connexion
        return res.redirect('/welcome.html');
    }

    try {
        // On vérifie que le token est valide
        jwt.verify(token, process.env.JWT_SECRET);
        // Token valide, on sert l'application principale
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } catch (error) {
        // Token invalide ou expiré, on nettoie le cookie et on redirige
        res.clearCookie('token');
        res.redirect('/welcome.html');
    }
});


// --- DÉMARRAGE DU SERVEUR ---
const server = http.createServer(app);

server.listen(PORT, () => {
    logger.info('Server started successfully', { 
        port: PORT, 
        environment: process.env.NODE_ENV || 'development',
        staticDirectory: staticDir,
        processId: process.pid
    });
    console.log(`🚀 Server running on port ${PORT}`);
    
    // Nettoyer le dossier temporaire des uploads au démarrage
    const TEMP_UPLOAD_DIR = path.join(__dirname, 'temp_uploads');
    fse.emptyDir(TEMP_UPLOAD_DIR)
       .then(() => {
           logger.info('Temporary upload directory cleared successfully', { directory: TEMP_UPLOAD_DIR });
           console.log('🧹 Temp upload directory cleared.');
       })
       .catch(err => {
           logger.error('Failed to clear temporary upload directory', { 
               directory: TEMP_UPLOAD_DIR, 
               error: err.message 
           });
           console.error('Error clearing temp upload dir:', err);
       });
});

// Augmenter le timeout pour les uploads volumineux
const FIVE_MINUTES_IN_MS = 5 * 60 * 1000;
server.setTimeout(FIVE_MINUTES_IN_MS);
logger.info('HTTP server timeout configured', { 
    timeoutMs: FIVE_MINUTES_IN_MS, 
    timeoutMinutes: FIVE_MINUTES_IN_MS / 1000 / 60 
});
console.log(`🕒 HTTP server timeout set to ${FIVE_MINUTES_IN_MS / 1000 / 60} minutes.`);

