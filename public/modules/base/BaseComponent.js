// ===============================
// File: modules/base/BaseComponent.js
// Base component class for modular architecture
// ===============================

/**
 * Base component class providing common functionality for all UI components
 */
class BaseComponent {
    constructor(name, dependencies = {}) {
        this.name = name;
        this.stateManager = dependencies.stateManager || null;
        this.eventBus = dependencies.eventBus || null;
        this.apiService = dependencies.apiService || null;
        this.initialized = false;
        this.destroyed = false;
        
        // Component state
        this.state = {};
        
        // Event listeners for cleanup
        this.eventListeners = [];
        
        // DOM elements managed by this component
        this.elements = {};
        
        this.logger = this.createLogger();
    }
    
    createLogger() {
        return {
            info: (message, data = {}) => {
                if (window.logger) {
                    window.logger.info(`[${this.name}] ${message}`, { component: this.name, ...data });
                }
                console.log(`[${this.name}] ${message}`, data);
            },
            warn: (message, data = {}) => {
                if (window.logger) {
                    window.logger.warn(`[${this.name}] ${message}`, { component: this.name, ...data });
                }
                console.warn(`[${this.name}] ${message}`, data);
            },
            error: (message, error = null, data = {}) => {
                if (window.logger) {
                    window.logger.error(`[${this.name}] ${message}`, { 
                        component: this.name, 
                        error: error?.message || error,
                        stack: error?.stack,
                        ...data 
                    });
                }
                console.error(`[${this.name}] ${message}`, error, data);
            }
        };
    }
    
    /**
     * Initialize the component
     */
    async initialize() {
        if (this.initialized) {
            this.logger.warn('Component already initialized');
            return;
        }
        
        try {
            this.logger.info('Initializing component');
            
            await this.onInitialize();
            this.setupEventListeners();
            
            this.initialized = true;
            this.logger.info('Component initialized successfully');
            
            this.emit('initialized');
        } catch (error) {
            this.logger.error('Failed to initialize component', error);
            throw error;
        }
    }
    
    /**
     * Destroy the component and cleanup resources
     */
    destroy() {
        if (this.destroyed) {
            this.logger.warn('Component already destroyed');
            return;
        }
        
        try {
            this.logger.info('Destroying component');
            
            this.onDestroy();
            this.removeAllEventListeners();
            this.clearElements();
            
            this.destroyed = true;
            this.initialized = false;
            
            this.emit('destroyed');
            this.logger.info('Component destroyed successfully');
        } catch (error) {
            this.logger.error('Failed to destroy component cleanly', error);
        }
    }
    
    /**
     * Override in child classes for component-specific initialization
     */
    async onInitialize() {
        // Override in child classes
    }
    
    /**
     * Override in child classes for component-specific cleanup
     */
    onDestroy() {
        // Override in child classes
    }
    
    /**
     * Setup event listeners - override in child classes
     */
    setupEventListeners() {
        // Override in child classes
    }
    
    /**
     * Add event listener with automatic cleanup tracking
     */
    addEventListener(element, event, handler, options = {}) {
        if (!element || typeof handler !== 'function') {
            this.logger.warn('Invalid element or handler for event listener', { event });
            return;
        }
        
        element.addEventListener(event, handler, options);
        
        this.eventListeners.push({
            element,
            event,
            handler,
            options
        });
    }
    
    /**
     * Remove all tracked event listeners
     */
    removeAllEventListeners() {
        this.eventListeners.forEach(({ element, event, handler, options }) => {
            try {
                element.removeEventListener(event, handler, options);
            } catch (error) {
                this.logger.warn('Failed to remove event listener', error, { event });
            }
        });
        
        this.eventListeners = [];
    }
    
    /**
     * Store DOM element reference for cleanup
     */
    addElement(key, element) {
        if (!element) {
            this.logger.warn('Attempted to add null/undefined element', { key });
            return;
        }
        
        this.elements[key] = element;
    }
    
    /**
     * Get stored DOM element
     */
    getElement(key) {
        return this.elements[key] || null;
    }
    
    /**
     * Clear all stored DOM elements
     */
    clearElements() {
        this.elements = {};
    }
    
    /**
     * Emit event through EventBus if available
     */
    emit(eventName, data = {}) {
        if (this.eventBus) {
            this.eventBus.emit(eventName, {
                component: this.name,
                ...data
            });
        }
    }
    
    /**
     * Subscribe to EventBus events
     */
    subscribe(eventName, handler) {
        if (this.eventBus) {
            return this.eventBus.subscribe(eventName, handler);
        }
        return null;
    }
    
    /**
     * Update component state
     */
    setState(updates) {
        const previousState = { ...this.state };
        this.state = { ...this.state, ...updates };
        
        this.onStateChange(this.state, previousState);
        this.emit('stateChanged', { 
            currentState: this.state, 
            previousState 
        });
    }
    
    /**
     * Get component state
     */
    getState() {
        return { ...this.state };
    }
    
    /**
     * Override in child classes to handle state changes
     */
    onStateChange(currentState, previousState) {
        // Override in child classes
    }
    
    /**
     * Show error notification using global error handler
     */
    showError(title, message, error = null) {
        if (window.errorHandler) {
            window.errorHandler.showError(title, message);
        } else {
            console.error(`${title}: ${message}`, error);
        }
    }
    
    /**
     * Show success notification using global error handler
     */
    showSuccess(title, message) {
        if (window.errorHandler) {
            window.errorHandler.showSuccess(title, message);
        } else {
            console.log(`${title}: ${message}`);
        }
    }
    
    /**
     * Handle API errors with user-friendly messages
     */
    handleApiError(error, context = '') {
        this.logger.error('API error occurred', error, { context });
        
        if (window.errorHandler) {
            window.errorHandler.handleApiError(error, context);
        } else {
            console.error('API Error:', error);
        }
    }
    
    /**
     * Validate that component is initialized before operations
     */
    ensureInitialized() {
        if (!this.initialized || this.destroyed) {
            throw new Error(`Component ${this.name} is not initialized or has been destroyed`);
        }
    }
    
    /**
     * Safe DOM query selector with error handling
     */
    querySelector(selector, required = false) {
        try {
            const element = document.querySelector(selector);
            
            if (required && !element) {
                throw new Error(`Required element not found: ${selector}`);
            }
            
            return element;
        } catch (error) {
            this.logger.error('Failed to query selector', error, { selector });
            if (required) throw error;
            return null;
        }
    }
    
    /**
     * Safe DOM query selector all with error handling
     */
    querySelectorAll(selector) {
        try {
            return document.querySelectorAll(selector);
        } catch (error) {
            this.logger.error('Failed to query selector all', error, { selector });
            return [];
        }
    }
}

// Export for use in other modules
window.BaseComponent = BaseComponent;
export default BaseComponent;