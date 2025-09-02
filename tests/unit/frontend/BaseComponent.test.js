// ===============================
// File: tests/unit/frontend/BaseComponent.test.js
// Comprehensive tests for BaseComponent modular architecture foundation
// ===============================

/**
 * @jest-environment jsdom
 */

describe('BaseComponent', () => {
    let BaseComponent;
    
    beforeEach(() => {
        // Mock console methods
        global.console = {
            log: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            info: jest.fn()
        };
        
        // Mock performance API
        global.performance = {
            now: jest.fn(() => Date.now())
        };
        
        // Setup DOM
        document.body.innerHTML = '';
        
        // Define BaseComponent for testing
        global.BaseComponent = class BaseComponent {
            constructor(elementId, options = {}) {
                this.elementId = elementId;
                this.options = { ...this.getDefaultOptions(), ...options };
                this.isInitialized = false;
                this.isDestroyed = false;
                this.eventListeners = [];
                this.childComponents = new Map();
                this.logger = options.logger || console;
                this.performanceMetrics = {};
                
                this.setupPerformanceTracking();
            }
            
            getDefaultOptions() {
                return {
                    autoInit: true,
                    enablePerformanceTracking: true,
                    enableErrorRecovery: true,
                    maxRetries: 3
                };
            }
            
            setupPerformanceTracking() {
                if (this.options.enablePerformanceTracking) {
                    this.performanceMetrics.initStart = performance.now();
                }
            }
            
            async init() {
                if (this.isInitialized) {
                    this.logger.warn(`Component ${this.constructor.name} is already initialized`);
                    return false;
                }
                
                try {
                    const startTime = performance.now();
                    
                    await this.beforeInit();
                    await this.setupElement();
                    await this.setupEventListeners();
                    await this.onInit();
                    
                    this.isInitialized = true;
                    
                    if (this.options.enablePerformanceTracking) {
                        this.performanceMetrics.initTime = performance.now() - startTime;
                        this.logger.info(`Component ${this.constructor.name} initialized in ${this.performanceMetrics.initTime.toFixed(2)}ms`);
                    }
                    
                    return true;
                } catch (error) {
                    this.logger.error(`Failed to initialize component ${this.constructor.name}:`, error);
                    
                    if (this.options.enableErrorRecovery) {
                        await this.handleInitError(error);
                    }
                    
                    throw error;
                }
            }
            
            async beforeInit() {
                // Hook for subclasses
            }
            
            async setupElement() {
                if (this.elementId) {
                    this.element = document.getElementById(this.elementId);
                    if (!this.element) {
                        throw new Error(`Element with ID '${this.elementId}' not found`);
                    }
                }
            }
            
            async setupEventListeners() {
                // Hook for subclasses
            }
            
            async onInit() {
                // Hook for subclasses
            }
            
            async handleInitError(error) {
                this.logger.warn(`Attempting error recovery for ${this.constructor.name}`);
                // Basic error recovery - subclasses can override
            }
            
            addEventListener(element, event, handler, options = {}) {
                if (!element || !event || !handler) {
                    throw new Error('Missing required parameters for addEventListener');
                }
                
                element.addEventListener(event, handler, options);
                this.eventListeners.push({ element, event, handler, options });
            }
            
            removeEventListener(element, event, handler) {
                element.removeEventListener(event, handler);
                this.eventListeners = this.eventListeners.filter(
                    listener => !(listener.element === element && listener.event === event && listener.handler === handler)
                );
            }
            
            addChildComponent(name, component) {
                if (this.childComponents.has(name)) {
                    throw new Error(`Child component '${name}' already exists`);
                }
                this.childComponents.set(name, component);
            }
            
            getChildComponent(name) {
                return this.childComponents.get(name);
            }
            
            hasChildComponent(name) {
                return this.childComponents.has(name);
            }
            
            async destroy() {
                if (this.isDestroyed) {
                    this.logger.warn(`Component ${this.constructor.name} is already destroyed`);
                    return;
                }
                
                try {
                    await this.beforeDestroy();
                    
                    // Destroy child components
                    for (const [name, component] of this.childComponents) {
                        if (component && typeof component.destroy === 'function') {
                            await component.destroy();
                        }
                    }
                    this.childComponents.clear();
                    
                    // Remove event listeners
                    this.eventListeners.forEach(({ element, event, handler }) => {
                        element.removeEventListener(event, handler);
                    });
                    this.eventListeners = [];
                    
                    await this.onDestroy();
                    
                    this.isDestroyed = true;
                    this.isInitialized = false;
                    
                    this.logger.info(`Component ${this.constructor.name} destroyed successfully`);
                } catch (error) {
                    this.logger.error(`Error destroying component ${this.constructor.name}:`, error);
                    throw error;
                }
            }
            
            async beforeDestroy() {
                // Hook for subclasses
            }
            
            async onDestroy() {
                // Hook for subclasses
            }
            
            getPerformanceMetrics() {
                return { ...this.performanceMetrics };
            }
            
            getComponentInfo() {
                return {
                    name: this.constructor.name,
                    elementId: this.elementId,
                    isInitialized: this.isInitialized,
                    isDestroyed: this.isDestroyed,
                    eventListenersCount: this.eventListeners.length,
                    childComponentsCount: this.childComponents.size,
                    options: this.options
                };
            }
        };
        
        BaseComponent = global.BaseComponent;
    });
    
    afterEach(() => {
        jest.clearAllMocks();
        document.body.innerHTML = '';
    });
    
    describe('Constructor', () => {
        test('should create BaseComponent with required parameters', () => {
            const component = new BaseComponent('test-element');
            
            expect(component.elementId).toBe('test-element');
            expect(component.isInitialized).toBe(false);
            expect(component.isDestroyed).toBe(false);
            expect(component.eventListeners).toEqual([]);
            expect(component.childComponents).toBeInstanceOf(Map);
        });
        
        test('should merge default options with provided options', () => {
            const customOptions = {
                autoInit: false,
                customOption: 'value'
            };
            
            const component = new BaseComponent('test-element', customOptions);
            
            expect(component.options.autoInit).toBe(false);
            expect(component.options.enablePerformanceTracking).toBe(true);
            expect(component.options.customOption).toBe('value');
        });
        
        test('should setup performance tracking by default', () => {
            const component = new BaseComponent('test-element');
            
            expect(component.performanceMetrics.initStart).toBeDefined();
            expect(typeof component.performanceMetrics.initStart).toBe('number');
        });
    });
    
    describe('Initialization', () => {
        beforeEach(() => {
            const testElement = document.createElement('div');
            testElement.id = 'test-element';
            document.body.appendChild(testElement);
        });
        
        test('should initialize component successfully', async () => {
            const component = new BaseComponent('test-element');
            
            const result = await component.init();
            
            expect(result).toBe(true);
            expect(component.isInitialized).toBe(true);
            expect(component.element).toBeDefined();
            expect(component.element.id).toBe('test-element');
        });
        
        test('should not initialize twice', async () => {
            const component = new BaseComponent('test-element');
            
            await component.init();
            const secondResult = await component.init();
            
            expect(secondResult).toBe(false);
            expect(component.logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('already initialized')
            );
        });
        
        test('should throw error when element not found', async () => {
            const component = new BaseComponent('non-existent-element');
            
            await expect(component.init()).rejects.toThrow(
                "Element with ID 'non-existent-element' not found"
            );
        });
        
        test('should track performance metrics during initialization', async () => {
            const component = new BaseComponent('test-element');
            
            await component.init();
            
            expect(component.performanceMetrics.initTime).toBeDefined();
            expect(typeof component.performanceMetrics.initTime).toBe('number');
            expect(component.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('initialized in')
            );
        });
    });
    
    describe('Event Management', () => {
        let component;
        let testElement;
        
        beforeEach(async () => {
            testElement = document.createElement('div');
            testElement.id = 'test-element';
            document.body.appendChild(testElement);
            
            component = new BaseComponent('test-element');
            await component.init();
        });
        
        test('should add event listener successfully', () => {
            const handler = jest.fn();
            
            component.addEventListener(testElement, 'click', handler);
            
            expect(component.eventListeners).toHaveLength(1);
            expect(component.eventListeners[0]).toEqual({
                element: testElement,
                event: 'click',
                handler,
                options: {}
            });
        });
        
        test('should trigger event listener', () => {
            const handler = jest.fn();
            
            component.addEventListener(testElement, 'click', handler);
            testElement.click();
            
            expect(handler).toHaveBeenCalledTimes(1);
        });
        
        test('should remove event listener successfully', () => {
            const handler = jest.fn();
            
            component.addEventListener(testElement, 'click', handler);
            component.removeEventListener(testElement, 'click', handler);
            
            expect(component.eventListeners).toHaveLength(0);
            
            testElement.click();
            expect(handler).not.toHaveBeenCalled();
        });
        
        test('should throw error for invalid addEventListener parameters', () => {
            expect(() => {
                component.addEventListener(null, 'click', jest.fn());
            }).toThrow('Missing required parameters for addEventListener');
            
            expect(() => {
                component.addEventListener(testElement, null, jest.fn());
            }).toThrow('Missing required parameters for addEventListener');
            
            expect(() => {
                component.addEventListener(testElement, 'click', null);
            }).toThrow('Missing required parameters for addEventListener');
        });
    });
    
    describe('Child Component Management', () => {
        let parentComponent;
        let childComponent;
        
        beforeEach(async () => {
            const testElement = document.createElement('div');
            testElement.id = 'test-element';
            document.body.appendChild(testElement);
            
            parentComponent = new BaseComponent('test-element');
            await parentComponent.init();
            
            childComponent = new BaseComponent(null);
        });
        
        test('should add child component successfully', () => {
            parentComponent.addChildComponent('child1', childComponent);
            
            expect(parentComponent.hasChildComponent('child1')).toBe(true);
            expect(parentComponent.getChildComponent('child1')).toBe(childComponent);
            expect(parentComponent.childComponents.size).toBe(1);
        });
        
        test('should throw error when adding duplicate child component', () => {
            parentComponent.addChildComponent('child1', childComponent);
            
            expect(() => {
                parentComponent.addChildComponent('child1', childComponent);
            }).toThrow("Child component 'child1' already exists");
        });
        
        test('should return undefined for non-existent child component', () => {
            expect(parentComponent.getChildComponent('non-existent')).toBeUndefined();
            expect(parentComponent.hasChildComponent('non-existent')).toBe(false);
        });
    });
    
    describe('Destruction', () => {
        let component;
        let childComponent;
        
        beforeEach(async () => {
            const testElement = document.createElement('div');
            testElement.id = 'test-element';
            document.body.appendChild(testElement);
            
            component = new BaseComponent('test-element');
            await component.init();
            
            childComponent = new BaseComponent(null);
            childComponent.destroy = jest.fn();
            component.addChildComponent('child1', childComponent);
            
            // Add an event listener
            component.addEventListener(testElement, 'click', jest.fn());
        });
        
        test('should destroy component successfully', async () => {
            await component.destroy();
            
            expect(component.isDestroyed).toBe(true);
            expect(component.isInitialized).toBe(false);
            expect(component.eventListeners).toHaveLength(0);
            expect(component.childComponents.size).toBe(0);
            expect(childComponent.destroy).toHaveBeenCalled();
        });
        
        test('should not destroy twice', async () => {
            await component.destroy();
            await component.destroy();
            
            expect(component.logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('already destroyed')
            );
        });
        
        test('should handle child component destruction errors gracefully', async () => {
            childComponent.destroy = jest.fn().mockRejectedValue(new Error('Child destruction failed'));
            
            await expect(component.destroy()).rejects.toThrow('Child destruction failed');
        });
    });
    
    describe('Performance and Info Methods', () => {
        let component;
        
        beforeEach(async () => {
            const testElement = document.createElement('div');
            testElement.id = 'test-element';
            document.body.appendChild(testElement);
            
            component = new BaseComponent('test-element');
            await component.init();
        });
        
        test('should return performance metrics', () => {
            const metrics = component.getPerformanceMetrics();
            
            expect(metrics).toHaveProperty('initStart');
            expect(metrics).toHaveProperty('initTime');
            expect(typeof metrics.initTime).toBe('number');
        });
        
        test('should return component information', () => {
            const info = component.getComponentInfo();
            
            expect(info).toEqual({
                name: 'BaseComponent',
                elementId: 'test-element',
                isInitialized: true,
                isDestroyed: false,
                eventListenersCount: 0,
                childComponentsCount: 0,
                options: component.options
            });
        });
        
        test('should track event listeners count in component info', () => {
            const handler = jest.fn();
            component.addEventListener(component.element, 'click', handler);
            
            const info = component.getComponentInfo();
            expect(info.eventListenersCount).toBe(1);
        });
        
        test('should track child components count in component info', () => {
            const childComponent = new BaseComponent(null);
            component.addChildComponent('child1', childComponent);
            
            const info = component.getComponentInfo();
            expect(info.childComponentsCount).toBe(1);
        });
    });
    
    describe('Error Handling', () => {
        test('should handle initialization errors with recovery', async () => {
            class FailingComponent extends BaseComponent {
                async setupElement() {
                    throw new Error('Setup failed');
                }
                
                async handleInitError(error) {
                    this.logger.warn('Handling init error:', error.message);
                    // Simulate recovery
                    this.element = document.createElement('div');
                }
            }
            
            const component = new FailingComponent('test-element', { enableErrorRecovery: true });
            
            await expect(component.init()).rejects.toThrow('Setup failed');
            expect(component.logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Attempting error recovery')
            );
        });
        
        test('should disable error recovery when option is false', async () => {
            class FailingComponent extends BaseComponent {
                async setupElement() {
                    throw new Error('Setup failed');
                }
                
                async handleInitError(error) {
                    this.logger.warn('This should not be called');
                }
            }
            
            const component = new FailingComponent('test-element', { enableErrorRecovery: false });
            
            await expect(component.init()).rejects.toThrow('Setup failed');
            expect(component.logger.warn).not.toHaveBeenCalledWith(
                expect.stringContaining('Attempting error recovery')
            );
        });
    });
    
    describe('Inheritance', () => {
        test('should support proper inheritance', async () => {
            class CustomComponent extends BaseComponent {
                constructor(elementId, options) {
                    super(elementId, options);
                    this.customProperty = 'custom value';
                }
                
                getDefaultOptions() {
                    return {
                        ...super.getDefaultOptions(),
                        customOption: 'default'
                    };
                }
                
                async onInit() {
                    this.initialized = true;
                }
                
                customMethod() {
                    return 'custom method result';
                }
            }
            
            const testElement = document.createElement('div');
            testElement.id = 'test-element';
            document.body.appendChild(testElement);
            
            const component = new CustomComponent('test-element');
            await component.init();
            
            expect(component.customProperty).toBe('custom value');
            expect(component.initialized).toBe(true);
            expect(component.customMethod()).toBe('custom method result');
            expect(component.options.customOption).toBe('default');
            expect(component.isInitialized).toBe(true);
        });
    });
});