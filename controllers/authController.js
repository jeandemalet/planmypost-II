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

        res.cookie('token', appToken, { 
            httpOnly: true, 
            secure: process.env.NODE_ENV === 'production', // true en prod
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 jours
        });

        res.status(200).json({
            message: 'Connexion réussie',
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

exports.logout = (req, res) => {
    res.cookie('token', '', {
        httpOnly: true,
        expires: new Date(0),
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    });
    res.status(200).json({ message: 'Déconnexion réussie.' });
};

exports.status = async (req, res) => {
    try {
        const token = req.cookies.token;
        if (!token) {
            return res.status(200).json({ loggedIn: false });
        }

        const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decodedToken.userId).select('-__v');

        if (!user) {
            return res.status(200).json({ loggedIn: false });
        }

        res.status(200).json({ 
            loggedIn: true, 
            username: user.name,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                picture: user.picture,
            }
        });

    } catch (error) {
        res.status(200).json({ loggedIn: false });
    }
};