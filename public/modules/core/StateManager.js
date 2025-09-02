// ===============================
// File: modules/core/StateManager.js
// Centralized state management system
// ===============================

/**
 * StateManager provides centralized state management with change notifications
 * and persistence capabilities
 */
class StateManager {
    constructor(eventBus = null) {
        this.state = {
            // Application state
            app: {
                initialized: false,
                currentTab: 'galleries',
                loading: false,
                error: null
            },
            
            // Gallery state
            gallery: {
                currentGalleryId: null,
                galleries: [],
                currentGalleryName: '',
                images: [],
                sortOption: 'name_asc',
                thumbSize: { width: 200, height: 200 }
            },
            
            // Publication state
            publication: {
                publications: [],
                currentPublicationId: null,
                selectedPublications: new Set()
            },
            
            // Schedule state
            schedule: {
                scheduleData: {},
                scheduleContext: {
                    allUserPublications: []
                }
            },
            
            // UI state
            ui: {
                sidebarVisible: true,
                modalOpen: false,
                currentModal: null,
                notifications: []
            },
            
            // User state
            user: {
                isAuthenticated: false,
                userInfo: null,
                preferences: {}
            }
        };
        
        this.eventBus = eventBus;
        this.subscribers = new Map();
        this.history = [];
        this.maxHistoryLength = 50;
        
        // Debounced persistence
        this.debouncedPersist = this.debounce(() => this.persistState(), 1000);
    }
    
    /**
     * Get a value from the state using dot notation
     * @param {string} path - Dot-separated path (e.g., 'gallery.currentGalleryId')
     * @returns {*} The value at the path
     */
    get(path) {
        return this.getNestedValue(this.state, path);
    }
    
    /**
     * Set a value in the state using dot notation
     * @param {string} path - Dot-separated path
     * @param {*} value - Value to set
     * @param {Object} options - Options like { silent: true, persist: false }
     */
    set(path, value, options = {}) {
        const { silent = false, persist = true, addToHistory = true } = options;
        
        // Store previous state for history and change detection
        const previousState = this.deepClone(this.state);
        
        // Set the new value
        this.setNestedValue(this.state, path, value);
        
        // Add to history
        if (addToHistory) {
            this.addToHistory(previousState);
        }
        
        // Emit change events
        if (!silent) {
            this.notifySubscribers(path, value, this.getNestedValue(previousState, path));
            
            if (this.eventBus) {
                this.eventBus.emit('state:changed', {
                    path,
                    value,
                    previousValue: this.getNestedValue(previousState, path),
                    fullState: this.state
                });
            }
        }
        
        // Persist state
        if (persist) {
            this.debouncedPersist();
        }
    }
    
    /**
     * Update multiple values in the state
     * @param {Object} updates - Object with path-value pairs
     * @param {Object} options - Options
     */
    update(updates, options = {}) {
        const { silent = false, persist = true } = options;
        
        const previousState = this.deepClone(this.state);
        
        // Apply all updates
        for (const [path, value] of Object.entries(updates)) {
            this.setNestedValue(this.state, path, value);
        }
        
        this.addToHistory(previousState);
        
        // Emit change events
        if (!silent) {
            for (const [path, value] of Object.entries(updates)) {
                this.notifySubscribers(path, value, this.getNestedValue(previousState, path));
            }
            
            if (this.eventBus) {
                this.eventBus.emit('state:updated', {
                    updates,
                    fullState: this.state
                });
            }
        }
        
        if (persist) {
            this.debouncedPersist();
        }
    }
    
    /**
     * Subscribe to state changes for a specific path
     * @param {string} path - Path to watch
     * @param {Function} callback - Callback function
     * @returns {Function} Unsubscribe function
     */
    subscribe(path, callback) {
        if (!this.subscribers.has(path)) {
            this.subscribers.set(path, []);
        }
        
        const subscribers = this.subscribers.get(path);
        const subscriber = {
            callback,
            id: Date.now() + Math.random()
        };
        
        subscribers.push(subscriber);
        
        // Return unsubscribe function
        return () => {
            const index = subscribers.findIndex(s => s.id === subscriber.id);
            if (index !== -1) {
                subscribers.splice(index, 1);
            }
        };
    }
    
    /**
     * Notify subscribers of state changes
     */
    notifySubscribers(path, newValue, oldValue) {
        // Notify exact path subscribers
        if (this.subscribers.has(path)) {
            this.subscribers.get(path).forEach(subscriber => {
                try {
                    subscriber.callback(newValue, oldValue, path);
                } catch (error) {
                    console.error('Error in state subscriber:', error);
                }
            });
        }
        
        // Notify parent path subscribers (e.g., 'gallery' for 'gallery.currentGalleryId')
        const pathParts = path.split('.');
        for (let i = pathParts.length - 1; i > 0; i--) {
            const parentPath = pathParts.slice(0, i).join('.');
            if (this.subscribers.has(parentPath)) {
                const parentValue = this.get(parentPath);
                this.subscribers.get(parentPath).forEach(subscriber => {
                    try {
                        subscriber.callback(parentValue, null, parentPath, path);
                    } catch (error) {
                        console.error('Error in state subscriber:', error);
                    }
                });
            }
        }
    }
    
    /**
     * Reset state to initial values
     */
    reset(section = null) {
        if (section) {
            // Reset specific section
            this.set(section, this.getInitialState(section));
        } else {
            // Reset entire state
            this.state = this.getInitialState();
            this.notifyAllSubscribers();
        }
    }
    
    /**
     * Get initial state for a section or entire state
     */
    getInitialState(section = null) {
        const initialState = {
            app: {
                initialized: false,
                currentTab: 'galleries',
                loading: false,
                error: null
            },
            gallery: {
                currentGalleryId: null,
                galleries: [],
                currentGalleryName: '',
                images: [],
                sortOption: 'name_asc',
                thumbSize: { width: 200, height: 200 }
            },
            publication: {
                publications: [],
                currentPublicationId: null,
                selectedPublications: new Set()
            },
            schedule: {
                scheduleData: {},
                scheduleContext: {
                    allUserPublications: []
                }
            },
            ui: {
                sidebarVisible: true,
                modalOpen: false,
                currentModal: null,
                notifications: []
            },
            user: {
                isAuthenticated: false,
                userInfo: null,
                preferences: {}
            }
        };
        
        return section ? initialState[section] : initialState;
    }
    
    /**
     * Get nested value from object using dot notation
     */
    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => {
            return current && current[key] !== undefined ? current[key] : undefined;
        }, obj);
    }
    
    /**
     * Set nested value in object using dot notation
     */
    setNestedValue(obj, path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        
        let current = obj;
        for (const key of keys) {
            if (current[key] === undefined || current[key] === null) {
                current[key] = {};
            }
            current = current[key];
        }
        
        current[lastKey] = value;
    }
    
    /**
     * Deep clone an object
     */
    deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj);
        if (obj instanceof Set) return new Set(obj);
        if (obj instanceof Map) return new Map(obj);
        if (Array.isArray(obj)) return obj.map(item => this.deepClone(item));
        
        const cloned = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                cloned[key] = this.deepClone(obj[key]);
            }
        }
        return cloned;
    }
    
    /**
     * Add state to history
     */
    addToHistory(state) {
        this.history.push({
            state: this.deepClone(state),
            timestamp: Date.now()
        });
        
        // Limit history size
        if (this.history.length > this.maxHistoryLength) {
            this.history.shift();
        }
    }
    
    /**
     * Undo last state change
     */
    undo() {
        if (this.history.length === 0) return false;
        
        const lastState = this.history.pop();
        this.state = lastState.state;
        this.notifyAllSubscribers();
        
        return true;
    }
    
    /**
     * Notify all subscribers
     */
    notifyAllSubscribers() {
        for (const [path, subscribers] of this.subscribers) {
            const value = this.get(path);
            subscribers.forEach(subscriber => {
                try {
                    subscriber.callback(value, null, path);
                } catch (error) {
                    console.error('Error in state subscriber:', error);
                }
            });
        }
    }
    
    /**
     * Persist state to localStorage
     */
    persistState() {
        try {
            const stateToPersist = {
                gallery: this.state.gallery,
                ui: this.state.ui,
                user: this.state.user.preferences
            };
            
            localStorage.setItem('publicationOrganizerState', JSON.stringify(stateToPersist));
        } catch (error) {
            console.warn('Failed to persist state:', error);
        }
    }
    
    /**
     * Load state from localStorage
     */
    loadPersistedState() {
        try {
            const persistedState = localStorage.getItem('publicationOrganizerState');
            if (persistedState) {
                const parsed = JSON.parse(persistedState);
                
                // Safely merge persisted state
                if (parsed.gallery) {
                    this.update({
                        'gallery.sortOption': parsed.gallery.sortOption || 'name_asc',
                        'gallery.thumbSize': parsed.gallery.thumbSize || { width: 200, height: 200 }
                    }, { silent: true, persist: false });
                }
                
                if (parsed.ui) {
                    this.update({
                        'ui.sidebarVisible': parsed.ui.sidebarVisible !== false
                    }, { silent: true, persist: false });
                }
                
                if (parsed.user) {
                    this.set('user.preferences', parsed.user, { silent: true, persist: false });
                }
            }
        } catch (error) {
            console.warn('Failed to load persisted state:', error);
        }
    }
    
    /**
     * Debounce utility
     */
    debounce(func, delay) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    }
    
    /**
     * Get debug information
     */
    getDebugInfo() {
        return {
            stateSize: JSON.stringify(this.state).length,
            historyLength: this.history.length,
            subscriberCount: Array.from(this.subscribers.values()).reduce((total, subs) => total + subs.length, 0),
            subscribedPaths: Array.from(this.subscribers.keys())
        };
    }
}

// Create global instance
const globalStateManager = new StateManager(window.eventBus);

// Export for use in other modules
window.StateManager = StateManager;
window.stateManager = globalStateManager;

export default StateManager;
export { globalStateManager as stateManager };