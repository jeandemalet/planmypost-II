import json

def generer_thesaurus_final(scraped_file="predis_ai_raw.json", 
                          semantic_file="hiertags_relations_raw.json", 
                          output_file="hashtag-thesaurus.json"):
    """Fusionne les données scrapées et sémantiques pour créer le dictionnaire final."""
    
    try:
        with open(scraped_file, 'r', encoding='utf-8') as f:
            scraped_data = json.load(f)
        with open(semantic_file, 'r', encoding='utf-8') as f:
            semantic_data = json.load(f)
    except FileNotFoundError as e:
        print(f"❌ ERREUR: Fichier manquant : {e.filename}. Veuillez d'abord exécuter les scripts de collecte.")
        return
    
    # Mots-clés principaux pour notre thésaurus. 
    # La clé est le mot à détecter dans le texte, la valeur est le terme à chercher dans les données.
    keywords_map = {
        "mariage": "wedding photography",
        "portrait": "portrait photography", 
        "voyage": "travel photography",
        "mode": "fashion photography",
        "noir et blanc": "black and white photography",
        "paysage": "landscape photography",
        "studio": "studio photography",
        "maquilleuse": "makeup",  # Terme plus générique pour HIERTAGS
        "couturiere": "fashion"   # On se rattache à la mode
    }
    
    final_thesaurus = {}
    priority_counter = 100
    
    for keyword_fr, keyword_en in keywords_map.items():
        print(f"Traitement de '{keyword_fr}' (mappé sur '{keyword_en}')")
        base_hashtags = set()
        
        # 1. Trouver les hashtags de base dans les données scrapées
        for category_info in scraped_data:
            if any(term in category_info["category"].lower() for term in keyword_en.split()):
                print(f"  -> Correspondance trouvée dans la catégorie scrapée : '{category_info['category']}'")
                for tag in category_info["hashtags"]:
                    base_hashtags.add(tag)
        
        # 2. Enrichir avec les données sémantiques de HIERTAGS
        # On cherche le terme le plus simple (ex: "wedding" pour "wedding photography")
        main_semantic_term = keyword_en.split()[0]
        
        if main_semantic_term in semantic_data:
            relations = semantic_data[main_semantic_term]
            # Trier les relations par poids et prendre les 10 meilleures
            top_semantic_tags = sorted(relations.items(), key=lambda item: item[1], reverse=True)[:10]
            print(f"  -> Top 5 tags sémantiques de HIERTAGS : {[tag for tag, w in top_semantic_tags[:5]]}")
            
            for tag, weight in top_semantic_tags:
                base_hashtags.add(tag)
        
        # Ajouter le mot-clé lui-même s'il est simple
        if len(keyword_fr.split()) == 1:
            base_hashtags.add(keyword_fr.replace(' ', ''))
        
        if base_hashtags:
            final_thesaurus[keyword_fr] = {
                "p": priority_counter,
                "h": sorted(list(base_hashtags))
            }
            priority_counter -= 5  # Diminuer la priorité pour le prochain
    
    # Sauvegarde du fichier final
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(final_thesaurus, f, ensure_ascii=False, indent=2)
    
    print(f"\n✅ Thésaurus final généré avec succès dans '{output_file}' !")
    print(f"Ce fichier est prêt à être utilisé dans votre application.")

if __name__ == "__main__":
    generer_thesaurus_final()