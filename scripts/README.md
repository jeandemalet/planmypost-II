# Scripts de Génération du Thésaurus

Ce dossier contient tous les scripts et outils nécessaires pour générer le thésaurus de hashtags utilisé par l'application.

## Utilisation Rapide

Pour générer/mettre à jour le thésaurus de hashtags :

```bash
npm run build:thesaurus
```

Cette commande unique va :
1. Scraper les données de Predis.ai
2. Traiter les données HIERTAGS (si disponibles)
3. Fusionner les données et générer le fichier final
4. Copier automatiquement le résultat dans `public/lib/`

## Prérequis

- Python 3.x installé
- Dépendances Python (installées automatiquement) :
  - `requests`
  - `beautifulsoup4` 
  - `pandas`

## Fichiers Optionnels

- `flickr_tag_co-occurrence_network.tsv` : Données sémantiques HIERTAGS (téléchargeable depuis https://www.ims.uni-stuttgart.de/en/research/resources/corpora/HierTags/)

## Scripts Principaux

- `generer_thesaurus_complet.py` : Script principal qui orchestre tout le processus
- `scrape_predis_complet.py` : Scraping des données Predis.ai
- `process_hiertags_resilient.py` : Traitement résilient des données HIERTAGS
- `generer_thesaurus_final.py` : Fusion et génération du fichier final

## Fichiers de Test

Les fichiers `test-*.html` et `test-*.js` sont des outils de développement pour tester les fonctionnalités.