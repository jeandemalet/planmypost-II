#!/usr/bin/env node

/**
 * Script pour copier nlp.min.js depuis node_modules vers public/lib
 * Utile pour maintenir la cohérence lors des mises à jour
 */

const fs = require('fs');
const path = require('path');

const sourceFile = path.join(__dirname, '..', 'node_modules', '@nlpjs', 'nlp', 'dist', 'nlp.min.js');
const fallbackSource = path.join(__dirname, '..', 'node_modules', '@nlpjs', 'nlp', 'src', 'index.js');
const targetFile = path.join(__dirname, '..', 'public', 'lib', 'nlp.min.js');

console.log('🔍 Recherche du fichier NLP.js...');

// Vérifier si le fichier de destination existe déjà
if (fs.existsSync(targetFile)) {
    console.log('✅ Le fichier nlp.min.js existe déjà dans public/lib/');
    console.log('   Si vous voulez le remplacer, supprimez-le d\'abord.');
    process.exit(0);
}

// Essayer de copier depuis dist/
if (fs.existsSync(sourceFile)) {
    console.log('📁 Fichier trouvé dans node_modules/@nlpjs/nlp/dist/');
    fs.copyFileSync(sourceFile, targetFile);
    console.log('✅ Fichier copié avec succès vers public/lib/nlp.min.js');
} else {
    console.log('⚠️  Fichier dist non trouvé, cette version de @nlpjs/nlp n\'a pas de build minifié');
    console.log('   Le fichier nlp.min.js actuel dans public/lib/ sera conservé');
    
    if (fs.existsSync(fallbackSource)) {
        console.log('ℹ️  Fichier source disponible:', fallbackSource);
        console.log('   Vous pouvez utiliser un bundler pour créer une version minifiée si nécessaire');
    }
}

console.log('🎉 Configuration terminée !');