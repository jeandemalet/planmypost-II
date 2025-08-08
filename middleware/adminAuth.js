// middleware/adminAuth.js
const User = require('../models/User');

module.exports = async (req, res, next) => {
    // Ce middleware suppose que `auth.js` a déjà été exécuté et a attaché `req.userData`.
    if (!req.userData || !req.userData.userId) {
        return res.status(401).json({ message: "Accès non autorisé." });
    }
        
    try {
        const user = await User.findById(req.userData.userId).select('role').lean();
        
        if (user && user.role === 'admin') {
            next();
        } else {
            res.status(403).json({ message: "Accès refusé. Droits d'administrateur requis." });
        }
    } catch (error) {
        res.status(500).json({ message: "Erreur serveur lors de la vérification des droits d'administrateur." });
    }
};