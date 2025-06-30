// ===============================
// Fichier: middleware/auth.js (CORRIGÉ)
// ===============================
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Ce middleware est conçu pour fonctionner avec des cookies httpOnly.
module.exports = async (req, res, next) => {
    // 1. Récupérer le token depuis les cookies de la requête
    const token = req.cookies.token;

    // 2. Vérifier si le token existe
    if (!token) {
        // Renvoyer une erreur 401 si aucun token n'est trouvé
        return res.status(401).json({ message: 'Authentification requise. Aucun token fourni.' });
    }

    try {
        // 3. Vérifier la validité du token
        const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
        
        // 4. Récupérer l'enregistrement complet de l'utilisateur depuis la base de données
        const user = await User.findById(decodedToken.userId);

        if (!user) {
            return res.status(401).json({ message: 'Utilisateur non trouvé.' });
        }

        // 5. Attacher l'objet utilisateur trouvé à l'objet de la requête
        req.user = user;
        
        // 6. Passer au prochain middleware/contrôleur
        next();
    } catch (error) {
        // Gérer les erreurs de token invalide ou expiré
        console.error("Erreur d'authentification:", error);
        res.status(401).json({ message: 'Token invalide ou expiré.' });
    }
};