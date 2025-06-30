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

        let user = await User.findOne({ oauthProvider: 'google', oauthId: googleId });

        if (!user) {
            user = await User.findOne({ email: email });

            if (user) {
                user.oauthProvider = 'google';
                user.oauthId = googleId;
                user.displayName = name;
                user.profilePictureUrl = picture;
                await user.save();
            } else {
                user = await new User({
                    oauthProvider: 'google',
                    oauthId: googleId,
                    email: email,
                    displayName: name,
                    profilePictureUrl: picture
                }).save();
            }
        }

        const appToken = jwt.sign(
            { userId: user._id, email: user.email, role: user.role }, // On inclut le rôle dans le token !
            process.env.JWT_SECRET, 
            { expiresIn: '7d' }
        );

        res.cookie('token', appToken, { 
            httpOnly: true, 
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        res.status(200).json({
            message: 'Connexion réussie',
            user: {
                id: user._id,
                name: user.displayName,
                email: user.email,
                picture: user.profilePictureUrl,
                role: user.role // On renvoie aussi le rôle ici
            },
        });

    } catch (error) {
        console.error("Erreur de vérification du token ou de la base de données:", error);
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

        res.status(200).json({ 
            loggedIn: true, 
            username: user.displayName,
            user: {
                id: user._id,
                name: user.displayName,
                email: user.email,
                picture: user.profilePictureUrl,
                role: user.role // <-- AJOUT IMPORTANT
            }
        });

    } catch (error) {
        res.status(200).json({ loggedIn: false });
    }
};