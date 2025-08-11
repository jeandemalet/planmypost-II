import pandas as pd
import json

def process_hiertags_complet(input_filename="flickr_tag_co-occurrence_network.tsv", 
                           output_filename="hiertags_relations_raw.json",
                           min_weight=0.1):  # Seuil pour garder les relations pertinentes
    """Analyse le fichier HIERTAGS et crée un dictionnaire de relations pondérées."""
    
    try:
        print(f"Chargement du jeu de données '{input_filename}'...")
        df = pd.read_csv(input_filename, sep='\t', header=None, names=['tag1', 'tag2', 'weight'])
        print(f"✅ Chargement terminé. {len(df)} relations trouvées.")
    except FileNotFoundError:
        print(f"❌ ERREUR: Fichier '{input_filename}' non trouvé.")
        return
    
    # Filtrer les relations peu pertinentes pour alléger le fichier
    df = df[df['weight'] >= min_weight].copy()
    print(f"Filtrage des relations avec un poids >= {min_weight}. Reste {len(df)} relations.")
    
    relations = {}
    print("Construction du dictionnaire de relations...")
    
    # itertuples() est beaucoup plus rapide que iterrows()
    for row in df.itertuples(index=False):
        tag1, tag2, weight = row.tag1, row.tag2, row.weight
        
        # Ajouter la relation dans les deux sens pour une recherche facile
        if tag1 not in relations: 
            relations[tag1] = {}
        if tag2 not in relations: 
            relations[tag2] = {}
            
        relations[tag1][tag2] = weight
        relations[tag2][tag1] = weight
    
    # Sauvegarder les relations brutes
    with open(output_filename, 'w', encoding='utf-8') as f:
        json.dump(relations, f, ensure_ascii=False, indent=2)
    
    print(f"\n✅ Dictionnaire de relations sémantiques sauvegardé dans '{output_filename}'")

if __name__ == "__main__":
    process_hiertags_complet()