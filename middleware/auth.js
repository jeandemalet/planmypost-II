// ===============================
// Fichier: middleware/auth.js (CORRIGÉ)
// ===============================
const jwt = require('jsonwebtoken');

// Ce middleware est conçu pour fonctionner avec des cookies httpOnly.
module.exports = (req, res, next) => {
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
        
        // 4. Ajouter les données de l'utilisateur à l'objet de requête pour les prochains middlewares/contrôleurs
        req.userData = { userId: decodedToken.userId, googleId: decodedToken.googleId };
        
        // 5. Passer au prochain middleware/contrôleur
        next();
    } catch (error) {
        // Gérer les erreurs de token invalide ou expiré
        res.status(401).json({ message: 'Token invalide ou expiré.' });
    }
};