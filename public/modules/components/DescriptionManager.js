// ===============================
// File: modules/components/DescriptionManager.js
// Extracted description editing functionality
// ===============================

/**
 * DescriptionManager handles text editing for publications and common descriptions
 * Extracted from the main script.js for better modularity
 */
class DescriptionManager extends BaseComponent {
    constructor(dependencies = {}) {
        super('DescriptionManager', dependencies);
        
        this.organizerApp = dependencies.organizerApp || dependencies.organizer;
        
        // DOM elements
        this.mainListElement = null;
        this.jourListElement = null;
        this.editorTitleElement = null;
        this.editorContentElement = null;
        this.editorPlaceholderElement = null;
        this.editorElement = null;
        this.imagesPreviewBanner = null;
        this.shortcutsContainer = null;
        this.generateHashtagsBtn = null;
        
        // State
        this.currentSelectedPublicationFrame = null;
        this.commonDescriptionText = '';
        this.isEditingCommon = true;
        
        // Hashtag manager
        this.hashtagManager = null;
        
        // Debounced save functions will be created after initialization
    }
    
    async onInitialize() {
        this.logger.info('Initializing DescriptionManager');
        
        // Get DOM elements
        this.mainListElement = this.querySelector('#descriptionMainList', true);
        this.jourListElement = this.querySelector('#descriptionPublicationList', true);
        this.editorTitleElement = this.querySelector('#descriptionEditorTitle', true);
        this.editorContentElement = this.querySelector('#descriptionEditorContent', true);
        this.editorPlaceholderElement = this.querySelector('#descriptionEditorPlaceholder', true);
        this.editorElement = this.querySelector('#descriptionEditor', true);
        this.imagesPreviewBanner = this.querySelector('#descriptionImagesPreview');
        this.shortcutsContainer = this.querySelector('#descriptionShortcuts');
        this.generateHashtagsBtn = this.querySelector('#generateHashtagsBtn');
        
        // Store DOM elements for cleanup
        this.addElement('mainList', this.mainListElement);
        this.addElement('editorElement', this.editorElement);
        
        // Initialize hashtag manager if available
        if (window.HashtagManager) {
            this.hashtagManager = new window.HashtagManager(this);
        }
        
        // Create debounced save functions with status indicators
        this.createDebouncedSaveFunctions();
        
        this.logger.info('DescriptionManager initialized successfully');
    }
    
    createDebouncedSaveFunctions() {
        // Wrap save functions with status indicators if available
        if (window.saveStatusIndicator) {
            this.debouncedSavePublication = this.debounce(() => {
                window.saveStatusIndicator.wrapSaveFunction(
                    () => this.saveCurrentPublicationDescription(true),
                    'description publication'
                )();
            }, 1500);
            
            this.debouncedSaveCommon = this.debounce(() => {
                window.saveStatusIndicator.wrapSaveFunction(
                    () => this.saveCommonDescription(true),
                    'description commune'
                )();
            }, 1500);
        } else {
            // Fallback without status indicators
            this.debouncedSavePublication = this.debounce(() => this.saveCurrentPublicationDescription(true), 1500);
            this.debouncedSaveCommon = this.debounce(() => this.saveCommonDescription(true), 1500);
        }
    }
    
    setupEventListeners() {
        // Editor input events
        this.addEventListener(this.editorElement, 'input', () => {
            if (this.isEditingCommon) {
                this.commonDescriptionText = this.editorElement.innerText;
                
                // Show typing indicator if available
                if (window.saveStatusIndicator) {
                    window.saveStatusIndicator.showTyping('Modification description commune...');
                }
                
                this.debouncedSaveCommon();
            } else if (this.currentSelectedPublicationFrame) {
                this.currentSelectedPublicationFrame.descriptionText = this._extractTextFromEditor();
                
                // Show typing indicator if available
                if (window.saveStatusIndicator) {
                    window.saveStatusIndicator.showTyping('Modification description publication...');
                }
                
                this.debouncedSavePublication();
            }
            
            this._updateShortcutButtonsState();
        });
        
        // Editor keydown events for structured editing
        this.addEventListener(this.editorElement, 'keydown', (e) => {
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const node = selection.getRangeAt(0).startContainer;
                if (node.closest && node.closest('.common-text-block')) {
                    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                        e.preventDefault();
                    }
                }
            }
        });
        
        // Main list (common description) click
        this.addEventListener(this.mainListElement, 'click', (e) => {
            if (e.target.closest('li')) {
                this.selectCommon();
            }
        });
        
        // Publication list click
        this.addEventListener(this.jourListElement, 'click', (e) => {
            const li = e.target.closest('li');
            if (li && li.dataset.publicationId) {
                const publicationFrame = this.organizerApp?.publicationFrames?.find(
                    jf => jf.id === li.dataset.publicationId
                );
                if (publicationFrame) {
                    this.selectPublication(publicationFrame);
                }
            }
        });
        
        // Shortcuts container click
        if (this.shortcutsContainer) {
            this.addEventListener(this.shortcutsContainer, 'click', (e) => {
                const button = e.target.closest('button');
                if (button && button.dataset.snippet && !button.disabled) {
                    this._insertSnippet(button.dataset.snippet);
                }
            });
        }
        
        // Generate hashtags button
        if (this.generateHashtagsBtn) {
            this.addEventListener(this.generateHashtagsBtn, 'click', () => {
                if (this.hashtagManager && typeof this.hashtagManager.generateHashtags === 'function') {
                    this.hashtagManager.generateHashtags();
                }
            });
        }
    }
    
    /**
     * Show description manager (populate lists)
     */
    show() {
        this.ensureInitialized();
        this.populateLists();
        this.emit('shown');
    }
    
    /**
     * Populate the description lists
     */
    populateLists() {
        this.populateMainList();
        this.populatePublicationList();
    }
    
    /**
     * Populate main list (common description)
     */
    populateMainList() {
        if (!this.mainListElement) return;
        
        this.mainListElement.innerHTML = '';
        
        const listItem = document.createElement('li');
        listItem.className = 'description-list-item';
        listItem.dataset.type = 'common';
        
        const galleryName = this.organizerApp?.getCurrentGalleryName?.() || 'Current Gallery';
        listItem.innerHTML = `
            <div class="description-list-item-content">
                <strong>Description Commune</strong>
                <div class="description-list-item-subtitle">Pour "${galleryName}"</div>
            </div>
        `;
        
        this.mainListElement.appendChild(listItem);
        
        // Select common by default if nothing is selected
        if (this.isEditingCommon) {
            listItem.classList.add('selected');
        }
    }
    
    /**
     * Populate publication list
     */
    populatePublicationList() {
        if (!this.jourListElement || !this.organizerApp?.publicationFrames) return;
        
        this.jourListElement.innerHTML = '';
        
        this.organizerApp.publicationFrames.forEach(publicationFrame => {
            const listItem = document.createElement('li');
            listItem.className = 'description-list-item';
            listItem.dataset.publicationId = publicationFrame.id;
            listItem.dataset.type = 'publication';
            
            const imageCount = publicationFrame.imagesData?.length || 0;
            const hasDescription = publicationFrame.descriptionText && publicationFrame.descriptionText.trim().length > 0;
            
            listItem.innerHTML = `
                <div class="description-list-item-content">
                    <strong>Publication ${publicationFrame.letter}</strong>
                    <div class="description-list-item-subtitle">
                        ${imageCount} image${imageCount !== 1 ? 's' : ''}
                        ${hasDescription ? ' • Description définie' : ''}
                    </div>
                </div>
            `;
            
            // Highlight if currently selected
            if (this.currentSelectedPublicationFrame && 
                this.currentSelectedPublicationFrame.id === publicationFrame.id) {
                listItem.classList.add('selected');
            }
            
            this.jourListElement.appendChild(listItem);
        });
    }
    
    /**
     * Select common description for editing
     */
    async selectCommon() {
        this.ensureInitialized();
        
        try {
            // Save current publication if editing one
            if (!this.isEditingCommon && this.currentSelectedPublicationFrame) {
                await this.saveCurrentPublicationDescription();
            }
            
            this.isEditingCommon = true;
            this.currentSelectedPublicationFrame = null;
            this.populateLists();
            this.loadCommonDescription();
            
            this.emit('commonSelected');
            
        } catch (error) {
            this.logger.error('Failed to select common description', error);
            this.handleApiError(error, 'selecting common description');
        }
    }
    
    /**
     * Select publication for editing
     */
    async selectPublication(publicationFrame) {
        this.ensureInitialized();
        
        if (!publicationFrame) {
            this.logger.warn('No publication frame provided');
            return;
        }
        
        try {
            // Save current content before switching
            if (this.isEditingCommon) {
                await this.saveCommonDescription();
            } else if (this.currentSelectedPublicationFrame) {
                await this.saveCurrentPublicationDescription();
            }
            
            this.isEditingCommon = false;
            this.currentSelectedPublicationFrame = publicationFrame;
            this.populateLists();
            this.loadDescriptionForPublication(publicationFrame);
            
            this.emit('publicationSelected', { publicationId: publicationFrame.id });
            
        } catch (error) {
            this.logger.error('Failed to select publication', error, { 
                publicationId: publicationFrame.id 
            });
            this.handleApiError(error, 'selecting publication');
        }
    }
    
    /**
     * Load common description in editor
     */
    loadCommonDescription() {
        const galleryName = this.organizerApp?.getCurrentGalleryName?.() || 'Current Gallery';
        
        this.editorTitleElement.textContent = `Description Commune pour "${galleryName}"`;
        this.editorElement.contentEditable = true;
        this.editorElement.classList.remove('structured');
        this.editorElement.innerHTML = '';
        
        // Use innerText to avoid XSS issues
        this.editorElement.innerText = this.commonDescriptionText;
        
        this.editorContentElement.style.display = 'block';
        this.editorPlaceholderElement.style.display = 'none';
        
        if (this.imagesPreviewBanner) {
            this.imagesPreviewBanner.style.display = 'none';
            this.imagesPreviewBanner.innerHTML = '';
        }
        
        if (this.shortcutsContainer) {
            this.shortcutsContainer.style.display = 'flex';
        }
        
        this._updateShortcutButtonsState();
    }
    
    /**
     * Load publication description in editor
     */
    loadDescriptionForPublication(publicationFrame) {
        if (!publicationFrame) {
            this.clearEditor();
            return;
        }
        
        this.editorTitleElement.textContent = `Publication ${publicationFrame.letter}`;
        this.editorElement.contentEditable = true;
        
        // Load description content
        this._loadPublicationDescription(publicationFrame);
        
        this.editorContentElement.style.display = 'block';
        this.editorPlaceholderElement.style.display = 'none';
        
        // Show images preview if available
        this._loadImagesPreview(publicationFrame);
        
        if (this.shortcutsContainer) {
            this.shortcutsContainer.style.display = 'flex';
        }
        
        this._updateShortcutButtonsState();
    }
    
    /**
     * Load publication description with structured content
     */
    _loadPublicationDescription(publicationFrame) {
        const descriptionText = publicationFrame.descriptionText || '';
        
        if (descriptionText.includes('{{COMMON_TEXT}}')) {
            // Structured description with common text placeholder
            this.editorElement.classList.add('structured');
            this._renderStructuredDescription(descriptionText);
        } else {
            // Simple description
            this.editorElement.classList.remove('structured');
            this.editorElement.innerHTML = '';
            this.editorElement.innerText = descriptionText;
        }
    }
    
    /**
     * Render structured description with common text blocks
     */
    _renderStructuredDescription(descriptionText) {
        const parts = descriptionText.split('{{COMMON_TEXT}}');
        const beforeText = parts[0] || '';
        const afterText = parts[1] || '';
        
        this.editorElement.innerHTML = `
            <div class="editable-zone" data-zone="before" contenteditable="true">${this._escapeHtml(beforeText)}</div>
            <div class="common-text-block" contenteditable="false">
                <div class="common-text-content">${this._escapeHtml(this.commonDescriptionText)}</div>
                <div class="common-text-label">Texte commun</div>
            </div>
            <div class="editable-zone" data-zone="after" contenteditable="true">${this._escapeHtml(afterText)}</div>
        `;
    }
    
    /**
     * Load images preview for publication
     */
    _loadImagesPreview(publicationFrame) {
        if (!this.imagesPreviewBanner || !publicationFrame.imagesData) {
            return;
        }
        
        this.imagesPreviewBanner.innerHTML = '';
        
        if (publicationFrame.imagesData.length > 0) {
            publicationFrame.imagesData.forEach((imageData, index) => {
                const imgElement = document.createElement('img');
                imgElement.src = imageData.thumbnailPath || imageData.imagePath;
                imgElement.alt = `Image ${index + 1}`;
                imgElement.className = 'description-preview-image';
                imgElement.loading = 'lazy';
                
                imgElement.onerror = () => {
                    imgElement.style.display = 'none';
                };
                
                this.imagesPreviewBanner.appendChild(imgElement);
            });
            
            this.imagesPreviewBanner.style.display = 'flex';
        } else {
            this.imagesPreviewBanner.style.display = 'none';
        }
    }
    
    /**
     * Clear editor
     */
    clearEditor() {
        this.editorTitleElement.textContent = 'Sélectionnez une publication';
        this.editorElement.innerHTML = '';
        this.editorElement.classList.remove('structured');
        this.currentSelectedPublicationFrame = null;
        this.isEditingCommon = true;
        this.editorContentElement.style.display = 'none';
        this.editorPlaceholderElement.textContent = 'Aucune publication sélectionnée, ou la galerie n\'a pas de publications.';
        this.editorPlaceholderElement.style.display = 'block';
        
        if (this.imagesPreviewBanner) {
            this.imagesPreviewBanner.innerHTML = '';
            this.imagesPreviewBanner.style.display = 'none';
        }
        
        if (this.shortcutsContainer) {
            this.shortcutsContainer.style.display = 'none';
        }
    }
    
    /**
     * Save current publication description
     */
    async saveCurrentPublicationDescription(isDebounced = false) {
        if (!this.currentSelectedPublicationFrame || !this.organizerApp?.currentGalleryId) {
            return;
        }
        
        if (!isDebounced && this.debouncedSavePublication.cancel) {
            this.debouncedSavePublication.cancel();
        }
        
        try {
            this.logger.info('Saving publication description', { 
                publicationId: this.currentSelectedPublicationFrame.id 
            });
            
            const publicationToUpdate = this.currentSelectedPublicationFrame;
            publicationToUpdate.descriptionText = this._extractTextFromEditor();
            
            await publicationToUpdate.save();
            
            if (this.organizerApp.refreshSidePanels) {
                this.organizerApp.refreshSidePanels();
            }
            
            this.emit('publicationDescriptionSaved', { 
                publicationId: publicationToUpdate.id 
            });
            
        } catch (error) {
            this.logger.error('Failed to save publication description', error);
            this.handleApiError(error, 'sauvegarde description publication');
            throw error; // Re-throw for saveStatusIndicator to catch
        }
    }
    
    /**
     * Save common description
     */
    async saveCommonDescription(isDebounced = false) {
        const currentGalleryId = this.organizerApp?.currentGalleryId;
        const csrfToken = this.organizerApp?.csrfToken;
        
        if (!currentGalleryId || !csrfToken) {
            return;
        }
        
        if (!isDebounced && this.debouncedSaveCommon.cancel) {
            this.debouncedSaveCommon.cancel();
        }
        
        try {
            this.logger.info('Saving common description');
            
            const response = await fetch(`/api/galleries/${currentGalleryId}/state`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken
                },
                body: JSON.stringify({ commonDescriptionText: this.commonDescriptionText })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            this.emit('commonDescriptionSaved');
            
        } catch (error) {
            this.logger.error('Failed to save common description', error);
            this.handleApiError(error, 'sauvegarde description commune');
            throw error; // Re-throw for saveStatusIndicator to catch
        }
    }
    
    /**
     * Save on tab exit
     */
    async saveOnTabExit() {
        try {
            if (this.isEditingCommon) {
                await this.saveCommonDescription();
            } else if (this.currentSelectedPublicationFrame) {
                await this.saveCurrentPublicationDescription();
            }
        } catch (error) {
            this.logger.error('Failed to save on tab exit', error);
        }
    }
    
    /**
     * Extract text from editor (handles structured content)
     */
    _extractTextFromEditor() {
        if (!this.editorElement.classList.contains('structured')) {
            return this.editorElement.innerText.trim();
        }
        
        // Handle structured content with common text placeholder
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = this.editorElement.innerHTML;
        
        const beforeZone = tempDiv.querySelector('.editable-zone[data-zone="before"]');
        const afterZone = tempDiv.querySelector('.editable-zone[data-zone="after"]');
        
        if (beforeZone && afterZone) {
            const beforeText = beforeZone.innerText.trim();
            const afterText = afterZone.innerText.trim();
            
            let result = '';
            if (beforeText) result += beforeText + '\n';
            result += '{{COMMON_TEXT}}';
            if (afterText) result += '\n' + afterText;
            
            return result;
        }
        
        return this.editorElement.innerText.trim();
    }
    
    /**
     * Insert snippet at cursor position
     */
    _insertSnippet(snippet) {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            range.deleteContents();
            range.insertNode(document.createTextNode(snippet));
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
        } else {
            // Fallback: append to end
            this.editorElement.focus();
            document.execCommand('insertText', false, snippet);
        }
        
        // Trigger input event to save changes
        this.editorElement.dispatchEvent(new Event('input', { bubbles: true }));
    }
    
    /**
     * Update shortcut buttons state
     */
    _updateShortcutButtonsState() {
        if (!this.shortcutsContainer) return;
        
        const buttons = this.shortcutsContainer.querySelectorAll('button[data-snippet]');
        const hasContent = this.editorElement.innerText.trim().length > 0;
        
        buttons.forEach(button => {
            button.disabled = !hasContent && button !== this.generateHashtagsBtn;
        });
    }
    
    /**
     * Escape HTML for safe rendering
     */
    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * Debounce utility
     */
    debounce(func, delay) {
        let timeout;
        const debouncedFunction = function (...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), delay);
        };
        
        // Add cancel method for immediate saves
        debouncedFunction.cancel = function () {
            clearTimeout(timeout);
            timeout = null;
        };
        
        return debouncedFunction;
    }
    
    /**
     * Cleanup resources
     */
    onDestroy() {
        this.logger.info('Destroying DescriptionManager');
        
        // Clear editor
        if (this.editorElement) {
            this.editorElement.innerHTML = '';
        }
        
        // Clean up hashtag manager
        if (this.hashtagManager && typeof this.hashtagManager.destroy === 'function') {
            this.hashtagManager.destroy();
        }
        
        // Reset state
        this.currentSelectedPublicationFrame = null;
        this.commonDescriptionText = '';
        this.isEditingCommon = true;
    }
}

// Export for use in other modules
window.DescriptionManager = DescriptionManager;
export default DescriptionManager;