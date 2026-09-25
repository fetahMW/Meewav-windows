# France — vague 2 des villes Guide Alpha

Date de consolidation : 2026-07-14
Version canonique : `2026.4-france-wave-2`

## Périmètre

La deuxième vague ajoute douze villes plus petites que la première vague nationale : Le Havre, Dijon, Angers, Nîmes, Clermont-Ferrand, Le Mans, Aix-en-Provence, Brest, Tours, Amiens, Perpignan et Metz.

La source est le référentiel officiel IGN / INSEE Contours IRIS 2026 diffusé par le WFS Géoplateforme. Les 727 cellules IRIS sources produisent 628 plaques visibles portant chacune un nom humain unique.

| Ville | Code commune | IRIS sources | Plaques humaines | Groupement sémantique |
| --- | ---: | ---: | ---: | --- |
| Le Havre | 76351 | 87 | 87 | aucun |
| Dijon | 21231 | 66 | 66 | aucun |
| Angers | 49007 | 69 | 69 | aucun |
| Nîmes | 30189 | 63 | 63 | aucun |
| Clermont-Ferrand | 63113 | 42 | 42 | aucun |
| Le Mans | 72181 | 71 | 70 | Zone industrielle sud 1–2 |
| Aix-en-Provence | 13001 | 54 | 46 | Encagnane 1–4, Jas 1–6 |
| Brest | 29019 | 64 | 64 | aucun |
| Tours | 37261 | 57 | 22 | familles IRIS numérotées dissoutes par nom et parent |
| Amiens | 80021 | 58 | 23 | familles IRIS numérotées dissoutes par nom et parent |
| Perpignan | 66136 | 47 | 27 | familles IRIS numérotées dissoutes par nom et parent |
| Metz | 57463 | 49 | 49 | aucun |
| **Total** | — | **727** | **628** | — |

## Correction permanente du Guide Alpha

Un IRIS officiel n'est plus considéré automatiquement comme un quartier produit. Le générateur applique désormais un arrêt bloquant avant écriture si :

- une famille visible conserve des suffixes statistiques `Nom 1`, `Nom 2` ou une variante collée comme `Nom4` ;
- deux plaques visibles conservent le même nom humain ;
- un libellé purement technique est exposé ;
- un regroupement perd les identifiants IRIS sources ou traverse un parent officiel.

Le numéro n'est jamais simplement masqué. Les géométries sont réellement dissoutes, uniquement lorsqu'elles partagent le même nom humain de base et le même parent officiel. Les plaques groupées conservent `sourceIrisIds`, `sourceIrisLabels`, `sourceZoneCount` et `groupingRule`.

## Presets de fly

| Ville | Centre | Zoom | Pitch | Vitesse | Courbe |
| --- | --- | ---: | ---: | ---: | ---: |
| Le Havre | 0.13117, 49.49580 | 12.90 | 60 | 0.85 | 1.4 |
| Dijon | 5.03222, 47.33187 | 12.82 | 60 | 0.85 | 1.4 |
| Angers | -0.56293, 47.48190 | 13.05 | 60 | 0.85 | 1.4 |
| Nîmes | 4.34286, 43.83216 | 11.95 | 60 | 0.85 | 1.4 |
| Clermont-Ferrand | 3.11271, 45.78705 | 13.08 | 60 | 0.85 | 1.4 |
| Le Mans | 0.19570, 47.98190 | 12.85 | 60 | 0.85 | 1.4 |
| Aix-en-Provence | 5.38794, 43.53601 | 11.80 | 60 | 0.85 | 1.4 |
| Brest | -4.49963, 48.40846 | 12.78 | 60 | 0.85 | 1.4 |
| Tours | 0.69494, 47.39427 | 13.15 | 60 | 0.85 | 1.4 |
| Amiens | 2.28468, 49.89871 | 12.85 | 60 | 0.85 | 1.4 |
| Perpignan | 2.90451, 42.69903 | 12.62 | 60 | 0.85 | 1.4 |
| Metz | 6.19623, 49.10483 | 12.92 | 60 | 0.85 | 1.4 |

Chaque recherche statique `city-*` et chaque résultat national `commune-*` converge vers le même preset premium et le même `CitySubdivisionId`. La collection est préchargée pendant le fly mais n'est appliquée qu'après `moveend` et lorsque `map.isMoving()` est faux. Le premier atterrissage ne doit donc jamais demander un second clic ; les visites suivantes réutilisent la promesse et la collection en cache.

## Artefacts consolidés

- corpus canonique national : 4 792 zones administratives et 4 792 zones musique ;
- tuiles : 5 746 tuiles MVT, PMTiles `france-zones-all.pmtiles` ;
- index de recherche : 4 792 zones ;
- validation géospatiale : 0 erreur, 0 avertissement ;
- labels de la vague 2 : 628 noms uniques, aucune famille numérotée résiduelle.

Le contrôle visuel du ressenti des caméras reste volontairement à la charge de l'utilisateur : aucun navigateur n'a été utilisé pendant cette vague.
