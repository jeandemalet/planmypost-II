
// =======================================================
//  Fichier: server.js (Version finale et corrigée)
// =======================================================
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const apiRoutes = require('./routes/api');
const fse = require('fs-extra');
const http = require('http');
const cookieParser = require('cookie-parser');
const compression = require('compression'); // <-- NOUVEAU: Importation de la compression
const jwt = require('jsonwebtoken'); // Ajouté pour la logique de redirection
const authMiddleware = require('./middleware/auth'); // Import du middleware d'authentification

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

// --- MIDDLEWARES DE BASE ---
app.use(compression()); // <-- NOUVEAU: Activer la compression Gzip pour toutes les réponses
app.use(cors());
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb', parameterLimit: 100000 }));
app.use(cookieParser());

// Middleware pour forcer l'encodage UTF-8
app.use((req, res, next) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    next();
});

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
app.use(express.static(path.join(__dirname, 'public')));

// 3. La route de "catch-all" pour l'application principale vient en DERNIER.
//    Cette logique est améliorée pour rediriger si l'utilisateur n'est pas connecté.
app.get('*', (req, res) => {
    const token = req.cookies.token;
    
    if (!token) {
        // Si pas de token, on redirige vers la page de connexion
        return res.redirect('/welcome.html');
    }
    
    try {
        // On vérifie si le token est valide
        jwt.verify(token, process.env.JWT_SECRET);
        // Si le token est valide, on envoie l'application principale
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } catch (error) {
        // Si le token est invalide ou expiré, on redirige aussi vers la connexion
        res.redirect('/welcome.html');
    }
});


// --- DÉMARRAGE DU SERVEUR ---
const server = http.createServer(app);

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    const TEMP_UPLOAD_DIR = path.join(__dirname, 'temp_uploads');
    fse.emptyDir(TEMP_UPLOAD_DIR).catch(err => console.error('Failed to clear temp upload dir:', err));
});

const FIVE_MINUTES_IN_MS = 5 * 60 * 1000;
server.setTimeout(FIVE_MINUTES_IN_MS);
console.log(`HTTP server timeout is set to ${FIVE_MINUTES_IN_MS / 1000 / 60} minutes.`);

