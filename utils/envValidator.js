// ===============================
// Fichier: utils/envValidator.js
// Utilitaire de validation des variables d'environnement
// ===============================

const crypto = require('crypto');

class EnvironmentValidator {
    constructor() {
        this.requiredVars = new Map();
        this.optionalVars = new Map();
        this.errors = [];
        this.warnings = [];
    }

    // Ajouter une variable requise avec ses règles de validation
    require(name, options = {}) {
        this.requiredVars.set(name, {
            ...options,
            required: true
        });
        return this;
    }

    // Ajouter une variable optionnelle avec une valeur par défaut
    optional(name, defaultValue, options = {}) {
        this.optionalVars.set(name, {
            ...options,
            defaultValue,
            required: false
        });
        return this;
    }

    // Valider toutes les variables
    validate() {
        this.errors = [];
        this.warnings = [];

        // Vérifier les variables requises
        this.requiredVars.forEach((rules, name) => {
            this._validateVariable(name, rules);
        });

        // Traiter les variables optionnelles
        this.optionalVars.forEach((rules, name) => {
            if (!process.env[name]) {
                process.env[name] = rules.defaultValue;
                this.warnings.push(`Variable '${name}' not set, using default: ${rules.defaultValue}`);
            } else {
                this._validateVariable(name, rules);
            }
        });

        // Afficher les résultats
        this._logResults();

        // Lancer une erreur si des problèmes critiques sont détectés
        if (this.errors.length > 0) {
            throw new Error(`Environment validation failed:\n${this.errors.join('\n')}`);
        }

        return {
            valid: this.errors.length === 0,
            errors: this.errors,
            warnings: this.warnings
        };
    }

    // Valider une variable individuelle
    _validateVariable(name, rules) {
        const value = process.env[name];

        // Vérifier la présence
        if (!value && rules.required) {
            this.errors.push(`❌ Required environment variable '${name}' is missing`);
            return;
        }

        if (!value) return; // Variable optionnelle non définie

        // Validation du format
        if (rules.format) {
            switch (rules.format) {
                case 'url':
                    if (!this._isValidUrl(value)) {
                        this.errors.push(`❌ '${name}' must be a valid URL`);
                    }
                    break;
                case 'port':
                    if (!this._isValidPort(value)) {
                        this.errors.push(`❌ '${name}' must be a valid port number (1-65535)`);
                    }
                    break;
                case 'email':
                    if (!this._isValidEmail(value)) {
                        this.errors.push(`❌ '${name}' must be a valid email address`);
                    }
                    break;
                case 'jwt_secret':
                    if (!this._isValidJwtSecret(value)) {
                        this.errors.push(`❌ '${name}' must be at least 32 characters long for security`);
                    }
                    break;
            }
        }

        // Validation de la longueur
        if (rules.minLength && value.length < rules.minLength) {
            this.errors.push(`❌ '${name}' must be at least ${rules.minLength} characters long`);
        }

        if (rules.maxLength && value.length > rules.maxLength) {
            this.errors.push(`❌ '${name}' must not exceed ${rules.maxLength} characters`);
        }

        // Validation des valeurs autorisées
        if (rules.allowedValues && !rules.allowedValues.includes(value)) {
            this.errors.push(`❌ '${name}' must be one of: ${rules.allowedValues.join(', ')}`);
        }

        // Validation personnalisée
        if (rules.validator && typeof rules.validator === 'function') {
            const result = rules.validator(value);
            if (result !== true) {
                this.errors.push(`❌ '${name}' ${result || 'failed custom validation'}`);
            }
        }

        // Avertissements de sécurité
        if (rules.security) {
            this._checkSecurity(name, value, rules.security);
        }
    }

    // Vérifications de sécurité
    _checkSecurity(name, value, securityRules) {
        if (securityRules.noDefaults) {
            const commonDefaults = ['password', '123456', 'admin', 'secret', 'default'];
            if (commonDefaults.some(def => value.toLowerCase().includes(def))) {
                this.warnings.push(`⚠️ '${name}' appears to contain default/weak values`);
            }
        }

        if (securityRules.entropy && !this._hasGoodEntropy(value)) {
            this.warnings.push(`⚠️ '${name}' has low entropy - consider using a stronger value`);
        }

        if (securityRules.noHardcoded && this._looksHardcoded(value)) {
            this.warnings.push(`⚠️ '${name}' appears to be hardcoded - ensure it's properly configured`);
        }
    }

    // Utilitaires de validation
    _isValidUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    _isValidPort(port) {
        const num = parseInt(port, 10);
        return !isNaN(num) && num >= 1 && num <= 65535;
    }

    _isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    _isValidJwtSecret(secret) {
        return secret.length >= 32;
    }

    _hasGoodEntropy(value) {
        // Calcul simple de l'entropie
        const uniqueChars = new Set(value).size;
        return uniqueChars >= Math.min(value.length * 0.7, 20);
    }

    _looksHardcoded(value) {
        // Détecter les valeurs qui semblent être hardcodées
        const patterns = [
            /^test/i,
            /^demo/i,
            /^example/i,
            /localhost/i,
            /127\.0\.0\.1/,
            /^(abc|123|password)/i
        ];
        return patterns.some(pattern => pattern.test(value));
    }

    _logResults() {
        if (this.warnings.length > 0) {
            console.log('\n🔍 Environment Validation Warnings:');
            this.warnings.forEach(warning => console.log(`  ${warning}`));
        }

        if (this.errors.length > 0) {
            console.log('\n💥 Environment Validation Errors:');
            this.errors.forEach(error => console.log(`  ${error}`));
        } else {
            console.log('\n✅ Environment validation passed');
        }
    }

    // Générer un secret sécurisé
    static generateSecureSecret(length = 64) {
        return crypto.randomBytes(length).toString('hex');
    }

    // Créer un exemple de fichier .env
    static createExampleEnv() {
        return `# Configuration de base
MONGODB_URI=mongodb://localhost:27017/publication_organizer_db
PORT=3000

# Authentification Google
GOOGLE_CLIENT_ID=your_google_client_id_here

# Sécurité - CHANGEZ CES VALEURS EN PRODUCTION
JWT_SECRET=${this.generateSecureSecret(32)}
SESSION_SECRET=${this.generateSecureSecret(32)}

# Environnement
NODE_ENV=development

# Optionnel - Serveur SMTP pour les emails
# SMTP_HOST=smtp.example.com
# SMTP_PORT=587
# SMTP_USER=your_email@example.com
# SMTP_PASS=your_email_password

# Optionnel - Configuration de cache
# REDIS_URL=redis://localhost:6379
`;
    }
}

module.exports = EnvironmentValidator;