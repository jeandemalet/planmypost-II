# Guide de Test - Onglet Publication Instagram

## 🎯 Objectif
Vérifier que la nouvelle fonctionnalité de publication Instagram fonctionne correctement avec la logique de désynchronisation des onglets.

## ✅ Modifications Appliquées

### 1. Architecture (script.js)
- ✅ Propriété `globalModeTabs = ['calendar', 'publication']` ajoutée
- ✅ Méthode `activateTab()` modifiée avec la nouvelle logique de contexte
- ✅ Méthode `loadGlobalContext()` ajoutée
- ✅ Méthodes `showPublicationTab()`, `renderInstagramMockup()`, `setupInstagramLogin()` ajoutées

### 2. Interface (index.html)
- ✅ Nouvel onglet "Publication" avec icône Instagram
- ✅ Mockup de téléphone avec grille Instagram
- ✅ Panneau de contrôle pour la connexion Instagram

### 3. Styles (style.css)
- ✅ Styles pour le mockup smartphone
- ✅ Grille Instagram avec aspect-ratio 9:16 (format Reels)
- ✅ Layout responsive avec panneau de contrôle

### 4. Backend
- ✅ Contrôleur `instagramController.js` créé
- ✅ Routes `/api/instagram/*` ajoutées
- ✅ Architecture prête pour l'API Meta

## 🧪 Tests à Effectuer

### Test 1: Navigation des Onglets
1. **Démarrer l'application**
2. **Aller dans "Galeries"** → Sélectionner une galerie
3. **Aller dans "Tri"** → Doit charger la galerie sélectionnée
4. **Aller dans "Calendrier"** → Doit rester en mode global (toutes les galeries)
5. **Aller dans "Publication"** → Doit afficher le mockup Instagram

**Résultat attendu:** Les onglets Calendrier et Publication fonctionnent en mode global, les autres en mode galerie-spécifique.

### Test 2: Affichage du Mockup Instagram
1. **Aller dans l'onglet "Publication"**
2. **Vérifier l'affichage du mockup de téléphone**
3. **Vérifier la grille des publications planifiées**

**Résultat attendu:** 
- Mockup de téléphone avec design Instagram
- Grille 3x3 avec format vertical (9:16)
- Publications planifiées affichées avec leurs miniatures

### Test 3: Panneau de Contrôle
1. **Cliquer sur "Se connecter à Instagram"**
2. **Vérifier l'affichage du message de développement**

**Résultat attendu:** Alert indiquant que la connexion est en développement.

### Test 4: Logique de Contexte Global
1. **Planifier des publications dans différentes galeries**
2. **Aller dans l'onglet "Publication"**
3. **Vérifier que toutes les publications planifiées s'affichent**

**Résultat attendu:** Toutes les publications de toutes les galeries sont visibles.

## 🔍 Points de Vérification

### Console du Navigateur
Rechercher ces messages :
```
✅ "Activation d'un onglet global : chargement des données de toutes les galeries..."
✅ "Contexte global mis à jour : X publications de toutes les galeries."
```

### Éléments DOM
Vérifier la présence de :
```html
✅ <button data-tab="publication">
✅ <div id="publication" class="tab-content">
✅ <div id="ig-feed-grid" class="ig-grid-container">
✅ <button id="instagram-login-btn">
```

### Styles CSS
Vérifier l'application des styles :
```css
✅ .smartphone-mockup (mockup de téléphone)
✅ .ig-grid-container (grille Instagram)
✅ .ig-feed-item (éléments avec aspect-ratio 9:16)
```

## 🚨 Problèmes Potentiels

### Problème 1: Onglet ne s'affiche pas
**Cause:** Cache du navigateur
**Solution:** Ctrl+F5 pour vider le cache

### Problème 2: Erreur JavaScript
**Cause:** Méthode manquante
**Solution:** Vérifier que toutes les méthodes sont présentes dans script.js

### Problème 3: Styles non appliqués
**Cause:** CSS non chargé
**Solution:** Vérifier que style.css contient les nouveaux styles

### Problème 4: Grille vide
**Cause:** Pas de publications planifiées
**Solution:** Planifier au moins une publication dans le calendrier

## 🎉 Critères de Réussite

- [ ] Le nouvel onglet "Publication" est visible
- [ ] Le mockup Instagram s'affiche correctement
- [ ] La grille affiche les publications planifiées
- [ ] La logique de mode global fonctionne
- [ ] Aucune erreur JavaScript dans la console
- [ ] Le bouton de connexion Instagram fonctionne
- [ ] Les styles sont correctement appliqués

## 📝 Prochaines Étapes

Une fois tous les tests réussis :
1. **Intégration API Instagram** → Développer `instagramController.js`
2. **Authentification Meta** → Implémenter OAuth 2.0
3. **Publication automatique** → Connecter au Graph API
4. **Gestion des statuts** → Suivi des publications en cours

---

**Note:** Cette implémentation pose les bases solides pour l'intégration complète de l'API Instagram. La logique de désynchronisation des onglets est maintenant opérationnelle !