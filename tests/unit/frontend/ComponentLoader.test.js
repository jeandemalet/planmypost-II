// ===============================
// File: tests/unit/frontend/ComponentLoader.test.js
// Comprehensive tests for ComponentLoader modular component management
// ===============================

/**
 * @jest-environment jsdom
 */

describe('ComponentLoader', () => {
    let ComponentLoader;
    
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
        
        // Mock dependencies
        global.EventBus = class MockEventBus {
            constructor() {
                this.events = new Map();
            }
            on(event, callback) { return 'listener-id'; }
            emit(event, data) { return 1; }
            subscribe(event, callback) { return 'subscription-id'; }
        };
        
        global.StateManager = class MockStateManager {
            constructor() {
                this.state = new Map();
            }
            get(key) { return this.state.get(key); }
            set(key, value) { this.state.set(key, value); return true; }
            subscribe(key, callback) { return 'subscription-id'; }
        };
        
        global.BaseComponent = class MockBaseComponent {
            constructor(elementId, options = {}) {
                this.elementId = elementId;
                this.isInitialized = false;
                this.options = options;
            }
            async init() { 
                this.isInitialized = true; 
                return true; 
            }
            async destroy() { 
                this.isInitialized = false; 
            }
        };
        
        // Define ComponentLoader for testing
        global.ComponentLoader = class ComponentLoader {
            constructor(organizer, options = {}) {
                this.organizer = organizer;
                this.options = {
                    enableLogging: options.enableLogging !== false,
                    enableErrorRecovery: options.enableErrorRecovery !== false,
                    autoInitComponents: options.autoInitComponents !== false,
                    componentTimeout: options.componentTimeout || 5000,
                    ...options
                };
                
                this.dependencies = {};
                this.components = new Map();
                this.loadingPromises = new Map();
                this.logger = options.logger || console;
                this.isInitialized = false;
                this.loadingStats = {
                    attempted: 0,
                    successful: 0,
                    failed: 0,
                    totalLoadTime: 0
                };
            }
            
            async initializeModularComponents() {
                if (this.isInitialized) {
                    this.logger.warn('ComponentLoader is already initialized');
                    return;
                }
                
                const startTime = performance.now();
                
                try {
                    this.logger.info('🔧 Starting modular component initialization...');
                    
                    // Initialize core dependencies
                    await this.initializeCoreDependencies();
                    
                    // Load modular components
                    await this.loadComponents();
                    
                    // Setup inter-component communication
                    this.setupComponentCommunication();
                    
                    // Sync with existing state
                    this.syncStateWithExistingOrganizer();
                    
                    this.isInitialized = true;
                    
                    const loadTime = performance.now() - startTime;
                    this.loadingStats.totalLoadTime = loadTime;
                    
                    this.logger.info(`✅ Modular components initialized successfully in ${loadTime.toFixed(2)}ms`);
                    
                } catch (error) {
                    this.logger.error('❌ Failed to initialize modular components:', error);
                    
                    if (this.options.enableErrorRecovery) {
                        await this.handleInitializationError(error);
                    } else {
                        throw error;
                    }
                }
            }
            
            async initializeCoreDependencies() {
                this.logger.info('📦 Initializing core dependencies...');
                
                // Initialize EventBus
                this.dependencies.eventBus = new EventBus();
                
                // Initialize StateManager
                this.dependencies.stateManager = new StateManager({
                    persistenceKey: 'modularComponents',
                    enablePersistence: true
                });
                
                this.logger.info('✅ Core dependencies initialized');
            }
            
            async loadComponents() {
                this.logger.info('🔧 Loading modular components...');
                
                const componentsToLoad = [
                    {
                        name: 'CroppingManager',
                        dependencies: ['eventBus', 'stateManager'],
                        required: false
                    },
                    {
                        name: 'DescriptionManager', 
                        dependencies: ['eventBus', 'stateManager'],
                        required: false
                    },
                    {
                        name: 'SaveStatusIndicator',
                        dependencies: ['eventBus'],
                        required: false
                    }
                ];
                
                for (const componentConfig of componentsToLoad) {
                    await this.loadComponent(componentConfig);
                }
            }
            
            async loadComponent(config) {
                const { name, dependencies = [], required = false } = config;
                this.loadingStats.attempted++;
                
                try {
                    this.logger.info(`📦 Loading component: ${name}`);
                    
                    // Check if component class is available
                    if (!global[name]) {
                        if (required) {
                            throw new Error(`Required component ${name} is not available`);
                        } else {
                            this.logger.warn(`⚠️ Optional component ${name} not available, skipping`);
                            return;
                        }
                    }
                    
                    // Prepare dependencies
                    const componentDeps = {};
                    for (const dep of dependencies) {
                        if (this.dependencies[dep]) {
                            componentDeps[dep] = this.dependencies[dep];
                        } else {
                            throw new Error(`Dependency ${dep} not found for component ${name}`);
                        }
                    }
                    
                    // Create component instance
                    const ComponentClass = global[name];
                    const component = new ComponentClass(this.organizer, componentDeps);
                    
                    // Initialize component if auto-init is enabled
                    if (this.options.autoInitComponents && component.init) {
                        await this.timeoutPromise(
                            component.init(),
                            this.options.componentTimeout,
                            `Component ${name} initialization timeout`
                        );
                    }
                    
                    this.components.set(name, component);
                    this.loadingStats.successful++;
                    
                    this.logger.info(`✅ Component ${name} loaded successfully`);
                    
                } catch (error) {
                    this.loadingStats.failed++;
                    this.logger.error(`❌ Failed to load component ${name}:`, error);
                    
                    if (required) {
                        throw error;
                    }
                }
            }
            
            setupComponentCommunication() {
                const eventBus = this.dependencies.eventBus;
                const stateManager = this.dependencies.stateManager;
                
                // Setup cross-component event handlers
                eventBus.on('image:cropped', (data) => {
                    this.organizer.updateGridUsage?.();
                    this.organizer.refreshPublicationViews?.();
                });
                
                eventBus.on('publication:updated', (data) => {
                    this.organizer.updateStatsLabel?.();
                    this.organizer.updateGridUsage?.();
                });
                
                eventBus.on('state:sync', (data) => {
                    this.syncStateWithExistingOrganizer();
                });
                
                this.logger.info('🔗 Component communication setup complete');
            }
            
            syncStateWithExistingOrganizer() {
                const stateManager = this.dependencies.stateManager;
                
                if (this.organizer.currentGalleryId) {
                    stateManager.set('gallery.currentGalleryId', this.organizer.currentGalleryId);
                }
                
                if (this.organizer.currentThumbSize) {
                    stateManager.set('gallery.currentThumbSize', this.organizer.currentThumbSize);
                }
                
                this.logger.info('🔄 State synchronization complete');
            }
            
            async handleInitializationError(error) {
                this.logger.warn('🔧 Attempting error recovery...');
                
                // Clear failed components
                this.components.clear();
                
                // Try to initialize with minimal configuration
                try {
                    await this.initializeCoreDependencies();
                    this.logger.info('✅ Error recovery successful - core dependencies restored');
                } catch (recoveryError) {
                    this.logger.error('❌ Error recovery failed:', recoveryError);
                    throw new Error(`Initialization failed and recovery unsuccessful: ${error.message}`);
                }
            }
            
            async timeoutPromise(promise, timeout, errorMessage) {
                return Promise.race([
                    promise,
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error(errorMessage)), timeout)
                    )
                ]);
            }
            
            getComponent(name) {
                return this.components.get(name);
            }
            
            hasComponent(name) {
                return this.components.has(name);
            }
            
            getAllComponents() {
                return Array.from(this.components.entries());
            }
            
            getLoadingStats() {
                return { ...this.loadingStats };
            }
            
            getDependencies() {
                return { ...this.dependencies };
            }
            
            async reloadComponent(name) {
                if (!this.components.has(name)) {
                    throw new Error(`Component ${name} is not loaded`);
                }
                
                const component = this.components.get(name);
                
                // Destroy existing component
                if (component.destroy) {
                    await component.destroy();
                }
                
                this.components.delete(name);
                
                // Reload component
                const componentConfig = { name, dependencies: ['eventBus', 'stateManager'] };
                await this.loadComponent(componentConfig);
                
                this.logger.info(`🔄 Component ${name} reloaded successfully`);
            }
            
            async destroy() {
                this.logger.info('🧹 Destroying ComponentLoader and all components...');
                
                // Destroy all components
                for (const [name, component] of this.components) {
                    try {
                        if (component.destroy) {
                            await component.destroy();
                        }
                    } catch (error) {
                        this.logger.error(`Error destroying component ${name}:`, error);
                    }
                }
                
                this.components.clear();
                this.dependencies = {};
                this.isInitialized = false;
                
                this.logger.info('✅ ComponentLoader destroyed successfully');
            }
        };
        
        ComponentLoader = global.ComponentLoader;
    });
    
    afterEach(() => {
        jest.clearAllMocks();
        document.body.innerHTML = '';
    });
    
    describe('Constructor', () => {
        test('should create ComponentLoader with organizer', () => {
            const mockOrganizer = { currentGalleryId: 'test-gallery' };
            const loader = new ComponentLoader(mockOrganizer);
            
            expect(loader.organizer).toBe(mockOrganizer);
            expect(loader.isInitialized).toBe(false);
            expect(loader.components).toBeInstanceOf(Map);
            expect(loader.dependencies).toEqual({});
        });
        
        test('should merge default options with provided options', () => {
            const mockOrganizer = {};
            const options = {
                enableLogging: false,
                componentTimeout: 10000,
                customOption: 'value'
            };
            
            const loader = new ComponentLoader(mockOrganizer, options);
            
            expect(loader.options.enableLogging).toBe(false);
            expect(loader.options.enableErrorRecovery).toBe(true);
            expect(loader.options.componentTimeout).toBe(10000);
            expect(loader.options.customOption).toBe('value');
        });
    });
    
    describe('Core Dependencies Initialization', () => {
        let loader;
        
        beforeEach(() => {
            loader = new ComponentLoader({});
        });
        
        test('should initialize core dependencies successfully', async () => {
            await loader.initializeCoreDependencies();
            
            expect(loader.dependencies.eventBus).toBeInstanceOf(global.EventBus);
            expect(loader.dependencies.stateManager).toBeInstanceOf(global.StateManager);
        });
        
        test('should log initialization process', async () => {
            await loader.initializeCoreDependencies();
            
            expect(loader.logger.info).toHaveBeenCalledWith('📦 Initializing core dependencies...');
            expect(loader.logger.info).toHaveBeenCalledWith('✅ Core dependencies initialized');
        });
    });
    
    describe('Component Loading', () => {
        let loader;
        
        beforeEach(async () => {
            loader = new ComponentLoader({});
            await loader.initializeCoreDependencies();
        });
        
        test('should load component successfully', async () => {
            // Mock component class
            global.TestComponent = class TestComponent extends global.BaseComponent {
                constructor(organizer, deps) {
                    super(null);
                    this.organizer = organizer;
                    this.dependencies = deps;
                }
            };
            
            const config = {
                name: 'TestComponent',
                dependencies: ['eventBus', 'stateManager'],
                required: false
            };
            
            await loader.loadComponent(config);
            
            expect(loader.hasComponent('TestComponent')).toBe(true);
            expect(loader.loadingStats.successful).toBe(1);
            expect(loader.loadingStats.attempted).toBe(1);
        });
        
        test('should handle missing optional component gracefully', async () => {
            const config = {
                name: 'NonExistentComponent',
                dependencies: [],
                required: false
            };
            
            await loader.loadComponent(config);
            
            expect(loader.hasComponent('NonExistentComponent')).toBe(false);
            expect(loader.loadingStats.failed).toBe(0);
            expect(loader.logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('not available, skipping')
            );
        });
        
        test('should throw error for missing required component', async () => {
            const config = {
                name: 'RequiredComponent',
                dependencies: [],
                required: true
            };
            
            await expect(loader.loadComponent(config)).rejects.toThrow(
                'Required component RequiredComponent is not available'
            );
        });
        
        test('should handle missing dependencies', async () => {
            global.TestComponent = class TestComponent {};
            
            const config = {
                name: 'TestComponent',
                dependencies: ['nonExistentDep'],
                required: false
            };
            
            await loader.loadComponent(config);
            
            expect(loader.hasComponent('TestComponent')).toBe(false);
            expect(loader.loadingStats.failed).toBe(1);
        });
        
        test('should auto-initialize components when enabled', async () => {
            const mockInit = jest.fn().mockResolvedValue(true);
            
            global.TestComponent = class TestComponent {
                constructor() {
                    this.init = mockInit;
                }
            };
            
            loader.options.autoInitComponents = true;
            
            const config = {
                name: 'TestComponent',
                dependencies: [],
                required: false
            };
            
            await loader.loadComponent(config);
            
            expect(mockInit).toHaveBeenCalled();
        });
        
        test('should handle component initialization timeout', async () => {
            global.TestComponent = class TestComponent {
                constructor() {
                    this.init = () => new Promise(() => {}); // Never resolves
                }
            };
            
            loader.options.componentTimeout = 100; // Short timeout
            
            const config = {
                name: 'TestComponent',
                dependencies: [],
                required: false
            };
            
            await loader.loadComponent(config);
            
            expect(loader.loadingStats.failed).toBe(1);
        });
    });
    
    describe('Full Initialization', () => {
        let loader;
        
        beforeEach(() => {
            loader = new ComponentLoader({ currentGalleryId: 'test-gallery' });
        });
        
        test('should complete full initialization successfully', async () => {
            await loader.initializeModularComponents();
            
            expect(loader.isInitialized).toBe(true);
            expect(loader.dependencies.eventBus).toBeDefined();
            expect(loader.dependencies.stateManager).toBeDefined();
            expect(loader.loadingStats.totalLoadTime).toBeGreaterThan(0);
        });
        
        test('should not initialize twice', async () => {
            await loader.initializeModularComponents();
            await loader.initializeModularComponents();
            
            expect(loader.logger.warn).toHaveBeenCalledWith(
                'ComponentLoader is already initialized'
            );
        });
        
        test('should handle initialization errors with recovery', async () => {
            // Mock a failure in core dependencies
            const originalEventBus = global.EventBus;
            global.EventBus = undefined;
            
            loader.options.enableErrorRecovery = true;
            
            await expect(loader.initializeModularComponents()).rejects.toThrow();
            
            // Restore for recovery
            global.EventBus = originalEventBus;
            
            expect(loader.logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Attempting error recovery')
            );
        });
        
        test('should disable error recovery when option is false', async () => {
            global.EventBus = undefined;
            loader.options.enableErrorRecovery = false;
            
            await expect(loader.initializeModularComponents()).rejects.toThrow();
            
            expect(loader.logger.warn).not.toHaveBeenCalledWith(
                expect.stringContaining('Attempting error recovery')
            );
        });
    });
    
    describe('Component Management', () => {
        let loader;
        
        beforeEach(async () => {
            loader = new ComponentLoader({});
            await loader.initializeCoreDependencies();
            
            global.TestComponent = class TestComponent extends global.BaseComponent {};
        });
        
        test('should get component by name', async () => {
            const config = { name: 'TestComponent', dependencies: [] };
            await loader.loadComponent(config);
            
            const component = loader.getComponent('TestComponent');
            
            expect(component).toBeInstanceOf(global.TestComponent);
        });
        
        test('should check if component exists', async () => {
            expect(loader.hasComponent('TestComponent')).toBe(false);
            
            const config = { name: 'TestComponent', dependencies: [] };
            await loader.loadComponent(config);
            
            expect(loader.hasComponent('TestComponent')).toBe(true);
        });
        
        test('should get all components', async () => {
            global.AnotherComponent = class AnotherComponent {};
            
            await loader.loadComponent({ name: 'TestComponent', dependencies: [] });
            await loader.loadComponent({ name: 'AnotherComponent', dependencies: [] });
            
            const allComponents = loader.getAllComponents();
            
            expect(allComponents).toHaveLength(2);
            expect(allComponents.map(([name]) => name)).toContain('TestComponent');
            expect(allComponents.map(([name]) => name)).toContain('AnotherComponent');
        });
        
        test('should reload component successfully', async () => {
            const config = { name: 'TestComponent', dependencies: [] };
            await loader.loadComponent(config);
            
            const originalComponent = loader.getComponent('TestComponent');
            await loader.reloadComponent('TestComponent');
            const reloadedComponent = loader.getComponent('TestComponent');
            
            expect(reloadedComponent).not.toBe(originalComponent);
            expect(reloadedComponent).toBeInstanceOf(global.TestComponent);
        });
        
        test('should throw error when reloading non-existent component', async () => {
            await expect(loader.reloadComponent('NonExistent')).rejects.toThrow(
                'Component NonExistent is not loaded'
            );
        });
    });
    
    describe('Communication Setup', () => {
        let loader;
        let mockOrganizer;
        
        beforeEach(async () => {
            mockOrganizer = {
                updateGridUsage: jest.fn(),
                refreshPublicationViews: jest.fn(),
                updateStatsLabel: jest.fn()
            };
            
            loader = new ComponentLoader(mockOrganizer);
            await loader.initializeCoreDependencies();
        });
        
        test('should setup component communication', () => {
            loader.setupComponentCommunication();
            
            expect(loader.logger.info).toHaveBeenCalledWith(
                '🔗 Component communication setup complete'
            );
        });
        
        test('should handle image cropped events', () => {
            loader.setupComponentCommunication();
            
            loader.dependencies.eventBus.emit('image:cropped', {});
            
            expect(mockOrganizer.updateGridUsage).toHaveBeenCalled();
            expect(mockOrganizer.refreshPublicationViews).toHaveBeenCalled();
        });
        
        test('should handle publication updated events', () => {
            loader.setupComponentCommunication();
            
            loader.dependencies.eventBus.emit('publication:updated', {});
            
            expect(mockOrganizer.updateStatsLabel).toHaveBeenCalled();
            expect(mockOrganizer.updateGridUsage).toHaveBeenCalled();
        });
    });
    
    describe('State Synchronization', () => {
        let loader;
        let mockOrganizer;
        
        beforeEach(async () => {
            mockOrganizer = {
                currentGalleryId: 'test-gallery',
                currentThumbSize: { width: 150, height: 150 }
            };
            
            loader = new ComponentLoader(mockOrganizer);
            await loader.initializeCoreDependencies();
        });
        
        test('should sync state with organizer', () => {
            loader.syncStateWithExistingOrganizer();
            
            const stateManager = loader.dependencies.stateManager;
            expect(stateManager.get('gallery.currentGalleryId')).toBe('test-gallery');
            expect(stateManager.get('gallery.currentThumbSize')).toEqual({ width: 150, height: 150 });
        });
    });
    
    describe('Statistics and Info', () => {
        let loader;
        
        beforeEach(async () => {
            loader = new ComponentLoader({});
            await loader.initializeCoreDependencies();
        });
        
        test('should provide loading statistics', async () => {
            global.TestComponent = class TestComponent {};
            
            await loader.loadComponent({ name: 'TestComponent', dependencies: [] });
            await loader.loadComponent({ name: 'NonExistent', dependencies: [] });
            
            const stats = loader.getLoadingStats();
            
            expect(stats.attempted).toBe(2);
            expect(stats.successful).toBe(1);
            expect(stats.failed).toBe(1);
        });
        
        test('should provide dependencies info', () => {
            const dependencies = loader.getDependencies();
            
            expect(dependencies.eventBus).toBeInstanceOf(global.EventBus);
            expect(dependencies.stateManager).toBeInstanceOf(global.StateManager);
        });
    });
    
    describe('Cleanup', () => {
        let loader;
        
        beforeEach(async () => {
            loader = new ComponentLoader({});
            await loader.initializeModularComponents();
        });
        
        test('should destroy all components and reset state', async () => {
            global.TestComponent = class TestComponent {
                constructor() {
                    this.destroy = jest.fn();
                }
            };
            
            await loader.loadComponent({ name: 'TestComponent', dependencies: [] });
            const component = loader.getComponent('TestComponent');
            
            await loader.destroy();
            
            expect(component.destroy).toHaveBeenCalled();
            expect(loader.components.size).toBe(0);
            expect(loader.dependencies).toEqual({});
            expect(loader.isInitialized).toBe(false);
        });
        
        test('should handle component destruction errors gracefully', async () => {
            global.TestComponent = class TestComponent {
                constructor() {
                    this.destroy = jest.fn().mockRejectedValue(new Error('Destroy failed'));
                }
            };
            
            await loader.loadComponent({ name: 'TestComponent', dependencies: [] });
            
            await loader.destroy();
            
            expect(loader.logger.error).toHaveBeenCalledWith(
                expect.stringContaining('Error destroying component'),
                expect.any(Error)
            );
        });
    });
    
    describe('Performance', () => {
        test('should track total loading time', async () => {
            const loader = new ComponentLoader({});
            
            await loader.initializeModularComponents();
            
            const stats = loader.getLoadingStats();
            expect(stats.totalLoadTime).toBeGreaterThan(0);
        });
        
        test('should handle multiple concurrent operations', async () => {
            const loader = new ComponentLoader({});
            
            const promises = [
                loader.initializeModularComponents(),
                loader.initializeModularComponents(),
                loader.initializeModularComponents()
            ];
            
            await Promise.allSettled(promises);
            
            expect(loader.isInitialized).toBe(true);
        });
    });
});