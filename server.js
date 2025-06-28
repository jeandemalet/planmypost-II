// ===============================
//  Fichier: server.js (Corrigé)
// ===============================
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const apiRoutes = require('./routes/api');
const fse = require('fs-extra');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

app.use(cors());
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb', parameterLimit: 100000 }));

mongoose.connect(MONGODB_URI)
.then(() => console.log('MongoDB Connected'))
.catch(err => console.error('MongoDB Connection Error:', err));

mongoose.connection.on('error', err => {
  console.error(`MongoDB connection error: ${err}`);
  process.exit(-1);
});

// AJOUTÉ : Définir la route pour la page d'accueil en premier.
// Ceci interceptera la requête pour la racine ('/') et servira 'welcome.html'.
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'welcome.html'));
});

// DÉPLACÉ ET CONSERVÉ : Servir les fichiers statiques (CSS, JS, images).
// Cette ligne est maintenant après la route racine, donc elle ne l'interceptera plus.
// Elle est essentielle pour que welcome.html et index.html puissent charger leurs assets.
app.use(express.static(path.join(__dirname, 'public')));

const UPLOAD_DIR = path.join(__dirname, 'uploads');
fse.ensureDirSync(UPLOAD_DIR);

// Les routes API restent ici.
app.use('/api', apiRoutes);

// La route "catch-all" sert l'application principale (SPA) pour toutes les autres requêtes.
// Par exemple, si l'utilisateur est redirigé vers /galleries, cela charge l'app.
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = http.createServer(app);

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    const TEMP_UPLOAD_DIR = path.join(__dirname, 'temp_uploads');
    fse.emptyDir(TEMP_UPLOAD_DIR).catch(err => console.error('Failed to clear temp upload dir:', err));
});

const FIFTEEN_MINUTES_IN_MS = 15 * 60 * 1000;
server.setTimeout(FIFTEEN_MINUTES_IN_MS, () => {
    console.error('SERVER TIMEOUT: Une requête a pris trop de temps et a été interrompue par le serveur.');
});
console.log(`Timeout du serveur HTTP réglé à ${FIFTEEN_MINUTES_IN_MS / 1000 / 60} minutes.`);