# Matière du vinyle — deuxième référence, 12 septembre 2026

Référence : `codex-clipboard-db9bbe24-e864-444d-8052-d0bf6fbaf1fa.png` (1633 × 757).

L'analyse initiale recensait 26 écarts dans l'ensemble de l'image. L'utilisateur a ensuite limité expressément le travail à la matière du vinyle. Les portraits, leur disposition, le cadrage, la géométrie et les mécanismes de navigation sont exclus de cette révision.

## Les 18 points de matière retenus

1. Apparence de métal brossé : réduire les traits gris permanents hors des reflets.
2. Profondeur du noir : conserver une base sombre avec des nuances perceptibles.
3. Grain du PVC : distinguer le grain de fond des sillons.
4. Espacement des micro-sillons : retirer leur régularité mécanique.
5. Finesse des coupes : varier leur largeur et leur profondeur apparente.
6. Relief des sillons : éclairer différemment leurs deux flancs.
7. Séparations entre pistes : renforcer les creux et leurs petites arêtes éclairées.
8. Poli de la surface : varier légèrement la réponse des coupes à la lumière.
9. Reflet gauche : élargir sa couverture sur la matière.
10. Reflet droit : équilibrer sa luminosité avec celle du gauche.
11. Blancs saturés : conserver le détail dans les crêtes brillantes.
12. Teinte des reflets : rapprocher le blanc du ton légèrement chaud de la référence.
13. Reflets secondaires : replacer l'éclat du bord arrière gauche.
14. Laque du bord : supprimer le liseré gris uniforme au profit d'éclats localisés.
15. Poussières : rendre les particules fixes, éparses, de tailles et d'intensités différentes.
16. Micro-rayures : ajouter de fines traces circulaires distinctes des particules.
17. Netteté lointaine : filtrer les détails plus petits qu'un pixel.
18. Netteté rapprochée : ajouter une échelle de grain plus fine, sans agrandir excessivement les imperfections.

Ces points ont été travaillés. Cette liste n'est pas une certification de conformité parfaite à la référence. La répartition des rayures et des particules est procédurale et ne reproduit pas chaque détail de l'image.

## Passes réalisées

Les fichiers sont dans `artifacts/vinyl-reference/` et les images ne sont pas retouchées après capture.

| Capture | Observation / correction |
| --- | --- |
| `reference-2-before.png` | Point de départ, traits trop réguliers, absence de poussières et lumière peu nuancée. |
| `texture-11.png` | Microrelief irrégulier et particules ; poussières encore trop uniformes. |
| `texture-12.png` | Particules de tailles variables et reflet gauche élargi ; poussières trop discrètes. |
| `texture-13.png` | Creux plus marqués et réponse à l'angle de lumière ; gauche trop blanc, droite trop faible. |
| `texture-14.png` | Rééquilibrage et compression douce des blancs ; contraste fin encore insuffisant. |
| `texture-15.png` | Contraste des crêtes renforcé et bord moins gris ; traits de fond encore trop présents. |
| `texture-16.png` | Fond noir moins rayé, reflet arrière gauche ajouté. |
| `texture-17.png` | Contraste fin des reflets ajusté ; examen rapproché montrant un grain trop large. |
| `texture-18.png` | Seconde échelle de micro-coupes et de grain. |
| `texture-18-exploration.png` | Capture rapprochée de cette même matière. |

Les captures n'ont signalé aucune exception JavaScript. Aucun résultat de performance FPS ni audit général de l'application n'est revendiqué.

## Mesures complémentaires, limitées à trois zones

Le script `scripts/analyze-vinyl-material.py` lit les images et compare trois petites zones de matière, sans modifier les fichiers. L'écart-type du détail fin est calculé après soustraction d'un flou gaussien de rayon 1,2 pixel. L'échelle de luminosité est 0–255.

| Zone | Luminosité référence | Luminosité passe 18 | Détail fin référence | Détail fin passe 18 |
| --- | ---: | ---: | ---: | ---: |
| PVC sombre | 7,40 | 7,65 | 1,08 | 0,86 |
| Reflet gauche | 147,88 | 153,32 | 21,07 | 20,59 |
| Reflet droit | 162,13 | 167,79 | 18,79 | 18,69 |

Ces valeurs aident à régler le noir et le contraste ; elles ne mesurent ni une similitude globale ni un pourcentage de réalisme. Les contours des reflets, les particules et les micro-rayures restent différents. Une identité de 100 % n'est pas établie.

## Mise en œuvre

Le disque conserve sa géométrie existante. Le relief apparent vient d'un profil de coupes irrégulières, de flancs éclairés différemment et d'une réponse spéculaire variant avec l'angle de vue. Les textures sont calculées une fois puis filtrées par mipmaps. Aucun bruit temporel, capture de réflexion par image, nouveau modèle de portrait ou passe de bloom n'est ajouté.

Les captures de comparaison utilisent une caméra décentrée uniquement dans le navigateur de capture. Le cadrage utilisateur reste celui du globe existant.
