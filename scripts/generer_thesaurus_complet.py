#!/usr/bin/env python3
"""
Script principal pour générer automatiquement le thésaurus de hashtags
en combinant les données de Predis.ai et HIERTAGS.
"""

import os
import sys
import subprocess
import json
from pathlib import Path

def install_requirements():
    """Installe les dépendances nécessaires."""
    required_packages = ['requests', 'beautifulsoup4', 'pandas']
    
    for package in required_packages:
        try:
            __import__(package.replace('-', '_'))
        except ImportError:
            print(f"Installation de {package}...")
            subprocess.check_call([sys.executable, '-m', 'pip', 'install', package])

def check_hiertags_file():
    """Vérifie si le fichier HIERTAGS est présent."""
    hiertags_file = "flickr_tag_co-occurrence_network.tsv"
    if not os.path.exists(hiertags_file):
        print(f"""
❌ ATTENTION: Le fichier '{hiertags_file}' n'est pas trouvé.

Pour télécharger les données HIERTAGS :
1. Allez sur : https://www.ims.uni-stuttgart.de/en/research/resources/corpora/HierTags/
2. Téléchargez le fichier 'flickr_tag_co-occurrence_network.tsv'
3. Placez-le dans le dossier racine du projet

Le script continuera sans les données sémantiques HIERTAGS.
        """)
        return False
    return True

def main():
    print("🚀 Génération automatique du thésaurus de hashtags")
    print("=" * 50)
    
    # Installer les dépendances
    print("1. Vérification des dépendances...")
    install_requirements()
    
    # Vérifier le fichier HIERTAGS
    print("2. Vérification du fichier HIERTAGS...")
    has_hiertags = check_hiertags_file()
    
    # Étape 1: Scraping Predis.ai
    print("3. Scraping des données Predis.ai...")
    try:
        from scrape_predis_ai_complet import scrape_predis_ai_complet
        scrape_predis_ai_complet()
    except Exception as e:
        print(f"❌ Erreur lors du scraping : {e}")
        return
    
    # Étape 2: Traitement HIERTAGS (si disponible)
    if has_hiertags:
        print("4. Traitement des données HIERTAGS...")
        try:
            from process_hiertags_complet import process_hiertags_complet
            process_hiertags_complet()
        except Exception as e:
            print(f"❌ Erreur lors du traitement HIERTAGS : {e}")
            # Créer un fichier vide pour que la fusion fonctionne
            with open("hiertags_relations_raw.json", 'w') as f:
                json.dump({}, f)
    else:
        print("4. Création d'un fichier HIERTAGS vide...")
        with open("hiertags_relations_raw.json", 'w') as f:
            json.dump({}, f)
    
    # Étape 3: Fusion et génération finale
    print("5. Génération du thésaurus final...")
    try:
        from generer_thesaurus_final import generer_thesaurus_final
        generer_thesaurus_final()
        
        # Copier le fichier vers le dossier public/lib
        if os.path.exists("hashtag-thesaurus.json"):
            os.makedirs("public/lib", exist_ok=True)
            import shutil
            shutil.copy("hashtag-thesaurus.json", "public/lib/hashtag-thesaurus.json")
            print("📁 Fichier copié vers public/lib/hashtag-thesaurus.json")
            
    except Exception as e:
        print(f"❌ Erreur lors de la génération finale : {e}")
        return
    
    print("\n🎉 Génération terminée avec succès !")
    print("Le fichier hashtag-thesaurus.json est prêt à être utilisé dans votre application.")

if __name__ == "__main__":
    main()