#!/usr/bin/env python3
"""
Script pour nettoyer les fichiers de progression et recommencer le traitement HIERTAGS.
Utile si vous voulez redémarrer complètement le processus.
"""

import os

def nettoyer_progression():
    """Supprime tous les fichiers de progression et de sortie temporaires."""
    
    fichiers_a_supprimer = [
        "hiertags_progress.txt",
        "hiertags_relations_raw.jsonl",
        "predis_ai_raw.json"
    ]
    
    print("🧹 Nettoyage des fichiers de progression...")
    
    for fichier in fichiers_a_supprimer:
        if os.path.exists(fichier):
            os.remove(fichier)
            print(f"  ✅ Supprimé : {fichier}")
        else:
            print(f"  ⏭️ Déjà absent : {fichier}")
    
    print("\n🎯 Nettoyage terminé. Vous pouvez maintenant relancer le processus complet.")
    print("Commandes à exécuter :")
    print("  python scrape_predis_ai_complet.py")
    print("  python process_hiertags_resilient.py")
    print("  python generer_thesaurus_final.py")

if __name__ == "__main__":
    nettoyer_progression()