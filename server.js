require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const apiRoutes = require('./routes/api');
const fse = require('fs-extra');
const http = require('http');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

// Configuration de CORS pour autoriser les cookies et les requêtes depuis votre frontend
app.use(cors({
    origin: true, // Ou spécifiez l'origine exacte : 'http://localhost:3000'
    credentials: true
}));

app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb', parameterLimit: 100000 }));
app.use(cookieParser());

mongoose.connect(MONGODB_URI)
.then(() => console.log('MongoDB Connected'))
.catch(err => console.error('MongoDB Connection Error:', err));

mongoose.connection.on('error', err => {
  console.error(`MongoDB connection error: ${err}`);
  process.exit(-1);
});

// Servir les fichiers statiques (CSS, JS du client, images, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// Créer le dossier d'uploads s'il n'existe pas
const UPLOAD_DIR = path.join(__dirname, 'uploads');
fse.ensureDirSync(UPLOAD_DIR);

// Utiliser les routes de l'API pour tout ce qui commence par /api
app.use('/api', apiRoutes);

// Route pour la page de bienvenue
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'welcome.html'));
});

// Route pour la page admin
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Route "catch-all" pour l'application principale (Single Page Application)
// Elle doit être placée après toutes les autres routes spécifiques (comme /admin)
app.get('*', (req, res) => {
    // Empêche de servir index.html pour des fichiers qui devraient exister (ex: un .js ou .css) mais qui sont introuvables
    if (path.extname(req.path) && !req.path.startsWith('/api')) {
        return res.status(404).send('File not found');
    }
    // Pour toutes les autres routes (ex: /galleries/some-id), on sert la page principale de l'app
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = http.createServer(app);

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

// Augmenter le timeout pour les longs uploads
const FIFTEEN_MINUTES_IN_MS = 15 * 60 * 1000;
server.setTimeout(FIFTEEN_MINUTES_IN_MS);
console.log(`Timeout du serveur HTTP réglé à ${FIFTEEN_MINUTES_IN_MS / 1000 / 60} minutes.`);