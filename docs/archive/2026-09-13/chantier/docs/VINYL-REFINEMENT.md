# Vinyle — comparaison du 12 septembre 2026, référence de 18 h 26

Référence utilisateur : `C:/Users/linkw/Downloads/ChatGPT Image 12 sept. 2026, 18_26_22.png`.
Point de départ fourni : `codex-clipboard-c6d76145-c4d6-4540-b6fb-6624bb9cfe3b.png`.

Cette reprise porte sur la matière du disque : noir, grain, poussières, sillons, reflets, rebord et tranche. Les portraits, le cadrage utilisateur, la géométrie du disque, le globe et la navigation sont hors périmètre.

## Les écarts recensés et les changements réalisés

| # | Avantage de la référence / défaut initial | Travail sur la matière |
| --- | --- | --- |
| 1 | Poussières beaucoup plus fines ; les nôtres formaient des points flous. | Texture de 2048 pixels et particules de rayon réduit, avec filtrage des détails sous le pixel. |
| 2 | Poussières discrètes dans les noirs, révélées par la lumière. | Rééquilibrage de la composante ambiante et de la réponse dans les reflets. |
| 3 | Répartition moins uniforme des imperfections. | Mélange de particules éparses et de petits regroupements, de tailles et de luminosités variables. |
| 4 | PVC noir poli, avec du grain fin, sans aspect mat uniforme. | Réduction du bruit isotrope ; les lignes circulaires portent l'essentiel du détail sombre. |
| 5 | Sillons mieux individualisés. | Profil de coupes aux espacements, profondeurs et flancs variables, réglé pour rester lisible dans la vue de référence. |
| 6 | Creux et arêtes mieux distingués. | Contraste des flancs, creux sombres entre pistes et petites épaules éclairées. |
| 7 | Micro-rayures moins artificiellement continues. | Retrait d'une couche périodique superposée ; petites traces tangentielles distinctes du grain et des particules. |
| 8 | Reflet gauche plus fin. | Source resserrée et énergie réduite pour conserver le détail des sillons. |
| 9 | Reflet droit plus fin et mieux placé. | Largeur réduite et direction ramenée vers l'intérieur du disque. |
| 10 | Blancs détaillés, avec moins de surfaces saturées. | Réduction de l'énergie des sources et conservation de la compression douce des hautes lumières. |
| 11 | Passage plus nuancé entre lumière et noir. | Variation du poli et de la largeur du reflet avec le profil des coupes. |
| 12 | Éclats secondaires plus naturels. | Éclat secondaire gauche rendu visible sans éclaircir tout le fond noir. |
| 13 | Bord extérieur presque blanc à certains endroits. | Éclat étroit sur la crête du rebord arrondi, limité aux secteurs éclairés. |
| 14 | Jonction plus crédible entre dessus, bord et tranche. | Tranche assombrie, crête brillante, largeur filtrée selon sa projection à l'écran. |
| 15 | Défaut supplémentaire découvert en exploration : grandes particules et quadrillage. | Atténuation d'une échelle de grain avant que ses texels deviennent visibles ; relais par une échelle plus fine, fixe sur la matière. |

## Boucle de captures

Les captures sont dans `artifacts/vinyl-reference/`. Chaque passe a été suivie d'une capture du vrai rendu WebGL puis d'une inspection. Les captures sont réalisées dans un navigateur isolé, sans modifier la caméra de l'utilisateur. Le script de comparaison emploie la même projection décentrée à chaque passe. Les images principales ne sont pas retouchées.

| Capture | Observation et décision |
| --- | --- |
| `refinement-00.png` | Base : poussières trop larges, reflets étalés, bord peu lisible. |
| `refinement-01.png` | Poussières affinées et sources resserrées ; surface devenue trop lisse. |
| `refinement-02.png` | Grain et bord renforcés ; grain trop isotrope dans les lumières. |
| `refinement-03.png` | Contraste des coupes et finesse du grain ajustés. |
| `refinement-04.png` | Particules conservées aux angles rasants ; matière encore trop mate. |
| `refinement-05.png` | Retrait de la superposition périodique et filtrage des coupes diagonales. |
| `refinement-06.png` | Sources rééquilibrées et crête lumineuse affinée ; les agrandissements montrent un manque de stries dans le noir. |
| `refinement-07.png` | Sillons de nouveau lisibles ; grain mat réduit et grosses particules atténuées en exploration. |
| `refinement-08.png` | Répartition des poussières variée et épaules des pistes ajustées. |
| `refinement-09.png` | Reflet droit recentré, reflet secondaire gauche révélé. |
| `refinement-10.png` | Texture finale stockée sur deux canaux au lieu de quatre. |

Captures complémentaires finales : `refinement-10-overview.png` et `refinement-10-exploration.png`.
Les planches `refinement-06-details.png` et `refinement-07-details.png` sont des recadrages agrandis pour examiner les pixels, pas des rendus présentés comme une reproduction du cadrage de référence.

Les captures ne signalent pas d'exception JavaScript. Il ne s'agit pas d'un audit général de l'application ni d'une mesure de FPS. Le dernier format RG réduit de moitié la mémoire de cette texture par rapport à son format RGBA intermédiaire, à résolution identique. Le grain reste calculé une fois et aucune passe de bloom n'a été ajoutée.

## Limite de la comparaison

La finesse des poussières, le contraste du noir, les sillons, les reflets et le bord ont été repris. Les captures montrent encore des différences dans les micro-rayures, la répartition exacte des particules et le contour précis des reflets. Une similitude de 100 % n'est pas établie ; les mesures de luminosité de petites zones ne constituent pas un pourcentage de réalisme.

Reproduction d'une capture, uniquement sur demande explicite de validation :

```powershell
node scripts/capture-vinyl-reference.mjs comparaison
node scripts/capture-vinyl-reference.mjs comparaison-globe --overview
node scripts/capture-vinyl-reference.mjs comparaison-exploration --exploration
```
