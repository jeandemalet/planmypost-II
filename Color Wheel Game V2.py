import pygame
import sys
import random
import math
from colorsys import hsv_to_rgb, rgb_to_hsv

# Initialisation de pygame
pygame.init()
WIDTH, HEIGHT = 800, 600
screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("Entraînement aux Couleurs")

# Polices
font_large = pygame.font.SysFont('Arial', 40)
font_medium = pygame.font.SysFont('Arial', 30)
font_small = pygame.font.SysFont('Arial', 20)

# Couleurs
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)
GRAY = (150, 150, 150)
LIGHT_GRAY = (200, 200, 200)
RED = (255, 0, 0)

# Variables du jeu
score = 0
high_score = 0
lives = 3
mode = "menu"  # menu, complementary, timed
current_reference_color = None
choices = []
correct_index = None
timer = 0
TIMER_MAX = 3 * 60  # 3 secondes à 60 FPS

def generate_random_color():
    """Générer une couleur RGB aléatoire"""
    h = random.random()  # Teinte entre 0 et 1
    s = 0.8 + random.random() * 0.2  # Saturation entre 0.8 et 1
    v = 0.8 + random.random() * 0.2  # Valeur entre 0.8 et 1
    r, g, b = [int(c * 255) for c in hsv_to_rgb(h, s, v)]
    return (r, g, b)

def get_complementary_color(color):
    """Obtenir la couleur complémentaire"""
    r, g, b = color
    h, s, v = rgb_to_hsv(r/255, g/255, b/255)
    h = (h + 0.5) % 1.0  # Ajouter 180° en teinte
    r, g, b = [int(c * 255) for c in hsv_to_rgb(h, s, v)]
    return (r, g, b)

def setup_game(game_mode):
    """Configurer le jeu pour le tour suivant"""
    global current_reference_color, choices, correct_index, mode, timer
    
    mode = game_mode
    current_reference_color = generate_random_color()
    timer = TIMER_MAX
    
    # Mode couleur complémentaire (pour les deux modes)
    complementary = get_complementary_color(current_reference_color)
    
    # Générer 3 autres couleurs incorrectes
    incorrect_choices = []
    while len(incorrect_choices) < 3:
        # Décaler la teinte de façon aléatoire mais pas à l'opposé
        r, g, b = current_reference_color
        h, s, v = rgb_to_hsv(r/255, g/255, b/255)
        
        # Éviter des variations trop proches de la complémentaire
        shift = random.uniform(0.15, 0.35)
        if random.random() < 0.5:
            shift = -shift
            
        h_new = (h + 0.5 + shift) % 1.0
        wrong_color = tuple(int(c * 255) for c in hsv_to_rgb(h_new, s, v))
        
        if wrong_color not in incorrect_choices:
            incorrect_choices.append(wrong_color)
    
    # Mélanger les choix
    choices = incorrect_choices + [complementary]
    random.shuffle(choices)
    correct_index = choices.index(complementary)

def draw_perfect_circle(surface, color, center, radius, width=0):
    """Dessine un cercle parfait (non déformé)"""
    pygame.draw.circle(surface, color, center, radius, width)

def draw_color_wheel(center, radius, highlight_angle=None):
    """Dessiner une roue des couleurs avec mise en évidence d'un angle"""
    # Dessiner un cercle noir comme fond
    draw_perfect_circle(screen, BLACK, center, radius + 12)
    draw_perfect_circle(screen, WHITE, center, radius + 11)
    
    # Dessiner chaque segment de couleur
    for i in range(360):
        angle = math.radians(i)
        h = i / 360
        color = tuple(int(c * 255) for c in hsv_to_rgb(h, 1, 1))
        
        x1 = center[0] + (radius - 10) * math.cos(angle)
        y1 = center[1] + (radius - 10) * math.sin(angle)
        x2 = center[0] + radius * math.cos(angle)
        y2 = center[1] + radius * math.sin(angle)
        
        line_width = 3 if highlight_angle is not None and abs(i - highlight_angle) < 3 else 1
        pygame.draw.line(screen, color, (x1, y1), (x2, y2), line_width)
    
    # Dessiner un cercle blanc au centre pour compléter la roue
    draw_perfect_circle(screen, WHITE, center, radius - 10)

def color_to_angle(color):
    """Convertir une couleur RGB en angle sur la roue des couleurs"""
    r, g, b = color
    h, _, _ = rgb_to_hsv(r/255, g/255, b/255)
    return h * 360

def draw_lives(lives_count):
    """Dessiner les vies restantes sous forme de cœurs"""
    heart_size = 25
    spacing = 5
    start_x = WIDTH - (heart_size * lives_count + spacing * (lives_count - 1)) - 20
    
    for i in range(lives_count):
        x = start_x + i * (heart_size + spacing)
        y = 30
        if i < lives:
            color = RED  # Cœur plein
        else:
            color = LIGHT_GRAY  # Cœur vide
        
        # Dessiner un simple cercle rouge pour représenter un cœur
        draw_perfect_circle(screen, color, (x + heart_size//2, y), heart_size//2)

def draw_timer_bar():
    """Dessiner la barre de temps"""
    bar_width = 200
    bar_height = 20
    x = (WIDTH - bar_width) // 2
    y = 30
    
    # Fond de la barre
    pygame.draw.rect(screen, LIGHT_GRAY, (x, y, bar_width, bar_height), border_radius=5)
    
    # Progression de la barre
    progress_width = int((timer / TIMER_MAX) * bar_width)
    
    # Couleur de la barre basée sur le temps restant
    if timer / TIMER_MAX > 0.6:
        bar_color = (0, 200, 0)  # Vert
    elif timer / TIMER_MAX > 0.3:
        bar_color = (255, 165, 0)  # Orange
    else:
        bar_color = (200, 0, 0)  # Rouge
    
    pygame.draw.rect(screen, bar_color, (x, y, progress_width, bar_height), border_radius=5)
    
    # Afficher le temps restant en secondes
    seconds_left = math.ceil(timer / 60)
    time_text = font_small.render(f"{seconds_left}s", True, BLACK)
    screen.blit(time_text, (x + bar_width//2 - time_text.get_width()//2, y + bar_height//2 - time_text.get_height()//2))

def draw_menu():
    """Dessiner l'écran d'accueil"""
    screen.fill(WHITE)
    
    # Titre
    title = font_large.render("Entraînement aux Couleurs", True, BLACK)
    screen.blit(title, (WIDTH//2 - title.get_width()//2, 80))
    
    # Score
    score_text = font_medium.render(f"Meilleur score: {high_score}", True, BLACK)
    screen.blit(score_text, (WIDTH//2 - score_text.get_width()//2, 150))
    
    # Boutons
    pygame.draw.rect(screen, GRAY, (WIDTH//2 - 150, 220, 300, 60), border_radius=10)
    mode1_text = font_medium.render("Mode Complémentaire", True, BLACK)
    screen.blit(mode1_text, (WIDTH//2 - mode1_text.get_width()//2, 235))
    
    pygame.draw.rect(screen, GRAY, (WIDTH//2 - 150, 300, 300, 60), border_radius=10)
    mode2_text = font_medium.render("Mode Chronométré", True, BLACK)
    screen.blit(mode2_text, (WIDTH//2 - mode2_text.get_width()//2, 315))
    
    # Instructions
    instructions = font_small.render("Trouvez la couleur complémentaire correspondante", True, BLACK)
    screen.blit(instructions, (WIDTH//2 - instructions.get_width()//2, 400))
    
    # Roue des couleurs décorative
    draw_color_wheel((WIDTH//2, 500), 50)

def draw_game():
    """Dessiner l'écran de jeu"""
    screen.fill(WHITE)
    
    # Afficher la couleur de référence
    pygame.draw.rect(screen, current_reference_color, (WIDTH//2 - 50, 80, 100, 100), border_radius=5)
    ref_text = font_medium.render("Couleur de référence", True, BLACK)
    screen.blit(ref_text, (WIDTH//2 - ref_text.get_width()//2, 30))
    
    # Afficher les instructions
    instruction = font_medium.render("Trouvez la couleur complémentaire", True, BLACK)
    screen.blit(instruction, (WIDTH//2 - instruction.get_width()//2, 200))
    
    # Afficher les choix
    choice_width = 80
    spacing = 40
    total_width = 4 * choice_width + 3 * spacing
    start_x = (WIDTH - total_width) // 2
    
    for i, color in enumerate(choices):
        x = start_x + i * (choice_width + spacing)
        # Dessiner avec un effet de bouton 3D
        pygame.draw.rect(screen, LIGHT_GRAY, (x-2, 248, choice_width+4, choice_width+4), border_radius=5)
        pygame.draw.rect(screen, color, (x, 250, choice_width, choice_width), border_radius=5)
        choice_label = font_small.render(f"{i+1}", True, BLACK)
        screen.blit(choice_label, (x + choice_width//2 - choice_label.get_width()//2, 360))
    
    # Afficher score
    score_text = font_medium.render(f"Score: {score}", True, BLACK)
    screen.blit(score_text, (50, 30))
    
    # Afficher les vies
    draw_lives(3)
    
    # Afficher le timer en mode chronométré
    if mode == "timed":
        draw_timer_bar()
    
    # Instructions
    click_text = font_small.render("Cliquez sur une couleur pour la sélectionner", True, BLACK)
    screen.blit(click_text, (WIDTH//2 - click_text.get_width()//2, 450))
    
    back_text = font_small.render("ESC pour revenir au menu", True, BLACK)
    screen.blit(back_text, (WIDTH//2 - back_text.get_width()//2, 480))

def draw_feedback(is_correct, chosen_color):
    """Afficher le résultat avec la roue des couleurs"""
    screen.fill(WHITE)
    
    if is_correct:
        result_text = font_large.render("Correct!", True, (0, 150, 0))
    else:
        result_text = font_large.render("Incorrect!", True, (150, 0, 0))
    
    screen.blit(result_text, (WIDTH//2 - result_text.get_width()//2, 50))
    
    # Dessiner la roue des couleurs
    center = (WIDTH//2, HEIGHT//2)
    wheel_radius = 150  # Taille fixe pour éviter la distorsion
    
    # Afficher la roue des couleurs
    ref_angle = color_to_angle(current_reference_color)
    draw_color_wheel(center, wheel_radius, ref_angle)
    
    # Coordonnées pour les marqueurs de couleur
    marker_distance = wheel_radius + 30
    
    # Marquer la couleur de référence
    ref_radians = math.radians(ref_angle)
    ref_x = center[0] + marker_distance * math.cos(ref_radians)
    ref_y = center[1] + marker_distance * math.sin(ref_radians)
    draw_perfect_circle(screen, current_reference_color, (int(ref_x), int(ref_y)), 20)
    draw_perfect_circle(screen, BLACK, (int(ref_x), int(ref_y)), 20, 2)  # Bordure
    
    # Marquer la couleur correcte
    correct_color = get_complementary_color(current_reference_color)
    
    correct_angle = color_to_angle(correct_color)
    corr_radians = math.radians(correct_angle)
    corr_x = center[0] + marker_distance * math.cos(corr_radians)
    corr_y = center[1] + marker_distance * math.sin(corr_radians)
    draw_perfect_circle(screen, correct_color, (int(corr_x), int(corr_y)), 20)
    draw_perfect_circle(screen, BLACK, (int(corr_x), int(corr_y)), 20, 2)  # Bordure
    
    # Marquer la couleur choisie si incorrecte
    if not is_correct:
        chosen_angle = color_to_angle(chosen_color)
        chosen_radians = math.radians(chosen_angle)
        chosen_x = center[0] + marker_distance * math.cos(chosen_radians)
        chosen_y = center[1] + marker_distance * math.sin(chosen_radians)
        draw_perfect_circle(screen, chosen_color, (int(chosen_x), int(chosen_y)), 20)
        draw_perfect_circle(screen, WHITE, (int(chosen_x), int(chosen_y)), 20, 2)  # Bordure blanche pour différencier
        draw_perfect_circle(screen, BLACK, (int(chosen_x), int(chosen_y)), 22, 2)  # Bordure externe noire
        
        # Légende pour le choix incorrect
        pygame.draw.rect(screen, chosen_color, (50, HEIGHT - 120, 20, 20))
        chosen_text = font_small.render("Votre choix", True, BLACK)
        screen.blit(chosen_text, (80, HEIGHT - 120))
    
    # Légende
    pygame.draw.rect(screen, current_reference_color, (50, HEIGHT - 80, 20, 20))
    ref_legend = font_small.render("Couleur de référence", True, BLACK)
    screen.blit(ref_legend, (80, HEIGHT - 80))
    
    pygame.draw.rect(screen, correct_color, (50, HEIGHT - 50, 20, 20))
    corr_legend = font_small.render("Complémentaire", True, BLACK)
    screen.blit(corr_legend, (80, HEIGHT - 50))
    
    # Continuer
    continue_text = font_medium.render("Cliquez pour continuer", True, BLACK)
    screen.blit(continue_text, (WIDTH//2 - continue_text.get_width()//2, HEIGHT - 80))

def draw_game_over():
    """Afficher l'écran de fin de partie"""
    screen.fill(WHITE)
    
    # Dessiner une roue des couleurs décorative en arrière-plan
    draw_color_wheel((WIDTH//2, HEIGHT//2), 150)
    
    # Rectangle semi-transparent pour améliorer la lisibilité du texte
    overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
    overlay.fill((255, 255, 255, 180))  # Blanc semi-transparent
    screen.blit(overlay, (0, 0))
    
    game_over_text = font_large.render("Partie terminée!", True, BLACK)
    screen.blit(game_over_text, (WIDTH//2 - game_over_text.get_width()//2, 150))
    
    final_score = font_medium.render(f"Score final: {score}", True, BLACK)
    screen.blit(final_score, (WIDTH//2 - final_score.get_width()//2, 230))
    
    if score > high_score:
        new_high = font_medium.render("Nouveau meilleur score!", True, (0, 150, 0))
        screen.blit(new_high, (WIDTH//2 - new_high.get_width()//2, 280))
    
    restart = font_medium.render("Cliquez pour revenir au menu", True, BLACK)
    screen.blit(restart, (WIDTH//2 - restart.get_width()//2, 350))

# Détecter si un clic est dans les limites d'un rectangle
def is_click_in_rect(pos, rect):
    x, y = pos
    rx, ry, rw, rh = rect
    return rx <= x <= rx + rw and ry <= y <= ry + rh

# Fonction pour obtenir l'index de la couleur cliquée
def get_clicked_choice(pos):
    choice_width = 80
    spacing = 40
    total_width = 4 * choice_width + 3 * spacing
    start_x = (WIDTH - total_width) // 2
    
    for i in range(4):
        x = start_x + i * (choice_width + spacing)
        if is_click_in_rect(pos, (x, 250, choice_width, choice_width)):
            return i
    return None

# Boucle principale du jeu
feedback_mode = False
chosen_color = None
time_out = False
clock = pygame.time.Clock()

running = True
while running:
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
            
        elif event.type == pygame.KEYDOWN:
            if event.key == pygame.K_ESCAPE:
                if mode in ["complementary", "timed"]:
                    mode = "menu"
                else:
                    running = False
        
        elif event.type == pygame.MOUSEBUTTONDOWN:
            mouse_pos = event.pos
            
            if mode == "menu":
                # Clic sur les boutons du menu
                # Bouton mode complémentaire
                if is_click_in_rect(mouse_pos, (WIDTH//2 - 150, 220, 300, 60)):
                    mode = "complementary"
                    score = 0
                    lives = 3
                    setup_game("complementary")
                    
                # Bouton mode chronométré
                elif is_click_in_rect(mouse_pos, (WIDTH//2 - 150, 300, 300, 60)):
                    mode = "timed"
                    score = 0
                    lives = 3
                    setup_game("timed")
            
            elif feedback_mode:
                # Clic n'importe où pour continuer après le feedback
                feedback_mode = False
                if lives <= 0:
                    # Game over
                    if score > high_score:
                        high_score = score
                    mode = "game_over"
                else:
                    # Passer au tour suivant
                    setup_game(mode)
            
            elif mode == "game_over":
                # Clic pour revenir au menu
                mode = "menu"
                score = 0
                lives = 3
            
            elif mode in ["complementary", "timed"]:
                # Clic sur une couleur
                clicked_choice = get_clicked_choice(mouse_pos)
                if clicked_choice is not None:
                    is_correct = clicked_choice == correct_index
                    chosen_color = choices[clicked_choice]
                    
                    if is_correct:
                        score += 1
                    else:
                        lives -= 1
                    
                    feedback_mode = True
    
    # Mise à jour du timer en mode chronométré
    if mode == "timed" and not feedback_mode and not time_out:
        timer -= 1
        if timer <= 0:
            time_out = True
            lives -= 1
            chosen_color = choices[0]  # Utiliser une couleur par défaut
            feedback_mode = True
            time_out = False
    
    # Affichage
    if mode == "menu":
        draw_menu()
    elif mode == "game_over":
        draw_game_over()
    elif feedback_mode:
        draw_feedback(chosen_color == choices[correct_index], chosen_color)
    else:  # Mode de jeu
        draw_game()
    
    pygame.display.flip()
    clock.tick(60)

pygame.quit()
sys.exit()