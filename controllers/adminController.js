const User = require('../models/User');
const Gallery = require('../models/Gallery');
const jwt = require('jsonwebtoken');

// Lister tous les utilisateurs
exports.listUsers = async (req, res) => {
    try {
        // OPTIMISATION: .select() pour exclure le mot de passe s'il y en avait un, et __v
        const users = await User.find({}).select('-password -__v').sort({ createdAt: -1 }).lean();
        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ message: "Erreur serveur lors de la récupération des utilisateurs." });
    }
};

// Obtenir toutes les galeries d'un utilisateur spécifique (par l'admin)
exports.getGalleriesForUser = async (req, res) => {
    try {
        const galleries = await Gallery.find({ owner: req.params.userId }).sort({ lastAccessed: -1 }).lean();
        res.status(200).json(galleries);
    } catch (error) {
        res.status(500).json({ message: "Erreur serveur lors de la récupération des galeries." });
    }
};

// --- FONCTION D'USURPATION D'IDENTITÉ ---
exports.impersonateUser = async (req, res) => {
    const { userIdToImpersonate } = req.body;

    try {
        // CORRECTION: Utilisation de `name` au lieu de `displayName` pour être cohérent avec le modèle User
        const userToImpersonate = await User.findById(userIdToImpersonate).select('email role name').lean();
        if (!userToImpersonate) {
            return res.status(404).json({ message: 'Utilisateur à usurper non trouvé.' });
        }

        // Créer un nouveau token JWT pour l'utilisateur cible
        const impersonationToken = jwt.sign(
            {
                userId: userToImpersonate._id,
                email: userToImpersonate.email,
                role: userToImpersonate.role,
                impersonatedBy: req.userData.userId // Garder une trace de qui est l'admin
            },
            process.env.JWT_SECRET,
            { expiresIn: '1h' } // Durée de vie plus courte pour la sécurité
        );

        // Envoyer ce token dans un cookie httpOnly
        res.cookie('token', impersonationToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 3600 * 1000 // 1 heure
        });

        res.status(200).json({
            message: `Vous naviguez maintenant en tant que ${userToImpersonate.name}.`,
            impersonating: true
        });

    } catch (error) {
        console.error("Erreur d'usurpation d'identité :", error);
        res.status(500).json({ message: "Erreur serveur lors de l'usurpation d'identité." });
    }
};