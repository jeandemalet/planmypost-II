// ===============================
// Fichier: config/environment.js
// Configuration et validation des variables d'environnement
// ===============================

const EnvironmentValidator = require('../utils/envValidator');

// Configuration de validation des variables d'environnement
function validateEnvironment() {
    const validator = new EnvironmentValidator();

    // Variables requises
    validator
        .require('MONGODB_URI', {
            format: 'url',
            security: { noHardcoded: true }
        })
        .require('JWT_SECRET', {
            format: 'jwt_secret',
            minLength: 32,
            security: { 
                noDefaults: true, 
                entropy: true,
                noHardcoded: true
            }
        })
        .require('GOOGLE_CLIENT_ID', {
            minLength: 10,
            validator: (value) => {
                if (!value.includes('.apps.googleusercontent.com')) {
                    return 'must be a valid Google Client ID';
                }
                return true;
            }
        });

    // Variables optionnelles avec valeurs par défaut
    validator
        .optional('PORT', '3000', {
            format: 'port'
        })
        .optional('NODE_ENV', 'development', {
            allowedValues: ['development', 'production', 'test']
        })
        .optional('SESSION_SECRET', EnvironmentValidator.generateSecureSecret(32), {
            minLength: 32,
            security: { 
                noDefaults: true, 
                entropy: true 
            }
        })
        .optional('LOG_LEVEL', 'info', {
            allowedValues: ['error', 'warn', 'info', 'debug']
        })
        .optional('MAX_FILE_SIZE', '50', {
            validator: (value) => {
                const num = parseInt(value, 10);
                if (isNaN(num) || num < 1 || num > 100) {
                    return 'must be a number between 1 and 100 (MB)';
                }
                return true;
            }
        })
        .optional('RATE_LIMIT_WINDOW', '15', {
            validator: (value) => {
                const num = parseInt(value, 10);
                if (isNaN(num) || num < 1 || num > 60) {
                    return 'must be a number between 1 and 60 (minutes)';
                }
                return true;
            }
        })
        .optional('RATE_LIMIT_MAX', '500', {
            validator: (value) => {
                const num = parseInt(value, 10);
                if (isNaN(num) || num < 10 || num > 10000) {
                    return 'must be a number between 10 and 10000 (requests)';
                }
                return true;
            }
        })
        .optional('FRONTEND_URL', '', {
            validator: (value) => {
                if (process.env.NODE_ENV === 'production' && !value) {
                    return 'required in production for CORS security';
                }
                if (value && !/^https?:\/\//.test(value)) {
                    return 'must be a valid URL (http:// or https://)';
                }
                return true;
            }
        })
        .optional('ADMIN_URL', '', {
            validator: (value) => {
                if (value && !/^https?:\/\//.test(value)) {
                    return 'must be a valid URL (http:// or https://)';
                }
                return true;
            }
        });

    // Exécuter la validation
    return validator.validate();
}

// Configuration sécurisée pour la production
function configureForProduction() {
    if (process.env.NODE_ENV === 'production') {
        // Vérifications supplémentaires pour la production
        const productionChecks = [
            {
                check: () => process.env.JWT_SECRET !== 'a8b3d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z7a8b9c0d1e2f3',
                message: '🔴 CRITICAL: Default JWT_SECRET detected in production!'
            },
            {
                check: () => !process.env.MONGODB_URI.includes('localhost'),
                message: '⚠️ WARNING: Using localhost MongoDB in production'
            },
            {
                check: () => process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32,
                message: '🔴 CRITICAL: SESSION_SECRET too short for production'
            }
        ];

        let hasErrors = false;
        productionChecks.forEach(({ check, message }) => {
            if (!check()) {
                console.error(message);
                if (message.includes('CRITICAL')) {
                    hasErrors = true;
                }
            }
        });

        if (hasErrors) {
            console.error('\n💥 Critical security issues detected in production environment!');
            console.error('Please review your environment configuration before deployment.');
            process.exit(1);
        }

        console.log('✅ Production environment security checks passed');
    }
}

// Afficher la configuration (en masquant les secrets)
function displayConfiguration() {
    console.log('\n📋 Application Configuration:');
    console.log(`  Environment: ${process.env.NODE_ENV}`);
    console.log(`  Port: ${process.env.PORT}`);
    console.log(`  MongoDB: ${process.env.MONGODB_URI.replace(/\/\/.*@/, '//***:***@')}`);
    console.log(`  JWT Secret: ${process.env.JWT_SECRET ? '*'.repeat(32) : 'NOT SET'}`);
    console.log(`  Session Secret: ${process.env.SESSION_SECRET ? '*'.repeat(32) : 'NOT SET'}`);
    console.log(`  Google Client ID: ${process.env.GOOGLE_CLIENT_ID ? process.env.GOOGLE_CLIENT_ID.substring(0, 20) + '...' : 'NOT SET'}`);
    console.log(`  Max File Size: ${process.env.MAX_FILE_SIZE || '50'}MB`);
    console.log(`  Rate Limit: ${process.env.RATE_LIMIT_MAX || '500'} requests per ${process.env.RATE_LIMIT_WINDOW || '15'} minutes`);
    console.log(`  Frontend URL: ${process.env.FRONTEND_URL || 'Not configured (development mode)'}`);
    console.log(`  Admin URL: ${process.env.ADMIN_URL || 'Not configured'}`);
}

// Créer un fichier .env.example
function createEnvExample() {
    const fs = require('fs');
    const path = require('path');
    
    const exampleContent = EnvironmentValidator.createExampleEnv();
    const examplePath = path.join(__dirname, '..', '.env.example');
    
    try {
        fs.writeFileSync(examplePath, exampleContent);
        console.log(`✅ Created .env.example file at ${examplePath}`);
    } catch (error) {
        console.error(`❌ Failed to create .env.example: ${error.message}`);
    }
}

module.exports = {
    validateEnvironment,
    configureForProduction,
    displayConfiguration,
    createEnvExample
};