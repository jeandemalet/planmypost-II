import requests
from bs4 import BeautifulSoup
import json
import re
import time
import random

def scrape_predis_complet():
    """Scraping ultra-complet de Predis.ai avec exploration approfondie."""
    
    url = "https://predis.ai/fr/ressources/hashtag-de-photographie/"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive'
    }
    
    print(f"🚀 Scraping ultra-complet de : {url}")
    
    try:
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        print("✅ Page téléchargée avec succès")
    except requests.exceptions.RequestException as e:
        print(f"❌ Erreur HTTP : {e}")
        return
    
    soup = BeautifulSoup(response.content, 'html.parser')
    scraped_data = []
    
    print("🔍 Analyse approfondie du contenu...")
    
    # 1. Extraction par titres et sections
    print("📝 Extraction par titres et sections...")
    headers_found = soup.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
    
    for header in headers_found:
        category_title = header.get_text(strip=True)
        
        # Nettoyer le titre
        clean_title = re.sub(r'^\d+\.\s*', '', category_title).strip()
        clean_title = re.sub(r'hashtags?\s*', '', clean_title, flags=re.IGNORECASE).strip()
        
        if len(clean_title) < 3:
            continue
        
        hashtags = set()
        
        # Chercher dans tous les éléments suivants jusqu'au prochain header
        current = header.find_next_sibling()
        while current and current.name not in ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']:
            text_content = current.get_text(" ", strip=True)
            
            # Extraire les hashtags avec plusieurs patterns
            patterns = [
                r'#(\w+)',
                r'#([a-zA-Z0-9_]+)',
                r'(?:^|\s)#([^\s#,]+)',
                r'@(\w+)',  # Parfois les hashtags sont avec @
            ]
            
            for pattern in patterns:
                found_tags = re.findall(pattern, text_content, re.IGNORECASE)
                for tag in found_tags:
                    clean_tag = re.sub(r'[^\w]', '', tag.lower())
                    if len(clean_tag) >= 2 and clean_tag.isalnum():
                        hashtags.add(clean_tag)
            
            # Aussi chercher dans les attributs et liens
            for element in current.find_all(['a', 'span', 'strong', 'em', 'code']):
                element_text = element.get_text(strip=True)
                for pattern in patterns:
                    found_tags = re.findall(pattern, element_text, re.IGNORECASE)
                    for tag in found_tags:
                        clean_tag = re.sub(r'[^\w]', '', tag.lower())
                        if len(clean_tag) >= 2 and clean_tag.isalnum():
                            hashtags.add(clean_tag)
            
            current = current.find_next_sibling()
        
        if hashtags:
            print(f"  ✅ {clean_title}: {len(hashtags)} hashtags")
            scraped_data.append({
                "category": clean_title,
                "hashtags": sorted(list(hashtags))
            })
    
    # 2. Extraction par listes (ul, ol)
    print("📋 Extraction par listes...")
    lists = soup.find_all(['ul', 'ol'])
    
    for i, list_element in enumerate(lists):
        hashtags = set()
        
        for li in list_element.find_all('li'):
            text_content = li.get_text(" ", strip=True)
            
            # Extraire hashtags
            found_tags = re.findall(r'#(\w+)', text_content, re.IGNORECASE)
            for tag in found_tags:
                clean_tag = re.sub(r'[^\w]', '', tag.lower())
                if len(clean_tag) >= 2:
                    hashtags.add(clean_tag)
            
            # Aussi extraire les mots qui ressemblent à des hashtags
            words = text_content.split()
            for word in words:
                if word.startswith('#'):
                    clean_tag = re.sub(r'[^\w]', '', word[1:].lower())
                    if len(clean_tag) >= 2:
                        hashtags.add(clean_tag)
        
        if hashtags and len(hashtags) >= 3:
            # Trouver un titre pour cette liste
            title = f"Liste hashtags {i+1}"
            prev_element = list_element.find_previous(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p'])
            if prev_element:
                potential_title = prev_element.get_text(strip=True)
                if len(potential_title) < 100:
                    title = potential_title
            
            print(f"  ✅ {title}: {len(hashtags)} hashtags")
            scraped_data.append({
                "category": title,
                "hashtags": sorted(list(hashtags))
            })
    
    # 3. Extraction par paragraphes riches
    print("📄 Extraction par paragraphes...")
    paragraphs = soup.find_all('p')
    
    for p in paragraphs:
        text_content = p.get_text(" ", strip=True)
        hashtags = set()
        
        # Chercher tous les hashtags dans le paragraphe
        found_tags = re.findall(r'#(\w+)', text_content, re.IGNORECASE)
        for tag in found_tags:
            clean_tag = re.sub(r'[^\w]', '', tag.lower())
            if len(clean_tag) >= 2:
                hashtags.add(clean_tag)
        
        # Ne garder que les paragraphes avec beaucoup de hashtags
        if len(hashtags) >= 5:
            title = "Paragraphe hashtags"
            prev_header = p.find_previous(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
            if prev_header:
                title = prev_header.get_text(strip=True)[:50]
            
            print(f"  ✅ {title}: {len(hashtags)} hashtags")
            scraped_data.append({
                "category": title,
                "hashtags": sorted(list(hashtags))
            })
    
    # 4. Extraction par tableaux
    print("📊 Extraction par tableaux...")
    tables = soup.find_all('table')
    
    for i, table in enumerate(tables):
        hashtags = set()
        
        for cell in table.find_all(['td', 'th']):
            text_content = cell.get_text(" ", strip=True)
            found_tags = re.findall(r'#(\w+)', text_content, re.IGNORECASE)
            for tag in found_tags:
                clean_tag = re.sub(r'[^\w]', '', tag.lower())
                if len(clean_tag) >= 2:
                    hashtags.add(clean_tag)
        
        if hashtags:
            print(f"  ✅ Tableau {i+1}: {len(hashtags)} hashtags")
            scraped_data.append({
                "category": f"Tableau {i+1}",
                "hashtags": sorted(list(hashtags))
            })
    
    # 5. Extraction par divs et sections avec classes spécifiques
    print("🎯 Extraction par sections spécialisées...")
    
    # Chercher des divs avec des classes qui pourraient contenir des hashtags
    content_divs = soup.find_all('div', class_=re.compile(r'content|post|article|hashtag|tag', re.I))
    
    for i, div in enumerate(content_divs):
        text_content = div.get_text(" ", strip=True)
        hashtags = set()
        
        found_tags = re.findall(r'#(\w+)', text_content, re.IGNORECASE)
        for tag in found_tags:
            clean_tag = re.sub(r'[^\w]', '', tag.lower())
            if len(clean_tag) >= 2:
                hashtags.add(clean_tag)
        
        if len(hashtags) >= 3:
            title = f"Section {i+1}"
            header = div.find(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
            if header:
                title = header.get_text(strip=True)[:50]
            
            print(f"  ✅ {title}: {len(hashtags)} hashtags")
            scraped_data.append({
                "category": title,
                "hashtags": sorted(list(hashtags))
            })
    
    # 6. Extraction globale de tout le texte
    print("🌐 Extraction globale...")
    all_text = soup.get_text(" ", strip=True)
    all_hashtags = set()
    
    found_tags = re.findall(r'#(\w+)', all_text, re.IGNORECASE)
    for tag in found_tags:
        clean_tag = re.sub(r'[^\w]', '', tag.lower())
        if len(clean_tag) >= 2 and len(clean_tag) <= 30:  # Hashtags raisonnables
            all_hashtags.add(clean_tag)
    
    if all_hashtags:
        print(f"  ✅ Extraction globale: {len(all_hashtags)} hashtags uniques")
        scraped_data.append({
            "category": "Hashtags globaux",
            "hashtags": sorted(list(all_hashtags))
        })
    
    # Déduplication et fusion
    print("🔄 Déduplication et fusion...")
    merged_data = {}
    
    for item in scraped_data:
        category_key = item['category'].lower().strip()
        category_key = re.sub(r'hashtags?', '', category_key, flags=re.IGNORECASE).strip()
        category_key = re.sub(r'^\d+\.\s*', '', category_key).strip()
        
        if category_key in merged_data:
            # Fusionner les hashtags
            existing = set(merged_data[category_key]['hashtags'])
            new_tags = set(item['hashtags'])
            merged_data[category_key]['hashtags'] = sorted(list(existing | new_tags))
        else:
            merged_data[category_key] = item
    
    final_data = list(merged_data.values())
    
    # Statistiques
    total_hashtags = sum(len(item['hashtags']) for item in final_data)
    unique_hashtags = len(set().union(*[item['hashtags'] for item in final_data]))
    
    print(f"\n📊 Statistiques finales:")
    print(f"   • {len(final_data)} catégories trouvées")
    print(f"   • {total_hashtags} hashtags au total")
    print(f"   • {unique_hashtags} hashtags uniques")
    
    # Sauvegarde
    output_filename = "predis_ai_complet.json"
    output_data = {
        "metadata": {
            "scraping_date": time.strftime("%Y-%m-%d %H:%M:%S"),
            "source_url": url,
            "total_categories": len(final_data),
            "total_hashtags": total_hashtags,
            "unique_hashtags": unique_hashtags
        },
        "categories": final_data
    }
    
    with open(output_filename, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)
    
    print(f"\n✅ Données sauvegardées dans '{output_filename}'")
    return output_filename

if __name__ == "__main__":
    scrape_predis_complet()