# Guide d'Utilisation - Version Résiliente

## 🛡️ Processus Résilient pour HIERTAGS

Le traitement du fichier HIERTAGS peut prendre plusieurs heures. Cette version résiliente permet d'interrompre et reprendre le processus sans perdre le travail effectué.

## 📋 Étapes Recommandées

### 1. Préparation
```bash
# Téléchargez le fichier HIERTAGS depuis :
# https://www.ims.uni-stuttgart.de/en/research/resources/corpora/HierTags/
# Placez 'flickr_tag_co-occurrence_network.tsv' dans le dossier racine
```

### 2. Scraping Rapide (2-3 minutes)
```bash
python scrape_predis_ai_complet.py
```
✅ Génère `predis_ai_raw.json`

### 3. Traitement HIERTAGS Résilient (1-6 heures)
```bash
python process_hiertags_resilient.py
```

**Fonctionnalités de résilience :**
- ⏸️ **Interruption sûre** : Ctrl+C à tout moment
- 🔄 **Reprise automatique** : Relancez le script, il reprend où il s'est arrêté
- 💾 **Sauvegarde continue** : Progression sauvée toutes les 100k lignes
- 📊 **Suivi en temps réel** : Affichage du nombre de lignes traitées

**Fichiers créés :**
- `hiertags_relations_raw.jsonl` - Données sémantiques (format JSONL)
- `hiertags_progress.txt` - Fichier de progression (supprimé automatiquement à la fin)

### 4. Génération du Thésaurus Final (quelques secondes)
```bash
python generer_thesaurus_final.py
```
✅ Génère `hashtag-thesaurus.json`

## 🔧 Commandes Utiles

### Vérifier la Progression
```bash
# Voir combien de lignes ont été traitées
cat hiertags_progress.txt

# Voir la taille du fichier de sortie
ls -lh hiertags_relations_raw.jsonl
```

### Redémarrer Complètement
```bash
# Nettoie tous les fichiers temporaires
python nettoyer_progression.py

# Puis relancez le processus complet
python scrape_predis_ai_complet.py
python process_hiertags_resilient.py
python generer_thesaurus_final.py
```

### Processus Automatique (Non-Résilient)
```bash
# Si vous voulez tout automatiser d'un coup (risqué pour HIERTAGS)
python generer_thesaurus_complet.py
```

## 📊 Estimation des Temps

| Étape | Durée Estimée | Résilience |
|-------|---------------|------------|
| Scraping Predis.ai | 2-3 minutes | ❌ (rapide, pas nécessaire) |
| Traitement HIERTAGS | 1-6 heures | ✅ (résilient) |
| Génération finale | < 30 secondes | ❌ (très rapide) |

## 🚨 Gestion des Erreurs

### Si le script s'arrête brutalement
1. Vérifiez `hiertags_progress.txt` pour voir où il s'est arrêté
2. Relancez `python process_hiertags_resilient.py`
3. Le script reprendra automatiquement

### Si vous voulez changer les paramètres
```python
# Dans process_hiertags_resilient.py, vous pouvez modifier :
min_weight=0.1      # Seuil de poids minimum (plus bas = plus de données)
chunk_size=100000   # Taille des lots (plus petit = plus de sauvegardes)
```

### Si le fichier JSONL semble corrompu
```bash
# Nettoyez et recommencez
python nettoyer_progression.py
python process_hiertags_resilient.py
```

## 💡 Conseils d'Optimisation

1. **Lancez le traitement HIERTAGS le soir** - Il peut tourner toute la nuit
2. **Surveillez l'espace disque** - Le fichier JSONL peut faire plusieurs GB
3. **N'interrompez pas pendant l'écriture** - Attendez l'affichage du prochain lot
4. **Gardez le fichier TSV** - Vous pourrez relancer le traitement plus tard

## 🎯 Résultat Final

Une fois terminé, vous aurez :
- `hashtag-thesaurus.json` - Dictionnaire optimisé pour votre application
- Copie automatique dans `public/lib/hashtag-thesaurus.json`

Le fichier est prêt à être intégré dans votre application web !