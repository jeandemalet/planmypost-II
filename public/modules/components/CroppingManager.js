// ===============================
// File: modules/components/CroppingManager.js
// Extracted image cropping functionality
// ===============================

/**
 * CroppingManager handles individual image cropping operations
 * Extracted from the main script.js for better modularity
 */
class CroppingManager extends BaseComponent {
    constructor(dependencies = {}) {
        super('CroppingManager', dependencies);
        
        this.organizer = dependencies.organizer;
        this.croppingPage = dependencies.croppingPage;
        
        // DOM elements
        this.editorPanel = null;
        this.canvasElement = null;
        this.ctx = null;
        this.previewContainer = null;
        this.previewLeft = null;
        this.previewCenter = null;
        this.previewRight = null;
        this.infoLabel = null;
        this.prevBtn = null;
        this.nextBtn = null;
        this.flipBtn = null;
        this.aspectRatioSelect = null;
        this.whiteBarsBtn = null;
        this.splitLineBtn = null;
        this.deleteBtn = null;
        this.finishBtn = null;
        
        // State
        this.imagesToCrop = [];
        this.currentImageIndex = -1;
        this.currentImageObject = null;
        this.modifiedDataMap = {};
        this.currentPublicationFrameInstance = null;
        this.cropRectDisplay = null;
        this.isDragging = false;
        this.dragMode = null;
        this.isLoading = false;
        this.dragStart = {};
        this.currentAspectRatioName = '3:4';
        this.splitModeState = 0;
        this.showSplitLineCount = 0;
        this.flippedH = false;
        this.saveMode = 'crop';
        this.ignoreSaveForThisImage = false;
        this.handleSize = 18;
        this.handleDetectionOffset = this.handleSize / 2 + 6;
        
        // Cache and optimization
        this.imageCache = new Map();
        this.lastContainerSize = { width: 0, height: 0 };
        this.smartcropInitialized = false;
        
        // Debounced functions will be created after DOM elements are available
    }
    
    async onInitialize() {
        this.logger.info('Initializing CroppingManager');
        
        // Get DOM elements
        this.editorPanel = this.querySelector('#croppingEditorPanel', true);
        this.canvasElement = this.querySelector('#cropperCanvas', true);
        this.ctx = this.canvasElement.getContext('2d', { alpha: false });
        this.previewContainer = this.editorPanel.querySelector('.cropper-previews');
        this.previewLeft = this.querySelector('#cropperPreviewLeft');
        this.previewCenter = this.querySelector('#cropperPreviewCenter');
        this.previewRight = this.querySelector('#cropperPreviewRight');
        this.infoLabel = this.querySelector('#cropperInfoLabel');
        this.prevBtn = this.querySelector('#cropPrevImageBtn');
        this.nextBtn = this.querySelector('#cropNextImageBtn');
        this.flipBtn = this.querySelector('#cropFlipBtn');
        this.aspectRatioSelect = this.querySelector('#cropAspectRatio');
        this.whiteBarsBtn = this.querySelector('#cropAddWhiteBarsBtn');
        this.splitLineBtn = this.querySelector('#cropSplitLineBtn');
        this.deleteBtn = this.querySelector('#cropDeleteBtn');
        this.finishBtn = this.querySelector('#cropFinishBtn');
        
        // Store DOM elements for cleanup
        this.addElement('editorPanel', this.editorPanel);
        this.addElement('canvasElement', this.canvasElement);
        
        // Create debounced functions
        this.debouncedUpdatePreview = this.debounce(() => this.updatePreview(), 150);
        this.debouncedHandleResize = this.debounce(() => this._handleResize(), 50);
        
        this.logger.info('CroppingManager initialized successfully');
    }
    
    setupEventListeners() {
        if (!this.prevBtn || !this.nextBtn) {
            this.logger.warn('Essential buttons not found, skipping event listener setup');
            return;
        }
        
        // Navigation buttons
        this.addEventListener(this.prevBtn, 'click', () => this.prevImage());
        this.addEventListener(this.nextBtn, 'click', () => this.nextImage(false));
        this.addEventListener(this.finishBtn, 'click', () => this.finishAndApply());
        
        // Tool buttons
        this.addEventListener(this.flipBtn, 'click', () => this.toggleFlip());
        this.addEventListener(this.aspectRatioSelect, 'change', (e) => this.onRatioChanged(e.target.value));
        this.addEventListener(this.whiteBarsBtn, 'click', () => this.toggleWhiteBars());
        this.addEventListener(this.splitLineBtn, 'click', () => this.toggleSplitMode());
        
        // Delete button
        this.addEventListener(this.deleteBtn, 'click', () => this.deleteCurrentImage());
        
        // Canvas interactions
        this.addEventListener(this.canvasElement, 'mousedown', (e) => this.onCanvasMouseDown(e));
        this.addEventListener(this.canvasElement, 'mousemove', (e) => this.onCanvasMouseMove(e));
        this.addEventListener(this.canvasElement, 'mouseup', (e) => this.onCanvasMouseUp(e));
        this.addEventListener(this.canvasElement, 'mouseleave', () => this.onCanvasMouseLeave());
        
        // Window resize
        this.addEventListener(window, 'resize', this.debouncedHandleResize);
        
        // Document mouse events for dragging
        this.addEventListener(document, 'mousemove', (e) => this.onDocumentMouseMove(e));
        this.addEventListener(document, 'mouseup', (e) => this.onDocumentMouseUp(e));
    }
    
    /**
     * Start cropping session for a publication
     */
    async startCropping(imagesToCrop, publicationFrame, startIndex = 0) {
        this.ensureInitialized();
        
        try {
            this.logger.info('Starting cropping session', { 
                imageCount: imagesToCrop.length, 
                startIndex,
                publicationId: publicationFrame?.id 
            });
            
            this.imagesToCrop = imagesToCrop;
            this.currentPublicationFrameInstance = publicationFrame;
            this.currentImageIndex = Math.max(0, Math.min(startIndex, imagesToCrop.length - 1));
            this.modifiedDataMap = {};
            this.isLoading = false;
            
            if (this.imagesToCrop.length === 0) {
                this.showError('No Images', 'No images available for cropping');
                return;
            }
            
            await this.loadCurrentImage();
            this.emit('croppingStarted', { 
                imageCount: imagesToCrop.length, 
                publicationId: publicationFrame?.id 
            });
            
        } catch (error) {
            this.logger.error('Failed to start cropping session', error);
            this.handleApiError(error, 'starting cropping session');
        }
    }
    
    /**
     * Load current image for cropping
     */
    async loadCurrentImage() {
        if (this.isLoading) {
            this.logger.warn('Already loading image, skipping');
            return;
        }
        
        if (this.currentImageIndex < 0 || this.currentImageIndex >= this.imagesToCrop.length) {
            this.logger.warn('Invalid image index', { currentIndex: this.currentImageIndex });
            return;
        }
        
        this.isLoading = true;
        
        try {
            const imageInfo = this.imagesToCrop[this.currentImageIndex];
            const originalGridItem = this.organizer?.gridItemsDict?.[imageInfo.originalReferenceId];
            const displayName = originalGridItem?.basename || `Image ${this.currentImageIndex + 1}`;
            
            this.logger.info('Loading image for cropping', { 
                index: this.currentImageIndex, 
                imageId: imageInfo.currentImageId,
                displayName 
            });
            
            // Load image
            const imageUrl = imageInfo.baseImageToCropFromDataURL || imageInfo.pathForCropper;
            this.currentImageObject = await this.loadImageFromUrl(imageUrl);
            
            // Setup canvas and crop rect
            this._handleResize();
            this.setDefaultCropRect();
            this.ignoreSaveForThisImage = false;
            
            // Update UI
            this.aspectRatioSelect.disabled = this.splitModeState > 0 || this.saveMode === 'white_bars';
            this.whiteBarsBtn.disabled = this.splitModeState > 0;
            this.splitLineBtn.disabled = this.saveMode === 'white_bars';
            this.infoLabel.textContent = displayName;
            
            // Update thumbnail strip highlight
            if (this.croppingPage && typeof this.croppingPage._updateThumbnailStripHighlight === 'function') {
                this.croppingPage._updateThumbnailStripHighlight(this.currentImageIndex);
            }
            
            this.emit('imageLoaded', { 
                index: this.currentImageIndex, 
                imageId: imageInfo.currentImageId 
            });
            
        } catch (error) {
            this.logger.error('Failed to load image', error, { index: this.currentImageIndex });
            this.currentImageObject = null;
            
            // Show error on canvas
            this.ctx.fillStyle = '#2e2e2e'; // CROPPER_BACKGROUND_GRAY
            this.ctx.fillRect(0, 0, this.canvasElement.width, this.canvasElement.height);
            
            this.infoLabel.textContent = 'Error loading image';
            this.updatePreview(null, null);
            
        } finally {
            this.isLoading = false;
        }
    }
    
    /**
     * Load image from URL with caching
     */
    async loadImageFromUrl(url) {
        if (this.imageCache.has(url)) {
            return this.imageCache.get(url);
        }
        
        const image = await this.loadImage(url);
        this.imageCache.set(url, image);
        return image;
    }
    
    /**
     * Load image utility (similar to Utils.loadImage)
     */
    loadImage(urlOrFile) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            
            img.onload = () => {
                if (img.naturalWidth === 0 || img.naturalHeight === 0) {
                    reject(new Error('Image loaded but has invalid dimensions (0x0)'));
                } else {
                    resolve(img);
                }
            };
            
            img.onerror = () => {
                reject(new Error('Failed to load image'));
            };
            
            img.src = urlOrFile;
        });
    }
    
    /**
     * Set default crop rectangle
     */
    setDefaultCropRect() {
        if (!this.currentImageObject) return;
        
        const { displayX, displayY, displayWidth, displayHeight } = this.getImageDisplayDimensions();
        this.cropRectDisplay = { 
            x: displayX, 
            y: displayY, 
            width: displayWidth, 
            height: displayHeight 
        };
        
        this.adjustCropRectToAspectRatio();
        this.canvasElement.style.cursor = 'crosshair';
    }
    
    /**
     * Get image display dimensions on canvas
     */
    getImageDisplayDimensions() {
        if (!this.currentImageObject || !this.canvasElement.width || !this.canvasElement.height) {
            return { displayX: 0, displayY: 0, displayWidth: 0, displayHeight: 0, imageScale: 1 };
        }
        
        const canvasWidth = this.canvasElement.width;
        const canvasHeight = this.canvasElement.height;
        const imgWidth = this.currentImageObject.naturalWidth || this.currentImageObject.width;
        const imgHeight = this.currentImageObject.naturalHeight || this.currentImageObject.height;
        
        if (imgWidth === 0 || imgHeight === 0) {
            return { displayX: 0, displayY: 0, displayWidth: 0, displayHeight: 0, imageScale: 1 };
        }
        
        const scaleX = canvasWidth / imgWidth;
        const scaleY = canvasHeight / imgHeight;
        const imageScale = Math.min(scaleX, scaleY);
        
        const displayWidth = imgWidth * imageScale;
        const displayHeight = imgHeight * imageScale;
        const displayX = (canvasWidth - displayWidth) / 2;
        const displayY = (canvasHeight - displayHeight) / 2;
        
        return { displayX, displayY, displayWidth, displayHeight, imageScale };
    }
    
    /**
     * Navigation methods
     */
    async nextImage(skipSave = false) {
        if (!skipSave && this.currentImageIndex >= 0 && this.currentImageIndex < this.imagesToCrop.length) {
            await this.applyAndSaveCurrentImage();
        }
        
        if (this.currentImageIndex < this.imagesToCrop.length - 1) {
            this.currentImageIndex++;
            await this.loadCurrentImage();
        } else {
            await this.finishAndApply();
        }
    }
    
    async prevImage() {
        if (this.currentImageIndex > 0) {
            this.currentImageIndex--;
            this.ignoreSaveForThisImage = true;
            await this.loadCurrentImage();
        } else {
            this.infoLabel.textContent = 'This is the first image.';
        }
    }
    
    /**
     * Finish cropping session
     */
    async finishAndApply() {
        try {
            this.logger.info('Finishing cropping session');
            
            // Save current image if needed
            if (this.currentImageIndex >= 0 && 
                this.currentImageIndex < this.imagesToCrop.length && 
                !this.ignoreSaveForThisImage) {
                await this.applyAndSaveCurrentImage();
            }
            
            // Update publication frame with modified data
            if (this.currentPublicationFrameInstance && 
                typeof this.currentPublicationFrameInstance.updateImagesFromCropper === 'function') {
                this.currentPublicationFrameInstance.updateImagesFromCropper(this.modifiedDataMap);
            }
            
            // Clean up state
            this.imagesToCrop = [];
            this.currentPublicationFrameInstance = null;
            this.currentImageObject = null;
            this.modifiedDataMap = {};
            this.isDragging = false;
            this.dragMode = null;
            this.isLoading = false;
            
            // Clear canvas and UI
            this.ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
            this.infoLabel.textContent = '';
            this.canvasElement.style.cursor = 'default';
            
            // Clear editor if croppingPage is available
            if (this.croppingPage && typeof this.croppingPage.clearEditor === 'function') {
                this.croppingPage.clearEditor();
            }
            
            // Refresh organizer
            if (this.organizer && typeof this.organizer.refreshSidePanels === 'function') {
                this.organizer.refreshSidePanels();
            }
            
            this.emit('croppingFinished');
            this.logger.info('Cropping session finished successfully');
            
        } catch (error) {
            this.logger.error('Error finishing cropping session', error);
            this.handleApiError(error, 'finishing cropping session');
        }
    }
    
    /**
     * Apply and save current image modifications
     */
    async applyAndSaveCurrentImage() {
        if (this.ignoreSaveForThisImage || !this.currentImageObject || this.currentImageIndex < 0) {
            return;
        }
        
        try {
            // Implementation would depend on the specific save logic
            // This is a placeholder for the actual implementation
            this.logger.info('Applying and saving current image', { index: this.currentImageIndex });
            
            // The actual implementation would include:
            // - Canvas rendering
            // - Image processing
            // - API calls to save
            // - Updating modifiedDataMap
            
            this.emit('imageSaved', { index: this.currentImageIndex });
            
        } catch (error) {
            this.logger.error('Failed to save current image', error);
            this.handleApiError(error, 'saving image');
        }
    }
    
    /**
     * Delete current image from publication
     */
    deleteCurrentImage() {
        if (this.currentImageIndex < 0 || this.currentImageIndex >= this.imagesToCrop.length) {
            return;
        }
        
        try {
            const imageToDelete = this.imagesToCrop[this.currentImageIndex];
            const imageIdToDelete = imageToDelete.currentImageId;
            const originalGridItem = this.organizer?.gridItemsDict?.[imageToDelete.originalReferenceId];
            const displayName = originalGridItem?.basename || `Image ID ${imageToDelete.originalReferenceId}`;
            
            this.logger.info('Deleting image from publication', { 
                imageId: imageIdToDelete, 
                displayName 
            });
            
            // Remove from publication frame
            if (this.currentPublicationFrameInstance && 
                typeof this.currentPublicationFrameInstance.removeImageById === 'function') {
                this.currentPublicationFrameInstance.removeImageById(imageIdToDelete);
            }
            
            // Remove from cropping list
            this.imagesToCrop.splice(this.currentImageIndex, 1);
            
            // Update thumbnail strip
            if (this.croppingPage && 
                typeof this.croppingPage._populateThumbnailStrip === 'function') {
                this.croppingPage._populateThumbnailStrip(this.currentPublicationFrameInstance);
            }
            
            this.infoLabel.textContent = `Image ${displayName} removed from publication.`;
            
            // Load next image or finish if no images left
            if (this.imagesToCrop.length === 0) {
                this.finishAndApply();
            } else {
                // Adjust index if we're at the end
                if (this.currentImageIndex >= this.imagesToCrop.length) {
                    this.currentImageIndex = this.imagesToCrop.length - 1;
                }
                this.loadCurrentImage();
            }
            
            this.emit('imageDeleted', { imageId: imageIdToDelete, displayName });
            
        } catch (error) {
            this.logger.error('Failed to delete image', error);
            this.handleApiError(error, 'deleting image');
        }
    }
    
    /**
     * Toggle flip horizontal
     */
    toggleFlip() {
        if (!this.currentImageObject) return;
        
        this.flippedH = !this.flippedH;
        this.redrawCurrentImageWithCrop(true);
        
        this.emit('imageFlipped', { flipped: this.flippedH });
    }
    
    /**
     * Handle aspect ratio change
     */
    onRatioChanged(newRatioName) {
        this.currentAspectRatioName = newRatioName;
        
        if (this.saveMode === 'white_bars') {
            this.saveMode = 'crop';
            this.aspectRatioSelect.disabled = false;
            this.setDefaultCropRect();
        } else if (this.saveMode === 'crop') {
            if (this.cropRectDisplay) {
                this.adjustCropRectToAspectRatio();
            } else {
                this.setDefaultCropRect();
            }
        }
        
        this.redrawCurrentImageWithCrop(true);
        this.emit('aspectRatioChanged', { ratio: newRatioName });
    }
    
    /**
     * Placeholder methods - would need full implementation
     */
    adjustCropRectToAspectRatio() {
        // Implementation depends on specific aspect ratio logic
        this.logger.info('Adjusting crop rect to aspect ratio', { ratio: this.currentAspectRatioName });
    }
    
    redrawCurrentImageWithCrop(updatePreview = false) {
        // Implementation depends on canvas drawing logic
        this.logger.info('Redrawing image with crop rect');
        if (updatePreview) {
            this.debouncedUpdatePreview();
        }
    }
    
    updatePreview() {
        // Implementation depends on preview logic
        this.logger.info('Updating preview');
    }
    
    toggleWhiteBars() {
        // Implementation for white bars functionality
        this.logger.info('Toggling white bars mode');
    }
    
    toggleSplitMode() {
        // Implementation for split mode functionality
        this.logger.info('Toggling split mode');
    }
    
    /**
     * Canvas event handlers - placeholders
     */
    onCanvasMouseDown(event) {
        // Implementation for mouse down on canvas
    }
    
    onCanvasMouseMove(event) {
        // Implementation for mouse move on canvas
    }
    
    onCanvasMouseUp(event) {
        // Implementation for mouse up on canvas
    }
    
    onCanvasMouseLeave() {
        // Implementation for mouse leave canvas
    }
    
    onDocumentMouseMove(event) {
        // Implementation for document mouse move (for dragging)
    }
    
    onDocumentMouseUp(event) {
        // Implementation for document mouse up (for dragging)
    }
    
    /**
     * Handle canvas resize
     */
    _handleResize() {
        if (!this.canvasElement || !this.editorPanel) return;
        
        const containerRect = this.editorPanel.getBoundingClientRect();
        const newWidth = Math.floor(containerRect.width - 40); // Account for padding
        const newHeight = Math.floor(containerRect.height - 120); // Account for controls
        
        // Only resize if dimensions actually changed
        if (this.lastContainerSize.width !== newWidth || this.lastContainerSize.height !== newHeight) {
            this.canvasElement.width = Math.max(400, newWidth);
            this.canvasElement.height = Math.max(300, newHeight);
            
            this.lastContainerSize = { width: newWidth, height: newHeight };
            
            // Redraw if we have an image
            if (this.currentImageObject) {
                this.redrawCurrentImageWithCrop(true);
            }
        }
    }
    
    /**
     * Cleanup resources
     */
    onDestroy() {
        this.logger.info('Destroying CroppingManager');
        
        // Clear canvas
        if (this.ctx) {
            this.ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
        }
        
        // Clear image cache
        this.imageCache.clear();
        
        // Reset state
        this.imagesToCrop = [];
        this.currentImageObject = null;
        this.modifiedDataMap = {};
        this.currentPublicationFrameInstance = null;
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
}

// Export for use in other modules
window.CroppingManager = CroppingManager;
export default CroppingManager;