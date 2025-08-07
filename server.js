
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

// NOUVEAU : Importer les modèles nécessaires pour le nettoyage
const Gallery = require('./models/Gallery');
const Jour = require('./models/Jour');
const Schedule = require('./models/Schedule');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

// --- MIDDLEWARES DE BASE ---
app.use(compression()); // <-- NOUVEAU: Activer la compression Gzip pour toutes les réponses
app.use(cors());
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb', parameterLimit: 100000 }));
app.use(cookieParser());

// NOUVEAU : Fonction de nettoyage pour les données orphelines
const cleanupOrphanedData = async () => {
    try {
        console.log('[MAINTENANCE] Vérification des données orphelines au démarrage...');
        
        const existingGalleries = await Gallery.find({}).select('_id').lean();
        const existingGalleryIds = new Set(existingGalleries.map(g => g._id.toString()));

        const jourCleanupResult = await Jour.deleteMany({ galleryId: { $nin: Array.from(existingGalleryIds) } });
        if (jourCleanupResult.deletedCount > 0) {
            console.log(`[MAINTENANCE] ✅ ${jourCleanupResult.deletedCount} Jour(s) orphelin(s) supprimé(s).`);
        }

        const scheduleCleanupResult = await Schedule.deleteMany({ galleryId: { $nin: Array.from(existingGalleryIds) } });
        if (scheduleCleanupResult.deletedCount > 0) {
            console.log(`[MAINTENANCE] ✅ ${scheduleCleanupResult.deletedCount} entrée(s) de calendrier orpheline(s) supprimée(s).`);
        }
    } catch (error) {
        console.error('[MAINTENANCE] Erreur lors du nettoyage des données orphelines:', error);
    }
};

// --- CONNEXION À LA BASE DE DONNÉES ---
mongoose.connect(MONGODB_URI)
.then(() => {
  console.log('MongoDB Connected');
  // Lancer le nettoyage une fois connecté
  cleanupOrphanedData();
})
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
        if (req.path === '/welcome.html') {
            return res.sendFile(path.join(__dirname, 'public', 'welcome.html'));
        }
        return res.redirect('/welcome.html');
    }
    
    try {
        jwt.verify(token, process.env.JWT_SECRET);
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } catch (error) {
        res.clearCookie('token');
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

