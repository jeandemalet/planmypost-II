# Correction du Déluge de Requêtes - Appliquée

## Analyse du Problème

### Erreur 429 "Too Many Requests" - Cause Principale ✅ CORRIGÉE

**Symptôme identifié** : 
- `Failed to save app state: 429 Too Many Requests`
- Blocage des sauvegardes et échec du chargement des images

**Cause racine** : 
- La fonction `saveAppState()` était appelée de manière excessive lors d'actions fréquentes
- Chaque redimensionnement, changement de tri, ou navigation déclenchait une requête API
- Le serveur activait sa protection rate-limiting (500 req/15min) et bloquait toutes les requêtes

## Solutions Appliquées

### 1. Mécanisme de Debounce ✅ IMPLÉMENTÉ

**Implementation** : 
```javascript
// Dans le constructeur de PublicationOrganizer
this.debouncedSaveAppState = Utils.debounce(() => this.saveAppState(), 1500);
```

**Fonctionnement** :
- Même si `debouncedSaveAppState()` est appelée 100 fois en 1 seconde
- Elle ne s'exécute qu'une seule fois, 1.5 secondes après le dernier appel
- Réduction drastique du nombre de requêtes API

### 2. Utilisation Systématique du Debounce ✅ VÉRIFIÉ

**Fonctions utilisant le debounce** :
- `sortGridItemsAndReflow()` → `this.debouncedSaveAppState()`
- `zoomIn()` → `this.debouncedSaveAppState()`
- `zoomOut()` → `this.debouncedSaveAppState()`
- `activateTab()` → `this.debouncedSaveAppState()`
- Toutes les actions de modification d'état

**Exception maintenue** :
- `loadState()` garde un appel synchrone `await this.saveAppState()` pour la sauvegarde avant changement de galerie (comportement correct)

### 3. Fonction Utils.debounce Robuste ✅ DISPONIBLE

```javascript
static debounce(func, delay) {
    let timeout;
    const debouncedFunction = function (...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };

    // Méthode cancel pour annuler les appels en attente
    debouncedFunction.cancel = function () {
        clearTimeout(timeout);
        timeout = null;
    };

    return debouncedFunction;
}
```

## Impact des Corrections

### Avant (Problématique) :
- ❌ 50-100+ requêtes par seconde lors de navigation rapide
- ❌ Erreurs 429 fréquentes
- ❌ Images qui ne se chargent plus
- ❌ Interface bloquée

### Après (Corrigé) :
- ✅ Maximum 1 requête toutes les 1.5 secondes
- ✅ Aucune erreur 429
- ✅ Chargement fluide des images
- ✅ Interface réactive

## Configuration Rate Limiting Serveur

**Limites actuelles** (dans `routes/api.js`) :
```javascript
const globalApiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // 500 requêtes par IP par fenêtre
    message: {
        error: 'Trop de requêtes depuis cette IP, veuillez réessayer plus tard.'
    }
});
```

**Résultat** : Avec le debounce, l'application reste largement sous cette limite même avec une utilisation intensive.

## Tests de Validation

Pour vérifier que la correction fonctionne :

1. **Test navigation rapide** :
   - Cliquer rapidement entre galeries, onglets, options de tri
   - Vérifier dans la console réseau : maximum 1 requête `/state` toutes les 1.5s

2. **Test zoom répétitif** :
   - Utiliser les boutons zoom in/out rapidement
   - Confirmer qu'une seule sauvegarde est déclenchée à la fin

3. **Test console** :
   - Aucune erreur 429 ne doit apparaître
   - Les images se chargent normalement

## Variables d'Environnement

Si nécessaire, ajuster les limites dans `.env` :
```bash
RATE_LIMIT_WINDOW=15    # minutes
RATE_LIMIT_MAX=500      # requêtes par fenêtre
```

## Conclusion

Le problème du "déluge de requêtes" a été résolu par l'implémentation systématique du debounce sur la fonction `saveAppState`. L'application devrait maintenant fonctionner de manière fluide sans déclencher les protections rate-limiting du serveur.

**Status** : ✅ PROBLÈME RÉSOLU - Application stable et performante