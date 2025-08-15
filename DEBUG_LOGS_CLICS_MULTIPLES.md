# Logs de Débogage - Problème des Clics Multiples

## Hypothèse à Vérifier

Le problème des galeries commençant par "D" pourrait être causé par des **clics multiples rapides** qui créent plusieurs publications en succession (A, B, C, D), mais où seule la dernière (D) est affichée à l'écran.

## Logs Ajoutés

### 1. Côté Serveur (`controllers/publicationController.js`)

```javascript
// Dans createPublication()
console.log(`[DEBUG] createPublication: Galerie ${galleryId}. Publications existantes trouvées:`, existingPublications.map(p => p.letter).join(', ') || 'Aucune');
console.log(`[DEBUG] createPublication: Prochain index disponible calculé: ${nextAvailableIndex}`);
console.log(`[DEBUG] createPublication: Création de la Publication avec la lettre: ${letter}`);
```

### 2. Côté Client (`public/script.js`)

```javascript
// Dans loadState()
console.log('[DEBUG] loadState: Publications finales à afficher:', finalPublicationsData.map(p => ({ letter: p.letter, index: p.index })));

// Dans addPublicationFrame()
console.log('[DEBUG] addPublicationFrame: DÉBUT - Publications actuelles:', this.publicationFrames.map(p => ({ letter: p.letter, index: p.index })));
console.log('[DEBUG] addPublicationFrame: Réponse du serveur, publication créée:', { letter: newJourData.letter, index: newJourData.index });
```

## Comment Reproduire et Analyser

### 1. Reproduire le Bug
- Créer une nouvelle galerie
- Observer si elle commence par "D" au lieu de "A"

### 2. Analyser les Logs

**Scénario attendu si l'hypothèse est correcte :**

**Console Navigateur (loadState) :**
```
[DEBUG] loadState: Publications finales à afficher: [{ letter: 'A', index: 0 }]
```
*(Le "A" initial est bien là)*

**Console Serveur (après clics multiples) :**
```
[DEBUG] createPublication: Galerie X. Publications existantes trouvées: A
[DEBUG] createPublication: Prochain index disponible calculé: 1
[DEBUG] createPublication: Création de la Publication avec la lettre: B

[DEBUG] createPublication: Galerie X. Publications existantes trouvées: A, B
[DEBUG] createPublication: Prochain index disponible calculé: 2
[DEBUG] createPublication: Création de la Publication avec la lettre: C

[DEBUG] createPublication: Galerie X. Publications existantes trouvées: A, B, C
[DEBUG] createPublication: Prochain index disponible calculé: 3
[DEBUG] createPublication: Création de la Publication avec la lettre: D
```

**Console Navigateur (addPublicationFrame) :**
```
[DEBUG] addPublicationFrame: DÉBUT - Publications actuelles: [{ letter: 'A', index: 0 }]
[DEBUG] addPublicationFrame: Réponse du serveur, publication créée: { letter: 'B', index: 1 }
[DEBUG] addPublicationFrame: Réponse du serveur, publication créée: { letter: 'C', index: 2 }
[DEBUG] addPublicationFrame: Réponse du serveur, publication créée: { letter: 'D', index: 3 }
```

## Interprétation des Résultats

### Si les logs montrent des créations multiples :
- **Cause confirmée** : Clics multiples rapides
- **Solution** : Améliorer la désactivation du bouton ou ajouter un debounce

### Si les logs montrent une seule création de "D" :
- **Cause différente** : Problème d'état initial ou de synchronisation
- **Investigation** : Analyser pourquoi le serveur pense que A, B, C existent déjà

### Si les logs montrent A, B, C, D créés mais seul D affiché :
- **Cause confirmée** : Problème d'affichage/rafraîchissement de l'interface
- **Solution** : Corriger la logique d'affichage des publications

## Actions Suivantes

1. **Reproduire** le bug avec les logs activés
2. **Analyser** les patterns dans les logs
3. **Identifier** la cause exacte
4. **Implémenter** la correction appropriée
5. **Retirer** les logs une fois le problème résolu