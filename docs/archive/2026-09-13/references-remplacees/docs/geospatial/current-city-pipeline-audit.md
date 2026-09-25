# Audit du pipeline cartographique actuel

Date : 2026-07-13

Branche : `test/national-geo-pipeline`

Référence stable : `backup-before-national-geo-pipeline` (`b10f4041`)

Périmètre : PR 1 — audit et documentation uniquement

## Décision de sécurité

Le dépôt n'a pas été réaligné sur `origin/main` avant l'audit. La branche locale `main` était en retard de 79 commits et `origin/main` divergeait de l'état fonctionnel courant de 6 commits d'un côté et 134 de l'autre. Un `git pull` aurait donc remplacé le golden master réellement utilisé par le produit.

Le point de départ retenu respecte l'intention de la consigne de sécurité :

- aucun commit n'est réalisé sur `main` ;
- le tag `backup-before-national-geo-pipeline` pointe sur le dernier état stable, splash inclus ;
- la branche `test/national-geo-pipeline` part exactement de ce tag ;
- les fichiers non suivis déjà présents dans le worktree sont conservés sans modification ;
- le moteur, les GeoJSON, les bâtiments et les comportements legacy restent intacts.

Le retour arrière immédiat est documenté dans `docs/geospatial/rollback.md`.

## Résumé exécutif

Le moteur de rendu n'a pas besoin d'être reconstruit. Le dépôt possède déjà une base MapLibre réutilisable : sources et layers de sélection fixes, `promoteId`, `feature-state`, états `hovered`, `selected` et `dimmed`, contrôleur de sélection mutualisé et chargement des bâtiments à la zone.

Le verrou principal est ailleurs : l'intégration des données est encore spécifique à chaque territoire. Une ville exige aujourd'hui une combinaison de GeoJSON, préfixes, constantes React, configurations, presets de caméra, règles de recherche, scripts NPM, générateurs et manifests de bâtiments. Le guide Alpha décrit correctement ce processus artisanal, mais confirme qu'il est conçu pour une intégration ville par ville et non pour une couverture nationale.

L'objectif de la migration est donc de conserver le rendu MapLibre et de remplacer progressivement ces branchements territoriaux par un référentiel versionné et un pipeline de données générique. Paris reste le golden master.

## Entrée cartographique canonique

La carte produit canonique est :

```text
/globe
  -> src/features/globe/MonGlobe.tsx
  -> src/features/globe/components/GlobeMapV2.tsx
```

Cette règle est déjà documentée dans `docs/MON_GLOBE_CANONICAL.md`. Les anciens prototypes et routes de carte ne font pas partie de la migration nationale.

## Taille et concentration du code actuel

| Fichier | Lignes | Taille | Responsabilité actuelle |
| --- | ---: | ---: | --- |
| `src/features/globe/components/GlobeMapV2.tsx` | 18 023 | 696 730 octets | Carte, caméra, recherche, points, villes, overlays, splash et orchestration générale |
| `src/features/globe/selectedExtrusion/selectedZoneExtrusionController.ts` | 3 924 | 155 486 octets | Chargement, normalisation, sélection, dimming, événements et cas territoriaux |
| `src/features/globe/selectedExtrusion/selectedZoneExtrusionLayers.ts` | 902 | 29 511 octets | Sources et layers MapLibre partagés |
| `src/features/globe/selectedExtrusion/selectedZoneBuildingLoader.ts` | 662 | 24 119 octets | Routage par préfixe vers les manifests et fichiers de bâtiments |
| `src/features/globe/selectedExtrusion/selectedZoneExtrusionTypes.ts` | 270 | 10 755 octets | Contrats, constantes d'URL, normalisation Paris et types runtime |
| `src/features/globe/selectedExtrusion/citySubdivisionConfig.ts` | 158 | 5 790 octets | Registre explicite des sept villes intégrées |
| `server/mvt-tile-server/index.js` | 4 503 | 157 268 octets | API et MVT dynamiques des avatars, sans référentiel géographique statique |

`GlobeMapV2.tsx` contient actuellement 212 littéraux de type `commune-*`, 60 littéraux de type `city-*` et au moins 25 littéraux de préfixes territoriaux. Il contient également une liste complète des 12 `zoneId` de Trappes.

## Villes et territoires déjà intégrés

Le terme « intégré » signifie ici que le dépôt contient les données de zones et la mécanique runtime correspondante. Il ne signifie pas qu'une couverture métropolitaine ou nationale est complète.

| Territoire | Niveau ville | Niveau périphérique | Bâtiments | Statut observé |
| --- | --- | --- | --- | --- |
| Paris | 80 quartiers administratifs | Grand Paris : 123 communes et 904 sous-zones | Oui | Golden master produit, mais schéma de zones legacy |
| Nice | 146 IRIS | Métropole : 50 communes et 92 sous-zones | Oui | Intégré, avec assets terrain/relief spécifiques |
| Lyon | 185 IRIS | Métropole : 57 communes et 327 sous-zones | Oui | Intégré |
| Nantes | 94 microquartiers | Métropole : 23 communes et 138 sous-zones | Oui | Intégré et documenté comme référence Guide Alpha |
| Marseille | 111 quartiers officiels | Métropole : 91 communes et 386 sous-zones | Oui | Intégré, charge de données legacy la plus lourde |
| Lille | 84 IRIS | Métropole : 96 communes et 433 sous-zones | Oui | Intégré, avec traitement des communes associées |
| Trappes | 12 IRIS | Aucun entourage équivalent à Paris | Oui | Intégré comme ville isolée, millésime ancien |
| Saint-Denis legacy | 8 zones manuelles | Chevauche aussi la représentation Grand Paris | Oui | Double représentation à réconcilier |

Les 15 polygones de `public/map/france-urban-areas.geojson` sont Paris, Marseille, Lyon, Lille, Toulouse, Bordeaux, Nantes, Nice, Strasbourg, Montpellier, Rennes, Grenoble, Rouen, Toulon et Reims. Seules Paris, Marseille, Lyon, Lille, Nantes et Nice disposent d'une intégration de subdivisions dans ce groupe. Trappes est accessible par recherche/preset, mais n'est pas un polygone `city-*` de ce fichier.

## Inventaire exact des données de zones

| Fichier | Features | Géométrie | Source ou provenance enregistrée | Millésime | Écart canonique principal |
| --- | ---: | --- | --- | --- | --- |
| `src/features/globe/data/paris-quartiers.geojson` | 80 | Polygon | Non enregistrée dans le fichier | Non enregistré | Pas de `feature.id`, `zoneId`, source, licence, `bbox` ou `labelPoint` canonique |
| `public/map/grand-paris-communes-overview.geojson` | 123 | Polygon | `geo.api.gouv.fr` | Non normalisé | Propriété `id` legacy, métadonnées incomplètes |
| `public/map/grand-paris-subzones.geojson` | 904 | Polygon/MultiPolygon | Consolidation produit depuis IRIS IGN/INSEE | Incomplet | Définitions produit manuelles, métadonnées incomplètes |
| `public/map/nice-quartiers.geojson` | 146 | MultiPolygon | IGN/INSEE IRIS | 2026 | Pas de `bbox` stockée |
| `public/map/nice-metropole-communes.geojson` | 50 | Polygon/MultiPolygon | Nice Open Data | 2022 | Registre et chargement spécifiques |
| `public/map/nice-metropole-subzones.geojson` | 92 | MultiPolygon | IGN/INSEE IRIS | 2026 | Registre et chargement spécifiques |
| `public/map/lyon-quartiers.geojson` | 185 | Polygon | Data Grand Lyon | 2026 | Pas de `bbox` stockée |
| `public/map/lyon-metropole-communes.geojson` | 57 | MultiPolygon | Data Grand Lyon | 2024 | Registre et chargement spécifiques |
| `public/map/lyon-metropole-subzones.geojson` | 327 | Polygon | Data Grand Lyon | 2026 | Registre et chargement spécifiques |
| `public/map/nantes-quartiers.geojson` | 94 | Polygon/MultiPolygon | Nantes Métropole NAOGeoW | 2023 | Pas de `bbox` stockée |
| `public/map/nantes-metropole-communes.geojson` | 23 | Polygon | Nantes Open Data | 2022 | Registre et chargement spécifiques |
| `public/map/nantes-metropole-subzones.geojson` | 138 | MultiPolygon | IGN/INSEE IRIS | 2026 | Registre et chargement spécifiques |
| `public/map/marseille-quartiers.geojson` | 111 | Polygon/MultiPolygon | Aix-Marseille-Provence | 2015 | Source ancienne et chargement spécifique |
| `public/map/marseille-metropole-communes.geojson` | 91 | Polygon/MultiPolygon | AMP / IGN BD TOPO v3 | 2022 | Volume GeoJSON élevé |
| `public/map/marseille-metropole-subzones.geojson` | 386 | MultiPolygon | IGN/INSEE IRIS | 2026 | Volume GeoJSON élevé |
| `public/map/lille-quartiers.geojson` | 84 | MultiPolygon | IGN/INSEE IRIS | 2026 | Pas de `bbox` stockée |
| `public/map/lille-metropole-communes.geojson` | 96 | MultiPolygon | MEL Open Data | 2026 | Gestion particulière des communes associées |
| `public/map/lille-metropole-subzones.geojson` | 433 | MultiPolygon | IGN/INSEE IRIS | 2026 | Registre et chargement spécifiques |
| `public/map/trappes-quartiers.geojson` | 12 | Polygon | Saint-Quentin-en-Yvelines Open Data | 2015 | Liste complète des IDs recopiée dans React |
| `public/map/saint-denis-subzones.geojson` | 8 | Polygon | Configuration legacy manuelle | Non normalisé | Double représentation avec Grand Paris |

Les fichiers récents disposent généralement d'un `feature.id` égal au `zoneId`, d'un nom, d'une source, d'un millésime et d'un point de label. Aucun des jeux audités ne stocke systématiquement la `bbox` requise par le futur schéma canonique.

## Pipeline manuel actuel

Le Guide Alpha et les générateurs permettent de reconstruire le parcours actuel :

1. trouver une source locale ou nationale adaptée à la ville ;
2. télécharger et nettoyer les géométries ;
3. créer des IDs préfixés par la ville ;
4. générer un GeoJSON de quartiers ;
5. éventuellement générer un GeoJSON de communes métropolitaines ;
6. éventuellement générer un GeoJSON de sous-zones métropolitaines ;
7. ajouter la ville dans `citySubdivisionConfig.ts` ;
8. ajouter des URLs et préfixes dans les types et le loader ;
9. ajouter un preset de recherche et de caméra dans `GlobeMapV2.tsx` ;
10. ajouter des branches de focus, préchargement ou visibilité si nécessaires ;
11. ajouter une ou plusieurs commandes NPM nommées par ville ;
12. générer un fichier de bâtiment par zone et un manifest par dossier ;
13. vérifier manuellement la caméra, les labels, l'extrusion et le retour à la ville.

Cette chaîne explique pourquoi l'ajout d'une ville provoque aujourd'hui un diff frontend et plusieurs scripts spécifiques.

## Scripts territoriaux actuels

Les scripts suivants sont directement nommés par territoire :

- `scripts/generate-grand-paris-communes-overview.ts` ;
- `scripts/generate-grand-paris-subzone-buildings.ts` ;
- `scripts/generate-nice-districts.ts` ;
- `scripts/generate-nice-metropole-communes.ts` ;
- `scripts/generate-lyon-districts.ts` ;
- `scripts/generate-lyon-metropole-communes.ts` ;
- `scripts/generate-nantes-districts.ts` ;
- `scripts/generate-nantes-metropole-communes.ts` ;
- `scripts/generate-marseille-districts.ts` ;
- `scripts/generate-marseille-metropole-communes.ts` ;
- `scripts/generate-lille-districts.ts` ;
- `scripts/generate-lille-metropole-communes.ts` ;
- `scripts/generate-trappes-districts.ts` ;
- `scripts/generate-paris-district-buildings.ts` ;
- `scripts/generate-saint-denis-subzone-buildings.ts` ;
- `scripts/generate-seine-saint-denis-boundary.ts` ;
- `scripts/grand-paris-subzone-definitions.json`.

`package.json` expose 27 commandes de génération/audit nommées par Paris, Grand Paris, Saint-Denis, Nice, Lyon, Nantes, Marseille, Lille ou Trappes. Le générateur de bâtiments est partiellement mutualisé, mais son objet `CITY_CONFIGS` contient encore une entrée explicite pour Paris, chaque ville et chaque métropole.

## Mécanique MapLibre déjà réutilisable

Le socle suivant doit être conservé :

- sources fixes `selected-zone-polygons`, `selected-zone-polygons-render`, `selected-zone-label-points` et `selected-district-buildings` ;
- layers fixes `selected-zone-fill`, `selected-zone-interior-light`, `selected-zone-hover-glow`, `selected-zone-outline`, `selected-zone-hitbox`, `selected-zone-labels` et `selected-district-buildings-extrusion` ;
- `promoteId: "zoneId"` pour les zones et `promoteId: "id"` pour les bâtiments ;
- états `hovered`, `selected` et `dimmed` pilotés par `feature-state` ;
- listeners de clic et de survol partagés ;
- animation d'extrusion partagée ;
- chargement paresseux du fichier de bâtiments correspondant à la zone sélectionnée ;
- cache LRU borné du loader de bâtiments ;
- comportement de sélection/désélection et événements déjà utilisés par l'UI.

La migration ne doit pas recréer un layer par ville ni un layer par zone.

## Spécificités encore présentes dans le runtime

### Normalisation et identifiants

`normalizeSelectableZoneFeature` dérive encore certaines propriétés depuis des préfixes, traite Grand Paris séparément et reconstruit les IDs de Paris à l'exécution. `normalizeParisQuartierZoneId` produit un ID de type `paris_<arrondissement>_<nom normalisé>` : un renommage peut donc modifier l'identifiant d'une zone, ce qui est incompatible avec un identifiant utilisateur permanent.

### Caméra

`GlobeMapV2.tsx` contient des presets explicites pour Paris, Nice, Marseille, Lyon, Nantes, Lille et Trappes. Les valeurs actuelles sont :

| Ville | Centre | Zoom | Pitch | Bearing |
| --- | --- | ---: | ---: | ---: |
| Paris | `[2.3522, 48.8566]` | 11.80 | 60 | 0 |
| Nice | `[7.25281, 43.70316]` | 12.73 | 60 | 0 |
| Marseille | `[5.38064, 43.28034]` | 11.80 | 60 | 0 |
| Lyon | `[4.83508, 45.75783]` | 12.70 | 60 | 0 |
| Nantes | `[-1.55155, 47.22354]` | 12.64 | 60 | 0 |
| Lille | `[3.06047, 50.62902]` | 13.48 | 60 | 0 |
| Trappes | `[1.9963887, 48.7737957]` | 12.95 | 60 | 0 |

Les futurs réglages équivalents doivent devenir des données `cameraOverride`, avec `fitBounds` comme comportement par défaut.

### Recherche

Le dépôt charge `public/search/france-communes-index.json`, un fichier JSON de 20 888 099 octets contenant 35 104 communes et généré le 2026-06-14 depuis `geo.api.gouv.fr`. À côté de cet index national existent encore :

- des entrées statiques dans `franceCityIndex.ts` ;
- `SEARCH_RESULT_PRESET_BY_ID` pour les villes terminées ;
- des correspondances explicites `city-*` et `commune-*` vers une configuration de subdivision ;
- 25 correspondances Grand Paris écrites à la main ;
- de grands tableaux d'offsets et de priorités de labels de communes dans React.

La recherche est donc nationale pour les noms de communes, mais la navigation produit vers les zones reste spécifique aux villes intégrées. Le fichier JSON national massif devra lui-même être remplacé par un index compact ou une API, sans charger toute la France dans le navigateur.

### Bâtiments

L'inventaire des 14 manifests actuels donne :

| Scope | Fichiers de zone | Features bâtiments | Taille GeoJSON |
| --- | ---: | ---: | ---: |
| Paris | 80 | 83 737 | 53,60 Mio |
| Nice | 146 | 40 238 | 21,41 Mio |
| Métropole Nice | 92 | 93 287 | 48,73 Mio |
| Lyon | 185 | 37 919 | 21,53 Mio |
| Métropole Lyon | 327 | 186 474 | 100,36 Mio |
| Nantes | 94 | 60 639 | 32,33 Mio |
| Métropole Nantes | 138 | 152 610 | 83,50 Mio |
| Marseille | 111 | 169 136 | 85,11 Mio |
| Métropole Marseille | 386 | 461 689 | 248,46 Mio |
| Lille | 84 | 33 953 | 18,70 Mio |
| Métropole Lille | 433 | 365 229 | 193,20 Mio |
| Trappes | 12 | 3 631 | 1,97 Mio |
| Grand Paris | 904 | 652 289 | 349,59 Mio |
| Saint-Denis legacy | 8 | 20 972 | 11,24 Mio |
| **Total** | **3 000** | **2 361 803** | **1 273,01 Mio** |

Tous les fichiers référencés par ces manifests existent. Le loader choisit cependant le manifest avec une chaîne de conditions sur les préfixes de zone, puis retombe par défaut sur Paris.

Le dossier `public/buildings/paris/` contient en plus cinq anciens fichiers sans manifest et sans référence runtime trouvée. Il est classé comme candidat legacy/orphelin, sans suppression avant la PR 11.

### Serveur MVT et PostGIS

`server/mvt-tile-server/` est déjà exploitable pour les données dynamiques d'avatars. Il fournit des routes MVT, utilise PostGIS, possède des index spatiaux et sépare déjà un fallback GeoJSON d'un mode MVT via `VITE_USE_VECTOR_TILE_SERVER`.

Il ne constitue pas encore le référentiel de géographie statique :

- `init.sql` ne crée que la table de musiciens et des points de démonstration ;
- aucune table `administrative_zones` ou `music_zones` n'existe ;
- aucun pipeline PMTiles n'existe ;
- aucune API point vers zone n'existe ;
- aucune version de dataset géographique n'est enregistrée.

La nouvelle architecture peut réutiliser les conventions de connexion et de déploiement du serveur, mais les modules géographiques devront être isolés du fichier `index.js` monolithique.

## Dette par territoire

### Paris

- Golden master visuel et fonctionnel à préserver au pixel et au comportement près.
- 80 géométries existantes réutilisables.
- Schéma brut différent de toutes les villes récentes.
- IDs dérivés du nom à l'exécution.
- Source, licence et millésime absents du GeoJSON.
- `bbox` et `labelPoint` canoniques à calculer.
- Recherche et comportement d'overview distincts.
- Préchargement des bâtiments activé.

### Grand Paris

- 123 communes et 904 zones produit déjà générées.
- 135 définitions produit demandent 989 labels, mais 12 parents sont absents de l'output : Saint-Germain-en-Laye, Poissy, Sartrouville, Houilles, Massy, Chelles, Torcy, Meaux, Melun, Versailles, Cergy et Évry-Courcouronnes.
- Définitions produit manuelles dans `scripts/grand-paris-subzone-definitions.json`.
- Branches de caméra, dimming, couleurs et chargement propres au Grand Paris.
- Layer legacy supplémentaire `meewav-selected-buildings-93` pour la Seine-Saint-Denis.
- 904 fichiers de bâtiments individuels.

### Saint-Denis

- Huit zones standalone legacy et dix zones produit dans le référentiel Grand Paris observé.
- Deux jeux d'IDs, deux fichiers de zones et deux chemins de bâtiments.
- Une table de correspondance et une décision produit sont requises avant migration.

### Trappes

- Douze IRIS officiels réutilisables.
- Liste complète des douze IDs recopiée dans `GlobeMapV2.tsx`.
- Preset, recherche, générateur, manifest et préfixe propres à la ville.
- Source millésimée 2015.
- Aucun contexte de communes/secteurs autour de Trappes équivalent à la vue Paris.

### Nice

- Ville et métropole déjà structurées avec IDs et millésimes.
- Terrain feathered, colline du Château et assets de relief spécifiques à préserver comme expérience visuelle, mais à dissocier du référentiel de zones.
- Règles de zoom et caméra spécifiques actuelles.

### Lyon

- Jeux ville/métropole réutilisables issus de Data Grand Lyon.
- Deux millésimes actuels entre communes et sous-zones.
- Scripts, préfixes, caméra et manifests encore spécifiques.

### Nantes

- Corpus le mieux documenté par le Guide Alpha.
- 94 microquartiers et 138 sous-zones métropolitaines réutilisables.
- Exception historique de préchargement sur hover à mesurer avant suppression.
- Scripts, préfixes, caméra et manifests encore spécifiques.

### Marseille

- Quartiers officiels et métropole réutilisables.
- Fichiers GeoJSON source volumineux, dont plus de 4 Mio pour les communes métropolitaines.
- Plus gros ensemble de bâtiments hors Grand Paris : 461 689 features pour la métropole.
- Millésimes hétérogènes 2015, 2022 et 2026 à tracer explicitement.

### Lille

- Ville et métropole réutilisables.
- Traitement des communes associées à préserver dans l'import canonique.
- Zoom minimal et presets particuliers actuels.
- Scripts, préfixes, caméra et manifests encore spécifiques.

## Écarts Paris versus autres villes

| Sujet | Paris | Villes récentes | Conséquence de migration |
| --- | --- | --- | --- |
| Schéma source | Brut, sans `zoneId` | Canonique partiel | Convertisseur Paris obligatoire |
| Identifiant | Dérivé du nom | Généralement stocké | Table legacy vers ID stable |
| Provenance | Absente du fichier | Souvent présente | Provenance Paris à documenter avant publication |
| Métropole | Grand Paris produit très curaté | Communes + IRIS | Modèle `MusicZone` doit accepter fusion/renommage |
| Caméra | Golden master | Presets manuels | Mesure Paris puis généralisation `bbox` + override |
| Bâtiments | 80 fichiers + anciens orphelins | Manifest par territoire | Adapter sans changer le rendu avant tuilage générique |
| Recherche | Cas particulier | Preset par ville | Index générique par `zoneId` |

## Éléments à conserver et à réutiliser

- MapLibre GL JS 5.24 et la projection globe actuelle ;
- la route canonique `/globe` ;
- les styles, couleurs, opacités, hauteurs, transitions et interactions de Paris ;
- les sources/layers MapLibre partagés de sélection ;
- le système `feature-state` ;
- les géométries de toutes les villes terminées ;
- les noms produit existants et leur ordre ;
- les bâtiments et manifests existants comme fallback legacy ;
- les points lumineux et la logique de fly pendant la phase de comparaison ;
- la source MVT dynamique des avatars ;
- les métriques de performance du 2026-07-09 comme seuil de référence ;
- le Guide Alpha comme inventaire des étapes manuelles et contrats UX.

## Éléments à retirer seulement après parité complète

Les éléments suivants sont des candidats de PR 11, pas des suppressions autorisées maintenant :

- registres et conditions par ville dans `citySubdivisionConfig.ts` et `GlobeMapV2.tsx` ;
- routage de manifests par préfixe dans `selectedZoneBuildingLoader.ts` ;
- constantes d'URL territoriales dans `selectedZoneExtrusionTypes.ts` ;
- commandes NPM et générateurs nommés par ville, après remplacement par la CLI générique ;
- GeoJSON browser propres à chaque ville, après publication et validation des PMTiles ;
- manifests et dossiers de bâtiments par ville, après validation du tileset générique ;
- représentation Saint-Denis legacy, après mapping et validation produit ;
- cinq fichiers probablement orphelins de `public/buildings/paris/` ;
- branches de caméra/recherche/préchargement spécifiques devenues des données.

Aucun de ces fichiers ne doit être supprimé avant validation explicite de Paris, des villes terminées, des communes autour de Paris et du rollback legacy.

## Risques de migration

| Risque | Gravité | Détection | Réduction |
| --- | --- | --- | --- |
| Perte de parité visuelle Paris | Critique | Captures pixel à pixel desktop/mobile | Golden master, mode comparison, aucun retrait legacy |
| Changement d'ID utilisateur | Critique | Diff des mappings et test de stabilité | ID produit stable + aliases legacy persistants |
| Disparition de bâtiments | Critique | Comptage par zone et captures | Adapter legacy conservé jusqu'à PR 10 |
| Mauvais point vers zone | Élevée | Tests point-in-polygon et cas limites | Géométrie précise en PostGIS, fallback commune |
| Trous/chevauchements de couverture | Élevée | Validateur topologique | Règles de couverture, simplification cohérente |
| Régression caméra/fly | Élevée | Replays Paris et villes | `bbox` par défaut, overrides versionnés |
| Régression performance | Élevée | Même scénario que l'audit 2026-07-09 | Budget tuiles, timings, nombre de layers fixe |
| Divergence de millésimes | Moyenne | Rapport de publication | Dataset versionné et relations source explicites |
| Noms administratifs non reconnus | Moyenne | Revue produit | Couche `MusicZone`, alias et fusions |
| PMTiles/CDN indisponible | Élevée | Test de panne | Flag par défaut legacy et bascule immédiate |
| Import France lancé trop tôt | Élevée | Revue de PR | Ordre imposé : convertisseur et Paris avant national |
| Monolithe serveur aggravé | Moyenne | Revue structurelle | Modules géographiques séparés de `index.js` |

## Gates de référence

La baseline déjà disponible donne :

- build production réussi ;
- MapLibre 5.24 ;
- 83 layers et 23 sources dans le style audité ;
- 36 layers actifs au zoom Charonne audité ;
- zéro rendu/draw/repaint au repos sur 2,5 secondes ;
- scénario caméra de 4,8 secondes avec 433 renders MapLibre après optimisation ;
- heap Chrome à 130 Mio après scénario ;
- frame la plus lente à 36,2 ms sur ce scénario ;
- passage local vers Globe réduit à 3,35 secondes.

Ces chiffres viennent de `docs/MAP_PERFORMANCE_AUDIT.md`. Ils deviennent les seuils à égaler ou améliorer dans les PR d'intégration. Le lint et `tsc --noEmit` ne sont pas des gates fiables actuellement à cause de dettes préexistantes ; `npm run build`, les validateurs géographiques ciblés et les comparaisons visuelles seront les gates obligatoires.

## Conclusion de l'audit

Le dépôt possède déjà le moteur générique qu'il faut préserver, mais pas encore le référentiel ni le pipeline générique. La bonne migration est additive : canonicaliser d'abord Paris et les villes existantes hors du frontend, générer ensuite un tileset de zones fixe, brancher ce tileset derrière un mode `legacy | national | comparison`, puis démontrer la parité avant toute suppression.

La première implémentation fonctionnelle ne doit pas être un import France entière. Elle doit être Paris, alimenté par le nouveau format canonique, avec zéro perte de rendu et le legacy activable immédiatement.
