# Option Alternative : Augmenter la Limite de Pagination

## 🎯 Compromis : Plus d'Images au Départ

Si vous préférez garder la pagination mais voir plus d'images dès le départ, vous pouvez simplement augmenter la limite par défaut.

### Modification Simple

Dans `controllers/galleryController.js`, ligne ~157, changez :

```javascript
// AVANT
const limitNum = Math.min(parseInt(limit, 10) || 50, 100); // Max 100 items per page

// APRÈS (Exemple avec 200 images par défaut)
const limitNum = Math.min(parseInt(limit, 10) || 200, 500); // Max 500 items per page
```

### Dans `public/script.js`, ligne ~4714, changez :

```javascript
// AVANT
const response = await fetch(`${BASE_API_URL}/api/galleries/${this.currentGalleryId}/images?page=${this.currentGridPage}&limit=50`);

// APRÈS
const response = await fetch(`${BASE_API_URL}/api/galleries/${this.currentGalleryId}/images?page=${this.currentGridPage}&limit=200`);
```

## 🎯 Résultat

- **Démarrage** : 200 images affichées au lieu de 50
- **Scroll** : Charge 200 images supplémentaires à chaque fois
- **Performance** : Maintient la pagination pour les très grosses galeries