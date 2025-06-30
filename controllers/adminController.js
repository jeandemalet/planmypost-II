const User = require('../models/User');
const Gallery = require('../models/Gallery');
const jwt = require('jsonwebtoken');

// Lister tous les utilisateurs
exports.listUsers = async (req, res) => {
    try {
        const users = await User.find({}).select('-__v').sort({ createdAt: -1 });
        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ message: "Erreur serveur lors de la récupération des utilisateurs." });
    }
};

// Obtenir toutes les galeries d'un utilisateur spécifique (par l'admin)
exports.getGalleriesForUser = async (req, res) => {
    try {
        const galleries = await Gallery.find({ owner: req.params.userId }).sort({ lastAccessed: -1 });
        res.status(200).json(galleries);
    } catch (error) {
        res.status(500).json({ message: "Erreur serveur lors de la récupération des galeries." });
    }
};

// --- NOUVELLE FONCTION POUR L'USURPATION D'IDENTITÉ ---
exports.impersonateUser = async (req, res) => {
    const { userIdToImpersonate } = req.body;
    
    try {
        const userToImpersonate = await User.findById(userIdToImpersonate);
        if (!userToImpersonate) {
            return res.status(404).json({ message: 'Utilisateur à usurper non trouvé.' });
        }

        // Créer un nouveau token JWT pour l'utilisateur cible,
        // mais on peut y ajouter une information pour savoir que c'est une session usurpée.
        const impersonationToken = jwt.sign(
            { 
                userId: userToImpersonate._id, 
                email: userToImpersonate.email,
                role: userToImpersonate.role,
                impersonatedBy: req.user._id // On garde une trace de qui est l'admin
            }, 
            process.env.JWT_SECRET, 
            { expiresIn: '1h' } // Durée de vie plus courte pour la sécurité
        );

        // Envoyer ce token dans un cookie
        res.cookie('token', impersonationToken, { 
            httpOnly: true, 
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 1 * 60 * 60 * 1000 // 1 heure
        });

        res.status(200).json({ 
            message: `Vous naviguez maintenant en tant que ${userToImpersonate.displayName}.`,
            impersonating: true
        });

    } catch (error) {
        console.error("Erreur d'usurpation d'identité :", error);
        res.status(500).json({ message: "Erreur serveur lors de l'usurpation d'identité." });
    }
};