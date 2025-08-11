// Test rapide pour vérifier que nlp.min.js est accessible
const fs = require('fs');
const path = require('path');

console.log('🔍 Vérification de l\'intégration NLP...\n');

// 1. Vérifier que le fichier nlp.min.js existe
const nlpFile = path.join(__dirname, 'public', 'lib', 'nlp.min.js');
if (fs.existsSync(nlpFile)) {
    const stats = fs.statSync(nlpFile);
    console.log('✅ Fichier nlp.min.js trouvé');
    console.log(`   Taille: ${Math.round(stats.size / 1024)} KB`);
    console.log(`   Modifié: ${stats.mtime.toLocaleDateString()}`);
} else {
    console.log('❌ Fichier nlp.min.js non trouvé');
    process.exit(1);
}

// 2. Vérifier que le dictionnaire existe
const dictFile = path.join(__dirname, 'public', 'lib', 'hashtag-thesaurus.json');
if (fs.existsSync(dictFile)) {
    const dict = JSON.parse(fs.readFileSync(dictFile, 'utf8'));
    const keys = Object.keys(dict);
    console.log('✅ Dictionnaire hashtag-thesaurus.json trouvé');
    console.log(`   Mots-clés: ${keys.length} (${keys.slice(0, 3).join(', ')}...)`);
} else {
    console.log('❌ Dictionnaire hashtag-thesaurus.json non trouvé');
    process.exit(1);
}

// 3. Vérifier que la dépendance npm est installée
const nodeModulesPath = path.join(__dirname, 'node_modules', '@nlpjs', 'nlp');
if (fs.existsSync(nodeModulesPath)) {
    const packageJson = JSON.parse(fs.readFileSync(path.join(nodeModulesPath, 'package.json'), 'utf8'));
    console.log('✅ Paquet @nlpjs/nlp installé');
    console.log(`   Version: ${packageJson.version}`);
} else {
    console.log('⚠️  Paquet @nlpjs/nlp non trouvé dans node_modules');
}

// 4. Vérifier que le HTML charge le bon fichier
const htmlFile = path.join(__dirname, 'public', 'index.html');
if (fs.existsSync(htmlFile)) {
    const htmlContent = fs.readFileSync(htmlFile, 'utf8');
    if (htmlContent.includes('src="/lib/nlp.min.js"')) {
        console.log('✅ HTML configuré pour charger nlp.min.js localement');
    } else if (htmlContent.includes('nlp.min.js')) {
        console.log('⚠️  HTML contient une référence à nlp.min.js mais pas le bon chemin');
    } else {
        console.log('❌ HTML ne charge pas nlp.min.js');
    }
}

console.log('\n🎉 Vérification terminée !');
console.log('💡 Pour tester l\'interface, ouvrez test-hashtag-integration.html dans votre navigateur');