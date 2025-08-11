# Intégration du Générateur de Hashtags

## Vue d'ensemble

Le système de génération de hashtags combine une analyse NLP (Natural Language Processing) avec un dictionnaire sémantique personnalisé pour proposer des hashtags pertinents basés sur le contenu textuel.

## Architecture

### 1. Bibliothèque NLP
- **Fichier**: `public/lib/nlp.min.js`
- **Source**: Paquet npm `@nlpjs/nlp@^4.23.5`
- **Fonction**: Extraction automatique de mots-clés depuis le texte

### 2. Dictionnaire Sémantique
- **Fichier**: `public/lib/hashtag-thesaurus.json`
- **Structure**: Mots-clés français → hashtags spécialisés + priorités
- **Domaines couverts**: mariage, portrait, voyage, mode, etc.

### 3. Interface Utilisateur
- **Classe**: `HashtagManager` dans `public/script.js`
- **Interface**: Modale interactive avec sélection/désélection
- **Intégration**: Bouton "🤖 Générer les Hashtags" dans l'éditeur de description

## Fonctionnement

1. **Analyse du texte**: Extraction de mots-clés via NLP.js
2. **Enrichissement sémantique**: Correspondance avec le dictionnaire
3. **Priorisation**: Tri par pertinence (dictionnaire > NLP > hashtags de base)
4. **Filtrage**: Exclusion des hashtags déjà présents
5. **Interface**: Présentation dans une modale interactive

## Installation et Maintenance

### Installation initiale
```bash
npm install
```

### Mise à jour du fichier NLP
```bash
npm run copy-nlp
```

### Test de l'intégration
Ouvrir `test-hashtag-integration.html` dans le navigateur pour vérifier:
- Chargement de NLP.js
- Accès au dictionnaire
- Génération de hashtags

## Personnalisation

### Ajouter des mots-clés au dictionnaire
Éditer `public/lib/hashtag-thesaurus.json`:
```json
{
  "nouveau_mot_cle": {
    "p": 85,
    "h": ["hashtag1", "hashtag2", "hashtag3"]
  }
}
```

### Modifier les priorités
- `p`: Priorité (0-100, plus élevé = plus prioritaire)
- `h`: Array des hashtags associés

## Avantages de cette approche

1. **Autonomie**: Pas de dépendance externe (CDN)
2. **Performance**: Fichiers servis localement
3. **Fiabilité**: Fonctionne hors ligne
4. **Contrôle**: Version verrouillée dans package.json
5. **Personnalisation**: Dictionnaire adapté au domaine métier

## Fichiers concernés

- `public/index.html` - Chargement de la bibliothèque
- `public/script.js` - Logique HashtagManager
- `public/style.css` - Styles de la modale
- `public/lib/nlp.min.js` - Bibliothèque NLP
- `public/lib/hashtag-thesaurus.json` - Dictionnaire sémantique
- `package.json` - Dépendance npm
- `scripts/copy-nlp.js` - Script de maintenance