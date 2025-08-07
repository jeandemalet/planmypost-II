// ===============================
//  Script de migration pour corriger l'encodage UTF-8
//  À exécuter une seule fois : node fix-encoding-migration.js
// ===============================

require('dotenv').config();
const mongoose = require('mongoose');
const Image = require('./models/Image');

// Fonction pour corriger l'encodage UTF-8
const fixUTF8Encoding = (str) => {
    try {
        if (str.includes('Ã') || str.includes('Â') || str.includes('Ã¨') || str.includes('Ã©') || str.includes('Ã ')) {
            const buffer = Buffer.from(str, 'latin1');
            return buffer.toString('utf8');
        }
        return str;
    } catch (error) {
        console.warn(`Impossible de corriger l'encodage pour: ${str}`, error);
        return str;
    }
};

async function fixEncodingInDatabase() {
    try {
        // Connexion à MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connecté à MongoDB');

        // Récupérer toutes les images avec des problèmes d'encodage
        const images = await Image.find({
            originalFilename: { 
                $regex: /Ã|Â|Ã¨|Ã©|Ã / 
            }
        });

        console.log(`🔍 Trouvé ${images.length} images avec des problèmes d'encodage`);

        let correctedCount = 0;
        
        for (const image of images) {
            const originalName = image.originalFilename;
            const correctedName = fixUTF8Encoding(originalName);
            
            if (originalName !== correctedName) {
                console.log(`🔧 Correction: "${originalName}" → "${correctedName}"`);
                
                // Mettre à jour en base
                await Image.findByIdAndUpdate(image._id, {
                    originalFilename: correctedName
                });
                
                correctedCount++;
            }
        }

        console.log(`✅ Migration terminée: ${correctedCount} noms de fichiers corrigés`);
        
    } catch (error) {
        console.error('❌ Erreur lors de la migration:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Déconnecté de MongoDB');
    }
}

// Exécuter la migration
if (require.main === module) {
    fixEncodingInDatabase();
}

module.exports = { fixUTF8Encoding };