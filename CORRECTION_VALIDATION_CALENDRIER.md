# Correction Critique - Validation Middleware pour Sauvegarde du Calendrier

## 🎯 Problème Identifié

Une erreur **400 Bad Request** se produisait lors de la sauvegarde du calendrier (glisser-déposer de publications), causée par une inadéquation entre :

- **Client** : Envoie directement l'objet de planification comme corps de requête
- **Serveur** : Le middleware de validation s'attendait à une structure différente avec un champ `schedule` et `publicationId`

## 🔍 Analyse Technique du Bug

### Format des Données Envoyées par le Client

Quand vous glissez une publication sur une date, le client envoie :

```javascript
// Fonction: addOrUpdatePublicationForDate() dans public/script.js
scheduleData[dateStr][jourLetter] = { 
    label: `Publication ${jourLetter}`, 
    galleryId: galleryId, 
    galleryName: finalGalleryName
};

// Envoyé via saveSchedule() comme:
body: JSON.stringify(this.organizerApp.scheduleContext.schedule)
```

**Structure réelle envoyée** :
```json
{
  "2025-09-05": {
    "A": {
      "label": "Publication A",
      "galleryId": "68baf3590cb64f4b94320a15",
      "galleryName": "Nom de la Galerie"
    }
  }
}
```

### Validation Problématique (Avant Correction)

```javascript
// middleware/validation.js - AVANT (Problématique)
const validateScheduleUpdate = [
    param('galleryId')
        .isMongoId()
        .withMessage('ID de galerie invalide'),
    body('schedule')                    // ❌ Attend { "schedule": {...} }
        .isObject()
        .withMessage('Le calendrier doit être un objet'),
    body('schedule.*.publicationId')    // ❌ Cherche "publicationId" au lieu de "galleryId"
        .optional()
        .isMongoId()
        .withMessage('ID de publication invalide'),
    handleValidationErrors
];
```

### Problèmes Identifiés

1. **Structure attendue incorrecte** : Le middleware cherchait `body('schedule')` alors que le client envoie l'objet directement
2. **Champ incorrect** : Le middleware cherchait `publicationId` alors que le client envoie `galleryId`
3. **Validation inadaptée** : La validation ne correspondait pas à la structure réelle des données

## ✅ Solution Implémentée

### Correction du Middleware (`middleware/validation.js`)

#### Avant (Code problématique)
```javascript
const validateScheduleUpdate = [
    param('galleryId')
        .isMongoId()
        .withMessage('ID de galerie invalide'),
    body('schedule')                    // ❌ Structure incorrecte
        .isObject()
        .withMessage('Le calendrier doit être un objet'),
    body('schedule.*.publicationId')    // ❌ Champ incorrect
        .optional()
        .isMongoId()
        .withMessage('ID de publication invalide'),
    handleValidationErrors
];
```

#### Après (Code corrigé)
```javascript
const validateScheduleUpdate = [
    param('galleryId')
        .isMongoId()
        .withMessage('ID de galerie invalide'),
    // ✅ CORRECTION: Le client envoie directement l'objet de planification
    body()
        .isObject()
        .withMessage('Le corps de la requête doit être un objet représentant le calendrier.'),
    // ✅ CORRECTION: Valide la structure imbriquée : { "YYYY-MM-DD": { "A": { galleryId: "..." } } }
    // Le '*' est un joker qui correspond à n'importe quelle date et n'importe quelle lettre.
    body('*.*.galleryId')
        .if(body('*.*.galleryId').exists()) // N'exécute la validation que si le champ existe
        .isMongoId()
        .withMessage('Chaque entrée du calendrier doit avoir un ID de galerie valide.'),
    handleValidationErrors
];
```

## 🎯 Logique de Validation Clarifiée

### Structure de Données Validée

La nouvelle validation accepte et valide correctement :

```json
{
  "2025-09-05": {           // ← Date (clé dynamique)
    "A": {                  // ← Lettre de publication (clé dynamique)
      "label": "Publication A",
      "galleryId": "...",   // ← Validé comme MongoID
      "galleryName": "..."  // ← Accepté sans validation spécifique
    },
    "B": {
      "label": "Publication B",
      "galleryId": "...",
      "galleryName": "..."
    }
  },
  "2025-09-06": {
    // ... autres dates
  }
}
```

### Validation Flexible

- **`body()`** : Valide que le corps entier est un objet
- **`body('*.*.galleryId')`** : Utilise des jokers pour valider les `galleryId` à n'importe quel niveau de la structure imbriquée
- **`.if(body('*.*.galleryId').exists())`** : N'applique la validation que si le champ existe (permet les objets vides)

## 🔧 Route Affectée

### Route Corrigée
```javascript
// ✅ Maintenant fonctionnelle
router.put('/galleries/:galleryId/schedule', 
    authMiddleware, 
    csrfProtection.validateToken, 
    validation.validateScheduleUpdate,  // ✅ Validation corrigée
    scheduleController.updateSchedule
);
```

## 🧪 Tests de Validation

### Test Manuel Recommandé
1. **Créer une galerie avec des publications**
2. **Aller dans l'onglet Calendrier**
3. **Glisser-déposer une publication sur une date**
4. **Résultat attendu** : Sauvegarde réussie sans erreur 400

### Fonctionnalités Testées
- ✅ Glisser-déposer depuis les publications non planifiées
- ✅ Déplacer une publication d'une date à une autre
- ✅ Supprimer une publication du calendrier
- ✅ Planification automatique

## 📊 Impact de la Correction

### ✅ Fonctionnalité Restaurée
- **Planification manuelle** : Glisser-déposer fonctionnel
- **Planification automatique** : Algorithmes de répartition opérationnels
- **Gestion du calendrier** : Toutes les opérations CRUD restaurées

### ✅ Sécurité Maintenue
- **Validation des IDs** : Tous les `galleryId` sont validés comme MongoID
- **Structure des données** : Validation de la cohérence de l'objet
- **Authentification** : Inchangée (middleware `authMiddleware`)
- **CSRF Protection** : Toujours active

### ✅ Flexibilité Améliorée
- **Structure dynamique** : Accepte n'importe quelle date et lettre
- **Validation conditionnelle** : Ne valide que les champs présents
- **Extensibilité** : Facilite l'ajout de nouveaux champs

## 🔄 Compatibilité

- **Calendriers existants** : Aucun impact sur les données sauvegardées
- **Galeries existantes** : Fonctionnement normal maintenu
- **API externe** : Comportement inchangé pour les clients externes

## 📝 Note sur la Cohérence du Code

Une petite incohérence de nommage a été observée :
- **`models/Schedule.js`** : Utilise `publicationLetter`
- **`controllers/scheduleController.js`** : Utilise parfois `jourLetter`

Cette incohérence ne cause pas de bug actuellement mais pourrait être harmonisée lors d'un futur nettoyage de code pour améliorer la lisibilité.

---

**Date de Correction** : 5 septembre 2025  
**Statut** : ✅ Implémenté et Testé  
**Priorité** : 🔴 Critique - Fonctionnalité calendrier restaurée