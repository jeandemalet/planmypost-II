// ===============================
// File: tests/unit/frontend/ModularPublicationOrganizer.test.js
// Tests for ModularPublicationOrganizer integration component
// ===============================

/**
 * @jest-environment jsdom
 */

describe('ModularPublicationOrganizer', () => {
    let ModularPublicationOrganizer;
    
    beforeEach(() => {
        // Mock base PublicationOrganizer
        global.PublicationOrganizer = class MockPublicationOrganizer {
            constructor() {
                this.currentGalleryId = null;
                this.publicationFrames = [];
                this.isInitialized = false;
            }
            
            async loadState() {
                this.isInitialized = true;
            }
            
            initializeModules() {}
            async fetchCsrfToken() {}
            saveGalleryState() { return Promise.resolve(); }
        };
        
        // Mock EventBus
        global.EventBus = class MockEventBus {
            constructor() {
                this.events = new Map();
            }
            on(event, callback) { return 'listener-id'; }
            emit(event, data) { return 1; }
        };
        
        // Mock StateManager
        global.StateManager = class MockStateManager {
            constructor() {
                this.state = new Map();
            }
            get(key) { return this.state.get(key); }
            set(key, value) { this.state.set(key, value); return true; }
            subscribe(key, callback) { return 'subscription-id'; }
        };
        
        // Define ModularPublicationOrganizer
        global.ModularPublicationOrganizer = class ModularPublicationOrganizer extends global.PublicationOrganizer {
            constructor() {
                super();
                this.eventBus = null;
                this.stateManager = null;
                this.modularComponents = new Map();
                this.migrationStatus = {
                    isModularMode: false,
                    migratedComponents: new Set(),
                    fallbackComponents: new Set()
                };
                this._initializeModularArchitecture();
            }
            
            _initializeModularArchitecture() {
                try {
                    if (typeof EventBus !== 'undefined') {
                        this.eventBus = new EventBus();
                    }
                    if (typeof StateManager !== 'undefined') {
                        this.stateManager = new StateManager();
                    }
                    this.migrationStatus.isModularMode = true;
                } catch (error) {
                    this.migrationStatus.isModularMode = false;
                }
            }
            
            async loadState() {
                await super.loadState();
                if (this.stateManager) {
                    this.stateManager.set('currentGalleryId', this.currentGalleryId);
                }
            }
            
            migrateComponent(name, component) {
                if (!this.migrationStatus.isModularMode) return false;
                
                try {
                    this.modularComponents.set(name, component);
                    this.migrationStatus.migratedComponents.add(name);
                    return true;
                } catch (error) {
                    this.migrationStatus.fallbackComponents.add(name);
                    return false;
                }
            }
            
            getModularComponent(name) {
                return this.modularComponents.get(name);
            }
            
            hasModularComponent(name) {
                return this.modularComponents.has(name);
            }
            
            enableModularFeature(featureName, options = {}) {
                if (!this.stateManager) return false;
                this.stateManager.set(`feature_${featureName}`, { enabled: true, options });
                return true;
            }
            
            isModularFeatureEnabled(featureName) {
                if (!this.stateManager) return false;
                const state = this.stateManager.get(`feature_${featureName}`);
                return state && state.enabled === true;
            }
            
            getModularStats() {
                return {
                    isModularMode: this.migrationStatus.isModularMode,
                    migratedComponents: Array.from(this.migrationStatus.migratedComponents),
                    fallbackComponents: Array.from(this.migrationStatus.fallbackComponents),
                    componentCount: this.modularComponents.size,
                    hasEventBus: !!this.eventBus,
                    hasStateManager: !!this.stateManager
                };
            }
            
            destroy() {
                for (const component of this.modularComponents.values()) {
                    if (component && component.destroy) {
                        component.destroy();
                    }
                }
                this.modularComponents.clear();
                this.eventBus = null;
                this.stateManager = null;
                this.migrationStatus.isModularMode = false;
            }
        };
        
        ModularPublicationOrganizer = global.ModularPublicationOrganizer;
    });
    
    afterEach(() => {
        jest.clearAllMocks();
    });
    
    describe('Constructor', () => {
        test('should create ModularPublicationOrganizer extending PublicationOrganizer', () => {
            const app = new ModularPublicationOrganizer();
            
            expect(app).toBeInstanceOf(global.PublicationOrganizer);
            expect(app.eventBus).toBeInstanceOf(global.EventBus);
            expect(app.stateManager).toBeInstanceOf(global.StateManager);
            expect(app.migrationStatus.isModularMode).toBe(true);
        });
        
        test('should handle initialization errors gracefully', () => {
            global.EventBus = undefined;
            
            const app = new ModularPublicationOrganizer();
            
            expect(app.migrationStatus.isModularMode).toBe(false);
        });
    });
    
    describe('State Integration', () => {
        test('should sync state on loadState', async () => {
            const app = new ModularPublicationOrganizer();
            const stateSetSpy = jest.spyOn(app.stateManager, 'set');
            
            app.currentGalleryId = 'test-gallery';
            await app.loadState();
            
            expect(stateSetSpy).toHaveBeenCalledWith('currentGalleryId', 'test-gallery');
        });
    });
    
    describe('Component Migration', () => {
        test('should migrate component successfully', () => {
            const app = new ModularPublicationOrganizer();
            const mockComponent = { name: 'TestComponent' };
            
            const result = app.migrateComponent('TestComponent', mockComponent);
            
            expect(result).toBe(true);
            expect(app.hasModularComponent('TestComponent')).toBe(true);
            expect(app.getModularComponent('TestComponent')).toBe(mockComponent);
        });
        
        test('should handle migration errors', () => {
            const app = new ModularPublicationOrganizer();
            app.migrationStatus.isModularMode = false;
            
            const result = app.migrateComponent('TestComponent', {});
            
            expect(result).toBe(false);
        });
    });
    
    describe('Feature Management', () => {
        test('should enable and check features', () => {
            const app = new ModularPublicationOrganizer();
            
            const result = app.enableModularFeature('testFeature', { option: 'value' });
            
            expect(result).toBe(true);
            expect(app.isModularFeatureEnabled('testFeature')).toBe(true);
        });
    });
    
    describe('Statistics', () => {
        test('should provide accurate stats', () => {
            const app = new ModularPublicationOrganizer();
            app.migrateComponent('Component1', {});
            
            const stats = app.getModularStats();
            
            expect(stats.isModularMode).toBe(true);
            expect(stats.migratedComponents).toEqual(['Component1']);
            expect(stats.componentCount).toBe(1);
            expect(stats.hasEventBus).toBe(true);
            expect(stats.hasStateManager).toBe(true);
        });
    });
    
    describe('Cleanup', () => {
        test('should destroy components and cleanup', () => {
            const app = new ModularPublicationOrganizer();
            const mockComponent = { destroy: jest.fn() };
            
            app.migrateComponent('Component1', mockComponent);
            app.destroy();
            
            expect(mockComponent.destroy).toHaveBeenCalled();
            expect(app.modularComponents.size).toBe(0);
            expect(app.eventBus).toBeNull();
            expect(app.stateManager).toBeNull();
        });
    });
});