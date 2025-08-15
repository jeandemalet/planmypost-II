
/* ===============================
 Fichier: public/script.js (Corrigé)
=============================== */

const BASE_API_URL = '';
const PUBLICATION_COLORS = ["red", "blue", "green", "purple", "orange", "brown", "magenta", "gold", "cyan", "darkgreen", "pink", "navy", "gray", "darkorange"];
const CALENDAR_THUMB_SIZE = { width: 30, height: 30 };
const CALENDAR_HOVER_THUMB_SIZE = { width: 100, height: 100 };
const PREVIEW_WIDTH = 100;
const PREVIEW_HEIGHT = 100;
const CROPPER_BACKGROUND_GRAY = 'rgb(46, 46, 46)';
const MONTHS_FR_ABBR = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];

let app = null;

// ===============================
// GESTIONNAIRE D'INTERNATIONALISATION (I18N)
// ===============================
class I18nManager {
    constructor(defaultLang = 'fr') {
        this.translations = {};
        this.currentLang = localStorage.getItem('preferredLang') || defaultLang;
    }

    async loadLanguage(lang) {
        if (this.translations[lang]) {
            return;
        }
        try {
            const response = await fetch(`/locales/${lang}.json`);
            if (!response.ok) throw new Error(`Could not load ${lang}.json`);
            this.translations[lang] = await response.json();
        } catch (error) {
            console.error('Error loading language file:', error);
            // Fallback to default language if loading fails
            if (lang !== 'fr') await this.loadLanguage('fr');
        }
    }

    t(key, replacements = {}) {
        const lang = this.currentLang;
        let translation = key.split('.').reduce((obj, k) => obj && obj[k], this.translations[lang]);
        
        if (!translation) {
            console.warn(`Missing translation for key: ${key}`);
            return key; // Retourne la clé si la traduction n'est pas trouvée
        }

        // Gérer les pluriels simples (ex: "photo" vs "photos")
        if (replacements.count !== undefined) {
            if (replacements.count !== 1 && this.t(key + '_plural', {})) {
                translation = this.t(key + '_plural', {});
            }
        }

        // Remplacer les variables comme {{count}}
        for (const placeholder in replacements) {
            translation = translation.replace(`{{${placeholder}}}`, replacements[placeholder]);
        }
        return translation;
    }

    async translateUI() {
        await this.loadLanguage(this.currentLang);
        
        // Traduire les éléments avec data-i18n
        document.querySelectorAll('[data-i18n]').forEach(el => {
            el.textContent = this.t(el.dataset.i18n);
        });
        
        // Traduire les attributs title et aria-label avec data-i18n-title
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const translation = this.t(el.dataset.i18nTitle);
            el.title = translation;
            if (el.getAttribute('aria-label')) {
                el.setAttribute('aria-label', translation);
            }
        });
        
        // Traduire les placeholders avec data-i18n-placeholder
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const translation = this.t(el.dataset.i18nPlaceholder);
            el.placeholder = translation;
            if (el.hasAttribute('data-placeholder')) {
                el.setAttribute('data-placeholder', translation);
            }
        });
    }

    async setLanguage(lang) {
        this.currentLang = lang;
        localStorage.setItem('preferredLang', lang);
        
        // Mettre à jour l'attribut lang du HTML
        const htmlRoot = document.getElementById('htmlRoot') || document.documentElement;
        htmlRoot.setAttribute('lang', lang);
        
        await this.translateUI();
    }
}

// Initialisez-le au niveau global
const i18n = new I18nManager('fr');

class Utils {
    static async loadImage(urlOrFile) {
        // [LOG] Log au début du chargement de l'image
        console.log('[Utils.loadImage] Demande de chargement pour:', typeof urlOrFile === 'string' ? urlOrFile : urlOrFile.name);
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.onload = () => {
                // [LOG] Log lorsque l'événement onload est déclenché
                console.log(`[Utils.loadImage] 'onload' déclenché pour: ${img.src.substring(0, 100)}...`);

                // [CORRECTION] VÉRIFICATION CRUCIALE des dimensions de l'image.
                // Un `onload` peut se déclencher même si l'image est corrompue ou non décodée,
                // résultant en des dimensions de 0x0, ce qui cause un canvas noir.
                if (img.naturalWidth === 0 || img.naturalHeight === 0) {
                    console.error(`❌ [Utils.loadImage] ERREUR : L'image s'est chargée mais avec des dimensions invalides de 0x0.`, "Source:", typeof urlOrFile === 'string' ? urlOrFile : urlOrFile.name);
                    reject(new Error('L\'image s\'est chargée mais ses dimensions sont invalides (0x0).'));
                } else {
                    console.log(`✅ [Utils.loadImage] Image validée avec dimensions: ${img.naturalWidth}x${img.naturalHeight}`);
                    resolve(img);
                }
            };
            img.onerror = (err) => {
                // [LOG] Log détaillé en cas d'erreur de chargement réseau.
                console.error("❌ [Utils.loadImage] ERREUR 'onerror' déclenchée:", err, "Source:", typeof urlOrFile === 'string' ? urlOrFile : urlOrFile.name);
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
            ctx.fillText("ERR", targetWidth / 2, targetHeight / 2);
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
        const debouncedFunction = function (...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), delay);
        };

        // Ajouter la méthode cancel pour annuler les appels en attente
        debouncedFunction.cancel = function () {
            clearTimeout(timeout);
            timeout = null;
        };

        return debouncedFunction;
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
        this.deleteButton.innerHTML = '×';
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
                this.imgElement.src = this.imagePath;
            } else {
                this.drawErrorPlaceholderImg(`Img ${this.basename.substring(0, 10)}`);
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

class PublicationFrameBackend {
    constructor(organizer, publicationData) {
        this.organizer = organizer;
        this.id = publicationData._id;
        this.galleryId = publicationData.galleryId;
        this.index = publicationData.index;
        this.letter = publicationData.letter;
        this.autoCropSettings = publicationData.autoCropSettings || { vertical: 'none', horizontal: 'none' };
        this.maxImages = 20;
        this.imagesData = [];
        this.descriptionText = publicationData.descriptionText || '';

        this.element = document.createElement('div');
        this.element.className = 'publication-frame';
        this.element.dataset.id = `publication-${this.letter}`;
        this.element.dataset.publicationDbId = this.id;

        this.labelElement = document.createElement('button');
        this.labelElement.className = 'publication-frame-label';
        this.labelElement.textContent = `Publication ${this.letter}`;

        this.canvasWrapper = document.createElement('div');
        this.canvasWrapper.className = 'publication-frame-canvas-wrapper';

        const buttonsContainer = document.createElement('div');
        buttonsContainer.className = 'publication-frame-buttons';

        this.exportPublicationImagesBtn = document.createElement('button');
        this.exportPublicationImagesBtn.textContent = 'Exporter Images';

        this.deletePublicationBtn = document.createElement('button');
        this.deletePublicationBtn.textContent = '🗑️ Suppr. Publication';
        this.deletePublicationBtn.className = 'danger-btn-small';

        buttonsContainer.appendChild(this.exportPublicationImagesBtn);
        buttonsContainer.appendChild(this.deletePublicationBtn);

        this.element.appendChild(this.labelElement);
        this.element.appendChild(this.canvasWrapper);
        this.element.appendChild(buttonsContainer);

        this.labelElement.addEventListener('click', () => this.organizer.setCurrentPublicationFrame(this));
        this.element.addEventListener('click', (e) => {
            if (e.target === this.element || e.target === this.canvasWrapper) {
                this.organizer.setCurrentPublicationFrame(this);
            }
        });

        this.exportPublicationImagesBtn.addEventListener('click', () => this.exportPublicationAsZip());
        this.deletePublicationBtn.addEventListener('click', () => this.organizer.closePublicationFrame(this));

        this.debouncedSave = Utils.debounce(() => this.save(), 1500);

        this.placeholderElement = document.createElement('div');
        this.placeholderElement.className = 'publication-image-placeholder';

        this.canvasWrapper.addEventListener('dragover', (e) => this.onDragOver(e));
        this.canvasWrapper.addEventListener('dragleave', (e) => this.onDragLeave(e));
        this.canvasWrapper.addEventListener('drop', (e) => this.onDrop(e));

        if (publicationData.images && Array.isArray(publicationData.images)) {
            publicationData.images.sort((a, b) => a.order - b.order).forEach(imgEntry => {
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
        const afterElement = this.getDragAfterElement(this.canvasWrapper, e.clientX);
        if (afterElement == null) {
            this.canvasWrapper.appendChild(this.placeholderElement);
        } else {
            this.canvasWrapper.insertBefore(this.placeholderElement, afterElement);
        }
    }

    getDragAfterElement(container, x) {
        const draggableElements = [...container.querySelectorAll('.publication-image-item:not(.dragging-publication-item), .cropping-publication-item:not(.dragging-publication-item)')];
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

    async onDrop(e) {
        e.preventDefault();
        const targetRibbon = e.currentTarget; // Le ruban où l'élément est déposé
        targetRibbon.classList.remove('drag-over');
        if (this.placeholderElement.parentNode) {
            this.placeholderElement.parentNode.removeChild(this.placeholderElement);
        }

        const jsonData = e.dataTransfer.getData("application/json");
        if (!jsonData) return;

        try {
            const data = JSON.parse(jsonData);
            const droppedImageId = data.imageId;

            // --- MANIPULATION DES DONNÉES EN PREMIER (LA PARTIE CRUCIALE) ---
            let itemData;

            // Cas 1 : Déplacement depuis une autre publication
            if (data.sourceType === 'publication') {
                const sourcePublication = this.organizer.publicationFrames.find(pf => pf.id === data.sourcePublicationId);
                if (sourcePublication) {
                    const itemIndex = sourcePublication.imagesData.findIndex(d => d.imageId === droppedImageId);
                    if (itemIndex > -1) {
                        // 1. Récupérer les données de l'élément
                        itemData = sourcePublication.imagesData[itemIndex];
                        // 2. Retirer l'élément du tableau de la source
                        sourcePublication.imagesData.splice(itemIndex, 1);
                    }
                }
            }
            // Cas 2 : Ajout depuis la grille de l'onglet "Tri"
            else if (data.sourceType === 'grid') {
                const gridItem = this.organizer.gridItemsDict[droppedImageId];
                if (gridItem) {
                    itemData = {
                        imageId: gridItem.id,
                        originalReferencePath: gridItem.parentImageId || gridItem.id,
                        dataURL: gridItem.thumbnailPath,
                        isCropped: gridItem.isCroppedVersion
                    };
                }
            }

            if (!itemData) return;

            // 3. Ajouter l'élément au tableau de la destination (this)
            const afterElement = this.getDragAfterElement(targetRibbon, e.clientX);
            let insertIndex = this.imagesData.length;
            if (afterElement) {
                const afterElementId = afterElement.dataset.imageId;
                const idx = this.imagesData.findIndex(d => d.imageId === afterElementId);
                if (idx !== -1) insertIndex = idx;
            }
            this.imagesData.splice(insertIndex, 0, itemData);

            // --- SAUVEGARDE ET RAFRAÎCHISSEMENT GLOBAL ---
            // Sauvegarde les deux publications si elles ont changé
            await this.save();
            if (data.sourceType === 'publication' && data.sourcePublicationId !== this.id) {
                const sourcePublication = this.organizer.publicationFrames.find(pf => pf.id === data.sourcePublicationId);
                if (sourcePublication) await sourcePublication.save();
            }

            // 4. On demande à l'application de TOUT rafraîchir à partir des données mises à jour
            this.organizer.refreshPublicationViews();

        } catch (err) {
            console.error("Erreur lors du drop :", err);
        } finally {
            const dragging = document.querySelector('.dragging-publication-item');
            if (dragging) dragging.classList.remove('dragging-publication-item');
        }
    }

    syncDataArrayFromDOM() {
        const newImagesData = [];
        const imageElements = this.canvasWrapper.querySelectorAll('.publication-image-item');
        const allImageDataById = new Map();
        this.organizer.publicationFrames.forEach(pf => {
            pf.imagesData.forEach(data => allImageDataById.set(data.imageId, data));
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

        // Mettre à publication la liste des publications à planifier
        this.updateUnscheduledPublicationsList();
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
        const newElement = this.createPublicationItemElement(imageItemData);
        this.canvasWrapper.appendChild(newElement);

        // Mettre à publication la grille
        this.organizer.updateGridUsage();
    }

    createPublicationItemElement(imageItemData) {
        const itemElement = document.createElement('div');
        itemElement.className = 'publication-image-item';
        itemElement.style.backgroundImage = `url(${imageItemData.dataURL})`;
        itemElement.draggable = true;
        itemElement.dataset.imageId = imageItemData.imageId;
        itemElement.addEventListener('dragstart', (e) => {
            e.target.classList.add('dragging-publication-item');
            e.dataTransfer.setData("application/json", JSON.stringify({
                sourceType: 'publication',
                sourcePublicationId: this.id,
                imageId: imageItemData.imageId,
            }));
            e.dataTransfer.effectAllowed = "move";
        });
        itemElement.addEventListener('dragend', (e) => {
            e.target.classList.remove('dragging-publication-item');
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
            this.element.classList.add('publication-frame-processed');
        } else {
            this.element.classList.remove('publication-frame-processed');
        }
    }

    // Fonction utilitaire pour mettre à publication la liste des publications à planifier
    updateUnscheduledPublicationsList() {
        console.log(`🔄 updateUnscheduledPublicationsList appelée pour publication ${this.letter}`);
        if (this.organizer && this.organizer.calendarPage) {
            // S'assurer que ce publication est dans allUserPublications
            this.organizer.ensureJourInAllUserPublications(this);
            console.log(`✅ Mise à publication de la liste des publications à planifier`);
            this.organizer.calendarPage.buildUnscheduledPublicationsList();
        } else {
            console.log(`❌ Pas de calendarPage disponible`);
        }
    }

    async exportPublicationAsZip() {
        if (this.imagesData.length === 0) {
            alert(`Le Publication ${this.letter} est vide. Aucun ZIP ne sera généré.`);
            return;
        }
        if (!this.galleryId || !this.id) {
            alert("Erreur: Impossible de déterminer la galerie ou l'ID du publication pour l'exportation.");
            return;
        }
        const exportUrl = `${BASE_API_URL}/api/galleries/${this.galleryId}/publications/${this.id}/export`;
        const originalButtonText = this.exportPublicationImagesBtn.textContent;
        this.exportPublicationImagesBtn.textContent = 'Préparation...';
        this.exportPublicationImagesBtn.disabled = true;
        try {
            const response = await fetch(exportUrl);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Erreur HTTP ${response.status}: ${errorText}`);
            }
            const blob = await response.blob();
            let filename = `Publication${this.letter}.zip`;
            const contentDisposition = response.headers.get('content-disposition');
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename="?(.+)"?/i);
                if (filenameMatch && filenameMatch.length > 1) {
                    filename = filenameMatch[1];
                }
            }
            Utils.downloadDataURL(window.URL.createObjectURL(blob), filename);
        } catch (error) {
            console.error(`Erreur lors de l'exportation du Publication ${this.letter}:`, error);
            alert(`Erreur d'exportation: ${error.message}`);
        } finally {
            this.exportPublicationImagesBtn.textContent = originalButtonText;
            this.exportPublicationImagesBtn.disabled = false;
        }
    }

    async save() {
        if (!this.id || !app.currentGalleryId) {
            return false;
        }
        const imagesToSave = this.imagesData.map((imgData, idx) => ({ imageId: imgData.imageId, order: idx }));
        const payload = {
            images: imagesToSave,
            descriptionText: this.descriptionText
        };
        try {
            const response = await fetch(`${BASE_API_URL}/api/galleries/${app.currentGalleryId}/publications/${this.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                const errorData = await response.text();
                throw new Error(`Failed to save Publication ${this.letter}: ${response.statusText} - ${errorData}`);
            }
            await response.json();
            if (this.organizer && this.organizer.calendarPage && document.getElementById('calendar').classList.contains('active')) {
                this.organizer.calendarPage.buildCalendarUI();
            }
            return true;
        } catch (error) {
            console.error(`Error saving Publication ${this.letter}:`, error);
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
        this.canvasWrapper.querySelectorAll('.publication-image-item').forEach(element => {
            const currentImageId = element.dataset.imageId;
            const modificationOutput = modifiedDataMap[currentImageId];
            if (modificationOutput) {
                changesApplied = true;
                if (Array.isArray(modificationOutput)) {
                    modificationOutput.forEach(newImageDoc => {
                        const newData = this.createImageItemDataFromBackendDoc(newImageDoc);
                        newImagesDataArray.push(newData);
                        finalElements.push(this.createPublicationItemElement(newData));
                    });
                } else {
                    const newData = this.createImageItemDataFromBackendDoc(modificationOutput);
                    newImagesDataArray.push(newData);
                    finalElements.push(this.createPublicationItemElement(newData));
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
            // Mettre à publication la liste des publications à planifier après modification par le cropper
            this.updateUnscheduledPublicationsList();
        }
    }

    createImageItemDataFromBackendDoc(imageDoc) {
        // Gère à la fois les documents bruts de l'API (avec _id) et les instances
        // de la classe GridItemBackend (avec id).
        const id = imageDoc._id || imageDoc.id;

        return {
            imageId: id,
            originalReferencePath: imageDoc.parentImageId || id,
            dataURL: `${BASE_API_URL}/api/uploads/${imageDoc.galleryId}/${Utils.getFilenameFromURL(imageDoc.thumbnailPath)}`,
            isCropped: imageDoc.isCroppedVersion || false
        };
    }

    getUsageDataForMultiple() {
        const usage = new Map();
        const color = PUBLICATION_COLORS[this.index % PUBLICATION_COLORS.length];
        this.imagesData.forEach((imgData, i) => {
            const label = `${this.letter}${i + 1}`;
            const originalId = imgData.originalReferencePath;
            if (!usage.has(originalId)) {
                usage.set(originalId, []);
            }
            usage.get(originalId).push({ label: label, color: color, jourLetter: this.letter });
        });
        return usage;
    }

    async destroy() {
        if (this.id && app.currentGalleryId) {
            try {
                await fetch(`${BASE_API_URL}/api/galleries/${app.currentGalleryId}/publications/${this.id}`, { method: 'DELETE' });
            } catch (error) {
                console.error(`Error deleting Publication ${this.letter} from backend:`, error);
            }
        }
        if (this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        this.imagesData = [];
    }
}

class AutoCropper {
    constructor(organizerApp, croppingPage) {
        this.organizerApp = organizerApp;
        this.croppingPage = croppingPage;
        this.runBtn = document.getElementById('runAutoCropBtn');
        this.progressElement = document.getElementById('autoCropProgress');
        this.radioGroups = {
            vertical: document.querySelectorAll('input[name="vertical_treatment"]'),
            horizontal: document.querySelectorAll('input[name="horizontal_treatment"]')
        };

        // Éléments pour la sélection des publications
        this.scopeRadios = document.querySelectorAll('input[name="crop_scope"]');
        this.jourSelectionContainer = document.getElementById('publicationSelectionContainer');
        this.publicationCheckboxList = document.getElementById('publicationCheckboxList');
        this.selectAllBtn = document.getElementById('selectAllPublicationsBtn');
        this.deselectAllBtn = document.getElementById('deselectAllPublicationsBtn');

        this.isRunning = false;
        this.selectedPublicationIds = new Set();
        this.debouncedSaveSettings = Utils.debounce(() => this.saveSettings(), 1000);

        this._initEventListeners();
        this._initJourSelection();
    }

    _initEventListeners() {
        this.runBtn.addEventListener('click', () => this.run());

        Object.values(this.radioGroups).forEach(nodeList => {
            nodeList.forEach(radio => {
                radio.addEventListener('change', () => this.debouncedSaveSettings());
            });
        });

        // Gestion du changement de portée (Tout/Sélection)
        this.scopeRadios.forEach(radio => {
            radio.addEventListener('change', () => this._onScopeChange());
        });

        // Boutons de sélection/désélection
        this.selectAllBtn.addEventListener('click', () => this._selectAllPublications());
        this.deselectAllBtn.addEventListener('click', () => this._deselectAllPublications());
    }

    _initJourSelection() {
        this._onScopeChange(); // Initialise l'affichage selon la sélection actuelle
    }

    async saveSettings() {
        const publicationFrame = this.croppingPage.currentSelectedPublicationFrame;
        if (!publicationFrame || this.isRunning) return;
        const settings = {
            vertical: document.querySelector('input[name="vertical_treatment"]:checked').value,
            horizontal: document.querySelector('input[name="horizontal_treatment"]:checked').value
        };
        publicationFrame.autoCropSettings = settings;
        try {
            await fetch(`${BASE_API_URL}/api/galleries/${publicationFrame.galleryId}/publications/${publicationFrame.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ autoCropSettings: settings })
            });
        } catch (error) {
            console.error('Failed to save auto-crop settings:', error);
        }
    }

    loadSettingsForPublication(publicationFrame) {
        if (!publicationFrame) return;
        const settings = publicationFrame.autoCropSettings || { vertical: 'none', horizontal: 'none' };
        const vertRadio = document.querySelector(`input[name="vertical_treatment"][value="${settings.vertical}"]`);
        if (vertRadio) vertRadio.checked = true;
        const horizRadio = document.querySelector(`input[name="horizontal_treatment"][value="${settings.horizontal}"]`);
        if (horizRadio) horizRadio.checked = true;
    }

    _onScopeChange() {
        // CORRECTION : Utilisation sécurisée avec vérification null
        const scopeElement = document.querySelector('input[name="crop_scope"]:checked');
        const selectedScope = scopeElement ? scopeElement.value : 'all';

        if (selectedScope === 'selection') {
            this.jourSelectionContainer.style.display = 'block';
            this._populateJourCheckboxes();
        } else {
            this.jourSelectionContainer.style.display = 'none';
        }
    }

    _populateJourCheckboxes() {
        this.publicationCheckboxList.innerHTML = '';

        if (!this.organizerApp.publicationFrames || this.organizerApp.publicationFrames.length === 0) {
            this.publicationCheckboxList.innerHTML = '<div style="padding: 15px; text-align: center; color: #6c757d; font-size: 0.85em;">Aucun publication disponible</div>';
            return;
        }

        this.organizerApp.publicationFrames.forEach((publicationFrame, index) => {
            const item = document.createElement('div');
            item.className = 'publication-checkbox-item';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `publication-checkbox-${publicationFrame.id}`;
            checkbox.dataset.publicationId = publicationFrame.id;
            checkbox.checked = this.selectedPublicationIds.has(publicationFrame.id);

            const label = document.createElement('label');
            label.className = 'publication-checkbox-label';
            label.htmlFor = checkbox.id;

            // Indicateur de couleur de la publication
            const colorIndicator = document.createElement('div');
            colorIndicator.className = 'publication-color-indicator';
            const publicationColor = PUBLICATION_COLORS[index % PUBLICATION_COLORS.length];
            colorIndicator.style.backgroundColor = publicationColor;

            // Nom de la publication
            const publicationName = document.createElement('span');
            publicationName.textContent = `Publication ${publicationFrame.letter}`;

            // Nombre d'images
            const imageCount = document.createElement('span');
            imageCount.className = 'publication-image-count';
            imageCount.textContent = publicationFrame.imagesData.length;

            label.appendChild(colorIndicator);
            label.appendChild(jourName);
            label.appendChild(imageCount);

            item.appendChild(checkbox);
            item.appendChild(label);

            // Gestion des événements
            const updateSelection = () => {
                if (checkbox.checked) {
                    this.selectedPublicationIds.add(publicationFrame.id);
                    item.classList.add('selected');
                    this._highlightPublicationFrame(publicationFrame, true);
                } else {
                    this.selectedPublicationIds.delete(publicationFrame.id);
                    item.classList.remove('selected');
                    this._highlightPublicationFrame(publicationFrame, false);
                }
            };

            checkbox.addEventListener('change', updateSelection);
            item.addEventListener('click', (e) => {
                if (e.target !== checkbox) {
                    checkbox.checked = !checkbox.checked;
                    updateSelection();
                }
            });

            // Appliquer l'état initial
            if (checkbox.checked) {
                item.classList.add('selected');
                this._highlightPublicationFrame(publicationFrame, true);
            }

            this.publicationCheckboxList.appendChild(item);
        });

    }

    _selectAllPublications() {
        this.organizerApp.publicationFrames.forEach(publicationFrame => {
            this.selectedPublicationIds.add(publicationFrame.id);
            this._highlightPublicationFrame(publicationFrame, true);
        });

        // Mettre à publication les checkboxes
        this.publicationCheckboxList.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.checked = true;
            checkbox.closest('.publication-checkbox-item').classList.add('selected');
        });
    }

    _deselectAllPublications() {
        this.organizerApp.publicationFrames.forEach(publicationFrame => {
            this.selectedPublicationIds.delete(publicationFrame.id);
            this._highlightPublicationFrame(publicationFrame, false);
        });

        // Mettre à publication les checkboxes
        this.publicationCheckboxList.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.checked = false;
            checkbox.closest('.publication-checkbox-item').classList.remove('selected');
        });
    }

    _highlightPublicationFrame(publicationFrame, highlight) {
        if (!publicationFrame.element) return;

        if (highlight) {
            publicationFrame.element.style.boxShadow = '0 0 0 3px rgba(33, 150, 243, 0.3)';
            publicationFrame.element.style.borderColor = '#2196f3';
            publicationFrame.element.style.transform = 'scale(1.02)';
        } else {
            publicationFrame.element.style.boxShadow = '';
            publicationFrame.element.style.borderColor = '';
            publicationFrame.element.style.transform = '';
        }
    }



    // Méthode publique pour rafraîchir la liste des publications (appelée quand des publications sont ajoutés/supprimés)
    refreshJourSelection() {
        if (this.jourSelectionContainer.style.display !== 'none') {
            this._populateJourCheckboxes();
        }
    }

    async run() {
        // CORRECTION : Utilisation sécurisée avec vérification null
        const scopeElement = document.querySelector('input[name="crop_scope"]:checked');
        const scope = scopeElement ? scopeElement.value : 'all';
        let publicationsToProcess = [];

        if (scope === 'all') {
            publicationsToProcess = this.organizerApp.publicationFrames;
        } else if (scope === 'selection') {
            publicationsToProcess = this.organizerApp.publicationFrames.filter(jf => this.selectedPublicationIds.has(jf.id));
        }

        if (publicationsToProcess.length === 0) {
            alert("Aucun publication sélectionné à traiter.");
            return;
        }

        if (this.isRunning) return;

        this.isRunning = true;
        this.runBtn.disabled = true;
        this.progressElement.style.display = 'block';
        this.progressElement.textContent = `Préparation...`;

        const settings = {
            vertical: document.querySelector('input[name="vertical_treatment"]:checked').value,
            horizontal: document.querySelector('input[name="horizontal_treatment"]:checked').value
        };

        for (const publication of publicationsToProcess) {
            let publicationNeedsUpdate = false;
            const modifiedDataMap = {};
            const newImagesData = [];

            if (publication.imagesData.length === 0) continue;

            for (let i = 0; i < publication.imagesData.length; i++) {
                const imgData = publication.imagesData[i];

                this.progressElement.textContent = `Traitement Publication ${publication.letter} (${i + 1}/${publication.imagesData.length})...`;

                const originalGridItem = this.organizerApp.gridItemsDict[imgData.originalReferencePath];
                if (!originalGridItem) {
                    console.warn(`Image originale ${imgData.originalReferencePath} non trouvée.`);
                    newImagesData.push(imgData); // Conserve l'image telle quelle
                    continue;
                }

                try {
                    const image = await Utils.loadImage(originalGridItem.imagePath);
                    const isVertical = image.naturalHeight > image.naturalWidth * 1.02;
                    const setting = isVertical ? settings.vertical : settings.horizontal;

                    if (setting === 'none') {
                        if (imgData.isCropped) {
                            // Il s'agit d'une image recadrée, nous devons la restaurer à l'originale.
                            const originalGridItem = this.organizerApp.gridItemsDict[imgData.originalReferencePath];

                            if (originalGridItem) {
                                // On reconstruit manuellement l'objet de données pour le Jour
                                // en utilisant les propriétés de l'instance GridItemBackend de l'original.
                                // C'est la correction cruciale pour garantir la cohérence des données.
                                const restoredImageData = {
                                    imageId: originalGridItem.id,
                                    originalReferencePath: originalGridItem.parentImageId || originalGridItem.id,
                                    dataURL: originalGridItem.thumbnailPath,
                                    isCropped: originalGridItem.isCroppedVersion
                                };
                                newImagesData.push(restoredImageData);
                                publicationNeedsUpdate = true;
                            } else {
                                // Sécurité : si l'original est introuvable, on garde la version recadrée
                                // pour éviter la perte de données (l'image qui disparaît).
                                console.warn(`Image originale ${imgData.originalReferencePath} non trouvée pour la restauration. Conservation de la version recadrée.`);
                                newImagesData.push(imgData);
                            }
                        } else {
                            // C'est déjà l'image originale, on la conserve telle quelle.
                            newImagesData.push(imgData);
                        }
                        continue; // On passe à l'image suivante de la publication.
                    }

                    // Si l'image est déjà recadrée et que le réglage n'est pas "none", on la saute
                    if (imgData.isCropped) {
                        newImagesData.push(imgData);
                        continue;
                    }

                    let dataURL = null;
                    let cropInfo = '';
                    let filenameSuffix = '';

                    if (setting === 'auto' && isVertical) {
                        const result = await smartcrop.crop(image, { width: image.naturalWidth, height: image.naturalWidth * 4 / 3 });
                        const bestCrop = result.topCrop;
                        const tempCanvas = document.createElement('canvas');
                        tempCanvas.width = bestCrop.width;
                        tempCanvas.height = bestCrop.height;
                        const tempCtx = tempCanvas.getContext('2d');
                        tempCtx.drawImage(image, bestCrop.x, bestCrop.y, bestCrop.width, bestCrop.height, 0, 0, bestCrop.width, bestCrop.height);
                        dataURL = tempCanvas.toDataURL('image/jpeg', 0.92);
                        cropInfo = 'recadrage_auto_3x4';
                        filenameSuffix = 'auto_3x4';
                    } else if (setting === 'whitebars') {
                        const targetRatio = 3 / 4;
                        let finalWidth, finalHeight, pasteX, pasteY;
                        if (image.naturalWidth / image.naturalHeight > targetRatio) {
                            finalWidth = image.naturalWidth;
                            finalHeight = Math.round(image.naturalWidth / targetRatio);
                        } else {
                            finalHeight = image.naturalHeight;
                            finalWidth = Math.round(image.naturalHeight * targetRatio);
                        }
                        pasteX = Math.round((finalWidth - image.naturalWidth) / 2);
                        pasteY = Math.round((finalHeight - image.naturalHeight) / 2);

                        const tempCanvas = document.createElement('canvas');
                        tempCanvas.width = finalWidth; tempCanvas.height = finalHeight;
                        const tempCtx = tempCanvas.getContext('2d');
                        tempCtx.fillStyle = 'white';
                        tempCtx.fillRect(0, 0, finalWidth, finalHeight);
                        tempCtx.drawImage(image, pasteX, pasteY);
                        dataURL = tempCanvas.toDataURL('image/jpeg', 0.92);
                        cropInfo = 'barres_blanches_3x4';
                        filenameSuffix = 'barres_3x4';
                    }

                    if (dataURL) {
                        const response = await fetch(`${BASE_API_URL}/api/galleries/${publication.galleryId}/images/${originalGridItem.id}/crop`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ imageDataUrl: dataURL, cropInfo, filenameSuffix })
                        });
                        if (!response.ok) throw new Error(await response.text());
                        const newImageDoc = await response.json();
                        if (!this.organizerApp.gridItemsDict[newImageDoc._id]) {
                            const newGridItem = new GridItemBackend(newImageDoc, this.organizerApp.currentThumbSize, this.organizerApp);
                            this.organizerApp.gridItems.push(newGridItem);
                            this.organizerApp.gridItemsDict[newImageDoc._id] = newGridItem;
                        }
                        modifiedDataMap[imgData.imageId] = newImageDoc;
                        newImagesData.push(publication.createImageItemDataFromBackendDoc(newImageDoc));
                        publicationNeedsUpdate = true;
                    } else {
                        // Si aucun recadrage n'a été appliqué, on garde l'ancienne data
                        newImagesData.push(imgData);
                    }
                } catch (err) {
                    console.error(`Erreur auto-crop pour ${originalGridItem.basename}:`, err);
                    this.progressElement.textContent = `Erreur sur l'image ${i + 1} de la Publication ${publication.letter}.`;
                    await new Promise(resolve => setTimeout(resolve, 1500));
                    newImagesData.push(imgData);
                }
            }

            if (publicationNeedsUpdate) {
                publication.imagesData = newImagesData;

                // Rafraîchit le DOM du PublicationFrame
                publication.canvasWrapper.innerHTML = '';
                publication.imagesData.forEach(data => {
                    const el = publication.createPublicationItemElement(data);
                    publication.canvasWrapper.appendChild(el);
                });

                publication.debouncedSave();
                publication.checkAndApplyCroppedStyle();
                publication.updateUnscheduledPublicationsList();
            }
        }

        // On s'assure de rafraîchir la vue principale si elle est affichée.
        if (this.croppingPage.isAllPhotosViewActive) {
            this.croppingPage.renderAllPhotosGroupedView();
        }

        this.organizerApp.refreshSidePanels();
        this.progressElement.textContent = 'Terminé !';
        setTimeout(() => {
            this.progressElement.style.display = 'none';
            this.runBtn.disabled = false;
            this.isRunning = false;
        }, 2000);
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
        this.currentPublicationFrameInstance = null;
        this.cropRectDisplay = null;
        this.isDragging = false;
        this.dragMode = null;
        this.isLoading = false; // Verrouillage anti-race condition
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
            if (this.currentImageIndex < 0 || this.currentImageIndex >= this.imagesToCrop.length) { return; }
            const imageToDelete = this.imagesToCrop[this.currentImageIndex];
            const imageIdToDelete = imageToDelete.currentImageId;
            const originalGridItem = this.organizer.gridItemsDict[imageToDelete.originalReferenceId];
            const displayName = originalGridItem ? originalGridItem.basename : `Image ID ${imageToDelete.originalReferenceId}`;
            if (this.currentPublicationFrameInstance) {
                this.currentPublicationFrameInstance.removeImageById(imageIdToDelete);
            }
            this.imagesToCrop.splice(this.currentImageIndex, 1);
            this.croppingPage._populateThumbnailStrip(this.currentPublicationFrameInstance);
            this.infoLabel.textContent = `Image ${displayName} supprimée de la publication.`;
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

    refreshLayout() {
        // [LOG] Log pour voir quand le layout est rafraîchi
        console.log('[CroppingManager] refreshLayout() appelé.');
        if (this.currentImageObject) {
            this._waitForContainerAndResize();
        }
    }

    _waitForContainerAndResize(attempts = 0) {
        const container = this.canvasElement.parentElement;
        
        // Si le conteneur a une taille suffisante, procéder
        if (container && container.clientHeight >= 100) {
            this._handleResize();
            return;
        }
        
        // Sinon, réessayer jusqu'à 10 fois avec un délai croissant
        if (attempts < 10) {
            const delay = Math.min(50 + attempts * 20, 200); // 50ms à 200ms max
            setTimeout(() => {
                this._waitForContainerAndResize(attempts + 1);
            }, delay);
        } else {
            console.warn('[CroppingManager] Impossible d\'initialiser le recadrage : conteneur toupublications trop petit après 10 tentatives.');
        }
    }

    _handleResize() {
        // Vérification de la taille du conteneur pour éviter le layout thrashing
        const container = this.canvasElement.parentElement;
        // On vérifie la largeur ET la hauteur pour être certain que l'élément est bien rendu
        if (!container || container.clientHeight < 100 || container.clientWidth < 100) {
            // Retry après un court délai si le conteneur n'est pas encore prêt
            setTimeout(() => {
                if (container && container.clientHeight >= 100 && container.clientWidth >= 100) {
                    this._handleResize();
                }
            }, 100);
            return;
        }

        if (!this.canvasElement.offsetParent || !this.currentImageObject) {
            console.warn('[CroppingManager] _handleResize() stoppé : canvas non visible ou pas d\'image chargée.');
            return;
        }

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

        // [LOG] Log avant de changer les dimensions du canvas
        console.log('[CroppingManager] Redimensionnement du canvas en cours...');
        this.setCanvasDimensions();

        const newImageDims = this.getImageDisplayDimensions();

        if (relativeCrop) {
            this.cropRectDisplay = {
                x: newImageDims.displayX + (relativeCrop.x * newImageDims.displayWidth),
                y: newImageDims.displayY + (relativeCrop.y * newImageDims.displayHeight),
                width: relativeCrop.width * newImageDims.displayWidth,
                height: relativeCrop.height * newImageDims.displayHeight
            };
            this.redrawCanvasOnly();
            this.debouncedUpdatePreview();
        } else {
            console.log('[CroppingManager] Pas de recadrage précédent, initialisation avec smartcrop.');
            this.initializeCropWithSmartCrop();
        }
    }

    async initializeCropWithSmartCrop() {
        if (!this.currentImageObject || typeof smartcrop === 'undefined') {
            this.setDefaultCropRect();
            this.redrawCanvasOnly();
            this.debouncedUpdatePreview();
            return;
        }
        try {
            const aspectRatioName = this.aspectRatioSelect.value;
            this.currentAspectRatioName = aspectRatioName;
            const imageDims = { width: this.currentImageObject.naturalWidth, height: this.currentImageObject.naturalHeight };
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
                this.adjustCropRectToAspectRatio();
            } else {
                throw new Error("L'échelle de l'image est nulle.");
            }
        } catch (e) {
            console.warn("Smartcrop a échoué, utilisation du recadrage par défaut.", e.message);
            this.setDefaultCropRect();
        } finally {
            this.redrawCanvasOnly();
            this.debouncedUpdatePreview();
        }
    }

    redrawCanvasOnly() { this._internalRedraw(false); }

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
            // [LOG] Log critique juste avant le dessin
            console.log('[CroppingManager._internalRedraw] Dessin de l\'image avec les paramètres:', { displayX, displayY, displayWidth, displayHeight });

            if (displayWidth <= 0 || displayHeight <= 0) {
                console.error('❌ ERREUR DE DESSIN : Dimensions de l\'image invalides (<= 0). Le canvas restera noir.');
                return;
            }

            this.ctx.save();
            if (this.flippedH) { this.ctx.translate(this.canvasElement.width, 0); this.ctx.scale(-1, 1); const adjustedDisplayX = this.canvasElement.width - displayX - displayWidth; this.ctx.drawImage(this.currentImageObject, adjustedDisplayX, displayY, displayWidth, displayHeight); }
            else { this.ctx.drawImage(this.currentImageObject, displayX, displayY, displayWidth, displayHeight); }
            this.ctx.restore();

            this.ctx.strokeStyle = 'rgba(0,0,0,0.3)';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(displayX - 0.5, displayY - 0.5, displayWidth + 1, displayHeight + 1);
            if (this.cropRectDisplay) {
                // [LOG] Log des coordonnées de la boite de recadrage
                console.log('[CroppingManager._internalRedraw] Dessin de la boite de recadrage:', this.cropRectDisplay);
                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(this.cropRectDisplay.x, this.cropRectDisplay.y, this.cropRectDisplay.width, this.cropRectDisplay.height);
                this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
                this.ctx.lineWidth = 0.5;
                this.ctx.strokeRect(this.cropRectDisplay.x - 0.5, this.cropRectDisplay.y - 0.5, this.cropRectDisplay.width + 1, this.cropRectDisplay.height + 1);
                const { x, y, width, height } = this.cropRectDisplay;
                const hRadius = this.handleSize / 2;
                const handlePoints = [[x, y], [x + width / 2, y], [x + width, y], [x + width, y + height / 2], [x + width, y + height], [x + width / 2, y + height], [x, y + height], [x, y + height / 2]];
                handlePoints.forEach(([hx, hy]) => {
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
        if (this.editorPanel.style.display === 'none' || !this.currentImageObject) { return; }
        const activeElement = document.activeElement;
        if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'SELECT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable)) { return; }
        let handled = false;
        if (event.key === "ArrowLeft") {
            await this.prevImage();
            handled = true;
        } else if (event.key === "ArrowRight") {
            await this.nextImage(false);
            handled = true;
        }
        if (handled) event.preventDefault();
    }

    setCanvasDimensions() {
        // [CORRECTION] Sécurise le redimensionnement si le conteneur n'est pas encore visible.
        const container = this.canvasElement.parentElement;
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;

        if (containerWidth === 0 || containerHeight === 0) {
            console.warn('⚠️ [CroppingManager] Le conteneur du canvas a des dimensions de 0. Utilisation de valeurs par défaut (800x600).');
            this.canvasElement.width = 800;
            this.canvasElement.height = 600;
        } else {
            this.canvasElement.width = containerWidth;
            this.canvasElement.height = containerHeight;
        }

        // [LOG] Log crucial pour vérifier les dimensions finales du canvas
        console.log(`📐 [CroppingManager] Canvas redimensionné à : ${this.canvasElement.width}x${this.canvasElement.height}`);
    }

    async startCropping(images, callingJourFrame, startIndex = 0) {
        if (this.isLoading) {
            console.warn('[CroppingManager] Appel de startCropping ignoré car une opération est déjà en cours.');
            return;
        }
        this.isLoading = true; // Verrouiller

        // [LOG] Log de démarrage de toute l'opération de recadrage.
        console.log(`[CroppingManager] startCropping appelé pour Publication ${callingJourFrame.letter}, début à l'index ${startIndex}.`);

        try {
            this.imagesToCrop = images;
            this.currentPublicationFrameInstance = callingJourFrame;
            this.currentImageIndex = startIndex;
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
            await this.loadCurrentImage();
        } finally {
            this.isLoading = false; // Déverrouiller, même en cas d'erreur
        }
    }

    async finishAndApply() {
        if (this.currentImageIndex >= 0 && this.currentImageIndex < this.imagesToCrop.length && !this.ignoreSaveForThisImage) {
            await this.applyAndSaveCurrentImage();
        }
        if (this.currentPublicationFrameInstance) {
            this.currentPublicationFrameInstance.updateImagesFromCropper(this.modifiedDataMap);
        }
        this.imagesToCrop = [];
        this.currentPublicationFrameInstance = null;
        this.currentImageObject = null;
        this.ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
        this.infoLabel.textContent = "";
        this.isDragging = false;
        this.dragMode = null;
        this.canvasElement.style.cursor = 'default';
        this.croppingPage.clearEditor();
        this.organizer.refreshSidePanels();
        this.isLoading = false; // S'assurer que le verrou est libéré
    }

    async goToImage(index) {
        if (index === this.currentImageIndex || index < 0 || index >= this.imagesToCrop.length) {
            return;
        }
        if (this.currentImageIndex >= 0) {
            await this.applyAndSaveCurrentImage();
        }
        this.currentImageIndex = index;
        await this.loadCurrentImage();
    }

    async loadCurrentImage() {
        // [LOG] Log au début du chargement d'une image spécifique
        console.log(`[CroppingManager] --- Début de loadCurrentImage pour l'index ${this.currentImageIndex} ---`);
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
            console.log('[CroppingManager] Fin du recadrage, plus d\'images à charger.');
            return;
        }

        const imgInfo = this.imagesToCrop[this.currentImageIndex];
        const originalGridItem = this.organizer.gridItemsDict[imgInfo.originalReferenceId];
        const displayName = originalGridItem ? originalGridItem.basename : `Image ID ${imgInfo.originalReferenceId}`;
        this.infoLabel.textContent = `Chargement ${displayName}...`;

        try {
            // [LOG] Log de l'URL exacte qui sera chargée
            console.log(`[CroppingManager] Tentative de chargement de l'URL : ${imgInfo.baseImageToCropFromDataURL}`);

            this.currentImageObject = await Utils.loadImage(imgInfo.baseImageToCropFromDataURL);

            // [LOG] Log en cas de succès avec les dimensions
            console.log(`[CroppingManager] ✅ Image chargée avec succès. Dimensions: ${this.currentImageObject.naturalWidth}x${this.currentImageObject.naturalHeight}`);

            let defaultRatio;
            const imgWidth = this.currentImageObject.naturalWidth || this.currentImageObject.width;
            const imgHeight = this.currentImageObject.naturalHeight || this.currentImageObject.height;
            if (imgWidth > imgHeight * 1.05) { defaultRatio = '3:2'; }
            else if (imgHeight > imgWidth * 1.05) { defaultRatio = '3:4'; }
            else { defaultRatio = '1:1'; }
            this.aspectRatioSelect.value = defaultRatio;

            // Il est crucial d'appeler _handleResize ici pour s'assurer que le canvas a les bonnes dimensions
            // AVANT d'essayer de dessiner ou de calculer le smartcrop.
            this._handleResize();

        } catch (e) {
            // [LOG] Log en cas d'échec
            console.error(`❌ ERREUR CRITIQUE: Échec du chargement de l'image pour le recadrage : ${displayName}`, e);
            console.error(`URL qui a échoué :`, imgInfo.baseImageToCropFromDataURL);
            this.infoLabel.textContent = `Erreur chargement: ${displayName}. L'image est peut-être corrompue.`;
            this.currentImageObject = null;
            this.ctx.fillStyle = CROPPER_BACKGROUND_GRAY;
            this.ctx.fillRect(0, 0, this.canvasElement.width, this.canvasElement.height);
            this.updatePreview(null, null);
            return;
        }

        this.aspectRatioSelect.disabled = this.splitModeState > 0 || this.saveMode === 'white_bars';
        this.whiteBarsBtn.disabled = this.splitModeState > 0;
        this.splitLineBtn.disabled = this.saveMode === 'white_bars';
        this.infoLabel.textContent = `${displayName}`;
        this.croppingPage._updateThumbnailStripHighlight(this.currentImageIndex);

        console.log(`[CroppingManager] --- Fin de loadCurrentImage pour l'index ${this.currentImageIndex} ---`);
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
        if (displayWidth / displayHeight > targetRatioVal) { newH = displayHeight; newW = newH * targetRatioVal; }
        else { newW = displayWidth; newH = newW / targetRatioVal; }
        const newCropX = displayX + (displayWidth - newW) / 2;
        const newCropY = displayY + (displayHeight - newH) / 2;
        this.cropRectDisplay = { x: newCropX, y: newCropY, width: newW, height: newH };
    }

    setDefaultMaximizedCropRectForDoubleSplit() {
        if (!this.currentImageObject) return;
        const { displayX, displayY, displayWidth, displayHeight } = this.getImageDisplayDimensions();
        const targetRatioVal = 9 / 4;
        let newW, newH;
        if (displayWidth / displayHeight > targetRatioVal) { newH = displayHeight; newW = newH * targetRatioVal; }
        else { newW = displayWidth; newH = newW / targetRatioVal; }
        const newCropX = displayX + (displayWidth - newW) / 2;
        const newCropY = displayY + (displayHeight - newH) / 2;
        this.cropRectDisplay = { x: newCropX, y: newCropY, width: newW, height: newH };
    }

    getImageDisplayDimensions() {
        if (!this.currentImageObject || !this.canvasElement.width || !this.canvasElement.height) {
            return { displayX: 0, displayY: 0, displayWidth: 0, displayHeight: 0, imageScale: 1 };
        }
        const canvasWidth = this.canvasElement.width, canvasHeight = this.canvasElement.height;
        const imgWidth = this.currentImageObject.naturalWidth || this.currentImageObject.width;
        const imgHeight = this.currentImageObject.naturalHeight || this.currentImageObject.height;
        if (imgWidth === 0 || imgHeight === 0) return { displayX: 0, displayY: 0, displayWidth: 0, displayHeight: 0, imageScale: 1 };
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
        if (newWidth / newHeight > targetRatioVal) { newWidth = newHeight * targetRatioVal; }
        else { newHeight = newWidth / targetRatioVal; }
        if (newWidth > displayWidth) { newWidth = displayWidth; newHeight = newWidth / targetRatioVal; }
        if (newHeight > displayHeight) { newHeight = displayHeight; newWidth = newHeight * targetRatioVal; }
        let newX = centerX - newWidth / 2;
        let newY = centerY - newHeight / 2;
        newX = Math.max(displayX, Math.min(newX, displayX + displayWidth - newWidth));
        newY = Math.max(displayY, Math.min(newY, displayY + displayHeight - newHeight));
        newWidth = Math.min(newWidth, displayX + displayWidth - newX);
        newHeight = Math.min(newHeight, displayY + displayHeight - newY);
        if (Math.abs(newWidth / newHeight - targetRatioVal) > 0.001) {
            if (newWidth / targetRatioVal <= displayHeight - newY) { newHeight = newWidth / targetRatioVal; }
            else { newWidth = newHeight * targetRatioVal; }
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
            if (sWidth <= 0 || sHeight <= 0) return;
            if (this.splitModeState === 1) {
                this.previewContainer.classList.add('split-active');
                const sWidthLeft = Math.floor(sWidth / 2);
                const sWidthRight = sWidth - sWidthLeft;
                tempCanvas.width = sWidthLeft; tempCanvas.height = sHeight;
                if (tempCanvas.width > 0 && tempCanvas.height > 0) {
                    this.drawFlippedIfNeeded(tempCtx, this.currentImageObject, 0, 0, sWidthLeft, sHeight, sx, sy, sWidthLeft, sHeight);
                    this.previewLeft.src = Utils.createThumbnail(tempCanvas, PREVIEW_WIDTH / 2 - 4, PREVIEW_HEIGHT, 'lightgrey');
                    this.previewLeft.style.display = 'inline-block';
                }
                tempCanvas.width = sWidthRight; tempCanvas.height = sHeight;
                if (tempCanvas.width > 0 && tempCanvas.height > 0) {
                    tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
                    this.drawFlippedIfNeeded(tempCtx, this.currentImageObject, 0, 0, sWidthRight, sHeight, sx + sWidthLeft, sy, sWidthRight, sHeight);
                    this.previewRight.src = Utils.createThumbnail(tempCanvas, PREVIEW_WIDTH / 2 - 4, PREVIEW_HEIGHT, 'lightgrey');
                    this.previewRight.style.display = 'inline-block';
                }
            } else if (this.splitModeState === 2) {
                this.previewContainer.classList.add('double-split-active');
                const sWidthThird = Math.floor(sWidth / 3);
                const sWidthLeft = sWidthThird, sWidthMid = sWidthThird;
                const sWidthRight = sWidth - sWidthLeft - sWidthMid;
                if (sWidthLeft > 0) {
                    tempCanvas.width = sWidthLeft; tempCanvas.height = sHeight;
                    this.drawFlippedIfNeeded(tempCtx, this.currentImageObject, 0, 0, sWidthLeft, sHeight, sx, sy, sWidthLeft, sHeight);
                    this.previewLeft.src = Utils.createThumbnail(tempCanvas, PREVIEW_WIDTH / 3 - 6, PREVIEW_HEIGHT, 'lightgrey');
                    this.previewLeft.style.display = 'inline-block';
                }
                if (sWidthMid > 0) {
                    tempCanvas.width = sWidthMid; tempCanvas.height = sHeight; tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
                    this.drawFlippedIfNeeded(tempCtx, this.currentImageObject, 0, 0, sWidthMid, sHeight, sx + sWidthLeft, sy, sWidthMid, sHeight);
                    this.previewCenter.src = Utils.createThumbnail(tempCanvas, PREVIEW_WIDTH / 3 - 6, PREVIEW_HEIGHT, 'lightgrey');
                    this.previewCenter.style.display = 'inline-block';
                }
                if (sWidthRight > 0) {
                    tempCanvas.width = sWidthRight; tempCanvas.height = sHeight; tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
                    this.drawFlippedIfNeeded(tempCtx, this.currentImageObject, 0, 0, sWidthRight, sHeight, sx + sWidthLeft + sWidthMid, sy, sWidthRight, sHeight);
                    this.previewRight.src = Utils.createThumbnail(tempCanvas, PREVIEW_WIDTH / 3 - 6, PREVIEW_HEIGHT, 'lightgrey');
                    this.previewRight.style.display = 'inline-block';
                }
            } else {
                tempCanvas.width = sWidth; tempCanvas.height = sHeight;
                this.drawFlippedIfNeeded(tempCtx, this.currentImageObject, 0, 0, sWidth, sHeight, sx, sy, sWidth, sHeight);
                this.previewLeft.src = Utils.createThumbnail(tempCanvas, PREVIEW_WIDTH, PREVIEW_HEIGHT, 'lightgrey');
                this.previewLeft.style.display = 'block';
                this.previewCenter.style.display = 'none';
                this.previewRight.style.display = 'none';
            }
        }
    }

    drawFlippedIfNeeded(ctx, image, dx, dy, dWidth, dHeight, sx, sy, sWidth, sHeight) {
        ctx.save();
        if (this.flippedH) {
            ctx.translate(dx + dWidth, dy); ctx.scale(-1, 1);
            if (sx !== undefined) ctx.drawImage(image, sx, sy, sWidth, sHeight, 0, 0, dWidth, dHeight); else ctx.drawImage(image, 0, 0, dWidth, dHeight);
        } else {
            if (sx !== undefined) ctx.drawImage(image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight); else ctx.drawImage(image, dx, dy, dWidth, dHeight);
        }
        ctx.restore();
    }

    getCropSourceCoordinates() {
        if (!this.cropRectDisplay || !this.currentImageObject) return { sx: 0, sy: 0, sWidth: 0, sHeight: 0 };
        const { displayX, displayY, imageScale } = this.getImageDisplayDimensions(); if (imageScale === 0) return { sx: 0, sy: 0, sWidth: 0, sHeight: 0 };
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
        if (this.whiteBarsBtn.disabled) this.whiteBarsBtn.classList.remove('active-crop-btn');
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
        if (!this.currentImageObject) return { finalWidth: 0, finalHeight: 0, pasteX: 0, pasteY: 0 };
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
        const currentImageIdInPublication = currentImgInfoForCropper.currentImageId;
        const galleryIdForAPI = this.currentPublicationFrameInstance.galleryId;
        const saveCanvas = document.createElement('canvas');
        const saveCtx = saveCanvas.getContext('2d');
        let cropOperationsPayloads = [];
        try {
            if (this.saveMode === 'white_bars') {
                const { finalWidth, finalHeight, pasteX, pasteY } = this.calculateWhiteBarDimensions();
                if (!finalWidth || finalWidth <= 0 || !finalHeight || finalHeight <= 0) {
                    throw new Error("Dimensions invalides pour l'ajout de barres blanches.");
                }
                saveCanvas.width = finalWidth; saveCanvas.height = finalHeight;
                saveCtx.fillStyle = 'white'; saveCtx.fillRect(0, 0, finalWidth, finalHeight);
                this.drawFlippedIfNeeded(saveCtx, this.currentImageObject, pasteX, pasteY, this.currentImageObject.naturalWidth, this.currentImageObject.naturalHeight);
                const newDataURL = saveCanvas.toDataURL('image/jpeg', 0.92);
                cropOperationsPayloads.push({ imageDataUrl: newDataURL, cropInfo: 'barres_3x4', filenameSuffix: 'barres_3x4' });
            } else if (this.saveMode === 'crop' && this.cropRectDisplay) {
                const { sx, sy, sWidth, sHeight } = this.getCropSourceCoordinates();
                if (sWidth <= 0 || sHeight <= 0) {
                    this.infoLabel.textContent = `Recadrage ignoré (dimensions invalides).`;
                    return;
                }
                if (this.splitModeState === 1) {
                    const sWidthLeft = Math.floor(sWidth / 2);
                    const sWidthRight = sWidth - sWidthLeft;
                    if (sWidthLeft > 0) {
                        saveCanvas.width = sWidthLeft; saveCanvas.height = sHeight;
                        this.drawFlippedIfNeeded(saveCtx, this.currentImageObject, 0, 0, sWidthLeft, sHeight, sx, sy, sWidthLeft, sHeight);
                        cropOperationsPayloads.push({ imageDataUrl: saveCanvas.toDataURL('image/jpeg', 0.92), cropInfo: 'split_gauche_3x4', filenameSuffix: 'gauche_3x4' });
                    }
                    if (sWidthRight > 0) {
                        saveCanvas.width = sWidthRight; saveCanvas.height = sHeight; saveCtx.clearRect(0, 0, saveCanvas.width, saveCanvas.height);
                        this.drawFlippedIfNeeded(saveCtx, this.currentImageObject, 0, 0, sWidthRight, sHeight, sx + sWidthLeft, sy, sWidthRight, sHeight);
                        cropOperationsPayloads.push({ imageDataUrl: saveCanvas.toDataURL('image/jpeg', 0.92), cropInfo: 'split_droite_3x4', filenameSuffix: 'droite_3x4' });
                    }
                } else if (this.splitModeState === 2) {
                    const sWidthThird = Math.floor(sWidth / 3);
                    const sWidthLeft = sWidthThird, sWidthMid = sWidthThird;
                    const sWidthRight = sWidth - sWidthLeft - sWidthMid;
                    if (sWidthLeft > 0) {
                        saveCanvas.width = sWidthLeft; saveCanvas.height = sHeight; saveCtx.clearRect(0, 0, saveCanvas.width, saveCanvas.height);
                        this.drawFlippedIfNeeded(saveCtx, this.currentImageObject, 0, 0, sWidthLeft, sHeight, sx, sy, sWidthLeft, sHeight);
                        cropOperationsPayloads.push({ imageDataUrl: saveCanvas.toDataURL('image/jpeg', 0.92), cropInfo: 'split_gauche_3x4_sur3', filenameSuffix: 'g_3x4_3' });
                    }
                    if (sWidthMid > 0) {
                        saveCanvas.width = sWidthMid; saveCanvas.height = sHeight; saveCtx.clearRect(0, 0, saveCanvas.width, saveCanvas.height);
                        this.drawFlippedIfNeeded(saveCtx, this.currentImageObject, 0, 0, sWidthMid, sHeight, sx + sWidthLeft, sy, sWidthMid, sHeight);
                        cropOperationsPayloads.push({ imageDataUrl: saveCanvas.toDataURL('image/jpeg', 0.92), cropInfo: 'split_milieu_3x4_sur3', filenameSuffix: 'm_3x4_3' });
                    }
                    if (sWidthRight > 0) {
                        saveCanvas.width = sWidthRight; saveCanvas.height = sHeight; saveCtx.clearRect(0, 0, saveCanvas.width, saveCanvas.height);
                        this.drawFlippedIfNeeded(saveCtx, this.currentImageObject, 0, 0, sWidthRight, sHeight, sx + sWidthLeft + sWidthMid, sy, sWidthRight, sHeight);
                        cropOperationsPayloads.push({ imageDataUrl: saveCanvas.toDataURL('image/jpeg', 0.92), cropInfo: 'split_droite_3x4_sur3', filenameSuffix: 'd_3x4_3' });
                    }
                } else {
                    saveCanvas.width = sWidth; saveCanvas.height = sHeight;
                    this.drawFlippedIfNeeded(saveCtx, this.currentImageObject, 0, 0, sWidth, sHeight, sx, sy, sWidth, sHeight);
                    const suffix = this.currentAspectRatioName.replace(':', 'x');
                    cropOperationsPayloads.push({ imageDataUrl: saveCanvas.toDataURL('image/jpeg', 0.92), cropInfo: `recadre_${suffix}`, filenameSuffix: `rec_${suffix}` });
                }
            }
            if (cropOperationsPayloads.length > 0) {
                const backendResults = [];
                for (const opPayload of cropOperationsPayloads) {
                    if (!opPayload.imageDataUrl || !opPayload.imageDataUrl.startsWith('data:image/jpeg;base64,')) { continue; }
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
                this.modifiedDataMap[currentImageIdInPublication] = backendResults.length === 1 ? backendResults[0] : backendResults;
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
        const { x, y, width, height } = this.cropRectDisplay; const H_detect = this.handleDetectionOffset;
        if (mouseX >= x - H_detect && mouseX <= x + H_detect && mouseY >= y - H_detect && mouseY <= y + H_detect) return 'nw';
        if (mouseX >= x + width - H_detect && mouseX <= x + width + H_detect && mouseY >= y - H_detect && mouseY <= y + H_detect) return 'ne';
        if (mouseX >= x + width - H_detect && mouseX <= x + width + H_detect && mouseY >= y + height - H_detect && mouseY <= y + height + H_detect) return 'se';
        if (mouseX >= x - H_detect && mouseX <= x + H_detect && mouseY >= y + height - H_detect && mouseY <= y + height + H_detect) return 'sw';
        if (mouseX >= x + width / 2 - H_detect && mouseX <= x + width / 2 + H_detect && mouseY >= y - H_detect && mouseY <= y + H_detect) return 'n';
        if (mouseX >= x + width - H_detect && mouseX <= x + width + H_detect && mouseY >= y + height / 2 - H_detect && mouseY <= y + height / 2 + H_detect) return 'e';
        if (mouseX >= x + width / 2 - H_detect && mouseX <= x + width / 2 + H_detect && mouseY >= y + height - H_detect && mouseY <= y + height + H_detect) return 's';
        if (mouseX >= x - H_detect && mouseX <= x + H_detect && mouseY >= y + height / 2 - H_detect && mouseY <= y + height / 2 + H_detect) return 'w';
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
        let newX = this.dragStart.cropX, newY = this.dragStart.cropY, newW = this.dragStart.cropW, newH = this.dragStart.cropH;
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
                if (this.currentAspectRatioName === '6:4split') targetRatio = 6 / 4;
                else if (this.currentAspectRatioName === '9:4doublesplit') targetRatio = 9 / 4;
                else { const parts = this.currentAspectRatioName.split(':').map(Number); targetRatio = parts[0] / parts[1]; }
                if (this.dragMode.includes('e') || this.dragMode.includes('w')) { newH = newW / targetRatio; }
                else if (this.dragMode.includes('s') || this.dragMode.includes('n')) { newW = newH * targetRatio; }
                else { if (Math.abs(dx) > Math.abs(dy)) newH = newW / targetRatio; else newW = newH * targetRatio; }
                if (this.dragMode.includes('n')) newY = this.dragStart.cropY + this.dragStart.cropH - newH;
                if (this.dragMode.includes('w')) newX = this.dragStart.cropX + this.dragStart.cropW - newW;
                newX = Math.max(displayX, Math.min(newX, displayX + displayWidth - newW));
                newY = Math.max(displayY, Math.min(newY, displayY + displayHeight - newH));
                newW = Math.min(newW, displayX + displayWidth - newX);
                newH = Math.min(newH, displayY + displayHeight - newY);
                if (Math.abs(newW / newH - targetRatio) > 0.01) {
                    if (newW / targetRatio <= displayHeight - newY && newW / targetRatio >= minDim) { newH = newW / targetRatio; }
                    else if (newH * targetRatio <= displayWidth - newX && newH * targetRatio >= minDim) { newW = newH * targetRatio; }
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
        this.mainListElement = document.getElementById('descriptionMainList');
        this.jourListElement = document.getElementById('descriptionPublicationList');
        this.editorTitleElement = document.getElementById('descriptionEditorTitle');
        this.editorContentElement = document.getElementById('descriptionEditorContent');
        this.editorPlaceholderElement = document.getElementById('descriptionEditorPlaceholder');
        this.editorElement = document.getElementById('descriptionEditor');
        this.imagesPreviewBanner = document.getElementById('descriptionImagesPreview');
        this.shortcutsContainer = document.getElementById('descriptionShortcuts');
        this.generateHashtagsBtn = document.getElementById('generateHashtagsBtn');

        // ▼▼▼ MODIFICATION ▼▼▼
        this.hashtagManager = new HashtagManager(this); // Remplace l'ancienne logique
        // ▲▲▲ FIN DE LA MODIFICATION ▲▲▲

        this.currentSelectedPublicationFrame = null;
        this.commonDescriptionText = '';
        this.isEditingCommon = true;

        this.debouncedSavePublication = Utils.debounce(() => this.saveCurrentPublicationDescription(true), 1500);
        this.debouncedSaveCommon = Utils.debounce(() => this.saveCommonDescription(true), 1500);
        this._initListeners();
    }

    _initListeners() {
        this.editorElement.addEventListener('input', () => {
            if (this.isEditingCommon) {
                this.commonDescriptionText = this.editorElement.innerText;
                this.debouncedSaveCommon();
            } else if (this.currentSelectedPublicationFrame) {
                this.currentSelectedPublicationFrame.descriptionText = this._extractTextFromEditor();
                this.debouncedSavePublication();
            }
            this._updateShortcutButtonsState();
        });

        this.editorElement.addEventListener('keydown', (e) => {
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

        this.mainListElement.addEventListener('click', (e) => {
            if (e.target.closest('li')) {
                this.selectCommon();
            }
        });

        this.jourListElement.addEventListener('click', (e) => {
            const li = e.target.closest('li');
            if (li && li.dataset.publicationId) {
                const publicationFrame = this.organizerApp.publicationFrames.find(jf => jf.id === li.dataset.publicationId);
                if (publicationFrame) this.selectPublication(publicationFrame);
            }
        });

        this.shortcutsContainer.addEventListener('click', (e) => {
            const button = e.target.closest('button');
            if (button && button.dataset.snippet && !button.disabled) {
                this._insertSnippet(button.dataset.snippet);
            }
        });

        this.generateHashtagsBtn.addEventListener('click', async () => {
            // ▼▼▼ MODIFICATION ▼▼▼
            const button = this.generateHashtagsBtn;
            const originalText = button.innerHTML;
            button.innerHTML = '🤖 Analyse...';
            button.disabled = true;

            try {
                const text = this.editorElement.innerText;
                await this.hashtagManager.generateAndShow(text); // Appel de la nouvelle classe
            } catch (error) {
                console.error("Erreur lors de la génération des hashtags:", error);
                alert("Une erreur est survenue lors de l'analyse du texte.");
            } finally {
                button.innerHTML = originalText;
                button.disabled = false;
            }
            // ▲▲▲ FIN DE LA MODIFICATION ▲▲▲
        });
    }



    _insertSnippet(snippet) {
        this.editorElement.focus();
        let currentText = this.editorElement.innerText;
        let textToInsert = (currentText.trim().length > 0 ? '\n' : '') + snippet;
        document.execCommand('insertText', false, textToInsert);
        this.editorElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    }

    _updateShortcutButtonsState() {
        const currentText = this.editorElement.innerText.toLowerCase();
        const allItems = this.shortcutsContainer.querySelectorAll('.shortcut-item');

        allItems.forEach(item => {
            const buttons = item.querySelectorAll('button[data-snippet]');
            let keywordFound = false;

            buttons.forEach(button => {
                const snippet = button.dataset.snippet.toLowerCase();
                const keyword = snippet.split(' ')[1];
                if (currentText.includes(keyword)) {
                    keywordFound = true;
                }
            });

            buttons.forEach(button => {
                button.disabled = keywordFound;
            });
        });
    }

    _extractTextFromEditor() {
        const tempDiv = this.editorElement.cloneNode(true);
        const commonBlock = tempDiv.querySelector('.common-text-block');

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
        } else {
            if (commonBlock) {
                commonBlock.replaceWith(document.createTextNode('{{COMMON_TEXT}}'));
            }
            return tempDiv.innerText;
        }
    }

    setCommonDescription(text) {
        this.commonDescriptionText = text || '';
    }

    show() {
        if (!app.currentGalleryId) {
            this.jourListElement.innerHTML = '<li>Chargez une galerie pour voir ses publications.</li>';
            this.mainListElement.innerHTML = '';
            this.clearEditor();
            return;
        }
        this.populateLists();
        this.selectCommon();
    }

    populateLists() {
        this.mainListElement.innerHTML = '';
        const liCommon = document.createElement('li');
        liCommon.className = 'publication-list-item main-item';
        liCommon.innerHTML = `<span class="publication-list-item-text">Description Commune</span>`;
        if (this.isEditingCommon) {
            liCommon.classList.add('active-description-publication');
        }
        this.mainListElement.appendChild(liCommon);

        const activeId = this.isEditingCommon ? null : (this.currentSelectedPublicationFrame ? this.currentSelectedPublicationFrame.id : null);
        this.organizerApp._populateSharedJourList(this.jourListElement, activeId, 'description');
    }

    async selectCommon() {
        if (!this.isEditingCommon && this.currentSelectedPublicationFrame) {
            await this.saveCurrentPublicationDescription();
        }

        this.isEditingCommon = true;
        this.currentSelectedPublicationFrame = null;
        this.populateLists();
        this.loadCommonDescription();
    }

    async selectPublication(publicationFrame) {
        if (this.isEditingCommon) {
            await this.saveCommonDescription();
        } else if (this.currentSelectedPublicationFrame && this.currentSelectedPublicationFrame.id !== publicationFrame.id) {
            await this.saveCurrentPublicationDescription();
        }

        this.isEditingCommon = false;
        this.currentSelectedPublicationFrame = publicationFrame;
        this.populateLists();
        this.loadDescriptionForJour(publicationFrame);
    }

    loadCommonDescription() {
        this.editorTitleElement.textContent = `Description Commune pour "${this.organizerApp.getCurrentGalleryName()}"`;
        this.editorElement.contentEditable = true;
        this.editorElement.classList.remove('structured');
        this.editorElement.innerHTML = '';
        this.editorElement.innerText = this.commonDescriptionText;

        this.editorContentElement.style.display = 'block';
        this.editorPlaceholderElement.style.display = 'none';
        this.imagesPreviewBanner.style.display = 'none';
        this.imagesPreviewBanner.innerHTML = '';
        this.shortcutsContainer.style.display = 'flex';
        this._updateShortcutButtonsState();
    }

    loadDescriptionForJour(publicationFrame) {
        if (!publicationFrame) {
            this.clearEditor();
            return;
        }
        this.editorTitleElement.textContent = `Description pour Publication ${publicationFrame.letter}`;

        const jourText = publicationFrame.descriptionText || '';
        const isEffectivelyEmpty = jourText.trim() === '' || jourText.trim() === '{{COMMON_TEXT}}';

        const escapedCommonText = this.commonDescriptionText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const commonBlockHTML = `<div class="common-text-block" contenteditable="false">${escapedCommonText}</div>`;

        this.editorElement.innerHTML = '';

        if (isEffectivelyEmpty) {
            this.editorElement.contentEditable = false;
            this.editorElement.classList.add('structured');
            this.editorElement.innerHTML = `
                <div class="editable-zone" contenteditable="true" data-zone="before"><br></div>
                ${commonBlockHTML}
                <div class="editable-zone" contenteditable="true" data-zone="after"></div>
            `;
        } else {
            this.editorElement.contentEditable = true;
            this.editorElement.classList.remove('structured');
            const finalHTML = jourText.replace(/{{COMMON_TEXT}}/g, commonBlockHTML);
            this.editorElement.innerHTML = finalHTML.replace(/\n/g, '<br>');
        }

        this.editorContentElement.style.display = 'block';
        this.editorPlaceholderElement.style.display = 'none';

        this.imagesPreviewBanner.innerHTML = '';
        if (publicationFrame.imagesData && publicationFrame.imagesData.length > 0) {
            publicationFrame.imagesData.forEach(imgData => {
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
        this.shortcutsContainer.style.display = 'flex';
        this._updateShortcutButtonsState();
    }

    clearEditor() {
        this.editorTitleElement.textContent = "Sélectionnez une publication";
        this.editorElement.innerHTML = '';
        this.editorElement.classList.remove('structured');
        this.currentSelectedPublicationFrame = null;
        this.isEditingCommon = true;
        this.editorContentElement.style.display = 'none';
        this.editorPlaceholderElement.textContent = "Aucun publication sélectionné, ou la galerie n'a pas de publications.";
        this.editorPlaceholderElement.style.display = 'block';
        if (this.imagesPreviewBanner) {
            this.imagesPreviewBanner.innerHTML = '';
            this.imagesPreviewBanner.style.display = 'none';
        }
        this.shortcutsContainer.style.display = 'none';
    }

    async saveCurrentPublicationDescription(isDebounced = false) {
        if (!this.currentSelectedPublicationFrame || !app.currentGalleryId) return;
        if (!isDebounced) this.debouncedSavePublication.cancel();

        const publicationToUpdate = this.currentSelectedPublicationFrame;
        jourToUpdate.descriptionText = this._extractTextFromEditor();
        await jourToUpdate.save();
        this.organizerApp.refreshSidePanels();
    }

    async saveCommonDescription(isDebounced = false) {
        if (!app.currentGalleryId) return;
        if (!isDebounced) this.debouncedSaveCommon.cancel();

        try {
            await fetch(`${BASE_API_URL}/api/galleries/${app.currentGalleryId}/state`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ commonDescriptionText: this.commonDescriptionText })
            });
        } catch (error) {
            console.error("Error saving common description:", error);
        }
    }

    async saveOnTabExit() {
        if (this.isEditingCommon) {
            await this.saveCommonDescription();
        } else if (this.currentSelectedPublicationFrame) {
            await this.saveCurrentPublicationDescription();
        }
    }
}

class CalendarPage {
    constructor(parentElement, organizerApp) {
        this.parentElement = parentElement;
        this.organizerApp = organizerApp;
        this.currentDate = new Date();
        this.calendarGridElement = this.parentElement.querySelector('#calendarGrid');
        // MODIFIÉ : Remplacer monthYearLabelElement par les nouveaux éléments
        this.monthSelectorElement = this.parentElement.querySelector('#monthSelector');
        this.yearLabelElement = this.parentElement.querySelector('#yearLabel');
        this.jourListElement = this.parentElement.querySelector('#calendarPublicationList');
        this.unscheduledPublicationsListElement = this.parentElement.querySelector('#unscheduledPublicationsList');
        this.contextPreviewModal = document.getElementById('calendarContextPreviewModal');
        this.contextPreviewTitle = document.getElementById('calendarContextTitle');
        this.contextPreviewImages = document.getElementById('calendarContextImages');
        this.runAutoScheduleBtn = document.getElementById('runAutoScheduleBtn');
        this.autoScheduleInfo = document.getElementById('auto-schedule-info');
        this.dragData = {};
        this._initListeners();
        this.debouncedChangeMonth = Utils.debounce(this.changeMonth.bind(this), 100);
    }

    // NOUVELLE MÉTHODE : Construire le sélecteur de mois
    _buildMonthSelector() {
        this.monthSelectorElement.innerHTML = '';
        const currentMonth = this.currentDate.getMonth();

        MONTHS_FR_ABBR.forEach((monthName, index) => {
            const li = document.createElement('li');
            li.textContent = monthName;
            li.dataset.month = index; // On stocke l'index du mois (0-11)

            if (index === currentMonth) {
                li.classList.add('active'); // On met en évidence le mois actuel
            }

            this.monthSelectorElement.appendChild(li);
        });
    }

    // NOUVELLE MÉTHODE : Gérer la sélection d'un mois
    _selectMonth(monthIndex) {
        this.currentDate.setMonth(monthIndex);
        this.buildCalendarUI();
    }

    _initListeners() {
        this.parentElement.querySelector('#todayBtn').addEventListener('click', () => this.goToToday());
        
        // NOUVEAU : Gérer les clics sur le sélecteur de mois
        this.monthSelectorElement.addEventListener('click', (event) => {
            const target = event.target.closest('li');
            if (target && target.dataset.month) {
                const monthIndex = parseInt(target.dataset.month, 10);
                this._selectMonth(monthIndex);
            }
        });

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
            if (this.contextPreviewModal.style.display === 'block' && !this.contextPreviewModal.contains(e.target) && !e.target.closest('.scheduled-item')) {
                this._hideContextPreview();
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.contextPreviewModal.style.display === 'block') this._hideContextPreview();
            }
        });
        this.runAutoScheduleBtn.addEventListener('click', () => this.runAutoSchedule());
        const reorganizeAllBtn = document.getElementById('reorganizeAllBtn');
        if (reorganizeAllBtn) {
            reorganizeAllBtn.addEventListener('click', () => this.reorganizeAll());
        }
    }

    reorganizeAll() {
        if (!confirm("Êtes-vous sûr de vouloir retirer tous les publications du calendrier et les replacer dans la liste 'Publications à Planifier' ?")) {
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

    // Fonction pour nettoyer les publications inexistants du calendrier
    cleanupNonExistentPublications() {
        if (!this.organizerApp.scheduleContext || !this.organizerApp.scheduleContext.schedule) {
            return;
        }

        const scheduleData = this.organizerApp.scheduleContext.schedule;
        const existingPublications = new Set();

        // Créer un Set des publications qui existent encore dans la galerie actuelle
        if (this.organizerApp.publicationFrames) {
            this.organizerApp.publicationFrames.forEach(publicationFrame => {
                existingPublications.add(`${publicationFrame.galleryId}_${publicationFrame.letter}`);
            });
        }

        let removedCount = 0;
        const datesToClean = [];

        // Parcourir toutes les dates du calendrier
        for (const dateStr in scheduleData) {
            const daySchedule = scheduleData[dateStr];
            const lettersToRemove = [];

            // Vérifier chaque publication programmé pour cette date
            for (const letter in daySchedule) {
                const itemData = daySchedule[letter];
                const jourKey = `${itemData.galleryId}_${letter}`;

                // Si ce publication n'existe plus dans la galerie actuelle, le marquer pour suppression
                if (itemData.galleryId === this.organizerApp.currentGalleryId && !existingPublications.has(jourKey)) {
                    lettersToRemove.push(letter);
                    removedCount++;
                }
            }

            // Supprimer les publications inexistants
            lettersToRemove.forEach(letter => {
                delete daySchedule[letter];
            });

            // Si la date n'a plus aucun publication programmé, la marquer pour suppression complète
            if (Object.keys(daySchedule).length === 0) {
                datesToClean.push(dateStr);
            }
        }

        // Supprimer les dates vides
        datesToClean.forEach(dateStr => {
            delete scheduleData[dateStr];
        });

        // Nettoyer aussi allUserPublications
        if (this.organizerApp.scheduleContext.allUserPublications) {
            const originalLength = this.organizerApp.scheduleContext.allUserPublications.length;
            this.organizerApp.scheduleContext.allUserPublications = this.organizerApp.scheduleContext.allUserPublications.filter(publication => {
                if (publication.galleryId === this.organizerApp.currentGalleryId) {
                    const publicationKey = `${publication.galleryId}_${publication.letter}`;
                    return existingPublications.has(publicationKey);
                }
                return true; // Garder les publications des autres galeries
            });

            const cleanedFromAllUserPublications = originalLength - this.organizerApp.scheduleContext.allUserPublications.length;
            if (cleanedFromAllUserPublications > 0) {
                removedCount += cleanedFromAllUserPublications;
            }
        }

        // Log et sauvegarde si des éléments ont été supprimés
        if (removedCount > 0) {
            console.log(`[CalendarPage.cleanupNonExistentPublications] Supprimé ${removedCount} référence(s) de publication(s) inexistante(s) du calendrier`);

            // Sauvegarder les changements
            this.organizerApp.saveAppState();
        }
    }

    buildCalendarUI() {
        // Nettoyer les publications inexistants du calendrier avant de construire l'UI
        this.cleanupNonExistentPublications();
        
        // Corriger automatiquement les noms de galerie manquants
        this.fixMissingGalleryNames();

        this.calendarGridElement.innerHTML = '';
        if (!app || !app.currentGalleryId) {
            this.calendarGridElement.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; padding: 20px;">Chargez une galerie pour voir le calendrier.</p>';
            // NOUVEAU : Cacher le sélecteur si aucune galerie n'est chargée
            this.monthSelectorElement.innerHTML = '';
            this.yearLabelElement.textContent = 'Calendrier';
            this.populateJourList();
            this.buildUnscheduledPublicationsList();
            return;
        }
        this.populateJourList();
        this.buildUnscheduledPublicationsList();

        // --- MODIFICATION PRINCIPALE ---
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();
        // On met à publication le sélecteur de mois (qui gère aussi le style "active")
        this._buildMonthSelector();
        
        // On met à publication l'affichage de l'année
        this.yearLabelElement.textContent = year;
        // --- FIN DE LA MODIFICATION ---
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
        today.setHours(0, 0, 0, 0);
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
        this.organizerApp._populateSharedJourList(this.jourListElement, null, 'calendar');
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
        const allUserPublications = this.organizerApp.scheduleContext.allUserPublications;
        if (scheduleData[dateKey]) {
            const itemsOnDay = scheduleData[dateKey];
            const sortedLetters = Object.keys(itemsOnDay).sort();
            sortedLetters.forEach(letter => {
                const itemData = itemsOnDay[letter];
                const pubItemElement = document.createElement('div');
                pubItemElement.className = 'scheduled-item';
                pubItemElement.draggable = true;
                const colorIndex = letter.charCodeAt(0) - 'A'.charCodeAt(0);
                pubItemElement.style.borderColor = PUBLICATION_COLORS[colorIndex % PUBLICATION_COLORS.length];
                const textSpan = document.createElement('span');
                textSpan.className = 'scheduled-item-text';
                textSpan.textContent = itemData.label || `Publication ${letter}`;
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
                downloadBtn.title = 'Télécharger le ZIP de la Publication';
                const publicationDataForExport = allUserPublications.find(j => j.galleryId === itemData.galleryId && j.letter === letter);
                if (publicationDataForExport) {
                    downloadBtn.onclick = (e) => {
                        e.stopPropagation();
                        this.exportJourById(itemData.galleryId, publicationDataForExport._id, letter);
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

    buildUnscheduledPublicationsList() {
        if (!this.unscheduledPublicationsListElement) return;
        this.unscheduledPublicationsListElement.innerHTML = '';

        const scheduleData = this.organizerApp.scheduleContext.schedule;
        const allUserPublications = this.organizerApp.scheduleContext.allUserPublications;

        if (!allUserPublications || allUserPublications.length === 0) {
            this.unscheduledPublicationsListElement.innerHTML = '<p class="sidebar-info">Aucun publication à planifier.</p>';
            return;
        }

        const scheduledSet = new Set();
        for (const date in scheduleData) {
            for (const letter in scheduleData[date]) {
                const item = scheduleData[date][letter];
                scheduledSet.add(`${item.galleryId}-${letter}`);
            }
        }

        const unscheduled = allUserPublications.filter(publication => !scheduledSet.has(`${publication.galleryId}-${publication.letter}`));

        if (unscheduled.length === 0) {
            this.unscheduledPublicationsListElement.innerHTML = '<p class="sidebar-info">Tous les publications sont planifiés !</p>';
            return;
        }

        // --- DÉBUT DE LA NOUVELLE LOGIQUE DE REGROUPEMENT ET TRI ---

        // 1. Regrouper les publications par galerie
        const groupedByGallery = unscheduled.reduce((acc, publication) => {
            if (!acc[publication.galleryId]) {
                acc[publication.galleryId] = {
                    name: publication.galleryName,
                    publications: []
                };
            }
            acc[publication.galleryId].publications.push(publication);
            return acc;
        }, {});

        // 2. Trier les galeries par nom, puis les publications de chaque galerie par lettre
        const sortedGalleryIds = Object.keys(groupedByGallery).sort((a, b) =>
            groupedByGallery[a].name.localeCompare(groupedByGallery[b].name)
        );

        sortedGalleryIds.forEach(galleryId => {
            const galleryGroup = groupedByGallery[galleryId];
            galleryGroup.publications.sort((a, b) => a.letter.localeCompare(b.letter));

            // 3. Créer et ajouter le header de la galerie
            const galleryHeader = document.createElement('div');
            galleryHeader.className = 'unscheduled-gallery-header';
            galleryHeader.textContent = galleryGroup.name;
            this.unscheduledPublicationsListElement.appendChild(galleryHeader);

            // 4. Créer et ajouter les publications pour cette galerie
            galleryGroup.publications.forEach(publication => {
                const itemElement = document.createElement('div');
                itemElement.className = 'unscheduled-publication-item';
                itemElement.draggable = true;

                const contentDiv = document.createElement('div');
                contentDiv.className = 'unscheduled-publication-item-content';

                const letterSpan = document.createElement('span');
                letterSpan.className = 'unscheduled-publication-item-letter';
                letterSpan.textContent = publication.letter;
                const colorIndex = publication.letter.charCodeAt(0) - 'A'.charCodeAt(0);
                letterSpan.style.backgroundColor = PUBLICATION_COLORS[colorIndex % PUBLICATION_COLORS.length];

                const thumbDiv = document.createElement('div');
                thumbDiv.className = 'unscheduled-publication-item-thumb';

                if (publication.firstImageThumbnail) {
                    const thumbFilename = Utils.getFilenameFromURL(publication.firstImageThumbnail);
                    const thumbUrl = `${BASE_API_URL}/api/uploads/${publication.galleryId}/${thumbFilename}`;
                    thumbDiv.style.backgroundImage = `url(${thumbUrl})`;
                } else {
                    thumbDiv.textContent = '...';
                }

                const publicationLabelSpan = document.createElement('span');
                publicationLabelSpan.className = 'unscheduled-publication-item-label';
                publicationLabelSpan.textContent = `Publication ${publication.letter}`;

                contentDiv.appendChild(letterSpan);
                contentDiv.appendChild(thumbDiv);
                contentDiv.appendChild(publicationLabelSpan);
                itemElement.appendChild(contentDiv);

                itemElement.addEventListener('dragstart', e => this._onDragStart(e, { type: 'unscheduled', ...publication }, itemElement));

                itemElement.addEventListener('click', () => {
                    this.organizerApp.handleLoadGallery(publication.galleryId).then(() => {
                        const publicationFrame = this.organizerApp.publicationFrames.find(pf => pf.id === publication._id);
                        if (publicationFrame) {
                            this.organizerApp.activateTab('currentGallery');
                            this.organizerApp.setCurrentPublicationFrame(publicationFrame);
                        }
                    });
                });

                this.unscheduledPublicationsListElement.appendChild(itemElement);
            });
        });
        // --- FIN DE LA NOUVELLE LOGIQUE ---
    }

    // ▼▼▼ REMPLACEZ COMPLÈTEMENT VOTRE ANCIENNE FONCTION loadCalendarThumb PAR CELLE-CI ▼▼▼
    async loadCalendarThumb(thumbElement, jourLetter, galleryIdForJour) {
        const allUserPublications = this.organizerApp.scheduleContext.allUserPublications;
        if (!allUserPublications) {
            thumbElement.textContent = "?";
            return;
        }

        // On cherche le publication correspondant dans la liste de TOUS les publications de l'utilisateur
        const publicationData = allUserPublications.find(j => j.letter === jourLetter && j.galleryId === galleryIdForJour);

        if (publicationData && publicationData.firstImageThumbnail) {
            // On a trouvé le publication et il a une miniature !
            const thumbFilename = Utils.getFilenameFromURL(publicationData.firstImageThumbnail);
            const thumbUrl = `${BASE_API_URL}/api/uploads/${publicationData.galleryId}/${thumbFilename}`;
            thumbElement.style.backgroundImage = `url(${thumbUrl})`;
            thumbElement.textContent = ""; // On s'assure de vider le texte
        } else {
            // Le publication est vide ou n'a pas été trouvé (sécurité)
            thumbElement.style.backgroundImage = 'none';
            thumbElement.textContent = "N/A";
        }
    }
    // ▲▲▲ FIN DU REMPLACEMENT ▲▲▲

    _onDragStart(event, dragPayload, itemElement) {
        this.dragData = dragPayload;
        event.dataTransfer.setData("application/json", JSON.stringify(dragPayload));
        event.dataTransfer.effectAllowed = "move";
        setTimeout(() => {
            itemElement.classList.add(dragPayload.type === 'calendar' ? 'dragging-schedule-item' : 'dragging-from-list');
        }, 0);
        const onDragEnd = () => {
            itemElement.classList.remove('dragging-schedule-item', 'dragging-from-list');
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
                this.addOrUpdatePublicationForDate(new Date(targetDateKey + 'T00:00:00'), droppedData.letter, droppedData.galleryId, droppedData.galleryName);
            } else if (droppedData.type === 'calendar') {
                const { date: sourceDateStr, letter: sourceLetter, data: sourceData } = droppedData;
                if (sourceDateStr === targetDateKey) { this.buildCalendarUI(); return; }
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

    _hideContextPreview() {
        this.contextPreviewModal.style.display = 'none';
    }

    async exportJourById(galleryId, publicationId, jourLetter) {
        if (!galleryId || !publicationId) {
            alert("Erreur: Impossible de déterminer la galerie ou l'ID du publication pour l'exportation.");
            return;
        }
        const exportUrl = `${BASE_API_URL}/api/galleries/${galleryId}/publications/${publicationId}/export`;
        try {
            const response = await fetch(exportUrl);
            if (!response.ok) {
                throw new Error(`Erreur HTTP ${response.status}: ${await response.text()}`);
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
            console.error(`Erreur lors de l'exportation du Publication ${jourLetter}:`, error);
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
        if (!app.currentGalleryId) return;
        try {
            const response = await fetch(`${BASE_API_URL}/api/galleries/${app.currentGalleryId}/schedule`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.organizerApp.scheduleContext.schedule)
            });
            if (!response.ok) {
                throw new Error(`Failed to save schedule: ${response.statusText}`);
            }
            this.organizerApp.refreshSidePanels();
            this.buildCalendarUI();
        } catch (e) {
            console.error("Error saving schedule data to backend:", e);
            alert("Erreur lors de la sauvegarde de la programmation.");
        }
    }

    // Fonction utilitaire pour corriger les blocs existants sans nom de galerie
    fixMissingGalleryNames() {
        const scheduleData = this.organizerApp.scheduleContext.schedule;
        const allUserPublications = this.organizerApp.scheduleContext.allUserPublications;
        let fixedCount = 0;

        Object.keys(scheduleData).forEach(dateStr => {
            Object.keys(scheduleData[dateStr]).forEach(letter => {
                const item = scheduleData[dateStr][letter];
                
                // Si le nom de galerie est manquant ou vide
                if (!item.galleryName) {
                    const jourInfo = allUserPublications.find(
                        j => j.galleryId === item.galleryId && j.letter === letter
                    );
                    
                    if (jourInfo && jourInfo.galleryName) {
                        item.galleryName = jourInfo.galleryName;
                        fixedCount++;
                        console.log(`[CalendarPage] Nom de galerie corrigé pour ${dateStr} ${letter}: ${jourInfo.galleryName}`);
                    }
                }
            });
        });

        if (fixedCount > 0) {
            this.saveSchedule();
            console.log(`[CalendarPage] ${fixedCount} bloc(s) de calendrier corrigé(s)`);
        }

        return fixedCount;
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

        // --- CORRECTION : S'assurer que le nom de la galerie est toupublications présent ---
        let finalGalleryName = galleryName;
        
        // Si le nom n'a pas été fourni, on le recherche dans allUserPublications
        if (!finalGalleryName) {
            const jourInfo = this.organizerApp.scheduleContext.allUserPublications.find(
                j => j.galleryId === galleryId && j.letter === jourLetter
            );
            if (jourInfo) {
                finalGalleryName = jourInfo.galleryName;
            }
        }
        
        scheduleData[dateStr][jourLetter] = { 
            label: `Publication ${jourLetter}`, 
            galleryId: galleryId, 
            galleryName: finalGalleryName || 'Galerie?' // Fallback au cas où
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
            const allUserPublications = this.organizerApp.scheduleContext.allUserPublications;
            const scheduledPublicationIdentifiers = new Set();
            Object.values(scheduleData).forEach(day => {
                Object.values(day).forEach(item => {
                    const letter = item.label ? item.label.split(' ')[1] : Object.keys(day).find(k => day[k] === item);
                    if (letter) scheduledPublicationIdentifiers.add(`${item.galleryId}-${letter}`);
                });
            });
            let unpublishedPublications = allUserPublications.filter(publication =>
                !scheduledPublicationIdentifiers.has(`${publication.galleryId}-${publication.letter}`) && this.organizerApp.isPublicationReadyForPublishing(publication.galleryId, publication.letter)
            );
            if (unpublishedPublications.length === 0) {
                this.autoScheduleInfo.textContent = "Tous les publications publiables sont déjà planifiés !";
                setTimeout(() => this.autoScheduleInfo.textContent = "", 3000);
                return;
            }
            if (mode === 'chrono') {
                unpublishedPublications.sort((a, b) => {
                    const galleryCompare = a.galleryName.localeCompare(b.galleryName);
                    if (galleryCompare !== 0) return galleryCompare;
                    return a.letter.localeCompare(b.letter);
                });
            } else if (mode === 'interlaced') {
                const groupedByGallery = unpublishedPublications.reduce((acc, publication) => {
                    (acc[publication.galleryId] = acc[publication.galleryId] || []).push(publication);
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
                        if (queue[i]) interlaced.push(queue[i]);
                    }
                }
                unpublishedPublications = interlaced;
            } else if (mode === 'random') {
                for (let i = unpublishedPublications.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [unpublishedPublications[i], unpublishedPublications[j]] = [unpublishedPublications[j], unpublishedPublications[i]];
                }
            }
            let currentDate = new Date();
            currentDate.setHours(0, 0, 0, 0);
            let publicationsPlaced = 0;
            while (unpublishedPublications.length > 0) {
                const dateKey = this.formatDateKey(currentDate);
                let postsOnThisDay = scheduleData[dateKey] ? Object.keys(scheduleData[dateKey]).length : 0;
                while (postsOnThisDay < postsPerDay && unpublishedPublications.length > 0) {
                    const jourToPlace = unpublishedPublications.shift();
                    if (!scheduleData[dateKey]) {
                        scheduleData[dateKey] = {};
                    }
                    scheduleData[dateKey][jourToPlace.letter] = {
                        galleryId: jourToPlace.galleryId,
                        galleryName: jourToPlace.galleryName,
                        label: `Publication ${jourToPlace.letter}`
                    };
                    postsOnThisDay++;
                    publicationsPlaced++;
                }
                if (postsOnThisDay > 0 || everyXDays > 1) {
                    currentDate.setDate(currentDate.getDate() + everyXDays);
                } else {
                    currentDate.setDate(currentDate.getDate() + 1);
                }
            }
            this.autoScheduleInfo.textContent = `${publicationsPlaced} publication(s) planifiée(s).`;
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

class PublicationOrganizer {
    constructor() {
        this.currentGalleryId = null;
        this.currentThumbSize = { width: 200, height: 200 };
        this.minThumbSize = { width: 50, height: 50 };
        this.maxThumbSize = { width: 300, height: 300 };
        this.zoomStep = 25;
        this.gridItems = [];
        this.gridItemsDict = {};
        this.publicationFrames = [];
        this.currentPublicationFrame = null;
        this.nextPublicationIndex = 0;
        this.galleryCache = {};
        this.activeUploadXHR = null;
        this.activeCallingButton = null;
        this.isLoadingGallery = false;
        this.scheduleContext = { schedule: {}, allUserPublications: [] };
        this.imageSelectorInput = document.getElementById('imageSelector');
        this.addNewImagesBtn = document.getElementById('addNewImagesBtn');
        // Remplace l'ancien bouton d'ajout dans l'aperçu
        this.galleryPreviewAddNewImagesBtn = document.getElementById('galleryPreviewAddNewImagesBtn');
        
        // Vérification de sécurité pour les éléments critiques
        if (!this.galleryPreviewAddNewImagesBtn) {
            console.error('Élément galleryPreviewAddNewImagesBtn non trouvé dans le DOM');
        }
        this.galleryPreviewSortOptions = document.getElementById('galleryPreviewSortOptions');
        this.galleryPreviewNameDisplay = document.getElementById('galleryPreviewNameDisplay');
        this.currentGalleryNameDisplay = document.getElementById('currentGalleryNameDisplay');
        this.addPhotosPlaceholderBtn = document.getElementById('addPhotosPlaceholderBtn');
        this.imageGridElement = document.getElementById('imageGrid');
        this.zoomOutBtn = document.getElementById('zoomOutBtn');
        this.zoomInBtn = document.getElementById('zoomInBtn');
        this.sortOptionsSelect = document.getElementById('sortOptions');
        // Bouton "Vider" retiré
        this.statsArea = document.getElementById('statsArea');
        this.statsLabelText = document.getElementById('statsLabelText');
        this.galleriesUploadProgressContainer = document.getElementById('galleriesUploadProgressContainer');
        this.galleriesUploadProgressText = document.getElementById('galleriesUploadProgressText');
        this.galleriesUploadProgressBarInner = document.getElementById('galleriesUploadProgressBarInner');
        this.currentGalleryUploadProgressContainer = document.getElementById('currentGalleryUploadProgressContainer');
        this.currentGalleryUploadProgressText = document.getElementById('currentGalleryUploadProgressText');
        this.currentGalleryUploadProgressBarInner = document.getElementById('currentGalleryUploadProgressBarInner');
        this.publicationFramesContainer = document.getElementById('publicationFramesContainer');
        this.addPublicationFrameBtn = document.getElementById('addPublicationFrameBtn');
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
        this.galleryStatsLabelText = document.getElementById('galleryStatsLabelText');
        // Bouton "Trier" retiré - la sélection d'une galerie charge automatiquement l'onglet Tri
        this.selectedGalleryForPreviewId = null;
        this.tabs = document.querySelectorAll('.tab-button');
        this.tabContents = document.querySelectorAll('.tab-content');
        this.calendarPage = null;
        this.descriptionManager = null;
        this.croppingPage = null;
        
        // Éléments des onglets
        this.tabs = document.querySelectorAll('.tab-button');
        this.tabContents = document.querySelectorAll('.tab-content');
        this._initListeners();
        this.updateAddPhotosPlaceholderVisibility();
        this.updateUIToNoGalleryState();
    }

    // Méthode pour initialiser les modules de manière sécurisée après que app soit défini
    initializeModules() {
        // Initialiser CalendarPage si pas encore fait
        if (!this.calendarPage) {
            const calendarTabContent = document.getElementById('calendar');
            if (calendarTabContent) {
                this.calendarPage = new CalendarPage(calendarTabContent, this);
            }
        }

        // Initialiser DescriptionManager si pas encore fait
        if (!this.descriptionManager) {
            const descriptionTabContent = document.getElementById('description');
            if (descriptionTabContent) {
                this.descriptionManager = new DescriptionManager(this);
            }
        }

        // Initialiser CroppingPage si pas encore fait
        if (!this.croppingPage) {
            const croppingTabContent = document.getElementById('cropping');
            if (croppingTabContent) {
                this.croppingPage = new CroppingPage(this);
            }
        }
    }

    async activateTab(tabId) {
        // Détecter l'onglet actuellement actif
        const currentActiveTab = document.querySelector('.tab-content.active');

        // Si on quitte l'onglet "description", sauvegarder immédiatement
        if (currentActiveTab && currentActiveTab.id === 'description' && tabId !== 'description' && this.descriptionManager) {
            await this.descriptionManager.saveOnTabExit();
        }

        // Gestion des onglets
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
            } else if (tabId === 'currentGallery') {
                if (this.currentGalleryId && !this.currentPublicationFrame && this.publicationFrames.length > 0) {
                    const publicationA = this.publicationFrames.find(jf => jf.letter === 'A') || this.publicationFrames[0];
                    if (publicationA) this.setCurrentPublicationFrame(publicationA);
                }
            } else if (tabId === 'cropping') {
                if (this.currentGalleryId && this.croppingPage) {
                    // Initialiser la vue groupée par défaut
                    this.croppingPage.switchToGroupedView();
                }
            } else if (tabId === 'description') {
                if (!this.descriptionManager) this.descriptionManager = new DescriptionManager(this);
                if (this.currentGalleryId) this.descriptionManager.show();
            } else if (tabId === 'calendar') {
                if (!this.calendarPage) this.calendarPage = new CalendarPage(tabContent, this);
                if (this.currentGalleryId) this.calendarPage.buildCalendarUI();
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

    refreshPublicationViews() {
        console.log('Refreshing all publication views...');
        // Rafraîchit les rubans de l'onglet "Tri"
        this.publicationFrames.forEach(pf => {
            pf.canvasWrapper.innerHTML = ''; // Vider l'ancien contenu
            pf.imagesData.forEach(imgData => {
                const newElement = pf.createPublicationItemElement(imgData);
                pf.canvasWrapper.appendChild(newElement);
            });
        });

        // Rafraîchit la vue groupée de l'onglet "Recadrage"
        if (this.croppingPage) {
            this.croppingPage.renderAllPhotosGroupedView();
        }
            
        // Met à jour les indicateurs d'utilisation sur la grille principale
        this.updateGridUsage();
    }

    _initListeners() {
        // Event listener pour l'ancien formulaire supprimé - nouvelle interface intégrée dans la liste
        this.imageSelectorInput.addEventListener('change', (event) => {
            let targetGalleryId = null;
            if (document.getElementById('galleries').classList.contains('active') && this.selectedGalleryForPreviewId) {
                targetGalleryId = this.selectedGalleryForPreviewId;
                if (!this.activeCallingButton) {
                    this.activeCallingButton = this.galleryPreviewGridElement.querySelector('.add-photos-preview-btn');
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
                alert("Veuillez sélectionner une galerie avant d'ajouter des images.");
                this.imageSelectorInput.value = "";
                if (this.activeCallingButton) this.activeCallingButton.disabled = false;
                this.activeCallingButton = null;
            }
        });
        // Bouton "Trier" retiré - la sélection d'une galerie charge automatiquement l'onglet Tri
        this.addNewImagesBtn.addEventListener('click', () => {
            if (!this.currentGalleryId) { alert("Veuillez d'abord charger ou créer une galerie."); return; }
            this.activeCallingButton = this.addNewImagesBtn;
            this.imageSelectorInput.click()
        });
        this.galleryPreviewAddNewImagesBtn.addEventListener('click', () => {
            if (!this.selectedGalleryForPreviewId) { alert("Veuillez sélectionner une galerie pour y ajouter des images."); return; }
            this.activeCallingButton = this.galleryPreviewAddNewImagesBtn;
            this.imageSelectorInput.click();
        });

        // Ajoute la logique pour le nouveau sélecteur de tri de l'aperçu
        this.galleryPreviewSortOptions.addEventListener('change', () => {
            if (this.selectedGalleryForPreviewId) {
                // Recharge l'aperçu avec la nouvelle option de tri
                this.showGalleryPreview(this.selectedGalleryForPreviewId, this.galleryCache[this.selectedGalleryForPreviewId]);
            }
        });
        this.addPhotosPlaceholderBtn.addEventListener('click', () => {
            if (!this.currentGalleryId) { alert("Veuillez d'abord charger ou créer une galerie."); return; }
            this.activeCallingButton = this.addPhotosPlaceholderBtn;
            this.imageSelectorInput.click()
        });
        this.zoomOutBtn.addEventListener('click', () => this.zoomOut());
        this.zoomInBtn.addEventListener('click', () => this.zoomIn());
        this.sortOptionsSelect.addEventListener('change', () => this.sortGridItemsAndReflow());
        // Bouton "Vider" retiré
        this.addPublicationFrameBtn.addEventListener('click', () => this.addPublicationFrame());

        const downloadAllBtn = document.getElementById('downloadAllScheduledBtn');
        if (downloadAllBtn) {
            downloadAllBtn.addEventListener('click', () => this.downloadAllScheduledPublications());
        }

        this.createNewGalleryBtn.addEventListener('click', () => {
            this.createNewGalleryInList();
        });
        // Event listeners pour l'ancien formulaire supprimés - nouvelle interface intégrée dans la liste

        this.tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                this.activateTab(tab.dataset.tab);
            });
        });

        // Bouton de nettoyage manuel des publications vides
        const cleanupBtn = document.getElementById('cleanupEmptyPublicationsBtn');
        if (cleanupBtn) {
            cleanupBtn.addEventListener('click', () => {
                if (confirm("Voulez-vous vraiment supprimer toutes les publications vides (sauf la première) ?")) {
                    this.removeEmptyPublications();
                    alert('Nettoyage terminé.');
                }
            });
        }
    }

    _populateSharedJourList(listElement, activeJourId, listType, showCheckboxes = false) {
        listElement.innerHTML = '';
        const publications = this.publicationFrames;
        if (!publications || publications.length === 0) {
            listElement.innerHTML = '<li>Aucune publication définie.</li>';
            return;
        }
        publications.forEach(publicationFrame => {
            const li = document.createElement('li');
            li.className = 'publication-list-item';
            li.dataset.publicationId = publicationFrame.id;
            if (activeJourId === publicationFrame.id) {
                if (listType === 'cropping') li.classList.add('active-cropping-publication');
                else if (listType === 'description') li.classList.add('active-description-publication');
            }
            const textSpan = document.createElement('span');
            textSpan.className = 'publication-list-item-text';
            textSpan.textContent = `Publication ${publicationFrame.letter}`;
            const iconsDiv = document.createElement('div');
            iconsDiv.className = 'publication-list-item-icons';
            const isCropped = publicationFrame.hasBeenProcessedByCropper;
            const hasDescription = (publicationFrame.descriptionText && publicationFrame.descriptionText.trim() !== '');
            const isScheduled = this.calendarPage ? this.calendarPage.isJourScheduled(publicationFrame.galleryId, publicationFrame.letter) : false;
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

            if (showCheckboxes) {
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'publication-list-item-checkbox';
                checkbox.dataset.publicationId = publicationFrame.id;
                li.appendChild(checkbox);
            }

            listElement.appendChild(li);
        });
    }

    refreshSidePanels() {
        if (this.croppingPage && document.getElementById('cropping').classList.contains('active')) {
            this.croppingPage.populateJourList();
        }
        if (this.descriptionManager && document.getElementById('description').classList.contains('active')) {
            this.descriptionManager.populateLists();
        }
    }

    async downloadAllScheduledPublications() {
        if (!this.calendarPage || !this.scheduleContext.schedule) {
            alert("Les données du calendrier ne sont pas chargées.");
            return;
        }
        const scheduledPublications = [];
        const jourMap = new Map(this.scheduleContext.allUserPublications.map(j => [`${j.galleryId}-${j.letter}`, j._id]));
        for (const date in this.scheduleContext.schedule) {
            for (const letter in this.scheduleContext.schedule[date]) {
                const item = this.scheduleContext.schedule[date][letter];
                const publicationId = jourMap.get(`${item.galleryId}-${letter}`);
                if (publicationId) {
                    if (!scheduledPublications.some(j => j.publicationId === publicationId)) {
                        scheduledPublications.push({ galleryId: item.galleryId, publicationId: publicationId });
                    }
                }
            }
        }
        if (scheduledPublications.length === 0) {
            alert("Aucun publication n'est actuellement planifié dans le calendrier.");
            return;
        }
        const downloadBtn = document.getElementById('downloadAllScheduledBtn');
        const originalText = downloadBtn.textContent;
        downloadBtn.textContent = 'Préparation...';
        downloadBtn.disabled = true;
        try {
            const response = await fetch(`${BASE_API_URL}/api/publications/export-all-scheduled`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ publications: scheduledPublications })
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
            console.error("Erreur lors du téléchargement de tous les publications planifiés:", error);
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
        // Bouton "Trier" retiré
        if (noGalleryActive) {
            this.imageGridElement.innerHTML = '<p style="text-align:center; margin-top:20px;">Chargez ou créez une galerie pour voir les images.</p>';
            this.publicationFramesContainer.innerHTML = '<p style="text-align:center;">Chargez ou créez une galerie pour gérer les publications.</p>';
            this.addPhotosPlaceholderBtn.style.display = 'none';
            this.statsLabelText.textContent = "Aucune galerie chargée";
            if (this.currentGalleryUploadProgressContainer) this.currentGalleryUploadProgressContainer.style.display = 'none';
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
                this.scheduleContext = { schedule: {}, allUserPublications: [] };
                this.calendarPage.buildCalendarUI();
            } else {
                this.calendarPage.buildCalendarUI();
            }
        }
        const croppingTabContent = document.getElementById('cropping');
        croppingTabContent.querySelectorAll('button, select').forEach(el => {
            if (el.id !== 'toggleCroppingViewBtn') { // Exclude the toggle button from being disabled
                el.disabled = noGalleryActive;
            }
        });
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
                this.descriptionManager.populateLists();
            } else if (descriptionTabContent.classList.contains('active')) {
                this.descriptionManager.show();
            }
        }
        if (noGalleryActive && !document.getElementById('galleries').classList.contains('active')) {
            this.activateTab('galleries');
        }
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
                if (typeof gallery.imageCount === 'number') {
                    const countSpan = document.createElement('span');
                    countSpan.className = 'gallery-photo-count';
                    countSpan.textContent = `(${gallery.imageCount})`;
                    nameSpan.appendChild(countSpan);
                }
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
            console.warn("Erreur lors du chargement de la liste des galeries:", error.message);
            if (error.message.includes('NetworkError') || error.message.includes('Failed to fetch')) {
                this.galleriesListElement.innerHTML = `<li>⚠️ Serveur non disponible. Vérifiez que le serveur est démarré.</li>`;
            } else {
                this.galleriesListElement.innerHTML = `<li>Erreur de chargement: ${error.message}</li>`;
            }
            this.clearGalleryPreview();
        }
    }

    async showGalleryPreview(galleryId, galleryName, isNewGallery = false) {
        this.selectedGalleryForPreviewId = galleryId;
        this.galleryPreviewPlaceholder.style.display = 'none';
        
        // Utilise la nouvelle barre de contrôles au lieu de l'ancien header
        const controlsBar = document.getElementById('galleryPreviewControlsBar');
        const nameDisplay = document.getElementById('galleryPreviewNameDisplay');
        controlsBar.style.display = 'flex';
        nameDisplay.textContent = galleryName;

        this.galleryPreviewGridElement.innerHTML = '<p>Chargement des images...</p>';
        this.galleriesUploadProgressContainer.style.display = 'none';

        // Marquer comme nouvelle galerie (style discret)
        if (isNewGallery) {
            this.galleryPreviewArea.classList.add('gallery-just-created');
            setTimeout(() => {
                this.galleryPreviewArea.classList.remove('gallery-just-created');
            }, 5000);
        }

        this.galleriesListElement.querySelectorAll('.gallery-list-item').forEach(item => {
            item.classList.remove('selected-for-preview');
            if (item.dataset.galleryId === galleryId) {
                item.classList.add('selected-for-preview');
            }
        });
        
        document.getElementById('galleryPreviewAddNewImagesBtn').disabled = false;
        try {
            // NOUVEAU : Récupère la valeur de tri et l'ajoute à l'URL
            const sortValue = document.getElementById('galleryPreviewSortOptions').value;
            // Note: L'endpoint API doit être capable de gérer ce paramètre de tri
            const response = await fetch(`${BASE_API_URL}/api/galleries/${galleryId}/images?sort=${sortValue}&limit=50`);
            
            if (!response.ok) throw new Error(`Erreur HTTP: ${response.status}`);
            
            // La route /images renvoie directement l'objet de pagination
            const imagesResult = await response.json();
            this.galleryCache[galleryId] = galleryName; // On garde le nom en cache
            this.galleryPreviewGridElement.innerHTML = '';
            
            const imagesToDisplay = imagesResult.docs || [];

            if (imagesToDisplay.length > 0) {
                // Marquer la grille comme ayant des photos
                this.galleryPreviewGridElement.classList.add('has-photos');
                imagesToDisplay.forEach(imgData => {
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

                if (imagesResult.total > imagesToDisplay.length) {
                    const paginationInfo = document.createElement('div');
                    paginationInfo.className = 'gallery-preview-pagination-info';
                    paginationInfo.style.cssText = `text-align: center; padding: 10px; font-size: 0.9em; color: #666; border-top: 1px solid #eee; margin-top: 10px; grid-column: 1 / -1;`;
                    paginationInfo.textContent = `Affichage de ${imagesToDisplay.length} sur ${imagesResult.total} images`;
                    this.galleryPreviewGridElement.appendChild(paginationInfo);
                }
            } else {
                // Afficher un simple message informatif au lieu d'un bouton redondant
                const emptyMessage = document.createElement('p');
                emptyMessage.textContent = 'Cette galerie est vide. Ajoutez des photos en utilisant le bouton ci-dessus.';
                emptyMessage.style.cssText = `
                    text-align: center;
                    color: #6c757d;
                    margin-top: 40px;
                    font-size: 1.1em;
                    padding: 20px;
                `;
                this.galleryPreviewGridElement.appendChild(emptyMessage);

                // Marquer la grille comme vide pour les styles CSS
                this.galleryPreviewGridElement.classList.remove('has-photos');
            }
            
            // Mettre à jour les statistiques de la galerie avec le nombre total d'images
            this.updateGalleryStatsLabel(galleryId, imagesResult.total);
        } catch (error) {
            console.error("Erreur lors du chargement de l'aperçu de la galerie:", error);
            this.galleryPreviewGridElement.innerHTML = `<p>Erreur: ${error.message}</p>`;
            this.galleryStatsLabelText.textContent = "Grille: ? | Publications: ?";
        }
    }

    async handleDeleteImageFromPreview(previewGalleryId, imageId, imageNameForConfirm) {
        if (!confirm(`Voulez-vous vraiment supprimer l'image "${imageNameForConfirm}" de la galerie "${this.galleryCache[previewGalleryId] || previewGalleryId}" ?\nCeci affectera aussi les Publications et le Calendrier si l'image y est utilisée.`)) {
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
            await this.showGalleryPreview(previewGalleryId, this.galleryCache[previewGalleryId] || "Galerie");
            if (previewGalleryId === this.currentGalleryId) {
                result.deletedImageIds.forEach(idToDelete => {
                    const itemInGrid = this.gridItemsDict[idToDelete];
                    if (itemInGrid) {
                        itemInGrid.element.remove();
                        this.gridItems = this.gridItems.filter(item => item.id !== idToDelete);
                        delete this.gridItemsDict[idToDelete];
                    }
                    this.publicationFrames.forEach(jf => jf.removeImageByActualId(idToDelete));
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
        
        // Cache la nouvelle barre de contrôles
        document.getElementById('galleryPreviewControlsBar').style.display = 'none';

        this.galleryPreviewGridElement.innerHTML = '';
        this.galleryStatsLabelText.textContent = "Grille: 0 | Publications: 0";
        if (this.galleriesUploadProgressContainer) this.galleriesUploadProgressContainer.style.display = 'none';
        
        this.galleriesListElement.querySelectorAll('.gallery-list-item.selected-for-preview').forEach(item => {
            item.classList.remove('selected-for-preview');
        });
    }


    createNewGalleryInList() {
        // Vérifier s'il y a déjà un élément de création en cours
        const existingNewItem = this.galleriesListElement.querySelector('.new-gallery-item');
        if (existingNewItem) {
            existingNewItem.remove();
        }

        // Créer l'élément de nouvelle galerie
        const li = document.createElement('li');
        li.className = 'gallery-list-item new-gallery-item';
        li.style.cssText = `
            background-color: #f0f8ff;
            border: 2px dashed #007bff;
        `;

        // Créer le champ de saisie
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'new-gallery-input';
        input.placeholder = 'Nom de la nouvelle galerie';
        input.style.cssText = `
            flex: 1;
            border: none;
            background: rgba(255, 255, 255, 0.9);
            font-size: 14px;
            padding: 6px 10px;
            border-radius: 4px;
            outline: none;
            font-weight: normal;
            color: #333;
        `;

        // Créer les boutons d'action
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'gallery-actions';

        const confirmBtn = document.createElement('button');
        confirmBtn.innerHTML = '✓';
        confirmBtn.className = 'small-confirm-btn';
        confirmBtn.title = 'Créer la galerie';
        confirmBtn.onclick = () => this.confirmNewGalleryFromList(input.value.trim());

        const cancelBtn = document.createElement('button');
        cancelBtn.innerHTML = '×';
        cancelBtn.className = 'small-cancel-btn';
        cancelBtn.title = 'Annuler';
        cancelBtn.onclick = () => li.remove();

        actionsDiv.appendChild(confirmBtn);
        actionsDiv.appendChild(cancelBtn);

        li.appendChild(input);
        li.appendChild(actionsDiv);

        // Ajouter à la fin de la liste
        this.galleriesListElement.appendChild(li);

        // Focus sur l'input
        input.focus();

        // Gérer la validation par Entrée
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.confirmNewGalleryFromList(input.value.trim());
            } else if (e.key === 'Escape') {
                li.remove();
            }
        });
    }

    async confirmNewGalleryFromList(galleryName) {
        const newGalleryItem = this.galleriesListElement.querySelector('.new-gallery-item');
        if (!newGalleryItem) return;

        const finalName = galleryName || `Galerie du ${new Date().toLocaleDateString('fr-FR')}`;

        try {
            const response = await fetch(`${BASE_API_URL}/api/galleries`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: finalName })
            });
            if (!response.ok) throw new Error(`Erreur HTTP: ${response.status} - ${await response.text()}`);
            const newGallery = await response.json();
            this.galleryCache[newGallery._id] = newGallery.name;

            // Supprimer l'élément temporaire
            newGalleryItem.remove();

            // Recharger la liste (qui sera triée alphabétiquement)
            await this.loadGalleriesList();

            // Sélectionner la nouvelle galerie avec animation
            this.showGalleryPreview(newGallery._id, newGallery.name, true);

            if (!this.currentGalleryId) {
                this.handleLoadGallery(newGallery._id);
            } else {
                this.activateTab('galleries');
            }
            this.updateUIToNoGalleryState();
        } catch (error) {
            console.error("Erreur lors de la création de la galerie:", error);
            alert(`Impossible de créer la galerie: ${error.message}`);
            newGalleryItem.remove();
        }
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
        if (this.currentGalleryId && this.currentGalleryId !== galleryId) {
            await this.saveAppState();
        }
        this.currentGalleryId = galleryId;
        localStorage.setItem('publicationOrganizer_lastGalleryId', this.currentGalleryId);
        this.gridItems = [];
        this.gridItemsDict = {};
        this.imageGridElement.innerHTML = '';
        this.publicationFrames = [];
        this.publicationFramesContainer.innerHTML = '';
        this.currentPublicationFrame = null;
        this.scheduleContext = { schedule: {}, allUserPublications: [] };
        if (this.descriptionManager) this.descriptionManager.clearEditor();
        if (this.croppingPage) this.croppingPage.clearEditor();
        if (this.galleriesUploadProgressContainer) this.galleriesUploadProgressContainer.style.display = 'none';
        if (this.currentGalleryUploadProgressContainer) this.currentGalleryUploadProgressContainer.style.display = 'none';
        await this.loadState();
        // Bouton "Trier" retiré
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

        // CORRECTION 2: Réinitialisation complète et groupée de l'état
        this.isLoadingGallery = true;
        this.gridItems = [];
        this.gridItemsDict = {};
        this.publicationFrames = [];
        this.imageGridElement.innerHTML = '';
        this.publicationFramesContainer.innerHTML = '';
        this.currentPublicationFrame = null;

        try {
            const response = await fetch(`${BASE_API_URL}/api/galleries/${this.currentGalleryId}`);
            if (!response.ok) {
                // ... (gestion des erreurs de fetch)
                if (response.status === 404) {
                    alert("La galerie demandée n'a pas été trouvée.");
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

            // CORRECTION 1: Utiliser data.jours au lieu de data.publications
            let loadedPublications = (data.jours || []).sort((a, b) => a.index - b.index);
                
            // LOG 1: Voir les données brutes des publications reçues du serveur
            console.log('[LOG 1] Données brutes des publications reçues du serveur:', JSON.parse(JSON.stringify(loadedPublications)));

            // CORRECTION 3: Logique de réparation simplifiée et robuste
            const highestIndex = loadedPublications.length > 0 ? loadedPublications[loadedPublications.length - 1].index : -1;
            console.log(`[LOG 2] Analyse de la séquence. Index Max trouvé: ${highestIndex}. La séquence sera vérifiée de 0 à ${highestIndex}.`);
                
            const repairedPublications = [];

            if (highestIndex > -1) {
                // Boucle de réparation
                for (let i = 0; i <= highestIndex; i++) {
                    let publicationForIndex = loadedPublications.find(p => p.index === i);

                    if (publicationForIndex) {
                        console.log(`[LOG 3A - index ${i}] OK. Publication ${publicationForIndex.letter} trouvée. Ajout à la liste finale.`);
                        repairedPublications.push(publicationForIndex);
                    } else {
                        console.warn(`[LOG 3B - index ${i}] MANQUANT. Tentative de création...`);
                        try {
                            const createResponse = await fetch(`${BASE_API_URL}/api/galleries/${this.currentGalleryId}/publications`, { method: 'POST' });
                            if (createResponse.ok) {
                                const newPubData = await createResponse.json();
                                console.log(`[LOG 3C - index ${i}] ✅ SUCCÈS. Publication ${newPubData.letter} (index ${newPubData.index}) recréée.`);
                                repairedPublications.push(newPubData);
                            } else {
                                console.error(`[LOG 3D - index ${i}] ❌ ÉCHEC de la création. Le serveur a répondu ${createResponse.status}.`);
                            }
                        } catch (error) {
                             console.error(`[LOG 3E - index ${i}] ❌ ERREUR API lors de la recréation:`, error);
                        }
                    }
                }
            }
                
            // Si la galerie était/est complètement vide, on crée 'A'
            if (repairedPublications.length === 0) {
                console.log("[INFO] La galerie était/est vide. Création de 'A' par défaut.");
                const createResponse = await fetch(`${BASE_API_URL}/api/galleries/${this.currentGalleryId}/publications`, { method: 'POST' });
                if (createResponse.ok) {
                    repairedPublications.push(await createResponse.json());
                }
            }

            console.log('[LOG 4] Publications FINALES après réparation complète:', repairedPublications.map(p => ({ letter: p.letter, index: p.index })));

            // Construction de l'interface à partir de la liste finale et propre
            repairedPublications.forEach(publicationData => {
                const newPublicationFrame = new PublicationFrameBackend(this, publicationData);
                this.publicationFramesContainer.appendChild(newPublicationFrame.element);
                this.publicationFrames.push(newPublicationFrame);
            });

            console.log('[LOG 5] Contenu de this.publicationFrames (objets UI) avant sélection:', this.publicationFrames.map(p => ({ letter: p.letter, index: p.index })));

            // Sélectionner la Publication A par défaut
            const publicationA = this.publicationFrames.find(p => p.index === 0);
            if (publicationA) {
                console.log("[LOG 6] ✅ Publication A trouvée et sélectionnée.");
                this.setCurrentPublicationFrame(publicationA);
            } else {
                console.error("[LOG 6] ❌ ERREUR CRITIQUE: La Publication A est toujours manquante !");
                if (this.publicationFrames.length > 0) {
                    const firstAvailable = this.publicationFrames[0];
                    console.warn(`[LOG 6] FALLBACK: Sélection de la première publication disponible: ${firstAvailable.letter} (index ${firstAvailable.index})`);
                    this.setCurrentPublicationFrame(firstAvailable);
                }
            }
                
            // ... (suite de la fonction loadState pour charger les images, le calendrier, etc.)
            const galleryState = data.galleryState || {};
            
            // Mise à jour du nom de galerie dans l'onglet Tri
            if (this.currentGalleryNameDisplay) {
                this.currentGalleryNameDisplay.textContent = this.getCurrentGalleryName();
            }
            
            this.currentThumbSize = galleryState.currentThumbSize || { width: 150, height: 150 };
            this.sortOptionsSelect.value = 'name_asc';
            if (data.images) { this.addImagesToGrid(data.images); this.sortGridItemsAndReflow(); }
            if (this.descriptionManager) { this.descriptionManager.setCommonDescription(galleryState.commonDescriptionText || ''); }
            this.scheduleContext = { schedule: data.schedule || {}, allUserPublications: data.scheduleContext.allUserPublications || [] };
            if (this.calendarPage) { this.publicationFrames.forEach(jf => this.ensureJourInAllUserPublications(jf)); this.calendarPage.buildCalendarUI(); }
            this.isLoadingGallery = false;
            this.updateGridUsage();
            this.updateStatsLabel();
            this.updateAddPhotosPlaceholderVisibility();
            this.updateGridItemStyles();
            this.updateUIToNoGalleryState();
            if (this.croppingPage && this.croppingPage.autoCropper) { this.croppingPage.autoCropper.refreshJourSelection(); }
            this.activateTab(galleryState.activeTab || 'currentGallery');

        } catch (error) {
            console.error("Erreur critique lors du chargement de l'état de la galerie:", error);
            loadingOverlay.querySelector('p').innerHTML = `Erreur de chargement: ${error.message}<br/>Veuillez rafraîchir.`;
        } finally {
            this.isLoadingGallery = false;
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
        if (!confirm(`Êtes-vous sûr de vouloir supprimer la galerie "${galleryName || galleryId}" et toutes ses données ?\nCETTE ACTION EST IRRÉVERSIBLE.`)) {
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
                this.publicationFrames = [];
                this.publicationFramesContainer.innerHTML = '';
                this.currentPublicationFrame = null;
                this.nextPublicationIndex = 0;
                this.scheduleContext = { schedule: {}, allUserPublications: [] };
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
            this.addNewImagesBtn.style.display = 'none';
            this.imageGridElement.innerHTML = '<p style="text-align:center; margin-top:20px;">Chargez ou créez une galerie pour voir les images.</p>';
            this.imageGridElement.style.display = 'block';
            return;
        }
        if (this.gridItems.length === 0) {
            // Galerie vide : masquer le bouton du header, afficher le bouton central
            this.addNewImagesBtn.style.display = 'none';
            this.addPhotosPlaceholderBtn.style.display = 'block';
            this.imageGridElement.style.display = 'none';
        } else {
            // Galerie avec photos : afficher le bouton du header, masquer le bouton central
            this.addNewImagesBtn.style.display = 'block';
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
            return;
        }
        progressContainer.style.display = 'block';
        progressBarInnerEl.style.width = '0%';
        progressBarInnerEl.textContent = '0%';
        progressBarInnerEl.style.backgroundColor = '#007bff';
        progressTextEl.textContent = `Préparation de l'upload de ${totalFiles} images...`;
        if (callingButtonElement) callingButtonElement.disabled = true;
        this.imageSelectorInput.disabled = true;
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
                        // Marquer pour rafraîchir à la fin plutôt que de rafraîchir à chaque lot
                        this.needsGalleryPreviewRefresh = true;
                    }
                }
                progressBarInnerEl.style.backgroundColor = '#007bff';
            } catch (error) {
                console.error(`[CLIENT] Erreur lors de l'envoi du lot ${batchNumber}:`, error);
                progressTextEl.textContent = `Erreur sur lot ${batchNumber}. ${error.message ? String(error.message).substring(0, 40) : 'Erreur'}.`;
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

        // Rafraîchir la galerie de prévisualisation si nécessaire
        if (this.needsGalleryPreviewRefresh && targetGalleryIdForUpload === this.selectedGalleryForPreviewId) {
            await this.showGalleryPreview(this.selectedGalleryForPreviewId, this.galleryCache[this.selectedGalleryForPreviewId] || "Galerie");
            this.needsGalleryPreviewRefresh = false;
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
                }
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
                        resolve(JSON.parse(xhr.responseText));
                    } catch (e) {
                        reject(new Error("Réponse serveur invalide pour le lot."));
                    }
                } else {
                    const errorMsg = `Échec du lot (${xhr.status} ${xhr.statusText}). Réponse: ${xhr.responseText.substring(0, 100)}`;
                    reject(new Error(errorMsg));
                }
            };
            xhr.onerror = () => reject(new Error("Erreur réseau lors de l'envoi du lot."));
            xhr.onabort = () => reject(new Error("Upload du lot annulé."));
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
        if (!confirm(`Voulez-vous vraiment supprimer l'image "${imageNameForConfirm}" et toutes ses utilisations ?`)) {
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
            result.deletedImageIds.forEach(idToDelete => {
                const itemInGrid = this.gridItemsDict[idToDelete];
                if (itemInGrid) {
                    itemInGrid.element.remove();
                    this.gridItems = this.gridItems.filter(item => item.id !== idToDelete);
                    delete this.gridItemsDict[idToDelete];
                }
                this.publicationFrames.forEach(jf => {
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

    // Fonction clearAllGalleryImages supprimée - bouton "Vider" retiré

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
        let sortValue = this.sortOptionsSelect.value;

        // Si aucune option n'est sélectionnée (placeholder), utiliser le tri par défaut
        if (!sortValue || sortValue === '') {
            sortValue = 'name_asc';
            this.sortOptionsSelect.value = sortValue;
        }

        // --- DÉBUT DE LA CORRECTION ---
        // On ne trie et n'affiche que les images originales dans la grille principale.
        // Les versions recadrées existent en mémoire mais ne sont pas montrées ici.
        const originalImages = this.gridItems.filter(item => !item.isCroppedVersion);

        originalImages.sort((a, b) => {
            let valA, valB;
            switch (sortValue) {
                case 'name_asc': case 'name_desc':
                    valA = a.basename; valB = b.basename;
                    const comparison = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
                    return sortValue.endsWith('_asc') ? comparison : -comparison;
                case 'date_asc': case 'date_desc':
                    valA = a.datetimeOriginalTs !== null ? a.datetimeOriginalTs : a.fileModTimeTs;
                    valB = b.datetimeOriginalTs !== null ? b.datetimeOriginalTs : b.fileModTimeTs;
                    if (valA === null) return sortValue.endsWith('_asc') ? 1 : -1;
                    if (valB === null) return sortValue.endsWith('_asc') ? -1 : 1;
                    const dateComparison = valA - valB;
                    return sortValue.endsWith('_asc') ? dateComparison : -dateComparison;
                default: return 0;
            }
        });

        // Vider la grille et la repeupler uniquement avec les images originales triées
        this.imageGridElement.innerHTML = '';
        originalImages.forEach(item => this.imageGridElement.appendChild(item.element));
        // --- FIN DE LA CORRECTION ---

        this.updateGridUsage();
        this.saveAppState();
    }

    onGridItemClick(gridItem) {
        if (!gridItem || !gridItem.isValid) return;
        if (!this.currentPublicationFrame) {
            alert("Veuillez d'abord sélectionner ou ajouter un Publication de publication actif.");
            return;
        }
        const alreadyInCurrentJourFrame = this.currentPublicationFrame.imagesData.some(imgData => imgData.imageId === gridItem.id);
        if (alreadyInCurrentJourFrame) {
            this.currentPublicationFrame.removeImageById(gridItem.id);
            // Mise à publication immédiate de la liste des publications à planifier après suppression
            this.currentPublicationFrame.updateUnscheduledPublicationsList();
        } else {
            const combinedUsage = this.getCombinedUsageMapForMultiDay();
            const originalId = gridItem.parentImageId || gridItem.id;
            const usageArray = combinedUsage.get(originalId) || [];
            const uniqueJourLetters = new Set(usageArray.map(u => u.jourLetter));
            if (uniqueJourLetters.size >= 4) {
                alert("Une image ne peut pas être sélectionnée dans plus de 4 publications différents.");
                return;
            }

            // --- DÉBUT DE LA CORRECTION ---
            const newItemData = {
                imageId: gridItem.id,
                originalReferencePath: gridItem.parentImageId || gridItem.id,
                dataURL: gridItem.thumbnailPath,
                isCropped: gridItem.isCroppedVersion
            };

            // 1. Mettre à publication le modèle de données d'abord
            this.currentPublicationFrame.imagesData.push(newItemData);

            // 2. Créer et ajouter le nouvel élément DOM
            const newElement = this.currentPublicationFrame.createPublicationItemElement(newItemData);
            this.currentPublicationFrame.canvasWrapper.appendChild(newElement);

            // 3. Appeler directement les fonctions de mise à publication (au lieu de syncDataArrayFromDOM)
            this.updateGridUsage();
            this.currentPublicationFrame.debouncedSave();
            this.currentPublicationFrame.checkAndApplyCroppedStyle();
            this.currentPublicationFrame.updateUnscheduledPublicationsList();
            // --- FIN DE LA CORRECTION ---
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

        // Mettre à publication le calendrier si l'onglet calendrier est actif
        // MAIS seulement si on n'est pas en train de charger une galerie
        if (this.calendarPage && document.getElementById('calendar').classList.contains('active') && !this.isLoadingGallery) {
            this.calendarPage.buildCalendarUI();
        }
    }

    getCombinedUsageMapForMultiDay() {
        const combined = new Map();
        this.publicationFrames.forEach(jf => {
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
            this.statsLabelText.textContent = i18n.t('labels.noGalleryLoaded');
            return;
        }
        const numGridImages = this.gridItems.filter(item => item.isValid).length;
        const numPublications = this.publicationFrames.length;
        
        // Utilisation du gestionnaire de pluriel pour les photos
        const galleryStatsText = i18n.t('labels.galleryStats', { count: numGridImages });
        this.statsLabelText.textContent = i18n.t('messages.gridStats', { 
            grid: numGridImages, 
            publications: numPublications 
        });
        
        // Mettre à jour aussi les statistiques de la galerie si c'est la même galerie
        if (this.selectedGalleryForPreviewId === this.currentGalleryId) {
            this.galleryStatsLabelText.textContent = galleryStatsText;
        }
    }

    updateGalleryStatsLabel(galleryId = null, totalImages = null) {
        const targetGalleryId = galleryId || this.selectedGalleryForPreviewId;
        if (!targetGalleryId) {
            this.galleryStatsLabelText.textContent = "0 photo dans la galerie";
            return;
        }

        if (totalImages !== null) {
            this.galleryStatsLabelText.textContent = `${totalImages} photo${totalImages !== 1 ? 's' : ''} dans la galerie`;
            return;
        }
        
        // Si c'est la galerie actuellement chargée, utiliser les données en mémoire
        if (targetGalleryId === this.currentGalleryId) {
            const numGridImages = this.gridItems.filter(item => !item.isCroppedVersion).length;
            this.galleryStatsLabelText.textContent = `${numGridImages} photo${numGridImages !== 1 ? 's' : ''} dans la galerie`;
        } else {
            this.galleryStatsLabelText.textContent = "Chargement...";
            // La fonction showGalleryPreview s'occupe de mettre à jour le total.
        }
    }

    async fetchGalleryStats(galleryId) {
        try {
            const response = await fetch(`${BASE_API_URL}/api/galleries/${galleryId}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const galleryDetails = await response.json();
            
            const totalImages = galleryDetails.images?.total || galleryDetails.images?.docs?.length || 0;
            this.galleryStatsLabelText.textContent = `${totalImages} photo${totalImages > 1 ? 's' : ''} dans la galerie`;
        } catch (error) {
            console.error("Erreur lors du chargement des statistiques de la galerie:", error);
            this.galleryStatsLabelText.textContent = "? photos dans la galerie";
        }
    }

    async addPublicationFrame() {
        if (!this.currentGalleryId) { alert("Aucune galerie active."); return; }
        this.recalculateNextPublicationIndex();
        if (this.nextPublicationIndex >= 26) { alert(i18n.t('messages.maxPublicationsReached')); return; }
        
        // ======================= LOG À AJOUTER (DÉBUT) =======================
        console.log('[DEBUG] addPublicationFrame: DÉBUT - Publications actuelles:', this.publicationFrames.map(p => ({ letter: p.letter, index: p.index })));
        console.log('[DEBUG] addPublicationFrame: Bouton désactivé, envoi de la requête...');
        // =====================================================================
        
        this.addPublicationFrameBtn.disabled = true;
        try {
            const response = await fetch(`${BASE_API_URL}/api/galleries/${this.currentGalleryId}/publications`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            if (!response.ok) {
                let errorBody = await response.text();
                let userMessage = `Erreur lors de la création du Publication : ${response.statusText}`;
                try {
                    const errorJson = JSON.parse(errorBody);
                    if (errorJson.message) userMessage = errorJson.message;
                } catch (e) {
                    userMessage += ` - ${errorBody}`;
                }
                throw new Error(userMessage);
            }
            const newJourData = await response.json();
            
            // ======================= LOG À AJOUTER (2/2) =======================
            console.log('[DEBUG] addPublicationFrame: Réponse du serveur, publication créée:', { letter: newJourData.letter, index: newJourData.index });
            // =====================================================================
            
            const newPublicationFrame = new PublicationFrameBackend(this, newJourData);
            this.publicationFramesContainer.appendChild(newPublicationFrame.element);
            this.publicationFrames.push(newPublicationFrame);
            this.publicationFrames.sort((a, b) => a.index - b.index);

            // Sélectionner automatiquement le nouveau jour, surtout si c'est le publication A
            this.setCurrentPublicationFrame(newPublicationFrame);
            this.recalculateNextPublicationIndex();
            this.updateStatsLabel();
            this.saveAppState();
            if (this.calendarPage) {
                const newJourContext = {
                    _id: newJourData._id,
                    letter: newJourData.letter,
                    galleryId: newJourData.galleryId.toString(),
                    galleryName: this.getCurrentGalleryName()
                };
                this.scheduleContext.allUserPublications.push(newJourContext);
                if (document.getElementById('calendar').classList.contains('active')) {
                    this.calendarPage.buildCalendarUI();
                }
            }
            this.refreshSidePanels();

            // Rafraîchir la sélection des publications dans l'AutoCropper
            if (this.croppingPage && this.croppingPage.autoCropper) {
                this.croppingPage.autoCropper.refreshJourSelection();
            }
        } catch (error) {
            console.error("Error adding JourFrame:", error);
            alert(error.message);
        } finally {
            this.addPublicationFrameBtn.disabled = false;
        }
    }

    setCurrentPublicationFrame(publicationFrame) {
        if (this.currentPublicationFrame) {
            this.currentPublicationFrame.element.classList.remove('current');
        }
        this.currentPublicationFrame = publicationFrame;
        if (this.currentPublicationFrame) {
            this.currentPublicationFrame.element.classList.add('current');
        }
    }

    async closePublicationFrame(publicationFrameToClose) {
        if (!confirm(`Voulez-vous vraiment supprimer le Publication ${publicationFrameToClose.letter} ?`)) return;
        const index = this.publicationFrames.indexOf(publicationFrameToClose);
        if (index > -1) {
            await publicationFrameToClose.destroy();
            this.publicationFrames.splice(index, 1);
            if (this.currentPublicationFrame === publicationFrameToClose) {
                this.setCurrentPublicationFrame(this.publicationFrames[index] || this.publicationFrames[index - 1] || (this.publicationFrames.length > 0 ? this.publicationFrames[0] : null));
            }
            this.recalculateNextPublicationIndex();
            this.updateGridUsage();
            this.updateStatsLabel();
            this.saveAppState();
            if (this.calendarPage) {
                const datesToRemove = [];
                for (const dateStr in this.scheduleContext.schedule) {
                    if (this.scheduleContext.schedule[dateStr][publicationFrameToClose.letter] && this.scheduleContext.schedule[dateStr][publicationFrameToClose.letter].galleryId === publicationFrameToClose.galleryId) {
                        datesToRemove.push(new Date(dateStr + 'T00:00:00'));
                    }
                }
                datesToRemove.forEach(dateObj => {
                    this.calendarPage.removePublicationForDate(dateObj, publicationFrameToClose.letter);
                });
            }
            this.refreshSidePanels();

            // Rafraîchir la sélection des publications dans l'AutoCropper
            if (this.croppingPage && this.croppingPage.autoCropper) {
                this.croppingPage.autoCropper.refreshJourSelection();
            }
        }
    }

    // Nouvelle fonction pour supprimer automatiquement les publications vides
    async removeEmptyPublications() {
        // CORRECTION : On cible pour suppression uniquement les publications vides QUI NE SONT PAS la publication 'A'.
        // La publication A, même vide, est conservée comme point d'ancrage.
        const publicationsToDelete = this.publicationFrames.filter(publicationFrame =>
            (publicationFrame.index !== 0) && // Ne pas toucher à l'index 0 (Publication A)
            (!publicationFrame.imagesData || publicationFrame.imagesData.length === 0)
        );

        // Si la seule publication restante est la 'A' et qu'elle est vide, on ne fait rien.
        if (publicationsToDelete.length === 0) {
            return;
        }

        console.log(`[removeEmptyPublications] Suppression automatique de ${publicationsToDelete.length} publication(s) vide(s):`,
            publicationsToDelete.map(j => j.letter).join(', '));

        // Le reste de la logique de suppression continue, mais uniquement sur la liste filtrée.
        for (const publicationFrame of publicationsToDelete) {
            const index = this.publicationFrames.indexOf(publicationFrame);
            if (index > -1) {
                await publicationFrame.destroy();
                this.publicationFrames.splice(index, 1);

                if (this.currentPublicationFrame === publicationFrame) {
                    // Si on supprime la publication active, on se replace sur la 'A' par défaut.
                    const publicationA = this.publicationFrames.find(p => p.index === 0);
                    this.setCurrentPublicationFrame(publicationA || (this.publicationFrames.length > 0 ? this.publicationFrames[0] : null));
                }

                // Nettoyer le calendrier si nécessaire
                if (this.calendarPage) {
                    const datesToRemove = [];
                    for (const dateStr in this.scheduleContext.schedule) {
                        if (this.scheduleContext.schedule[dateStr][publicationFrame.letter] &&
                            this.scheduleContext.schedule[dateStr][publicationFrame.letter].galleryId === publicationFrame.galleryId) {
                            datesToRemove.push(new Date(dateStr + 'T00:00:00'));
                        }
                    }
                    datesToRemove.forEach(dateObj => {
                        this.calendarPage.removePublicationForDate(dateObj, publicationFrame.letter);
                    });
                }
            }
        }

        // Mise à jour de l'interface après suppression
        if (publicationsToDelete.length > 0) {
            this.recalculateNextPublicationIndex();
            this.updateGridUsage();
            this.updateStatsLabel();
            this.saveAppState();
            this.refreshSidePanels();

            // Rafraîchir la sélection des publications dans l'AutoCropper
            if (this.croppingPage && this.croppingPage.autoCropper) {
                this.croppingPage.autoCropper.refreshJourSelection();
            }
        }
    }

    recalculateNextPublicationIndex() {
        if (this.publicationFrames.length === 0) { this.nextPublicationIndex = 0; return; }
        const existingIndices = new Set(this.publicationFrames.map(jf => jf.index));
        let smallestAvailable = 0;
        while (existingIndices.has(smallestAvailable) && smallestAvailable < 26) {
            smallestAvailable++;
        }
        this.nextPublicationIndex = smallestAvailable;
    }

    ensureJourInAllUserPublications(publicationFrame) {
        const jourKey = `${publicationFrame.galleryId}-${publicationFrame.letter}`;
        const existingPublication = this.scheduleContext.allUserPublications.find(j =>
            j.galleryId === publicationFrame.galleryId && j.letter === publicationFrame.letter
        );

        if (!existingPublication) {
            console.log(`➕ Ajout du publication ${publicationFrame.letter} à allUserPublications`);
            const newJourContext = {
                _id: publicationFrame.id,
                letter: publicationFrame.letter,
                galleryId: publicationFrame.galleryId.toString(),
                galleryName: this.getCurrentGalleryName()
            };
            this.scheduleContext.allUserPublications.push(newJourContext);
        } else {
            console.log(`✅ Publication ${publicationFrame.letter} déjà dans allUserPublications`);
        }
    }

    addOrUpdateJourInCalendar(publicationFrame) {
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

    isPublicationReadyForPublishing(galleryId, letter) {
        return true;
    }

    async saveAppState() {
        if (!this.currentGalleryId) return;
        const appState = {
            currentThumbSize: this.currentThumbSize,
            sortOption: this.sortOptionsSelect.value,
            activeTab: document.querySelector('.tab-button.active')?.dataset.tab || 'galleries',
            nextJourIndex: this.nextPublicationIndex
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
        for (const publication of this.publicationFrames) {
            const foundInData = publication.imagesData.find(img => img.imageId === imageId);
            if (foundInData) {
                if (returnFullObject) {
                    return this.gridItemsDict[imageId] || {
                        _id: foundInData.imageId,
                        galleryId: publication.galleryId,
                        path: Utils.getFilenameFromURL(foundInData.dataURL).replace('thumb-', ''),
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
    
    // ▼▼▼ TRADUIRE L'UI AU DÉMARRAGE ▼▼▼
    await i18n.translateUI();
    
    try {
        if (!app) {
            app = new PublicationOrganizer();
            window.pubApp = app;
            // Initialiser les modules maintenant que app est défini
            app.initializeModules();
        }
        let galleryIdToLoad = localStorage.getItem('publicationOrganizer_lastGalleryId');
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
    
    // ▼▼▼ AJOUT DE LA LOGIQUE POUR LE MENU PARAMÈTRES ▼▼▼
    const settingsButton = document.getElementById('settingsButton');
    const settingsDropdown = document.getElementById('settingsDropdown');
    const switchLangBtn = document.getElementById('switchLangBtn');
    const clearCacheBtn = document.getElementById('clearCacheBtn');
    const aboutBtn = document.getElementById('aboutBtn');
    
    if (profileButton && profileDropdown) {
        profileButton.addEventListener('click', (event) => {
            event.stopPropagation();
            // Ferme l'autre menu s'il est ouvert
            settingsDropdown?.classList.remove('show');
            profileDropdown.classList.toggle('show');
        });
    }
    
    if (settingsButton && settingsDropdown) {
        settingsButton.addEventListener('click', (event) => {
            event.stopPropagation();
            // Ferme l'autre menu s'il est ouvert
            profileDropdown?.classList.remove('show');
            settingsDropdown.classList.toggle('show');
        });
    }
    
    if (switchLangBtn) {
        switchLangBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const newLang = i18n.currentLang === 'fr' ? 'en' : 'fr';
            i18n.setLanguage(newLang).then(() => {
                // Mettre à jour le texte du bouton après le changement de langue
                switchLangBtn.textContent = i18n.t('settings.switchTo');
            });
            settingsDropdown.classList.remove('show');
        });
    }
    
    if (clearCacheBtn) {
        clearCacheBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (confirm(i18n.t('messages.confirmClearCache'))) {
                localStorage.clear();
                // Le "true" force un rechargement depuis le serveur, ignorant le cache du navigateur
                window.location.reload(true);
            }
        });
    }
    
    if (aboutBtn) {
        aboutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            alert(i18n.t('messages.aboutText'));
            settingsDropdown.classList.remove('show');
        });
    }
    
    if (logoutLink) {
        logoutLink.addEventListener('click', (event) => {
            event.preventDefault();
            logout();
        });
    }
    
    // Fermer les menus si on clique ailleurs
    window.addEventListener('click', (event) => {
        if (!event.target.closest('.profile-container')) {
            profileDropdown?.classList.remove('show');
        }
        if (!event.target.closest('.settings-container')) {
            settingsDropdown?.classList.remove('show');
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

// HashtagManager class
class HashtagManager {
    constructor(descriptionManager) {
        this.descriptionManager = descriptionManager;
        this.modal = document.getElementById('hashtagModal');
        this.container = document.getElementById('hashtagContainer');
        this.insertBtn = document.getElementById('insertHashtagsBtn');
        this.cancelBtn = document.getElementById('cancelHashtagsBtn');
        this.thesaurus = null; // Le dictionnaire sera chargé ici

        this._initListeners();
        this._loadThesaurus(); // Charger le dictionnaire au démarrage
    }

    async _loadThesaurus() {
        try {
            const response = await fetch('/lib/hashtag-thesaurus.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            this.thesaurus = await response.json();
            console.log('📚 Dictionnaire de hashtags chargé.');
        } catch (error) {
            console.warn('Impossible de charger le dictionnaire de hashtags:', error.message);
            // Fallback silencieux - pas d'erreur critique
            this.thesaurus = {}; 
        }
    }

    _initListeners() {
        this.insertBtn.addEventListener('click', () => this._insertSelectedHashtags());
        this.cancelBtn.addEventListener('click', () => this.hide());
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.hide();
        });
        this.container.addEventListener('click', (e) => {
            if (e.target.classList.contains('hashtag-pill')) {
                e.target.classList.toggle('selected');
            }
        });
    }

    async generateAndShow(text) {
        if (!this.thesaurus) await this._loadThesaurus();

        // Garde de sécurité pour la librairie NLP
        if (!window.nlp || typeof window.nlp.generateHashtags !== 'function') {
            console.warn("La librairie NLP n'est pas encore prête. Annulation de la génération de hashtags.");
            this.renderHashtags([]); // Affiche un message "aucune suggestion"
            this.show();
            return;
        }

        // 1. Extraire les mots-clés du texte avec la lib NLP
        const keywordsFromNLP = window.nlp.generateHashtags(text);

        const suggestedHashtags = new Map();
        const normalizedText = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        // 2. Enrichir avec le thésaurus en cherchant les mots-clés du thésaurus dans le texte
        for (const [key, value] of Object.entries(this.thesaurus)) {
            if (normalizedText.includes(key)) {
                value.h.forEach(tag => suggestedHashtags.set(tag, value.p));
            }
        }

        // 3. Ajouter les mots-clés extraits par NLP (avec une priorité plus basse)
        keywordsFromNLP.forEach(keyword => {
            const lowerKeyword = keyword.toLowerCase();
            if (!suggestedHashtags.has(lowerKeyword)) {
                suggestedHashtags.set(lowerKeyword, 10);
            }
        });
                
        // 4. Ajouter des hashtags de base
        suggestedHashtags.set('photographe', 5);
        suggestedHashtags.set('photography', 5);

        // 5. Trier par priorité et rendre l'affichage
        const sorted = [...suggestedHashtags.entries()].sort((a, b) => b[1] - a[1]);
        const existingHashtags = (text.match(/#[\w\u00C0-\u017F]+/g) || []).map(h => h.substring(1).toLowerCase());
                
        const finalSuggestions = sorted
            .map(entry => entry[0])
            .filter(tag => !existingHashtags.includes(tag));

        this.renderHashtags(finalSuggestions);
        this.show();
    }

    renderHashtags(hashtags) {
        this.container.innerHTML = '';
        if (hashtags.length === 0) {
            this.container.innerHTML = '<p>Aucune nouvelle suggestion de hashtag trouvée.</p>';
            return;
        }
        hashtags.forEach(tag => {
            const pill = document.createElement('span');
            pill.className = 'hashtag-pill selected';
            pill.textContent = `#${tag}`;
            pill.dataset.tag = tag;
            this.container.appendChild(pill);
        });
    }

    _insertSelectedHashtags() {
        const selectedPills = this.container.querySelectorAll('.hashtag-pill.selected');
        if (selectedPills.length > 0) {
            const hashtagString = Array.from(selectedPills).map(pill => pill.textContent).join(' ');
            this.descriptionManager._insertSnippet('\n\n' + hashtagString);
        }
        this.hide();
    }

    show() {
        this.modal.style.display = 'flex';
        setTimeout(() => this.modal.classList.add('visible'), 10);
    }

    hide() {
        this.modal.classList.remove('visible');
        setTimeout(() => this.modal.style.display = 'none', 200);
    }
}
// ========================================================
// CLASSE POUR LA GESTION DE L'ONGLET RECADRAGE INTERACTIF
// ========================================================

class CroppingPage {
    constructor(organizerApp) {
        this.organizerApp = organizerApp;
        this.allPhotosGroupedViewContainer = document.getElementById('allPhotosGroupedViewContainer');
        
        // Initialisation des événements pour les boutons de vue
        this.initViewModeButtons();
    }
    
    initViewModeButtons() {
        const groupedViewBtn = document.getElementById('switchToGroupedViewBtn');
        const editorViewBtn = document.getElementById('switchToEditorViewBtn');
        
        if (groupedViewBtn) {
            groupedViewBtn.addEventListener('click', () => {
                this.switchToGroupedView();
            });
        }
        
        if (editorViewBtn) {
            editorViewBtn.addEventListener('click', () => {
                this.switchToEditorView();
            });
        }
    }
    
    switchToGroupedView() {
        // Mise à jour des boutons
        document.getElementById('switchToGroupedViewBtn').classList.add('active');
        document.getElementById('switchToEditorViewBtn').classList.remove('active');
        
        // Affichage des conteneurs
        this.allPhotosGroupedViewContainer.style.display = 'block';
        document.getElementById('croppingEditorPanel').style.display = 'none';
        document.getElementById('croppingEditorPlaceholder').style.display = 'none';
        
        // Rendu de la vue groupée interactive
        this.renderAllPhotosGroupedView();
    }
    
    switchToEditorView() {
        // Mise à jour des boutons
        document.getElementById('switchToGroupedViewBtn').classList.remove('active');
        document.getElementById('switchToEditorViewBtn').classList.add('active');
        
        // Affichage des conteneurs
        this.allPhotosGroupedViewContainer.style.display = 'none';
        document.getElementById('croppingEditorPanel').style.display = 'block';
        document.getElementById('croppingEditorPlaceholder').style.display = 'block';
    }

    show() {
        // Refresh the cropping page view when shown
        this.renderAllPhotosGroupedView();
    }

    renderAllPhotosGroupedView() {
        const container = this.allPhotosGroupedViewContainer;
        container.innerHTML = '';
        const app = this.organizerApp;

        if (!app.publicationFrames || app.publicationFrames.length === 0) {
            container.innerHTML = '<p class="sidebar-info" style="text-align: center; padding: 20px;">Créez des publications dans l\'onglet "Tri" pour les voir ici.</p>';
            return;
        }

        app.publicationFrames.forEach(publicationFrame => {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'publication-group-container';

            const header = document.createElement('h4');
            header.className = 'publication-group-header';
            header.textContent = `Publication ${publicationFrame.letter}`;
            groupDiv.appendChild(header);

            const ribbonDiv = document.createElement('div');
            ribbonDiv.className = 'cropping-publication-ribbon';
            ribbonDiv.dataset.publicationId = publicationFrame.id;

            // **Logique de Dépôt (Drop) Indépendante**
            ribbonDiv.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                ribbonDiv.classList.add('drag-over');
                // On appelle la méthode générique en lui passant le bon conteneur (ribbonDiv)
                const afterElement = publicationFrame.getDragAfterElement(ribbonDiv, e.clientX);
                const placeholder = publicationFrame.placeholderElement;
                    
                // On ajoute le style spécifique au placeholder pour cet onglet
                placeholder.style.width = '120px';
                placeholder.style.height = '120px';
                    
                if (afterElement == null) {
                    ribbonDiv.appendChild(placeholder);
                } else {
                    ribbonDiv.insertBefore(placeholder, afterElement);
                }
            });
            ribbonDiv.addEventListener('dragleave', (e) => publicationFrame.onDragLeave(e));
            ribbonDiv.addEventListener('drop', (e) => {
                publicationFrame.onDrop(e);
                // Plus besoin de setTimeout car refreshPublicationViews gère tout
            });

            if (publicationFrame.imagesData.length === 0) {
                ribbonDiv.innerHTML = '<p class="publication-group-empty-text">Cette publication est vide.</p>';
            } else {
                publicationFrame.imagesData.forEach(imgData => {
                    // **Création d'un élément DOM SÉPARÉ et plus grand**
                    const itemElement = document.createElement('div');
                    itemElement.className = 'cropping-publication-item'; // Classe CSS spécifique pour le recadrage
                    itemElement.style.backgroundImage = `url(${imgData.dataURL})`;
                    itemElement.draggable = true;
                    itemElement.dataset.imageId = imgData.imageId;

                    // **Logique de Glisser (Drag) Indépendante**
                    itemElement.addEventListener('dragstart', (e) => {
                        e.target.classList.add('dragging-publication-item');
                        e.dataTransfer.setData("application/json", JSON.stringify({
                            sourceType: 'publication',
                            sourcePublicationId: publicationFrame.id,
                            imageId: imgData.imageId,
                        }));
                        e.dataTransfer.effectAllowed = "move";
                    });

                    itemElement.addEventListener('dragend', (e) => {
                        e.target.classList.remove('dragging-publication-item');
                        // La synchronisation se fait maintenant via le `drop` sur le ruban de destination
                    });

                    // **Bouton de suppression avec rafraîchissement local**
                    const deleteBtn = document.createElement('span');
                    deleteBtn.className = 'delete-btn';
                    deleteBtn.innerHTML = '×';
                    deleteBtn.onclick = (e) => {
                        e.stopPropagation();
                        publicationFrame.removeImageById(imgData.imageId);
                        this.renderAllPhotosGroupedView(); // Rafraîchit cette vue
                    };
                    itemElement.appendChild(deleteBtn);

                    ribbonDiv.appendChild(itemElement);
                });
            }
                    
            groupDiv.appendChild(ribbonDiv);
            container.appendChild(groupDiv);
        });
    }
}