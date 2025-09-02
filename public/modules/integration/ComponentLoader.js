// ===============================
// File: public/modules/integration/ComponentLoader.js
// Component loader for gradual modular integration
// ===============================

/**
 * ComponentLoader handles the gradual loading and integration of modular components
 * into the existing PublicationOrganizer system
 */
class ComponentLoader {
    constructor(organizer) {
        this.organizer = organizer;
        this.loadedComponents = new Map();
        this.dependencies = null;
        this.logger = this.createLogger();
    }
    
    /**
     * Initialize the component loading system
     */
    async initialize() {
        this.logger.info('Initializing component loader');
        
        try {
            // Setup core dependencies
            await this.setupCoreDependencies();
            
            // Load available components
            await this.loadAvailableComponents();
            
            // Setup component integration
            this.setupComponentIntegration();
            
            this.logger.info('Component loader initialized successfully');
            
        } catch (error) {
            this.logger.error('Failed to initialize component loader', error);
            throw error;
        }
    }
    
    /**
     * Setup core dependencies for components
     */
    async setupCoreDependencies() {
        // Initialize EventBus if not already available
        if (!window.eventBus) {
            if (window.EventBus) {
                window.eventBus = new EventBus();
                this.logger.info('EventBus initialized');
            } else {
                this.logger.warn('EventBus not available');
            }
        }
        
        // Initialize StateManager if not already available
        if (!window.stateManager && window.StateManager) {
            window.stateManager = new StateManager(window.eventBus);
            this.logger.info('StateManager initialized');
        }
        
        // Create shared dependencies object
        this.dependencies = {
            organizer: this.organizer,
            eventBus: window.eventBus || null,
            stateManager: window.stateManager || null,
            logger: this.logger
        };
    }
    
    /**
     * Load available modular components
     */
    async loadAvailableComponents() {
        const componentsToLoad = [
            { name: 'CroppingManager', class: window.CroppingManager },
            { name: 'DescriptionManager', class: window.DescriptionManager },
            { name: 'SaveStatusIndicator', class: window.SaveStatusIndicator }
        ];
        
        for (const { name, class: ComponentClass } of componentsToLoad) {
            if (ComponentClass) {
                try {
                    await this.loadComponent(name, ComponentClass);
                } catch (error) {
                    this.logger.error(`Failed to load component ${name}`, error);
                }
            } else {
                this.logger.warn(`Component ${name} not available`);
            }
        }
    }
    
    /**
     * Load a specific component
     */
    async loadComponent(name, ComponentClass) {
        this.logger.info(`Loading component: ${name}`);
        
        try {
            // Create component-specific dependencies
            const componentDeps = { ...this.dependencies };
            
            // Add component-specific dependencies
            switch (name) {
                case 'CroppingManager':
                    componentDeps.croppingPage = this.organizer.croppingPage;
                    break;
                case 'DescriptionManager':
                    // DescriptionManager uses base dependencies
                    break;
                case 'SaveStatusIndicator':
                    // SaveStatusIndicator uses base dependencies
                    break;
            }
            
            // Create component instance
            const component = new ComponentClass(componentDeps);
            
            // Initialize component
            await component.initialize();
            
            // Store component
            this.loadedComponents.set(name, component);
            
            // Integrate component with organizer
            this.integrateComponent(name, component);
            
            this.logger.info(`Component ${name} loaded successfully`);
            
        } catch (error) {
            this.logger.error(`Failed to load component ${name}`, error);
            throw error;
        }
    }
    
    /**
     * Integrate a component with the existing organizer
     */
    integrateComponent(name, component) {
        switch (name) {
            case 'CroppingManager':
                this.integrateCroppingManager(component);
                break;
            case 'DescriptionManager':
                this.integrateDescriptionManager(component);
                break;
            case 'SaveStatusIndicator':
                this.integrateSaveStatusIndicator(component);
                break;
        }
        
        // Store reference on organizer
        this.organizer[`modular${name}`] = component;
    }
    
    /**
     * Integrate CroppingManager with existing cropping functionality
     */
    integrateCroppingManager(croppingManager) {
        if (!this.organizer.croppingPage) {
            this.logger.warn('CroppingPage not available for integration');
            return;
        }
        
        // Enhance cropping page with modular manager
        const originalStartCropping = this.organizer.croppingPage.startCropping?.bind(this.organizer.croppingPage);
        
        if (originalStartCropping) {
            this.organizer.croppingPage.startCropping = async (imagesToCrop, publicationFrame, startIndex) => {
                try {
                    // Use modular cropping manager
                    return await croppingManager.startCropping(imagesToCrop, publicationFrame, startIndex);
                } catch (error) {
                    this.logger.warn('Modular cropping failed, falling back to original', error);
                    // Fallback to original implementation
                    return originalStartCropping(imagesToCrop, publicationFrame, startIndex);
                }
            };
        }
        
        this.logger.info('CroppingManager integrated');
    }
    
    /**
     * Integrate DescriptionManager with existing description functionality
     */
    integrateDescriptionManager(descriptionManager) {
        // Enhance description save functionality
        const originalSaveDescription = this.organizer.saveCurrentPublicationDescription?.bind(this.organizer);
        
        if (originalSaveDescription) {
            this.organizer.saveCurrentPublicationDescription = async (descriptionText) => {
                try {
                    // Use modular description manager
                    return await descriptionManager.saveDescription(descriptionText);
                } catch (error) {
                    this.logger.warn('Modular description save failed, falling back to original', error);
                    // Fallback to original implementation
                    return originalSaveDescription(descriptionText);
                }
            };
        }
        
        // Integrate with description tab activation
        if (this.organizer.descriptionManager) {
            const originalShow = this.organizer.descriptionManager.show?.bind(this.organizer.descriptionManager);
            if (originalShow) {
                this.organizer.descriptionManager.show = function() {
                    // Call original show
                    originalShow();
                    // Activate modular component
                    descriptionManager.activate?.();
                };
            }
        }
        
        this.logger.info('DescriptionManager integrated');
    }
    
    /**
     * Integrate SaveStatusIndicator with existing save operations
     */
    integrateSaveStatusIndicator(saveStatusIndicator) {
        // Enhance existing save methods
        this.enhanceSaveMethodsWithStatusIndicator(saveStatusIndicator);
        
        // Setup event listeners for save status
        if (this.dependencies.eventBus) {
            this.dependencies.eventBus.subscribe('save:started', () => {
                saveStatusIndicator.show('saving');
            });
            
            this.dependencies.eventBus.subscribe('save:success', () => {
                saveStatusIndicator.show('success');
            });
            
            this.dependencies.eventBus.subscribe('save:error', () => {
                saveStatusIndicator.show('error');
            });
        }
        
        this.logger.info('SaveStatusIndicator integrated');
    }
    
    /**
     * Enhance save methods with status indicator
     */
    enhanceSaveMethodsWithStatusIndicator(saveStatusIndicator) {
        // Enhance organizer save method
        const originalSaveAppState = this.organizer.saveAppState?.bind(this.organizer);
        if (originalSaveAppState) {
            this.organizer.saveAppState = async function() {
                saveStatusIndicator.show('saving');
                try {
                    await originalSaveAppState();
                    saveStatusIndicator.show('success');
                } catch (error) {
                    saveStatusIndicator.show('error');
                    throw error;
                }
            };
        }
        
        // Enhance publication frame save methods
        if (this.organizer.publicationFrames) {
            this.organizer.publicationFrames.forEach(pf => {
                if (pf.debouncedSave) {
                    const originalSave = pf.debouncedSave.bind(pf);
                    pf.debouncedSave = function() {
                        saveStatusIndicator.show('saving');
                        originalSave();
                        // Note: Success/error will be handled by the debounced save completion
                    };
                }
            });
        }
    }
    
    /**
     * Setup component integration and communication
     */
    setupComponentIntegration() {
        if (!this.dependencies.eventBus) {
            this.logger.warn('EventBus not available, skipping event integration');
            return;
        }
        
        // Setup state synchronization
        this.setupStateSynchronization();
        
        // Setup component communication
        this.setupComponentCommunication();
        
        // Setup enhanced tab activation
        this.setupEnhancedTabActivation();
    }
    
    /**
     * Setup state synchronization between organizer and StateManager
     */
    setupStateSynchronization() {
        if (!this.dependencies.stateManager) {
            this.logger.warn('StateManager not available, skipping state sync');
            return;
        }
        
        const stateManager = this.dependencies.stateManager;
        
        // Sync initial state
        stateManager.set('gallery.currentGalleryId', this.organizer.currentGalleryId);
        stateManager.set('gallery.currentThumbSize', this.organizer.currentThumbSize);
        
        // Subscribe to state changes
        stateManager.subscribe('gallery.currentGalleryId', (value) => {
            if (value !== this.organizer.currentGalleryId) {
                this.organizer.currentGalleryId = value;
                this.dependencies.eventBus.emit('gallery:changed', { galleryId: value });
            }
        });
        
        this.logger.info('State synchronization setup complete');
    }
    
    /**
     * Setup communication between components
     */
    setupComponentCommunication() {
        const eventBus = this.dependencies.eventBus;
        
        // Image cropping events
        eventBus.subscribe('image:cropped', (data) => {
            this.organizer.updateGridUsage?.();
            this.organizer.refreshPublicationViews?.();
        });
        
        // Publication update events
        eventBus.subscribe('publication:updated', (data) => {
            this.organizer.updateStatsLabel?.();
            this.organizer.updateGridUsage?.();
        });
        
        this.logger.info('Component communication setup complete');
    }
    
    /**
     * Setup enhanced tab activation with modular components
     */
    setupEnhancedTabActivation() {
        const originalActivateTab = this.organizer.activateTab?.bind(this.organizer);
        
        if (originalActivateTab) {
            this.organizer.activateTab = async (tabId) => {
                // Call original activation
                await originalActivateTab(tabId);
                
                // Activate modular components
                await this.activateModularComponentsForTab(tabId);
                
                // Emit tab change event
                this.dependencies.eventBus?.emit('ui:tabChanged', { tabId });
            };
        }
    }
    
    /**
     * Activate modular components for specific tab
     */
    async activateModularComponentsForTab(tabId) {
        switch (tabId) {
            case 'cropping':
                const croppingManager = this.loadedComponents.get('CroppingManager');
                if (croppingManager && croppingManager.activate) {
                    await croppingManager.activate();
                }
                break;
                
            case 'description':
                const descriptionManager = this.loadedComponents.get('DescriptionManager');
                if (descriptionManager && descriptionManager.activate) {
                    await descriptionManager.activate();
                }
                break;
        }
    }
    
    /**
     * Check if a component is loaded
     */
    isComponentLoaded(name) {
        return this.loadedComponents.has(name);
    }
    
    /**
     * Get a loaded component
     */
    getComponent(name) {
        return this.loadedComponents.get(name);
    }
    
    /**
     * Destroy all loaded components
     */
    destroy() {
        this.logger.info('Destroying component loader');
        
        for (const [name, component] of this.loadedComponents) {
            try {
                if (component.destroy) {
                    component.destroy();
                }
                this.logger.info(`Component ${name} destroyed`);
            } catch (error) {
                this.logger.error(`Failed to destroy component ${name}`, error);
            }
        }
        
        this.loadedComponents.clear();
        this.logger.info('Component loader destroyed');
    }
    
    /**
     * Create logger
     */
    createLogger() {
        return {
            info: (message, data = {}) => {
                console.log(`[ComponentLoader] ${message}`, data);
            },
            warn: (message, data = {}) => {
                console.warn(`[ComponentLoader] ${message}`, data);
            },
            error: (message, error = null, data = {}) => {
                console.error(`[ComponentLoader] ${message}`, error, data);
            }
        };
    }
}

// Export for global access
window.ComponentLoader = ComponentLoader;
export default ComponentLoader;