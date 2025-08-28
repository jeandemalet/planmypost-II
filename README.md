# Publication Organizer

Application web pour organiser et gérer des galeries d'images avec système de planification.

## 🔒 Security & Performance
**Sécurité et optimisations de performance de niveau entreprise implémentées :**
- **🛡️ Suite de Sécurité Complète**: Validation des entrées, protection XSS, protection CSRF, limitation de débit, en-têtes de sécurité
- **⚡ Optimisations de Performance**: Indexation base de données, cache côté serveur, minification des assets, compression
- **🔧 Sécurité Environnement**: Validation automatique, gestion des secrets, durcissement production
- **📊 Monitoring**: Statistiques de cache, métriques de performance, logs de sécurité

👉 **[Guide de Configuration Rapide](./QUICK_SETUP_GUIDE.md)** - Configuration sécurité en 5 minutes  
👉 **[Guide de Sécurité Complet](./SECURITY_PERFORMANCE_GUIDE.md)** - Documentation détaillée

## Installation

1. Cloner le repository
2. Installer les dépendances : `npm install`
3. Configurer les variables d'environnement dans `.env`
4. Démarrer l'application : `npm start`

## Fonctionnalités

- Gestion de galeries d'images
- Organisation par "jours" (A, B, C, etc.)
- Système de planification/calendrier
- Recadrage d'images
- Descriptions et métadonnées

## Maintenance de la base de données

### Nettoyage des données orphelines

Si vous rencontrez des problèmes avec des données orphelines (Jours ou entrées de calendrier qui référencent des galeries supprimées), vous pouvez utiliser le script de nettoyage :

```bash
node cleanup.js
```

**Quand utiliser ce script :**
- Après une suppression manuelle de galeries en base de données
- Si vous observez des "vieux jours qui traînent" dans l'interface
- En cas de corruption de données suite à une interruption de processus

**Ce que fait le script :**
- Analyse toutes les galeries existantes
- Supprime les `Jour` orphelins (sans galerie parente)
- Supprime les entrées `Schedule` orphelines
- Affiche un rapport détaillé des suppressions

**Sécurité :** Le script est sûr et ne supprime que les données réellement orphelines.

## Architecture

- **Backend :** Node.js + Express + MongoDB
- **Frontend :** Vanilla JavaScript
- **Base de données :** MongoDB avec Mongoose
- **Upload :** Multer pour la gestion des fichiers

## Scripts disponibles

- `npm start` : Démarrer l'application
- `node cleanup.js` : Nettoyer les données orphelines
- `node fix-encoding-migration.js` : Migration d'encodage (si nécessaire)