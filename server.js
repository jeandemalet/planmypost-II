
// =======================================================
//  Fichier: server.js (Version finale et corrigée)
// =======================================================
require('dotenv').config();

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
} catch (error) {
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
const helmet = require('helmet'); // <-- NOUVEAU: Importation de Helmet pour la sécurité
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
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

// --- MIDDLEWARES DE BASE ---
// Configuration Helmet pour la sécurité
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://accounts.google.com", "https://apis.google.com", "https://cdn.jsdelivr.net"],
            imgSrc: ["'self'", "data:", "blob:", "https://lh3.googleusercontent.com"],
            connectSrc: ["'self'", "https://accounts.google.com"]
        }
    },
    crossOriginEmbedderPolicy: false // Nécessaire pour Google Sign-In
}));
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
app.use(cors({
    origin: true, // Adaptez pour la production si nécessaire
    credentials: true
}));
app.use(express.json({ limit: '50mb' })); // Limite raisonnable pour les métadonnées
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());


// --- CONNEXION À LA BASE DE DONNÉES ---
mongoose.connect(MONGODB_URI)
.then(() => console.log('MongoDB Connected'))
.catch(err => console.error('MongoDB Connection Error:', err));

mongoose.connection.on('error', err => {
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
// Servir les fichiers statiques depuis 'dist' en production, 'public' en développement
const staticDir = process.env.NODE_ENV === 'production' && process.argv.includes('--static-dir=dist') 
    ? path.join(__dirname, 'dist') 
    : path.join(__dirname, 'public');

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
    console.log(`🚀 Server running on port ${PORT}`);
    // Nettoyer le dossier temporaire des uploads au démarrage
    const TEMP_UPLOAD_DIR = path.join(__dirname, 'temp_uploads');
    fse.emptyDir(TEMP_UPLOAD_DIR)
       .then(() => console.log('🧹 Temp upload directory cleared.'))
       .catch(err => console.error('Error clearing temp upload dir:', err));
});

// Augmenter le timeout pour les uploads volumineux
const FIVE_MINUTES_IN_MS = 5 * 60 * 1000;
server.setTimeout(FIVE_MINUTES_IN_MS);
console.log(`🕒 HTTP server timeout set to ${FIVE_MINUTES_IN_MS / 1000 / 60} minutes.`);

