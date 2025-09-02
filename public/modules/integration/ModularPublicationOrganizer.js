// ===============================
// File: public/modules/integration/ModularPublicationOrganizer.js
// Integrated version of PublicationOrganizer with modular components
// ===============================

/**
 * Enhanced PublicationOrganizer that integrates modular components
 * while maintaining backward compatibility with the existing codebase
 */
class ModularPublicationOrganizer extends PublicationOrganizer {
    constructor() {
        super();
        
        // Initialize modular architecture
        this.initializeModularArchitecture();
    }
    
    /**
     * Initialize the modular architecture components
     */
    async initializeModularArchitecture() {
        try {
            this.logger = this.createLogger();
            this.logger.info('Initializing modular architecture');
            
            // Initialize EventBus first
            this.eventBus = window.eventBus || new EventBus();
            this.eventBus.setDebugMode(true);
            
            // Initialize StateManager
            this.stateManager = window.stateManager || new StateManager(this.eventBus);
            
            // Create shared dependencies object
            this.dependencies = {
                organizer: this,
                eventBus: this.eventBus,
                stateManager: this.stateManager,
                logger: this.logger
            };
            
            // Initialize modular components
            await this.initializeModularComponents();
            
            // Setup component integration
            this.setupComponentIntegration();
            
            this.logger.info('Modular architecture initialized successfully');
            
        } catch (error) {
            console.error('Failed to initialize modular architecture:', error);
            // Fallback to original behavior if modular initialization fails
        }
    }
    
    /**
     * Initialize all modular components
     */
    async initializeModularComponents() {
        // Initialize CroppingManager
        if (window.CroppingManager && this.croppingPage) {
            this.modularCroppingManager = new CroppingManager({
                ...this.dependencies,
                croppingPage: this.croppingPage
            });
            await this.modularCroppingManager.initialize();
        }
        
        // Initialize DescriptionManager
        if (window.DescriptionManager) {
            this.modularDescriptionManager = new DescriptionManager(this.dependencies);
            await this.modularDescriptionManager.initialize();
        }
        
        // Initialize SaveStatusIndicator
        if (window.SaveStatusIndicator) {
            this.saveStatusIndicator = new SaveStatusIndicator(this.dependencies);
            await this.saveStatusIndicator.initialize();
        }
    }
    
    /**
     * Setup integration between modular components and existing system
     */
    setupComponentIntegration() {
        // EventBus integration
        this.setupEventBusIntegration();
        
        // StateManager integration
        this.setupStateManagerIntegration();
        
        // Component cross-communication
        this.setupComponentCommunication();
    }
    
    /**
     * Setup EventBus event handlers
     */
    setupEventBusIntegration() {
        // Listen for save events
        this.eventBus.subscribe('save:started', (data) => {
            this.saveStatusIndicator?.show('saving');
        });
        
        this.eventBus.subscribe('save:success', (data) => {
            this.saveStatusIndicator?.show('success');
        });
        
        this.eventBus.subscribe('save:error', (data) => {
            this.saveStatusIndicator?.show('error');
        });
        
        // Listen for gallery events
        this.eventBus.subscribe('gallery:selected', (data) => {
            this.handleGallerySelected(data);
        });
        
        // Listen for image events
        this.eventBus.subscribe('image:cropped', (data) => {
            this.handleImageCropped(data);
        });
        
        // Listen for publication events
        this.eventBus.subscribe('publication:updated', (data) => {
            this.handlePublicationUpdated(data);
        });
    }
    
    /**
     * Setup StateManager integration
     */
    setupStateManagerIntegration() {
        // Sync existing properties with StateManager
        this.syncStateWithStateManager();
        
        // Subscribe to state changes
        this.stateManager.subscribe('gallery.currentGalleryId', (value) => {
            if (value !== this.currentGalleryId) {
                this.currentGalleryId = value;
                this.handleGalleryChanged(value);
            }
        });
        
        this.stateManager.subscribe('ui.currentTab', (value) => {
            this.handleTabChanged(value);
        });
    }
    
    /**
     * Setup communication between modular components
     */
    setupComponentCommunication() {
        // Connect CroppingManager with DescriptionManager
        if (this.modularCroppingManager && this.modularDescriptionManager) {
            this.eventBus.subscribe('image:cropped', (data) => {
                // Notify description manager of cropped images
                this.modularDescriptionManager.handleImageCropped(data);
            });
        }
        
        // Connect SaveStatusIndicator with all save operations
        if (this.saveStatusIndicator) {
            // Enhance existing save methods to use status indicator
            this.enhanceSaveMethodsWithStatusIndicator();
        }
    }
    
    /**
     * Sync existing properties with StateManager
     */
    syncStateWithStateManager() {
        // Sync gallery state
        this.stateManager.set('gallery.currentGalleryId', this.currentGalleryId);
        this.stateManager.set('gallery.currentThumbSize', this.currentThumbSize);
        this.stateManager.set('gallery.sortOption', this.sortOptionsSelect?.value);
        
        // Sync UI state
        const activeTab = document.querySelector('.tab-button.active')?.dataset.tab;
        this.stateManager.set('ui.currentTab', activeTab);
        
        // Sync publication state
        this.stateManager.set('publication.publications', this.publicationFrames.map(pf => ({
            id: pf.id,
            letter: pf.letter,
            index: pf.index
        })));
    }
    
    /**
     * Enhance existing save methods to use SaveStatusIndicator
     */
    enhanceSaveMethodsWithStatusIndicator() {
        const originalSaveAppState = this.saveAppState.bind(this);
        this.saveAppState = async function() {
            this.eventBus.emit('save:started', { type: 'appState' });
            try {
                await originalSaveAppState();
                this.eventBus.emit('save:success', { type: 'appState' });
            } catch (error) {
                this.eventBus.emit('save:error', { type: 'appState', error });
                throw error;
            }
        }.bind(this);
        
        // Enhance publication frame save methods
        this.publicationFrames.forEach(pf => {
            if (pf.debouncedSave) {
                const originalSave = pf.debouncedSave.bind(pf);
                pf.debouncedSave = function() {
                    this.eventBus.emit('save:started', { type: 'publication', publicationId: pf.id });
                    originalSave();
                }.bind(this);
            }
        });
    }
    
    /**
     * Enhanced activateTab method with modular component integration
     */
    async activateTab(tabId) {
        // Call original method first
        await super.activateTab(tabId);
        
        // Update state manager
        this.stateManager.set('ui.currentTab', tabId);
        
        // Emit tab change event
        this.eventBus.emit('ui:tabChanged', { tabId });
        
        // Handle modular component activation
        await this.handleModularTabActivation(tabId);
    }
    
    /**
     * Handle activation of modular components based on tab
     */
    async handleModularTabActivation(tabId) {
        switch (tabId) {
            case 'cropping':
                if (this.modularCroppingManager) {
                    await this.modularCroppingManager.activate();
                }
                break;
                
            case 'description':
                if (this.modularDescriptionManager) {
                    await this.modularDescriptionManager.activate();
                }
                break;
        }
    }
    
    /**
     * Enhanced loadState method with modular component support
     */
    async loadState() {
        // Call original method
        await super.loadState();
        
        // Update modular components with loaded state
        await this.updateModularComponentsWithState();
    }
    
    /**
     * Update modular components with current state
     */
    async updateModularComponentsWithState() {
        // Update StateManager with current state
        this.syncStateWithStateManager();
        
        // Notify components of state change
        this.eventBus.emit('state:loaded', {
            galleryId: this.currentGalleryId,
            publications: this.publicationFrames.length,
            images: this.gridItems.length
        });
    }
    
    /**
     * Event handlers for modular component integration
     */
    handleGallerySelected(data) {
        const { galleryId } = data;
        if (galleryId !== this.currentGalleryId) {
            this.handleLoadGallery(galleryId);
        }
    }
    
    handleImageCropped(data) {
        // Update grid usage after cropping
        this.updateGridUsage();
        
        // Update publication views
        this.refreshPublicationViews();
    }
    
    handlePublicationUpdated(data) {
        // Update grid usage after publication changes
        this.updateGridUsage();
        
        // Update stats
        this.updateStatsLabel();
    }
    
    handleTabChanged(tabId) {
        // Additional tab change handling if needed
        this.logger.info('Tab changed', { tabId });
    }
    
    handleGalleryChanged(galleryId) {
        // Additional gallery change handling if needed
        this.logger.info('Gallery changed', { galleryId });
    }
    
    /**
     * Enhanced description management with modular component
     */
    async saveCurrentPublicationDescription(descriptionText) {
        if (this.modularDescriptionManager) {
            return await this.modularDescriptionManager.saveDescription(descriptionText);
        }
        
        // Fallback to original method if modular component not available
        return await super.saveCurrentPublicationDescription?.(descriptionText);
    }
    
    /**
     * Enhanced cropping functionality with modular component
     */
    async startCropping(imagesToCrop, publicationFrame, startIndex = 0) {
        if (this.modularCroppingManager) {
            return await this.modularCroppingManager.startCropping(imagesToCrop, publicationFrame, startIndex);
        }
        
        // Fallback to original cropping if modular component not available
        if (this.croppingPage) {
            return this.croppingPage.startCropping?.(imagesToCrop, publicationFrame, startIndex);
        }
    }
    
    /**
     * Create logger for modular architecture
     */
    createLogger() {
        return {
            info: (message, data = {}) => {
                console.log(`[ModularOrganizer] ${message}`, data);
            },
            warn: (message, data = {}) => {
                console.warn(`[ModularOrganizer] ${message}`, data);
            },
            error: (message, error = null, data = {}) => {
                console.error(`[ModularOrganizer] ${message}`, error, data);
            }
        };
    }
    
    /**
     * Destroy modular components when organizer is destroyed
     */
    destroy() {
        if (this.modularCroppingManager) {
            this.modularCroppingManager.destroy();
        }
        
        if (this.modularDescriptionManager) {
            this.modularDescriptionManager.destroy();
        }
        
        if (this.saveStatusIndicator) {
            this.saveStatusIndicator.destroy();
        }
        
        // Clear event bus subscriptions
        if (this.eventBus) {
            this.eventBus.removeAllListeners();
        }
        
        this.logger.info('Modular architecture destroyed');
    }
}

// Export for global access
window.ModularPublicationOrganizer = ModularPublicationOrganizer;
export default ModularPublicationOrganizer;