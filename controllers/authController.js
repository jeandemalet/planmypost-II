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

        // 1. Essayer de trouver l'utilisateur par son ID Google unique
        let user = await User.findOne({ oauthProvider: 'google', oauthId: googleId });

        // 2. Si l'utilisateur n'est pas trouvé par son ID Google
        if (!user) {
            // 2a. Chercher s'il existe un utilisateur avec le même e-mail
            user = await User.findOne({ email: email });

            if (user) {
                // 2b. L'utilisateur existe, on met à jour son profil avec les infos Google (liaison de compte)
                user.oauthProvider = 'google';
                user.oauthId = googleId;
                user.displayName = name;
                user.profilePictureUrl = picture;
                await user.save();
            } else {
                // 2c. C'est un utilisateur véritablement nouveau, on le crée
                user = await new User({
                    oauthProvider: 'google',
                    oauthId: googleId,
                    email: email,
                    displayName: name,
                    profilePictureUrl: picture
                }).save();
            }
        }

        // 3. Créer notre propre token JWT pour la session de l'application
        const appToken = jwt.sign(
            { userId: user._id, email: user.email },
            process.env.JWT_SECRET, 
            { expiresIn: '7d' }
        );

        res.cookie('token', appToken, { 
            httpOnly: true, 
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        // 4. Renvoyer une réponse de succès avec les données utilisateur cohérentes
        res.status(200).json({
            message: 'Connexion réussie',
            user: {
                id: user._id,
                name: user.displayName,
                email: user.email,
                picture: user.profilePictureUrl,
            },
        });

    } catch (error) {
        console.error("Erreur de vérification du token ou de la base de données:", error);
        
        if (error.message.includes('Invalid token signature')) {
             return res.status(401).json({ message: 'Token Google invalide.' });
        }
        
        res.status(500).json({ message: 'Erreur interne du serveur lors de la connexion.' });
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

        // CORRECTION : Utiliser les bons noms de champs du modèle User
        res.status(200).json({ 
            loggedIn: true, 
            username: user.displayName, // <-- CORRIGÉ de user.name
            user: {
                id: user._id,
                name: user.displayName, // <-- CORRIGÉ de user.name
                email: user.email,
                picture: user.profilePictureUrl, // <-- CORRIGÉ de user.picture
            }
        });

    } catch (error) {
        console.log('Auth status check failed, user is not logged in.', error.message);
        res.status(200).json({ loggedIn: false });
    }
};