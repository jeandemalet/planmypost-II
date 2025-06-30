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
    }
}, {
    timestamps: true
});

// Créer un index composé unique pour garantir qu'un utilisateur 
// ne puisse être créé qu'une seule fois par fournisseur OAuth.
userSchema.index({ oauthProvider: 1, oauthId: 1 }, { unique: true });

const User = mongoose.model('User', userSchema);

module.exports = User;
