// ===============================
// Fichier: middleware/csrf.js
// Middleware de protection CSRF
// ===============================

const csrf = require('csrf');
const tokens = new csrf();

// Middleware pour générer et valider les tokens CSRF
const csrfProtection = {
    // Générer un token CSRF
    generateToken(req, res, next) {
        if (!req.session) {
            req.session = {};
        }
        
        if (!req.session.csrfSecret) {
            req.session.csrfSecret = tokens.secretSync();
        }
        
        const token = tokens.create(req.session.csrfSecret);
        res.locals.csrfToken = token;
        
        // Ajouter le token dans les en-têtes pour l'accès côté client
        res.set('X-CSRF-Token', token);
        
        next();
    },

    // Valider le token CSRF pour les requêtes de modification
    validateToken(req, res, next) {
        // Ignorer la validation pour les requêtes GET, HEAD, OPTIONS
        if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
            return next();
        }

        const token = req.get('X-CSRF-Token') || req.body._csrf;
        
        if (!req.session || !req.session.csrfSecret) {
            return res.status(403).json({ 
                error: 'Session CSRF manquante' 
            });
        }

        if (!token) {
            return res.status(403).json({ 
                error: 'Token CSRF requis pour cette opération' 
            });
        }

        try {
            const isValid = tokens.verify(req.session.csrfSecret, token);
            if (!isValid) {
                return res.status(403).json({ 
                    error: 'Token CSRF invalide' 
                });
            }
            next();
        } catch (error) {
            return res.status(403).json({ 
                error: 'Erreur de validation CSRF' 
            });
        }
    },

    // Route pour obtenir un nouveau token CSRF
    getToken(req, res) {
        if (!req.session) {
            req.session = {};
        }
        
        if (!req.session.csrfSecret) {
            req.session.csrfSecret = tokens.secretSync();
        }
        
        const token = tokens.create(req.session.csrfSecret);
        
        res.json({ 
            csrfToken: token 
        });
    }
};

module.exports = csrfProtection;