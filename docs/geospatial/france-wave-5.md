# France — vague 5 Guide Alpha (48 villes)

Date de génération : 14 juillet 2026.

## Résultat

Cette vague ajoute exactement 48 villes intra-muros au runtime partagé. Les données proviennent du WFS officiel IGN / INSEE `STATISTICALUNITS.IRIS:contours_iris`, millésime 2026, sous Licence Ouverte 2.0.

- 1 004 IRIS officiels audités ;
- 928 plaques humaines finales ;
- 76 cellules statistiques dissoutes sans inventer de quartier ;
- 48 GeoJSON canoniques ;
- 48 datasets canoniques et 48 mappings legacy individuels ;
- 48 presets caméra ;
- 96 résolutions de recherche (`city-*` et `commune-*`) ;
- 0 erreur de validation ;
- aucun bâtiment, loader de bâtiment, layer de bâtiment ou contrôle UX de bâtiment ajouté.

Les centres caméra sont les milieux mesurés des bbox officielles. Le zoom est dérivé de l'emprise corrigée par la latitude, arrondi par pas de `0.05` et borné entre `11.8` et `13.6`. Tous les presets partagent le contrat premium actuel : pitch `60`, bearing `0`, speed `0.85`, curve `1.4`.

## Villes et regroupements

| Ville | IRIS source | Plaques humaines |
| --- | ---: | ---: |
| Versailles | 36 | 8 |
| Béziers | 31 | 31 |
| Cherbourg-en-Cotentin | 43 | 43 |
| Antibes | 26 | 26 |
| Ajaccio | 24 | 24 |
| Cannes | 31 | 31 |
| Douai | 14 | 14 |
| Bourges | 28 | 15 |
| La Seyne-sur-Mer | 25 | 25 |
| Fréjus | 19 | 16 |
| Narbonne | 24 | 24 |
| Meaux | 24 | 24 |
| Chartres | 16 | 16 |
| Saint-Quentin | 27 | 6 |
| Arles | 25 | 25 |
| Albi | 21 | 19 |
| Grasse | 17 | 17 |
| Saint-Raphaël | 13 | 13 |
| Laval | 20 | 20 |
| Évreux | 29 | 29 |
| Martigues | 20 | 20 |
| Aubagne | 20 | 20 |
| Saint-Malo | 21 | 21 |
| Annemasse | 10 | 10 |
| Haguenau | 16 | 16 |
| Bastia | 15 | 15 |
| Alès | 15 | 15 |
| Creil | 14 | 14 |
| Belfort | 20 | 18 |
| Charleville-Mézières | 21 | 21 |
| Sète | 20 | 19 |
| Chalon-sur-Saône | 23 | 23 |
| Tarbes | 24 | 24 |
| Saint-Brieuc | 20 | 20 |
| Roanne | 16 | 16 |
| Salon-de-Provence | 15 | 15 |
| Valenciennes | 16 | 16 |
| Châlons-en-Champagne | 23 | 23 |
| Châteauroux | 21 | 19 |
| Arras | 16 | 13 |
| Mâcon | 20 | 20 |
| Castres | 21 | 21 |
| Bourg-en-Bresse | 18 | 18 |
| Angoulême | 20 | 20 |
| Gap | 21 | 21 |
| Draguignan | 12 | 12 |
| Compiègne | 19 | 18 |
| Montélimar | 14 | 14 |
| **Total** | **1 004** | **928** |

Les dissolutions ont été appliquées uniquement aux familles partageant le même nom officiel et le même parent. Elles conservent tous les `sourceIrisIds`, recalculent le point intérieur et produisent un nom visible unique.

## Arrêts sémantiques et remplacements

Huit candidates ont été refusées avant génération afin de respecter le Guide Alpha :

| Candidate refusée | Motif certain | Remplacement retenu |
| --- | --- | --- |
| Colmar | `Sud-Est`, `Sud-Ouest`, `Centre Centre` | Douai |
| Cagnes-sur-Mer | `Le Nord-Est`, `Le Nord-Ouest` | Chartres |
| Les Sables-d'Olonne | `Sud`, `Est-Ouest` | Saint-Raphaël |
| Blois | dissolution produisant `Est`, plus `Interquartiers` | Annemasse |
| Brive-la-Gaillarde | `Poste`, `Sports`, `Caserne`, `Hôpital` | Haguenau |
| Carcassonne | `Saint-Jacques 2 et 3`, `Zone Artisanale` | Creil |
| Istres | `Le Prépaou` et `Prépaou 2` disjoints | Roanne |
| Thionville | `Linkling I II III` ambigu | Mâcon |

Aucun nom inventé ou suffixe artificiel n'a été utilisé pour contourner ces arrêts.

## Runtime et fly

Le manifeste `franceGuideAlphaWaveFive.ts` constitue la source unique de la vague pour :

- les URLs des quartiers et leurs préfixes ;
- les presets caméra ;
- la résolution des résultats `city-*` et `commune-*` ;
- la recherche nationale ;
- le préchargement puis la restauration des quartiers au premier atterrissage.

Le type du fly premium est maintenant aligné sur `CitySubdivisionId`. La vague réutilise le contrôleur, les sources, les layers, les listeners, le cache de préchargement et la restauration `moveend` existants. Elle n'ajoute aucun handler de fly par ville et aucune seconde cible contradictoire.

Le runtime contient désormais 100 villes configurées : 52 historiques et 48 nouvelles.

## Corpus national produit

- corpus canonique : 6 460 zones administratives et 6 460 zones musique ;
- archive PMTiles : 9 677 tuiles, 42 579 740 octets ;
- plus grosse tuile : 398 803 octets ;
- SHA-256 PMTiles : `b2bed93b92b6f6262b0286b404a7f8383b913726c3f7a416f4daf0df830aa30d` ;
- index de recherche : 6 460 zones, 2 594 540 octets ;
- SHA-256 recherche : `3ed6ab0ef19ec8d98426ba7dcdc330edc6380f33a13a9d4855529834dccf5994`.

## Vérifications exécutées

- 99 tests du générateur IRIS et du contrat Guide Alpha : PASS ;
- 14 tests de contrat runtime, dont les 48 fly : PASS ;
- suite géospatiale complète : 147/147 PASS ;
- validation canonique des 6 460 zones : PASS ;
- TypeScript `--noEmit` : PASS ;
- build Vite de production : PASS (avertissement informatif de taille du bundle principal) ;
- trois audits indépendants de 16 villes chacun : PASS.

Conformément à l'instruction utilisateur, aucun navigateur n'a été utilisé. La calibration et l'audit de cette vague sont donc géométriques, contractuels et automatisés ; le contrôle visuel reste sous contrôle utilisateur.
