const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

exports.googleSignIn = async (req, res) => {
    console.log('=== DÉBUT googleSignIn ===');
    console.log('Body reçu:', req.body);
    
    const { token } = req.body;
    if (!token) {
        console.log('Erreur: Token Google manquant');
        return res.status(400).json({ message: 'Token Google manquant.' });
    }

    console.log('Token reçu, longueur:', token.length);
    console.log('GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID);

    try {
        console.log('Vérification du token Google...');
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        console.log('Token Google vérifié avec succès');
        
        const payload = ticket.getPayload();
        const { sub: googleId, email, name, picture } = payload;
        console.log('Données utilisateur extraites:', { googleId, email, name });

        console.log('Recherche de l\'utilisateur dans la DB...');
        let user = await User.findOne({ googleId });

        if (!user) {
            console.log('Utilisateur non trouvé, création...');
            user = await new User({ googleId, email, name, picture }).save();
            console.log('Nouvel utilisateur créé:', user._id);
        } else {
            console.log('Utilisateur existant trouvé:', user._id);
        }

        console.log('Génération du token JWT...');
        const appToken = jwt.sign(
            { userId: user._id, googleId: user.googleId }, 
            process.env.JWT_SECRET, 
            { expiresIn: '7d' }
        );

        console.log('Configuration du cookie...');
        res.cookie('token', appToken, { 
            httpOnly: true, 
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        console.log('Envoi de la réponse JSON...');
        res.status(200).json({
            message: 'Connexion réussie',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                picture: user.picture,
            },
        });
        console.log('=== FIN googleSignIn (succès) ===');

    } catch (error) {
        console.error("=== ERREUR dans googleSignIn ===");
        console.error("Type d'erreur:", error.constructor.name);
        console.error("Message d'erreur:", error.message);
        console.error("Stack trace:", error.stack);
        
        res.status(401).json({ message: 'Token Google invalide ou expiré.' });
        console.log('=== FIN googleSignIn (erreur) ===');
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