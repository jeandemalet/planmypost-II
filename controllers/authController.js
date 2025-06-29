const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

exports.googleSignIn = async (req, res) => {
    const { token } = req.body;
    if (!token) {
        return res.status(400).json({ message: 'Token Google manquant.' });
    }

    try {
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        const { sub: googleId, email, name, picture } = payload;

        let user = await User.findOne({ googleId });

        if (!user) {
            // Si l'utilisateur n'existe pas, on le crée
            user = await new User({ googleId, email, name, picture }).save();
        }

        // Créer notre propre token JWT pour la session de l'application
        const appToken = jwt.sign(
            { userId: user._id, googleId: user.googleId }, 
            process.env.JWT_SECRET, 
            { expiresIn: '7d' } // Le token expire dans 7 jours
        );

        res.status(200).json({
            message: 'Connexion réussie',
            token: appToken,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                picture: user.picture,
            },
        });

    } catch (error) {
        console.error("Erreur de vérification du token Google:", error);
        res.status(401).json({ message: 'Token Google invalide ou expiré.' });
    }
};