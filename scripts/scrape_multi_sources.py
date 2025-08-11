import requests
from bs4 import BeautifulSoup
import json
import re
import time
import random

class MultiSourceHashtagScraper:
    def __init__(self):
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
        }
        self.scraped_data = []
    
    def get_page_safely(self, url, timeout=30):
        """Récupère une page web de manière sécurisée."""
        try:
            time.sleep(random.uniform(1, 3))  # Délai pour éviter le spam
            response = requests.get(url, headers=self.headers, timeout=timeout)
            response.raise_for_status()
            return response
        except Exception as e:
            print(f"⚠️ Erreur pour {url}: {e}")
            return None
    
    def extract_hashtags_from_text(self, text):
        """Extrait les hashtags d'un texte."""
        hashtags = set()
        
        # Patterns pour différents formats de hashtags
        patterns = [
            r'#([a-zA-Z][a-zA-Z0-9_]{1,29})',  # Format standard
            r'#([a-zA-Z0-9_]+)',
            r'(?:^|\s)#([^\s#,\.!?]+)',
        ]
        
        for pattern in patterns:
            found = re.findall(pattern, text, re.IGNORECASE | re.MULTILINE)
            for tag in found:
                clean_tag = re.sub(r'[^\w]', '', tag.lower())
                if 2 <= len(clean_tag) <= 30 and clean_tag.isalnum():
                    hashtags.add(clean_tag)
        
        return list(hashtags)
    
    def scrape_hashtagify(self):
        """Scrape Hashtagify.me pour les hashtags de photographie."""
        print("📸 Scraping Hashtagify.me...")
        
        # Différentes catégories de photographie
        photo_categories = [
            'photography', 'portrait', 'landscape', 'wedding', 'fashion', 
            'travel', 'nature', 'street', 'macro', 'blackandwhite'
        ]
        
        for category in photo_categories:
            url = f"https://hashtagify.me/hashtag/{category}"
            response = self.get_page_safely(url)
            
            if response:
                soup = BeautifulSoup(response.content, 'html.parser')
                hashtags = set()
                
                # Chercher dans tous les éléments de texte
                for element in soup.find_all(['span', 'div', 'p', 'a']):
                    text = element.get_text(strip=True)
                    if '#' in text:
                        found_hashtags = self.extract_hashtags_from_text(text)
                        hashtags.update(found_hashtags)
                
                if hashtags:
                    print(f"  ✅ {category}: {len(hashtags)} hashtags")
                    self.scraped_data.append({
                        "category": f"Photographie {category}",
                        "hashtags": sorted(list(hashtags)),
                        "source": "hashtagify.me"
                    })
    
    def scrape_all_hashtag(self):
        """Scrape All-Hashtag.com pour les hashtags de photographie."""
        print("🏷️ Scraping All-Hashtag.com...")
        
        categories = [
            'photography', 'photo', 'portrait', 'wedding', 'travel', 
            'fashion', 'nature', 'landscape', 'art', 'beauty'
        ]
        
        for category in categories:
            url = f"https://www.all-hashtag.com/hashtag-generator.php"
            
            # Simuler une recherche
            data = {'keyword': category}
            
            try:
                response = requests.post(url, data=data, headers=self.headers, timeout=30)
                if response.status_code == 200:
                    soup = BeautifulSoup(response.content, 'html.parser')
                    hashtags = set()
                    
                    # Chercher les hashtags dans la réponse
                    text_content = soup.get_text()
                    found_hashtags = self.extract_hashtags_from_text(text_content)
                    hashtags.update(found_hashtags)
                    
                    if hashtags:
                        print(f"  ✅ {category}: {len(hashtags)} hashtags")
                        self.scraped_data.append({
                            "category": f"All-Hashtag {category}",
                            "hashtags": sorted(list(hashtags)),
                            "source": "all-hashtag.com"
                        })
                        
                time.sleep(2)  # Délai entre les requêtes
                
            except Exception as e:
                print(f"  ⚠️ Erreur pour {category}: {e}")
    
    def scrape_ritetag(self):
        """Scrape RiteTag pour les hashtags."""
        print("🎯 Scraping RiteTag...")
        
        url = "https://ritetag.com/best-hashtags-for/photography"
        response = self.get_page_safely(url)
        
        if response:
            soup = BeautifulSoup(response.content, 'html.parser')
            hashtags = set()
            
            # Chercher dans tous les éléments
            for element in soup.find_all(['span', 'div', 'p', 'li']):
                text = element.get_text(strip=True)
                if '#' in text:
                    found_hashtags = self.extract_hashtags_from_text(text)
                    hashtags.update(found_hashtags)
            
            if hashtags:
                print(f"  ✅ RiteTag photography: {len(hashtags)} hashtags")
                self.scraped_data.append({
                    "category": "RiteTag Photography",
                    "hashtags": sorted(list(hashtags)),
                    "source": "ritetag.com"
                })
    
    def create_comprehensive_database(self):
        """Crée une base de données complète avec des hashtags connus."""
        print("📚 Création de la base de données complète...")
        
        # Base de données manuelle de hashtags de photographie par catégorie
        manual_database = {
            "Photographie de mariage": [
                "wedding", "bride", "groom", "weddingday", "weddingphotography", "bridal", 
                "weddingdress", "ceremony", "reception", "love", "marriage", "weddingring",
                "weddingcake", "weddingflowers", "weddingvenue", "weddingparty", "bridesmaids",
                "groomsmen", "weddingplanner", "weddingdecor", "engagement", "proposal",
                "honeymoon", "justmarried", "happilyeverafter", "weddinginspo", "brideandgroom",
                "weddingmoments", "weddingmemories", "weddingbliss", "weddingmagic"
            ],
            
            "Photographie de portrait": [
                "portrait", "portraitphotography", "headshot", "model", "fashion", "beauty",
                "studio", "naturallight", "blackandwhite", "selfie", "face", "eyes", "smile",
                "expression", "mood", "character", "personality", "professional", "artistic",
                "creative", "portraitmode", "bokeh", "depthoffield", "lighting", "shadows",
                "highlights", "composition", "framing", "closeup", "environmental"
            ],
            
            "Photographie de voyage": [
                "travel", "travelphotography", "wanderlust", "explore", "adventure", "vacation",
                "holiday", "destination", "landscape", "nature", "culture", "architecture",
                "street", "local", "journey", "discover", "backpacking", "roadtrip", "tourism",
                "memories", "wanderer", "globetrotter", "nomad", "expedition", "voyage",
                "travelgram", "instatravel", "worldtraveler", "exploring", "adventures"
            ],
            
            "Photographie de mode": [
                "fashion", "fashionphotography", "style", "model", "runway", "designer",
                "clothing", "outfit", "trendy", "chic", "elegant", "glamour", "haute",
                "couture", "editorial", "magazine", "brand", "luxury", "accessories", "beauty",
                "fashionista", "stylish", "fashionweek", "fashionshow", "fashionmodel",
                "fashionblogger", "fashiondesigner", "fashiontrends", "fashionable", "fashionstyle"
            ],
            
            "Photographie noir et blanc": [
                "blackandwhite", "bnw", "monochrome", "noir", "blanc", "contrast", "shadow",
                "light", "artistic", "classic", "timeless", "vintage", "dramatic", "moody",
                "fine", "art", "minimalist", "abstract", "texture", "composition", "bnwphotography",
                "blackandwhitephotography", "monotone", "grayscale", "chiaroscuro", "silhouette",
                "highcontrast", "lowkey", "blackandwhiteart", "bnwmood"
            ],
            
            "Photographie de paysage": [
                "landscape", "landscapephotography", "nature", "scenery", "mountains", "forest",
                "ocean", "sunset", "sunrise", "sky", "clouds", "trees", "river", "lake",
                "wilderness", "outdoor", "hiking", "camping", "peaceful", "serene", "vista",
                "panorama", "horizon", "naturalbeauty", "earthpix", "landscapelovers",
                "naturephotography", "outdoorphotography", "scenic", "breathtaking"
            ],
            
            "Photographie de studio": [
                "studio", "studiophotography", "lighting", "backdrop", "professional", "portrait",
                "fashion", "product", "commercial", "setup", "equipment", "flash", "softbox",
                "umbrella", "reflector", "controlled", "indoor", "clean", "minimal", "artistic",
                "studiosetup", "studiolighting", "studiowork", "studiosession", "studiolife",
                "professionalphotography", "commercialphotography", "productphotography",
                "studioportrait", "studioequipment"
            ],
            
            "Photographie de rue": [
                "street", "streetphotography", "urban", "city", "candid", "documentary", "life",
                "people", "culture", "society", "moments", "spontaneous", "authentic", "real",
                "everyday", "streetlife", "urbanexploration", "citylife", "streetart", "architecture",
                "streetstyle", "streetscene", "urbanphotography", "streetphoto", "streetview",
                "streetmoments", "streetculture", "streetportrait", "streetwalk", "streetcapture"
            ],
            
            "Photographie macro": [
                "macro", "macrophotography", "closeup", "detail", "nature", "insects", "flowers",
                "texture", "patterns", "small", "magnified", "microscopic", "tiny", "intricate",
                "delicate", "precision", "focus", "depthoffield", "macrolens", "macroworld",
                "macronature", "macrolife", "macroart", "macroshot", "macrodetail", "macrobeauty",
                "macroinsects", "macroflowers", "macrotexture", "macropatterns"
            ],
            
            "Photographie animalière": [
                "wildlife", "wildlifephotography", "animals", "nature", "safari", "birds",
                "mammals", "conservation", "endangered", "habitat", "wild", "natural", "behavior",
                "migration", "predator", "prey", "ecosystem", "biodiversity", "species", "fauna",
                "wildlifeconservation", "animalplanet", "wildlifeart", "wildlifelovers",
                "wildlifecapture", "wildlifeshots", "wildlifemoments", "wildlifebeauty",
                "wildlifeworld", "wildlifeadventure"
            ],
            
            "Photographie culinaire": [
                "food", "foodphotography", "culinary", "cuisine", "recipe", "cooking", "chef",
                "restaurant", "delicious", "tasty", "gourmet", "foodie", "foodart", "plating",
                "ingredients", "foodstyling", "foodblogger", "foodlover", "foodgram", "instafood",
                "foodporn", "foodstagram", "foodpics", "foodphoto", "foodshot", "foodcapture",
                "foodstylist", "foodpresentation", "foodculture", "foodtrends"
            ],
            
            "Photographie d'architecture": [
                "architecture", "architecturephotography", "building", "design", "structure",
                "modern", "contemporary", "historic", "urban", "city", "skyline", "facade",
                "geometric", "lines", "patterns", "perspective", "symmetry", "minimalist",
                "brutalist", "classical", "architecturaldetail", "architecturaldesign",
                "architecturalart", "architecturalbeauty", "architecturalheritage",
                "architecturalstyle", "architecturallove", "architecturalwonders",
                "architecturalgeometry", "architecturalphotographer"
            ],
            
            "Photographie de sport": [
                "sport", "sportsphotography", "action", "athlete", "competition", "game",
                "team", "victory", "championship", "training", "fitness", "movement", "speed",
                "power", "strength", "dedication", "passion", "performance", "sportsaction",
                "sportsmedia", "sportslife", "sportsmoments", "sportscapture", "sportsworld",
                "sportsart", "sportsphoto", "sportsshot", "sportsphotographer", "sportsculture"
            ],
            
            "Photographie événementielle": [
                "event", "eventphotography", "celebration", "party", "conference", "corporate",
                "social", "gathering", "ceremony", "festival", "concert", "performance",
                "entertainment", "networking", "business", "professional", "candid", "moments",
                "eventplanning", "eventlife", "eventcapture", "eventmoments", "eventmemories",
                "eventdocumentation", "eventcoverage", "eventphoto", "eventshot", "eventwork"
            ]
        }
        
        for category, hashtags in manual_database.items():
            print(f"  ✅ {category}: {len(hashtags)} hashtags")
            self.scraped_data.append({
                "category": category,
                "hashtags": hashtags,
                "source": "base_manuelle"
            })
    
    def save_comprehensive_data(self, filename="hashtags_complet_multi_sources.json"):
        """Sauvegarde toutes les données collectées."""
        
        # Déduplication par catégorie
        merged_data = {}
        
        for item in self.scraped_data:
            category_key = item['category'].lower().strip()
            
            if category_key in merged_data:
                # Fusionner les hashtags
                existing = set(merged_data[category_key]['hashtags'])
                new_tags = set(item['hashtags'])
                merged_data[category_key]['hashtags'] = sorted(list(existing | new_tags))
                merged_data[category_key]['sources'] = merged_data[category_key].get('sources', []) + [item['source']]
            else:
                merged_data[category_key] = {
                    'category': item['category'],
                    'hashtags': item['hashtags'],
                    'sources': [item['source']]
                }
        
        final_data = list(merged_data.values())
        
        # Statistiques
        total_hashtags = sum(len(item['hashtags']) for item in final_data)
        unique_hashtags = len(set().union(*[item['hashtags'] for item in final_data]))
        
        output_data = {
            "metadata": {
                "scraping_date": time.strftime("%Y-%m-%d %H:%M:%S"),
                "total_categories": len(final_data),
                "total_hashtags": total_hashtags,
                "unique_hashtags": unique_hashtags,
                "sources": ["hashtagify.me", "all-hashtag.com", "ritetag.com", "base_manuelle"]
            },
            "categories": final_data
        }
        
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, ensure_ascii=False, indent=2)
        
        print(f"\n📊 Statistiques finales:")
        print(f"   • {len(final_data)} catégories")
        print(f"   • {total_hashtags} hashtags au total")
        print(f"   • {unique_hashtags} hashtags uniques")
        print(f"\n✅ Données sauvegardées dans '{filename}'")
        
        return filename

def main():
    """Fonction principale de scraping multi-sources."""
    print("🚀 Démarrage du scraping multi-sources de hashtags de photographie")
    
    scraper = MultiSourceHashtagScraper()
    
    try:
        # Créer la base de données complète (rapide et fiable)
        scraper.create_comprehensive_database()
        
        # Tentatives de scraping externe (optionnel)
        try:
            scraper.scrape_hashtagify()
        except Exception as e:
            print(f"⚠️ Erreur Hashtagify: {e}")
        
        try:
            scraper.scrape_ritetag()
        except Exception as e:
            print(f"⚠️ Erreur RiteTag: {e}")
        
        # Sauvegarder toutes les données
        filename = scraper.save_comprehensive_data()
        
        print("🎉 Scraping multi-sources terminé avec succès!")
        return filename
        
    except Exception as e:
        print(f"❌ Erreur lors du scraping: {e}")
        raise

if __name__ == "__main__":
    main()