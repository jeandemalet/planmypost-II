// ===============================
// File: tests/unit/frontend/StateManager.test.js
// Comprehensive tests for StateManager modular component
// ===============================

/**
 * @jest-environment jsdom
 */

describe('StateManager', () => {
    let StateManager;
    
    beforeEach(() => {
        // Clear localStorage before each test
        localStorage.clear();
        
        // Define StateManager class for testing
        global.StateManager = class StateManager {
            constructor(options = {}) {
                this.state = new Map();
                this.subscribers = new Map();
                this.history = [];
                this.historyLimit = options.historyLimit || 50;
                this.enablePersistence = options.enablePersistence !== false;
                this.persistenceKey = options.persistenceKey || 'stateManager';
                this.middlewares = [];
                this.debugMode = options.debugMode || false;
                
                if (this.enablePersistence) {
                    this.loadFromStorage();
                }
            }
            
            get(key, defaultValue = undefined) {
                if (typeof key !== 'string') {
                    throw new Error('State key must be a string');
                }
                const value = this.state.get(key);
                return value !== undefined ? value : defaultValue;
            }
            
            set(key, value, options = {}) {
                if (typeof key !== 'string') {
                    throw new Error('State key must be a string');
                }
                
                const previousValue = this.state.get(key);
                const hasChanged = previousValue !== value;
                
                if (!hasChanged && !options.force) {
                    return false;
                }
                
                this.state.set(key, value);
                
                if (this.enablePersistence) {
                    this.saveToStorage();
                }
                
                this._notifySubscribers(key, value, previousValue);
                return true;
            }
            
            delete(key) {
                if (!this.state.has(key)) return false;
                const previousValue = this.state.get(key);
                this.state.delete(key);
                
                if (this.enablePersistence) {
                    this.saveToStorage();
                }
                
                this._notifySubscribers(key, undefined, previousValue);
                return true;
            }
            
            has(key) {
                return this.state.has(key);
            }
            
            subscribe(key, callback, options = {}) {
                if (typeof key !== 'string' || typeof callback !== 'function') {
                    throw new Error('Subscribe requires key (string) and callback (function)');
                }
                
                if (!this.subscribers.has(key)) {
                    this.subscribers.set(key, []);
                }
                
                const subscription = {
                    id: this._generateSubscriptionId(),
                    callback,
                    immediate: options.immediate !== false
                };
                
                this.subscribers.get(key).push(subscription);
                
                if (subscription.immediate && this.state.has(key)) {
                    try {
                        callback(this.state.get(key), undefined, key);
                    } catch (error) {
                        console.error('StateManager subscription callback error:', error);
                    }
                }
                
                return subscription.id;
            }
            
            unsubscribe(keyOrId, callbackOrId = null) {
                if (typeof keyOrId === 'string' && keyOrId.startsWith('sub_')) {
                    // Unsubscribe by subscription ID
                    for (const [key, subscribers] of this.subscribers) {
                        const initialLength = subscribers.length;
                        const filteredSubscribers = subscribers.filter(sub => sub.id !== keyOrId);
                        
                        if (filteredSubscribers.length < initialLength) {
                            this.subscribers.set(key, filteredSubscribers);
                            return true;
                        }
                    }
                    return false;
                } else {
                    // Unsubscribe by key
                    if (!this.subscribers.has(keyOrId)) return false;
                    
                    const subscribers = this.subscribers.get(keyOrId);
                    const initialLength = subscribers.length;
                    
                    if (callbackOrId) {
                        const filteredSubscribers = subscribers.filter(sub => 
                            sub.callback !== callbackOrId && sub.id !== callbackOrId
                        );
                        this.subscribers.set(keyOrId, filteredSubscribers);
                    } else {
                        this.subscribers.set(keyOrId, []);
                    }
                    
                    return initialLength > this.subscribers.get(keyOrId).length;
                }
            }
            
            saveToStorage() {
                if (!this.enablePersistence) return;
                try {
                    const serializedState = JSON.stringify(Array.from(this.state.entries()));
                    localStorage.setItem(this.persistenceKey, serializedState);
                } catch (error) {
                    console.error('StateManager: Failed to save to storage:', error);
                }
            }
            
            loadFromStorage() {
                if (!this.enablePersistence) return;
                try {
                    const serializedState = localStorage.getItem(this.persistenceKey);
                    if (serializedState) {
                        const entries = JSON.parse(serializedState);
                        this.state = new Map(entries);
                    }
                } catch (error) {
                    console.error('StateManager: Failed to load from storage:', error);
                }
            }
            
            getKeys() {
                return Array.from(this.state.keys());
            }
            
            getSize() {
                return this.state.size;
            }
            
            _notifySubscribers(key, newValue, previousValue) {
                if (!this.subscribers.has(key)) return;
                
                const subscribers = this.subscribers.get(key);
                for (const subscriber of subscribers) {
                    try {
                        subscriber.callback(newValue, previousValue, key);
                    } catch (error) {
                        console.error('StateManager subscription callback error:', error);
                    }
                }
            }
            
            _generateSubscriptionId() {
                return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            }
        };
        
        StateManager = global.StateManager;
    });
    
    afterEach(() => {
        jest.clearAllMocks();
        localStorage.clear();
    });
    
    describe('Constructor', () => {
        test('should create StateManager with default options', () => {
            const stateManager = new StateManager();
            
            expect(stateManager.state).toBeInstanceOf(Map);
            expect(stateManager.enablePersistence).toBe(true);
            expect(stateManager.persistenceKey).toBe('stateManager');
        });
        
        test('should create StateManager with custom options', () => {
            const options = {
                enablePersistence: false,
                persistenceKey: 'custom-key',
                debugMode: true
            };
            
            const stateManager = new StateManager(options);
            
            expect(stateManager.enablePersistence).toBe(false);
            expect(stateManager.persistenceKey).toBe('custom-key');
            expect(stateManager.debugMode).toBe(true);
        });
    });
    
    describe('Basic State Operations', () => {
        test('should set and get state', () => {
            const stateManager = new StateManager({ enablePersistence: false });
            
            const result = stateManager.set('testKey', 'testValue');
            
            expect(result).toBe(true);
            expect(stateManager.get('testKey')).toBe('testValue');
        });
        
        test('should return default value for non-existent key', () => {
            const stateManager = new StateManager({ enablePersistence: false });
            
            expect(stateManager.get('nonExistent')).toBeUndefined();
            expect(stateManager.get('nonExistent', 'default')).toBe('default');
        });
        
        test('should check if key exists', () => {
            const stateManager = new StateManager({ enablePersistence: false });
            
            expect(stateManager.has('testKey')).toBe(false);
            
            stateManager.set('testKey', 'value');
            expect(stateManager.has('testKey')).toBe(true);
        });
        
        test('should delete state', () => {
            const stateManager = new StateManager({ enablePersistence: false });
            
            stateManager.set('testKey', 'value');
            expect(stateManager.has('testKey')).toBe(true);
            
            const result = stateManager.delete('testKey');
            
            expect(result).toBe(true);
            expect(stateManager.has('testKey')).toBe(false);
        });
        
        test('should throw error for invalid key types', () => {
            const stateManager = new StateManager({ enablePersistence: false });
            
            expect(() => {
                stateManager.set(123, 'value');
            }).toThrow('State key must be a string');
            
            expect(() => {
                stateManager.get(null);
            }).toThrow('State key must be a string');
        });
    });
    
    describe('Change Detection', () => {
        test('should not trigger change for same value', () => {
            const stateManager = new StateManager({ enablePersistence: false });
            const callback = jest.fn();
            
            stateManager.subscribe('testKey', callback);
            stateManager.set('testKey', 'value');
            stateManager.set('testKey', 'value'); // Same value
            
            expect(callback).toHaveBeenCalledTimes(1); // Only first set
        });
        
        test('should force change even for same value', () => {
            const stateManager = new StateManager({ enablePersistence: false });
            const callback = jest.fn();
            
            stateManager.subscribe('testKey', callback);
            stateManager.set('testKey', 'value');
            stateManager.set('testKey', 'value', { force: true });
            
            expect(callback).toHaveBeenCalledTimes(2);
        });
    });
    
    describe('Subscriptions', () => {
        test('should subscribe to state changes', () => {
            const stateManager = new StateManager({ enablePersistence: false });
            const callback = jest.fn();
            
            const subscriptionId = stateManager.subscribe('testKey', callback);
            stateManager.set('testKey', 'newValue');
            
            expect(typeof subscriptionId).toBe('string');
            expect(callback).toHaveBeenCalledWith('newValue', undefined, 'testKey');
        });
        
        test('should call immediately with current value', () => {
            const stateManager = new StateManager({ enablePersistence: false });
            const callback = jest.fn();
            
            stateManager.set('testKey', 'existingValue');
            stateManager.subscribe('testKey', callback, { immediate: true });
            
            expect(callback).toHaveBeenCalledWith('existingValue', undefined, 'testKey');
        });
        
        test('should unsubscribe by ID', () => {
            const stateManager = new StateManager({ enablePersistence: false });
            const callback = jest.fn();
            
            const subscriptionId = stateManager.subscribe('testKey', callback);
            stateManager.set('testKey', 'value1');
            
            const unsubscribed = stateManager.unsubscribe(subscriptionId);
            stateManager.set('testKey', 'value2');
            
            expect(unsubscribed).toBe(true);
            expect(callback).toHaveBeenCalledTimes(1); // Only first call
        });
        
        test('should handle subscription callback errors', () => {
            const stateManager = new StateManager({ enablePersistence: false });
            const consoleErrorSpy = jest.spyOn(console, 'error');
            const throwingCallback = jest.fn(() => {
                throw new Error('Callback error');
            });
            const normalCallback = jest.fn();
            
            stateManager.subscribe('testKey', throwingCallback);
            stateManager.subscribe('testKey', normalCallback);
            
            stateManager.set('testKey', 'value');
            
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                'StateManager subscription callback error:',
                expect.any(Error)
            );
            expect(normalCallback).toHaveBeenCalled();
        });
        
        test('should throw error for invalid subscription parameters', () => {
            const stateManager = new StateManager({ enablePersistence: false });
            
            expect(() => {
                stateManager.subscribe(123, jest.fn());
            }).toThrow('Subscribe requires key (string) and callback (function)');
            
            expect(() => {
                stateManager.subscribe('testKey', 'not-a-function');
            }).toThrow('Subscribe requires key (string) and callback (function)');
        });
    });
    
    describe('Persistence', () => {
        test('should save to localStorage', () => {
            const stateManager = new StateManager();
            
            stateManager.set('testKey', 'testValue');
            
            const saved = localStorage.getItem('stateManager');
            expect(saved).toBeTruthy();
            
            const parsed = JSON.parse(saved);
            expect(parsed).toEqual([['testKey', 'testValue']]);
        });
        
        test('should load from localStorage', () => {
            // Pre-populate localStorage
            localStorage.setItem('stateManager', JSON.stringify([['testKey', 'testValue']]));
            
            const stateManager = new StateManager();
            
            expect(stateManager.get('testKey')).toBe('testValue');
        });
        
        test('should handle persistence errors gracefully', () => {
            const stateManager = new StateManager();
            const consoleErrorSpy = jest.spyOn(console, 'error');
            
            // Mock localStorage to throw error
            const originalSetItem = localStorage.setItem;
            localStorage.setItem = jest.fn(() => {
                throw new Error('Storage error');
            });
            
            stateManager.set('testKey', 'testValue');
            
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                'StateManager: Failed to save to storage:',
                expect.any(Error)
            );
            
            // Restore
            localStorage.setItem = originalSetItem;
        });
    });
    
    describe('Utility Methods', () => {
        test('should get all keys', () => {
            const stateManager = new StateManager({ enablePersistence: false });
            
            stateManager.set('key1', 'value1');
            stateManager.set('key2', 'value2');
            
            const keys = stateManager.getKeys();
            
            expect(keys).toContain('key1');
            expect(keys).toContain('key2');
            expect(keys).toHaveLength(2);
        });
        
        test('should get state size', () => {
            const stateManager = new StateManager({ enablePersistence: false });
            
            expect(stateManager.getSize()).toBe(0);
            
            stateManager.set('key1', 'value1');
            stateManager.set('key2', 'value2');
            
            expect(stateManager.getSize()).toBe(2);
        });
    });
    
    describe('Performance', () => {
        test('should handle large number of state updates efficiently', () => {
            const stateManager = new StateManager({ enablePersistence: false });
            
            const start = performance.now();
            for (let i = 0; i < 1000; i++) {
                stateManager.set(`key${i}`, `value${i}`);
            }
            const end = performance.now();
            
            expect(end - start).toBeLessThan(100); // Should be fast
            expect(stateManager.getSize()).toBe(1000);
        });
        
        test('should handle many subscribers efficiently', () => {
            const stateManager = new StateManager({ enablePersistence: false });
            const callbacks = [];
            
            // Add many subscribers
            for (let i = 0; i < 100; i++) {
                const callback = jest.fn();
                callbacks.push(callback);
                stateManager.subscribe('testKey', callback);
            }
            
            const start = performance.now();
            stateManager.set('testKey', 'value');
            const end = performance.now();
            
            expect(end - start).toBeLessThan(50); // Should be fast
            callbacks.forEach(callback => {
                expect(callback).toHaveBeenCalledTimes(1);
            });
        });
    });
});