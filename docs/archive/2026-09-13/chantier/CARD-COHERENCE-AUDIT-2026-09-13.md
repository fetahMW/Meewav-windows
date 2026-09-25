# Audit de cohérence des cartes — 13 septembre 2026

## Portée et méthode

Audit des composants et de leurs feuilles CSS dans le worktree `profile-smoked-glass`, base `679a0c87a`. Accueil et collections Rooms ; accueil, exploration, formats horizontaux et verticaux et recommandations La Scène ; accueil et catalogue Market ; Découvrir, exploration et Mes artistes Tremplin.

Il s'agit d'un audit du code et des règles de cascade, pas d'une validation visuelle des pages. Aucune capture comparative, mesure de contraste rendu ou vérification mobile n'a été effectuée. Les risques de débordement ci-dessous restent à confirmer dans le navigateur. Aucun changement de l'interface pendant cet audit.

## Verdict

La finition graphite récente est commune aux cartes Rooms, aux vidéos horizontales et recommandations de La Scène, et aux produits du catalogue Market. Elle ne couvre pas encore toutes les familles réellement utilisées. Le principal problème est cette couverture incomplète, puis la dispersion des règles de présentation.

| Famille | Constat dans le code |
| --- | --- |
| Rooms accueil, mises en avant et collections | Même composant RoomCard ; bande graphite et padding 10 × 12 px. Titres sans hauteur réservée. |
| Scène vidéos horizontales, rails et catalogue compact | Média et informations dans un même conteneur ; même graphite et padding 10 × 12 px. |
| Scène recommandations du lecteur | Même matière ; format horizontal adapté, menus conservés hors du découpage. |
| Scène Shorts verticaux | Informations encore hors d'un conteneur laqué commun. |
| Scène héros | Carte immersive avec informations superposées ; bordure et ombre distinctes. Format différent justifié, matière périphérique à harmoniser. |
| Market catalogue | Nouvelle bande graphite et padding 10 × 12 px. |
| Market accueil, héros et miniatures | Ancien habillage violet sombre ; non concernés par les sélecteurs du catalogue. |
| Tremplin Découvrir, héros | Verre violet très lumineux, nombreux reflets et cadres imbriqués. |
| Tremplin exploration et miniatures | Composant ProjectMiniCard réellement utilisé ; ancien verre violet et espacement propre. |
| Tremplin Mes artistes | Troisième finition, avec lueurs variables selon la position et portrait rectangulaire. |

## Dix écarts à traiter

### 1. Priorité haute — Shorts verticaux de La Scène oubliés

`scene-card-surfaces.css:9` cible `.scene-video-card.shorts-video-card`, pas `.scene-vertical-card`. Dans `shorts-product-polish.css:5954`, le conteneur vertical n'a ni surface ni bordure ; seule l'image est encadrée. Les métadonnées (`:6153`) ont un padding `10px 2px 0` et aucun fond. Le nom et les compteurs restent donc sur le fond de page.

Correction proposée : joindre média et métadonnées dans le même conteneur graphite, avec bande compacte et menus non tronqués. Préserver le format 9:16.

### 2. Priorité haute — Accueil Market oublié

Dans `market-home-premium.css:13`, les héros et miniatures gardent fond violet et bordure lavande. Le graphite ajouté à partir de `:110` ne cible que `.market-product-card`. `MarketPage.tsx:612` confirme que l'accueil utilise `.market-rail-card`.

Correction proposée : appliquer la même matière aux rails d'accueil et au catalogue, tout en conservant la composition latérale des héros.

### 3. Priorité haute — Tremplin plus violet et plus lumineux au repos

`tremplin-discovery-premium.css` conserve des reflets blancs et lavande superposés sur le cadre, le résumé de jeton et les boutons secondaires. `tremplin-discovery-rails.css:58` emploie une autre surface pour les miniatures. `tremplin-my-artists-premium.css:13` en définit une troisième, avec couleurs de lueur variant selon `nth-child`.

Correction proposée : même graphite neutre et même intensité de reflet de base ; violet du poteau pour les actions et états. Préserver les couleurs sémantiques des grades et des évolutions.

### 4. Priorité moyenne — Compacité incomplète

Les nouvelles bandes utilisent 10 × 12 px. Les miniatures Market restent à 235 px de hauteur, avec une bande calculée à partir d'une image de 112 px (`market-home-premium.css:39`). Les miniatures Tremplin sont à 210 px et padding 12 × 11 px (`tremplin-discovery-rails.css:58`). Les héros Tremplin sont fixés à 548 px, puis 752 px sur mobile ; leurs lignes internes ont aussi des tailles réservées. Mes artistes réserve au moins 412 px.

Correction proposée : limiter les hauteurs imposées aux besoins de composition ; aligner les cartes d'un même rail sans ajouter de vide inutile. Une carte de projet détaillée ne doit pas avoir la même hauteur qu'une miniature vidéo.

### 5. Priorité moyenne — Typographie de familles différentes

Rooms : titres 15 px, poids 600, interligne 1.4. Scène : 15 px, poids 760, interligne 1.28. Market catalogue : 14 px, poids 720. Tremplin héros : noms et titres de projet en Georgia, alors que les miniatures et les autres features utilisent une sans-serif.

Sources : `rooms-home-lacquer.css:37`, `shorts-product-polish.css:4150`, `market-home-premium.css:76`, `tremplin-discovery-premium.css`.

Correction proposée : définir des niveaux communs miniature / standard / héros, avec des poids et interlignes cohérents. L'emploi de Georgia doit être un choix éditorial explicite, pas une exception accidentelle.

### 6. Priorité moyenne — Informations secondaires trop variables

Le Market descend à 8 px pour les catégories de miniatures, 9 px pour des détails et 10 px pour les vendeurs (`market-home-premium.css:44`). Les métadonnées des Shorts verticaux utilisent une opacité de .48 (`shorts-product-polish.css:6195`). D'autres cartes utilisent des gris opaques plus lisibles.

Correction proposée : palette commune de texte secondaire et seuils de taille par format. Le contraste réel reste à mesurer sur les fonds rendus ; aucune non-conformité chiffrée n'est affirmée ici.

### 7. Priorité moyenne — Arrondis et contours sans échelle commune

Rooms 19 px ; Scène standard 18 px, recommandations 14 px ; Market miniature 15 px et héros 20 px ; Tremplin miniature 13 px, héros 28 px et Mes artistes 12 px. Les contours oscillent entre gris discret et lavande très lumineux.

Correction proposée : une courte échelle d'arrondis par format, avec la même matière de bordure et des rayons intérieurs cohérents. Les variations de taille ne constituent pas toutes un défaut : il faut surtout éviter des finitions contradictoires à format comparable.

### 8. Priorité moyenne — Identité de l'auteur hétérogène

Rooms place un petit portrait rond auprès du nom et du grade. Scène réserve 42 px au portrait, avec variantes compactes. Tremplin Mes artistes utilise une photo de 76 px arrondie à 15 px ; les miniatures utilisent le portrait comme grand visuel. Market distingue le type de vendeur par un pictogramme encadré, pas par une photo (`MarketPage.tsx:462`).

Correction proposée : harmoniser alignements, écart nom/badge et tailles par niveau de carte. Conserver les informations propres au vendeur ; ne pas inventer de portrait manquant ni imposer la structure d'une vidéo à une annonce.

### 9. Priorité moyenne — Interactions et réduction des mouvements divergentes

Rooms soulève la carte de 2 px. Les Shorts verticaux déplacent le média seul. Tremplin héros garde la carte fixe et renforce les reflets. Le reflet de bande Market est renforcé au survol mais pas au focus, alors que le contour traite les deux états.

Un écart concret de cascade existe aussi dans Rooms : le `transform: translateY(-2px)` de `.rooms-home .rooms-home-card__action:hover` (`rooms-home-lacquer.css:8`) est plus spécifique que l'annulation dans `prefers-reduced-motion` de `rooms-home-components.css:682`. La règle de réduction de mouvement ne neutralise donc pas ce déplacement.

Correction proposée : mêmes états repos / survol / focus, avec réduction de mouvement effective. Conserver un focus clavier clairement visible.

### 10. Priorité structurelle — La matière commune est copiée, pas partagée

Le même dégradé graphite est recopié dans trois feuilles CSS. Seule La Scène le nomme avec une variable locale. Les fichiers premium réécrivent aussi des propriétés déjà déclarées plus haut. Cela explique pourquoi une correction atteint le catalogue mais oublie les rails ou les Shorts.

Correction proposée : extraire des variables partagées pour fond, reflet, contour, ombre, padding et arrondis. Garder les mises en page propres à chaque feature et appliquer ces variables à un inventaire explicite des familles actives.

## Éléments cohérents à conserver

- Fond graphite identique sur les trois familles récemment corrigées, bande 10 × 12 px et léger reflet de surface.
- Même composant de grade Meewav dans Rooms, La Scène et Tremplin : conserver les badges et leurs couleurs.
- Médias liés à leur bloc d'informations dans les cartes horizontales corrigées.
- Formats immersifs des héros, prix et disponibilité du Market, données de jeton du Tremplin : différences fonctionnelles légitimes.
- Menus de cartes accessibles sans être découpés par le conteneur.
- Poteau, navbar et backgrounds hors périmètre de cet audit.

## Ordre de correction recommandé

1. Couvrir les Shorts verticaux et les rails Market oubliés.
2. Unifier les matériaux Tremplin sans refaire les compositions validées.
3. Partager les variables et décliner les formats miniature, standard et héros.
4. Ajuster typographie, densité, identité et états interactifs ; corriger la réduction de mouvement Rooms.
5. Comparer visuellement les familles à largeur identique, puis sur écran étroit, avec titres longs, images manquantes et menus ouverts avant de conclure sur la cohérence rendue.
