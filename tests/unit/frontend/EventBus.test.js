// ===============================
// File: tests/unit/frontend/EventBus.test.js
// Comprehensive tests for EventBus modular communication system
// ===============================

/**
 * @jest-environment jsdom
 */

describe('EventBus', () => {
    let EventBus;
    
    beforeEach(() => {
        // Mock console methods
        global.console = {
            log: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            info: jest.fn()
        };
        
        // Define EventBus for testing
        global.EventBus = class EventBus {
            constructor(options = {}) {
                this.events = new Map();
                this.options = {
                    enableLogging: options.enableLogging || false,
                    maxListeners: options.maxListeners || 100,
                    enableWildcards: options.enableWildcards || true,
                    enableAsync: options.enableAsync || true
                };
                this.logger = options.logger || console;
                this.stats = {
                    eventsEmitted: 0,
                    listenersAdded: 0,
                    listenersRemoved: 0
                };
            }
            
            on(eventName, callback, options = {}) {
                if (typeof eventName !== 'string') {
                    throw new Error('Event name must be a string');
                }
                if (typeof callback !== 'function') {
                    throw new Error('Callback must be a function');
                }
                
                if (!this.events.has(eventName)) {
                    this.events.set(eventName, []);
                }
                
                const listeners = this.events.get(eventName);
                
                if (listeners.length >= this.options.maxListeners) {
                    throw new Error(`Maximum number of listeners (${this.options.maxListeners}) exceeded for event '${eventName}'`);
                }
                
                const listenerId = this._generateListenerId();
                const listener = {
                    id: listenerId,
                    callback,
                    once: options.once || false,
                    priority: options.priority || 0,
                    context: options.context || null
                };
                
                listeners.push(listener);
                listeners.sort((a, b) => b.priority - a.priority);
                
                this.stats.listenersAdded++;
                
                if (this.options.enableLogging) {
                    this.logger.info(`EventBus: Listener added for '${eventName}' (ID: ${listenerId})`);
                }
                
                return listenerId;
            }
            
            once(eventName, callback, options = {}) {
                return this.on(eventName, callback, { ...options, once: true });
            }
            
            off(eventName, callbackOrId) {
                if (!this.events.has(eventName)) {
                    return false;
                }
                
                const listeners = this.events.get(eventName);
                const initialLength = listeners.length;
                
                if (typeof callbackOrId === 'string') {
                    // Remove by listener ID
                    const index = listeners.findIndex(listener => listener.id === callbackOrId);
                    if (index !== -1) {
                        listeners.splice(index, 1);
                        this.stats.listenersRemoved++;
                        return true;
                    }
                } else if (typeof callbackOrId === 'function') {
                    // Remove by callback function
                    const index = listeners.findIndex(listener => listener.callback === callbackOrId);
                    if (index !== -1) {
                        listeners.splice(index, 1);
                        this.stats.listenersRemoved++;
                        return true;
                    }
                } else {
                    // Remove all listeners for the event
                    this.events.set(eventName, []);
                    this.stats.listenersRemoved += initialLength;
                    return initialLength > 0;
                }
                
                return false;
            }
            
            emit(eventName, data, options = {}) {
                this.stats.eventsEmitted++;
                
                if (this.options.enableLogging) {
                    this.logger.info(`EventBus: Emitting '${eventName}'`, data);
                }
                
                let totalNotified = 0;
                
                // Handle direct event listeners
                if (this.events.has(eventName)) {
                    totalNotified += this._notifyListeners(eventName, data, options);
                }
                
                // Handle wildcard listeners if enabled
                if (this.options.enableWildcards) {
                    totalNotified += this._notifyWildcardListeners(eventName, data, options);
                }
                
                return totalNotified;
            }
            
            async emitAsync(eventName, data, options = {}) {
                if (!this.options.enableAsync) {
                    throw new Error('Async events are disabled');
                }
                
                this.stats.eventsEmitted++;
                
                if (this.options.enableLogging) {
                    this.logger.info(`EventBus: Emitting async '${eventName}'`, data);
                }
                
                let totalNotified = 0;
                
                // Handle direct event listeners
                if (this.events.has(eventName)) {
                    totalNotified += await this._notifyListenersAsync(eventName, data, options);
                }
                
                // Handle wildcard listeners if enabled
                if (this.options.enableWildcards) {
                    totalNotified += await this._notifyWildcardListenersAsync(eventName, data, options);
                }
                
                return totalNotified;
            }
            
            _notifyListeners(eventName, data, options) {
                const listeners = this.events.get(eventName);
                const listenersToRemove = [];
                let notified = 0;
                
                for (const listener of listeners) {
                    try {
                        if (listener.context) {
                            listener.callback.call(listener.context, data, eventName);
                        } else {
                            listener.callback(data, eventName);
                        }
                        
                        notified++;
                        
                        if (listener.once) {
                            listenersToRemove.push(listener.id);
                        }
                    } catch (error) {
                        this.logger.error(`EventBus: Error in listener for '${eventName}':`, error);
                        if (!options.continueOnError) {
                            throw error;
                        }
                    }
                }
                
                // Remove 'once' listeners
                listenersToRemove.forEach(id => this.off(eventName, id));
                
                return notified;
            }
            
            async _notifyListenersAsync(eventName, data, options) {
                const listeners = this.events.get(eventName);
                const listenersToRemove = [];
                let notified = 0;
                
                for (const listener of listeners) {
                    try {
                        let result;
                        if (listener.context) {
                            result = listener.callback.call(listener.context, data, eventName);
                        } else {
                            result = listener.callback(data, eventName);
                        }
                        
                        if (result && typeof result.then === 'function') {
                            await result;
                        }
                        
                        notified++;
                        
                        if (listener.once) {
                            listenersToRemove.push(listener.id);
                        }
                    } catch (error) {
                        this.logger.error(`EventBus: Error in async listener for '${eventName}':`, error);
                        if (!options.continueOnError) {
                            throw error;
                        }
                    }
                }
                
                // Remove 'once' listeners
                listenersToRemove.forEach(id => this.off(eventName, id));
                
                return notified;
            }
            
            _notifyWildcardListeners(eventName, data, options) {
                let notified = 0;
                
                for (const [pattern, listeners] of this.events) {
                    if (pattern.includes('*') && this._matchesWildcard(eventName, pattern)) {
                        for (const listener of listeners) {
                            try {
                                if (listener.context) {
                                    listener.callback.call(listener.context, data, eventName);
                                } else {
                                    listener.callback(data, eventName);
                                }
                                notified++;
                            } catch (error) {
                                this.logger.error(`EventBus: Error in wildcard listener for '${pattern}':`, error);
                                if (!options.continueOnError) {
                                    throw error;
                                }
                            }
                        }
                    }
                }
                
                return notified;
            }
            
            async _notifyWildcardListenersAsync(eventName, data, options) {
                let notified = 0;
                
                for (const [pattern, listeners] of this.events) {
                    if (pattern.includes('*') && this._matchesWildcard(eventName, pattern)) {
                        for (const listener of listeners) {
                            try {
                                let result;
                                if (listener.context) {
                                    result = listener.callback.call(listener.context, data, eventName);
                                } else {
                                    result = listener.callback(data, eventName);
                                }
                                
                                if (result && typeof result.then === 'function') {
                                    await result;
                                }
                                
                                notified++;
                            } catch (error) {
                                this.logger.error(`EventBus: Error in async wildcard listener for '${pattern}':`, error);
                                if (!options.continueOnError) {
                                    throw error;
                                }
                            }
                        }
                    }
                }
                
                return notified;
            }
            
            _matchesWildcard(eventName, pattern) {
                const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
                return regex.test(eventName);
            }
            
            _generateListenerId() {
                return `listener_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            }
            
            getEventNames() {
                return Array.from(this.events.keys());
            }
            
            getListenerCount(eventName) {
                if (eventName) {
                    return this.events.has(eventName) ? this.events.get(eventName).length : 0;
                }
                
                let total = 0;
                for (const listeners of this.events.values()) {
                    total += listeners.length;
                }
                return total;
            }
            
            getStats() {
                return { ...this.stats };
            }
            
            clear() {
                const totalRemoved = this.getListenerCount();
                this.events.clear();
                this.stats.listenersRemoved += totalRemoved;
                
                if (this.options.enableLogging) {
                    this.logger.info(`EventBus: Cleared all events and listeners (${totalRemoved} removed)`);
                }
            }
            
            hasEvent(eventName) {
                return this.events.has(eventName) && this.events.get(eventName).length > 0;
            }
        };
        
        EventBus = global.EventBus;
    });
    
    afterEach(() => {
        jest.clearAllMocks();
    });
    
    describe('Constructor', () => {
        test('should create EventBus with default options', () => {
            const eventBus = new EventBus();
            
            expect(eventBus.events).toBeInstanceOf(Map);
            expect(eventBus.options.maxListeners).toBe(100);
            expect(eventBus.options.enableWildcards).toBe(true);
            expect(eventBus.options.enableAsync).toBe(true);
            expect(eventBus.stats.eventsEmitted).toBe(0);
        });
        
        test('should create EventBus with custom options', () => {
            const options = {
                enableLogging: true,
                maxListeners: 50,
                enableWildcards: false
            };
            
            const eventBus = new EventBus(options);
            
            expect(eventBus.options.enableLogging).toBe(true);
            expect(eventBus.options.maxListeners).toBe(50);
            expect(eventBus.options.enableWildcards).toBe(false);
        });
    });
    
    describe('Event Registration', () => {
        let eventBus;
        
        beforeEach(() => {
            eventBus = new EventBus();
        });
        
        test('should register event listener successfully', () => {
            const callback = jest.fn();
            const listenerId = eventBus.on('test-event', callback);
            
            expect(typeof listenerId).toBe('string');
            expect(eventBus.hasEvent('test-event')).toBe(true);
            expect(eventBus.getListenerCount('test-event')).toBe(1);
            expect(eventBus.stats.listenersAdded).toBe(1);
        });
        
        test('should register multiple listeners for same event', () => {
            const callback1 = jest.fn();
            const callback2 = jest.fn();
            
            eventBus.on('test-event', callback1);
            eventBus.on('test-event', callback2);
            
            expect(eventBus.getListenerCount('test-event')).toBe(2);
        });
        
        test('should register once listener', () => {
            const callback = jest.fn();
            const listenerId = eventBus.once('test-event', callback);
            
            expect(typeof listenerId).toBe('string');
            expect(eventBus.getListenerCount('test-event')).toBe(1);
        });
        
        test('should respect priority ordering', () => {
            const results = [];
            
            eventBus.on('test-event', () => results.push('low'), { priority: 1 });
            eventBus.on('test-event', () => results.push('high'), { priority: 10 });
            eventBus.on('test-event', () => results.push('medium'), { priority: 5 });
            
            eventBus.emit('test-event');
            
            expect(results).toEqual(['high', 'medium', 'low']);
        });
        
        test('should throw error for invalid event name', () => {
            expect(() => {
                eventBus.on(123, jest.fn());
            }).toThrow('Event name must be a string');
        });
        
        test('should throw error for invalid callback', () => {
            expect(() => {
                eventBus.on('test-event', 'not-a-function');
            }).toThrow('Callback must be a function');
        });
        
        test('should enforce maximum listeners limit', () => {
            const eventBus = new EventBus({ maxListeners: 2 });
            
            eventBus.on('test-event', jest.fn());
            eventBus.on('test-event', jest.fn());
            
            expect(() => {
                eventBus.on('test-event', jest.fn());
            }).toThrow('Maximum number of listeners (2) exceeded');
        });
    });
    
    describe('Event Emission', () => {
        let eventBus;
        
        beforeEach(() => {
            eventBus = new EventBus();
        });
        
        test('should emit event to single listener', () => {
            const callback = jest.fn();
            eventBus.on('test-event', callback);
            
            const result = eventBus.emit('test-event', { data: 'test' });
            
            expect(result).toBe(1);
            expect(callback).toHaveBeenCalledTimes(1);
            expect(callback).toHaveBeenCalledWith({ data: 'test' }, 'test-event');
            expect(eventBus.stats.eventsEmitted).toBe(1);
        });
        
        test('should emit event to multiple listeners', () => {
            const callback1 = jest.fn();
            const callback2 = jest.fn();
            
            eventBus.on('test-event', callback1);
            eventBus.on('test-event', callback2);
            
            const result = eventBus.emit('test-event', { data: 'test' });
            
            expect(result).toBe(2);
            expect(callback1).toHaveBeenCalledWith({ data: 'test' }, 'test-event');
            expect(callback2).toHaveBeenCalledWith({ data: 'test' }, 'test-event');
        });
        
        test('should handle once listeners correctly', () => {
            const callback = jest.fn();
            eventBus.once('test-event', callback);
            
            eventBus.emit('test-event');
            eventBus.emit('test-event');
            
            expect(callback).toHaveBeenCalledTimes(1);
            expect(eventBus.getListenerCount('test-event')).toBe(0);
        });
        
        test('should use context for callback', () => {
            const context = { name: 'test-context' };
            const callback = jest.fn(function() {
                expect(this).toBe(context);
            });
            
            eventBus.on('test-event', callback, { context });
            eventBus.emit('test-event');
            
            expect(callback).toHaveBeenCalled();
        });
        
        test('should return 0 for events with no listeners', () => {
            const result = eventBus.emit('non-existent-event');
            expect(result).toBe(0);
        });
    });
    
    describe('Wildcard Events', () => {
        let eventBus;
        
        beforeEach(() => {
            eventBus = new EventBus({ enableWildcards: true });
        });
        
        test('should match wildcard patterns', () => {
            const callback = jest.fn();
            eventBus.on('user:*', callback);
            
            eventBus.emit('user:login');
            eventBus.emit('user:logout');
            eventBus.emit('admin:login');
            
            expect(callback).toHaveBeenCalledTimes(2);
        });
        
        test('should handle complex wildcard patterns', () => {
            const callback = jest.fn();
            eventBus.on('*:change:*', callback);
            
            eventBus.emit('user:change:email');
            eventBus.emit('settings:change:theme');
            eventBus.emit('user:login');
            
            expect(callback).toHaveBeenCalledTimes(2);
        });
        
        test('should disable wildcards when option is false', () => {
            const eventBus = new EventBus({ enableWildcards: false });
            const callback = jest.fn();
            
            eventBus.on('user:*', callback);
            eventBus.emit('user:login');
            
            expect(callback).not.toHaveBeenCalled();
        });
    });
    
    describe('Async Events', () => {
        let eventBus;
        
        beforeEach(() => {
            eventBus = new EventBus({ enableAsync: true });
        });
        
        test('should handle async listeners', async () => {
            const callback = jest.fn(() => Promise.resolve('async result'));
            eventBus.on('test-event', callback);
            
            const result = await eventBus.emitAsync('test-event', { data: 'test' });
            
            expect(result).toBe(1);
            expect(callback).toHaveBeenCalledWith({ data: 'test' }, 'test-event');
        });
        
        test('should handle mixed sync and async listeners', async () => {
            const syncCallback = jest.fn();
            const asyncCallback = jest.fn(() => Promise.resolve());
            
            eventBus.on('test-event', syncCallback);
            eventBus.on('test-event', asyncCallback);
            
            const result = await eventBus.emitAsync('test-event');
            
            expect(result).toBe(2);
            expect(syncCallback).toHaveBeenCalled();
            expect(asyncCallback).toHaveBeenCalled();
        });
        
        test('should throw error when async is disabled', async () => {
            const eventBus = new EventBus({ enableAsync: false });
            
            await expect(eventBus.emitAsync('test-event')).rejects.toThrow('Async events are disabled');
        });
    });
    
    describe('Event Removal', () => {
        let eventBus;
        
        beforeEach(() => {
            eventBus = new EventBus();
        });
        
        test('should remove listener by ID', () => {
            const callback = jest.fn();
            const listenerId = eventBus.on('test-event', callback);
            
            const result = eventBus.off('test-event', listenerId);
            
            expect(result).toBe(true);
            expect(eventBus.getListenerCount('test-event')).toBe(0);
            expect(eventBus.stats.listenersRemoved).toBe(1);
        });
        
        test('should remove listener by callback', () => {
            const callback = jest.fn();
            eventBus.on('test-event', callback);
            
            const result = eventBus.off('test-event', callback);
            
            expect(result).toBe(true);
            expect(eventBus.getListenerCount('test-event')).toBe(0);
        });
        
        test('should remove all listeners for event', () => {
            eventBus.on('test-event', jest.fn());
            eventBus.on('test-event', jest.fn());
            
            const result = eventBus.off('test-event');
            
            expect(result).toBe(true);
            expect(eventBus.getListenerCount('test-event')).toBe(0);
        });
        
        test('should return false for non-existent listener', () => {
            const result = eventBus.off('non-existent-event', jest.fn());
            expect(result).toBe(false);
        });
    });
    
    describe('Error Handling', () => {
        let eventBus;
        
        beforeEach(() => {
            eventBus = new EventBus();
        });
        
        test('should handle listener errors by default', () => {
            const throwingCallback = jest.fn(() => {
                throw new Error('Listener error');
            });
            const normalCallback = jest.fn();
            
            eventBus.on('test-event', throwingCallback);
            eventBus.on('test-event', normalCallback);
            
            expect(() => {
                eventBus.emit('test-event');
            }).toThrow('Listener error');
            
            expect(eventBus.logger.error).toHaveBeenCalledWith(
                expect.stringContaining('Error in listener'),
                expect.any(Error)
            );
        });
        
        test('should continue on error when option is set', () => {
            const throwingCallback = jest.fn(() => {
                throw new Error('Listener error');
            });
            const normalCallback = jest.fn();
            
            eventBus.on('test-event', throwingCallback);
            eventBus.on('test-event', normalCallback);
            
            const result = eventBus.emit('test-event', null, { continueOnError: true });
            
            expect(result).toBe(1); // Only the normal callback succeeded
            expect(normalCallback).toHaveBeenCalled();
        });
        
        test('should handle async listener errors', async () => {
            const throwingCallback = jest.fn(() => Promise.reject(new Error('Async error')));
            
            eventBus.on('test-event', throwingCallback);
            
            await expect(eventBus.emitAsync('test-event')).rejects.toThrow('Async error');
        });
    });
    
    describe('Utility Methods', () => {
        let eventBus;
        
        beforeEach(() => {
            eventBus = new EventBus();
        });
        
        test('should get event names', () => {
            eventBus.on('event1', jest.fn());
            eventBus.on('event2', jest.fn());
            
            const eventNames = eventBus.getEventNames();
            
            expect(eventNames).toContain('event1');
            expect(eventNames).toContain('event2');
            expect(eventNames).toHaveLength(2);
        });
        
        test('should get total listener count', () => {
            eventBus.on('event1', jest.fn());
            eventBus.on('event1', jest.fn());
            eventBus.on('event2', jest.fn());
            
            expect(eventBus.getListenerCount()).toBe(3);
            expect(eventBus.getListenerCount('event1')).toBe(2);
            expect(eventBus.getListenerCount('event2')).toBe(1);
        });
        
        test('should get stats', () => {
            eventBus.on('test-event', jest.fn());
            eventBus.emit('test-event');
            eventBus.off('test-event');
            
            const stats = eventBus.getStats();
            
            expect(stats.eventsEmitted).toBe(1);
            expect(stats.listenersAdded).toBe(1);
            expect(stats.listenersRemoved).toBe(1);
        });
        
        test('should clear all events', () => {
            eventBus.on('event1', jest.fn());
            eventBus.on('event2', jest.fn());
            
            eventBus.clear();
            
            expect(eventBus.getListenerCount()).toBe(0);
            expect(eventBus.getEventNames()).toHaveLength(0);
        });
        
        test('should check if event exists', () => {
            expect(eventBus.hasEvent('test-event')).toBe(false);
            
            eventBus.on('test-event', jest.fn());
            expect(eventBus.hasEvent('test-event')).toBe(true);
            
            eventBus.off('test-event');
            expect(eventBus.hasEvent('test-event')).toBe(false);
        });
    });
    
    describe('Logging', () => {
        test('should log events when enabled', () => {
            const eventBus = new EventBus({ enableLogging: true });
            const callback = jest.fn();
            
            eventBus.on('test-event', callback);
            eventBus.emit('test-event', { data: 'test' });
            
            expect(eventBus.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('Listener added'),
                expect.anything()
            );
            expect(eventBus.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('Emitting'),
                { data: 'test' }
            );
        });
        
        test('should not log when disabled', () => {
            const eventBus = new EventBus({ enableLogging: false });
            const callback = jest.fn();
            
            eventBus.on('test-event', callback);
            eventBus.emit('test-event');
            
            expect(eventBus.logger.info).not.toHaveBeenCalled();
        });
    });
});