# Publication Organizer

Application web professionnelle pour organiser et gérer des galeries d'images avec système de planification.

## 🔒 Security & Performance
**Sécurité et optimisations de performance de niveau entreprise implémentées :**

### 🛡️ Sécurité Renforcée
- **Validation Complète des Entrées**: Protection contre l'injection avec express-validator
- **CORS Sécurisé**: Configuration d'origine restrictive pour la production
- **Audit Automatisé**: Vérifications de sécurité continues avec GitHub Actions
- **Protection CSRF**: Tokens obligatoires pour toutes les opérations de modification
- **En-têtes de Sécurité**: Configuration Helmet avec CSP strict
- **Limitation de Débit**: Protection contre les attaques de force brute

### ⚡ Optimisations de Performance
- **Pagination Intelligente**: Chargement progressif des galeries volumineuses
- **Chargement Lazy**: Données du calendrier chargées à la demande
- **Cache Amélioré**: Stratégies de cache par type de ressource
- **Requêtes Optimisées**: Utilisation de `.lean()` et `.select()` pour MongoDB
- **Déploiement Zero-Downtime**: Rechargement PM2 sans interruption

### 🔧 Outils de Développement
- **Scripts de Sécurité**: `npm run security:check` pour audit complet
- **Déploiement Automatisé**: `npm run deploy:prod` avec validation
- **Rapports Détaillés**: Génération automatique de rapports de sécurité
- **CI/CD Intégré**: Vérifications automatiques sur chaque PR

👉 **[Guide de Configuration Rapide](./QUICK_SETUP_GUIDE.md)** - Configuration sécurité en 5 minutes  
👉 **[Guide de Sécurité Complet](./SECURITY_PERFORMANCE_GUIDE.md)** - Documentation technique détaillée

## 🚀 Installation Rapide

```bash
# 1. Cloner le repository
git clone <repository-url>
cd publication-organizer

# 2. Installer les dépendances avec audit de sécurité
npm install

# 3. Configurer l'environnement
cp .env.example .env
# Éditer .env avec vos configurations

# 4. Validation de sécurité (recommandé)
npm run security:check

# 5. Démarrer l'application
npm start
```

## 🎯 Fonctionnalités

### Gestion d'Images
- **Upload Multiples**: Interface drag & drop avec validation
- **Recadrage Intelligent**: Outils de recadrage avec prévisualisation
- **Miniatures Optimisées**: Génération automatique avec worker threads
- **Métadonnées EXIF**: Extraction et affichage des informations d'image

### Organisation
- **Galeries Structurées**: Organisation hiérarchique des images
- **Publications (A-Z)**: Système de classification par lettres
- **Descriptions Riches**: Support de métadonnées détaillées
- **Recherche et Tri**: Multiples critères de filtrage

### Planification
- **Calendrier Intégré**: Interface de planification intuitive
- **Synchronisation**: Mise à jour en temps réel des plannings
- **Export Groupé**: Téléchargement d'archives ZIP organisées
- **Vues Multiples**: Affichages quotidien, hebdomadaire, mensuel

### Authentification
- **Google OAuth**: Connexion sécurisée via Google
- **Gestion des Sessions**: JWT avec expiration automatique
- **Contrôle d'Accès**: Permissions basées sur les rôles
- **Sécurité Avancée**: Protection multi-couches

## 🛠️ Scripts Disponibles

### Développement
```bash
npm start              # Démarrer l'application
npm run dev            # Mode développement avec nodemon
npm run build          # Construire pour la production
```

### Sécurité et Maintenance
```bash
npm run security:check    # Audit de sécurité complet
npm run security:update   # Mise à jour des dépendances
npm run audit:security    # Vérification des vulnérabilités
```

### Déploiement
```bash
npm run deploy:dev     # Déploiement développement
npm run deploy:prod    # Déploiement production
npm run deploy:test    # Déploiement test (sans validation)
```

### Outils de Base de Données
```bash
node cleanup.js                    # Nettoyer les données orphelines
node fix-encoding-migration.js     # Migration d'encodage
```

## 🏢 Architecture Technique

### Backend
- **Runtime**: Node.js avec gestion d'erreurs avancée
- **Framework**: Express.js avec middlewares de sécurité
- **Base de Données**: MongoDB avec Mongoose ODM
- **Authentification**: Google OAuth + JWT + Sessions sécurisées
- **Sécurité**: Helmet, CORS, CSRF, Rate Limiting, Validation
- **Performance**: Cache en mémoire, worker threads, compression

### Frontend
- **Technologies**: Vanilla JavaScript moderne (ES6+)
- **Interface**: CSS Grid/Flexbox responsive
- **Sécurité**: CSP strict, sanitisation XSS
- **UX**: Chargement progressif, feedback utilisateur
- **Optimisations**: Lazy loading, mise en cache côté client

### Infrastructure
- **Process Manager**: PM2 avec clustering
- **Déploiement**: GitHub Actions + SSH
- **Monitoring**: Logs structurés + métriques
- **Sécurité**: Audits automatisés + rapports

## 🔍 Maintenance et Dépannage

### Nettoyage de Base de Données

Si vous rencontrez des problèmes avec des données orphelines :

```bash
node cleanup.js
```

**Utilisation recommandée :**
- Après suppression manuelle de galeries
- En cas de corruption de données
- Maintenance périodique (mensuelle)

**Actions du script :**
- Analyse des galeries existantes
- Suppression des publications orphelines
- Nettoyage des entrées de calendrier invalides
- Rapport détaillé des opérations

### Diagnostic de Performance

```bash
# Vérifier les statistiques de cache
curl http://localhost:3000/api/cache/stats

# Analyser les métriques PM2
pm2 monit

# Générer un rapport de performance
npm run deploy:test  # Inclut des métriques
```

### Résolution de Problèmes

- **Erreurs d'authentification**: Vérifier `GOOGLE_CLIENT_ID` et certificats SSL
- **Lenteur de chargement**: Analyser le cache (`/api/cache/stats`)
- **Erreurs de sécurité**: Consulter `security-report.json`
- **Échecs de déploiement**: Vérifier `deployment-report.json`

## 📜 Documentation Technique

- **[SECURITY_PERFORMANCE_GUIDE.md](./SECURITY_PERFORMANCE_GUIDE.md)**: Guide complet de sécurité et performance
- **[QUICK_SETUP_GUIDE.md](./QUICK_SETUP_GUIDE.md)**: Configuration rapide pour débutants
- **API Documentation**: Générée automatiquement via les annotations du code
- **Security Reports**: Générés automatiquement dans `security-report.json`

## 🔄 Mise à Jour et Migration

### Mise à Jour Sécurisée
```bash
# 1. Sauvegarder les données
mongodump --uri "$MONGODB_URI" --out backup/

# 2. Tester les mises à jour
npm run security:update
npm run security:check

# 3. Déployer avec validation
npm run deploy:prod
```

### Migration de Données
```bash
# Migration d'encodage (si nécessaire)
node fix-encoding-migration.js

# Reconstruction des index
node scripts/rebuild-indexes.js  # Si disponible
```

---

**Publication Organizer v2.0** - *Sécurité & Performance Enterprise-Ready*

*Développé avec ❤️ pour la sécurité et la performance*