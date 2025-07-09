// =================================================================
// --- Contenu complet du fichier : public/script.js (Corrigé) ---
// =================================================================

// --- Constantes Globales et État ---
const BASE_API_URL = '';
const JOUR_COLORS = [
    "red", "blue", "green", "purple", "orange",
    "brown", "magenta", "gold", "cyan", "darkgreen",
    "pink", "navy", "gray", "darkorange"
];
const CALENDAR_THUMB_SIZE = { width: 30, height: 30 };
const CALENDAR_HOVER_THUMB_SIZE = { width: 100, height: 100 };
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
        
        this.singleDayOverlay = document.createElement('span');
        this.singleDayOverlay.className = 'order-text';

        this.multiDayOverlay = document.createElement('div');
        this.multiDayOverlay.className = 'multi-day-overlay';
        
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
        this.element.appendChild(this.singleDayOverlay);
        this.element.appendChild(this.multiDayOverlay);
        this.element.appendChild(this.deleteButton);

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
        this.element.insertBefore(errorDiv, this.singleDayOverlay); 
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
    }

    markUsed(order, color = "red") {
        this.multiDayOverlay.style.display = 'none';
        this.multiDayOverlay.innerHTML = '';
        
        this.singleDayOverlay.textContent = order;
        this.singleDayOverlay.style.color = color;
        this.singleDayOverlay.style.display = 'block';
        const fontSize = Math.max(10, Math.min(32, Math.floor(this.thumbSize.height * 0.3)));
        this.singleDayOverlay.style.fontSize = `${fontSize}px`;
        
        this.element.classList.add('used');
    }

    markUsedInMultipleDays(usageArray) {
        this.singleDayOverlay.style.display = 'none';
        this.multiDayOverlay.innerHTML = ''; 

        usageArray.slice(0, 4).forEach((usage, index) => {
            const quadrantText = document.createElement('div');
            quadrantText.className = `quadrant-text quadrant-text-${index + 1}`;
            quadrantText.textContent = usage.label;
            quadrantText.style.color = usage.color;
            const fontSize = Math.max(8, Math.min(20, Math.floor(this.thumbSize.height * 0.15)));
            quadrantText.style.fontSize = `${fontSize}px`;

            this.multiDayOverlay.appendChild(quadrantText);
        });

        this.multiDayOverlay.style.display = 'block';
        this.element.classList.add('used');
    }

    markUnused() {
        this.singleDayOverlay.style.display = 'none';
        this.multiDayOverlay.style.display = 'none';
        this.multiDayOverlay.innerHTML = '';

        this.element.classList.remove('used');
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

        this.exportJourImagesBtn = document.createElement('button');
        this.exportJourImagesBtn.textContent = 'Exporter Images';

        this.deleteJourBtn = document.createElement('button');
        this.deleteJourBtn.textContent = '🗑️ Suppr. Jour';
        this.deleteJourBtn.className = 'danger-btn-small';

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

        this.exportJourImagesBtn.addEventListener('click', () => this.exportJourAsZip());
        this.deleteJourBtn.addEventListener('click', () => this.organizer.closeJourFrame(this));

        this.debouncedSave = Utils.debounce(() => this.save(), 1500);

        this.placeholderElement = document.createElement('div');
        this.placeholderElement.className = 'jour-image-placeholder';

        this.canvasWrapper.addEventListener('dragover', (e) => this.onDragOver(e));
        this.canvasWrapper.addEventListener('dragleave', (e) => this.onDragLeave(e));
        this.canvasWrapper.addEventListener('drop', (e) => this.onDrop(e));

        if (jourData.images && Array.isArray(jourData.images)) {
            jourData.images.sort((a, b) => a.order - b.order).forEach(imgEntry => {
                if (imgEntry.imageId && typeof imgEntry.imageId === 'object') {
                    this.addImageFromBackendData(imgEntry.imageId);
                } else if (typeof imgEntry.imageId === 'string') {
                    const fullImgData = this.organizer.gridItemsDict[imgEntry.imageId] || this.organizer.findImageInAnyJour(imgEntry.imageId);
                    if (fullImgData) this.addImageFromBackendData(fullImgData, true);
                }
            });
        }
        this.checkAndApplyCroppedStyle();
    }

    onDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        this.canvasWrapper.classList.add('drag-over');

        const afterElement = this.getDragAfterElement(e.clientX, e.clientY);

        if (afterElement == null) {
            this.canvasWrapper.appendChild(this.placeholderElement);
        } else {
            this.canvasWrapper.insertBefore(this.placeholderElement, afterElement);
        }
    }

    getDragAfterElement(x) {
        const draggableElements = [...this.canvasWrapper.querySelectorAll('.jour-image-item:not(.dragging-jour-item)')];
    
        for (const child of draggableElements) {
            const box = child.getBoundingClientRect();
            if (x < box.left + box.width / 2) {
                return child;
            }
        }
    
        return null;
    }


    onDragLeave(e) {
        if (!this.canvasWrapper.contains(e.relatedTarget)) {
            this.canvasWrapper.classList.remove('drag-over');
            if (this.placeholderElement.parentNode) {
                this.placeholderElement.parentNode.removeChild(this.placeholderElement);
            }
        }
    }
    
    onDrop(e) {
        e.preventDefault();
        this.canvasWrapper.classList.remove('drag-over');
        if (this.placeholderElement.parentNode) {
            this.placeholderElement.parentNode.removeChild(this.placeholderElement);
        }

        const jsonData = e.dataTransfer.getData("application/json");
        if (!jsonData) return;

        try {
            const data = JSON.parse(jsonData);
            const afterElement = this.getDragAfterElement(e.clientX, e.clientY);

            if (data.sourceType === 'grid') {
                const gridItem = this.organizer.gridItemsDict[data.imageId];
                if (gridItem) {
                    const newItemData = {
                        imageId: gridItem.id,
                        originalReferencePath: gridItem.parentImageId || gridItem.id,
                        dataURL: gridItem.thumbnailPath,
                        isCropped: gridItem.isCroppedVersion
                    };
                    const newElement = this.createJourItemElement(newItemData);
                    this.canvasWrapper.insertBefore(newElement, afterElement);
                    this.syncDataArrayFromDOM();
                }
            } else if (data.sourceType === 'jour') {
                const sourceJourFrame = this.organizer.jourFrames.find(jf => jf.id === data.sourceJourId);
                const draggedElement = document.querySelector('.dragging-jour-item');
                
                if (draggedElement && sourceJourFrame) {
                    this.canvasWrapper.insertBefore(draggedElement, afterElement);
                    
                    if (sourceJourFrame !== this) {
                        sourceJourFrame.syncDataArrayFromDOM();
                    }
                    this.syncDataArrayFromDOM();
                }
            }
        } catch (err) {
            console.error("Erreur lors du drop dans le JourFrame:", err);
        } finally {
            const dragging = document.querySelector('.dragging-jour-item');
            if (dragging) dragging.classList.remove('dragging-jour-item');
        }
    }
    
    syncDataArrayFromDOM() {
        const newImagesData = [];
        const imageElements = this.canvasWrapper.querySelectorAll('.jour-image-item');

        const allImageDataById = new Map();
        this.organizer.jourFrames.forEach(jf => {
            jf.imagesData.forEach(data => allImageDataById.set(data.imageId, data));
        });
        this.organizer.gridItems.forEach(gridItem => {
            if (!allImageDataById.has(gridItem.id)) {
                 allImageDataById.set(gridItem.id, {
                    imageId: gridItem.id,
                    originalReferencePath: gridItem.parentImageId || gridItem.id,
                    dataURL: gridItem.thumbnailPath,
                    isCropped: gridItem.isCroppedVersion
                });
            }
        });


        imageElements.forEach(element => {
            const imageId = element.dataset.imageId;
            const data = allImageDataById.get(imageId);
            if (data) {
                newImagesData.push(data);
            }
        });

        this.imagesData = newImagesData;
        
        this.organizer.updateGridUsage();
        this.debouncedSave();
        this.checkAndApplyCroppedStyle();
    }

    addImageFromBackendData(imageData, isGridItemInstance = false) {
        let galleryIdForURL = this.galleryId;
        let thumbFilename;

        if (isGridItemInstance) { 
            galleryIdForURL = imageData.galleryId;
            thumbFilename = Utils.getFilenameFromURL(imageData.thumbnailPath); 
        } else { 
            thumbFilename = Utils.getFilenameFromURL(imageData.thumbnailPath); 
        }

        const imageItemData = {
            imageId: imageData._id || imageData.id, 
            originalReferencePath: imageData.parentImageId || (imageData._id || imageData.id), 
            dataURL: `${BASE_API_URL}/api/uploads/${galleryIdForURL}/${thumbFilename}`, 
            isCropped: imageData.isCroppedVersion || false,
        };

        this.imagesData.push(imageItemData);
        const newElement = this.createJourItemElement(imageItemData);
        this.canvasWrapper.appendChild(newElement);
    }

    createJourItemElement(imageItemData) {
        const itemElement = document.createElement('div');
        itemElement.className = 'jour-image-item';
        itemElement.style.backgroundImage = `url(${imageItemData.dataURL})`;
        itemElement.draggable = true;
        itemElement.dataset.imageId = imageItemData.imageId;

        itemElement.addEventListener('dragstart', (e) => {
            e.target.classList.add('dragging-jour-item');
            e.dataTransfer.setData("application/json", JSON.stringify({
                sourceType: 'jour',
                sourceJourId: this.id,
                imageId: imageItemData.imageId,
            }));
            e.dataTransfer.effectAllowed = "move";
        });
    
        itemElement.addEventListener('dragend', (e) => {
            e.target.classList.remove('dragging-jour-item');
        });
    
        const deleteBtn = document.createElement('span');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '×';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            this.removeImageById(imageItemData.imageId);
        };
        itemElement.appendChild(deleteBtn);
        return itemElement;
    }

    removeImageById(imageIdToRemove) {
        const elementToRemove = this.canvasWrapper.querySelector(`[data-image-id="${imageIdToRemove}"]`);
        if (elementToRemove) {
            elementToRemove.remove();
        }
        this.syncDataArrayFromDOM();
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
            alert(`Le Jour ${this.letter} est vide. Aucun ZIP ne sera généré.`);
            return;
        }
        if (!this.galleryId || !this.id) {
            alert("Erreur: Impossible de déterminer la galerie ou l'ID du jour pour l'exportation.");
            return;
        }

        const exportUrl = `${BASE_API_URL}/api/galleries/${this.galleryId}/jours/${this.id}/export`;
        const originalButtonText = this.exportJourImagesBtn.textContent;
        this.exportJourImagesBtn.textContent = 'Préparation...';
        this.exportJourImagesBtn.disabled = true;

        try {
            const response = await fetch(exportUrl);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Erreur HTTP ${response.status}: ${errorText}`);
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
            console.error(`Erreur lors de l'exportation du Jour ${this.letter}:`, error);
            alert(`Erreur d'exportation: ${error.message}`);
        } finally {
            this.exportJourImagesBtn.textContent = originalButtonText;
            this.exportJourImagesBtn.disabled = false;
        }
    }

    async save() {
        if (!this.id || !app.currentGalleryId) {
            console.error("Cannot save Jour: Missing Jour ID or Gallery ID.");
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
            const response = await fetch(`${BASE_API_URL}/api/galleries/${app.currentGalleryId}/jours/${this.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.text();
                throw new Error(`Failed to save Jour ${this.letter}: ${response.statusText} - ${errorData}`);
            }
            await response.json();
            
            if (this.organizer && this.organizer.calendarPage && document.getElementById('calendar').classList.contains('active')) {
                this.organizer.calendarPage.buildCalendarUI();
            }
            return true;

        } catch (error) {
            console.error(`Error saving Jour ${this.letter}:`, error);
            if (app && app.descriptionManager) {
                app.descriptionManager.showSaveStatus(false);
            }
            return false;
        }
    }
    
    updateImagesFromCropper(modifiedDataMap) {
        let changesApplied = false;
        const newImagesDataArray = [];
        const finalElements = [];
    
        this.canvasWrapper.querySelectorAll('.jour-image-item').forEach(element => {
            const currentImageId = element.dataset.imageId;
            const modificationOutput = modifiedDataMap[currentImageId];
    
            if (modificationOutput) {
                changesApplied = true;
                if (Array.isArray(modificationOutput)) {
                    modificationOutput.forEach(newImageDoc => {
                        const newData = this.createImageItemDataFromBackendDoc(newImageDoc);
                        newImagesDataArray.push(newData);
                        finalElements.push(this.createJourItemElement(newData));
                    });
                } else {
                    const newData = this.createImageItemDataFromBackendDoc(modificationOutput);
                    newImagesDataArray.push(newData);
                    finalElements.push(this.createJourItemElement(newData));
                }
            } else {
                const oldData = this.imagesData.find(d => d.imageId === currentImageId);
                if (oldData) {
                    newImagesDataArray.push(oldData);
                    finalElements.push(element);
                }
            }
        });
    
        if (changesApplied) {
            this.imagesData = newImagesDataArray;
            this.canvasWrapper.innerHTML = '';
            finalElements.forEach(el => this.canvasWrapper.appendChild(el));
            this.debouncedSave();
            this.checkAndApplyCroppedStyle();
        }
    }

    createImageItemDataFromBackendDoc(imageDoc) {
        return {
            imageId: imageDoc._id,
            originalReferencePath: imageDoc.parentImageId || imageDoc._id, 
            dataURL: `${BASE_API_URL}/api/uploads/${imageDoc.galleryId}/${Utils.getFilenameFromURL(imageDoc.thumbnailPath)}`,
            isCropped: imageDoc.isCroppedVersion
        };
    }
    
    getUsageDataForMultiple() {
        const usage = new Map();
        const color = JOUR_COLORS[this.index % JOUR_COLORS.length];
        this.imagesData.forEach((imgData, i) => {
            const label = `${this.letter}${i + 1}`;
            const originalId = imgData.originalReferencePath; 

            if (!usage.has(originalId)) {
                usage.set(originalId, []);
            }
            usage.get(originalId).push({
                label: label,
                color: color,
                jourLetter: this.letter
            });
        });
        return usage;
    }

    async destroy() { 
        if (this.id && app.currentGalleryId) {
            try {
                await fetch(`${BASE_API_URL}/api/galleries/${app.currentGalleryId}/jours/${this.id}`, { method: 'DELETE' });
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

class CroppingManager {
    constructor(organizer, croppingPage) {
        this.organizer = organizer;
        this.croppingPage = croppingPage;
        
        this.editorPanel = document.getElementById('croppingEditorPanel');
        this.canvasElement = document.getElementById('cropperCanvas');
        this.ctx = this.canvasElement.getContext('2d', { alpha: false }); 
        this.previewContainer = this.editorPanel.querySelector('.cropper-previews'); 
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
        this.deleteBtn = document.getElementById('cropDeleteBtn');
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

        this.debouncedUpdatePreview = Utils.debounce(() => this.updatePreview(), 150);
        this.debouncedHandleResize = Utils.debounce(() => this._handleResize(), 50);

        this._initListeners();
    }

    _initListeners() {
        this.finishBtn.onclick = () => this.finishAndApply();
        this.prevBtn.onclick = () => this.prevImage(); 
        this.nextBtn.onclick = () => this.nextImage(false); 
        this.deleteBtn.onclick = () => {
            if (this.currentImageIndex < 0 || this.currentImageIndex >= this.imagesToCrop.length) {
                return; // No image selected
            }

            const imageToDelete = this.imagesToCrop[this.currentImageIndex];
            const imageIdToDelete = imageToDelete.currentImageId;
            const originalGridItem = this.organizer.gridItemsDict[imageToDelete.originalReferenceId];
            const displayName = originalGridItem ? originalGridItem.basename : `Image ID ${imageToDelete.originalReferenceId}`;

            // 1. Remove from the JourFrame, which handles DOM and data array
            if (this.currentJourFrameInstance) {
                this.currentJourFrameInstance.removeImageById(imageIdToDelete);
            }

            // 2. Remove from the cropper's internal list
            this.imagesToCrop.splice(this.currentImageIndex, 1);
            
            // 3. Refresh the thumbnail strip
            this.croppingPage._populateThumbnailStrip(this.currentJourFrameInstance);


            // 4. Load the next image (or finish if it was the last one)
            // No need to increment index, as splice shifts the array.
            // If it was the last image, currentImageIndex will now be out of bounds, which loadCurrentImage handles.
            this.infoLabel.textContent = `Image ${displayName} supprimée du jour.`;
            this.loadCurrentImage();
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
        
        new ResizeObserver(this.debouncedHandleResize).observe(this.canvasElement.parentElement);
    }
    
    _handleResize() {
        if (!this.editorPanel.style.display || this.editorPanel.style.display === 'none' || !this.currentImageObject) return;

        let relativeCrop = null;
        if (this.cropRectDisplay) {
            const oldImageDims = this.getImageDisplayDimensions();
            if (oldImageDims.displayWidth > 0 && oldImageDims.displayHeight > 0) {
                relativeCrop = {
                    x: (this.cropRectDisplay.x - oldImageDims.displayX) / oldImageDims.displayWidth,
                    y: (this.cropRectDisplay.y - oldImageDims.displayY) / oldImageDims.displayHeight,
                    width: this.cropRectDisplay.width / oldImageDims.displayWidth,
                    height: this.cropRectDisplay.height / oldImageDims.displayHeight
                };
            }
        }

        this.setCanvasDimensions();

        if (relativeCrop) {
            const newImageDims = this.getImageDisplayDimensions();
            this.cropRectDisplay = {
                x: newImageDims.displayX + (relativeCrop.x * newImageDims.displayWidth),
                y: newImageDims.displayY + (relativeCrop.y * newImageDims.displayHeight),
                width: relativeCrop.width * newImageDims.displayWidth,
                height: relativeCrop.height * newImageDims.displayHeight
            };
        }
        
        this.redrawCanvasOnly();
        this.debouncedUpdatePreview();
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
        if (this.editorPanel.style.display === 'none' || !this.currentImageObject) {
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
    
    async startCropping(images, callingJourFrame) { 
        this.imagesToCrop = images; 
        this.currentJourFrameInstance = callingJourFrame;
        this.currentImageIndex = -1;
        this.modifiedDataMap = {};
        this.saveMode = 'crop'; 

        this.croppingPage.showEditor();
        
        this.setCanvasDimensions(); 
        this.isDragging = false; 
        this.dragMode = null;    
        this.canvasElement.style.cursor = 'crosshair'; 
        this.splitModeState = 0; 
        this.showSplitLineCount = 0;
        this.splitLineBtn.title = "Diviser l'image pour un carrousel";
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
        
        this.croppingPage.clearEditor();
        this.organizer.refreshSidePanels();
    }

    async goToImage(index) {
        if (index === this.currentImageIndex || index < 0 || index >= this.imagesToCrop.length) {
            return;
        }

        // Sauvegarder l'image actuelle avant de changer
        if (this.currentImageIndex >= 0) {
            await this.applyAndSaveCurrentImage();
        }
        
        this.currentImageIndex = index;
        await this.loadCurrentImage();
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

            let defaultRatio;
            const imgWidth = this.currentImageObject.naturalWidth || this.currentImageObject.width;
            const imgHeight = this.currentImageObject.naturalHeight || this.currentImageObject.height;

            if (imgWidth > imgHeight * 1.05) { // Clairement horizontale
                defaultRatio = '3:2';
            } else if (imgHeight > imgWidth * 1.05) { // Clairement verticale
                defaultRatio = '3:4';
            } else { // Carrée ou presque
                defaultRatio = '1:1';
            }
            
            this.aspectRatioSelect.value = defaultRatio;

            if (this.currentImageObject && typeof smartcrop !== 'undefined') {
                this.infoLabel.textContent = `Analyse intelligente de l'image...`;

                const aspectRatioName = this.aspectRatioSelect.value;
                this.currentAspectRatioName = aspectRatioName;

                const imageDims = {
                    width: this.currentImageObject.naturalWidth,
                    height: this.currentImageObject.naturalHeight
                };

                let cropOptionsForSmartcrop;

                if (aspectRatioName === 'free') {
                    const size = Math.min(imageDims.width, imageDims.height);
                    cropOptionsForSmartcrop = { width: size, height: size };
                } else {
                    const ratioParts = aspectRatioName.split(':').map(Number);
                    const targetRatio = ratioParts[0] / ratioParts[1];
                    const imageRatio = imageDims.width / imageDims.height;

                    if (imageRatio > targetRatio) {
                        cropOptionsForSmartcrop = { width: imageDims.height * targetRatio, height: imageDims.height };
                    } else {
                        cropOptionsForSmartcrop = { width: imageDims.width, height: imageDims.width / targetRatio };
                    }
                }
                
                const result = await smartcrop.crop(this.currentImageObject, cropOptionsForSmartcrop);
                const bestCrop = result.topCrop;

                const { displayX, displayY, imageScale } = this.getImageDisplayDimensions();
                
                if (imageScale > 0) {
                    this.cropRectDisplay = {
                        x: displayX + (bestCrop.x * imageScale),
                        y: displayY + (bestCrop.y * imageScale),
                        width: bestCrop.width * imageScale,
                        height: bestCrop.height * imageScale
                    };
                } else {
                    throw new Error("L'échelle de l'image est nulle, utilisation du recadrage par défaut.");
                }

                this.adjustCropRectToAspectRatio();

            } else {
                throw new Error("Smartcrop non disponible ou l'image n'a pu être chargée.");
            }

        } catch (e) {
            console.warn("L'analyse Smartcrop a échoué ou n'a pas été utilisée, application du recadrage par défaut.", e.message);
            
            if (this.currentImageObject) {
                this.onRatioChanged(this.aspectRatioSelect.value);
            } else {
                console.error(`Erreur chargement: ${displayName}:`, e);
                this.infoLabel.textContent = `Erreur chargement: ${displayName}`;
                this.currentImageObject = null;
                this.updatePreview(null, null);
                return;
            }
        }
        
        this.aspectRatioSelect.disabled = this.splitModeState > 0 || this.saveMode === 'white_bars';
        this.whiteBarsBtn.disabled = this.splitModeState > 0;
        this.splitLineBtn.disabled = this.saveMode === 'white_bars';

        this.redrawCanvasOnly(); 
        this.debouncedUpdatePreview();
        this.infoLabel.textContent = `Image ${this.currentImageIndex + 1}/${this.imagesToCrop.length}: ${displayName}`;
        this.croppingPage._updateThumbnailStripHighlight(this.currentImageIndex);
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
        if (!this.currentImageObject || !this.canvasElement.width || !this.canvasElement.height) {
            return { displayX:0, displayY:0, displayWidth:0, displayHeight:0, imageScale: 1};
        }
        const canvasWidth = this.canvasElement.width, canvasHeight = this.canvasElement.height;
        const imgWidth = this.currentImageObject.naturalWidth || this.currentImageObject.width;
        const imgHeight = this.currentImageObject.naturalHeight || this.currentImageObject.height;
        if (imgWidth === 0 || imgHeight === 0) return { displayX:0, displayY:0, displayWidth:0, displayHeight:0, imageScale: 1};

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
            this.splitLineBtn.title = "Diviser l'image pour un carrousel";
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
            this.splitLineBtn.title = "Diviser en 2 images";
            this.splitLineBtn.classList.add('active-crop-btn');
        } else if (this.splitModeState === 2) { 
            this.currentAspectRatioName = '9:4doublesplit'; 
            this.aspectRatioSelect.disabled = true;
            this.whiteBarsBtn.disabled = true; 
            this.showSplitLineCount = 2;
            this.setDefaultMaximizedCropRectForDoubleSplit(); 
            this.splitLineBtn.title = "Diviser en 3 images";
            this.splitLineBtn.classList.add('active-crop-btn'); 
        } else { 
            this.aspectRatioSelect.disabled = false;
            this.whiteBarsBtn.disabled = false;
            this.showSplitLineCount = 0;
            this.splitLineBtn.title = "Diviser l'image pour un carrousel";
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
                this.splitLineBtn.title = "Diviser l'image pour un carrousel";
                this.showSplitLineCount = 0;
            }
            this.saveMode = 'white_bars';
            this.currentAspectRatioName = '3:4';
            this.aspectRatioSelect.disabled = true;
            this.splitLineBtn.disabled = true;
            this.cropRectDisplay = null;
            this.whiteBarsBtn.classList.add('active-crop-btn');
        } else {
            this.saveMode = 'crop';
            this.aspectRatioSelect.disabled = (this.splitModeState > 0);
            this.splitLineBtn.disabled = false;
            
            // CORRECTION : Redéfinir le ratio par défaut en se basant sur l'image
            let defaultRatio;
            const imgWidth = this.currentImageObject.naturalWidth || this.currentImageObject.width;
            const imgHeight = this.currentImageObject.naturalHeight || this.currentImageObject.height;

            if (imgWidth > imgHeight * 1.05) {
                defaultRatio = '3:2';
            } else if (imgHeight > imgWidth * 1.05) {
                defaultRatio = '3:4';
            } else {
                defaultRatio = '1:1';
            }
            this.aspectRatioSelect.value = defaultRatio;
            
            this.onRatioChanged(defaultRatio);
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
                if (!finalWidth || finalWidth <= 0 || !finalHeight || finalHeight <= 0) {
                    throw new Error("Dimensions invalides (nulles ou négatives) pour l'ajout de barres blanches.");
                }
                saveCanvas.width = finalWidth; saveCanvas.height = finalHeight;
                saveCtx.fillStyle = 'white'; saveCtx.fillRect(0, 0, finalWidth, finalHeight);
                this.drawFlippedIfNeeded(saveCtx, this.currentImageObject, pasteX, pasteY, this.currentImageObject.naturalWidth, this.currentImageObject.naturalHeight);
                const newDataURL = saveCanvas.toDataURL('image/jpeg', 0.92); 
                cropOperationsPayloads.push({ imageDataUrl: newDataURL, cropInfo: 'barres_3x4', filenameSuffix: 'barres_3x4' }); 

            } else if (this.saveMode === 'crop' && this.cropRectDisplay) {
                const { sx, sy, sWidth, sHeight } = this.getCropSourceCoordinates();
                
                if (sWidth <= 0 || sHeight <= 0) {
                    console.warn("Tentative de sauvegarde avec des dimensions de recadrage invalides (<= 0). Annulation.", {sWidth, sHeight});
                    this.infoLabel.textContent = `Recadrage ignoré (dimensions invalides).`;
                    return;
                }

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
                    if (!opPayload.imageDataUrl || !opPayload.imageDataUrl.startsWith('data:image/jpeg;base64,')) {
                        console.error('Données d\'image invalides générées, annulation de l\'envoi:', opPayload);
                        continue; 
                    }

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

class CroppingPage {
    constructor(organizerApp) {
        this.organizerApp = organizerApp;
        this.jourListElement = document.getElementById('croppingJourList');
        this.editorContainerElement = document.getElementById('croppingEditorContainer');
        this.editorPanelElement = document.getElementById('croppingEditorPanel');
        this.editorPlaceholderElement = document.getElementById('croppingEditorPlaceholder');
        this.editorTitleElement = document.getElementById('croppingEditorTitle');
        this.thumbnailStripElement = document.getElementById('croppingThumbnailStrip');
        
        this.currentSelectedJourFrame = null;
        this.croppingManager = new CroppingManager(this.organizerApp, this);

        this.jourListElement.addEventListener('click', (e) => this.onJourClick(e));
    }

    show() {
        if (!this.organizerApp.currentGalleryId) {
            this.jourListElement.innerHTML = '<li>Chargez une galerie pour voir ses jours.</li>';
            this.clearEditor();
            return;
        }
        this.populateJourList();

        const stillExists = this.currentSelectedJourFrame ? this.organizerApp.jourFrames.find(jf => jf.id === this.currentSelectedJourFrame.id) : null;
        if (stillExists) {
            this.selectJour(stillExists, true);
        } else {
            this.clearEditor();
        }
    }

    populateJourList() {
        this.organizerApp._populateSharedJourList(
            this.jourListElement, 
            this.currentSelectedJourFrame ? this.currentSelectedJourFrame.id : null, 
            'cropping'
        );
    }

    onJourClick(event) {
        const li = event.target.closest('li');
        if (!li || !li.dataset.jourId) return;

        const jourFrame = this.organizerApp.jourFrames.find(jf => jf.id === li.dataset.jourId);
        if (jourFrame) {
            this.selectJour(jourFrame);
        }
    }

    selectJour(jourFrame, preventStart = false) {
        if (this.currentSelectedJourFrame === jourFrame && this.editorPanelElement.style.display !== 'none') {
            return; 
        }

        this.currentSelectedJourFrame = jourFrame;
        
        this.populateJourList(); // Met à jour la surbrillance

        if (!preventStart) {
            this.startCroppingForJour(jourFrame);
        } else {
            this.editorTitleElement.textContent = `Recadrage pour Jour ${jourFrame.letter}`;
        }
    }

    startCroppingForJour(jourFrame) {
        if (!jourFrame.imagesData || jourFrame.imagesData.length === 0) {
            this.clearEditor();
            this.editorTitleElement.textContent = `Jour ${jourFrame.letter}`;
            this.editorPlaceholderElement.textContent = `Le Jour ${jourFrame.letter} est vide et ne peut pas être recadré.`;
            return;
        }
        
        this.editorTitleElement.textContent = `Recadrage pour Jour ${jourFrame.letter}`;
        
        this._populateThumbnailStrip(jourFrame);

        const imageInfosForCropper = jourFrame.imagesData.map(imgData => {
            const originalImageInGrid = this.organizerApp.gridItemsDict[imgData.originalReferencePath];
            const baseImageToCropFromDataURL = originalImageInGrid ? originalImageInGrid.imagePath : imgData.dataURL;
            
            return {
                pathForCropper: imgData.imageId, 
                dataURL: imgData.dataURL, 
                originalReferenceId: imgData.originalReferencePath, 
                baseImageToCropFromDataURL, 
                currentImageId: imgData.imageId 
            };
        });
        
        this.croppingManager.startCropping(imageInfosForCropper, jourFrame);
    }
    
    _populateThumbnailStrip(jourFrame) {
        this.thumbnailStripElement.innerHTML = '';
        jourFrame.imagesData.forEach((imgData, index) => {
            const thumbDiv = document.createElement('div');
            thumbDiv.className = 'crop-strip-thumb';
            thumbDiv.style.backgroundImage = `url(${imgData.dataURL})`;
            thumbDiv.dataset.index = index;
            
            thumbDiv.addEventListener('click', () => {
                this.croppingManager.goToImage(index);
            });

            this.thumbnailStripElement.appendChild(thumbDiv);
        });
    }

    _updateThumbnailStripHighlight(activeIndex) {
        const thumbs = this.thumbnailStripElement.querySelectorAll('.crop-strip-thumb');
        thumbs.forEach((thumb, index) => {
            if (index === activeIndex) {
                thumb.classList.add('active-crop-thumb');
                thumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            } else {
                thumb.classList.remove('active-crop-thumb');
            }
        });
    }

    showEditor() {
        this.editorPanelElement.style.display = 'flex';
        this.editorPlaceholderElement.style.display = 'none';
    }

    clearEditor() {
        this.editorPanelElement.style.display = 'none';
        this.editorPlaceholderElement.style.display = 'block';
        this.editorTitleElement.textContent = "Sélectionnez un jour à recadrer";
        this.thumbnailStripElement.innerHTML = '';

        if (this.currentSelectedJourFrame) {
             this.currentSelectedJourFrame = null;
             this.populateJourList();
        }
    }
}


// =================================================================
// --- CLASSE DescriptionManager ---
// =================================================================
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
        this.imagesPreviewBanner = document.getElementById('descriptionImagesPreview');
        
        this.currentSelectedJourFrame = null;

        this.debouncedSave = Utils.debounce(() => this.saveCurrentDescription(), 1500);

        this._initListeners();
    }

    _initListeners() {
        this.descriptionTextElement.addEventListener('input', () => {
            if (!this.currentSelectedJourFrame) return;
            this.debouncedSave();
        });
        this.descriptionHashtagsElement.addEventListener('input', () => {
            if (!this.currentSelectedJourFrame) return;
            this.debouncedSave();
        });
        
        this.jourListElement.addEventListener('click', (e) => {
            const li = e.target.closest('li');
            if (li && li.dataset.jourId) {
                const jourFrame = this.organizerApp.jourFrames.find(jf => jf.id === li.dataset.jourId);
                if (jourFrame) {
                    this.selectJour(jourFrame);
                }
            }
        });
    }

    show() {
        if (!app.currentGalleryId) {
            this.jourListElement.innerHTML = '<li>Chargez une galerie pour voir ses jours.</li>';
            this.clearEditor();
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
        this.organizerApp._populateSharedJourList(
            this.jourListElement,
            this.currentSelectedJourFrame ? this.currentSelectedJourFrame.id : null,
            'description'
        );
    }

    selectJour(jourFrame) {
        this.currentSelectedJourFrame = jourFrame;
        this.populateJourList();
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
        this.jourListElement.querySelectorAll('.active-description-jour').forEach(li => li.classList.remove('active-description-jour'));
        if (this.imagesPreviewBanner) {
            this.imagesPreviewBanner.innerHTML = '';
            this.imagesPreviewBanner.style.display = 'none';
        }
    }

    async saveCurrentDescription() {
        if (!this.currentSelectedJourFrame || !app.currentGalleryId) {
            return;
        }
        
        const jourToUpdate = this.currentSelectedJourFrame;
        jourToUpdate.descriptionText = this.descriptionTextElement.value;
        jourToUpdate.descriptionHashtags = this.descriptionHashtagsElement.value;
        
        const success = await jourToUpdate.save(); 
        
        if (success) {
            this.organizerApp.refreshSidePanels();
        }
    }
}

// =================================================================
// --- CLASSE CalendarPage (VERSION DÉFINITIVEMENT CORRIGÉE) ---
// =================================================================
class CalendarPage {
    constructor(parentElement, organizerApp) {
        this.parentElement = parentElement;
        this.organizerApp = organizerApp;
        
        this.currentDate = new Date(); 
        this.calendarGridElement = this.parentElement.querySelector('#calendarGrid');
        this.monthYearLabelElement = this.parentElement.querySelector('#monthYearLabel');
        this.jourListElement = this.parentElement.querySelector('#calendarJourList');
        this.unscheduledJoursListElement = this.parentElement.querySelector('#unscheduledJoursList');
        
        this.contextPreviewModal = document.getElementById('calendarContextPreviewModal');
        this.contextPreviewTitle = document.getElementById('calendarContextTitle');
        this.contextPreviewImages = document.getElementById('calendarContextImages');

        this.runAutoScheduleBtn = document.getElementById('runAutoScheduleBtn');
        this.autoScheduleInfo = document.getElementById('auto-schedule-info');

        this.dragData = {}; 

        this._initListeners();
        this.debouncedChangeMonth = Utils.debounce(this.changeMonth.bind(this), 100); 
    }

    _initListeners() {
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
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.contextPreviewModal.style.display === 'block') {
                    this._hideContextPreview();
                }
            }
        });

        this.runAutoScheduleBtn.addEventListener('click', () => this.runAutoSchedule());
        
        const reorganizeAllBtn = document.getElementById('reorganizeAllBtn');
        if (reorganizeAllBtn) {
            reorganizeAllBtn.addEventListener('click', () => this.reorganizeAll());
        }
    }

    reorganizeAll() {
        if (!confirm("Êtes-vous sûr de vouloir retirer tous les jours du calendrier et les replacer dans la liste 'Jours à Planifier' ?")) {
            return;
        }
        this.organizerApp.scheduleContext.schedule = {};
        this.saveSchedule();
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
        if (!app.currentGalleryId) { 
            this.calendarGridElement.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; padding: 20px;">Chargez ou créez une galerie pour voir le calendrier.</p>';
            this.monthYearLabelElement.textContent = "Calendrier";
            this.populateJourList();
            this.buildUnscheduledJoursList();
            return;
        }

        this.populateJourList();
        this.buildUnscheduledJoursList();

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

    populateJourList() {
        this.organizerApp._populateSharedJourList(
            this.jourListElement,
            null, 
            'calendar'
        );
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
        
        const scheduleData = this.organizerApp.scheduleContext.schedule;
        const allUserJours = this.organizerApp.scheduleContext.allUserJours;

        if (scheduleData[dateKey]) {
            const itemsOnDay = scheduleData[dateKey];
            const sortedLetters = Object.keys(itemsOnDay).sort();

            sortedLetters.forEach(letter => {
                const itemData = itemsOnDay[letter]; 
                const pubItemElement = document.createElement('div');
                pubItemElement.className = 'scheduled-item';
                pubItemElement.draggable = true;
                
                const colorIndex = letter.charCodeAt(0) - 'A'.charCodeAt(0);
                pubItemElement.style.borderColor = JOUR_COLORS[colorIndex % JOUR_COLORS.length];
                
                const textSpan = document.createElement('span'); 
                textSpan.className = 'scheduled-item-text';
                textSpan.textContent = itemData.label || `Jour ${letter}`;
                pubItemElement.appendChild(textSpan);

                const thumbContainer = document.createElement('div');
                thumbContainer.className = 'scheduled-item-thumb-container';
                const thumbDiv = document.createElement('div');
                thumbDiv.className = 'scheduled-item-thumb';
                this.loadCalendarThumb(thumbDiv, letter, itemData.galleryId);
                thumbContainer.appendChild(thumbDiv);
                pubItemElement.appendChild(thumbContainer);
                
                const actionsContainer = document.createElement('div');
                actionsContainer.className = 'scheduled-item-actions';

                const downloadBtn = document.createElement('button');
                downloadBtn.className = 'scheduled-item-download-btn';
                downloadBtn.innerHTML = '💾';
                downloadBtn.title = 'Télécharger le ZIP du Jour';
                const jourDataForExport = allUserJours.find(j => j.galleryId === itemData.galleryId && j.letter === letter);
                if (jourDataForExport) {
                    downloadBtn.onclick = (e) => {
                        e.stopPropagation();
                        this.exportJourById(itemData.galleryId, jourDataForExport._id, letter);
                    };
                    actionsContainer.appendChild(downloadBtn);
                }

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'scheduled-item-delete-btn';
                deleteBtn.innerHTML = '&times;';
                deleteBtn.title = 'Supprimer cette publication du calendrier';
                deleteBtn.onclick = (e) => {
                    e.stopPropagation();
                    this.removePublicationForDate(dateObj, letter);
                };
                actionsContainer.appendChild(deleteBtn);
                pubItemElement.appendChild(actionsContainer);

                if (itemData.galleryName && itemData.galleryId !== this.organizerApp.currentGalleryId) {
                    const galleryNameSpan = document.createElement('span');
                    galleryNameSpan.className = 'scheduled-item-gallery-name';
                    galleryNameSpan.textContent = itemData.galleryName;
                    galleryNameSpan.title = itemData.galleryName;
                    pubItemElement.appendChild(galleryNameSpan);
                }
                
                pubItemElement.dataset.jourLetter = letter;
                pubItemElement.dataset.dateStr = dateKey;
                pubItemElement.dataset.galleryId = itemData.galleryId; 

                pubItemElement.addEventListener('dragstart', (e) => this._onDragStart(e, {
                    type: 'calendar',
                    date: dateKey,
                    letter: letter,
                    galleryId: itemData.galleryId,
                    data: itemData
                }, pubItemElement));
                
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
    
    buildUnscheduledJoursList() {
        if (!this.unscheduledJoursListElement) return;

        this.unscheduledJoursListElement.innerHTML = '';
        
        const scheduleData = this.organizerApp.scheduleContext.schedule;
        const allUserJours = this.organizerApp.scheduleContext.allUserJours;

        const scheduledSet = new Set();
        for (const date in scheduleData) {
            for (const letter in scheduleData[date]) {
                const item = scheduleData[date][letter];
                scheduledSet.add(`${item.galleryId}-${letter}`);
            }
        }

        const unscheduled = allUserJours.filter(jour => {
            return !scheduledSet.has(`${jour.galleryId}-${jour.letter}`);
        });

        if (unscheduled.length === 0) {
            this.unscheduledJoursListElement.innerHTML = '<p class="sidebar-info">Tous les jours sont planifiés !</p>';
            return;
        }

        unscheduled.forEach(jour => {
            const itemElement = document.createElement('div');
            itemElement.className = 'unscheduled-jour-item';
            itemElement.draggable = true;

            const contentDiv = document.createElement('div');
            contentDiv.className = 'unscheduled-jour-item-content';

            const letterSpan = document.createElement('span');
            letterSpan.className = 'unscheduled-jour-item-letter';
            letterSpan.textContent = jour.letter;
            const colorIndex = jour.letter.charCodeAt(0) - 'A'.charCodeAt(0);
            letterSpan.style.backgroundColor = JOUR_COLORS[colorIndex % JOUR_COLORS.length];
            
            const thumbDiv = document.createElement('div');
            thumbDiv.className = 'unscheduled-jour-item-thumb';
            const jourFrame = this.organizerApp.jourFrames.find(jf => jf.galleryId === jour.galleryId && jf.letter === jour.letter);
            if (jourFrame && jourFrame.imagesData.length > 0) {
                thumbDiv.style.backgroundImage = `url(${jourFrame.imagesData[0].dataURL})`;
            } else {
                thumbDiv.textContent = '...';
            }

            const gallerySpan = document.createElement('span');
            gallerySpan.className = 'unscheduled-jour-item-gallery';
            gallerySpan.textContent = jour.galleryName;

            contentDiv.appendChild(letterSpan);
            contentDiv.appendChild(thumbDiv);
            contentDiv.appendChild(gallerySpan);
            itemElement.appendChild(contentDiv);

            itemElement.addEventListener('dragstart', e => this._onDragStart(e, {
                type: 'unscheduled',
                ...jour
            }, itemElement));

            this.unscheduledJoursListElement.appendChild(itemElement);
        });
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
    
    _onDragStart(event, dragPayload, itemElement) { 
        this.dragData = dragPayload;
        event.dataTransfer.setData("application/json", JSON.stringify(dragPayload)); 
        event.dataTransfer.effectAllowed = "move";

        setTimeout(() => {
            if (dragPayload.type === 'calendar') {
                itemElement.classList.add('dragging-schedule-item');
            } else {
                itemElement.classList.add('dragging-from-list');
            }
        }, 0); 
    
        const onDragEnd = () => {
            if (dragPayload.type === 'calendar') {
                itemElement.classList.remove('dragging-schedule-item');
            } else {
                itemElement.classList.remove('dragging-from-list');
            }
            document.removeEventListener('dragend', onDragEnd);
        };
        document.addEventListener('dragend', onDragEnd, { once: true });
    }

    _onDrop(event, targetDateKey) {
        event.preventDefault();
        
        const draggingElement = document.querySelector('.dragging-schedule-item, .dragging-from-list');
        if (draggingElement) {
            draggingElement.classList.remove('dragging-schedule-item', 'dragging-from-list');
        }

        try {
            const droppedData = JSON.parse(event.dataTransfer.getData("application/json"));
            const scheduleData = this.organizerApp.scheduleContext.schedule;
            
            if (droppedData.type === 'unscheduled') {
                this.addOrUpdatePublicationForDate(
                    new Date(targetDateKey + 'T00:00:00'),
                    droppedData.letter,
                    droppedData.galleryId,
                    droppedData.galleryName
                );
            } else if (droppedData.type === 'calendar') {
                const { date: sourceDateStr, letter: sourceLetter, data: sourceData } = droppedData;
    
                if (sourceDateStr === targetDateKey) { 
                    this.buildCalendarUI(); 
                    return;
                }
    
                delete scheduleData[sourceDateStr][sourceLetter];
                if (Object.keys(scheduleData[sourceDateStr]).length === 0) {
                    delete scheduleData[sourceDateStr];
                }
    
                if (!scheduleData[targetDateKey]) {
                    scheduleData[targetDateKey] = {};
                }
                scheduleData[targetDateKey][sourceLetter] = sourceData;
    
                this.saveSchedule(); 
            }

        } catch (e) {
            console.error("Erreur lors du drop sur le calendrier:", e);
        } finally {
            this.dragData = {};
        }
    }

    async _showContextPreview(event, jourLetter, dateStr, galleryIdForJour) { 
        this.contextPreviewImages.innerHTML = ''; 
        this.contextPreviewTitle.textContent = `Aperçu Jour ${jourLetter} (${new Date(dateStr + 'T00:00:00').toLocaleDateString('fr-FR')})`;
        
        let imagesToPreviewURLs = [];
        if (galleryIdForJour === this.organizerApp.currentGalleryId) {
            const jourFrame = this.organizerApp.jourFrames.find(jf => jf.letter === jourLetter);
            if (jourFrame) {
                imagesToPreviewURLs = jourFrame.imagesData.map(imgData => imgData.dataURL);
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

    async exportJourById(galleryId, jourId, jourLetter) {
        if (!galleryId || !jourId) {
            alert("Erreur: Impossible de déterminer la galerie ou l'ID du jour pour l'exportation.");
            return;
        }

        const exportUrl = `${BASE_API_URL}/api/galleries/${galleryId}/jours/${jourId}/export`;
        console.log(`Préparation du téléchargement pour le Jour ${jourLetter}...`);

        try {
            const response = await fetch(exportUrl);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Erreur HTTP ${response.status}: ${errorText}`);
            }

            const blob = await response.blob();
            let filename = `Jour${jourLetter}.zip`;
            const contentDisposition = response.headers.get('content-disposition');
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename="?(.+)"?/i);
                if (filenameMatch && filenameMatch.length > 1) {
                    filename = filenameMatch[1];
                }
            }

            Utils.downloadDataURL(window.URL.createObjectURL(blob), filename);

        } catch (error) {
            console.error(`Erreur lors de l'exportation du Jour ${jourLetter}:`, error);
            alert(`Erreur d'exportation: ${error.message}`);
        }
    }

    isJourScheduled(galleryId, jourLetter) {
        const scheduleData = this.organizerApp.scheduleContext.schedule;
        for (const dateKey in scheduleData) {
            const dayEvents = scheduleData[dateKey];
            if (dayEvents[jourLetter] && dayEvents[jourLetter].galleryId === galleryId) {
                return true; 
            }
        }
        return false;
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
                body: JSON.stringify(this.organizerApp.scheduleContext.schedule) 
            });
            if (!response.ok) {
                throw new Error(`Failed to save schedule: ${response.statusText}`);
            }
            console.log("Schedule saved successfully for user.");
            this.organizerApp.refreshSidePanels();
            this.buildCalendarUI();
            
        } catch (e) {
            console.error("Error saving schedule data to backend:", e);
            alert("Erreur lors de la sauvegarde de la programmation."); 
        }
    }

    addOrUpdatePublicationForDate(dateObj, jourLetter, galleryId, galleryName) { 
        const dateStr = this.formatDateKey(dateObj);
        const scheduleData = this.organizerApp.scheduleContext.schedule;

        if (!scheduleData[dateStr]) {
            scheduleData[dateStr] = {};
        }
        if (scheduleData[dateStr][jourLetter] && scheduleData[dateStr][jourLetter].galleryId === galleryId) {
            return;
        }
        scheduleData[dateStr][jourLetter] = {
            label: `Jour ${jourLetter}`, 
            galleryId: galleryId,
            galleryName: galleryName
        }; 
        this.saveSchedule(); 
    }

    removePublicationForDate(dateObj, jourLetter) {
        const dateStr = this.formatDateKey(dateObj);
        const scheduleData = this.organizerApp.scheduleContext.schedule;
        if (scheduleData[dateStr] && scheduleData[dateStr][jourLetter]) {
            delete scheduleData[dateStr][jourLetter];
            if (Object.keys(scheduleData[dateStr]).length === 0) {
                delete scheduleData[dateStr];
            }
            this.saveSchedule();
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
            
            const scheduleData = this.organizerApp.scheduleContext.schedule;
            const allUserJours = this.organizerApp.scheduleContext.allUserJours;

            const scheduledJourIdentifiers = new Set();
            Object.values(scheduleData).forEach(day => {
                Object.values(day).forEach(item => {
                    const letter = item.label ? item.label.split(' ')[1] : Object.keys(day).find(k => day[k] === item);
                    if(letter) {
                       scheduledJourIdentifiers.add(`${item.galleryId}-${letter}`);
                    }
                });
            });

            let unpublishedJours = allUserJours.filter(jour => 
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
                let postsOnThisDay = scheduleData[dateKey] ? Object.keys(scheduleData[dateKey]).length : 0;
                
                while(postsOnThisDay < postsPerDay && unpublishedJours.length > 0) {
                    const jourToPlace = unpublishedJours.shift();
                    if (!scheduleData[dateKey]) {
                        scheduleData[dateKey] = {};
                    }
                    scheduleData[dateKey][jourToPlace.letter] = {
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

        } catch (error) {
            console.error("Erreur de planification auto:", error);
            this.autoScheduleInfo.textContent = `Erreur: ${error.message}`;
        } finally {
            this.runAutoScheduleBtn.disabled = false;
            setTimeout(() => this.autoScheduleInfo.textContent = "", 5000);
        }
    }
}

// =================================================================
// --- CLASSE PublicationOrganizer ---
// =================================================================
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
        // MODIFICATION : Référence au nouveau bouton
        this.switchToGalleriesBtn = document.getElementById('switchToGalleriesBtn');
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
        // MODIFICATION : Référence au nouveau bouton "Trier"
        this.switchToEditorBtn = document.getElementById('switchToEditorBtn');
        this.selectedGalleryForPreviewId = null;

        this.tabs = document.querySelectorAll('.tab-button');
        this.tabContents = document.querySelectorAll('.tab-content');

        this.croppingPage = new CroppingPage(this);
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
                    // MODIFICATION : `openGalleryInEditorBtn` est supprimé, on ne le référence plus.
                    this.activeCallingButton = previewAddBtn;
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

        // MODIFICATION : Ajout des listeners pour les nouveaux boutons
        this.switchToGalleriesBtn.addEventListener('click', () => this.activateTab('galleries'));
        this.switchToEditorBtn.addEventListener('click', () => {
            if (this.selectedGalleryForPreviewId) {
                this.handleLoadGallery(this.selectedGalleryForPreviewId);
            } else if (this.currentGalleryId) {
                this.activateTab('currentGallery');
            } else {
                alert("Aucune galerie n'est sélectionnée. Veuillez en sélectionner une dans la liste.");
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
        this.clearGalleryImagesBtn.disabled = true; 
        this.addJourFrameBtn.addEventListener('click', () => this.addJourFrame());
        
        const downloadAllBtn = document.getElementById('downloadAllScheduledBtn');
        if (downloadAllBtn) {
            downloadAllBtn.addEventListener('click', () => this.downloadAllScheduledJours());
        }

        this.createNewGalleryBtn.addEventListener('click', () => {
            this.newGalleryForm.style.display = this.newGalleryForm.style.display === 'none' ? 'flex' : 'none';
            this.newGalleryNameInput.value = ''; 
            this.newGalleryNameInput.focus();
        });
        this.cancelNewGalleryBtn.addEventListener('click', () => {
            this.newGalleryForm.style.display = 'none';
            this.newGalleryNameInput.value = '';
        });
        
        this.tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                this.activateTab(tab.dataset.tab); 
            });
        });
    }

    _populateSharedJourList(listElement, activeJourId, listType) {
        listElement.innerHTML = '';
        const jours = this.jourFrames;

        if (!jours || jours.length === 0) {
            listElement.innerHTML = '<li>Aucun jour défini.</li>';
            return;
        }

        jours.forEach(jourFrame => {
            const li = document.createElement('li');
            li.className = 'jour-list-item';
            li.dataset.jourId = jourFrame.id;

            if (activeJourId === jourFrame.id) {
                if (listType === 'cropping') li.classList.add('active-cropping-jour');
                else if (listType === 'description') li.classList.add('active-description-jour');
            }

            const textSpan = document.createElement('span');
            textSpan.className = 'jour-list-item-text';
            textSpan.textContent = `Jour ${jourFrame.letter}`;

            const iconsDiv = document.createElement('div');
            iconsDiv.className = 'jour-list-item-icons';

            const isCropped = jourFrame.hasBeenProcessedByCropper;
            const hasDescription = (jourFrame.descriptionText && jourFrame.descriptionText.trim() !== '') || 
                                 (jourFrame.descriptionHashtags && jourFrame.descriptionHashtags.trim() !== '');
            const isScheduled = this.calendarPage ? this.calendarPage.isJourScheduled(jourFrame.galleryId, jourFrame.letter) : false;

            const cropIcon = document.createElement('img');
            cropIcon.className = 'status-icon crop-icon';
            cropIcon.src = 'assets/crop.png';
            cropIcon.title = isCropped ? 'Recadré' : 'Non recadré';
            if (isCropped) cropIcon.classList.add('active');
            
            const descIcon = document.createElement('img');
            descIcon.className = 'status-icon desc-icon';
            descIcon.src = 'assets/description.png';
            descIcon.title = hasDescription ? 'Description ajoutée' : 'Pas de description';
            if (hasDescription) descIcon.classList.add('active');

            const scheduleIcon = document.createElement('img');
            scheduleIcon.className = 'status-icon schedule-icon';
            scheduleIcon.src = 'assets/calendar.png';
            scheduleIcon.title = isScheduled ? 'Planifié' : 'Non planifié';
            if (isScheduled) scheduleIcon.classList.add('active');

            iconsDiv.appendChild(cropIcon);
            iconsDiv.appendChild(descIcon);
            iconsDiv.appendChild(scheduleIcon);

            li.appendChild(textSpan);
            li.appendChild(iconsDiv);
            listElement.appendChild(li);
        });
    }

    refreshSidePanels() {
        if (this.croppingPage && document.getElementById('cropping').classList.contains('active')) {
            this.croppingPage.populateJourList();
        }
        if (this.descriptionManager && document.getElementById('description').classList.contains('active')) {
            this.descriptionManager.populateJourList();
        }
    }
    
    async downloadAllScheduledJours() {
        if (!this.calendarPage || !this.scheduleContext.schedule) {
            alert("Les données du calendrier ne sont pas chargées.");
            return;
        }
    
        const scheduledJours = [];
        const jourMap = new Map(this.scheduleContext.allUserJours.map(j => [`${j.galleryId}-${j.letter}`, j._id]));
    
        for (const date in this.scheduleContext.schedule) {
            for (const letter in this.scheduleContext.schedule[date]) {
                const item = this.scheduleContext.schedule[date][letter];
                const jourId = jourMap.get(`${item.galleryId}-${letter}`);
                if (jourId) {
                    if (!scheduledJours.some(j => j.jourId === jourId)) {
                        scheduledJours.push({
                            galleryId: item.galleryId,
                            jourId: jourId
                        });
                    }
                }
            }
        }
    
        if (scheduledJours.length === 0) {
            alert("Aucun jour n'est actuellement planifié dans le calendrier.");
            return;
        }
    
        const downloadBtn = document.getElementById('downloadAllScheduledBtn');
        const originalText = downloadBtn.textContent;
        downloadBtn.textContent = 'Préparation...';
        downloadBtn.disabled = true;
    
        try {
            const response = await fetch(`${BASE_API_URL}/api/jours/export-all-scheduled`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jours: scheduledJours })
            });
    
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Erreur serveur ${response.status}: ${errorText}`);
            }
    
            const blob = await response.blob();
            let filename = 'Planning.zip';
            const contentDisposition = response.headers.get('content-disposition');
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename="?(.+)"?/i);
                if (filenameMatch && filenameMatch.length > 1) {
                    filename = filenameMatch[1];
                }
            }
    
            Utils.downloadDataURL(window.URL.createObjectURL(blob), filename);
    
        } catch (error) {
            console.error("Erreur lors du téléchargement de tous les jours planifiés:", error);
            alert(`Erreur de téléchargement : ${error.message}`);
        } finally {
            downloadBtn.textContent = originalText;
            downloadBtn.disabled = false;
        }
    }
    
    updateUIToNoGalleryState() {
        const noGalleryActive = !this.currentGalleryId;
        
        this.createNewGalleryBtn.disabled = false; 
        
        const currentGalleryTabContent = document.getElementById('currentGallery');
        currentGalleryTabContent.querySelectorAll('button, select, input[type="file"]').forEach(el => {
            if (el.id !== 'imageSelector') el.disabled = noGalleryActive; 
        });

        // MODIFICATION : Le bouton "Trier" doit aussi être désactivé s'il n'y a pas de galerie active
        if (this.switchToEditorBtn) {
            this.switchToEditorBtn.disabled = noGalleryActive;
        }

        if (noGalleryActive) {
            this.imageGridElement.innerHTML = '<p style="text-align:center; margin-top:20px;">Chargez ou créez une galerie pour voir les images.</p>';
            this.jourFramesContainer.innerHTML = '<p style="text-align:center;">Chargez ou créez une galerie pour gérer les jours.</p>';
            this.addPhotosPlaceholderBtn.style.display = 'none';
            this.statsLabelText.textContent = "Aucune galerie chargée";
            if(this.currentGalleryUploadProgressContainer) this.currentGalleryUploadProgressContainer.style.display = 'none';
            document.getElementById('currentGalleryNameDisplay').textContent = '';
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
                this.scheduleContext = { schedule: {}, allUserJours: [] }; // Vider les données
                this.calendarPage.buildCalendarUI(); // Redessiner avec les données vides
                this.calendarPage.monthYearLabelElement.textContent = "Calendrier";
             } else {
                this.calendarPage.buildCalendarUI(); 
             }
        }
        
        const croppingTabContent = document.getElementById('cropping');
        croppingTabContent.querySelectorAll('button, select').forEach(el => el.disabled = noGalleryActive);
        if (this.croppingPage) {
            if (noGalleryActive) {
                this.croppingPage.clearEditor();
                this.croppingPage.populateJourList();
            } else if (croppingTabContent.classList.contains('active')) {
                this.croppingPage.show();
            }
        }

        const descriptionTabContent = document.getElementById('description');
        descriptionTabContent.querySelectorAll('button, textarea').forEach(el => el.disabled = noGalleryActive);
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
        if (tabId === 'currentGallery' && !this.currentGalleryId && this.selectedGalleryForPreviewId) {
            this.handleLoadGallery(this.selectedGalleryForPreviewId);
            return; // handleLoadGallery will call activateTab again.
        }

        if (tabId === 'currentGallery' && !this.currentGalleryId && !this.selectedGalleryForPreviewId) {
            alert("Aucune galerie n'est sélectionnée. Veuillez en sélectionner une dans l'onglet 'Galeries'.");
            return; // Do not switch tab
        }

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
            } else if (tabId === 'cropping') {
                if (this.currentGalleryId) {
                    this.croppingPage.show();
                }
            } else if (tabId === 'description') {
                if (!this.descriptionManager) {
                    this.descriptionManager = new DescriptionManager(this);
                }
                if (this.currentGalleryId) {
                    this.descriptionManager.show();
                }
            } else if (tabId === 'calendar') {
                if (!this.calendarPage) {
                    this.calendarPage = new CalendarPage(tabContent, this);
                }
                 if (this.currentGalleryId) {
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
        this.saveAppState();
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
                // MODIFICATION : Le clic sur le nom charge maintenant la galerie et la prévisualise
                nameSpan.onclick = () => {
                    this.showGalleryPreview(gallery._id, gallery.name);
                }; 

                const actionsDiv = document.createElement('div');
                actionsDiv.className = 'gallery-actions';
                
                const renameBtn = document.createElement('button');
                renameBtn.innerHTML = '<img src="assets/description.png" alt="Renommer" class="btn-icon">';
                renameBtn.classList.add('rename-gallery-btn');
                renameBtn.title = 'Renommer cette galerie';
                renameBtn.onclick = () => this.handleRenameGallery(gallery._id, gallery.name);
                
                const deleteBtn = document.createElement('button');
                // MODIFICATION : Le texte est remplacé par une icône
                deleteBtn.innerHTML = '<img src="assets/bin.png" alt="Supprimer" class="btn-icon">';
                deleteBtn.classList.add('delete-gallery-btn');
                deleteBtn.title = 'Supprimer cette galerie';
                deleteBtn.onclick = () => this.handleDeleteGallery(gallery._id, gallery.name);
                
                actionsDiv.appendChild(renameBtn);
                actionsDiv.appendChild(deleteBtn);
                li.appendChild(nameSpan);
                li.appendChild(actionsDiv);
                this.galleriesListElement.appendChild(li);
            });

            if (!this.selectedGalleryForPreviewId && galleries.length > 0) {
                this.showGalleryPreview(galleries[0]._id, galleries[0].name);
            }

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
        
        // MODIFICATION : Gestion de l'état des nouveaux boutons
        this.clearGalleryImagesBtn.disabled = false;
        this.switchToEditorBtn.style.display = 'block';
        this.switchToEditorBtn.disabled = false;
        
        try {
            const response = await fetch(`${BASE_API_URL}/api/galleries/${galleryId}`);
            if (!response.ok) throw new Error(`Erreur HTTP: ${response.status}`);
            const galleryDetails = await response.json();
            
            this.galleryCache[galleryId] = galleryDetails.galleryState.name;

            this.galleryPreviewGridElement.innerHTML = '';
            if (galleryDetails.images && galleryDetails.images.length > 0) {
                galleryDetails.images.forEach(imgData => {
                    const itemDiv = document.createElement('div');
                    itemDiv.className = 'grid-item'; 
                    itemDiv.style.width = `150px`;
                    itemDiv.style.height = `150px`;

                    const imgElement = document.createElement('img');
                    imgElement.src = `${BASE_API_URL}/api/uploads/${imgData.galleryId}/${Utils.getFilenameFromURL(imgData.thumbnailPath)}`;
                    imgElement.alt = imgData.originalFilename;
                    imgElement.style.objectFit = 'contain';
                    imgElement.style.width = '100%';
                    imgElement.style.height = '100%';

                    const deleteBtnPreview = document.createElement('button');
                    deleteBtnPreview.className = 'grid-item-delete-btn';
                    deleteBtnPreview.innerHTML = '&times;';
                    deleteBtnPreview.title = "Supprimer cette image de la galerie";
                    deleteBtnPreview.style.opacity = '1'; 
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
        this.clearGalleryImagesBtn.disabled = true;
        // MODIFICATION : Le bouton "Trier" doit aussi être désactivé
        this.switchToEditorBtn.style.display = 'none';
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

        if (this.croppingPage) {
            this.croppingPage.clearEditor();
        }

        if(this.galleriesUploadProgressContainer) this.galleriesUploadProgressContainer.style.display = 'none';
        if(this.currentGalleryUploadProgressContainer) this.currentGalleryUploadProgressContainer.style.display = 'none';

        await this.loadState(); 
        // MODIFICATION : Après avoir chargé une nouvelle galerie, on met à jour le bouton "Trier"
        if (this.selectedGalleryForPreviewId) {
            this.switchToEditorBtn.disabled = (this.selectedGalleryForPreviewId !== this.currentGalleryId);
        }
        this.activateTab('currentGallery'); 
        await this.loadGalleriesList(); 
        this.updateUIToNoGalleryState(); 
    }

    async loadState() {
        if (!this.currentGalleryId) {
            console.log("loadState called without a gallery ID. Resetting UI.");
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
                    alert("La galerie demandée n'a pas été trouvée. Elle a peut-être été supprimée.");
                    localStorage.removeItem('publicationOrganizer_lastGalleryId');
                    this.currentGalleryId = null;
                    this.clearGalleryPreview();
                    this.loadGalleriesList();
                    this.activateTab('galleries');
                } else {
                    throw new Error(`Erreur HTTP: ${response.status}`);
                }
                return;
            }
            const data = await response.json();

            this.gridItems = [];
            this.gridItemsDict = {};
            this.imageGridElement.innerHTML = '';
            this.jourFrames = [];
            this.jourFramesContainer.innerHTML = '';
            this.currentJourFrame = null;

            const galleryState = data.galleryState || {};
            this.galleryCache[this.currentGalleryId] = galleryState.name || 'Galerie sans nom';
            document.getElementById('currentGalleryNameDisplay').textContent = `Galerie : ${this.getCurrentGalleryName()}`;
            this.currentThumbSize = galleryState.currentThumbSize || { width: 150, height: 150 };
            this.sortOptionsSelect.value = galleryState.sortOption || 'date_desc';
            this.nextJourIndex = galleryState.nextJourIndex || 0;

            if (data.images && data.images.length > 0) {
                this.addImagesToGrid(data.images);
                this.sortGridItemsAndReflow();
            }
            
            if (data.jours && data.jours.length > 0) {
                data.jours.sort((a, b) => a.index - b.index).forEach(jourData => {
                    const newJourFrame = new JourFrameBackend(this, jourData);
                    this.jourFramesContainer.appendChild(newJourFrame.element);
                    this.jourFrames.push(newJourFrame);
                });
                this.recalculateNextJourIndex();
            }

            this.scheduleContext = {
                schedule: data.schedule || {},
                allUserJours: data.scheduleContext.allUserJours || []
            };

            if (this.calendarPage) {
                this.calendarPage.buildCalendarUI();
            }
            
            this.updateGridUsage();
            this.updateStatsLabel();
            this.updateAddPhotosPlaceholderVisibility();
            this.updateGridItemStyles();
            this.updateUIToNoGalleryState(); 

            const activeTab = galleryState.activeTab || 'currentGallery';
            this.activateTab(activeTab);


        } catch (error) {
            console.error("Erreur critique lors du chargement de l'état de la galerie:", error);
            loadingOverlay.querySelector('p').innerHTML = `Erreur de chargement: ${error.message}<br/>Veuillez rafraîchir.`;
        } finally {
            if (loadingOverlay.style.display === 'flex') {
                 loadingOverlay.style.display = 'none';
            }
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
            
            console.log(`Galerie ${galleryId} supprimée.`);
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
                if (this.croppingPage) this.croppingPage.clearEditor();
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
            alert("Erreur UI : Impossible d'afficher la progression.");
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
        // MODIFICATION : `openGalleryInEditorBtn` est supprimé
        if (!isGalleryTabActive) {
            if (this.addNewImagesBtn) this.addNewImagesBtn.disabled = true;
            if (this.addPhotosPlaceholderBtn) this.addPhotosPlaceholderBtn.disabled = true;
        }

        for (let i = 0; i < totalFiles; i += BATCH_SIZE) {
            const batchFiles = Array.from(filesArray).slice(i, i + BATCH_SIZE);
            const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
            const totalBatches = Math.ceil(totalFiles / BATCH_SIZE);

            const imageFilesInBatch = batchFiles.filter(f => f.type.startsWith('image/'));
            if (imageFilesInBatch.length === 0) {
                console.log(`[CLIENT] Lot ${batchNumber}/${totalBatches} ne contient aucune image, ignoré.`);
                continue; 
            }

            const formData = new FormData();
            for (const file of imageFilesInBatch) {
                formData.append('images', file, file.name);
            }
            
            const overallProgressPercentBeforeBatch = Math.round((filesUploadedSuccessfully / totalFiles) * 100);
            progressBarInnerEl.style.width = `${overallProgressPercentBeforeBatch}%`;
            progressBarInnerEl.textContent = `${overallProgressPercentBeforeBatch}%`;
            progressTextEl.textContent = `Envoi du lot ${batchNumber}/${totalBatches} (${imageFilesInBatch.length} images)...`;


            try {
                const batchResult = await this.sendBatch(formData, targetGalleryIdForUpload, (progressEvent) => {
                    if (progressEvent.lengthComputable) {
                        const batchUploadPercent = Math.round((progressEvent.loaded / progressEvent.total) * 100);
                        progressTextEl.textContent = `Envoi du lot ${batchNumber}/${totalBatches} (${imageFilesInBatch.length} images)... ${batchUploadPercent}%`;
                    }
                });

                if (batchResult && Array.isArray(batchResult)) {
                    allNewImageDocs.push(...batchResult);
                    filesUploadedSuccessfully += batchResult.length; 

                    if (targetGalleryIdForUpload === this.currentGalleryId) {
                        this.addImagesToGrid(batchResult); 
                    } else if (targetGalleryIdForUpload === this.selectedGalleryForPreviewId && isGalleryTabActive) {
                        await this.showGalleryPreview(this.selectedGalleryForPreviewId, this.galleryCache[this.selectedGalleryForPreviewId] || "Galerie");
                    }
                }
                progressBarInnerEl.style.backgroundColor = '#007bff'; 
                console.log(`[CLIENT] Lot ${batchNumber} traité. Images serveur pour ce lot: ${batchResult ? batchResult.length : 0}. Total serveur: ${allNewImageDocs.length}`);


            } catch (error) {
                console.error(`[CLIENT] Erreur lors de l'envoi du lot ${batchNumber}:`, error);
                progressTextEl.textContent = `Erreur sur lot ${batchNumber}. ${error.message ? String(error.message).substring(0,40) : 'Erreur'}.`;
                progressBarInnerEl.style.backgroundColor = '#dc3545'; 
                if (callingButtonElement) callingButtonElement.disabled = false;
                this.imageSelectorInput.disabled = false;
                if (!isGalleryTabActive) {
                    if (this.addNewImagesBtn) this.addNewImagesBtn.disabled = false;
                    if (this.addPhotosPlaceholderBtn) this.addPhotosPlaceholderBtn.disabled = false;
                }
                this.imageSelectorInput.value = "";
                this.activeCallingButton = null;
                return; 
            }
        }
        
        progressBarInnerEl.style.width = '100%';
        progressBarInnerEl.textContent = '100%';
        if (filesUploadedSuccessfully >= totalFiles && allNewImageDocs.length >= totalFiles) {
            progressTextEl.textContent = `Téléversement complet: ${filesUploadedSuccessfully} images ajoutées !`;
            progressBarInnerEl.style.backgroundColor = '#28a745';
        } else if (filesUploadedSuccessfully > 0) {
            progressTextEl.textContent = `Terminé: ${filesUploadedSuccessfully}/${totalFiles} images. Vérifiez console pour détails.`;
            progressBarInnerEl.style.backgroundColor = '#ffc107'; 
        } else {
             progressTextEl.textContent = `Échec. Aucune image ajoutée. Vérifiez console.`;
            progressBarInnerEl.style.backgroundColor = '#dc3545';
        }

        if (targetGalleryIdForUpload === this.currentGalleryId) {
             this.sortGridItemsAndReflow(); 
             this.updateGridUsage();
        }

        if (callingButtonElement) callingButtonElement.disabled = false;
        this.imageSelectorInput.disabled = false;
        this.imageSelectorInput.value = ""; 
        if (!isGalleryTabActive) {
            if (this.addNewImagesBtn) this.addNewImagesBtn.disabled = false;
            if (this.addPhotosPlaceholderBtn) this.addPhotosPlaceholderBtn.disabled = false;
        }

        setTimeout(() => {
            progressContainer.style.display = 'none';
            this.updateStatsLabel();
            this.updateAddPhotosPlaceholderVisibility();
        }, 5000); 

        this.activeCallingButton = null;
    }
    
    addImagesToGrid(imagesDataArray) {
        if (!Array.isArray(imagesDataArray) || imagesDataArray.length === 0) return;
        console.log(`[CLIENT addImagesToGrid] Ajout de ${imagesDataArray.length} images à la grille.`);

        let addedCount = 0;
        imagesDataArray.forEach(imgData => {
            if (imgData && imgData._id) {
                if (!this.gridItemsDict[imgData._id]) {
                    const gridItem = new GridItemBackend(imgData, this.currentThumbSize, this);
                    gridItem.element.addEventListener('click', () => this.onGridItemClick(gridItem));
                    gridItem.element.draggable = true;
                    gridItem.element.addEventListener('dragstart', (e) => {
                        e.dataTransfer.setData("application/json", JSON.stringify({
                            sourceType: 'grid',
                            imageId: gridItem.id,
                            originalFilename: gridItem.basename,
                            thumbnailPath: gridItem.thumbnailPath
                        }));
                        e.dataTransfer.effectAllowed = "copy";
                    });
                    this.imageGridElement.appendChild(gridItem.element);
                    this.gridItems.push(gridItem); 
                    this.gridItemsDict[imgData._id] = gridItem;
                    addedCount++;
                } else {
                    console.warn(`[CLIENT addImagesToGrid] L'image ${imgData._id} existe déjà.`);
                }
            } else {
                console.warn('[CLIENT addImagesToGrid] Donnée d\'image invalide:', imgData);
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
            
            if (onProgress && typeof onProgress === 'function') {
                xhr.upload.onprogress = onProgress;
            }

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const newImagesData = JSON.parse(xhr.responseText);
                        console.log(`[CLIENT sendBatch] Lot réussi, images reçues:`, newImagesData.length);
                        resolve(newImagesData);
                    } catch (e) {
                        console.error("[CLIENT sendBatch] Erreur parsing JSON du lot:", e, xhr.responseText);
                        reject(new Error("Réponse serveur invalide pour le lot."));
                    }
                } else {
                    const errorMsg = `Échec du lot (${xhr.status} ${xhr.statusText}). Réponse: ${xhr.responseText.substring(0,100)}`;
                    console.error(`[CLIENT sendBatch] Erreur serveur pour le lot: ${xhr.status} ${xhr.statusText}`, xhr.responseText);
                    reject(new Error(errorMsg));
                }
            };

            xhr.onerror = () => {
                console.error("[CLIENT sendBatch] Erreur réseau pour le lot.");
                reject(new Error("Erreur réseau lors de l'envoi du lot."));
            };
            
            xhr.onabort = () => {
                console.log("[CLIENT sendBatch] Upload du lot annulé.");
                reject(new Error("Upload du lot annulé."));
            };

            xhr.send(formData);
        });
    }


    async deleteImageFromGrid(imageId) {
        if (!this.currentGalleryId || !imageId) {
            alert("Erreur: ID de galerie ou d'image manquant.");
            return;
        }
        const gridItemToDelete = this.gridItemsDict[imageId];
        const imageNameForConfirm = gridItemToDelete ? gridItemToDelete.basename : `ID ${imageId}`;

        if (!confirm(`Voulez-vous vraiment supprimer l'image "${imageNameForConfirm}" et toutes ses utilisations (y compris versions recadrées si c'est une originale) ?`)) {
            return;
        }
        try {
            const response = await fetch(`${BASE_API_URL}/api/galleries/${this.currentGalleryId}/images/${imageId}`, {
                method: 'DELETE'
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Échec de la suppression de l'image: ${response.statusText} - ${errorText}`);
            }
            const result = await response.json(); 
            console.log(result.message);

            result.deletedImageIds.forEach(idToDelete => {
                const itemInGrid = this.gridItemsDict[idToDelete];
                if (itemInGrid) {
                    itemInGrid.element.remove();
                    this.gridItems = this.gridItems.filter(item => item.id !== idToDelete);
                    delete this.gridItemsDict[idToDelete];
                }
                this.jourFrames.forEach(jf => {
                    jf.removeImageById(idToDelete); 
                });
            });

            this.updateGridUsage(); 
            this.updateStatsLabel();
            this.updateAddPhotosPlaceholderVisibility();

        } catch (error) {
            console.error("Error deleting image from grid:", error);
            alert(`Erreur lors de la suppression de l'image : ${error.message}`);
        }
    }

    async clearAllGalleryImages() {
        const galleryIdToClear = this.selectedGalleryForPreviewId;
        if (!galleryIdToClear) {
            alert("Aucune galerie sélectionnée à vider.");
            return;
        }
        const galleryNameToConfirm = this.galleryCache[galleryIdToClear] || galleryIdToClear;

        if (!confirm(`ÊTES-VOUS SÛR de vouloir supprimer TOUTES les images de la galerie "${galleryNameToConfirm}" ?\nCette action est irréversible et affectera aussi les Jours et le Calendrier si cette galerie est chargée.`)) {
            return;
        }

        try {
            const response = await fetch(`${BASE_API_URL}/api/galleries/${galleryIdToClear}/images`, { 
                method: 'DELETE'
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Échec du vidage de la galerie: ${response.statusText} - ${errorText}`);
            }
            console.log(await response.text()); 

            this.showGalleryPreview(galleryIdToClear, galleryNameToConfirm);

            if (this.currentGalleryId === galleryIdToClear) {
                this.imageGridElement.innerHTML = '';
                this.gridItems = [];
                this.gridItemsDict = {};

                this.jourFrames.forEach(jf => {
                    jf.imagesData = []; 
                    jf.syncDataArrayFromDOM(); 
                });

                this.updateGridUsage(); 
                this.updateStatsLabel(); 
                this.updateAddPhotosPlaceholderVisibility();
                
                if (this.calendarPage && document.getElementById('calendar').classList.contains('active')) {
                    this.scheduleContext.schedule = {}; // Vider les données
                    this.calendarPage.buildCalendarUI();
                }
            }

        } catch (error) {
            console.error("Error clearing all gallery images:", error);
            alert(`Erreur lors du vidage de la galerie : ${error.message}`);
        }
    }
    
    updateGridItemStyles() {
        this.imageGridElement.style.gridTemplateColumns = `repeat(auto-fill, minmax(${this.currentThumbSize.width + parseInt(getComputedStyle(this.imageGridElement).gap || '5px')}px, 1fr))`; 
        this.gridItems.forEach(item => item.updateSize(this.currentThumbSize));
    }
    
    zoomIn() {
        const newWidth = this.currentThumbSize.width + this.zoomStep;
        const newHeight = this.currentThumbSize.height + this.zoomStep; 
        if (newWidth <= this.maxThumbSize.width && newHeight <= this.maxThumbSize.height) {
            this.currentThumbSize = { width: newWidth, height: newHeight };
            this.updateGridItemStyles();
            this.saveAppState();
        }
    }
    zoomOut() {
        const newWidth = this.currentThumbSize.width - this.zoomStep;
        const newHeight = this.currentThumbSize.height - this.zoomStep;
        if (newWidth >= this.minThumbSize.width && newHeight >= this.minThumbSize.height) {
            this.currentThumbSize = { width: newWidth, height: newHeight };
            this.updateGridItemStyles();
            this.saveAppState();
        }
    }

    sortGridItemsAndReflow() {
        const sortValue = this.sortOptionsSelect.value;
        this.gridItems.sort((a, b) => {
            let valA, valB;
            switch (sortValue) {
                case 'name_asc': case 'name_desc':
                    valA = a.basename; valB = b.basename;
                    const comparison = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
                    return sortValue.endsWith('_asc') ? comparison : -comparison;
                case 'date_asc': case 'date_desc':
                    valA = a.datetimeOriginalTs !== null ? a.datetimeOriginalTs : a.fileModTimeTs;
                    valB = b.datetimeOriginalTs !== null ? b.datetimeOriginalTs : b.fileModTimeTs;
                    if (valA === null && valB === null) return 0;
                    if (valA === null) return sortValue.endsWith('_asc') ? 1 : -1; 
                    if (valB === null) return sortValue.endsWith('_asc') ? -1 : 1; 
                    const dateComparison = valA - valB;
                    return sortValue.endsWith('_asc') ? dateComparison : -dateComparison;
                default: return 0;
            }
        });

        this.gridItems.forEach(item => this.imageGridElement.appendChild(item.element));
        this.updateGridUsage(); 
        this.saveAppState();
    }

    onGridItemClick(gridItem) { 
        if (!gridItem || !gridItem.isValid) return; 

        if (!this.currentJourFrame) {
            alert("Veuillez d'abord sélectionner ou ajouter un Jour de publication actif (cliquez sur son label).");
            return;
        }
        
        const alreadyInCurrentJourFrame = this.currentJourFrame.imagesData.some(
            imgData => imgData.imageId === gridItem.id 
        );

        if (alreadyInCurrentJourFrame) { 
            this.currentJourFrame.removeImageById(gridItem.id);
        } else {
            const combinedUsage = this.getCombinedUsageMapForMultiDay();
            const originalId = gridItem.parentImageId || gridItem.id;
            const usageArray = combinedUsage.get(originalId) || [];
            const uniqueJourLetters = new Set(usageArray.map(u => u.jourLetter));

            if (uniqueJourLetters.size >= 4) {
                alert("Une image ne peut pas être sélectionnée dans plus de 4 jours différents.");
                return;
            }

            const newElement = this.currentJourFrame.createJourItemElement({
                imageId: gridItem.id,
                originalReferencePath: gridItem.parentImageId || gridItem.id,
                dataURL: gridItem.thumbnailPath,
                isCropped: gridItem.isCroppedVersion
            });
            this.currentJourFrame.canvasWrapper.appendChild(newElement);
            this.currentJourFrame.syncDataArrayFromDOM();
        }
    }

    updateGridUsage() {
        const combinedUsage = this.getCombinedUsageMapForMultiDay(); 
        
        for (const imageId in this.gridItemsDict) { 
            const gridItem = this.gridItemsDict[imageId];
            const originalIdToCompare = gridItem.parentImageId || gridItem.id;

            const usageArray = combinedUsage.get(originalIdToCompare);

            if (usageArray && usageArray.length > 0) {
                if (usageArray.length === 1) {
                    gridItem.markUsed(usageArray[0].label, usageArray[0].color);
                } else {
                    gridItem.markUsedInMultipleDays(usageArray);
                }
            } else {
                gridItem.markUnused();
            }
        }
        this.updateStatsLabel();
    }

    getCombinedUsageMapForMultiDay() {
        const combined = new Map();
        this.jourFrames.forEach(jf => {
            const jfUsage = jf.getUsageDataForMultiple();
            for (const [imageId, usageInfos] of jfUsage.entries()) {
                if (!combined.has(imageId)) {
                    combined.set(imageId, []);
                }
                const existing = combined.get(imageId);
                existing.push(...usageInfos);
            }
        });

        for (const usages of combined.values()) {
            usages.sort((a, b) => a.jourLetter.localeCompare(b.jourLetter));
        }

        return combined;
    }


    updateStatsLabel() {
        if (!this.currentGalleryId) {
            this.statsLabelText.textContent = "Aucune galerie chargée";
            return;
        }
        const numGridImages = this.gridItems.filter(item => item.isValid).length; 
        const numJourImages = this.jourFrames.reduce((sum, jf) => sum + jf.imagesData.length, 0);
        const currentStatsText = `Grille: ${numGridImages} | Jours: ${numJourImages}`;
        
        this.statsLabelText.textContent = currentStatsText;
    }

    async addJourFrame() {
        if (!this.currentGalleryId) { alert("Aucune galerie active. Veuillez d'abord créer ou charger une galerie."); return; }
        
        this.recalculateNextJourIndex(); 
        if (this.nextJourIndex >= 26) { alert("Maximum de Jours (A-Z) atteint."); return; }
        
        this.addJourFrameBtn.disabled = true; 

        try {
            const response = await fetch(`${BASE_API_URL}/api/galleries/${this.currentGalleryId}/jours`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            if (!response.ok) {
                 let errorBody = await response.text();
                 let userMessage = `Erreur lors de la création du Jour : ${response.statusText}`;
                 try {
                    const errorJson = JSON.parse(errorBody); 
                    if (errorJson.message) userMessage = errorJson.message; 
                 } catch (e) {
                    userMessage += ` - ${errorBody}`;
                 }
                 throw new Error(userMessage);
            }
            const newJourData = await response.json(); 
            
            const newJourFrame = new JourFrameBackend(this, newJourData); 
            
            this.jourFramesContainer.appendChild(newJourFrame.element); 
            this.jourFrames.push(newJourFrame); 
            this.jourFrames.sort((a, b) => a.index - b.index); 

            this.setCurrentJourFrame(newJourFrame);
            
            this.recalculateNextJourIndex();
            this.updateStatsLabel();
            this.saveAppState(); 

            if (this.calendarPage) {
                const newJourContext = {
                    _id: newJourData._id,
                    letter: newJourData.letter,
                    galleryId: newJourData.galleryId.toString(),
                    galleryName: this.getCurrentGalleryName()
                };
                this.scheduleContext.allUserJours.push(newJourContext);
                if (document.getElementById('calendar').classList.contains('active')) {
                    this.calendarPage.buildCalendarUI();
                }
            }
            
            this.refreshSidePanels();

        } catch (error) {
            console.error("Error adding JourFrame:", error);
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
        if (!confirm(`Voulez-vous vraiment supprimer le Jour ${jourFrameToClose.letter} ?`)) return;

        const index = this.jourFrames.indexOf(jourFrameToClose);
        if (index > -1) {
            await jourFrameToClose.destroy(); 
            this.jourFrames.splice(index, 1);

            if (this.currentJourFrame === jourFrameToClose) {
                this.setCurrentJourFrame(this.jourFrames[index] || this.jourFrames[index-1] || (this.jourFrames.length > 0 ? this.jourFrames[0] : null));
            }
            this.recalculateNextJourIndex(); 
            this.updateGridUsage();
            this.updateStatsLabel();
            this.saveAppState();
            
            if (this.calendarPage) {
                const datesToRemove = [];
                for (const dateStr in this.scheduleContext.schedule) {
                    if (this.scheduleContext.schedule[dateStr][jourFrameToClose.letter] && this.scheduleContext.schedule[dateStr][jourFrameToClose.letter].galleryId === jourFrameToClose.galleryId) {
                        datesToRemove.push(new Date(dateStr + 'T00:00:00')); 
                    }
                }
                datesToRemove.forEach(dateObj => {
                    this.calendarPage.removePublicationForDate(dateObj, jourFrameToClose.letter);
                });
            }

            this.refreshSidePanels();
        }
    }
    
    recalculateNextJourIndex() {
        if (this.jourFrames.length === 0) { this.nextJourIndex = 0; return; }
        
        const existingIndices = new Set(this.jourFrames.map(jf => jf.index));
        let smallestAvailable = 0;
        while(existingIndices.has(smallestAvailable) && smallestAvailable < 26) { 
            smallestAvailable++;
        }
        this.nextJourIndex = smallestAvailable;
    }

    addOrUpdateJourInCalendar(jourFrame) {
        if (this.calendarPage && document.getElementById('calendar').classList.contains('active')) {
            this.calendarPage.buildCalendarUI(); 
        }
    }

    getCurrentGalleryName() { 
        return this.galleryCache[this.currentGalleryId] || 'Galerie';
    }
    getCachedGalleryName(galleryId) {
        return this.galleryCache[galleryId];
    }

    isJourReadyForPublishing(galleryId, letter) {
        return true;
    }
    
    async saveAppState() {
        if (!this.currentGalleryId) return;

        const appState = {
            currentThumbSize: this.currentThumbSize,
            sortOption: this.sortOptionsSelect.value,
            activeTab: document.querySelector('.tab-button.active')?.dataset.tab || 'galleries',
            nextJourIndex: this.nextJourIndex 
        };

        try {
            await fetch(`${BASE_API_URL}/api/galleries/${this.currentGalleryId}/state`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(appState)
            });
        } catch (error) {
            console.error("Error saving app state to backend:", error);
        }
    }

    findImageInAnyJour(imageId, returnFullObject = false) {
        for (const jour of this.jourFrames) {
            const foundInData = jour.imagesData.find(img => img.imageId === imageId);
            if (foundInData) {
                if (returnFullObject) {
                    return this.gridItemsDict[imageId] || { 
                        _id: foundInData.imageId,
                        galleryId: jour.galleryId, 
                        path: Utils.getFilenameFromURL(foundInData.dataURL).replace('thumb-',''), 
                        thumbnailPath: Utils.getFilenameFromURL(foundInData.dataURL), 
                        originalFilename: `Image ${foundInData.imageId}`,
                        isCroppedVersion: foundInData.isCropped
                    };
                }
                return foundInData; 
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
                const profileImage = document.querySelector('#profileButton .profile-action-icon');
                if (profileImage && data.user && data.user.picture) {
                    profileImage.src = data.user.picture;
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
        
        let galleryIdToLoad;
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
        loadingOverlay.querySelector('p').innerHTML = `Erreur d'initialisation: ${error.message}`;
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
            console.error('La déconnexion a échoué.');
            alert('Erreur lors de la déconnexion.');
        }
    } catch (error) {
        console.error('Erreur lors de la déconnexion:', error);
    }
}