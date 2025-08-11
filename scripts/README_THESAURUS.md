# Génération Automatique du Thésaurus de Hashtags

Ce dossier contient les scripts pour générer automatiquement un dictionnaire sémantique de hashtags en combinant deux sources de données :

1. **Predis.ai** - Hashtags catégorisés par domaine photographique
2. **HIERTAGS** - Relations sémantiques entre tags basées sur Flickr

## 🚀 Utilisation Rapide

### Option 1: Script Automatique (Recommandé)
```bash
cd scripts
python generer_thesaurus_complet.py
```

### Option 2: Étape par Étape
```bash
cd scripts

# 1. Scraper Predis.ai
python scrape_predis_ai_complet.py

# 2. Traiter HIERTAGS (optionnel, nécessite le fichier TSV)
python process_hiertags_complet.py

# 3. Générer le thésaurus final
python generer_thesaurus_final.py
```

## 📋 Prérequis

### Dépendances Python
```bash
pip install requests beautifulsoup4 pandas
```

### Fichier HIERTAGS (Optionnel)
Pour enrichir le thésaurus avec des relations sémantiques :

1. Téléchargez `flickr_tag_co-occurrence_network.tsv` depuis :
   https://www.ims.uni-stuttgart.de/en/research/resources/corpora/HierTags/

2. Placez le fichier dans le dossier racine du projet

## 📁 Fichiers Générés

- `predis_ai_raw.json` - Données brutes scrapées de Predis.ai
- `hiertags_relations_raw.json` - Relations sémantiques de HIERTAGS
- `hashtag-thesaurus.json` - Dictionnaire final prêt à l'emploi
- `public/lib/hashtag-thesaurus.json` - Copie pour l'application

## 🔧 Scripts Individuels

### `scrape_predis_ai_complet.py`
- Scrape les hashtags catégorisés de Predis.ai
- Gère les variations de structure HTML
- Génère `predis_ai_raw.json`

### `process_hiertags_complet.py`
- Traite le fichier TSV de HIERTAGS
- Crée un graphe de relations pondérées
- Génère `hiertags_relations_raw.json`

### `generer_thesaurus_final.py`
- Fusionne les deux sources de données
- Applique la logique de priorité et de mapping
- Génère le fichier final optimisé

### `generer_thesaurus_complet.py`
- Script principal qui orchestre tout le processus
- Gère les dépendances et les erreurs
- Copie automatiquement le résultat vers `public/lib/`

## 🎯 Mots-clés Supportés

Le thésaurus génère des hashtags pour ces domaines :

- **mariage** - Photographie de mariage
- **portrait** - Photographie de portrait
- **voyage** - Photographie de voyage
- **mode** - Photographie de mode
- **noir et blanc** - Photographie monochrome
- **paysage** - Photographie de paysage
- **studio** - Photographie en studio
- **maquilleuse** - Maquillage et beauté
- **couturiere** - Mode et couture

## 📊 Structure du Fichier Final

```json
{
  "mariage": {
    "p": 100,
    "h": ["wedding", "bride", "groom", "ceremony", ...]
  },
  "portrait": {
    "p": 95,
    "h": ["portrait", "headshot", "model", ...]
  }
}
```

- `p` : Priorité (100 = plus haute)
- `h` : Liste des hashtags associés

## 🔄 Mise à Jour

Pour mettre à jour le thésaurus :
1. Relancez `python generer_thesaurus_complet.py`
2. Le nouveau fichier remplacera automatiquement l'ancien
3. Redémarrez votre application pour prendre en compte les changements