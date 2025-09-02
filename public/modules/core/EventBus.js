// ===============================
// File: modules/core/EventBus.js
// Event bus for inter-component communication
// ===============================

/**
 * EventBus provides a centralized event system for component communication
 * Supports event emission, subscription, and automatic cleanup
 */
class EventBus {
    constructor() {
        this.events = new Map();
        this.debugMode = false;
        this.maxListeners = 50; // Prevent memory leaks
    }
    
    /**
     * Enable or disable debug logging
     */
    setDebugMode(enabled) {
        this.debugMode = enabled;
    }
    
    /**
     * Subscribe to an event
     * @param {string} eventName - Name of the event
     * @param {Function} callback - Callback function
     * @param {Object} options - Options like { once: true }
     * @returns {Function} Unsubscribe function
     */
    subscribe(eventName, callback, options = {}) {
        if (typeof callback !== 'function') {
            throw new Error('Callback must be a function');
        }
        
        if (!this.events.has(eventName)) {
            this.events.set(eventName, []);
        }
        
        const listeners = this.events.get(eventName);
        
        // Check for memory leaks
        if (listeners.length >= this.maxListeners) {
            console.warn(`EventBus: Event '${eventName}' has ${listeners.length} listeners. Possible memory leak?`);
        }
        
        const listener = {
            callback,
            once: options.once || false,
            id: Date.now() + Math.random()
        };
        
        listeners.push(listener);
        
        if (this.debugMode) {
            console.log(`EventBus: Subscribed to '${eventName}' (${listeners.length} total listeners)`);
        }
        
        // Return unsubscribe function
        return () => this.unsubscribe(eventName, listener.id);
    }
    
    /**
     * Subscribe to an event only once
     */
    once(eventName, callback) {
        return this.subscribe(eventName, callback, { once: true });
    }
    
    /**
     * Unsubscribe from an event
     */
    unsubscribe(eventName, listenerId) {
        if (!this.events.has(eventName)) {
            return false;
        }
        
        const listeners = this.events.get(eventName);
        const index = listeners.findIndex(listener => listener.id === listenerId);
        
        if (index !== -1) {
            listeners.splice(index, 1);
            
            if (this.debugMode) {
                console.log(`EventBus: Unsubscribed from '${eventName}' (${listeners.length} remaining listeners)`);
            }
            
            // Clean up empty event arrays
            if (listeners.length === 0) {
                this.events.delete(eventName);
            }
            
            return true;
        }
        
        return false;
    }
    
    /**
     * Emit an event to all subscribers
     */
    emit(eventName, data = {}) {
        if (!this.events.has(eventName)) {
            if (this.debugMode) {
                console.log(`EventBus: No listeners for event '${eventName}'`);
            }
            return 0;
        }
        
        const listeners = this.events.get(eventName);
        const listenersToRemove = [];
        let callbacksExecuted = 0;
        
        // Create a copy of listeners to avoid issues if callbacks modify the array
        const listenersCopy = [...listeners];
        
        for (const listener of listenersCopy) {
            try {
                listener.callback(data);
                callbacksExecuted++;
                
                // Mark 'once' listeners for removal
                if (listener.once) {
                    listenersToRemove.push(listener.id);
                }
            } catch (error) {
                console.error(`EventBus: Error in callback for event '${eventName}':`, error);
            }
        }
        
        // Remove 'once' listeners
        listenersToRemove.forEach(id => {
            this.unsubscribe(eventName, id);
        });
        
        if (this.debugMode) {
            console.log(`EventBus: Emitted '${eventName}' to ${callbacksExecuted} listeners`, data);
        }
        
        return callbacksExecuted;
    }
    
    /**
     * Get all event names currently being listened to
     */
    getEventNames() {
        return Array.from(this.events.keys());
    }
    
    /**
     * Get number of listeners for an event
     */
    getListenerCount(eventName) {
        return this.events.has(eventName) ? this.events.get(eventName).length : 0;
    }
    
    /**
     * Get total number of listeners across all events
     */
    getTotalListenerCount() {
        let total = 0;
        for (const listeners of this.events.values()) {
            total += listeners.length;
        }
        return total;
    }
    
    /**
     * Remove all listeners for a specific event
     */
    removeAllListeners(eventName) {
        if (eventName) {
            this.events.delete(eventName);
            if (this.debugMode) {
                console.log(`EventBus: Removed all listeners for '${eventName}'`);
            }
        } else {
            // Remove all listeners for all events
            this.events.clear();
            if (this.debugMode) {
                console.log('EventBus: Removed all listeners for all events');
            }
        }
    }
    
    /**
     * Check if there are any listeners for an event
     */
    hasListeners(eventName) {
        return this.events.has(eventName) && this.events.get(eventName).length > 0;
    }
    
    /**
     * Get debug information about the EventBus
     */
    getDebugInfo() {
        const info = {
            totalEvents: this.events.size,
            totalListeners: this.getTotalListenerCount(),
            events: {}
        };
        
        for (const [eventName, listeners] of this.events) {
            info.events[eventName] = {
                listenerCount: listeners.length,
                listeners: listeners.map(l => ({
                    id: l.id,
                    once: l.once
                }))
            };
        }
        
        return info;
    }
    
    /**
     * Validate event name to prevent common issues
     */
    static isValidEventName(eventName) {
        return typeof eventName === 'string' && eventName.length > 0;
    }
}

// Common event names used throughout the application
EventBus.Events = {
    // Application lifecycle
    APP_INITIALIZED: 'app:initialized',
    APP_DESTROYED: 'app:destroyed',
    
    // Gallery events
    GALLERY_SELECTED: 'gallery:selected',
    GALLERY_CREATED: 'gallery:created',
    GALLERY_UPDATED: 'gallery:updated',
    GALLERY_DELETED: 'gallery:deleted',
    
    // Image events
    IMAGE_UPLOADED: 'image:uploaded',
    IMAGE_DELETED: 'image:deleted',
    IMAGE_SELECTED: 'image:selected',
    IMAGE_CROPPED: 'image:cropped',
    
    // Publication events
    PUBLICATION_CREATED: 'publication:created',
    PUBLICATION_UPDATED: 'publication:updated',
    PUBLICATION_DELETED: 'publication:deleted',
    PUBLICATION_SELECTED: 'publication:selected',
    
    // UI events
    TAB_CHANGED: 'ui:tabChanged',
    MODAL_OPENED: 'ui:modalOpened',
    MODAL_CLOSED: 'ui:modalClosed',
    NOTIFICATION_SHOWN: 'ui:notificationShown',
    
    // Save events
    SAVE_STARTED: 'save:started',
    SAVE_SUCCESS: 'save:success',
    SAVE_ERROR: 'save:error',
    
    // Error events
    ERROR_OCCURRED: 'error:occurred',
    WARNING_OCCURRED: 'warning:occurred'
};

// Create global instance
const globalEventBus = new EventBus();

// Export for use in other modules
window.EventBus = EventBus;
window.eventBus = globalEventBus;

export default EventBus;
export { globalEventBus as eventBus };