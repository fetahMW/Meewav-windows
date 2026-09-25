# France — vague 3 des villes Guide Alpha

Date de consolidation : 2026-07-14
Version canonique : `2026.5-france-wave-3`

## Périmètre livré

La troisième vague ajoute Limoges, Besançon, Mulhouse, Caen, Nancy, Avignon, Poitiers, Pau, La Rochelle, Calais, Dunkerque et Saint-Nazaire.

La source est le référentiel officiel IGN / INSEE Contours IRIS 2026 diffusé par le WFS Géoplateforme. Les 489 cellules IRIS sources produisent 464 plaques visibles portant chacune un nom humain unique.

| Ville | Code commune | IRIS sources | Plaques humaines | Groupement sémantique |
| --- | ---: | ---: | ---: | --- |
| Limoges | 87085 | 56 | 56 | aucun |
| Besançon | 25056 | 52 | 52 | aucun |
| Mulhouse | 68224 | 43 | 43 | aucun |
| Caen | 14118 | 51 | 51 | aucun |
| Nancy | 54395 | 43 | 43 | aucun |
| Avignon | 84007 | 36 | 36 | aucun |
| Poitiers | 86194 | 41 | 41 | aucun |
| Pau | 64445 | 31 | 6 | Centre, Nord, Est, Sud, Ouest et Jurançon |
| La Rochelle | 17300 | 31 | 31 | aucun |
| Calais | 62193 | 31 | 31 | aucun |
| Dunkerque | 59183 | 43 | 43 | aucun |
| Saint-Nazaire | 44184 | 31 | 31 | aucun |
| **Total** | — | **489** | **464** | — |

## Arrêts sémantiques appliqués

Deux candidates initiales n'ont pas été publiées :

- Orléans contient une cellule officielle dont le libellé visible est uniquement `2002` ;
- Annecy contient une cellule officielle nommée `SNR`, sans nom de lieu humain exploitable.

Le Guide Alpha interdit de deviner ou de fabriquer un quartier pour contourner ces défauts. Ces deux villes restent donc hors runtime tant qu'une seconde publication officielle ne permet pas de corriger les libellés avec traçabilité.

Pau illustre le cas accepté : les séries `Pau Centre 1–8`, `Pau Nord 1–6`, `Pau Est 1–8`, `Pau Sud 1–5`, `Pau Ouest 1–3` et `Jurançon 1–2` ont été réellement dissoutes par nom humain et parent. Les 31 identifiants sources restent conservés dans les six plaques groupées.

## Presets de fly

| Ville | Centre | Zoom | Pitch | Vitesse | Courbe |
| --- | --- | ---: | ---: | ---: | ---: |
| Limoges | 1.23189, 45.85852 | 12.25 | 60 | 0.85 | 1.4 |
| Besançon | 6.01226, 47.26020 | 12.55 | 60 | 0.85 | 1.4 |
| Mulhouse | 7.32553, 47.75262 | 13.25 | 60 | 0.85 | 1.4 |
| Caen | -0.37224, 49.18464 | 13.25 | 60 | 0.85 | 1.4 |
| Nancy | 6.17344, 48.68806 | 13.35 | 60 | 0.85 | 1.4 |
| Avignon | 4.83326, 43.94156 | 12.25 | 60 | 0.85 | 1.4 |
| Poitiers | 0.37146, 46.58463 | 12.45 | 60 | 0.85 | 1.4 |
| Pau | -0.34346, 43.32189 | 13.05 | 60 | 0.85 | 1.4 |
| La Rochelle | -1.17648, 46.16204 | 12.75 | 60 | 0.85 | 1.4 |
| Calais | 1.86898, 50.95230 | 12.82 | 60 | 0.85 | 1.4 |
| Dunkerque | 2.34311, 51.01828 | 12.20 | 60 | 0.85 | 1.4 |
| Saint-Nazaire | -2.23916, 47.27684 | 12.60 | 60 | 0.85 | 1.4 |

Chaque entrée statique `city-*` et chaque entrée nationale `commune-*` converge vers le même preset premium. Les subdivisions sont préchargées pendant le fly, mais leur application attend `moveend` et `map.isMoving() === false`. Le premier atterrissage ne nécessite pas de second clic et les visites suivantes utilisent le cache partagé.

## Consolidation

- corpus national : 5 256 zones administratives et 5 256 zones musique ;
- tuiles : 6 398 tuiles MVT ;
- index de recherche : 5 256 zones ;
- validation géospatiale : 0 erreur, 0 avertissement ;
- vague 3 : 464 labels uniques, aucun suffixe statistique résiduel.

Le contrôle visuel du cadrage et du ressenti des caméras reste à la charge de l'utilisateur : aucun navigateur n'a été utilisé pendant cette vague.
