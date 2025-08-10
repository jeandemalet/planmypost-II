# Description Commune - Documentation Complète

## Vue d'ensemble

Cette fonctionnalité ajoute une "Description Commune" au niveau de chaque galerie, permettant de définir un texte de base qui peut être utilisé comme point de départ pour tous les jours de la galerie. L'implémentation utilise un éditeur riche avec des zones d'édition délimitées et une gestion intelligente du focus.

## Architecture Technique

### 1. Modèle de Données (models/Gallery.js)
- ✅ Ajout du champ `commonDescriptionText` au schéma Gallery
- Type: String, valeur par défaut: chaîne vide

### 2. Backend (controllers/galleryController.js)
- ✅ Modification de `getGalleryDetails()` pour inclure `commonDescriptionText` dans la sélection des champs
- ✅ La fonction `updateGalleryState()` fonctionne déjà pour sauvegarder ce nouveau champ

### 3. Frontend HTML (public/index.html)
- ✅ Remplacement du `<textarea>` par un `<div contenteditable="true"`
- ✅ Structure avec zones avant/après le bloc commun
- ✅ Attributs d'accessibilité et placeholder

### 4. Frontend CSS (public/style.css)
- ✅ Style `.custom-editor` pour l'éditeur principal avec bordure noire permanente
- ✅ Style `.common-text-block` pour les blocs protégés
- ✅ Zones d'édition délimitées avec `.editable-zone`
- ✅ Gestion du focus avec `:focus` et `:focus-within`

### 5. Frontend JavaScript (public/script.js)
- ✅ Refactorisation complète de la classe `DescriptionManager`
- ✅ Gestion intelligente des attributs `contenteditable`
- ✅ Système de marqueurs `{{COMMON_TEXT}}`
- ✅ Sauvegarde immédiate lors des changements de contexte

## Fonctionnalités

### Description Commune
- Accessible via l'onglet "Description Commune" en haut de la liste
- Se sauvegarde automatiquement au niveau de la galerie
- Sert de modèle pour tous les jours de la galerie

### Éditeur Riche
- **Éditeur ContentEditable** : Permet l'insertion d'éléments HTML
- **Bloc de Texte Commun Protégé** : Affiché avec style distinct, non modifiable
- **Zones d'Édition Délimitées** : Contours permanents pour les zones d'écriture
- **États Interactifs** : Hover et focus avec feedback visuel

### Pré-remplissage Intelligent
- Quand vous cliquez sur un jour spécifique (ex: "Jour A")
- Si ce jour n'a pas encore de description personnalisée
- L'éditeur se remplit automatiquement avec le texte de la description commune
- Mise à jour en temps réel pendant la frappe

## Interface Utilisateur

### Mode "Description Commune"
- Éditeur simple en texte brut
- Bordure noire permanente de l'éditeur principal
- Édition libre du texte de base

### Mode "Jour Spécifique"

#### Jour vide
```
┌─────────────────────────────────────┐
│ Ajoutez votre texte personnalisé... │
│                                     │
│ 📝 Texte commun: [description]     │
│                                     │
│ Ajoutez votre texte personnalisé... │
└─────────────────────────────────────┘
```

#### Jour avec description existante
- Affiche le texte personnalisé + bloc commun à la position sauvegardée
- Recherche le marqueur `{{COMMON_TEXT}}` et le remplace par le bloc protégé

## Styles CSS

### Éditeur Principal
```css
.custom-editor {
    border: 2px solid #121821; /* Bordure noire permanente */
    border-radius: 8px; /* Coins arrondis */
    padding: 10px;
    outline: none; /* Pas de changement au focus */
}
```

### Zones d'Édition
```css
.editable-zone {
    min-height: 24px;
    padding: 4px 6px;
    margin: 4px 0;
    outline: none; /* Zones invisibles, intégrées dans l'éditeur principal */
}
```

### Bloc Commun Protégé
```css
.common-text-block {
    background-color: #f0f2f5;
    color: #555;
    padding: 8px;
    border: 1px dashed #ced4da;
    border-radius: 4px;
    cursor: not-allowed;
    user-select: none;
    font-style: italic;
}

.common-text-block:before {
    content: "📝 Texte commun: ";
    font-weight: bold;
    font-size: 0.9em;
}
```

## Logique JavaScript

### Gestion du ContentEditable
```javascript
// Mode "Description Commune"
this.editorElement.contentEditable = true; // Parent éditable

// Mode "Jour avec contenu"
this.editorElement.contentEditable = true; // Parent éditable

// Mode "Jour vide" (zones structurées)
this.editorElement.contentEditable = false; // Parent non éditable
// Les enfants .editable-zone restent éditables
```

### Extraction du Texte
```javascript
_extractTextFromEditor() {
    const beforeZone = tempDiv.querySelector('.editable-zone[data-zone="before"]');
    const afterZone = tempDiv.querySelector('.editable-zone[data-zone="after"]');
    
    if (beforeZone && afterZone) {
        const beforeText = beforeZone.innerText.trim();
        const afterText = afterZone.innerText.trim();
        
        let result = '';
        if (beforeText) result += beforeText + '\n';
        result += '{{COMMON_TEXT}}';
        if (afterText) result += '\n' + afterText;
        
        return result;
    }
}
```

### Système de Marqueurs
- Utilise `{{COMMON_TEXT}}` comme marqueur dans les données sauvegardées
- Conversion automatique marqueur ↔ bloc HTML lors de l'affichage/sauvegarde
- Permet de positionner le texte commun n'importe où dans la description

## Comportement de Sauvegarde

### Sauvegarde Immédiate
- **Changement de contexte** : Quand vous passez de "Description Commune" à un jour spécifique
- **Changement de jour** : Quand vous passez d'un jour à un autre
- **Changement d'onglet** : Quand vous quittez l'onglet Description

### Sauvegarde Automatique
- **Pendant la frappe** : Sauvegarde automatique après 1,5 seconde d'inactivité
- **Optimisation anti-doublon** : Les sauvegardes debounce en attente sont annulées lors des sauvegardes immédiates
- **Gestion d'erreur robuste** : La variable locale n'est mise à jour qu'après succès de la sauvegarde

### Fonction Debounce Améliorée
```javascript
static debounce(func, delay) {
    let timeout;
    const debouncedFunction = function (...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
    
    // Méthode cancel pour annuler les appels en attente
    debouncedFunction.cancel = function() {
        clearTimeout(timeout);
        timeout = null;
    };
    
    return debouncedFunction;
}
```

## Corrections Techniques

### Problème de Focus Résolu
**Problème** : Conflit entre éléments `contenteditable` imbriqués empêchait le focus correct.

**Solution** : Gestion intelligente des attributs `contenteditable` :
- Parent éditable pour description commune et jours avec contenu
- Parent non éditable pour jours vides avec zones structurées
- CSS avec `:focus-within` pour détecter le focus sur les enfants

### Pré-remplissage Dynamique
**Problème** : Le pré-remplissage ne se mettait à jour qu'après la sauvegarde debounce.

**Solution** : Mise à jour immédiate des variables JavaScript lors de la frappe :
```javascript
this.descriptionTextElement.addEventListener('input', () => {
    if (this.isEditingCommon) {
        // 1. Mettre à jour immédiatement
        this.commonDescriptionText = this.editorElement.innerText;
        // 2. Planifier la sauvegarde
        this.debouncedSaveCommon();
    }
});
```

## Utilisation

### 1. Définir une description commune
- Cliquez sur "Description Commune"
- Tapez votre texte de base
- Il se sauvegarde automatiquement

### 2. Personnaliser un jour spécifique
- Cliquez sur un jour (ex: "Jour A")
- Le texte se pré-remplit avec la description commune
- Modifiez selon vos besoins dans les zones délimitées
- La modification est sauvegardée pour ce jour uniquement

## Avantages

### Expérience Utilisateur
- ✅ **Visibilité maximale** : Toutes les zones d'écriture sont clairement identifiées
- ✅ **Guidage intuitif** : L'utilisateur sait exactement où il peut taper
- ✅ **Feedback visuel** : États hover/focus pour une interaction fluide
- ✅ **Structure claire** : Séparation visuelle entre zones personnalisées et texte commun
- ✅ **Aucune perte de données** : Sauvegarde immédiate et robuste

### Technique
- ✅ **Compatibilité** : Fonctionne avec les descriptions existantes
- ✅ **Flexibilité** : Zones avant/après indépendantes
- ✅ **Robustesse** : Extraction de texte intelligente et gestion d'erreur
- ✅ **Performance** : Transitions CSS fluides et optimisations anti-doublon
- ✅ **Sécurité** : Échappement HTML et protection contre l'injection

Cette implémentation transforme l'éditeur de description en un outil professionnel avec une expérience utilisateur exceptionnelle, accélérant considérablement le processus de rédaction tout en maintenant la flexibilité de personnalisation.#
# Mise à Jour : Style Simplifié

### Changements Appliqués
- **Bordure permanente** : Contour noir constant, aucun changement au focus
- **Interface sobre** : Suppression des effets visuels de focus (bleu, halo)
- **Zones invisibles** : Les zones d'édition n'ont plus de bordures visibles
- **Intégration fluide** : L'utilisateur tape dans un grand champ uniforme

### Avantages du Style Simplifié
- ✅ **Sobriété** : Interface plus épurée et professionnelle
- ✅ **Simplicité** : Aucune distraction visuelle lors de l'édition
- ✅ **Clarté** : Focus sur le contenu plutôt que sur l'interface
- ✅ **Cohérence** : Style uniforme sans changements d'état

L'éditeur conserve toutes ses fonctionnalités avancées tout en offrant une expérience visuelle plus sobre et élégante.## Correct
ion Finale : Focus Robuste avec Conteneur Parent

### Solution Technique Appliquée
- **Bordure sur conteneur parent** : `.description-fields` porte la bordure noire
- **Focus-within CSS** : Détection du focus sur enfants avec `:focus-within`
- **Sauts de ligne par défaut** : `<br>` dans les zones d'édition pour faciliter la saisie
- **Gestion contenteditable intelligente** : Parent non-éditable pour jours vides

### Code CSS Final
```css
.description-fields {
    border: 2px solid #121821; /* Bordure sur conteneur */
    border-radius: 8px;
    padding: 10px;
    background-color: white;
}

.description-fields:focus-within {
    border-color: #007bff; /* Focus détecté sur enfants */
    box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.25);
}

.custom-editor {
    outline: none; /* Pas de bordure propre */
    /* Plus de border sur l'éditeur lui-même */
}
```

### Avantages de cette Approche
- ✅ **Focus fiable** : Fonctionne parfaitement avec éléments contenteditable imbriqués
- ✅ **Feedback visuel cohérent** : Bordure bleue garantie dans tous les cas
- ✅ **Espacement optimal** : Sauts de ligne par défaut pour faciliter la saisie
- ✅ **Architecture propre** : Séparation claire des responsabilités CSS
- ✅ **Robustesse** : Aucun conflit de focus possible

Cette solution résout définitivement tous les problèmes de focus et offre une expérience utilisateur parfaite.## Nouv
elle Fonctionnalité : Boutons de Raccourcis

### Vue d'ensemble
Ajout de boutons de raccourcis sous l'éditeur de description pour insérer rapidement des éléments courants utilisés dans les publications.

### Boutons Disponibles

#### Colonne 1 - Rôles avec options masculin/féminin
- **📸 Photographe / Photographe (f)** : Options genrées
- **✨ Assistant / Assistante** : Options genrées  
- **💄 Maquilleur / Maquilleuse** : Options genrées
- **✂️ Coiffeur / Coiffeuse** : Options genrées
- **🎨 DA / DA (f)** : Directeur/Directrice artistique

#### Colonne 2 - Éléments généraux
- **📍 Lieu** : Localisation du shooting
- **💃 Sujet(s)** : Personnes photographiées
- **🧵 Couturier/ère(s)** : Créateurs des vêtements
- **👠 Stylisme** : Responsable du style
- **💡 Éclairage** : Technicien lumière

### Fonctionnement Intelligent
1. **Ajout à la fin** : Le texte est ajouté à la fin du contenu existant
2. **Saut de ligne automatique** : Ajoute un retour à la ligne si nécessaire
3. **Désactivation intelligente** : Les boutons se désactivent si le mot-clé est déjà présent
4. **Sauvegarde automatique** : Déclenche la sauvegarde automatique
5. **Interface en colonnes** : Organisation claire avec options masculin/féminin

### Implémentation Technique

#### HTML (public/index.html)
```html
<div id="descriptionShortcuts" class="description-shortcuts">
    <button data-snippet="📸 Photographe : ">📸 Photographe</button>
    <button data-snippet="📍 Lieu : ">📍 Lieu</button>
    <!-- ... autres boutons ... -->
</div>
```

#### CSS (public/style.css)
```css
.description-shortcuts {
    display: none; /* Caché par défaut */
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 15px;
    border-top: 1px solid #e9ecef;
}

.description-shortcuts button {
    background-color: #f0f2f5;
    border: 1px solid #ced4da;
    border-radius: 15px; /* Forme de pilule */
    padding: 6px 12px;
    cursor: pointer;
}
```

#### JavaScript (public/script.js)
```javascript
// Méthode d'insertion de texte
_insertSnippet(snippet) {
    this.editorElement.focus();
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);
    
    const textNode = document.createTextNode(snippet);
    range.insertNode(textNode);
    
    // Positionner le curseur après le texte
    range.setStartAfter(textNode);
    selection.addRange(range);
    
    // Déclencher la sauvegarde automatique
    this.editorElement.dispatchEvent(new Event('input', { bubbles: true }));
}
```

### Avantages
- ✅ **Efficacité** : Insertion rapide d'éléments récurrents
- ✅ **Cohérence** : Format uniforme des publications
- ✅ **Ergonomie** : Boutons visuels avec emojis
- ✅ **Intégration** : Fonctionne avec la sauvegarde automatique
- ✅ **Flexibilité** : Insertion à n'importe quelle position

Cette fonctionnalité accélère considérablement la rédaction des descriptions en évitant la saisie répétitive des éléments courants.##
 Mise à Jour : Interface de Raccourcis Avancée

### Nouvelles Fonctionnalités

#### Organisation en Colonnes
- **Colonne 1** : Rôles avec options masculin/féminin groupées
- **Colonne 2** : Éléments généraux et techniques
- **Mise en page** : Utilisation optimale de l'espace horizontal

#### Gestion Intelligente
- **Désactivation automatique** : Les boutons se grisent quand le mot-clé est déjà utilisé
- **Ajout à la fin** : Insertion systématique à la fin du texte existant
- **Saut de ligne intelligent** : Ajoute automatiquement un retour à la ligne si nécessaire

#### Options Genrées
- **Photographe / Photographe (f)** : Respect de l'identité de genre
- **Assistant / Assistante** : Options complètes
- **Maquilleur / Maquilleuse** : Terminologie appropriée
- **Coiffeur / Coiffeuse** : Choix professionnel
- **DA / DA (f)** : Directeur/Directrice artistique

### Code CSS Avancé
```css
.shortcut-column {
    display: flex;
    flex-direction: column;
    gap: 10px;
    flex: 1;
}

.shortcut-group {
    display: flex;
    gap: 10px;
}

.shortcut-group button {
    flex: 1; /* Boutons de même taille dans un groupe */
}

.description-shortcuts button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background-color: #e9ecef;
}
```

### Logique JavaScript Améliorée
```javascript
_updateShortcutButtonsState() {
    const currentText = this.editorElement.innerText;
    const allButtons = this.shortcutsContainer.querySelectorAll('button[data-snippet]');

    allButtons.forEach(button => {
        const snippetKey = button.dataset.snippet.split(':')[0].trim();
        if (currentText.includes(snippetKey)) {
            button.disabled = true; // Désactive si déjà présent
        } else {
            button.disabled = false;
        }
    });
}
```

### Avantages de cette Version
- ✅ **Interface professionnelle** : Organisation claire et logique
- ✅ **Prévention des doublons** : Impossible d'ajouter deux fois le même élément
- ✅ **Respect du genre** : Options masculin/féminin pour tous les rôles
- ✅ **Efficacité maximale** : Ajout intelligent à la fin du texte
- ✅ **Feedback visuel** : État des boutons clairement indiqué

Cette interface avancée transforme la rédaction des descriptions en un processus rapide, intelligent et sans erreur !## Version
 Finale : Interface Simplifiée et Sémantique

### Approche Affinée

#### Masculin/Féminin Pertinent
- **📸 Photographe** : Terme neutre, pas de variante féminine
- **🧵 Couturier/Couturière** : Distinction sémantiquement correcte
- **✨ Assistant/Assistante** : Variantes appropriées
- **💄 Maquilleur/Maquilleuse** : Termes professionnels distincts
- **✂️ Coiffeur/Coiffeuse** : Usage français standard

#### Disposition Verticale Claire
```html
<div class="shortcut-item">
    <button>📸 Photographe</button> <!-- Bouton unique -->
</div>

<div class="shortcut-item is-pair">
    <button>🧵 Couturier</button>
    <button>🧵 Couturière</button> <!-- Paire côte à côte -->
</div>
```

### Logique de Désactivation par Groupe
```javascript
_updateShortcutButtonsState() {
    const currentText = this.editorElement.innerText.toLowerCase();
    
    allItems.forEach(item => {
        let keywordFound = false;
        
        // Vérifie si un mot-clé du groupe est présent
        buttons.forEach(button => {
            const keyword = button.dataset.snippet.split(' ')[1].toLowerCase();
            if (currentText.includes(keyword)) {
                keywordFound = true;
            }
        });
        
        // Désactive tout le groupe si trouvé
        buttons.forEach(button => {
            button.disabled = keywordFound;
        });
    });
}
```

### Avantages de cette Version
- ✅ **Sémantiquement correcte** : Masculin/féminin seulement quand pertinent
- ✅ **Interface épurée** : Liste verticale claire et lisible
- ✅ **Logique de groupe** : Désactivation intelligente par catégorie
- ✅ **Espacement optimal** : Paires côte à côte, singles en pleine largeur
- ✅ **Simplicité** : Moins de complexité, plus d'efficacité

Cette version finale offre l'équilibre parfait entre fonctionnalité et simplicité, avec une approche linguistiquement correcte du français.## Nou
velle Fonctionnalité : Générateur de Hashtags Intelligent

### Vue d'ensemble
Ajout d'un générateur automatique de hashtags basé sur l'analyse du contenu de la description. Cette fonctionnalité utilise des techniques de traitement du langage naturel (NLP) légères et performantes.

### Fonctionnement

#### Algorithme Intelligent
1. **Nettoyage du texte** : Suppression de la ponctuation, normalisation des accents
2. **Filtrage des stop words** : Exclusion des mots courants français et termes photo génériques
3. **Analyse de fréquence** : Comptage et classement des mots-clés pertinents
4. **Génération** : Création de hashtags basés sur les termes les plus significatifs

#### Interface
- **Bouton dédié** : "🤖 Générer les Hashtags" avec style distinct (bleu)
- **Séparateur visuel** : Ligne de séparation avant le bouton d'action
- **Insertion automatique** : Hashtags ajoutés à la fin du texte avec espacement

### Implémentation Technique

#### Algorithme de Traitement
```javascript
_generateHashtags(text, options = {}) {
    const { numHashtags = 15, minLength = 3 } = options;
    
    // 1. Nettoyage et normalisation
    const cleanedText = text
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Supprime accents
        .replace(/[^\w\s]/g, ' ') // Supprime ponctuation
        .replace(/\s+/g, ' '); // Normalise espaces
    
    // 2. Filtrage des stop words (150+ mots français + termes photo)
    const stopWords = new Set([...]);
    
    // 3. Comptage et classement par fréquence
    const wordCounts = cleanedText.split(' ').reduce((acc, word) => {
        if (word.length >= minLength && !stopWords.has(word) && isNaN(word)) {
            acc[word] = (acc[word] || 0) + 1;
        }
        return acc;
    }, {});
    
    // 4. Sélection des 15 mots les plus pertinents
    const sortedKeywords = Object.keys(wordCounts)
        .sort((a, b) => wordCounts[b] - wordCounts[a])
        .slice(0, numHashtags);
    
    // 5. Formatage en hashtags
    return sortedKeywords.map(word => `#${word}`).join(' ');
}
```

#### Stop Words Français
Liste complète de 150+ mots français courants exclus :
- Articles : le, la, les, un, une, des...
- Prépositions : de, du, dans, avec, pour...
- Pronoms : je, tu, il, nous, vous, ils...
- Verbes courants : être, avoir, faire, aller...
- Termes photo génériques : photo, photographe, image, art...

### Exemple d'Utilisation

**Texte d'entrée** :
```
📸 Photographe : Marie Dubois
📍 Lieu : Studio parisien
💃 Sujet(s) : Modèle haute couture
🧵 Couturière : Chanel
💄 Maquilleuse : Sophie Martin
Séance photo mode élégante avec robe vintage
```

**Hashtags générés** :
```
#marie #dubois #studio #parisien #modele #haute #couture #chanel #sophie #martin #seance #mode #elegante #robe #vintage
```

### Avantages

#### Performance
- ✅ **Léger** : Aucune bibliothèque externe, algorithme optimisé
- ✅ **Rapide** : Traitement instantané même sur de longs textes
- ✅ **Efficace** : Analyse contextuelle intelligente

#### Qualité
- ✅ **Pertinence** : Exclusion des mots non significatifs
- ✅ **Français** : Optimisé pour la langue française
- ✅ **Contextuel** : Adapté au domaine de la photographie

#### Intégration
- ✅ **Seamless** : S'intègre parfaitement à l'interface existante
- ✅ **Automatique** : Un clic pour générer tous les hashtags
- ✅ **Personnalisable** : Paramètres ajustables (nombre, longueur minimale)

Cette fonctionnalité transforme la création de hashtags d'une tâche manuelle fastidieuse en un processus automatisé et intelligent !