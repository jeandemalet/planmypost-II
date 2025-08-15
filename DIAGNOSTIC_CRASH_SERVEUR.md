# Diagnostic du Crash Serveur - Création de Galerie

## Date : 15 Août 2025

## Analyse du Problème

### Symptômes Observés
- ✅ Les galeries existantes se chargent parfaitement (A-X visibles)
- ❌ Crash du serveur lors de la création d'une nouvelle galerie
- ❌ Erreur `NS_ERROR_CONNECTION_REFUSED` dans le navigateur
- ❌ Apparition de "D" au lieu de "A" dans certains cas

### Diagnostic
Le problème n'est **PAS** dans la logique d'affichage frontend, mais dans un **crash fatal du serveur Node.js** lors de la création d'une nouvelle galerie.

**Séquence des événements :**
1. Application chargée → ✅ Fonctionne (galeries existantes OK)
2. Clic "Nouvelle Galerie" → 🔄 Requête POST `/api/galleries`
3. **CRASH SERVEUR** → ❌ Erreur fatale non interceptée
4. Serveur arrêté → ❌ Port fermé
5. Navigateur → ❌ `NS_ERROR_CONNECTION_REFUSED`

## Solution Appliquée

### Bloc de Sécurité Ajouté dans `server.js`

```javascript
// ======================= BLOC DE SÉCURITÉ POUR INTERCEPTER LES CRASHES =======================
process.on('uncaughtException', (error, origin) => {
    console.error('🚨 ERREUR FATALE INTERCEPTÉE (UNCAUGHT EXCEPTION) ! Le serveur va s\'arrêter.');
    console.error('📍 Erreur:', error);
    console.error('📍 Stack trace:', error.stack);
    console.error('📍 Origine:', origin);
    console.error('📍 Timestamp:', new Date().toISOString());
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 PROMESSE NON GÉRÉE (UNHANDLED REJECTION) !');
    console.error('📍 Raison:', reason);
    console.error('📍 Stack trace:', reason?.stack);
    console.error('📍 Promesse:', promise);
    console.error('📍 Timestamp:', new Date().toISOString());
});
```

## Instructions de Test

### Étape 1 : Redémarrer le Serveur
```bash
# Arrêter le serveur actuel (Ctrl+C)
# Puis redémarrer
npm run dev
# ou
node server.js
```

### Étape 2 : Reproduire le Bug
1. Ouvrir l'application dans le navigateur
2. Aller dans l'onglet "Galeries"
3. Cliquer sur "Nouvelle Galerie"
4. **Observer la console du serveur** (terminal, pas navigateur)

### Étape 3 : Analyser les Logs
Vous devriez maintenant voir dans la console du serveur :
- Le nom exact du fichier qui cause l'erreur
- Le numéro de ligne précis
- La stack trace complète
- Le type d'erreur exact

## Résultat Attendu

Avec ce bloc de sécurité, nous obtiendrons :
- ✅ Une trace détaillée de l'erreur fatale
- ✅ Le fichier et la ligne exacte du problème
- ✅ La possibilité de corriger la cause racine
- ✅ Un serveur qui s'arrête proprement au lieu de planter silencieusement

## Prochaines Étapes

1. **Tester** : Reproduire le crash avec le nouveau système de logs
2. **Analyser** : Identifier la ligne de code problématique
3. **Corriger** : Appliquer le fix spécifique à la cause racine
4. **Valider** : Confirmer que la création de galerie fonctionne

## Fichiers Modifiés

- `server.js` : Ajout du bloc de sécurité pour intercepter les crashes
- `DIAGNOSTIC_CRASH_SERVEUR.md` : Ce document de suivi