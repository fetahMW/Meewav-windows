# France — vague 4 des villes Guide Alpha

Date de consolidation : 2026-07-14
Version canonique : `2026.6-france-wave-4`

## Périmètre livré

La quatrième vague ajoute Troyes, Valence, Chambéry, Niort, Lorient, Quimper, Montauban, Beauvais, Vannes, Cholet, La Roche-sur-Yon et Bayonne.

La source est le référentiel officiel IGN / INSEE Contours IRIS 2026 diffusé par le WFS Géoplateforme. Les 290 cellules IRIS sources produisent 276 plaques visibles portant chacune un nom humain unique.

| Ville | Code commune | IRIS sources | Plaques humaines | Groupement sémantique |
| --- | ---: | ---: | ---: | --- |
| Troyes | 10387 | 27 | 27 | aucun |
| Valence | 26362 | 25 | 25 | aucun |
| Chambéry | 73065 | 22 | 10 | sept familles numérotées dissoutes |
| Niort | 79191 | 26 | 26 | aucun |
| Lorient | 56121 | 25 | 25 | aucun |
| Quimper | 29232 | 29 | 29 | aucun |
| Montauban | 82121 | 25 | 25 | aucun |
| Beauvais | 60057 | 18 | 18 | aucun |
| Vannes | 56260 | 29 | 27 | Ménimur et Kercado |
| Cholet | 49099 | 22 | 22 | aucun |
| La Roche-sur-Yon | 85191 | 24 | 24 | aucun |
| Bayonne | 64102 | 18 | 18 | aucun |
| **Total** | — | **290** | **276** | — |

## Arrêt sémantique appliqué

Hyères faisait partie de la sélection initiale, mais les libellés officiels `Paradis 1` et `Paradis 2-Ritorte` ne permettent pas de déterminer honnêtement une plaque humaine commune. Les fusionner sous `Paradis` supprimerait `Ritorte`, tandis que les conserver ferait fuiter une numérotation statistique.

Le Guide Alpha impose donc un arrêt plutôt qu'une règle inventée. Hyères reste hors runtime et Bayonne, dont les 18 libellés officiels sont directement exploitables, la remplace dans cette vague.

À Chambéry, les séries Biollay, Stade, Bissy, Chambéry le Haut, Mérande, Centre Ville et Montmélian sont réellement dissoutes. À Vannes, il en va de même pour Ménimur et Kercado. Chaque plaque groupée conserve ses `sourceIrisIds`, ses libellés sources et son nombre de cellules.

## Presets de fly

| Ville | Centre | Zoom | Pitch | Vitesse | Courbe |
| --- | --- | ---: | ---: | ---: | ---: |
| Troyes | 4.07613, 48.29239 | 13.45 | 60 | 0.85 | 1.4 |
| Valence | 4.91639, 44.92342 | 12.80 | 60 | 0.85 | 1.4 |
| Chambéry | 5.90635, 45.58223 | 13.35 | 60 | 0.85 | 1.4 |
| Niort | -0.46132, 46.32737 | 12.40 | 60 | 0.85 | 1.4 |
| Lorient | -3.38009, 47.74938 | 13.60 | 60 | 0.85 | 1.4 |
| Quimper | -4.09720, 47.99816 | 12.25 | 60 | 0.85 | 1.4 |
| Montauban | 1.36455, 44.02168 | 12.30 | 60 | 0.85 | 1.4 |
| Beauvais | 2.08770, 49.44254 | 12.95 | 60 | 0.85 | 1.4 |
| Vannes | -2.74845, 47.65770 | 12.70 | 60 | 0.85 | 1.4 |
| Cholet | -0.87496, 47.03584 | 12.55 | 60 | 0.85 | 1.4 |
| La Roche-sur-Yon | -1.41620, 46.66595 | 12.25 | 60 | 0.85 | 1.4 |
| Bayonne | -1.46109, 43.48438 | 13.15 | 60 | 0.85 | 1.4 |

Chaque entrée statique `city-*` et chaque entrée nationale `commune-*` converge vers le même preset premium. Les subdivisions sont préchargées pendant le fly, mais leur application attend `moveend` et `map.isMoving() === false`. Le premier atterrissage ne nécessite pas de second clic et les visites suivantes utilisent le cache partagé.

Montauban et La Roche-sur-Yon ont également été ajoutées à l'index statique hors ligne afin que les routes `city-montauban` et `city-la-roche-sur-yon` soient disponibles même avant le chargement de l'index national.

## Consolidation

- corpus national : 5 532 zones administratives et 5 532 zones musique ;
- tuiles : 7 099 tuiles MVT ;
- index de recherche : 5 532 zones ;
- validation géospatiale : 0 erreur, 0 avertissement ;
- vague 4 : 276 labels uniques, aucun suffixe statistique résiduel.

Le contrôle visuel du cadrage et du ressenti des caméras reste à la charge de l'utilisateur : aucun navigateur n'a été utilisé pendant cette vague.
