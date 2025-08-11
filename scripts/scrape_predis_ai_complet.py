import requests
from bs4 import BeautifulSoup
import json
import re
import time
import random

def scrape_predis_ai_complet():
    url = "https://predis.ai/fr/ressources/hashtag-de-photographie/"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
    }
    
    print(f"Scraping de : {url}")
    
    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        print(f"Erreur HTTP : {e}")
        return
    
    print("Page téléchargée, analyse en cours...")
    soup = BeautifulSoup(response.content, 'html.parser')
    
    # Structure pour stocker les données brutes
    scraped_data = []
    
    # Cibler les titres de section, qui sont les h3
    for header in soup.find_all(['h3', 'h4']):
        category_title_raw = header.get_text(strip=True)
        
        # Nettoyage du titre
        category_title = re.sub(r'^\d+\.\s*', '', category_title_raw).strip()
        
        # Récupérer TOUS les hashtags dans le paragraphe ou la liste qui suit
        container = header.find_next_sibling(['p', 'ul'])
        if not container:
            continue
            
        hashtags = set()  # Utiliser un set pour éviter les doublons immédiats
        
        # Le contenu est parfois dans des <strong> ou directement dans le <p>
        raw_text = container.get_text(" ", strip=True)
        
        # Regex pour trouver tous les hashtags, même collés
        found_tags = re.findall(r'#(\w+)', raw_text)
        for tag in found_tags:
            hashtags.add(tag.lower())
        
        if hashtags:
            print(f"  -> Trouvé {len(hashtags)} hashtags pour '{category_title}'")
            scraped_data.append({
                "category": category_title,
                "hashtags": sorted(list(hashtags))
            })
    
    # Sauvegarde des données brutes
    output_filename = "predis_ai_raw.json"
    with open(output_filename, 'w', encoding='utf-8') as f:
        json.dump(scraped_data, f, ensure_ascii=False, indent=2)
    
    print(f"\n✅ Données brutes sauvegardées dans '{output_filename}'")

if __name__ == "__main__":
    scrape_predis_ai_complet()