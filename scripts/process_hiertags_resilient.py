import pandas as pd
import json
import os

def process_hiertags_resilient(
    input_filename="flickr_tag_co-occurrence_network.tsv", 
    output_filename="hiertags_relations_raw.jsonl",  # Format .jsonl
    progress_file="hiertags_progress.txt",
    min_weight=0.1,
    chunk_size=100000  # Traiter 100 000 lignes à la fois
):
    """
    Analyse le fichier HIERTAGS de manière résiliente, en sauvegardant la progression.
    """
    start_line = 0
    
    # Logique de reprise
    if os.path.exists(progress_file):
        with open(progress_file, 'r') as f:
            try:
                start_line = int(f.read().strip())
                print(f"🔄 Reprise du traitement à partir de la ligne {start_line}...")
            except ValueError:
                print("⚠️ Fichier de progression invalide, recommencement.")
                start_line = 0
    else:
        # Si le fichier de sortie existe mais pas le fichier de progression, on nettoie
        if os.path.exists(output_filename):
            os.remove(output_filename)
            print("🧹 Nettoyage du fichier de sortie précédent.")

    try:
        print(f"📊 Chargement du jeu de données '{input_filename}' par lots...")
        
        # Lecture par chunks pour économiser la mémoire
        iterator = pd.read_csv(
            input_filename, 
            sep='\t', 
            header=None, 
            names=['tag1', 'tag2', 'weight'],
            chunksize=chunk_size,
            skiprows=range(1, start_line + 1) if start_line > 0 else None
        )
        
        processed_count = start_line
        
        # Écriture en mode append
        with open(output_filename, 'a', encoding='utf-8') as f:
            for i, chunk in enumerate(iterator):
                # Filtrer par poids minimum
                chunk_filtered = chunk[chunk['weight'] >= min_weight]
                
                for row in chunk_filtered.itertuples(index=False):
                    tag1, tag2, weight = str(row.tag1), str(row.tag2), float(row.weight)
                    
                    # Écrire une ligne JSON pour chaque relation (bidirectionnelle)
                    relation1 = {"tag": tag1, "related": tag2, "weight": weight}
                    relation2 = {"tag": tag2, "related": tag1, "weight": weight}
                    
                    f.write(json.dumps(relation1, ensure_ascii=False) + '\n')
                    f.write(json.dumps(relation2, ensure_ascii=False) + '\n')
                
                processed_count += len(chunk)
                
                # Sauvegarde de la progression
                with open(progress_file, 'w') as pf:
                    pf.write(str(processed_count))
                
                print(f"  ✅ Lot {i+1} traité. Total de lignes analysées : {processed_count:,}")
                
    except FileNotFoundError:
        print(f"❌ ERREUR: Fichier '{input_filename}' non trouvé.")
        print("Téléchargez-le depuis : https://www.ims.uni-stuttgart.de/en/research/resources/corpora/HierTags/")
        return
    except KeyboardInterrupt:
        print(f"\n⏸️ Interruption détectée. Progression sauvegardée jusqu'à la ligne {processed_count}.")
        print("Vous pouvez relancer le script pour reprendre le traitement.")
        return
    except Exception as e:
        print(f"❌ Une erreur est survenue : {e}")
        print(f"La progression est sauvegardée jusqu'à la ligne {processed_count}. Vous pouvez relancer le script.")
        return
    
    # Nettoyage des fichiers temporaires en cas de succès
    if os.path.exists(progress_file):
        os.remove(progress_file)
        print("🧹 Fichier de progression supprimé (traitement terminé).")
    
    print(f"\n🎉 Traitement terminé avec succès !")
    print(f"📁 Données sauvegardées dans '{output_filename}'")

if __name__ == "__main__":
    process_hiertags_resilient()