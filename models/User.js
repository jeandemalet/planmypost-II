const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    googleId: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    },
    name: {
        type: String,
        required: true,
    },
    // NOUVEAU: Champ pour gérer les rôles (indispensable pour les fonctions admin)
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    picture: {
        type: String,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// === INDEX OPTIMIZATIONS ===
// Index pour les requêtes par rôle
userSchema.index({ role: 1 });
// Index pour les requêtes par email - removed as unique: true already creates this index
// userSchema.index({ email: 1 }); // REMOVED: duplicate of unique constraint
// Index pour la recherche par nom
userSchema.index({ name: 'text' });
// Index composite pour les requêtes admin
userSchema.index({ role: 1, createdAt: -1 });

module.exports = mongoose.model('User', userSchema);