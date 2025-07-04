
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
const authMiddleware = require('./middleware/auth'); // Import du middleware d'authentification

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

// --- MIDDLEWARES DE BASE ---
// Doivent être déclarés avant les routes.
app.use(cors());
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb', parameterLimit: 100000 }));
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
app.use(express.static(path.join(__dirname, 'public')));

// 3. La route de "catch-all" pour l'application principale vient en DERNIER.
//    Si une requête GET n'a été interceptée ni par l'API, ni par les fichiers statiques,
//    elle est gérée ici. On la protège pour s'assurer que seul un utilisateur connecté
//    reçoit le "squelette" de l'application principale (index.html).
app.get('*', authMiddleware, (req, res) => {
    // Si l'authMiddleware passe, on envoie la page principale de l'application.
    // S'il échoue, il renverra une erreur 401 et n'atteindra jamais cette ligne.
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// --- DÉMARRAGE DU SERVEUR ---
const server = http.createServer(app);

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    const TEMP_UPLOAD_DIR = path.join(__dirname, 'temp_uploads');
    fse.emptyDir(TEMP_UPLOAD_DIR).catch(err => console.error('Failed to clear temp upload dir:', err));
});

const FIVE_MINUTES_IN_MS = 5 * 60 * 1000;
server.setTimeout(FIVE_MINUTES_IN_MS, () => {
    console.error('SERVER TIMEOUT: A request took too long and was timed out by the server.');
});
console.log(`HTTP server timeout is set to ${FIVE_MINUTES_IN_MS / 1000 / 60} minutes.`);

