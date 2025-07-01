// ===============================
//  Fichier: public/script.js (Version complète, corrigée et restructurée)
// ===============================

// --- Constantes Globales et État ---
const BASE_API_URL = '';
const JOUR_COLORS = [
    "red", "blue", "green", "purple", "orange",
    "brown", "magenta", "gold", "cyan", "darkgreen",
    "pink", "navy", "gray", "darkorange"
];
const CALENDAR_THUMB_SIZE = { width: 30, height: 30 };
const CALENDAR_HOVER_THUMB_SIZE = { width: 100, height: 100 };
const MAX_HOVER_PREVIEWS = 3;
const PREVIEW_WIDTH = 100;
const PREVIEW_HEIGHT = 100;
const CROPPER_BACKGROUND_GRAY = 'rgb(46, 46, 46)';

// L'instance de l'application sera stockée ici.
let app = null;

// =================================================================
// --- CLASSE UTILITAIRES ---
// =================================================================
class Utils {
    static async loadImage(urlOrFile) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = (err) => {
                console.error("Utils.loadImage error:", err, "Source:", typeof urlOrFile === 'string' ? urlOrFile : urlOrFile.name);
                reject(err);
            };
            if (urlOrFile instanceof File) {
                const reader = new FileReader();
                reader.onload = (e) => img.src = e.target.result;
                reader.onerror = (errRd) => reject(errRd);
                reader.readAsDataURL(urlOrFile);
            } else {
                img.src = urlOrFile;
            }
        });
    }

    static createThumbnail(image, targetWidth, targetHeight, backgroundColor = 'white') {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        let sourceWidth = image.naturalWidth || image.width;
        let sourceHeight = image.naturalHeight || image.height;

        if (sourceWidth === 0 || sourceHeight === 0) {
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            if (backgroundColor) {
                ctx.fillStyle = backgroundColor;
                ctx.fillRect(0, 0, targetWidth, targetHeight);
            }
            ctx.fillStyle = 'red';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText("ERR", targetWidth/2, targetHeight/2);
            return canvas.toDataURL('image/png');
        }

        let thumbW = sourceWidth, thumbH = sourceHeight;
        if (thumbW > targetWidth) {
            thumbH = (targetWidth / thumbW) * thumbH;
            thumbW = targetWidth;
        }
        if (thumbH > targetHeight) {
            thumbW = (targetHeight / thumbH) * thumbW;
            thumbH = targetHeight;
        }

        canvas.width = targetWidth;
        canvas.height = targetHeight;

        if (backgroundColor) {
            ctx.fillStyle = backgroundColor;
            ctx.fillRect(0, 0, targetWidth, targetHeight);
        }

        const offsetX = (targetWidth - thumbW) / 2;
        const offsetY = (targetHeight - thumbH) / 2;

        ctx.imageSmoothingQuality = "medium";
        ctx.drawImage(image, offsetX, offsetY, thumbW, thumbH);
        return canvas.toDataURL('image/jpeg', 0.85);
    }

    static debounce(func, delay) {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), delay);
        };
    }

    static downloadDataURL(dataURL, filename) {
        const a = document.createElement('a');
        a.href = dataURL;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
    
    static getFilenameFromURL(url) {
        if (!url) return '';
        const normalizedUrl = url.replace(/\\/g, '/');
        const parts = normalizedUrl.split('/');
        return parts.pop() || ''; 
    }
}

// =================================================================
// --- CLASSE GridItemBackend ---
// =================================================================
class GridItemBackend {
    static SERVER_THUMB_OPTIMAL_DISPLAY_WIDTH = 150; 
    static SERVER_THUMB_OPTIMAL_DISPLAY_HEIGHT = 150; 

    constructor(imageData, initialThumbSize, organizerRef) {
        this.id = imageData._id;
        this.galleryId = imageData.galleryId;
        this.basename = imageData.originalFilename;
        
        this.imageFilename = Utils.getFilenameFromURL(imageData.path);
        this.thumbnailFilename = Utils.getFilenameFromURL(imageData.thumbnailPath);

        this.imagePath = `${BASE_API_URL}/api/uploads/${imageData.galleryId}/${this.imageFilename}`;
        this.thumbnailPath = `${BASE_API_URL}/api/uploads/${imageData.galleryId}/${this.thumbnailFilename}`;

        this.datetimeOriginalTs = imageData.exifDateTimeOriginal ? new Date(imageData.exifDateTimeOriginal).getTime() : null;
        this.fileModTimeTs = imageData.fileLastModified ? new Date(imageData.fileLastModified).getTime() : new Date(imageData.uploadDate).getTime();

        this.isCroppedVersion = imageData.isCroppedVersion || false;
        this.parentImageId = imageData.parentImageId || null; 

        this.thumbSize = { ...initialThumbSize };
        this.element = document.createElement('div');
        this.element.className = 'grid-item';
        this.imgElement = document.createElement('img');
        this.orderTextElement = document.createElement('span');
        this.orderTextElement.className = 'order-text';
        
        this.deleteButton = document.createElement('button');
        this.deleteButton.className = 'grid-item-delete-btn';
        this.deleteButton.innerHTML = '&times;';
        this.deleteButton.title = "Supprimer cette image";
        this.deleteButton.onclick = (e) => {
            e.stopPropagation();
            organizerRef.deleteImageFromGrid(this.id);
        };

        this.imgElement.src = this.thumbnailPath; 
        this.imgElement.alt = this.basename;
        this.imgElement.style.width = '100%';
        this.imgElement.style.height = '100%';
        this.imgElement.style.objectFit = 'contain';
        this.imgElement.onerror = () => { 
            const currentSrcFilename = Utils.getFilenameFromURL(this.imgElement.src);
            if (currentSrcFilename === this.thumbnailFilename && this.imagePath !== this.thumbnailPath) {
                console.warn(`Thumbnail ${this.thumbnailPath} failed to load, trying full image ${this.imagePath}`);
                this.imgElement.src = this.imagePath;
            } else {
                this.drawErrorPlaceholderImg(`Img ${this.basename.substring(0,10)}`); 
            }
        };

        this.element.appendChild(this.imgElement);
        this.element.appendChild(this.orderTextElement);
        this.element.appendChild(this.deleteButton);

        this.isUsed = false;
        this.order = null;
        this.color = "red";
        this.isValid = true; 

        this.updateElementStyle();
    }

    drawErrorPlaceholderImg(text) {
        this.imgElement.remove(); 
        const errorDiv = document.createElement('div');
        errorDiv.style.width = '100%';
        errorDiv.style.height = '100%';
        errorDiv.style.display = 'flex';
        errorDiv.style.alignItems = 'center';
        errorDiv.style.justifyContent = 'center';
        errorDiv.style.color = 'red';
        errorDiv.style.backgroundColor = 'lightgrey';
        errorDiv.style.fontSize = `${Math.max(8, this.thumbSize.height / 7)}px`;
        errorDiv.textContent = text;
        this.element.insertBefore(errorDiv, this.orderTextElement); 
    }

    updateElementStyle() {
        this.element.style.width = `${this.thumbSize.width}px`;
        this.element.style.height = `${this.thumbSize.height}px`;
    }

    updateSize(newThumbSize) {
        if (newThumbSize.width === this.thumbSize.width && newThumbSize.height === this.thumbSize.height) {
            return;
        }
        
        const oldSrcFilename = Utils.getFilenameFromURL(this.imgElement.src);
        let newSrcToUse = this.thumbnailPath;

        const loadFullImageThresholdWidth = GridItemBackend.SERVER_THUMB_OPTIMAL_DISPLAY_WIDTH * 1.5;
        const loadFullImageThresholdHeight = GridItemBackend.SERVER_THUMB_OPTIMAL_DISPLAY_HEIGHT * 1.5;

        if (newThumbSize.width > loadFullImageThresholdWidth || newThumbSize.height > loadFullImageThresholdHeight) {
            if (this.imagePath !== this.thumbnailPath) { 
                newSrcToUse = this.imagePath;
            } else {
                 newSrcToUse = this.thumbnailPath; 
            }
        } else {
            newSrcToUse = this.thumbnailPath;
        }

        const newSrcFilename = Utils.getFilenameFromURL(newSrcToUse);
        if (newSrcFilename !== oldSrcFilename) {
            this.imgElement.src = newSrcToUse;
        }

        this.thumbSize = { ...newThumbSize };
        this.updateElementStyle(); 
        this._updateOrderTextAppearance();
    }

    _updateOrderTextAppearance() {
        if (this.isUsed && this.order !== null) {
            this.orderTextElement.textContent = this.order;
            this.orderTextElement.style.color = this.color;
            this.orderTextElement.style.display = 'block';
    
            let fontSizeFactor = 0.3;
            if (this.order.length > 5) {
                fontSizeFactor = 0.22;
            }
            if (this.order.length > 15) {
                fontSizeFactor = 0.18;
            }
            const fontSize = Math.max(8, Math.min(32, Math.floor(this.thumbSize.height * fontSizeFactor)));
            this.orderTextElement.style.fontSize = `${fontSize}px`;
            this.element.classList.add('used');
        } else {
            this.orderTextElement.textContent = '';
            this.orderTextElement.style.display = 'none';
            this.element.classList.remove('used');
        }
    }

    markUsed(order, color = "red") {
        this.isUsed = true;
        this.order = order;
        this.color = color;
        this._updateOrderTextAppearance();
    }

    markUnused() {
        this.isUsed = false;
        this.order = null;
        this._updateOrderTextAppearance();
    }
}

// =================================================================
// --- CLASSE JourFrameBackend ---
// =================================================================
class JourFrameBackend {
    constructor(organizer, jourData) {
        this.organizer = organizer;
        this.id = jourData._id;
        this.galleryId = jourData.galleryId;
        this.index = jourData.index;
        this.letter = jourData.letter;
        this.maxImages = 20;
        this.imagesData = []; 
        this.descriptionText = jourData.descriptionText || '';
        this.descriptionHashtags = jourData.descriptionHashtags || '';
        this.placeholderElement = null; 
        this.draggedItemElement = null; 

        this.debouncedSave = Utils.debounce(this.save.bind(this), 1500);

        this.element = document.createElement('div');
        this.element.className = 'jour-frame';
        this.element.dataset.id = `jour-${this.letter}`; 
        this.element.dataset.jourDbId = this.id;

        this.labelElement = document.createElement('button');
        this.labelElement.className = 'jour-frame-label';
        this.labelElement.textContent = `Jour ${this.letter}`;

        this.canvasWrapper = document.createElement('div');
        this.canvasWrapper.className = 'jour-frame-canvas-wrapper';

        const buttonsContainer = document.createElement('div');
        buttonsContainer.className = 'jour-frame-buttons';
        
        this.cropBtn = document.createElement('button');
        this.cropBtn.textContent = '✂️ Rec.';
        this.exportJourImagesBtn = document.createElement('button');
        this.exportJourImagesBtn.textContent = 'Exporter Images';
        
        this.deleteJourBtn = document.createElement('button');
        this.deleteJourBtn.textContent = '🗑️ Suppr. Jour';
        this.deleteJourBtn.className = 'danger-btn-small';

        buttonsContainer.appendChild(this.cropBtn);
        buttonsContainer.appendChild(this.exportJourImagesBtn);
        buttonsContainer.appendChild(this.deleteJourBtn);

        this.element.appendChild(this.labelElement);
        this.element.appendChild(this.canvasWrapper);
        this.element.appendChild(buttonsContainer);

        this.labelElement.addEventListener('click', () => this.organizer.setCurrentJourFrame(this));
        this.element.addEventListener('click', (e) => {
            if (e.target === this.element || e.target === this.canvasWrapper) {
                this.organizer.setCurrentJourFrame(this);
            }
        });

        this.cropBtn.addEventListener('click', () => this.openCropperForJour());
        this.exportJourImagesBtn.addEventListener('click', () => this.exportJourAsZip()); 
        this.deleteJourBtn.addEventListener('click', () => this.organizer.closeJourFrame(this));

        this.canvasWrapper.addEventListener('dragover', (e) => this.onDragOverInCanvas(e));
        this.canvasWrapper.addEventListener('dragleave', (e) => this.onDragLeaveCanvas(e));
        this.canvasWrapper.addEventListener('drop', (e) => this.onDropIntoCanvas(e));

        if (jourData.images && Array.isArray(jourData.images)) {
            jourData.images.sort((a, b) => a.order - b.order).forEach(imgEntry => {
                if (imgEntry && imgEntry.imageId && typeof imgEntry.imageId === 'object') { 
                    this.addImageFromBackendData(imgEntry.imageId);
                } else {
                    console.warn('Données d\'image non peuplées ou invalides dans le Jour :', jourData.letter, imgEntry);
                }
            });
        }
        this.checkAndApplyCroppedStyle();
    }
    
    onDragOverInCanvas(event) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        this.canvasWrapper.classList.add('drag-over');
    
        const targetVisualIndex = this.calculateInsertIndexFromDropEvent(event);
    
        if (!this.placeholderElement) {
            this.placeholderElement = document.createElement('div');
            this.placeholderElement.className = 'jour-image-placeholder';
        }
    
        if (this.placeholderElement.parentNode) {
            this.placeholderElement.parentNode.removeChild(this.placeholderElement);
        }
    
        const actualChildren = Array.from(this.canvasWrapper.children)
            .filter(child => child !== this.placeholderElement && child !== this.draggedItemElement);
    
        if (targetVisualIndex >= actualChildren.length) {
            this.canvasWrapper.appendChild(this.placeholderElement);
        } else {
            this.canvasWrapper.insertBefore(this.placeholderElement, actualChildren[targetVisualIndex]);
        }
    }
    
    calculateInsertIndexFromDropEvent(event) {
        const itemsToConsider = Array.from(this.canvasWrapper.children)
            .filter(child => child !== this.placeholderElement && child !== this.draggedItemElement);

        if (itemsToConsider.length === 0) {
            return 0;
        }

        const dropX = event.offsetX;
        const dropY = event.offsetY;
        const canvasRect = this.canvasWrapper.getBoundingClientRect();

        for (let i = 0; i < itemsToConsider.length; i++) {
            const item = itemsToConsider[i];
            const itemRect = item.getBoundingClientRect();
            const itemTop = itemRect.top - canvasRect.top;
            const itemBottom = itemTop + itemRect.height;

            if (dropY >= itemTop && dropY <= itemBottom) {
                const itemLeft = itemRect.left - canvasRect.left;
                const itemMidX = itemLeft + itemRect.width / 2;
                if (dropX < itemMidX) {
                    return i;
                }
            }
        }

        return itemsToConsider.length;
    }  

    onDragLeaveCanvas(event) {
        if (!this.canvasWrapper.contains(event.relatedTarget) || event.relatedTarget === this.canvasWrapper) {
            this.clearDragState();
        }
    }
    
    clearDragState() {
        if (this.placeholderElement && this.placeholderElement.parentNode) {
            this.placeholderElement.parentNode.removeChild(this.placeholderElement);
        }
        this.canvasWrapper.classList.remove('drag-over');
        if (this.draggedItemElement) {
            this.draggedItemElement.classList.remove('dragging-jour-item');
            this.draggedItemElement.style.opacity = '1'; 
            this.draggedItemElement = null;
        }
    }
    
    onDropIntoCanvas(event) {
        event.preventDefault();
        
        const targetVisualIndex = this.calculateInsertIndexFromDropEvent(event); 
        
        this.canvasWrapper.classList.remove('drag-over');

        const jsonData = event.dataTransfer.getData("application/json");
        if (!jsonData) {
            this.clearDragState();
            return;
        }
    
        try {
            const data = JSON.parse(jsonData);
    
            if (data.sourceType === 'grid') {
                const gridItem = this.organizer.gridItemsDict[data.imageId];
                if (gridItem) {
                    const newItemData = {
                        imageId: gridItem.id, displayPathKey: gridItem.id,
                        originalReferencePath: gridItem.parentImageId || gridItem.id,
                        dataURL: gridItem.thumbnailPath, isCropped: gridItem.isCroppedVersion
                    };
                    this.insertImageAt(newItemData, targetVisualIndex); 
                }
            } else if (data.sourceType === 'jour') {
                const sourceJourFrame = this.organizer.jourFrames.find(jf => jf.id === data.sourceJourId);
                if (sourceJourFrame) {
                    const draggedImageId = data.imageId;
                    const originalDataIndexInSource = sourceJourFrame.imagesData.findIndex(d => d.imageId === draggedImageId);
    
                    if (originalDataIndexInSource !== -1) {
                        const itemDataToMove = { ...sourceJourFrame.imagesData[originalDataIndexInSource] }; 
    
                        if (sourceJourFrame === this) { 
                            this.imagesData.splice(originalDataIndexInSource, 1);
                            
                            let adjustedTargetIndex = targetVisualIndex;
                            if (originalDataIndexInSource < targetVisualIndex) {
                                adjustedTargetIndex--;
                            }
                            adjustedTargetIndex = Math.max(0, Math.min(adjustedTargetIndex, this.imagesData.length));
    
                            this.imagesData.splice(adjustedTargetIndex, 0, itemDataToMove);
                            this.rebuildAndReposition();
                            this.debouncedSave();
                        } else { 
                            sourceJourFrame.removeImageAtIndex(originalDataIndexInSource); 
                            this.insertImageAt(itemDataToMove, targetVisualIndex);
                        }
                    }
                }
            }
        } catch (e) {
            console.error("Error processing drop data in JourFrame:", e);
        } finally {
            this.clearDragState(); 
        }
    }

    addImageFromBackendData(imageData) {
        const galleryIdForURL = imageData.galleryId;
        const thumbFilename = Utils.getFilenameFromURL(imageData.thumbnailPath);
    
        if (!galleryIdForURL || !thumbFilename) {
            console.error("Données d'image incomplètes, impossible de générer l'aperçu:", imageData);
            return;
        }
    
        const imageItemData = {
            imageId: imageData._id || imageData.id,
            displayPathKey: imageData._id || imageData.id,
            originalReferencePath: imageData.parentImageId || (imageData._id || imageData.id),
            dataURL: `${BASE_API_URL}/api/uploads/${galleryIdForURL}/${thumbFilename}`,
            isCropped: imageData.isCroppedVersion || false,
        };
        this.insertImageAt(imageItemData, this.imagesData.length, true);
    }
    
    checkAndApplyCroppedStyle() {
        this.hasBeenProcessedByCropper = this.imagesData.some(img => img.isCropped);
        if (this.hasBeenProcessedByCropper) {
            this.element.classList.add('jour-frame-processed');
        } else {
            this.element.classList.remove('jour-frame-processed');
        }
    }

    async exportJourAsZip() {
        if (this.imagesData.length === 0) {
            alert(`Le Jour ${this.letter} est vide.`);
            return;
        }
        if (!this.galleryId || !this.id) {
            alert("Erreur: Impossible de déterminer l'ID de la galerie ou du jour.");
            return;
        }

        const exportUrl = `${BASE_API_URL}/api/galleries/${this.galleryId}/jours/${this.id}/export`;
        const originalButtonText = this.exportJourImagesBtn.textContent;
        this.exportJourImagesBtn.textContent = 'Préparation...';
        this.exportJourImagesBtn.disabled = true;

        try {
            const response = await fetch(exportUrl);
            if (!response.ok) {
                throw new Error(`Erreur serveur: ${response.statusText}`);
            }

            const blob = await response.blob();
            let filename = `Jour${this.letter}.zip`;
            const contentDisposition = response.headers.get('content-disposition');
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename="?(.+)"?/i);
                if (filenameMatch && filenameMatch.length > 1) {
                    filename = filenameMatch[1];
                }
            }
            
            Utils.downloadDataURL(window.URL.createObjectURL(blob), filename);
        } catch (error) {
            alert(`Erreur lors de l'exportation: ${error.message}`);
        } finally {
            this.exportJourImagesBtn.textContent = originalButtonText;
            this.exportJourImagesBtn.disabled = false;
        }
    }

    addImage(gridItem) { 
        if (!gridItem || !gridItem.id) return false;
        const imageItemData = {
            imageId: gridItem.id,
            displayPathKey: gridItem.id,
            originalReferencePath: gridItem.parentImageId || gridItem.id,
            dataURL: gridItem.thumbnailPath, 
            isCropped: gridItem.isCroppedVersion
        };
        return this.insertImageAt(imageItemData, this.imagesData.length);
    }

    insertImageAt(imageItemData, index, isInitialLoad = false) {
        if (!imageItemData || !imageItemData.imageId) {
            return false;
        }
    
        if (this.imagesData.length >= this.maxImages && !this.imagesData.find(img => img.imageId === imageItemData.imageId)) {
            alert("Nombre maximum d'images atteint pour ce Jour.");
            return false;
        }
    
        const existingDataIndex = this.imagesData.findIndex(d => d.imageId === imageItemData.imageId);
        if (existingDataIndex === -1) { 
            this.imagesData.splice(index, 0, imageItemData);
        } else { 
             if (existingDataIndex !== index) { 
                this.imagesData.splice(existingDataIndex, 1);
                const insertAt = (existingDataIndex < index) ? index - 1 : index;
                this.imagesData.splice(insertAt, 0, imageItemData);
             } 
        }
    
        const itemElement = document.createElement('div');
        itemElement.className = 'jour-image-item';
        itemElement.style.backgroundImage = `url(${imageItemData.dataURL})`;
        itemElement.draggable = true;
        itemElement.dataset.imageId = imageItemData.imageId;
    
        itemElement.addEventListener('dragstart', (e) => {
            this.draggedItemElement = itemElement; 
            itemElement.classList.add('dragging-jour-item');
            e.dataTransfer.setData("application/json", JSON.stringify({
                sourceType: 'jour',
                sourceJourId: this.id,
                imageId: imageItemData.imageId
            }));
            e.dataTransfer.effectAllowed = "move";
        });
    
        itemElement.addEventListener('dragend', () => {
             this.clearDragState(); 
        });
    
        const deleteBtn = document.createElement('span');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '&times;';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            const idxToRemove = this.imagesData.findIndex(img => img.imageId === imageItemData.imageId);
            if (idxToRemove !== -1) this.removeImageAtIndex(idxToRemove);
        };
        itemElement.appendChild(deleteBtn);
    
        const childrenWithoutPlaceholder = Array.from(this.canvasWrapper.children)
            .filter(c => c !== this.placeholderElement);
            
        if (index >= childrenWithoutPlaceholder.length) {
            this.canvasWrapper.appendChild(itemElement);
        } else {
            this.canvasWrapper.insertBefore(itemElement, childrenWithoutPlaceholder[index]);
        }
    
        this.checkAndApplyCroppedStyle();
        if (this.organizer) this.organizer.updateGridUsage();
        
        if (!isInitialLoad) {
            this.debouncedSave();
        }

        return true;
    }
    

    removeImageAtIndex(index) {
        if (index < 0 || index >= this.imagesData.length) return false;
        
        this.imagesData.splice(index, 1); 
        this.rebuildAndReposition(); 
        this.debouncedSave();
        this.checkAndApplyCroppedStyle(); 
        return true;
    }
    
    removeImageByActualId(imageIdToRemove) {
        let removed = false;
        for (let i = this.imagesData.length - 1; i >= 0; i--) {
            if (this.imagesData[i].imageId === imageIdToRemove) {
                this.removeImageAtIndex(i); 
                removed = true;
            }
        }
        return removed;
    }

    removeImageByOriginalReferencePath(originalRefId) {
        let removed = false;
        for (let i = this.imagesData.length - 1; i >= 0; i--) {
            if (this.imagesData[i].originalReferencePath === originalRefId) {
                this.removeImageAtIndex(i);
                removed = true;
            }
        }
        return removed;
    }

    async save() {
        if (!this.id || !app.currentGalleryId) {
            console.warn("Erreur: Impossible de sauvegarder le jour (ID manquant).");
            return false;
        }

        const imagesToSave = this.imagesData.map((imgData, idx) => ({
            imageId: imgData.imageId, 
            order: idx
        }));
        
        const payload = {
            images: imagesToSave,
            descriptionText: this.descriptionText,
            descriptionHashtags: this.descriptionHashtags
        };

        try {
            console.log(`Auto-saving Jour ${this.letter}...`);
            const response = await fetch(`${BASE_API_URL}/api/galleries/${app.currentGalleryId}/jours/${this.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload) 
            });
            if (!response.ok) {
                throw new Error(`Failed to save Jour ${this.letter}: ${response.statusText}`);
            }
            await response.json(); 
            console.log(`Jour ${this.letter} auto-saved successfully.`);
            return true;
        } catch (error) {
            console.error(`Error auto-saving Jour ${this.letter}:`, error);
            return false;
        }
    }

    openCropperForJour() {
        if (!this.imagesData.length) { alert(`Le Jour ${this.letter} est vide.`); return; }
        
        const imageInfosForCropper = this.imagesData.map(imgData => {
            const originalImageInGrid = this.organizer.gridItemsDict[imgData.originalReferencePath];
            let baseImageToCropFromURL = imgData.dataURL; 

            if (originalImageInGrid) {
                 baseImageToCropFromURL = originalImageInGrid.imagePath; 
            } else {
                console.warn(`Image originale ${imgData.originalReferencePath} non trouvée.`);
            }
            
            return {
                pathForCropper: imgData.imageId, 
                dataURL: imgData.dataURL, 
                originalReferenceId: imgData.originalReferencePath, 
                baseImageToCropFromDataURL: baseImageToCropFromURL, 
                currentImageId: imgData.imageId 
            };
        });
        this.organizer.openImageCropper(imageInfosForCropper, this);
    }

    updateImagesFromCropper(modifiedDataMap) {
        let changesAppliedThisTime = false;
        const newImagesDataArray = [];

        for (let i = 0; i < this.imagesData.length; i++) {
            const currentImgItemData = this.imagesData[i]; 
            const modificationOutput = modifiedDataMap[currentImgItemData.imageId]; 

            if (modificationOutput) { 
                changesAppliedThisTime = true;
                if (Array.isArray(modificationOutput)) { 
                    modificationOutput.forEach(newImageDoc => { 
                        newImagesDataArray.push(this.createImageItemDataFromBackendDoc(newImageDoc));
                    });
                } else { 
                    const newImageDoc = modificationOutput;
                    newImagesDataArray.push(this.createImageItemDataFromBackendDoc(newImageDoc));
                }
            } else {
                newImagesDataArray.push(currentImgItemData); 
            }
        }

        if (changesAppliedThisTime) {
            this.imagesData = newImagesDataArray; 
            this.rebuildAndReposition(); 
            this.debouncedSave();
            this.checkAndApplyCroppedStyle(); 
        }
    }
    
    createImageItemDataFromBackendDoc(imageDoc) {
        return {
            imageId: imageDoc._id,
            displayPathKey: imageDoc._id, 
            originalReferencePath: imageDoc.parentImageId || imageDoc._id, 
            dataURL: `${BASE_API_URL}/api/uploads/${imageDoc.galleryId}/${Utils.getFilenameFromURL(imageDoc.thumbnailPath)}`,
            isCropped: imageDoc.isCroppedVersion
        };
    }

    rebuildAndReposition() {
        const currentOrderedData = [...this.imagesData]; 
        
        this.canvasWrapper.innerHTML = ''; 
        this.imagesData = []; 

        currentOrderedData.forEach((imgData, index) => {
            this.insertImageAt(imgData, index, true);
        });
        
        if (this.organizer) this.organizer.updateGridUsage();
    }

    getUsageData() {
        const usage = {};
        const color = JOUR_COLORS[this.index % JOUR_COLORS.length];
        this.imagesData.forEach((imgData, i) => {
            const label = `${this.letter}${i + 1}`;
            const originalId = imgData.originalReferencePath; 

            if (!usage[originalId] ||
                (this.organizer.jourFrames.find(jf => jf.letter === usage[originalId].jourLetter)?.index || 0) > this.index ||
                ((this.organizer.jourFrames.find(jf => jf.letter === usage[originalId].jourLetter)?.index || 0) === this.index &&
                 parseInt(usage[originalId].label.substring(1)) > (i+1))
               )
            {
                if (!usage[originalId]) {
                    usage[originalId] = { labels: [], color: color, displayImageId: imgData.imageId, jourLetter: this.letter };
                }
                usage[originalId].labels.push(label);
            }
        });

        const finalUsage = {};
        for (const id in usage) {
            finalUsage[id] = {
                label: usage[id].labels.join(' / '),
                color: usage[id].color,
                displayImageId: usage[id].displayImageId,
                jourLetter: usage[id].jourLetter
            };
        }
        return finalUsage;
    }

    async destroy() { 
        if (this.id && app.currentGalleryId) {
            try {
                await fetch(`${BASE_API_URL}/api/galleries/${app.currentGalleryId}/jours/${this.id}`, { method: 'DELETE' });
                console.log(`Jour ${this.letter} (ID: ${this.id}) deleted from backend.`);
            } catch (error) {
                console.error(`Error deleting Jour ${this.letter} from backend:`, error);
            }
        }
        if (this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        this.imagesData = []; 
    }
}


class ImageCropperPopup {
    constructor(organizer) {
        this.organizer = organizer;
        this.modalElement = document.getElementById('cropperModal');
        this.closeButton = document.getElementById('closeCropperBtn');
        this.canvasElement = document.getElementById('cropperCanvas');
        this.ctx = this.canvasElement.getContext('2d', { alpha: false }); 
        this.previewContainer = this.modalElement.querySelector('.cropper-previews'); 
        this.previewLeft = document.getElementById('cropperPreviewLeft');
        this.previewCenter = document.getElementById('cropperPreviewCenter'); 
        this.previewRight = document.getElementById('cropperPreviewRight');
        this.infoLabel = document.getElementById('cropperInfoLabel');
        
        this.prevBtn = document.getElementById('cropPrevImageBtn');
        this.nextBtn = document.getElementById('cropNextImageBtn');
        this.flipBtn = document.getElementById('cropFlipBtn');
        this.aspectRatioSelect = document.getElementById('cropAspectRatio');
        this.whiteBarsBtn = document.getElementById('cropAddWhiteBarsBtn');
        this.splitLineBtn = document.getElementById('cropSplitLineBtn'); 
        this.ignoreBtn = document.getElementById('cropIgnoreBtn');
        this.finishBtn = document.getElementById('cropFinishBtn');

        this.imagesToCrop = []; 
        this.currentImageIndex = -1;
        this.currentImageObject = null; 
        this.modifiedDataMap = {}; 
        this.currentJourFrameInstance = null;
        
        this.cropRectDisplay = null; 
        this.isDragging = false;
        this.dragMode = null; 
        this.dragStart = {};
        this.currentAspectRatioName = '3:4'; 
        
        this.splitModeState = 0; 
        this.showSplitLineCount = 0; 

        this.flippedH = false;
        this.saveMode = 'crop'; 
        this.ignoreSaveForThisImage = false;
        this.handleSize = 18; 
        this.handleDetectionOffset = this.handleSize / 2 + 6; 

        this._initListeners();
        this.debouncedUpdatePreview = Utils.debounce(() => this.updatePreview(), 150);
    }

    _initListeners() {
        this.closeButton.onclick = () => this.finishAndApply();
        this.finishBtn.onclick = () => this.finishAndApply();
        this.prevBtn.onclick = () => this.prevImage(); 
        this.nextBtn.onclick = () => this.nextImage(false); 
        this.ignoreBtn.onclick = () => {
            const currentImgInfo = this.imagesToCrop[this.currentImageIndex];
            this.infoLabel.textContent = `Image ${currentImgInfo?.originalReferenceId || ''} ignorée.`;
            this.ignoreSaveForThisImage = true;
            this.nextImage(true); 
        };
        this.flipBtn.onclick = () => this.toggleFlip();
        this.aspectRatioSelect.onchange = (e) => this.onRatioChanged(e.target.value);
        this.whiteBarsBtn.onclick = () => this.toggleWhiteBars();
        this.splitLineBtn.onclick = () => this.toggleSplitMode(); 

        this.canvasElement.onmousedown = (e) => this.onCanvasMouseDown(e);
        this.canvasElement.addEventListener('mousemove', (e) => this.onCanvasMouseMoveHover(e));
        document.addEventListener('mousemove', (e) => this.onDocumentMouseMoveDrag(e)); 
        document.addEventListener('mouseup', (e) => this.onDocumentMouseUp(e));
        
        document.addEventListener('keydown', (e) => this.onDocumentKeyDown(e));
        
        new ResizeObserver(() => {
            if (this.modalElement.style.display === 'flex' && this.currentImageObject) {
                this.setCanvasDimensions();
                this.redrawCanvasOnly(); 
                this.debouncedUpdatePreview();
            }
        }).observe(this.canvasElement.parentElement);
    }
    
    redrawCanvasOnly() {
        this._internalRedraw(false); 
    }
    
    _internalRedraw(updatePreviewAlso = false) { 
        this.ctx.fillStyle = CROPPER_BACKGROUND_GRAY; 
        this.ctx.fillRect(0, 0, this.canvasElement.width, this.canvasElement.height);
        if (!this.currentImageObject) return;
    
        if (this.saveMode === 'white_bars') {
            const canvasWidth = this.canvasElement.width, canvasHeight = this.canvasElement.height;
            const { finalWidth: origFinalWidth, finalHeight: origFinalHeight, pasteX: origPasteX, pasteY: origPasteY } = this.calculateWhiteBarDimensions();
            if (!origFinalWidth || !origFinalHeight) return;
            const scaleToFitCanvasX = canvasWidth / origFinalWidth, scaleToFitCanvasY = canvasHeight / origFinalHeight;
            const finalScale = Math.min(scaleToFitCanvasX, scaleToFitCanvasY) * 0.95; 
            const displayWBFWidth = origFinalWidth * finalScale, displayWBFHeight = origFinalHeight * finalScale;
            const displayWBFX = (canvasWidth - displayWBFWidth) / 2, displayWBFY = (canvasHeight - displayWBFHeight) / 2;
            
            this.ctx.fillStyle = 'white'; 
            this.ctx.fillRect(displayWBFX, displayWBFY, displayWBFWidth, displayWBFHeight);
            
            const imgRenderWidth = (this.currentImageObject.naturalWidth || this.currentImageObject.width) * finalScale;
            const imgRenderHeight = (this.currentImageObject.naturalHeight || this.currentImageObject.height) * finalScale;
            const imgRenderX = displayWBFX + (origPasteX * finalScale), imgRenderY = displayWBFY + (origPasteY * finalScale);
            
            this.ctx.save();
            if (this.flippedH) { this.ctx.translate(imgRenderX + imgRenderWidth, imgRenderY); this.ctx.scale(-1, 1); this.ctx.drawImage(this.currentImageObject, 0, 0, imgRenderWidth, imgRenderHeight); }
            else { this.ctx.drawImage(this.currentImageObject, imgRenderX, imgRenderY, imgRenderWidth, imgRenderHeight); }
            this.ctx.restore();
        } else { 
            const { displayX, displayY, displayWidth, displayHeight } = this.getImageDisplayDimensions();
            this.ctx.save();
            if (this.flippedH) { this.ctx.translate(this.canvasElement.width, 0); this.ctx.scale(-1, 1); const adjustedDisplayX = this.canvasElement.width - displayX - displayWidth; this.ctx.drawImage(this.currentImageObject, adjustedDisplayX, displayY, displayWidth, displayHeight); }
            else { this.ctx.drawImage(this.currentImageObject, displayX, displayY, displayWidth, displayHeight); }
            this.ctx.restore();

            this.ctx.strokeStyle = 'rgba(0,0,0,0.3)'; 
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(displayX -0.5, displayY -0.5, displayWidth+1, displayHeight+1);

            if (this.cropRectDisplay) { 
                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'; 
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(this.cropRectDisplay.x, this.cropRectDisplay.y, this.cropRectDisplay.width, this.cropRectDisplay.height);
                this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)'; 
                this.ctx.lineWidth = 0.5; 
                this.ctx.strokeRect(this.cropRectDisplay.x -0.5, this.cropRectDisplay.y -0.5, this.cropRectDisplay.width +1, this.cropRectDisplay.height+1);
                
                const {x,y,width,height} = this.cropRectDisplay;
                const hRadius = this.handleSize / 2;
                const handlePoints = [ [x,y], [x+width/2,y], [x+width,y], [x+width,y+height/2], [x+width,y+height], [x+width/2,y+height], [x,y+height], [x,y+height/2] ];
                
                handlePoints.forEach(([hx,hy]) => {
                    this.ctx.beginPath();
                    this.ctx.arc(hx, hy, hRadius, 0, 2 * Math.PI, false);
                    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'; 
                    this.ctx.fill();
                    this.ctx.lineWidth = 1;
                    this.ctx.strokeStyle = 'rgba(0,0,0,0.6)'; 
                    this.ctx.stroke();
                });
                
                if (this.showSplitLineCount > 0 && width > 0) { 
                    this.ctx.beginPath(); 
                    this.ctx.setLineDash([5, 3]); 
                    this.ctx.strokeStyle = 'rgba(220, 220, 220, 0.7)'; 
                    this.ctx.lineWidth = 1;
                    if (this.showSplitLineCount >= 1) {
                        const firstLineX = this.cropRectDisplay.x + this.cropRectDisplay.width / (this.showSplitLineCount + 1);
                        this.ctx.moveTo(firstLineX, this.cropRectDisplay.y); 
                        this.ctx.lineTo(firstLineX, this.cropRectDisplay.y + this.cropRectDisplay.height); 
                    }
                    if (this.showSplitLineCount === 2) {
                        const secondLineX = this.cropRectDisplay.x + (2 * this.cropRectDisplay.width) / (this.showSplitLineCount + 1);
                        this.ctx.moveTo(secondLineX, this.cropRectDisplay.y); 
                        this.ctx.lineTo(secondLineX, this.cropRectDisplay.y + this.cropRectDisplay.height); 
                    }
                    this.ctx.stroke(); 
                    this.ctx.setLineDash([]); 
                }
            }
        }
        if (updatePreviewAlso) {
             this.debouncedUpdatePreview();
        }
    }


    async onDocumentKeyDown(event) { 
        if (this.modalElement.style.display !== 'flex' || !this.currentImageObject) {
            return; 
        }
        const activeElement = document.activeElement;
        if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'SELECT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable)) {
            return;
        }
    
        let handled = false;
        if (event.key === "ArrowLeft") {
            await this.prevImage(); 
            handled = true;
        } else if (event.key === "ArrowRight") {
            await this.nextImage(false); 
            handled = true;
        }
    
        if (handled) {
            event.preventDefault(); 
        }
    }
    
    setCanvasDimensions() {
        const container = this.canvasElement.parentElement;
        this.canvasElement.width = container.clientWidth;
        this.canvasElement.height = container.clientHeight;
    }
    
    async open(images, callingJourFrame) { 
        this.imagesToCrop = images; 
        this.currentJourFrameInstance = callingJourFrame;
        this.currentImageIndex = -1;
        this.modifiedDataMap = {};
        this.saveMode = 'crop'; 
        this.modalElement.style.display = 'flex';
        this.setCanvasDimensions(); 
        this.isDragging = false; 
        this.dragMode = null;    
        this.canvasElement.style.cursor = 'crosshair'; 
        this.splitModeState = 0; 
        this.showSplitLineCount = 0;
        this.splitLineBtn.textContent = "Mode Split";
        this.splitLineBtn.classList.remove('active-crop-btn');
        this.aspectRatioSelect.disabled = false;
        this.whiteBarsBtn.disabled = false;
        this.whiteBarsBtn.classList.remove('active-crop-btn');
        
        this.aspectRatioSelect.value = '3:4'; 
        this.currentAspectRatioName = '3:4';   

        await this.nextImage(true); 
    }
    
    async finishAndApply() { 
        if (this.currentImageIndex >= 0 && this.currentImageIndex < this.imagesToCrop.length && !this.ignoreSaveForThisImage) {
            await this.applyAndSaveCurrentImage();
        }
        this.modalElement.style.display = 'none';
        if (this.currentJourFrameInstance) {
            this.currentJourFrameInstance.updateImagesFromCropper(this.modifiedDataMap);
        }
        this.imagesToCrop = [];
        this.currentJourFrameInstance = null;
        this.currentImageObject = null; 
        this.ctx.clearRect(0,0,this.canvasElement.width, this.canvasElement.height);
        this.infoLabel.textContent = "";
        this.isDragging = false;
        this.dragMode = null;
        this.canvasElement.style.cursor = 'default'; 
        this.splitModeState = 0;
        this.showSplitLineCount = 0;
        this.splitLineBtn.textContent = "Mode Split";
        this.splitLineBtn.classList.remove('active-crop-btn');
        this.whiteBarsBtn.classList.remove('active-crop-btn');
    }

    async loadCurrentImage() {
        this.ignoreSaveForThisImage = false;
        this.flippedH = false;
        this.cropRectDisplay = null; 
        this.isDragging = false; 
        this.dragMode = null;    
        this.canvasElement.style.cursor = 'crosshair'; 

        if (this.currentImageIndex < 0 || this.currentImageIndex >= this.imagesToCrop.length) {
            this.currentImageObject = null;
            this.ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
            this.infoLabel.textContent = "Toutes les images traitées.";
            this.updatePreview(null, null);
            if (this.imagesToCrop.length > 0) this.finishBtn.focus(); 
            return;
        }

        const imgInfo = this.imagesToCrop[this.currentImageIndex];
        const originalGridItem = this.organizer.gridItemsDict[imgInfo.originalReferenceId];
        const displayName = originalGridItem ? originalGridItem.basename : `Image ID ${imgInfo.originalReferenceId}`;
        this.infoLabel.textContent = `Chargement ${this.currentImageIndex + 1}/${this.imagesToCrop.length}: ${displayName}...`;
        
        try {
            this.currentImageObject = await Utils.loadImage(imgInfo.baseImageToCropFromDataURL); 

            if (this.currentImageObject) {
                if (this.splitModeState === 1) { 
                    this.currentAspectRatioName = '6:4split'; 
                    this.setDefaultMaximizedCropRectForSplit();
                } else if (this.splitModeState === 2) { 
                    this.currentAspectRatioName = '9:4doublesplit'; 
                    this.setDefaultMaximizedCropRectForDoubleSplit();
                } else { 
                    let defaultRatio = this.aspectRatioSelect.value; 
                    
                    if (this.saveMode === 'crop' && defaultRatio === 'free') { 
                        const imgWidth = this.currentImageObject.naturalWidth || this.currentImageObject.width;
                        const imgHeight = this.currentImageObject.naturalHeight || this.currentImageObject.height;
                        if (imgHeight > imgWidth * 1.1) defaultRatio = '3:4'; 
                        else if (imgWidth > imgHeight * 1.1) defaultRatio = '3:2'; 
                        else defaultRatio = '1:1';
                    }
                    this.aspectRatioSelect.value = defaultRatio; 
                    this.onRatioChanged(defaultRatio); 
                }
            }
             
            this.aspectRatioSelect.disabled = this.splitModeState > 0 || this.saveMode === 'white_bars';
            this.whiteBarsBtn.disabled = this.splitModeState > 0;
            this.splitLineBtn.disabled = this.saveMode === 'white_bars';

            this.redrawCanvasOnly(); 
            this.debouncedUpdatePreview();
            this.infoLabel.textContent = `Image ${this.currentImageIndex + 1}/${this.imagesToCrop.length}: ${displayName}`;
        } catch (e) {
            console.error(`Error loading image in cropper for ${displayName}:`, e);
            this.infoLabel.textContent = `Erreur chargement: ${displayName}`;
            this.currentImageObject = null;
            this.updatePreview(null, null);
        }
    }
    
    setDefaultCropRect() { 
        if (!this.currentImageObject) return;
        const { displayX, displayY, displayWidth, displayHeight } = this.getImageDisplayDimensions();
        this.cropRectDisplay = { x: displayX, y: displayY, width: displayWidth, height: displayHeight };
        this.adjustCropRectToAspectRatio(); 
        this.canvasElement.style.cursor = 'crosshair'; 
    }

    setDefaultMaximizedCropRectForSplit() { 
        if (!this.currentImageObject) return;
        const { displayX, displayY, displayWidth, displayHeight } = this.getImageDisplayDimensions();
        const targetRatioVal = 6 / 4; 
        let newW, newH;

        if (displayWidth / displayHeight > targetRatioVal) { 
            newH = displayHeight;
            newW = newH * targetRatioVal;
        } else { 
            newW = displayWidth;
            newH = newW / targetRatioVal;
        }
        
        const newCropX = displayX + (displayWidth - newW) / 2;
        const newCropY = displayY + (displayHeight - newH) / 2;

        this.cropRectDisplay = { x: newCropX, y: newCropY, width: newW, height: newH };
    }
    
    setDefaultMaximizedCropRectForDoubleSplit() { 
        if (!this.currentImageObject) return;
        const { displayX, displayY, displayWidth, displayHeight } = this.getImageDisplayDimensions();
        const targetRatioVal = 9 / 4; 
        let newW, newH;

        if (displayWidth / displayHeight > targetRatioVal) { 
            newH = displayHeight;
            newW = newH * targetRatioVal;
        } else { 
            newW = displayWidth;
            newH = newW / targetRatioVal;
        }
        
        const newCropX = displayX + (displayWidth - newW) / 2;
        const newCropY = displayY + (displayHeight - newH) / 2;

        this.cropRectDisplay = { x: newCropX, y: newCropY, width: newW, height: newH };
    }


    getImageDisplayDimensions() { 
        if (!this.currentImageObject) return { displayX:0, displayY:0, displayWidth:0, displayHeight:0, imageScale: 1};
        const canvasWidth = this.canvasElement.width, canvasHeight = this.canvasElement.height;
        const imgWidth = this.currentImageObject.naturalWidth || this.currentImageObject.width;
        const imgHeight = this.currentImageObject.naturalHeight || this.currentImageObject.height;
        const scaleX = canvasWidth / imgWidth, scaleY = canvasHeight / imgHeight;
        const imageScale = Math.min(scaleX, scaleY);
        const displayWidth = imgWidth * imageScale, displayHeight = imgHeight * imageScale;
        const displayX = (canvasWidth - displayWidth) / 2, displayY = (canvasHeight - displayHeight) / 2;
        return { displayX, displayY, displayWidth, displayHeight, imageScale };
    }
    
    adjustCropRectToAspectRatio() { 
        if (!this.cropRectDisplay || !this.currentImageObject || this.saveMode !== 'crop') return;
        
        const { displayX, displayY, displayWidth, displayHeight } = this.getImageDisplayDimensions();
        let targetRatioVal;

        if (this.currentAspectRatioName === 'free') { 
            this.cropRectDisplay.x = Math.max(displayX, this.cropRectDisplay.x);
            this.cropRectDisplay.y = Math.max(displayY, this.cropRectDisplay.y);
            this.cropRectDisplay.width = Math.min(this.cropRectDisplay.width, displayX + displayWidth - this.cropRectDisplay.x);
            this.cropRectDisplay.height = Math.min(this.cropRectDisplay.height, displayY + displayHeight - this.cropRectDisplay.y);
            return; 
        }
        else if (this.currentAspectRatioName === '6:4split') targetRatioVal = 6 / 4; 
        else if (this.currentAspectRatioName === '9:4doublesplit') targetRatioVal = 9 / 4; 
        else { const parts = this.currentAspectRatioName.split(':').map(Number); targetRatioVal = parts[0] / parts[1]; }

        let newWidth = this.cropRectDisplay.width;
        let newHeight = this.cropRectDisplay.height;
        const centerX = this.cropRectDisplay.x + newWidth / 2;
        const centerY = this.cropRectDisplay.y + newHeight / 2;

        if (newWidth / newHeight > targetRatioVal) { 
            newWidth = newHeight * targetRatioVal;
        } else { 
            newHeight = newWidth / targetRatioVal;
        }
        if (newWidth > displayWidth) {
            newWidth = displayWidth;
            newHeight = newWidth / targetRatioVal;
        }
        if (newHeight > displayHeight) {
            newHeight = displayHeight;
            newWidth = newHeight * targetRatioVal;
        }
        
        let newX = centerX - newWidth / 2;
        let newY = centerY - newHeight / 2;

        newX = Math.max(displayX, Math.min(newX, displayX + displayWidth - newWidth));
        newY = Math.max(displayY, Math.min(newY, displayY + displayHeight - newHeight));
        
        newWidth = Math.min(newWidth, displayX + displayWidth - newX);
        newHeight = Math.min(newHeight, displayY + displayHeight - newY);

        if (Math.abs(newWidth / newHeight - targetRatioVal) > 0.001) {
             if (newWidth / targetRatioVal <= displayHeight - newY) { 
                newHeight = newWidth / targetRatioVal;
            } else { 
                newWidth = newHeight * targetRatioVal;
            }
        }

        this.cropRectDisplay.x = newX; 
        this.cropRectDisplay.y = newY;
        this.cropRectDisplay.width = newWidth; 
        this.cropRectDisplay.height = newHeight;
    }

    updatePreview() { 
        this.previewContainer.classList.remove('split-active', 'double-split-active'); 
        this.previewLeft.src = 'about:blank'; this.previewLeft.style.display = 'none';
        this.previewCenter.src = 'about:blank'; this.previewCenter.style.display = 'none';
        this.previewRight.src = 'about:blank'; this.previewRight.style.display = 'none';
        if (!this.currentImageObject) return;
        
        const tempCanvas = document.createElement('canvas'), tempCtx = tempCanvas.getContext('2d');
        
        if (this.saveMode === 'white_bars') {
            const { finalWidth, finalHeight, pasteX, pasteY } = this.calculateWhiteBarDimensions();
            if (!finalWidth || !finalHeight) return;
            tempCanvas.width = finalWidth; tempCanvas.height = finalHeight; tempCtx.fillStyle = 'white'; tempCtx.fillRect(0, 0, finalWidth, finalHeight);
            this.drawFlippedIfNeeded(tempCtx, this.currentImageObject, pasteX, pasteY, this.currentImageObject.naturalWidth, this.currentImageObject.naturalHeight);
            this.previewLeft.src = Utils.createThumbnail(tempCanvas, PREVIEW_WIDTH, PREVIEW_HEIGHT, 'lightgrey'); this.previewLeft.style.display = 'block';
        } else if (this.saveMode === 'crop' && this.cropRectDisplay) {
            const { sx, sy, sWidth, sHeight } = this.getCropSourceCoordinates();
            if (sWidth <=0 || sHeight <=0) return;

            if (this.splitModeState === 1) { // 2 images
                this.previewContainer.classList.add('split-active'); 
                const sWidthLeft = Math.floor(sWidth / 2);
                const sWidthRight = sWidth - sWidthLeft; 

                tempCanvas.width = sWidthLeft; tempCanvas.height = sHeight;
                if (tempCanvas.width > 0 && tempCanvas.height > 0) {
                    this.drawFlippedIfNeeded(tempCtx, this.currentImageObject, 0, 0, sWidthLeft, sHeight, sx, sy, sWidthLeft, sHeight);
                    this.previewLeft.src = Utils.createThumbnail(tempCanvas, PREVIEW_WIDTH / 2 - 4, PREVIEW_HEIGHT, 'lightgrey'); 
                    this.previewLeft.style.display = 'inline-block';
                } else { this.previewLeft.style.display = 'none'; }
                
                tempCanvas.width = sWidthRight; tempCanvas.height = sHeight; 
                if (tempCanvas.width > 0 && tempCanvas.height > 0) {
                    tempCtx.clearRect(0,0,tempCanvas.width, tempCanvas.height);
                    this.drawFlippedIfNeeded(tempCtx, this.currentImageObject, 0, 0, sWidthRight, sHeight, sx + sWidthLeft, sy, sWidthRight, sHeight);
                    this.previewRight.src = Utils.createThumbnail(tempCanvas, PREVIEW_WIDTH / 2 - 4, PREVIEW_HEIGHT, 'lightgrey');
                    this.previewRight.style.display = 'inline-block';
                } else { this.previewRight.style.display = 'none'; }

            } else if (this.splitModeState === 2) { // 3 images
                this.previewContainer.classList.add('double-split-active');
                const sWidthThird = Math.floor(sWidth / 3);
                const sWidthLeft = sWidthThird;
                const sWidthMid = sWidthThird;
                const sWidthRight = sWidth - sWidthLeft - sWidthMid;

                tempCanvas.width = sWidthLeft; tempCanvas.height = sHeight;
                if (sWidthLeft > 0) {
                    this.drawFlippedIfNeeded(tempCtx, this.currentImageObject, 0,0, sWidthLeft, sHeight, sx, sy, sWidthLeft, sHeight);
                    this.previewLeft.src = Utils.createThumbnail(tempCanvas, PREVIEW_WIDTH / 3 - 6, PREVIEW_HEIGHT, 'lightgrey');
                    this.previewLeft.style.display = 'inline-block';
                } else { this.previewLeft.style.display = 'none'; }
                
                tempCanvas.width = sWidthMid; tempCanvas.height = sHeight; tempCtx.clearRect(0,0,tempCanvas.width,tempCanvas.height);
                if (sWidthMid > 0) {
                    this.drawFlippedIfNeeded(tempCtx, this.currentImageObject, 0,0, sWidthMid, sHeight, sx + sWidthLeft, sy, sWidthMid, sHeight);
                    this.previewCenter.src = Utils.createThumbnail(tempCanvas, PREVIEW_WIDTH / 3 - 6, PREVIEW_HEIGHT, 'lightgrey');
                    this.previewCenter.style.display = 'inline-block';
                } else { this.previewCenter.style.display = 'none'; }
                
                tempCanvas.width = sWidthRight; tempCanvas.height = sHeight; tempCtx.clearRect(0,0,tempCanvas.width,tempCanvas.height);
                if (sWidthRight > 0) {
                    this.drawFlippedIfNeeded(tempCtx, this.currentImageObject, 0,0, sWidthRight, sHeight, sx + sWidthLeft + sWidthMid, sy, sWidthRight, sHeight);
                    this.previewRight.src = Utils.createThumbnail(tempCanvas, PREVIEW_WIDTH / 3 - 6, PREVIEW_HEIGHT, 'lightgrey');
                    this.previewRight.style.display = 'inline-block';
                } else { this.previewRight.style.display = 'none'; }
            } else { 
                tempCanvas.width = sWidth; tempCanvas.height = sHeight; 
                this.drawFlippedIfNeeded(tempCtx, this.currentImageObject, 0,0, sWidth, sHeight, sx, sy, sWidth, sHeight);
                this.previewLeft.src = Utils.createThumbnail(tempCanvas, PREVIEW_WIDTH, PREVIEW_HEIGHT, 'lightgrey'); 
                this.previewLeft.style.display = 'block';
                this.previewCenter.style.display = 'none'; 
                this.previewRight.style.display = 'none'; 
            }
        }
    }
    
    drawFlippedIfNeeded(ctx, image, dx, dy, dWidth, dHeight, sx, sy, sWidth, sHeight) { 
        ctx.save();
        if (this.flippedH) { ctx.translate(dx + dWidth, dy); ctx.scale(-1, 1);
            if (sx !== undefined) ctx.drawImage(image, sx, sy, sWidth, sHeight, 0, 0, dWidth, dHeight); else ctx.drawImage(image, 0, 0, dWidth, dHeight);
        } else {
            if (sx !== undefined) ctx.drawImage(image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight); else ctx.drawImage(image, dx, dy, dWidth, dHeight);
        }
        ctx.restore();
    }

    getCropSourceCoordinates() { 
        if (!this.cropRectDisplay || !this.currentImageObject) return { sx:0, sy:0, sWidth:0, sHeight:0 };
        const { displayX, displayY, imageScale } = this.getImageDisplayDimensions(); if(imageScale === 0) return { sx:0, sy:0, sWidth:0, sHeight:0 };
        let sx = (this.cropRectDisplay.x - displayX) / imageScale, sy = (this.cropRectDisplay.y - displayY) / imageScale;
        let sWidth = this.cropRectDisplay.width / imageScale, sHeight = this.cropRectDisplay.height / imageScale;
        const imgNaturalWidth = this.currentImageObject.naturalWidth, imgNaturalHeight = this.currentImageObject.naturalHeight;
        sx = Math.max(0, Math.round(sx)); sy = Math.max(0, Math.round(sy));
        sWidth = Math.max(1, Math.round(Math.min(sWidth, imgNaturalWidth - sx))); sHeight = Math.max(1, Math.round(Math.min(sHeight, imgNaturalHeight - sy)));
        return { sx, sy, sWidth, sHeight };
    }
    
    onRatioChanged(newRatioName) { 
        if (this.splitModeState > 0 && newRatioName !== '6:4split' && newRatioName !== '9:4doublesplit') { 
            this.splitModeState = 0;
            this.showSplitLineCount = 0;
            this.splitLineBtn.textContent = "Mode Split";
            this.splitLineBtn.classList.remove('active-crop-btn');
            this.aspectRatioSelect.disabled = false; 
            this.whiteBarsBtn.disabled = false; 
        }
    
        this.currentAspectRatioName = newRatioName;
        
        this.whiteBarsBtn.disabled = (this.splitModeState > 0); 
        if(this.whiteBarsBtn.disabled) this.whiteBarsBtn.classList.remove('active-crop-btn');
    
        if (this.saveMode === 'white_bars') { 
            this.saveMode = 'crop'; 
            this.aspectRatioSelect.disabled = (this.splitModeState > 0); 
            this.whiteBarsBtn.classList.remove('active-crop-btn');
        }
        
        if (this.saveMode === 'crop' && this.currentImageObject) {
            const { displayX, displayY, displayWidth, displayHeight } = this.getImageDisplayDimensions();
            this.cropRectDisplay = { x: displayX, y: displayY, width: displayWidth, height: displayHeight };
            this.adjustCropRectToAspectRatio();
        }
        
        this.redrawCanvasOnly();
        this.debouncedUpdatePreview();
    }

    toggleSplitMode() {
        if (!this.currentImageObject) return;

        this.splitModeState = (this.splitModeState + 1) % 3; 

        this.whiteBarsBtn.classList.remove('active-crop-btn'); 
        this.saveMode = 'crop'; 

        if (this.splitModeState === 1) { 
            this.currentAspectRatioName = '6:4split'; 
            this.aspectRatioSelect.disabled = true;
            this.whiteBarsBtn.disabled = true; 
            this.showSplitLineCount = 1;
            this.setDefaultMaximizedCropRectForSplit(); 
            this.splitLineBtn.textContent = "Split (2 imgs)";
            this.splitLineBtn.classList.add('active-crop-btn');
        } else if (this.splitModeState === 2) { 
            this.currentAspectRatioName = '9:4doublesplit'; 
            this.aspectRatioSelect.disabled = true;
            this.whiteBarsBtn.disabled = true; 
            this.showSplitLineCount = 2;
            this.setDefaultMaximizedCropRectForDoubleSplit(); 
            this.splitLineBtn.textContent = "Split (3 imgs)";
            this.splitLineBtn.classList.add('active-crop-btn'); 
        } else { 
            this.aspectRatioSelect.disabled = false;
            this.whiteBarsBtn.disabled = false;
            this.showSplitLineCount = 0;
            this.splitLineBtn.textContent = "Mode Split";
            this.splitLineBtn.classList.remove('active-crop-btn');
            const currentSelectedRatio = this.aspectRatioSelect.value || '3:4'; 
            this.onRatioChanged(currentSelectedRatio); 
        }
        this.redrawCanvasOnly();
        this.debouncedUpdatePreview();
    }

    toggleFlip() { 
        if (!this.currentImageObject) return; this.flippedH = !this.flippedH; 
        this.redrawCanvasOnly();
        this.debouncedUpdatePreview();
    }
    
    calculateWhiteBarDimensions() { 
        if (!this.currentImageObject) return { finalWidth:0, finalHeight:0, pasteX:0, pasteY:0 };
        const imgWidth = this.currentImageObject.naturalWidth, imgHeight = this.currentImageObject.naturalHeight;
        const targetRatio = 3 / 4; 
        let finalWidth, finalHeight, pasteX, pasteY;
        if (imgWidth / imgHeight > targetRatio) { 
            finalWidth = imgWidth; 
            finalHeight = Math.round(imgWidth / targetRatio); 
        } else { 
            finalHeight = imgHeight; 
            finalWidth = Math.round(imgHeight * targetRatio); 
        }
        pasteX = Math.round((finalWidth - imgWidth) / 2); 
        pasteY = Math.round((finalHeight - imgHeight) / 2);
        return { finalWidth, finalHeight, pasteX, pasteY };
    }

    toggleWhiteBars() { 
        if (!this.currentImageObject) return;
        if (this.saveMode !== 'white_bars') { 
            if (this.splitModeState > 0) { 
                this.splitModeState = 0;
                this.splitLineBtn.classList.remove('active-crop-btn');
                this.splitLineBtn.textContent = "Mode Split";
                this.showSplitLineCount = 0;
            }
            this.saveMode = 'white_bars'; 
            this.aspectRatioSelect.value = '3:4'; 
            this.currentAspectRatioName = '3:4'; 
            this.aspectRatioSelect.disabled = true; 
            this.splitLineBtn.disabled = true;
            this.cropRectDisplay = null; 
            this.whiteBarsBtn.classList.add('active-crop-btn');
        } else { 
            this.saveMode = 'crop'; 
            this.aspectRatioSelect.disabled = (this.splitModeState > 0); 
            this.splitLineBtn.disabled = false;
            const currentSelectedRatio = this.aspectRatioSelect.value || '3:4'; 
            this.onRatioChanged(currentSelectedRatio);
            this.whiteBarsBtn.classList.remove('active-crop-btn');
        }
        this.redrawCanvasOnly();
        this.debouncedUpdatePreview();
    }
    
    async applyAndSaveCurrentImage() { 
        if (this.ignoreSaveForThisImage || !this.currentImageObject || this.currentImageIndex < 0) return;

        const currentImgInfoForCropper = this.imagesToCrop[this.currentImageIndex];
        const originalImageId = currentImgInfoForCropper.originalReferenceId; 
        const currentImageIdInJour = currentImgInfoForCropper.currentImageId; 
        const galleryIdForAPI = this.currentJourFrameInstance.galleryId;

        const saveCanvas = document.createElement('canvas');
        const saveCtx = saveCanvas.getContext('2d');
        let cropOperationsPayloads = []; 

        try {
            if (this.saveMode === 'white_bars') {
                const { finalWidth, finalHeight, pasteX, pasteY } = this.calculateWhiteBarDimensions();
                if (!finalWidth || !finalHeight) throw new Error("Invalid dimensions for white bars.");
                saveCanvas.width = finalWidth; saveCanvas.height = finalHeight;
                saveCtx.fillStyle = 'white'; saveCtx.fillRect(0, 0, finalWidth, finalHeight);
                this.drawFlippedIfNeeded(saveCtx, this.currentImageObject, pasteX, pasteY, this.currentImageObject.naturalWidth, this.currentImageObject.naturalHeight);
                const newDataURL = saveCanvas.toDataURL('image/jpeg', 0.92); 
                cropOperationsPayloads.push({ imageDataUrl: newDataURL, cropInfo: 'barres_3x4', filenameSuffix: 'barres_3x4' }); 

            } else if (this.saveMode === 'crop' && this.cropRectDisplay) {
                const { sx, sy, sWidth, sHeight } = this.getCropSourceCoordinates();
                if (sWidth <= 0 || sHeight <= 0) throw new Error("Invalid crop dimensions.");

                if (this.splitModeState === 1) { 
                    const sWidthLeft = Math.floor(sWidth / 2);
                    const sWidthRight = sWidth - sWidthLeft; 

                    if (sWidthLeft > 0) { 
                        saveCanvas.width = sWidthLeft; saveCanvas.height = sHeight;
                        this.drawFlippedIfNeeded(saveCtx, this.currentImageObject, 0,0, sWidthLeft, sHeight, sx, sy, sWidthLeft, sHeight);
                        cropOperationsPayloads.push({ imageDataUrl: saveCanvas.toDataURL('image/jpeg', 0.92), cropInfo: 'split_gauche_3x4', filenameSuffix: 'gauche_3x4' }); 
                    }
                    if (sWidthRight > 0) { 
                        saveCanvas.width = sWidthRight; saveCanvas.height = sHeight; saveCtx.clearRect(0,0, saveCanvas.width, saveCanvas.height);
                        this.drawFlippedIfNeeded(saveCtx, this.currentImageObject, 0,0, sWidthRight, sHeight, sx + sWidthLeft, sy, sWidthRight, sHeight);
                        cropOperationsPayloads.push({ imageDataUrl: saveCanvas.toDataURL('image/jpeg', 0.92), cropInfo: 'split_droite_3x4', filenameSuffix: 'droite_3x4' }); 
                    }
                } else if (this.splitModeState === 2) { 
                    const sWidthThird = Math.floor(sWidth / 3);
                    const sWidthLeft = sWidthThird;
                    const sWidthMid = sWidthThird;
                    const sWidthRight = sWidth - sWidthLeft - sWidthMid;

                    if (sWidthLeft > 0) {
                        saveCanvas.width = sWidthLeft; saveCanvas.height = sHeight; saveCtx.clearRect(0,0,saveCanvas.width,saveCanvas.height);
                        this.drawFlippedIfNeeded(saveCtx, this.currentImageObject, 0,0, sWidthLeft, sHeight, sx, sy, sWidthLeft, sHeight);
                        cropOperationsPayloads.push({ imageDataUrl: saveCanvas.toDataURL('image/jpeg', 0.92), cropInfo: 'split_gauche_3x4_sur3', filenameSuffix: 'g_3x4_3' }); 
                    }
                    if (sWidthMid > 0) {
                        saveCanvas.width = sWidthMid; saveCanvas.height = sHeight; saveCtx.clearRect(0,0,saveCanvas.width,saveCanvas.height);
                        this.drawFlippedIfNeeded(saveCtx, this.currentImageObject, 0,0, sWidthMid, sHeight, sx + sWidthLeft, sy, sWidthMid, sHeight);
                        cropOperationsPayloads.push({ imageDataUrl: saveCanvas.toDataURL('image/jpeg', 0.92), cropInfo: 'split_milieu_3x4_sur3', filenameSuffix: 'm_3x4_3' }); 
                    }
                    if (sWidthRight > 0) {
                        saveCanvas.width = sWidthRight; saveCanvas.height = sHeight; saveCtx.clearRect(0,0,saveCanvas.width,saveCanvas.height);
                        this.drawFlippedIfNeeded(saveCtx, this.currentImageObject, 0,0, sWidthRight, sHeight, sx + sWidthLeft + sWidthMid, sy, sWidthRight, sHeight);
                        cropOperationsPayloads.push({ imageDataUrl: saveCanvas.toDataURL('image/jpeg', 0.92), cropInfo: 'split_droite_3x4_sur3', filenameSuffix: 'd_3x4_3' }); 
                    }
                } else { 
                    saveCanvas.width = sWidth; saveCanvas.height = sHeight;
                    this.drawFlippedIfNeeded(saveCtx, this.currentImageObject, 0,0, sWidth, sHeight, sx, sy, sWidth, sHeight);
                    const suffix = this.currentAspectRatioName.replace(':','x'); 
                    cropOperationsPayloads.push({ imageDataUrl: saveCanvas.toDataURL('image/jpeg', 0.92), cropInfo: `recadre_${suffix}`, filenameSuffix: `rec_${suffix}` });
                }
            }

            if (cropOperationsPayloads.length > 0) {
                const backendResults = [];
                for (const opPayload of cropOperationsPayloads) {
                    const response = await fetch(`${BASE_API_URL}/api/galleries/${galleryIdForAPI}/images/${originalImageId}/crop`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(opPayload)
                    });
                    if (!response.ok) {
                        const errText = await response.text();
                        throw new Error(`Crop save to backend failed: ${response.statusText} - ${errText}`);
                    }
                    const newImageDoc = await response.json(); 
                    backendResults.push(newImageDoc);

                    if (!this.organizer.gridItemsDict[newImageDoc._id]) {
                        const newGridItem = new GridItemBackend(newImageDoc, this.organizer.currentThumbSize, this.organizer);
                        this.organizer.gridItems.push(newGridItem);
                        this.organizer.gridItemsDict[newImageDoc._id] = newGridItem;
                    }
                }
                this.modifiedDataMap[currentImageIdInJour] = backendResults.length === 1 ? backendResults[0] : backendResults;
                
                const savedNames = backendResults.map(doc => Utils.getFilenameFromURL(doc.filename)).join(', ');
                this.infoLabel.textContent = `Sauvegardé: ${savedNames}`;
            } else {
                this.infoLabel.textContent = `Aucun recadrage à sauvegarder.`;
            }
        } catch (e) {
            console.error("Error applying/saving image in cropper:", e);
            this.infoLabel.textContent = `Erreur sauvegarde: ${e.message}`;
        }
    }

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
            this.infoLabel.textContent = "Ceci est la première image.";
        }
    }
    
    getMousePos(event) { 
        const rect = this.canvasElement.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; 
    }
    
    getHandleAtPos(mouseX, mouseY) { 
        if (!this.cropRectDisplay) return null;
        const {x,y,width,height} = this.cropRectDisplay; const H_detect = this.handleDetectionOffset;
        if (mouseX >= x - H_detect && mouseX <= x + H_detect && mouseY >= y - H_detect && mouseY <= y + H_detect) return 'nw';
        if (mouseX >= x + width - H_detect && mouseX <= x + width + H_detect && mouseY >= y - H_detect && mouseY <= y + H_detect) return 'ne';
        if (mouseX >= x + width - H_detect && mouseX <= x + width + H_detect && mouseY >= y + height - H_detect && mouseY <= y + height + H_detect) return 'se';
        if (mouseX >= x - H_detect && mouseX <= x + H_detect && mouseY >= y + height - H_detect && mouseY <= y + height + H_detect) return 'sw';
        if (mouseX >= x + width/2 - H_detect && mouseX <= x + width/2 + H_detect && mouseY >= y - H_detect && mouseY <= y + H_detect) return 'n';
        if (mouseX >= x + width - H_detect && mouseX <= x + width + H_detect && mouseY >= y + height/2 - H_detect && mouseY <= y + height/2 + H_detect) return 'e';
        if (mouseX >= x + width/2 - H_detect && mouseX <= x + width/2 + H_detect && mouseY >= y + height - H_detect && mouseY <= y + height + H_detect) return 's';
        if (mouseX >= x - H_detect && mouseX <= x + H_detect && mouseY >= y + height/2 - H_detect && mouseY <= y + height/2 + H_detect) return 'w';
        return null;
    }

    onCanvasMouseMoveHover(event) { 
        if (this.isDragging || this.saveMode !== 'crop' || !this.currentImageObject || !this.cropRectDisplay) { if (!this.isDragging && this.saveMode !== 'crop') this.canvasElement.style.cursor = 'default'; return; }
        const mousePos = this.getMousePos(event), handle = this.getHandleAtPos(mousePos.x, mousePos.y);
        if (handle) this.canvasElement.style.cursor = `${handle}-resize`;
        else if (mousePos.x >= this.cropRectDisplay.x && mousePos.x <= this.cropRectDisplay.x + this.cropRectDisplay.width && mousePos.y >= this.cropRectDisplay.y && mousePos.y <= this.cropRectDisplay.y + this.cropRectDisplay.height) this.canvasElement.style.cursor = 'move';
        else this.canvasElement.style.cursor = 'crosshair';
    }
    
    onCanvasMouseDown(event) { 
        if (this.saveMode !== 'crop' || !this.currentImageObject || !this.cropRectDisplay) return;
        const mousePos = this.getMousePos(event); this.dragMode = this.getHandleAtPos(mousePos.x, mousePos.y);
        if (this.dragMode) { this.isDragging = true; this.canvasElement.style.cursor = `${this.dragMode}-resize`; }
        else if (mousePos.x >= this.cropRectDisplay.x && mousePos.x <= this.cropRectDisplay.x + this.cropRectDisplay.width && mousePos.y >= this.cropRectDisplay.y && mousePos.y <= this.cropRectDisplay.y + this.cropRectDisplay.height) { this.isDragging = true; this.dragMode = 'move'; this.canvasElement.style.cursor = 'move'; }
        else { this.isDragging = false; this.dragMode = null; return; }
        this.dragStart.x = mousePos.x; this.dragStart.y = mousePos.y; this.dragStart.cropX = this.cropRectDisplay.x; this.dragStart.cropY = this.cropRectDisplay.y; this.dragStart.cropW = this.cropRectDisplay.width; this.dragStart.cropH = this.cropRectDisplay.height;
    }

    onDocumentMouseMoveDrag(event) {
        if (!this.isDragging || this.saveMode !== 'crop' || !this.cropRectDisplay || !this.currentImageObject) return;
    
        const mousePos = this.getMousePos(event);
        const dx = mousePos.x - this.dragStart.x;
        const dy = mousePos.y - this.dragStart.y;
    
        const { displayX, displayY, displayWidth, displayHeight } = this.getImageDisplayDimensions();
        const minDim = this.handleSize * 1.5; 
    
        let newX = this.dragStart.cropX;
        let newY = this.dragStart.cropY;
        let newW = this.dragStart.cropW;
        let newH = this.dragStart.cropH;
    
        if (this.dragMode === 'move') {
            newX = Math.max(displayX, Math.min(this.dragStart.cropX + dx, displayX + displayWidth - newW));
            newY = Math.max(displayY, Math.min(this.dragStart.cropY + dy, displayY + displayHeight - newH));
        } else { 
            if (this.dragMode.includes('e')) newW = Math.max(minDim, this.dragStart.cropW + dx);
            if (this.dragMode.includes('w')) {
                const tempNewX = this.dragStart.cropX + dx;
                newW = Math.max(minDim, this.dragStart.cropW - dx);
                if (newW === minDim && this.dragStart.cropX + this.dragStart.cropW - tempNewX < minDim) {
                    newX = this.dragStart.cropX + this.dragStart.cropW - minDim;
                } else {
                    newX = tempNewX;
                }
            }
            if (this.dragMode.includes('s')) newH = Math.max(minDim, this.dragStart.cropH + dy);
            if (this.dragMode.includes('n')) {
                const tempNewY = this.dragStart.cropY + dy;
                newH = Math.max(minDim, this.dragStart.cropH - dy);
                 if (newH === minDim && this.dragStart.cropY + this.dragStart.cropH - tempNewY < minDim) {
                    newY = this.dragStart.cropY + this.dragStart.cropH - minDim;
                } else {
                    newY = tempNewY;
                }
            }
    
            newX = Math.max(displayX, Math.min(newX, displayX + displayWidth - minDim));
            newY = Math.max(displayY, Math.min(newY, displayY + displayHeight - minDim));
            newW = Math.min(newW, displayX + displayWidth - newX);
            newH = Math.min(newH, displayY + displayHeight - newY);
    
            if (this.dragMode.includes('w')) newX = Math.min(newX, this.dragStart.cropX + this.dragStart.cropW - minDim);
            if (this.dragMode.includes('n')) newY = Math.min(newY, this.dragStart.cropY + this.dragStart.cropH - minDim);


            if (this.currentAspectRatioName !== 'free') {
                let targetRatio;
                if (this.currentAspectRatioName === '6:4split') targetRatio = 6/4; 
                else if (this.currentAspectRatioName === '9:4doublesplit') targetRatio = 9/4; 
                else { const parts = this.currentAspectRatioName.split(':').map(Number); targetRatio = parts[0] / parts[1]; }
    
                if (this.dragMode.includes('e') || this.dragMode.includes('w')) { 
                    newH = newW / targetRatio;
                } else if (this.dragMode.includes('s') || this.dragMode.includes('n')) { 
                    newW = newH * targetRatio;
                } else { 
                     if (Math.abs(dx) > Math.abs(dy)) newH = newW / targetRatio;
                     else newW = newH * targetRatio;
                }
    
                if (this.dragMode.includes('n')) newY = this.dragStart.cropY + this.dragStart.cropH - newH;
                if (this.dragMode.includes('w')) newX = this.dragStart.cropX + this.dragStart.cropW - newW;
    
                newX = Math.max(displayX, Math.min(newX, displayX + displayWidth - newW));
                newY = Math.max(displayY, Math.min(newY, displayY + displayHeight - newH));
                newW = Math.min(newW, displayX + displayWidth - newX); 
                newH = Math.min(newH, displayY + displayHeight - newY); 
                
                if (Math.abs(newW / newH - targetRatio) > 0.01) { 
                    if (newW / targetRatio <= displayHeight - newY && newW / targetRatio >= minDim) {
                        newH = newW / targetRatio;
                    } else if (newH * targetRatio <= displayWidth - newX && newH * targetRatio >= minDim) {
                        newW = newH * targetRatio;
                    }
                }
            }

            newX = Math.max(displayX, Math.min(newX, displayX + displayWidth - minDim));
            newY = Math.max(displayY, Math.min(newY, displayY + displayHeight - minDim));
            newW = Math.max(minDim, Math.min(newW, displayX + displayWidth - newX));
            newH = Math.max(minDim, Math.min(newH, displayY + displayHeight - newY));
        }
    
        this.cropRectDisplay.x = Math.round(newX);
        this.cropRectDisplay.y = Math.round(newY);
        this.cropRectDisplay.width = Math.round(Math.max(minDim, newW));
        this.cropRectDisplay.height = Math.round(Math.max(minDim, newH));
    
        this.redrawCanvasOnly(); 
    }
    
    onDocumentMouseUp(event) { 
        if (this.isDragging) { 
            this.isDragging = false; 
            this.onCanvasMouseMoveHover(event); 
            if (this.saveMode === 'crop' && this.cropRectDisplay) {
                 this.adjustCropRectToAspectRatio(); 
                 this.redrawCanvasOnly(); 
                 this.debouncedUpdatePreview(); 
            }
        } 
    }
}
class DescriptionManager {
    constructor(organizerApp) {
        this.organizerApp = organizerApp;
        this.descriptionTabContent = document.getElementById('description');
        this.jourListElement = document.getElementById('descriptionJourList');
        this.editorTitleElement = document.getElementById('descriptionEditorTitle');
        this.editorContentElement = document.getElementById('descriptionEditorContent');
        this.editorPlaceholderElement = document.getElementById('descriptionEditorPlaceholder');
        this.descriptionTextElement = document.getElementById('descriptionText');
        this.descriptionHashtagsElement = document.getElementById('descriptionHashtags');
        this.saveDescriptionBtn = document.getElementById('saveDescriptionBtn');
        this.imagesPreviewBanner = document.getElementById('descriptionImagesPreview');
        
        this.currentSelectedJourFrame = null;

        this._initListeners();
    }

    _initListeners() {
        const autoSaveDescription = () => {
            if (this.currentSelectedJourFrame) {
                this.currentSelectedJourFrame.descriptionText = this.descriptionTextElement.value;
                this.currentSelectedJourFrame.descriptionHashtags = this.descriptionHashtagsElement.value;
                this.currentSelectedJourFrame.debouncedSave();
            }
        };

        this.descriptionTextElement.addEventListener('input', autoSaveDescription);
        this.descriptionHashtagsElement.addEventListener('input', autoSaveDescription);
    }

    show() {
        if (!app.currentGalleryId) {
            this.jourListElement.innerHTML = '<li>Chargez une galerie pour voir ses jours.</li>';
            this.editorContentElement.style.display = 'none';
            this.editorPlaceholderElement.textContent = "Aucune galerie chargée.";
            this.editorPlaceholderElement.style.display = 'block';
            this.editorTitleElement.textContent = "Description des Publications";
            return;
        }
        this.populateJourList();
        if (!this.currentSelectedJourFrame && this.organizerApp.jourFrames.length > 0) {
            this.selectJour(this.organizerApp.jourFrames[0]);
        } else if (this.currentSelectedJourFrame) {
            const stillExists = this.organizerApp.jourFrames.find(jf => jf.id === this.currentSelectedJourFrame.id);
            if (stillExists) {
                this.loadDescriptionForJour(this.currentSelectedJourFrame);
            } else { 
                this.clearEditor();
                if (this.organizerApp.jourFrames.length > 0) {
                    this.selectJour(this.organizerApp.jourFrames[0]);
                }
            }
        } else {
            this.clearEditor();
        }
    }

    populateJourList() {
        this.jourListElement.innerHTML = '';
        if (!this.organizerApp.jourFrames || this.organizerApp.jourFrames.length === 0) {
            this.jourListElement.innerHTML = '<li>Aucun jour défini pour cette galerie.</li>';
            this.clearEditor();
            return;
        }

        this.organizerApp.jourFrames.forEach(jourFrame => {
            const li = document.createElement('li');
            li.textContent = `Jour ${jourFrame.letter}`;
            li.dataset.jourId = jourFrame.id;
            li.addEventListener('click', () => this.selectJour(jourFrame));
            if (this.currentSelectedJourFrame && this.currentSelectedJourFrame.id === jourFrame.id) {
                li.classList.add('active-description-jour');
            }
            this.jourListElement.appendChild(li);
        });
    }

    selectJour(jourFrame) {
        this.currentSelectedJourFrame = jourFrame;
        
        this.jourListElement.querySelectorAll('li').forEach(li => {
            li.classList.remove('active-description-jour');
            if (li.dataset.jourId === jourFrame.id) {
                li.classList.add('active-description-jour');
            }
        });
        this.loadDescriptionForJour(jourFrame);
    }

    loadDescriptionForJour(jourFrame) {
        if (!jourFrame) {
            this.clearEditor();
            return;
        }
        this.editorTitleElement.textContent = `Description pour Jour ${jourFrame.letter}`;
        this.descriptionTextElement.value = jourFrame.descriptionText || '';
        this.descriptionHashtagsElement.value = jourFrame.descriptionHashtags || '';
        this.editorContentElement.style.display = 'block';
        this.editorPlaceholderElement.style.display = 'none';

        this.imagesPreviewBanner.innerHTML = '';
        if (jourFrame.imagesData && jourFrame.imagesData.length > 0) {
            jourFrame.imagesData.forEach(imgData => {
                const previewDiv = document.createElement('div');
                previewDiv.className = 'img-preview';
                const imgElement = document.createElement('img');
                imgElement.src = imgData.dataURL;
                previewDiv.appendChild(imgElement);
                this.imagesPreviewBanner.appendChild(previewDiv);
            });
            this.imagesPreviewBanner.style.display = 'flex';
        } else {
            this.imagesPreviewBanner.style.display = 'none';
        }
    }

    clearEditor() {
        this.editorTitleElement.textContent = "Sélectionnez un jour";
        this.descriptionTextElement.value = '';
        this.descriptionHashtagsElement.value = '';
        this.currentSelectedJourFrame = null;
        this.editorContentElement.style.display = 'none';
        this.editorPlaceholderElement.textContent = "Aucun jour sélectionné, ou la galerie n'a pas de jours.";
        this.editorPlaceholderElement.style.display = 'block';
        this.jourListElement.querySelectorAll('li.active-description-jour').forEach(li => li.classList.remove('active-description-jour'));
        if (this.imagesPreviewBanner) {
            this.imagesPreviewBanner.innerHTML = '';
            this.imagesPreviewBanner.style.display = 'none';
        }
    }
}
class CalendarPage {
    constructor(parentElement, organizerApp) {
        this.parentElement = parentElement;
        this.organizerApp = organizerApp;
        this.scheduleData = {}; 
        this.allUserJours = []; 

        this.currentDate = new Date(); 
        this.calendarGridElement = this.parentElement.querySelector('#calendarGrid');
        this.monthYearLabelElement = this.parentElement.querySelector('#monthYearLabel');
        
        this.contextPreviewModal = document.getElementById('calendarContextPreviewModal');
        this.contextPreviewTitle = document.getElementById('calendarContextTitle');
        this.contextPreviewImages = document.getElementById('calendarContextImages');

        this.runAutoScheduleBtn = document.getElementById('runAutoScheduleBtn');
        this.autoScheduleInfo = document.getElementById('auto-schedule-info');


        this.dragData = {}; 

        this._initUIListeners();
        this.debouncedChangeMonth = Utils.debounce(this.changeMonth.bind(this), 100); 
    }

    _initUIListeners() {
        this.parentElement.querySelector('#todayBtn').addEventListener('click', () => this.goToToday());
        
        this.calendarGridElement.addEventListener('wheel', (event) => {
            event.preventDefault(); 
            if (event.deltaY < 0) { 
                this.debouncedChangeMonth(-1);
            } else { 
                this.debouncedChangeMonth(1);
            }
        }, { passive: false });

        this.contextPreviewModal.addEventListener('mouseleave', (e) => {
            setTimeout(() => {
                 if (!this.contextPreviewModal.matches(':hover')) this._hideContextPreview();
            }, 100);
        });
        document.addEventListener('click', (e) => {
            if (this.contextPreviewModal.style.display === 'block' && 
                !this.contextPreviewModal.contains(e.target) &&
                !e.target.closest('.scheduled-item')) { 
                    this._hideContextPreview();
            }
        });

        this.runAutoScheduleBtn.addEventListener('click', () => this.runAutoSchedule());
    }

    goToToday() {
        this.currentDate = new Date();
        this.buildCalendarUI();
    }

    changeMonth(monthDelta) {
        this.currentDate.setDate(1); 
        this.currentDate.setMonth(this.currentDate.getMonth() + monthDelta);
        this.buildCalendarUI();
    }
    
    formatDateKey(dateObj) {
        const year = dateObj.getFullYear();
        const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
        const day = dateObj.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    buildCalendarUI() {
        this.calendarGridElement.innerHTML = ''; 
        if (!app.currentGalleryId && this.organizerApp) { 
            this.calendarGridElement.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; padding: 20px;">Chargez ou créez une galerie pour voir le calendrier.</p>';
            this.monthYearLabelElement.textContent = "Calendrier";
            return;
        }


        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth(); 

        this.monthYearLabelElement.textContent = `${this.currentDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`;

        const daysOfWeekFr = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
        daysOfWeekFr.forEach(dayName => {
            const headerCell = document.createElement('div');
            headerCell.className = 'calendar-header-cell';
            headerCell.textContent = dayName;
            this.calendarGridElement.appendChild(headerCell);
        });

        const firstDayOfMonth = new Date(year, month, 1);
        const lastDayOfMonth = new Date(year, month + 1, 0);
        
        let dayOfWeekOfFirst = firstDayOfMonth.getDay(); 
        if (dayOfWeekOfFirst === 0) dayOfWeekOfFirst = 7; 
        
        const daysInPrevMonth = (dayOfWeekOfFirst - 1);

        const today = new Date();
        today.setHours(0,0,0,0); 

        for (let i = 0; i < daysInPrevMonth; i++) {
            const prevMonthDay = new Date(year, month, 1 - (daysInPrevMonth - i));
            this.createDayCell(prevMonthDay, true, false, prevMonthDay < today);
        }

        for (let day = 1; day <= lastDayOfMonth.getDate(); day++) {
            const currentDateInLoop = new Date(year, month, day);
            this.createDayCell(currentDateInLoop, false, currentDateInLoop.getTime() === today.getTime(), currentDateInLoop < today && currentDateInLoop.getTime() !== today.getTime());
        }
        
        const totalCellsSoFar = daysInPrevMonth + lastDayOfMonth.getDate();
        const remainingCells = (7 - (totalCellsSoFar % 7)) % 7; 
        
        for (let i = 1; i <= remainingCells; i++) {
            const nextMonthDay = new Date(year, month + 1, i);
            this.createDayCell(nextMonthDay, true, false, nextMonthDay < today);
        }
    }
    
    createDayCell(dateObj, isOtherMonth, isToday = false, isPast = false) {
        const dayCell = document.createElement('div');
        dayCell.className = 'calendar-day-cell';
        if (isOtherMonth) dayCell.classList.add('other-month');
        if (isToday) dayCell.classList.add('today');
        if (isPast) dayCell.classList.add('past-day');

        const dayNumber = document.createElement('span');
        dayNumber.className = 'day-number';
        dayNumber.textContent = dateObj.getDate();
        dayCell.appendChild(dayNumber);
        
        const dateKey = this.formatDateKey(dateObj);
        dayCell.dataset.dateKey = dateKey;

        if (this.scheduleData[dateKey]) {
            const itemsOnDay = this.scheduleData[dateKey];
            const sortedLetters = Object.keys(itemsOnDay).sort();
            sortedLetters.forEach(letter => {
                const itemData = itemsOnDay[letter]; 
                const pubItemElement = document.createElement('div');
                pubItemElement.className = 'scheduled-item';
                
                const mainContentDiv = document.createElement('div'); 
                mainContentDiv.className = 'scheduled-item-main-content';

                const jourFrameInstance = this.organizerApp.jourFrames.find(jf => jf.letter === letter && jf.galleryId === itemData.galleryId);
                if (jourFrameInstance && jourFrameInstance.hasBeenProcessedByCropper) { 
                    const iconSpan = document.createElement('span');
                    iconSpan.className = 'scheduled-item-icon';
                    iconSpan.textContent = '✂️';
                    mainContentDiv.appendChild(iconSpan);
                }
                
                const textSpan = document.createElement('span'); 
                textSpan.className = 'scheduled-item-text';
                textSpan.textContent = itemData.label || `Jour ${letter}`;
                mainContentDiv.appendChild(textSpan);

                const thumbDiv = document.createElement('div');
                thumbDiv.className = 'scheduled-item-thumb';
                this.loadCalendarThumb(thumbDiv, letter, itemData.galleryId); 
                mainContentDiv.appendChild(thumbDiv);
                
                pubItemElement.appendChild(mainContentDiv);

                if (itemData.galleryName && itemData.galleryId !== this.organizerApp.currentGalleryId) {
                    const galleryNameSpan = document.createElement('span');
                    galleryNameSpan.className = 'scheduled-item-gallery-name';
                    galleryNameSpan.textContent = itemData.galleryName;
                    galleryNameSpan.title = itemData.galleryName;
                    pubItemElement.appendChild(galleryNameSpan);
                }


                const colorIndex = letter.charCodeAt(0) - 'A'.charCodeAt(0);
                pubItemElement.style.backgroundColor = JOUR_COLORS[colorIndex % JOUR_COLORS.length];
                pubItemElement.draggable = true;

                pubItemElement.dataset.jourLetter = letter;
                pubItemElement.dataset.dateStr = dateKey;
                pubItemElement.dataset.galleryId = itemData.galleryId; 


                pubItemElement.addEventListener('dragstart', (e) => this._onDragStart(e, dateKey, letter, itemData.galleryId, pubItemElement));
                pubItemElement.addEventListener('click', async (e) => { 
                    e.stopPropagation();
                    if (itemData.galleryId && itemData.galleryId !== 'unknown') { 
                        await this.organizerApp.handleLoadGallery(itemData.galleryId); 
                        const targetJourFrame = this.organizerApp.jourFrames.find(jf => jf.letter === letter && jf.galleryId === itemData.galleryId);
                        if (targetJourFrame) {
                            this.organizerApp.setCurrentJourFrame(targetJourFrame); 
                        }
                    }
                });
                pubItemElement.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    this._showContextPreview(e, letter, dateKey, itemData.galleryId);
                });

                dayCell.appendChild(pubItemElement);
            });
        }
        
        dayCell.addEventListener('dragover', (e) => {
             e.preventDefault();
             dayCell.classList.add('drag-over-day');
        });
        dayCell.addEventListener('dragleave', (e) => {
            dayCell.classList.remove('drag-over-day');
        });
        dayCell.addEventListener('drop', (e) => {
            dayCell.classList.remove('drag-over-day');
            this._onDrop(e, dateKey);
        });

        this.calendarGridElement.appendChild(dayCell);
    }

    async loadCalendarThumb(thumbElement, jourLetter, galleryIdForJour) {
        if (galleryIdForJour === this.organizerApp.currentGalleryId) {
            const jourFrame = this.organizerApp.jourFrames.find(jf => jf.letter === jourLetter);
            if (jourFrame && jourFrame.imagesData.length > 0) {
                thumbElement.style.backgroundImage = `url(${jourFrame.imagesData[0].dataURL})`;
            } else {
                thumbElement.textContent = "N/A";
            }
        } else {
            thumbElement.textContent = "?"; 
        }
    }
    
    _onDragStart(event, dateStr, letter, galleryId, itemElement) { 
        this.dragData = {
            sourceDateStr: dateStr,
            sourceLetter: letter,
            sourceGalleryId: galleryId, 
            sourceData: this.scheduleData[dateStr][letter] 
        };
        event.dataTransfer.setData("text/plain", `${dateStr}_${letter}_${galleryId}`); 
        event.dataTransfer.effectAllowed = "move";
        setTimeout(() => itemElement.classList.add('dragging-schedule-item'), 0); 
    }

    _onDrop(event, targetDateKey) {
        event.preventDefault();
        const draggedItem = document.querySelector('.dragging-schedule-item');
        if (draggedItem) draggedItem.classList.remove('dragging-schedule-item');

        if (!this.dragData.sourceDateStr) return; 

        const { sourceDateStr, sourceLetter, sourceGalleryId, sourceData } = this.dragData; 

        if (sourceDateStr === targetDateKey) { 
            this.dragData = {};
            this.buildCalendarUI(); 
            return;
        }

        delete this.scheduleData[sourceDateStr][sourceLetter];
        if (Object.keys(this.scheduleData[sourceDateStr]).length === 0) {
            delete this.scheduleData[sourceDateStr];
        }

        if (!this.scheduleData[targetDateKey]) {
            this.scheduleData[targetDateKey] = {};
        }
        this.scheduleData[targetDateKey][sourceLetter] = { ...sourceData, galleryId: sourceGalleryId }; 

        this.saveSchedule(); 
        this.buildCalendarUI(); 
        
        this.dragData = {};
    }

    async _showContextPreview(event, jourLetter, dateStr, galleryIdForJour) { 
        this.contextPreviewImages.innerHTML = ''; 
        this.contextPreviewTitle.textContent = `Aperçu Jour ${jourLetter} (${new Date(dateStr + 'T00:00:00').toLocaleDateString('fr-FR')})`;
        
        let imagesToPreviewURLs = [];
        if (galleryIdForJour === this.organizerApp.currentGalleryId) {
            const jourFrame = this.organizerApp.jourFrames.find(jf => jf.letter === jourLetter);
            if (jourFrame) {
                imagesToPreviewURLs = jourFrame.imagesData.slice(0, MAX_HOVER_PREVIEWS).map(imgData => imgData.dataURL);
            }
        } else {
            this.contextPreviewImages.innerHTML = '<p>Aperçu non disponible pour les galeries non chargées.</p>';
        }
        
        if (imagesToPreviewURLs.length > 0) {
            for (const thumbUrl of imagesToPreviewURLs) {
                const imgElement = document.createElement('img');
                imgElement.src = thumbUrl; 
                imgElement.style.maxWidth = `${CALENDAR_HOVER_THUMB_SIZE.width}px`;
                imgElement.style.maxHeight = `${CALENDAR_HOVER_THUMB_SIZE.height}px`;
                this.contextPreviewImages.appendChild(imgElement);
            }
        }

        this.contextPreviewModal.style.display = 'block';
        const modalRect = this.contextPreviewModal.getBoundingClientRect();
        let x = event.clientX + 15;
        let y = event.clientY + 10;
        if (x + modalRect.width > window.innerWidth) x = Math.max(5, window.innerWidth - modalRect.width - 5);
        if (y + modalRect.height > window.innerHeight) y = Math.max(5, window.innerHeight - modalRect.height - 5);
        this.contextPreviewModal.style.left = `${x}px`;
        this.contextPreviewModal.style.top = `${y}px`;
    }

    _hideContextPreview() {
        this.contextPreviewModal.style.display = 'none';
    }


    loadData(schedule, allJours) {
        this.scheduleData = schedule || {};
        this.allUserJours = allJours || [];
    }

    async saveSchedule() { 
        if (!app.currentGalleryId) {
            console.warn("Cannot save schedule: No current gallery ID.");
            return;
        }
        try {
            const response = await fetch(`${BASE_API_URL}/api/galleries/${app.currentGalleryId}/schedule`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.scheduleData) 
            });
            if (!response.ok) {
                throw new Error(`Failed to save schedule: ${response.statusText}`);
            }
            console.log("Schedule saved successfully for user.");
        } catch (e) {
            console.error("Error saving schedule data to backend:", e);
            alert("Erreur lors de la sauvegarde de la programmation."); 
        }
    }

    runAutoSchedule() {
        this.autoScheduleInfo.textContent = "Calcul en cours...";
        this.runAutoScheduleBtn.disabled = true;

        try {
            const mode = document.querySelector('input[name="autoScheduleMode"]:checked').value;
            const postsPerDay = parseInt(document.getElementById('autoSchedulePerDay').value) || 1;
            const everyXDays = parseInt(document.getElementById('autoScheduleEveryXDays').value) || 1;

            if (postsPerDay <= 0 || everyXDays <= 0) {
                throw new Error("Les valeurs de publication doivent être supérieures à zéro.");
            }

            const scheduledJourIdentifiers = new Set();
            Object.values(this.scheduleData).forEach(day => {
                Object.values(day).forEach(item => {
                    const letterMatch = item.label ? item.label.match(/Jour ([A-Z])/) : null;
                    const letter = letterMatch ? letterMatch[1] : Object.keys(day).find(k => day[k] === item);
                    if(letter && item.galleryId) {
                       scheduledJourIdentifiers.add(`${item.galleryId}-${letter}`);
                    }
                });
            });

            let unpublishedJours = this.allUserJours.filter(jour => 
                !scheduledJourIdentifiers.has(`${jour.galleryId}-${jour.letter}`) && this.organizerApp.isJourReadyForPublishing(jour.galleryId, jour.letter)
            );

            if (unpublishedJours.length === 0) {
                this.autoScheduleInfo.textContent = "Tous les jours publiables sont déjà planifiés !";
                setTimeout(() => this.autoScheduleInfo.textContent = "", 3000);
                return;
            }

            if (mode === 'chrono') {
                unpublishedJours.sort((a, b) => {
                    const galleryCompare = a.galleryName.localeCompare(b.galleryName);
                    if (galleryCompare !== 0) return galleryCompare;
                    return a.letter.localeCompare(b.letter);
                });
            } else if (mode === 'interlaced') {
                const groupedByGallery = unpublishedJours.reduce((acc, jour) => {
                    (acc[jour.galleryId] = acc[jour.galleryId] || []).push(jour);
                    return acc;
                }, {});
                
                for (const galleryId in groupedByGallery) {
                    groupedByGallery[galleryId].sort((a, b) => a.letter.localeCompare(b.letter));
                }
                
                const interlaced = [];
                const galleryQueues = Object.values(groupedByGallery);
                let maxLen = Math.max(...galleryQueues.map(q => q.length));

                for (let i = 0; i < maxLen; i++) {
                    for (const queue of galleryQueues) {
                        if (queue[i]) {
                            interlaced.push(queue[i]);
                        }
                    }
                }
                unpublishedJours = interlaced;

            } else if (mode === 'random') {
                for (let i = unpublishedJours.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [unpublishedJours[i], unpublishedJours[j]] = [unpublishedJours[j], unpublishedJours[i]];
                }
            }
            
            let currentDate = new Date();
            currentDate.setHours(0, 0, 0, 0); 
            let joursPlaced = 0;

            while (unpublishedJours.length > 0) {
                const dateKey = this.formatDateKey(currentDate);
                let postsOnThisDay = this.scheduleData[dateKey] ? Object.keys(this.scheduleData[dateKey]).length : 0;
                
                while(postsOnThisDay < postsPerDay && unpublishedJours.length > 0) {
                    const jourToPlace = unpublishedJours.shift();
                    if (!this.scheduleData[dateKey]) {
                        this.scheduleData[dateKey] = {};
                    }
                    this.scheduleData[dateKey][jourToPlace.letter] = {
                        galleryId: jourToPlace.galleryId,
                        galleryName: jourToPlace.galleryName,
                        label: `Jour ${jourToPlace.letter}`
                    };
                    postsOnThisDay++;
                    joursPlaced++;
                }

                if (postsOnThisDay > 0 || everyXDays > 1) {
                     currentDate.setDate(currentDate.getDate() + everyXDays);
                } else {
                     currentDate.setDate(currentDate.getDate() + 1);
                }
            }

            this.autoScheduleInfo.textContent = `${joursPlaced} jour(s) planifié(s).`;
            this.saveSchedule();
            this.buildCalendarUI();

        } catch (error) {
            console.error("Erreur de planification auto:", error);
            this.autoScheduleInfo.textContent = `Erreur: ${error.message}`;
        } finally {
            this.runAutoScheduleBtn.disabled = false;
            setTimeout(() => this.autoScheduleInfo.textContent = "", 5000);
        }
    }
}

class PublicationOrganizer {
    constructor() {
        this.currentGalleryId = null; 
        this.currentThumbSize = { width: 200, height: 200 }; 
        this.minThumbSize = { width: 50, height: 50 };
        this.maxThumbSize = { width: 300, height: 300 };
        this.zoomStep = 25;

        this.gridItems = []; 
        this.gridItemsDict = {}; 
        this.jourFrames = []; 
        this.currentJourFrame = null;
        this.nextJourIndex = 0; 
        this.galleryCache = {}; 
        this.activeUploadXHR = null; 
        this.activeCallingButton = null;

        this.scheduleContext = { schedule: {}, allUserJours: [] };

        this.imageSelectorInput = document.getElementById('imageSelector'); 
        this.addNewImagesBtn = document.getElementById('addNewImagesBtn');
        this.addPhotosPlaceholderBtn = document.getElementById('addPhotosPlaceholderBtn');
        this.imageGridElement = document.getElementById('imageGrid');
        this.zoomOutBtn = document.getElementById('zoomOutBtn');
        this.zoomInBtn = document.getElementById('zoomInBtn');
        this.sortOptionsSelect = document.getElementById('sortOptions');
        this.clearGalleryImagesBtn = document.getElementById('clearGalleryImagesBtn');
        
        this.statsArea = document.getElementById('statsArea');
        this.statsLabelText = document.getElementById('statsLabelText');
        
        this.galleriesUploadProgressContainer = document.getElementById('galleriesUploadProgressContainer');
        this.galleriesUploadProgressText = document.getElementById('galleriesUploadProgressText');
        this.galleriesUploadProgressBarInner = document.getElementById('galleriesUploadProgressBarInner');

        this.currentGalleryUploadProgressContainer = document.getElementById('currentGalleryUploadProgressContainer');
        this.currentGalleryUploadProgressText = document.getElementById('currentGalleryUploadProgressText');
        this.currentGalleryUploadProgressBarInner = document.getElementById('currentGalleryUploadProgressBarInner');

        this.jourFramesContainer = document.getElementById('jourFramesContainer');
        this.addJourFrameBtn = document.getElementById('addJourFrameBtn');
        
        this.galleriesTabContent = document.getElementById('galleries');
        this.galleriesListElement = document.getElementById('galleriesList');
        this.createNewGalleryBtn = document.getElementById('createNewGalleryBtn');
        this.newGalleryForm = document.getElementById('newGalleryForm'); 
        this.newGalleryNameInput = document.getElementById('newGalleryNameInput');
        this.confirmNewGalleryBtn = document.getElementById('confirmNewGalleryBtn');
        this.cancelNewGalleryBtn = document.getElementById('cancelNewGalleryBtn');

        this.galleryPreviewArea = document.getElementById('galleryPreviewArea');
        this.galleryPreviewHeader = document.getElementById('galleryPreviewHeader');
        this.galleryPreviewNameElement = document.getElementById('galleryPreviewName');
        this.galleryPreviewGridElement = document.getElementById('galleryPreviewGrid');
        this.galleryPreviewPlaceholder = document.getElementById('galleryPreviewPlaceholder');
        this.openGalleryInEditorBtn = document.getElementById('openGalleryInEditorBtn');
        this.selectedGalleryForPreviewId = null;

        this.tabs = document.querySelectorAll('.tab-button');
        this.tabContents = document.querySelectorAll('.tab-content');

        this.cropper = new ImageCropperPopup(this); 
        this.calendarPage = null;
        this.descriptionManager = null; 

        this._initListeners();
        this.updateAddPhotosPlaceholderVisibility();
        this.updateUIToNoGalleryState(); 
    }

    _initListeners() {
        this.newGalleryForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleCreateNewGallery();
        });
        this.imageSelectorInput.addEventListener('change', (event) => {
            let targetGalleryId = null;

            if (document.getElementById('galleries').classList.contains('active') && this.selectedGalleryForPreviewId) {
                targetGalleryId = this.selectedGalleryForPreviewId;
                if (!this.activeCallingButton) {
                    const previewAddBtn = this.galleryPreviewGridElement.querySelector('.add-photos-preview-btn');
                    this.activeCallingButton = previewAddBtn || this.openGalleryInEditorBtn;
                }
            } 
            else if (document.getElementById('currentGallery').classList.contains('active') && this.currentGalleryId) {
                targetGalleryId = this.currentGalleryId;
                 if (!this.activeCallingButton) {
                    this.activeCallingButton = this.addNewImagesBtn.style.display !== 'none' ? this.addNewImagesBtn : this.addPhotosPlaceholderBtn;
                 }
            }
            
            if (targetGalleryId) {
                this.handleFileSelection(event.target.files, targetGalleryId);
            } else {
                alert("Veuillez sélectionner une galerie dans l'onglet 'Galeries' (cliquez sur son nom pour la prévisualiser) ou charger une galerie dans 'Galerie en cours' avant d'ajouter des images.");
                this.imageSelectorInput.value = ""; 
                if (this.activeCallingButton) this.activeCallingButton.disabled = false;
                this.activeCallingButton = null;
            }
        });

        this.addNewImagesBtn.addEventListener('click', () => {
             if (!this.currentGalleryId) { alert("Veuillez d'abord charger ou créer une galerie."); return; }
             this.activeCallingButton = this.addNewImagesBtn; 
             this.imageSelectorInput.click()
        });
        this.addPhotosPlaceholderBtn.addEventListener('click', () => {
             if (!this.currentGalleryId) { alert("Veuillez d'abord charger ou créer une galerie."); return; }
             this.activeCallingButton = this.addPhotosPlaceholderBtn; 
            this.imageSelectorInput.click()
        });

        this.zoomOutBtn.addEventListener('click', () => this.zoomOut());
        this.zoomInBtn.addEventListener('click', () => this.zoomIn());
        this.sortOptionsSelect.addEventListener('change', () => this.sortGridItemsAndReflow());
        this.clearGalleryImagesBtn.addEventListener('click', () => this.clearAllGalleryImages());
        this.addJourFrameBtn.addEventListener('click', () => this.addJourFrame()); 

        this.createNewGalleryBtn.addEventListener('click', () => {
            this.newGalleryForm.style.display = this.newGalleryForm.style.display === 'none' ? 'flex' : 'none';
            this.newGalleryNameInput.value = ''; 
            this.newGalleryNameInput.focus();
        });
        this.cancelNewGalleryBtn.addEventListener('click', () => {
            this.newGalleryForm.style.display = 'none';
            this.newGalleryNameInput.value = '';
        });
        this.openGalleryInEditorBtn.addEventListener('click', () => {
            if (this.selectedGalleryForPreviewId) {
                this.handleLoadGallery(this.selectedGalleryForPreviewId);
            }
        });

        this.tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                this.activateTab(tab.dataset.tab); 
                this.saveAppState(); 
            });
        });
    }
    
    updateUIToNoGalleryState() {
        const noGalleryActive = !this.currentGalleryId;
        
        this.createNewGalleryBtn.disabled = false; 
        
        const currentGalleryTabContent = document.getElementById('currentGallery');
        currentGalleryTabContent.querySelectorAll('button, select, input[type="file"]').forEach(el => {
            if (el.id !== 'imageSelector') el.disabled = noGalleryActive; 
        });

        if (noGalleryActive) {
            this.imageGridElement.innerHTML = '<p style="text-align:center; margin-top:20px;">Chargez ou créez une galerie pour voir les images.</p>';
            this.jourFramesContainer.innerHTML = '<p style="text-align:center;">Chargez ou créez une galerie pour gérer les jours.</p>';
            this.addPhotosPlaceholderBtn.style.display = 'none';
            this.statsLabelText.textContent = "Aucune galerie chargée";
            if(this.currentGalleryUploadProgressContainer) this.currentGalleryUploadProgressContainer.style.display = 'none';
        } else {
            this.updateAddPhotosPlaceholderVisibility(); 
        }

        const calendarTab = document.getElementById('calendar');
        const calendarSidebar = calendarTab.querySelector('#calendar-sidebar');
        const calendarMain = calendarTab.querySelector('#calendar-main-content');
        
        if (calendarSidebar) {
            calendarSidebar.querySelectorAll('button, input, select').forEach(el => el.disabled = noGalleryActive);
        }
        if (calendarMain) {
            calendarMain.querySelectorAll('button').forEach(el => el.disabled = noGalleryActive);
        }

        if (this.calendarPage) {
             if (noGalleryActive) {
                this.calendarPage.loadData({}, []); 
                this.calendarPage.monthYearLabelElement.textContent = "Calendrier";
                this.calendarPage.calendarGridElement.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; padding: 20px;">Chargez ou créez une galerie pour voir le calendrier.</p>';
            } else {
                this.calendarPage.buildCalendarUI(); 
            }
        }

        const descriptionTabContent = document.getElementById('description');
        descriptionTabContent.querySelectorAll('button, textarea').forEach(el => {
            if (el.id !== 'saveDescriptionBtn') {
                el.disabled = noGalleryActive;
            }
        });
        if (this.descriptionManager) {
            if (noGalleryActive) {
                this.descriptionManager.clearEditor();
                this.descriptionManager.populateJourList(); 
            } else if (descriptionTabContent.classList.contains('active')) {
                this.descriptionManager.show(); 
            }
        }


        if (noGalleryActive && !document.getElementById('galleries').classList.contains('active')) {
             this.activateTab('galleries');
        }
    }
    
    activateTab(tabId) {
        this.tabs.forEach(t => t.classList.remove('active'));
        this.tabContents.forEach(tc => tc.classList.remove('active'));
        
        const tabButton = document.querySelector(`.tab-button[data-tab="${tabId}"]`);
        const tabContent = document.getElementById(tabId);

        if (tabButton && tabContent) {
            tabButton.classList.add('active');
            tabContent.classList.add('active');

            if (tabId === 'galleries') {
                this.loadGalleriesList();
                if (!this.selectedGalleryForPreviewId) {
                    this.clearGalleryPreview();
                }
            } else if (tabId === 'currentGallery' && !this.currentGalleryId) {
            } else if (tabId === 'description') {
                if (!this.descriptionManager) {
                    this.descriptionManager = new DescriptionManager(this);
                }
                if (this.currentGalleryId) {
                    this.descriptionManager.show();
                } else {
                    this.descriptionManager.clearEditor();
                    this.descriptionManager.populateJourList();
                }
            } else if (tabId === 'calendar') {
                if (!this.calendarPage) {
                    this.calendarPage = new CalendarPage(tabContent, this);
                }
                 if (this.currentGalleryId) {
                    this.calendarPage.loadData(this.scheduleContext.schedule, this.scheduleContext.allUserJours);
                    this.calendarPage.buildCalendarUI(); 
                }
            }
        } else { 
            this.tabs[0]?.classList.add('active');
            const firstTabId = this.tabs[0]?.dataset.tab;
            if (firstTabId) {
                 document.getElementById(firstTabId)?.classList.add('active');
                 if (firstTabId === 'galleries') this.loadGalleriesList(); 
            }
        }
        this.updateUIToNoGalleryState(); 
    }

    async loadGalleriesList() {
        this.galleriesListElement.innerHTML = '<li>Chargement des galeries...</li>';
        try {
            const response = await fetch(`${BASE_API_URL}/api/galleries?sort=name_asc`);
            if (!response.ok) throw new Error(`Erreur HTTP: ${response.status}`);
            const galleries = await response.json();
            
            this.galleryCache = {}; 
            galleries.forEach(g => this.galleryCache[g._id] = g.name);


            this.galleriesListElement.innerHTML = ''; 
            if (galleries.length === 0) {
                this.galleriesListElement.innerHTML = '<li>Aucune galerie. Créez-en une !</li>';
                this.clearGalleryPreview(); 
                this.updateUIToNoGalleryState(); 
                return;
            }

            galleries.forEach(gallery => {
                const li = document.createElement('li');
                li.className = 'gallery-list-item';
                li.dataset.galleryId = gallery._id;
                if (gallery._id === this.selectedGalleryForPreviewId) { 
                    li.classList.add('selected-for-preview');
                }

                const nameSpan = document.createElement('span');
                nameSpan.className = 'gallery-name';
                nameSpan.textContent = gallery.name || `Galerie (ID: ...${gallery._id.slice(-6)})`;
                if (gallery._id === this.currentGalleryId) {
                    nameSpan.classList.add('current-loaded-gallery');
                    nameSpan.title = "Galerie actuellement chargée dans l'éditeur";
                }
                nameSpan.onclick = () => this.showGalleryPreview(gallery._id, gallery.name); 

                const actionsDiv = document.createElement('div');
                actionsDiv.className = 'gallery-actions';

                const loadBtn = document.createElement('button');
                loadBtn.textContent = 'Charger';
                loadBtn.title = "Charger cette galerie dans l'éditeur principal";
                loadBtn.onclick = () => this.handleLoadGallery(gallery._id);

                const renameBtn = document.createElement('button');
                renameBtn.textContent = 'Renommer';
                renameBtn.onclick = () => this.handleRenameGallery(gallery._id, gallery.name);
                
                const deleteBtn = document.createElement('button');
                deleteBtn.textContent = 'Supprimer';
                deleteBtn.className = 'danger-btn-small';
                deleteBtn.onclick = () => this.handleDeleteGallery(gallery._id, gallery.name);

                actionsDiv.appendChild(loadBtn);
                actionsDiv.appendChild(renameBtn);
                actionsDiv.appendChild(deleteBtn);
                li.appendChild(nameSpan);
                li.appendChild(actionsDiv);
                this.galleriesListElement.appendChild(li);
            });

        } catch (error) {
            console.error("Erreur lors du chargement de la liste des galeries:", error);
            this.galleriesListElement.innerHTML = `<li>Erreur de chargement: ${error.message}</li>`;
            this.clearGalleryPreview(); 
        }
    }

    async showGalleryPreview(galleryId, galleryName) {
        this.selectedGalleryForPreviewId = galleryId;
        this.galleryPreviewPlaceholder.style.display = 'none';
        this.galleryPreviewHeader.style.display = 'flex';
        this.galleryPreviewNameElement.textContent = galleryName;
        this.galleryPreviewGridElement.innerHTML = '<p>Chargement des images...</p>';
        this.galleriesUploadProgressContainer.style.display = 'none'; 

        this.galleriesListElement.querySelectorAll('.gallery-list-item').forEach(item => {
            item.classList.remove('selected-for-preview');
            if (item.dataset.galleryId === galleryId) {
                item.classList.add('selected-for-preview');
            }
        });
        
        try {
            const response = await fetch(`${BASE_API_URL}/api/galleries/${galleryId}`);
            if (!response.ok) throw new Error(`Erreur HTTP: ${response.status}`);
            const galleryDetails = await response.json();
            
            this.galleryCache[galleryId] = galleryDetails.galleryState.name;

            this.galleryPreviewGridElement.innerHTML = '';
            if (galleryDetails.images && galleryDetails.images.length > 0) {
                galleryDetails.images.forEach(imgData => {
                    const itemDiv = document.createElement('div');
                    itemDiv.className = 'grid-item preview-grid-item'; 
                    itemDiv.style.width = `${PREVIEW_WIDTH}px`;
                    itemDiv.style.height = `${PREVIEW_HEIGHT}px`;

                    const imgElement = document.createElement('img');
                    imgElement.src = `${BASE_API_URL}/api/uploads/${imgData.galleryId}/${Utils.getFilenameFromURL(imgData.thumbnailPath)}`;
                    imgElement.alt = imgData.originalFilename;
                    imgElement.style.maxWidth = '100%';
                    imgElement.style.maxHeight = '100%';
                    imgElement.style.objectFit = 'contain';

                    const deleteBtnPreview = document.createElement('button');
                    deleteBtnPreview.className = 'grid-item-delete-btn preview-delete-btn'; 
                    deleteBtnPreview.innerHTML = '&times;';
                    deleteBtnPreview.title = "Supprimer cette image de la galerie";
                    deleteBtnPreview.onclick = (e) => {
                        e.stopPropagation();
                        
                        this.handleDeleteImageFromPreview(galleryId, imgData._id, imgData.originalFilename);
                    };
                    
                    itemDiv.appendChild(imgElement);
                    itemDiv.appendChild(deleteBtnPreview); 
                    this.galleryPreviewGridElement.appendChild(itemDiv);
                });
            } else {
                const addPhotosBtn = document.createElement('button');
                addPhotosBtn.innerHTML = '<img src="assets/add-button.png" alt="Icône ajouter" class="btn-icon"> Ajouter des Photos'; 
                addPhotosBtn.className = 'add-photos-preview-btn';
                addPhotosBtn.onclick = () => {
                    if (this.selectedGalleryForPreviewId) {
                        this.activeCallingButton = addPhotosBtn; 
                        this.imageSelectorInput.click();
                    } else {
                        alert("Erreur: Aucune galerie sélectionnée pour l'aperçu.");
                    }
                };
                this.galleryPreviewGridElement.appendChild(addPhotosBtn);
            }

        } catch (error) {
            console.error("Erreur lors du chargement de l'aperçu de la galerie:", error);
            this.galleryPreviewGridElement.innerHTML = `<p>Erreur: ${error.message}</p>`;
        }
    }
    
    async handleDeleteImageFromPreview(previewGalleryId, imageId, imageNameForConfirm) {
        if (!confirm(`Voulez-vous vraiment supprimer l'image "${imageNameForConfirm}" de la galerie "${this.galleryCache[previewGalleryId] || previewGalleryId}" ?\nCeci affectera aussi les Jours et le Calendrier si l'image y est utilisée.`)) {
            return;
        }
        try {
            const response = await fetch(`${BASE_API_URL}/api/galleries/${previewGalleryId}/images/${imageId}`, {
                method: 'DELETE'
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Échec de la suppression (preview): ${response.statusText} - ${errorText}`);
            }
            const result = await response.json();
            console.log(result.message);

            await this.showGalleryPreview(previewGalleryId, this.galleryCache[previewGalleryId] || "Galerie");

            if (previewGalleryId === this.currentGalleryId) {
                result.deletedImageIds.forEach(idToDelete => {
                    const itemInGrid = this.gridItemsDict[idToDelete];
                    if (itemInGrid) {
                        itemInGrid.element.remove();
                        this.gridItems = this.gridItems.filter(item => item.id !== idToDelete);
                        delete this.gridItemsDict[idToDelete];
                    }
                    this.jourFrames.forEach(jf => jf.removeImageByActualId(idToDelete));
                });
                this.updateGridUsage();
                this.updateStatsLabel();
                this.updateAddPhotosPlaceholderVisibility();
            }
        } catch (error) {
            console.error("Error deleting image from preview:", error);
            alert(`Erreur lors de la suppression de l'image (preview) : ${error.message}`);
        }
    }

    clearGalleryPreview() {
        this.selectedGalleryForPreviewId = null;
        this.galleryPreviewPlaceholder.style.display = 'block';
        this.galleryPreviewHeader.style.display = 'none';
        this.galleryPreviewGridElement.innerHTML = '';
        if (this.galleriesUploadProgressContainer) this.galleriesUploadProgressContainer.style.display = 'none';
        this.galleriesListElement.querySelectorAll('.gallery-list-item.selected-for-preview').forEach(item => {
            item.classList.remove('selected-for-preview');
        });
    }

    async handleCreateNewGallery() {
        const galleryName = this.newGalleryNameInput.value.trim() || `Galerie du ${new Date().toLocaleDateString('fr-FR')}`; 
        this.newGalleryForm.style.display = 'none';
        this.newGalleryNameInput.value = '';

        try {
            const response = await fetch(`${BASE_API_URL}/api/galleries`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: galleryName }) 
            });
            if (!response.ok) throw new Error(`Erreur HTTP: ${response.status} - ${await response.text()}`);
            const newGallery = await response.json();
            
            this.galleryCache[newGallery._id] = newGallery.name; 

            await this.loadGalleriesList(); 
            this.showGalleryPreview(newGallery._id, newGallery.name); 

            if (!this.currentGalleryId) {
                 this.handleLoadGallery(newGallery._id);
            } else {
                 this.activateTab('galleries'); 
            }
            this.updateUIToNoGalleryState(); 
        } catch (error) {
            console.error("Erreur lors de la création de la galerie:", error);
            alert(`Impossible de créer la galerie: ${error.message}`);
        }
    }
    
    async handleLoadGallery(galleryId) {
        if (this.currentGalleryId === galleryId && document.getElementById('currentGallery').classList.contains('active')) {
            this.activateTab('currentGallery'); 
            return;
        }
        
        if(this.currentGalleryId && this.currentGalleryId !== galleryId) {
            await this.saveAppState(); 
        }

        this.currentGalleryId = galleryId;
        localStorage.setItem('publicationOrganizer_lastGalleryId', this.currentGalleryId);
        
        this.gridItems = [];
        this.gridItemsDict = {};
        this.imageGridElement.innerHTML = '';
        this.jourFrames = [];
        this.jourFramesContainer.innerHTML = '';
        this.currentJourFrame = null;

        this.scheduleContext = { schedule: {}, allUserJours: [] };
        
        if (this.descriptionManager) {
            this.descriptionManager.clearEditor();
        }

        if(this.galleriesUploadProgressContainer) this.galleriesUploadProgressContainer.style.display = 'none';
        if(this.currentGalleryUploadProgressContainer) this.currentGalleryUploadProgressContainer.style.display = 'none';

        await this.loadState(); 
        this.activateTab('currentGallery'); 
        await this.loadGalleriesList(); 
        this.updateUIToNoGalleryState(); 
    }

    async loadState() {
        if (!this.currentGalleryId) {
            this.updateUIToNoGalleryState();
            return;
        }

        const loadingOverlay = document.getElementById('loadingOverlay');
        loadingOverlay.style.display = 'flex';
        loadingOverlay.querySelector('p').textContent = 'Chargement de la galerie...';

        try {
            const response = await fetch(`${BASE_API_URL}/api/galleries/${this.currentGalleryId}`);
            if (!response.ok) {
                 if (response.status === 404) { 
                    alert("La dernière galerie utilisée n'a pas été trouvée.");
                    this.currentGalleryId = null; 
                    localStorage.removeItem('publicationOrganizer_lastGalleryId'); 
                    await startApp();
                    return; 
                 }
                 throw new Error(`Failed to load gallery: ${response.statusText}`);
            }
            const data = await response.json();
            
            const { galleryState, images, jours, schedule, scheduleContext } = data;
            
            this.galleryCache[this.currentGalleryId] = galleryState.name; 
            this.currentThumbSize = galleryState.currentThumbSize || { width: 200, height: 200 };
            this.sortOptionsSelect.value = galleryState.sortOption || 'date_desc';
            this.nextJourIndex = typeof galleryState.nextJourIndex === 'number' ? galleryState.nextJourIndex : 0;

            this.imageGridElement.innerHTML = ''; this.gridItems = []; this.gridItemsDict = {};
            if (images) { this.addImagesToGrid(images); }

            this.jourFramesContainer.innerHTML = ''; this.jourFrames = [];
            if (jours) {
                 jours.forEach(jourData => { 
                    const jf = new JourFrameBackend(this, jourData);
                    this.jourFramesContainer.appendChild(jf.element);
                    this.jourFrames.push(jf);
                 });
                 this.jourFrames.sort((a,b) => a.index - b.index);
                 this.recalculateNextJourIndex(); 
                 if(this.jourFrames.length > 0 && !this.currentJourFrame) {
                    this.setCurrentJourFrame(this.jourFrames[0]); 
                 }
            }

            this.scheduleContext = {
                schedule: schedule || {},
                allUserJours: scheduleContext.allUserJours || []
            };
            if (this.calendarPage) { 
                this.calendarPage.loadData(this.scheduleContext.schedule, this.scheduleContext.allUserJours);
            }

            const savedActiveTab = galleryState.activeTab;
            this.activateTab(savedActiveTab && document.getElementById(savedActiveTab) ? savedActiveTab : 'currentGallery');
            
            this.updateAddPhotosPlaceholderVisibility();
            this.sortGridItemsAndReflow();
            this.updateGridUsage(); 
            this.updateGridItemStyles();
            this.updateUIToNoGalleryState(); 

        } catch (error) {
            console.error("Error loading state from backend:", error);
            loadingOverlay.querySelector('p').innerHTML = `Erreur de chargement: ${error.message}<br/>Veuillez rafraîchir.`;
            return;
        } finally {
            loadingOverlay.style.display = 'none';
        }
    }

    async handleRenameGallery(galleryId, currentName) {
        const newName = prompt(`Entrez le nouveau nom pour la galerie "${currentName}":`, currentName);
        if (newName && newName.trim() !== '' && newName !== currentName) {
            try {
                const response = await fetch(`${BASE_API_URL}/api/galleries/${galleryId}/state`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: newName.trim() })
                });
                if (!response.ok) throw new Error(`Erreur HTTP: ${response.status}`);
                this.galleryCache[galleryId] = newName.trim(); 

                await this.loadGalleriesList(); 
                if (this.selectedGalleryForPreviewId === galleryId) { 
                    this.showGalleryPreview(galleryId, newName.trim());
                }
            } catch (error) {
                console.error("Erreur lors du renommage de la galerie:", error);
                alert(`Impossible de renommer la galerie: ${error.message}`);
            }
        }
    }
    
    async handleDeleteGallery(galleryId, galleryName) {
        if (!confirm(`Êtes-vous sûr de vouloir supprimer la galerie "${galleryName || galleryId}" et toutes ses données (images, jours, calendrier) ?\nCETTE ACTION EST IRRÉVERSIBLE.`)) {
            return;
        }
        try {
            const response = await fetch(`${BASE_API_URL}/api/galleries/${galleryId}`, { method: 'DELETE' });
            if (!response.ok) throw new Error(`Erreur HTTP: ${response.status} - ${await response.text()}`);
            
            delete this.galleryCache[galleryId]; 

            if (this.selectedGalleryForPreviewId === galleryId) { 
                this.clearGalleryPreview();
            }
            
            const wasCurrentGallery = (this.currentGalleryId === galleryId);
            if (wasCurrentGallery) {
                this.currentGalleryId = null;
                localStorage.removeItem('publicationOrganizer_lastGalleryId');
                
                this.gridItems = [];
                this.gridItemsDict = {};
                this.imageGridElement.innerHTML = '';
                this.jourFrames = [];
                this.jourFramesContainer.innerHTML = '';
                this.currentJourFrame = null;
                this.nextJourIndex = 0;
                this.scheduleContext = { schedule: {}, allUserJours: [] };
                if (this.descriptionManager) this.descriptionManager.clearEditor();
            }

            await this.loadGalleriesList(); 
            
            const galleryListItems = this.galleriesListElement.querySelectorAll('li');
            const noGalleriesLeft = galleryListItems.length === 0 || (galleryListItems.length === 1 && galleryListItems[0].textContent.includes("Aucune galerie"));

            if (noGalleriesLeft) {
                 this.currentGalleryId = null; 
                 localStorage.removeItem('publicationOrganizer_lastGalleryId');
                 this.activateTab('galleries');
            } else if (wasCurrentGallery) {
                this.activateTab('galleries'); 
            }
            this.updateUIToNoGalleryState(); 

        } catch (error) {
            console.error("Erreur lors de la suppression de la galerie:", error);
            alert(`Impossible de supprimer la galerie: ${error.message}`);
        }
    }

    updateAddPhotosPlaceholderVisibility() {
        if (!this.currentGalleryId) { 
            this.addPhotosPlaceholderBtn.style.display = 'none';
            this.imageGridElement.innerHTML = '<p style="text-align:center; margin-top:20px;">Chargez ou créez une galerie pour voir les images.</p>';
            this.imageGridElement.style.display = 'block'; 
            return;
        }

        if (this.gridItems.length === 0) {
            this.addPhotosPlaceholderBtn.style.display = 'block';
            this.imageGridElement.style.display = 'none'; 
        } else {
            this.addPhotosPlaceholderBtn.style.display = 'none';
            this.imageGridElement.style.display = 'grid'; 
        }
    }

    async handleFileSelection(filesArray, targetGalleryIdForUpload) {
        const callingButtonElement = this.activeCallingButton; 

        if (!targetGalleryIdForUpload) {
            alert("Veuillez sélectionner une galerie pour y ajouter des images.");
            this.imageSelectorInput.value = "";
            if (callingButtonElement) callingButtonElement.disabled = false;
            this.activeCallingButton = null;
            return;
        }
        if (!filesArray || filesArray.length === 0) {
            this.imageSelectorInput.value = "";
            if (callingButtonElement) callingButtonElement.disabled = false;
            this.activeCallingButton = null;
            return;
        }

        const BATCH_SIZE = 30; 
        const totalFiles = filesArray.length;
        let filesUploadedSuccessfully = 0;
        let allNewImageDocs = []; 

        let progressContainer, progressTextEl, progressBarInnerEl;
        const isGalleryTabActive = document.getElementById('galleries').classList.contains('active');
        
        if (isGalleryTabActive && this.galleriesUploadProgressContainer) {
            progressContainer = this.galleriesUploadProgressContainer;
            progressTextEl = this.galleriesUploadProgressText;
            progressBarInnerEl = this.galleriesUploadProgressBarInner;
        } else if (this.currentGalleryUploadProgressContainer) {
            progressContainer = this.currentGalleryUploadProgressContainer;
            progressTextEl = this.currentGalleryUploadProgressText;
            progressBarInnerEl = this.currentGalleryUploadProgressBarInner;
        } else {
            console.error("UI de progression non trouvée.");
            this.imageSelectorInput.value = "";
            if(callingButtonElement) callingButtonElement.disabled = false;
            this.activeCallingButton = null;
            return;
        }
        
        progressContainer.style.display = 'block';
        progressBarInnerEl.style.width = '0%';
        progressBarInnerEl.textContent = '0%';
        progressBarInnerEl.style.backgroundColor = '#007bff';
        progressTextEl.textContent = `Préparation de l'upload de ${totalFiles} images...`;

        if (callingButtonElement) callingButtonElement.disabled = true;
        this.imageSelectorInput.disabled = true;

        for (let i = 0; i < totalFiles; i += BATCH_SIZE) {
            const batchFiles = Array.from(filesArray).slice(i, i + BATCH_SIZE);
            const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
            const totalBatches = Math.ceil(totalFiles / BATCH_SIZE);

            const formData = new FormData();
            for (const file of batchFiles) { formData.append('images', file, file.name); }
            
            try {
                const batchResult = await this.sendBatch(formData, targetGalleryIdForUpload, (progressEvent) => {
                     if (progressEvent.lengthComputable) {
                        const batchUploadPercent = Math.round((progressEvent.loaded / progressEvent.total) * 100);
                        progressTextEl.textContent = `Envoi du lot ${batchNumber}/${totalBatches}... ${batchUploadPercent}%`;
                    }
                });
                if (batchResult && Array.isArray(batchResult)) {
                    allNewImageDocs.push(...batchResult);
                    filesUploadedSuccessfully += batchResult.length; 
                    if (targetGalleryIdForUpload === this.currentGalleryId) this.addImagesToGrid(batchResult); 
                    else if (targetGalleryIdForUpload === this.selectedGalleryForPreviewId) await this.showGalleryPreview(this.selectedGalleryForPreviewId, this.galleryCache[this.selectedGalleryForPreviewId]);
                }
            } catch (error) {
                progressTextEl.textContent = `Erreur sur lot ${batchNumber}.`;
                progressBarInnerEl.style.backgroundColor = '#dc3545'; 
                this.imageSelectorInput.value = ""; this.activeCallingButton = null;
                return; 
            }
        }
        
        progressBarInnerEl.style.width = '100%';
        progressBarInnerEl.textContent = '100%';
        if (filesUploadedSuccessfully >= totalFiles) {
            progressTextEl.textContent = `Téléversement complet !`;
            progressBarInnerEl.style.backgroundColor = '#28a745';
        } else {
            progressTextEl.textContent = `Terminé: ${filesUploadedSuccessfully}/${totalFiles} images.`;
            progressBarInnerEl.style.backgroundColor = '#ffc107'; 
        }

        if (targetGalleryIdForUpload === this.currentGalleryId) {
             this.sortGridItemsAndReflow(); 
             this.updateGridUsage();
        }

        if (callingButtonElement) callingButtonElement.disabled = false;
        this.imageSelectorInput.disabled = false;
        this.imageSelectorInput.value = ""; 

        setTimeout(() => {
            progressContainer.style.display = 'none';
            this.updateStatsLabel();
            this.updateAddPhotosPlaceholderVisibility();
        }, 5000); 

        this.activeCallingButton = null;
    }
    
    addImagesToGrid(imagesDataArray) {
        if (!Array.isArray(imagesDataArray) || imagesDataArray.length === 0) return;
        let addedCount = 0;
        imagesDataArray.forEach(imgData => {
            if (imgData && imgData._id && !this.gridItemsDict[imgData._id]) {
                const gridItem = new GridItemBackend(imgData, this.currentThumbSize, this);
                gridItem.element.addEventListener('click', () => this.onGridItemClick(gridItem));
                gridItem.element.draggable = true;
                gridItem.element.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData("application/json", JSON.stringify({
                        sourceType: 'grid',
                        imageId: gridItem.id,
                    }));
                    e.dataTransfer.effectAllowed = "copy";
                });
                this.imageGridElement.appendChild(gridItem.element);
                this.gridItems.push(gridItem); 
                this.gridItemsDict[imgData._id] = gridItem;
                addedCount++;
            }
        });
        if (addedCount > 0) {
            this.updateGridUsage(); 
            this.updateAddPhotosPlaceholderVisibility();
            this.updateStatsLabel();
        }
    }

    async sendBatch(formData, galleryId, onProgress) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${BASE_API_URL}/api/galleries/${galleryId}/images`, true);
            if (onProgress) xhr.upload.onprogress = onProgress;
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
                else reject(new Error(`Échec du lot (${xhr.status}).`));
            };
            xhr.onerror = () => reject(new Error("Erreur réseau."));
            xhr.onabort = () => reject(new Error("Upload annulé."));
            xhr.send(formData);
        });
    }

    async deleteImageFromGrid(imageId) {
        if (!this.currentGalleryId || !imageId) return;
        const gridItemToDelete = this.gridItemsDict[imageId];
        if (!confirm(`Supprimer "${gridItemToDelete.basename}" ?`)) return;

        try {
            const response = await fetch(`${BASE_API_URL}/api/galleries/${this.currentGalleryId}/images/${imageId}`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error(`Échec: ${response.statusText}`);
            const result = await response.json(); 

            result.deletedImageIds.forEach(id => {
                const item = this.gridItemsDict[id];
                if (item) {
                    item.element.remove();
                    this.gridItems = this.gridItems.filter(i => i.id !== id);
                    delete this.gridItemsDict[id];
                }
                this.jourFrames.forEach(jf => jf.removeImageByActualId(id));
            });
            this.updateGridUsage(); 
            this.updateStatsLabel();
            this.updateAddPhotosPlaceholderVisibility();
        } catch (error) {
            alert(`Erreur: ${error.message}`);
        }
    }

    async clearAllGalleryImages() {
        if (!this.currentGalleryId) return;
        if (!confirm("Sûr de vouloir vider TOUTES les images de cette galerie ?")) return;

        try {
            const response = await fetch(`${BASE_API_URL}/api/galleries/${this.currentGalleryId}/images`, { method: 'DELETE' });
            if (!response.ok) throw new Error(`Échec: ${response.statusText}`);
            
            this.imageGridElement.innerHTML = '';
            this.gridItems = []; this.gridItemsDict = {};
            this.jourFrames.forEach(jf => jf.imagesData = []);
            this.updateGridUsage(); 
            this.updateStatsLabel(); 
            this.updateAddPhotosPlaceholderVisibility();
        } catch (error) {
            alert(`Erreur: ${error.message}`);
        }
    }
    
    updateGridItemStyles() {
        this.imageGridElement.style.gridTemplateColumns = `repeat(auto-fill, minmax(${this.currentThumbSize.width + 5}px, 1fr))`; 
        this.gridItems.forEach(item => item.updateSize(this.currentThumbSize));
    }
    
    zoomIn() {
        const newSize = { width: this.currentThumbSize.width + this.zoomStep, height: this.currentThumbSize.height + this.zoomStep };
        if (newSize.width <= this.maxThumbSize.width) {
            this.currentThumbSize = newSize; this.updateGridItemStyles(); this.saveAppState();
        }
    }
    zoomOut() {
        const newSize = { width: this.currentThumbSize.width - this.zoomStep, height: this.currentThumbSize.height - this.zoomStep };
        if (newSize.width >= this.minThumbSize.width) {
            this.currentThumbSize = newSize; this.updateGridItemStyles(); this.saveAppState();
        }
    }

    sortGridItemsAndReflow() {
        const sortValue = this.sortOptionsSelect.value;
        this.gridItems.sort((a, b) => {
            if (sortValue.startsWith('name')) {
                const comparison = a.basename.localeCompare(b.basename, undefined, { numeric: true });
                return sortValue.endsWith('_asc') ? comparison : -comparison;
            }
            const valA = a.datetimeOriginalTs || a.fileModTimeTs;
            const valB = b.datetimeOriginalTs || b.fileModTimeTs;
            return sortValue.endsWith('_asc') ? valA - valB : valB - valA;
        });

        this.gridItems.forEach(item => this.imageGridElement.appendChild(item.element));
        this.saveAppState();
    }

    onGridItemClick(gridItem) { 
        if (!gridItem.isValid || !this.currentJourFrame) {
            alert("Veuillez d'abord sélectionner un Jour de publication.");
            return;
        }
        
        const alreadyIn = this.currentJourFrame.imagesData.some(img => img.imageId === gridItem.id);
        if (alreadyIn) { 
            const index = this.currentJourFrame.imagesData.findIndex(img => img.imageId === gridItem.id);
            if (index !== -1) this.currentJourFrame.removeImageAtIndex(index);
        } else {
            this.currentJourFrame.addImage(gridItem);
        }
    }

    updateGridUsage() {
        const combinedUsage = this.getCombinedUsageMap();
        for (const imageId in this.gridItemsDict) {
            const gridItem = this.gridItemsDict[imageId];
            const originalIdToCompare = gridItem.parentImageId || gridItem.id;
    
            const usageArray = combinedUsage[originalIdToCompare];
    
            if (usageArray && usageArray.length > 0) {
                const joinedLabels = usageArray.map(u => u.label).join(' / ');
                const firstColor = usageArray[0].color;
                gridItem.markUsed(joinedLabels, firstColor);
            } else {
                gridItem.markUnused();
            }
        }
        this.updateStatsLabel();
    }
    
    getCombinedUsageMap() {
        const combinedUsage = {};
        const sortedJourFrames = [...this.jourFrames].sort((a, b) => a.index - b.index);

        sortedJourFrames.forEach(jf => {
            const usageDataForOneJour = jf.getUsageData();
            for (const originalId in usageDataForOneJour) {
                if (!combinedUsage[originalId]) {
                    combinedUsage[originalId] = [];
                }
                combinedUsage[originalId].push(usageDataForOneJour[originalId]);
            }
        });
        return combinedUsage;
    }

    updateStatsLabel() {
        if (!this.currentGalleryId) {
            this.statsLabelText.textContent = "Aucune galerie chargée";
            return;
        }
        const numGridImages = this.gridItems.filter(item => item.isValid).length; 
        const numJourImages = this.jourFrames.reduce((sum, jf) => sum + jf.imagesData.length, 0);
        this.statsLabelText.textContent = `Grille: ${numGridImages} | Jours: ${numJourImages}`;
    }

    // ===========================================================================
    // CORRECTION : La logique de synchronisation avec le calendrier est ajoutée ici
    // ===========================================================================
    async addJourFrame() {
        if (!this.currentGalleryId) return;
        this.recalculateNextJourIndex();
        if (this.nextJourIndex >= 26) { alert("Maximum de Jours (A-Z) atteint."); return; }
        
        this.addJourFrameBtn.disabled = true; 
        try {
            const response = await fetch(`${BASE_API_URL}/api/galleries/${this.currentGalleryId}/jours`, { method: 'POST' });
            if (!response.ok) throw new Error(await response.text());
            
            const newJourData = await response.json(); 
            const newJourFrame = new JourFrameBackend(this, newJourData); 
            this.jourFramesContainer.appendChild(newJourFrame.element); 
            this.jourFrames.push(newJourFrame); 
            this.jourFrames.sort((a, b) => a.index - b.index); 
            this.setCurrentJourFrame(newJourFrame);
            this.recalculateNextJourIndex(); 
            this.updateStatsLabel();
            this.saveAppState();
            
            // CORRECTION: Mettre à jour le contexte du calendrier avec le nouveau jour
            const newJourForScheduling = {
                _id: newJourData._id,
                letter: newJourData.letter,
                galleryId: newJourData.galleryId,
                galleryName: this.getCurrentGalleryName()
            };
            this.scheduleContext.allUserJours.push(newJourForScheduling);

            if (this.calendarPage) {
                this.calendarPage.loadData(this.scheduleContext.schedule, this.scheduleContext.allUserJours);
                if (document.getElementById('calendar').classList.contains('active')) {
                    this.calendarPage.buildCalendarUI();
                }
            }

            if (this.descriptionManager && document.getElementById('description').classList.contains('active')) {
                this.descriptionManager.populateJourList();
            }

        } catch (error) {
            alert(error.message);
        } finally {
            this.addJourFrameBtn.disabled = false; 
        }
    }

    setCurrentJourFrame(jourFrame) {
        if (this.currentJourFrame) {
            this.currentJourFrame.element.classList.remove('current');
        }
        this.currentJourFrame = jourFrame;
        if (this.currentJourFrame) {
            this.currentJourFrame.element.classList.add('current');
        }
    }
    
    async closeJourFrame(jourFrameToClose) { 
        if (!confirm(`Supprimer le Jour ${jourFrameToClose.letter} ?`)) return;

        const index = this.jourFrames.indexOf(jourFrameToClose);
        if (index > -1) {
            await jourFrameToClose.destroy(); 
            this.jourFrames.splice(index, 1);

            // CORRECTION: Mettre à jour le contexte du calendrier lors de la suppression
            this.scheduleContext.allUserJours = this.scheduleContext.allUserJours.filter(j => j._id !== jourFrameToClose.id);
            
            Object.keys(this.scheduleContext.schedule).forEach(dateStr => {
                 if (this.scheduleContext.schedule[dateStr][jourFrameToClose.letter] && this.scheduleContext.schedule[dateStr][jourFrameToClose.letter].galleryId === jourFrameToClose.galleryId) {
                    delete this.scheduleContext.schedule[dateStr][jourFrameToClose.letter];
                    if (Object.keys(this.scheduleContext.schedule[dateStr]).length === 0) {
                        delete this.scheduleContext.schedule[dateStr];
                    }
                 }
            });
            
            if (this.calendarPage) {
                this.calendarPage.loadData(this.scheduleContext.schedule, this.scheduleContext.allUserJours);
                if (document.getElementById('calendar').classList.contains('active')) {
                    this.calendarPage.buildCalendarUI();
                }
                // Sauvegarder l'état du calendrier après suppression d'un élément
                this.calendarPage.saveSchedule();
            }
            // FIN DE LA CORRECTION

            if (this.currentJourFrame === jourFrameToClose) {
                this.setCurrentJourFrame(this.jourFrames[0] || null);
            }
            this.recalculateNextJourIndex(); 
            this.updateGridUsage();
            this.updateStatsLabel();
            this.saveAppState();

            if (this.descriptionManager && document.getElementById('description').classList.contains('active')) {
                this.descriptionManager.populateJourList();
                // Si le jour supprimé était celui en cours d'édition, on nettoie l'éditeur
                if (this.descriptionManager.currentSelectedJourFrame && this.descriptionManager.currentSelectedJourFrame.id === jourFrameToClose.id) {
                    this.descriptionManager.clearEditor();
                }
            }
        }
    }
    // ===========================================================================
    
    recalculateNextJourIndex() {
        const existingIndices = new Set(this.jourFrames.map(jf => jf.index));
        let i = 0; while(existingIndices.has(i) && i < 26) i++;
        this.nextJourIndex = i;
    }

    getCurrentGalleryName() { return this.galleryCache[this.currentGalleryId] || 'Galerie'; }
    getCachedGalleryName(galleryId) { return this.galleryCache[galleryId]; }
    isJourReadyForPublishing(galleryId, letter) { return true; }

    openImageCropper(imagesDataForCropper, callingJourFrame) {
        this.cropper.open(imagesDataForCropper, callingJourFrame);
    }
    
    async saveAppState() {
        if (!this.currentGalleryId) return;
        const appState = {
            currentThumbSize: this.currentThumbSize,
            sortOption: this.sortOptionsSelect.value,
            activeTab: document.querySelector('.tab-button.active')?.dataset.tab || 'currentGallery',
            nextJourIndex: this.nextJourIndex 
        };
        try {
            await fetch(`${BASE_API_URL}/api/galleries/${this.currentGalleryId}/state`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(appState)
            });
        } catch (error) {
            console.error("Error saving app state:", error);
        }
    }

    findImageInAnyJour(imageId, returnFullObject = false) {
        for (const jour of this.jourFrames) {
            const found = jour.imagesData.find(img => img.imageId === imageId);
            if (found) {
                if (returnFullObject) return this.gridItemsDict[imageId] || { /* mock object */ };
                return found; 
            }
        }
        return null;
    }
}


// =================================================================
// --- POINT D'ENTRÉE ET LOGIQUE D'INITIALISATION ---
// =================================================================

document.addEventListener('DOMContentLoaded', () => {
    checkUserStatus();
    setupGlobalEventListeners();
});

async function checkUserStatus() {
    try {
        const response = await fetch('/api/auth/status');
        if (response.ok) {
            const data = await response.json();
            if (data.loggedIn) {
                document.getElementById('userInfo').textContent = `Connecté: ${data.username}`;
                const profileImg = document.getElementById('profilePictureImg');
                if (profileImg && data.user && data.user.picture) {
                    profileImg.src = data.user.picture;
                    profileImg.alt = `Profil de ${data.user.name}`;
                }
                await startApp();
            } else {
                window.location.href = 'welcome.html';
            }
        } else {
            window.location.href = 'welcome.html';
        }
    } catch (error) {
        console.error('Erreur lors de la vérification du statut de connexion:', error);
        window.location.href = 'welcome.html';
    }
}

async function startApp() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    loadingOverlay.style.display = 'flex';
    loadingOverlay.querySelector('p').textContent = 'Initialisation de l\'application...';

    try {
        if (!app) {
            app = new PublicationOrganizer();
            window.pubApp = app; 
        }

        let galleryIdToLoad = localStorage.getItem('publicationOrganizer_lastGalleryId');
        
        if (galleryIdToLoad) {
            const checkResponse = await fetch(`${BASE_API_URL}/api/galleries/${galleryIdToLoad}`);
            if (!checkResponse.ok) {
                galleryIdToLoad = null;
                localStorage.removeItem('publicationOrganizer_lastGalleryId');
            }
        }
        
        if (!galleryIdToLoad) {
            const response = await fetch(`${BASE_API_URL}/api/galleries?limit=1&sort=lastAccessed`);
            if (response.ok) {
                const galleries = await response.json();
                if (galleries && galleries.length > 0) {
                    galleryIdToLoad = galleries[0]._id;
                    localStorage.setItem('publicationOrganizer_lastGalleryId', galleryIdToLoad);
                }
            }
        }
        
        app.currentGalleryId = galleryIdToLoad;
        await app.loadState();

    } catch (error) {
        console.error("Erreur critique lors du démarrage de l'application:", error);
        loadingOverlay.querySelector('p').innerHTML = `Erreur d'initialisation: ${error.message}<br/>Veuillez rafraîchir.`;
        return; 
    }
    
    loadingOverlay.style.display = 'none';
}

function setupGlobalEventListeners() {
    const profileButton = document.getElementById('profileButton');
    const profileDropdown = document.getElementById('profileDropdown');
    const logoutLink = document.getElementById('logoutLink');

    if (profileButton && profileDropdown) {
        profileButton.addEventListener('click', (event) => {
            event.stopPropagation();
            profileDropdown.classList.toggle('show');
        });
    }

    if (logoutLink) {
        logoutLink.addEventListener('click', (event) => {
            event.preventDefault();
            logout();
        });
    }

    window.addEventListener('click', (event) => {
        if (profileDropdown && !event.target.matches('#profileButton') && !event.target.closest('.profile-container')) {
            if (profileDropdown.classList.contains('show')) {
                profileDropdown.classList.remove('show');
            }
        }
    });
}

async function logout() {
    try {
        const response = await fetch('/api/auth/logout', { method: 'POST' });
        if (response.ok) {
            window.location.href = 'welcome.html';
        } else {
            alert('Erreur lors de la déconnexion.');
        }
    } catch (error) {
        console.error('Erreur lors de la déconnexion:', error);
    }
}