const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    oauthProvider: {
        type: String,
        required: true
    },
    oauthId: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    displayName: {
        type: String,
        required: true
    },
    profilePictureUrl: {
        type: String,
        required: false
    },
    // --- NOUVEAU CHAMP ---
    role: {
        type: String,
        enum: ['user', 'admin'], // Définit les rôles possibles
        default: 'user' // Par défaut, tout nouvel utilisateur est un "user"
    }
}, {
    timestamps: true
});

userSchema.index({ oauthProvider: 1, oauthId: 1 }, { unique: true });

const User = mongoose.model('User', userSchema);

module.exports = User;