// middleware/adminAuth.js
module.exports = (req, res, next) => {
    // Ce middleware suppose que `auth.js` a déjà été exécuté et a attaché `req.user`.
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ message: "Accès refusé. Droits d'administrateur requis." });
    }
};