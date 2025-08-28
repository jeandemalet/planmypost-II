// ===============================
// Fichier: middleware/cache.js
// Middleware de mise en cache pour optimiser les performances
// ===============================

const NodeCache = require('node-cache');

// Configuration du cache avec TTL (Time To Live) par défaut de 10 minutes
const cache = new NodeCache({
    stdTTL: 600, // 10 minutes par défaut
    checkperiod: 120, // Vérification toutes les 2 minutes pour nettoyer les clés expirées
    useClones: false // Performance - évite de cloner les objets
});

// Middleware de cache pour les réponses GET
const cacheMiddleware = (ttl = 600) => {
    return (req, res, next) => {
        // Seulement pour les requêtes GET
        if (req.method !== 'GET') {
            return next();
        }

        // Créer une clé de cache basée sur l'URL et l'utilisateur
        const cacheKey = `${req.userData ? req.userData.userId : 'anonymous'}:${req.originalUrl}`;
        
        // Essayer de récupérer depuis le cache
        const cachedResponse = cache.get(cacheKey);
        
        if (cachedResponse) {
            console.log(`📦 [Cache] HIT for ${cacheKey}`);
            return res.json(cachedResponse);
        }

        // Intercepter la méthode res.json pour sauvegarder la réponse
        const originalJson = res.json;
        res.json = function(data) {
            // Sauvegarder dans le cache seulement si c'est un succès
            if (res.statusCode >= 200 && res.statusCode < 300) {
                cache.set(cacheKey, data, ttl);
                console.log(`💾 [Cache] SET for ${cacheKey} (TTL: ${ttl}s)`);
            }
            
            // Appeler la méthode json originale
            return originalJson.call(this, data);
        };

        next();
    };
};

// Cache spécialisé pour les galeries (TTL plus long car moins de changements)
const galleryCacheMiddleware = cacheMiddleware(1800); // 30 minutes

// Cache pour les images (TTL moyen)
const imageCacheMiddleware = cacheMiddleware(900); // 15 minutes

// Cache pour les publications (TTL court car souvent modifiées)
const publicationCacheMiddleware = cacheMiddleware(300); // 5 minutes

// Cache pour les calendriers (TTL moyen)
const scheduleCacheMiddleware = cacheMiddleware(600); // 10 minutes

// Fonction pour invalider le cache
const invalidateCache = {
    // Invalider toutes les entrées d'une galerie
    gallery(galleryId, userId = null) {
        const patterns = [
            `${userId || '*'}:/api/galleries/${galleryId}*`,
            `${userId || '*'}:/api/galleries`
        ];
        
        patterns.forEach(pattern => {
            const keys = cache.keys().filter(key => 
                key.includes(`/api/galleries/${galleryId}`) || 
                key.includes('/api/galleries')
            );
            keys.forEach(key => {
                cache.del(key);
                console.log(`🗑️ [Cache] INVALIDATED ${key}`);
            });
        });
    },

    // Invalider les entrées d'images
    images(galleryId, userId = null) {
        const keys = cache.keys().filter(key => 
            key.includes(`/api/galleries/${galleryId}/images`)
        );
        keys.forEach(key => {
            cache.del(key);
            console.log(`🗑️ [Cache] INVALIDATED ${key}`);
        });
    },

    // Invalider les entrées de publications
    publications(galleryId, userId = null) {
        const keys = cache.keys().filter(key => 
            key.includes(`/api/galleries/${galleryId}/publications`)
        );
        keys.forEach(key => {
            cache.del(key);
            console.log(`🗑️ [Cache] INVALIDATED ${key}`);
        });
    },

    // Invalider les entrées de calendrier
    schedule(galleryId, userId = null) {
        const keys = cache.keys().filter(key => 
            key.includes(`/api/galleries/${galleryId}/schedule`)
        );
        keys.forEach(key => {
            cache.del(key);
            console.log(`🗑️ [Cache] INVALIDATED ${key}`);
        });
    },

    // Invalider toutes les entrées d'un utilisateur
    user(userId) {
        const keys = cache.keys().filter(key => key.startsWith(`${userId}:`));
        keys.forEach(key => {
            cache.del(key);
            console.log(`🗑️ [Cache] INVALIDATED ${key}`);
        });
    },

    // Vider tout le cache
    all() {
        cache.flushAll();
        console.log('🗑️ [Cache] ALL CACHE CLEARED');
    }
};

// Middleware pour invalider le cache après les opérations de modification
const cacheInvalidationMiddleware = (req, res, next) => {
    // Intercepter la méthode res.json pour invalider après succès
    const originalJson = res.json;
    res.json = function(data) {
        // Invalider seulement si c'est un succès et une opération de modification
        if (res.statusCode >= 200 && res.statusCode < 300 && 
            ['POST', 'PUT', 'DELETE'].includes(req.method)) {
            
            const { galleryId } = req.params;
            const userId = req.userData ? req.userData.userId : null;
            
            if (galleryId) {
                // Invalider en fonction du type d'opération
                if (req.path.includes('/images')) {
                    invalidateCache.images(galleryId, userId);
                } else if (req.path.includes('/publications')) {
                    invalidateCache.publications(galleryId, userId);
                } else if (req.path.includes('/schedule')) {
                    invalidateCache.schedule(galleryId, userId);
                } else {
                    invalidateCache.gallery(galleryId, userId);
                }
            }
        }
        
        return originalJson.call(this, data);
    };

    next();
};

// Statistiques du cache
const getCacheStats = () => {
    return {
        keys: cache.keys().length,
        hits: cache.getStats().hits,
        misses: cache.getStats().misses,
        ksize: cache.getStats().ksize,
        vsize: cache.getStats().vsize
    };
};

module.exports = {
    cache,
    cacheMiddleware,
    galleryCacheMiddleware,
    imageCacheMiddleware,
    publicationCacheMiddleware,
    scheduleCacheMiddleware,
    cacheInvalidationMiddleware,
    invalidateCache,
    getCacheStats
};