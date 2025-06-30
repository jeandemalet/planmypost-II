// ===============================
//  Fichier: server.js (Corrigé à nouveau)
// ===============================
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const apiRoutes = require('./routes/api');
const fse = require('fs-extra');
const http = require('http');
const cookieParser = require('cookie-parser'); // <-- CETTE LIGNE ÉTAIT MANQUANTE

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

app.use(cors());
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb', parameterLimit: 100000 }));

// Vous aviez bien ajouté cette ligne, c'est parfait.
// Elle a juste besoin de la déclaration ci-dessus pour fonctionner.
app.use(cookieParser());

mongoose.connect(MONGODB_URI)
.then(() => console.log('MongoDB Connected'))
.catch(err => console.error('MongoDB Connection Error:', err));

mongoose.connection.on('error', err => {
  console.error(`MongoDB connection error: ${err}`);
  process.exit(-1);
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'welcome.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

const UPLOAD_DIR = path.join(__dirname, 'uploads');
fse.ensureDirSync(UPLOAD_DIR);

app.use('/api', apiRoutes);

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