// ===============================
// File: modules/modular-integration-example.js
// Example of how modular components integrate with the main application
// ===============================

/**
 * ModularApplicationManager demonstrates how to integrate modular components
 * with the existing PublicationOrganizer application
 */
class ModularApplicationManager {
    constructor() {
        this.components = new Map();
        this.initialized = false;
        
        // Global dependencies
        this.eventBus = window.eventBus || new EventBus();
        this.stateManager = window.stateManager || new StateManager(this.eventBus);
        
        // Set debug mode if in development
        if (window.location.hostname === 'localhost') {
            this.eventBus.setDebugMode(true);
        }
        
        this.logger = this.createLogger();
    }
    
    createLogger() {
        return {
            info: (message, data = {}) => {
                console.log(`[ModularApp] ${message}`, data);
            },
            warn: (message, data = {}) => {
                console.warn(`[ModularApp] ${message}`, data);
            },
            error: (message, error = null, data = {}) => {
                console.error(`[ModularApp] ${message}`, error, data);
            }
        };
    }
    
    /**
     * Initialize modular components alongside existing PublicationOrganizer
     */
    async initialize(existingOrganizerApp) {
        if (this.initialized) {
            this.logger.warn('Already initialized');
            return;
        }
        
        try {
            this.logger.info('Initializing modular application manager');
            
            // Store reference to existing app
            this.existingApp = existingOrganizerApp;
            
            // Load state from localStorage
            this.stateManager.loadPersistedState();
            
            // Initialize core dependencies
            const coreDependencies = {
                eventBus: this.eventBus,
                stateManager: this.stateManager,
                organizer: existingOrganizerApp
            };
            
            // Initialize modular components
            await this.initializeComponents(coreDependencies);
            
            // Set up inter-component communication
            this.setupEventBridge();
            
            // Migrate existing state to new state manager
            this.migrateExistingState();
            
            this.initialized = true;
            
            this.logger.info('Modular application manager initialized successfully');
            this.eventBus.emit('modularAppInitialized');
            
        } catch (error) {
            this.logger.error('Failed to initialize modular application', error);
            throw error;
        }
    }
    
    /**
     * Initialize modular components
     */
    async initializeComponents(dependencies) {
        this.logger.info('Initializing modular components');
        
        const componentsToInitialize = [
            {
                name: 'CroppingManager',
                class: CroppingManager,
                dependencies: {
                    ...dependencies,
                    croppingPage: this.existingApp?.croppingPage
                }
            },
            {
                name: 'DescriptionManager',
                class: DescriptionManager,
                dependencies: {
                    ...dependencies,
                    organizerApp: this.existingApp
                }
            }
        ];
        
        // Initialize components sequentially
        for (const componentConfig of componentsToInitialize) {
            try {
                this.logger.info(`Initializing ${componentConfig.name}`);
                
                const component = new componentConfig.class(componentConfig.dependencies);
                await component.initialize();
                
                this.components.set(componentConfig.name, component);
                
                this.logger.info(`${componentConfig.name} initialized successfully`);
                
            } catch (error) {
                this.logger.error(`Failed to initialize ${componentConfig.name}`, error);
                // Continue with other components even if one fails
            }
        }
        
        this.logger.info(`Initialized ${this.components.size} modular components`);
    }
    
    /**
     * Set up event bridge between old and new systems
     */
    setupEventBridge() {
        this.logger.info('Setting up event bridge');
        
        // Bridge gallery events
        this.eventBus.subscribe('gallery:selected', (data) => {
            if (this.existingApp && typeof this.existingApp.setCurrentGallery === 'function') {
                this.existingApp.setCurrentGallery(data.galleryId);
            }
        });
        
        // Bridge publication events
        this.eventBus.subscribe('publication:selected', (data) => {
            if (this.existingApp && typeof this.existingApp.setCurrentPublicationFrame === 'function') {
                const publicationFrame = this.existingApp.publicationFrames?.find(
                    pf => pf.id === data.publicationId
                );
                if (publicationFrame) {
                    this.existingApp.setCurrentPublicationFrame(publicationFrame);
                }
            }
        });
        
        // Bridge tab change events
        this.eventBus.subscribe('ui:tabChanged', (data) => {
            this.logger.info('Tab changed via modular system', data);
        });
        
        // Bridge save events
        this.eventBus.subscribe('save:success', (data) => {
            this.logger.info('Save successful', data);
            
            if (this.existingApp && typeof this.existingApp.refreshSidePanels === 'function') {
                this.existingApp.refreshSidePanels();
            }
        });
        
        // Bridge error events
        this.eventBus.subscribe('error:occurred', (data) => {
            this.logger.error('Error occurred in modular component', data.error, data);
        });
        
        this.logger.info('Event bridge set up successfully');
    }
    
    /**
     * Migrate existing application state to new state manager
     */
    migrateExistingState() {
        if (!this.existingApp) return;
        
        this.logger.info('Migrating existing state to modular state manager');
        
        try {
            // Migrate gallery state
            if (this.existingApp.currentGalleryId) {
                this.stateManager.set('gallery.currentGalleryId', this.existingApp.currentGalleryId);
            }
            
            if (this.existingApp.getCurrentGalleryName) {
                this.stateManager.set('gallery.currentGalleryName', this.existingApp.getCurrentGalleryName());
            }
            
            if (this.existingApp.currentThumbSize) {
                this.stateManager.set('gallery.thumbSize', this.existingApp.currentThumbSize);
            }
            
            // Migrate UI state
            const activeTab = document.querySelector('.tab-button.active')?.dataset.tab;
            if (activeTab) {
                this.stateManager.set('app.currentTab', activeTab);
            }
            
            // Migrate publication state
            if (this.existingApp.publicationFrames) {
                this.stateManager.set('publication.publications', this.existingApp.publicationFrames.map(pf => ({
                    id: pf.id,
                    letter: pf.letter,
                    galleryId: pf.galleryId,
                    imageCount: pf.imagesData?.length || 0
                })));
            }
            
            this.logger.info('State migration completed');
            
        } catch (error) {
            this.logger.error('Failed to migrate existing state', error);
        }
    }
    
    /**
     * Get a modular component by name
     */
    getComponent(name) {
        return this.components.get(name);
    }
    
    /**
     * Check if a component is available and initialized
     */
    hasComponent(name) {
        const component = this.components.get(name);
        return component && component.initialized && !component.destroyed;
    }
    
    /**
     * Enhanced cropping with modular CroppingManager
     */
    async startModularCropping(publicationFrame, startIndex = 0) {
        const croppingManager = this.getComponent('CroppingManager');
        
        if (!croppingManager) {
            this.logger.warn('CroppingManager not available, falling back to existing implementation');
            
            // Fallback to existing implementation
            if (this.existingApp?.croppingPage?.startCroppingForJour) {
                return this.existingApp.croppingPage.startCroppingForJour(publicationFrame, startIndex);
            }
            
            throw new Error('No cropping implementation available');
        }
        
        try {
            this.logger.info('Starting modular cropping session', { 
                publicationId: publicationFrame.id,
                startIndex 
            });
            
            // Prepare images for cropping
            const imagesToCrop = publicationFrame.imagesData.map(imgData => ({
                pathForCropper: imgData.imageId,
                dataURL: imgData.dataURL,
                originalReferenceId: imgData.originalReferencePath,
                baseImageToCropFromDataURL: imgData.mainImagePath || imgData.imagePath,
                currentImageId: imgData.imageId
            })).filter(info => info !== null);
            
            // Start cropping with modular component
            await croppingManager.startCropping(imagesToCrop, publicationFrame, startIndex);
            
            this.eventBus.emit('modularCroppingStarted', { 
                publicationId: publicationFrame.id,
                imageCount: imagesToCrop.length 
            });
            
        } catch (error) {
            this.logger.error('Failed to start modular cropping', error);
            throw error;
        }
    }
    
    /**
     * Enhanced description editing with modular DescriptionManager
     */
    async openModularDescriptionEditor(publicationFrame = null) {
        const descriptionManager = this.getComponent('DescriptionManager');
        
        if (!descriptionManager) {
            this.logger.warn('DescriptionManager not available, falling back to existing implementation');
            
            // Fallback to existing implementation
            if (this.existingApp?.descriptionManager) {
                if (publicationFrame) {
                    return this.existingApp.descriptionManager.selectPublication(publicationFrame);
                } else {
                    return this.existingApp.descriptionManager.selectCommon();
                }
            }
            
            throw new Error('No description manager available');
        }
        
        try {
            this.logger.info('Opening modular description editor', { 
                publicationId: publicationFrame?.id 
            });
            
            // Show the description manager
            descriptionManager.show();
            
            // Select publication or common
            if (publicationFrame) {
                await descriptionManager.selectPublication(publicationFrame);
            } else {
                await descriptionManager.selectCommon();
            }
            
            this.eventBus.emit('modularDescriptionOpened', { 
                publicationId: publicationFrame?.id 
            });
            
        } catch (error) {
            this.logger.error('Failed to open modular description editor', error);
            throw error;
        }
    }
    
    /**
     * Get debug information about the modular system
     */
    getDebugInfo() {
        return {
            initialized: this.initialized,
            componentCount: this.components.size,
            components: Array.from(this.components.keys()),
            eventBus: this.eventBus.getDebugInfo(),
            stateManager: this.stateManager.getDebugInfo(),
            hasExistingApp: !!this.existingApp
        };
    }
    
    /**
     * Destroy all modular components
     */
    async destroy() {
        this.logger.info('Destroying modular application manager');
        
        // Destroy components in reverse order
        const componentEntries = Array.from(this.components.entries()).reverse();
        
        for (const [name, component] of componentEntries) {
            try {
                this.logger.info(`Destroying ${name}`);
                component.destroy();
            } catch (error) {
                this.logger.error(`Failed to destroy ${name}`, error);
            }
        }
        
        this.components.clear();
        
        // Clear event bus
        this.eventBus.removeAllListeners();
        
        this.initialized = false;
        
        this.logger.info('Modular application manager destroyed');
    }
}

/**
 * Integration helper functions
 */
const ModularIntegration = {
    /**
     * Check if modular components are available
     */
    isModularSystemAvailable() {
        return !!(window.BaseComponent && window.EventBus && window.StateManager);
    },
    
    /**
     * Initialize modular system with existing app
     */
    async initializeWithExistingApp(existingApp) {
        if (!this.isModularSystemAvailable()) {
            console.warn('Modular system components not available');
            return null;
        }
        
        try {
            const modularApp = new ModularApplicationManager();
            await modularApp.initialize(existingApp);
            
            // Store globally for access
            window.modularApp = modularApp;
            
            return modularApp;
            
        } catch (error) {
            console.error('Failed to initialize modular system', error);
            return null;
        }
    },
    
    /**
     * Enhanced tab activation with modular support
     */
    async activateTabWithModularSupport(tabName, existingActivateTabFunction) {
        // Emit tab change event
        if (window.eventBus) {
            window.eventBus.emit('ui:tabChanged', { 
                tabName, 
                timestamp: Date.now() 
            });
        }
        
        // Update state
        if (window.stateManager) {
            window.stateManager.set('app.currentTab', tabName);
        }
        
        // Special handling for modular components
        if (window.modularApp) {
            const modularApp = window.modularApp;
            
            switch (tabName) {
                case 'cropping':
                    // Ensure CroppingManager is ready
                    if (modularApp.hasComponent('CroppingManager')) {
                        console.log('Cropping tab activated with modular support');
                    }
                    break;
                    
                case 'description':
                    // Ensure DescriptionManager is ready
                    if (modularApp.hasComponent('DescriptionManager')) {
                        const descriptionManager = modularApp.getComponent('DescriptionManager');
                        descriptionManager.show();
                    }
                    break;
            }
        }
        
        // Call existing tab activation function
        if (typeof existingActivateTabFunction === 'function') {
            return existingActivateTabFunction(tabName);
        }
    }
};

// Export for global access
window.ModularApplicationManager = ModularApplicationManager;
window.ModularIntegration = ModularIntegration;

export { ModularApplicationManager, ModularIntegration };