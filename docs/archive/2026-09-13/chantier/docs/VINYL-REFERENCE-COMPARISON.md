# Comparaison du vinyle — 12 septembre 2026

Référence fournie : `ChatGPT Image 12 sept. 2026, 16_55_31.png`.
Travail limité au disque du globe : la palette du globe et les mécanismes de navigation ne sont pas modifiés.

## Captures et observations

Les captures locales sont dans `artifacts/vinyl-reference/`. Elles proviennent du rendu WebGL réel sur le serveur de développement, dans un navigateur de capture isolé. Le gros plan utilise une fenêtre de projection décentrée pour approcher le cadrage fourni ; aucune déformation ou retouche de l'image n'est appliquée. Les contrôles hors du cadrage de référence sont masqués uniquement dans ce navigateur de capture. La capture `pass-10-overview.png` conserve les contrôles et la caméra normale.

| Passe | Observation et correction suivante |
| --- | --- |
| 1 | Reflets blancs restaurés, fond du PVC assombri ; détail de matière encore trop faible. |
| 2 | Grain trop quadrillé et cadrage trop éloigné. |
| 3 | Réduction du bruit et ajout d'une source secondaire ; trame encore perceptible. |
| 4 | Texture déterministe avec mipmaps pour supprimer la grille ; éclairage du véritable bord corrigé. |
| 5 | Rayon extérieur porté de 1,72 à 1,85 fois celui du globe pour élargir la surface gravée ; ouverture centrale conservée. |
| 6 | Grain et variations de taille des sillons renforcés ; grain trop grossier, reflet droit trop extérieur. |
| 7 | Grain affiné et reflet droit ramené vers l'intérieur. |
| 8 | Reflets plus concentrés et blancs, tranche moins brillante ; séparations encore épaisses. |
| 9 | Séparations affinées et lobes lumineux adoucis. |
| 10 | Source secondaire orientée pour retrouver l'éclat gauche ; capture complémentaire en vue globe normale. |

Les captures finales ne signalent pas d'exception JavaScript. Ce constat porte sur ces captures, pas sur un audit général de l'application ni une mesure des FPS.

## Résultat et limites observées

- Couleurs : PVC noir et reflets blancs légèrement chauds, sans ajouter de violet au disque.
- Forme : disque circulaire plat, trou au contact du globe et véritable tranche arrondie ; largeur augmentée pour se rapprocher de la référence.
- Précision : sillons, séparations et grain filtrés selon leur taille à l'écran. La texture de surface est fixe, sans animation de bruit ni passe de bloom supplémentaire.
- Réalisme : contraste des sources et variations de surface améliorés. La répartition des micro-rayures et les contours des reflets restent différents de la référence.
- Similitude : aucune équivalence de 100 % n'est établie. Le cadrage approché et la matière procédurale ne permettent pas de présenter les images comme identiques.

Reproduction : `node scripts/capture-vinyl-reference.mjs nouvelle-capture` ; ajouter `--overview` pour le cadrage normal. Ces commandes sont réservées aux demandes explicites de capture/validation.
