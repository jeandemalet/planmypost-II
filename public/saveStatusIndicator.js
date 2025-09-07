// ===============================
// File: public/saveStatusIndicator.js (Corrigé et Intégré)
// Système de feedback visuel pour les sauvegardes automatiques
// ===============================

// Assurez-vous que BaseComponent est chargé avant ce script dans votre index.html
// import BaseComponent from './modules/base/BaseComponent.js';

class SaveStatusIndicator extends BaseComponent {
    constructor(dependencies = {}) {
        // Appel du constructeur parent avec le nom du composant et ses dépendances
        super('SaveStatusIndicator', dependencies);

        // Initialisation de l'état local du composant
        this.indicator = null;
        this.timeoutId = null;
        this.currentStatus = 'idle';
    }

    /**
     * Méthode du cycle de vie appelée par le ComponentLoader.
     * Remplace la logique de l'ancien constructeur et de init().
     */
    async onInitialize() {
        this.logger.info('Initializing SaveStatusIndicator component');
        this.initializeIndicator();
    }

    /**
     * Crée les éléments DOM et les styles nécessaires pour l'indicateur.
     */
    initializeIndicator() {
        // Créer l'élément indicateur
        this.indicator = document.createElement('div');
        this.indicator.id = 'save-status-indicator';
        this.indicator.className = 'save-status-indicator idle';
        
        // Ajouter au DOM et stocker la référence pour un nettoyage propre
        document.body.appendChild(this.indicator);
        this.addElement('indicator', this.indicator);
        
        // Ajouter les styles si non présents
        if (!document.getElementById('save-status-styles')) {
            this.addStyles();
        }
    }

    addStyles() {
        const styles = document.createElement('style');
        styles.id = 'save-status-styles';
        styles.textContent = `
            .save-status-indicator {
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 9998;
                padding: 8px 16px;
                border-radius: 20px;
                font-size: 12px;
                font-weight: 500;
                opacity: 0;
                transition: all 0.3s ease;
                pointer-events: none;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
            }
            
            .save-status-indicator.visible {
                opacity: 1;
                transform: translateX(-50%) translateY(0);
            }
            
            .save-status-indicator.idle {
                display: none;
            }
            
            .save-status-indicator.typing {
                background: rgba(255, 193, 7, 0.9);
                color: #856404;
                border: 1px solid rgba(255, 193, 7, 0.5);
            }
            
            .save-status-indicator.saving {
                background: rgba(0, 123, 255, 0.9);
                color: white;
                border: 1px solid rgba(0, 123, 255, 0.5);
            }
            
            .save-status-indicator.saved {
                background: rgba(40, 167, 69, 0.9);
                color: white;
                border: 1px solid rgba(40, 167, 69, 0.5);
            }
            
            .save-status-indicator.error {
                background: rgba(220, 53, 69, 0.9);
                color: white;
                border: 1px solid rgba(220, 53, 69, 0.5);
            }
            
            .save-status-indicator .spinner {
                display: inline-block;
                width: 12px;
                height: 12px;
                border: 2px solid transparent;
                border-top: 2px solid currentColor;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin-right: 6px;
                vertical-align: middle;
            }
            
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            
            .save-status-indicator .icon {
                margin-right: 6px;
                vertical-align: middle;
            }
            
            /* Animation variants for different states */
            .save-status-indicator.pulse {
                animation: pulse 2s infinite;
            }
            
            @keyframes pulse {
                0% { opacity: 0.9; }
                50% { opacity: 1; }
                100% { opacity: 0.9; }
            }
        `;
        document.head.appendChild(styles);
        this.addElement('styles', styles);
    }

    // --- Les méthodes existantes (show, hide, etc.) restent inchangées ---

    show(status, message, duration = null) {
        if (!this.indicator) return;

        // Clear any existing timeout
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }

        // Update status
        this.currentStatus = status;
        this.indicator.className = `save-status-indicator ${status}`;
        
        // Set message with appropriate icon
        let content = '';
        switch (status) {
            case 'typing':
                content = `<span class="icon">✏️</span>${message || 'En cours de saisie...'}`;
                break;
            case 'saving':
                content = `<span class="spinner"></span>${message || 'Sauvegarde...'}`;
                break;
            case 'saved':
                content = `<span class="icon">✅</span>${message || 'Enregistré'}`;
                break;
            case 'error':
                content = `<span class="icon">❌</span>${message || 'Erreur de sauvegarde'}`;
                break;
            default:
                content = message || '';
        }
        
        this.indicator.innerHTML = content;

        // Show indicator
        this.indicator.classList.add('visible');

        // Auto-hide after duration (except for errors)
        const hideDelay = duration ?? (status === 'saved' ? 2000 : 0);
        if (hideDelay > 0) {
            this.timeoutId = setTimeout(() => this.hide(), hideDelay);
        }
    }

    hide() {
        if (!this.indicator) return;

        this.indicator.classList.remove('visible');
        this.currentStatus = 'idle';
        
        // Clear timeout
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
        
        // Reset to idle state after animation
        setTimeout(() => {
            if (this.currentStatus === 'idle') {
                this.indicator.className = 'save-status-indicator idle';
            }
        }, 300);
    }

    // Convenience methods
    showTyping(message) {
        this.show('typing', message);
    }

    showSaving(message) {
        this.show('saving', message);
    }

    showSaved(message, duration = 2000) {
        this.show('saved', message, duration);
    }

    showError(message) {
        this.show('error', message);
    }

    // Method to integrate with existing debounced save functions
    wrapSaveFunction(saveFunction, context = '') {
        return async (...args) => {
            try {
                this.show('saving', context ? `Sauvegarde ${context}...` : undefined);
                
                const result = await saveFunction(...args);
                
                this.show('saved', context ? `${context} enregistré` : undefined);
                
                return result;
            } catch (error) {
                this.logger.error('Save function failed', error);
                this.show('error', context ? `Erreur: ${context}` : 'Erreur de sauvegarde');
                throw error;
            }
        };
    }

    // Method for input change detection
    onInputChange(callback, context = '') {
        let inputTimeout = null;
        
        return (event) => {
            // Show typing indicator
            this.showTyping(context ? `Modification ${context}...` : undefined);
            
            // Clear previous timeout
            if (inputTimeout) {
                clearTimeout(inputTimeout);
            }
            
            // Set new timeout to detect when user stops typing
            inputTimeout = setTimeout(() => {
                if (this.currentStatus === 'typing') {
                    this.hide(); // Hide typing indicator when user stops
                }
            }, 1000);
            
            // Call the original callback
            if (callback) {
                callback(event);
            }
        };
    }

    /**
     * Méthode de nettoyage appelée par l'architecture modulaire.
     */
    onDestroy() {
        this.logger.info('Destroying SaveStatusIndicator');
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
        }
        // Le nettoyage des éléments DOM est géré automatiquement par BaseComponent
    }
}

// Exposer la CLASSE pour que le ComponentLoader puisse la trouver et l'instancier
window.SaveStatusIndicator = SaveStatusIndicator;