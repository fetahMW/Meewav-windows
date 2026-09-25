# Tileset générique des zones

Date : 2026-07-13

PR : 4 — génération MVT et PMTiles

## Résultat

Le pipeline Node génère désormais une archive PMTiles v3 contenant des MVT version 2, sans serveur de tuiles spécialisé et sans charger le GeoJSON canonique complet dans le navigateur.

Le prototype Paris a été produit depuis le dataset canonique de la PR 3 :

| Mesure | Résultat |
| --- | ---: |
| Zones canoniques | 1 115 |
| Régions | 13 |
| Communes | 123 |
| Tuiles adressées | 631 |
| Zooms | 4 à 14 |
| Taille archive | 4 273 655 octets |
| Plus grosse tuile | 245 939 octets |
| Budget bloquant provisoire | 500 000 octets |
| SHA-256 | `5734a8cfefb8d5007f8e88f7bae031dbc2c3fb684023fb009caf5d76c6aae7b2` |

Le manifest reproductible est `geo/tilesets/2026.1-paris-prototype.json`. La sortie canonique de build reste ignorée dans `geo/output/tiles/`. Une copie exacte du prototype est versionnée sous `public/map/national/2026.1-prototype/` afin que le mode expérimental fonctionne localement sans CDN ; elle sera remplacée par une URL versionnée lors de la publication.

## Contrat de source-layers

Le metadata PMTiles déclare un contrat fixe :

```text
regions
departments
communes
music_zones
```

Le prototype contient physiquement `regions`, `communes` et `music_zones`. `departments` reste déclaré mais vide : la donnée départementale nationale n'existe pas encore dans le référentiel local et sera importée en PR 9. Le frontend peut néanmoins conserver un contrat de layer fixe.

Chaque zone tuilée expose notamment :

```text
zone_id
legacy_zone_id
legacy_parent_zone_id
display_name
commune_code
commune_name
parent_zone_id
source_type
source_vintage
quality
status
label_lon
label_lat
color_index
ground_color
territory_type
palette_family
overview_visible
```

`zone_id` est un UUID stable. `legacy_zone_id` est une clé de transition facultative qui permet de comparer le nouveau référentiel à la référence existante sans rendre le nouvel ID dépendant du système historique. L'intégration MapLibre utilise `promoteId: "zone_id"` pour conserver `feature-state`.

Les cinq dernières propriétés sont des décisions de présentation portées par les données : elles reproduisent la palette du golden master, distinguent commune et quartier, et empêchent les sous-zones d'une commune d'être toutes superposées dans la vue d'ensemble. Elles ne contiennent aucune condition par nom de ville dans le renderer.

## Génération

```bash
npm run geo:migrate-existing -- --city paris
npm run geo:build-zones -- \
  --scope paris \
  --version 2026.1-paris-prototype \
  --minzoom 4 \
  --maxzoom 14
```

Le générateur :

1. charge le dataset canonique ;
2. sépare les collections par source-layer ;
3. découpe les géométries avec `@maplibre/geojson-vt` ;
4. encode les MVT avec `@maplibre/vt-pbf` ;
5. écrit une archive PMTiles v3 avec root et leaf directories ;
6. relit l'archive avec le client officiel `pmtiles` ;
7. décode une tuile avec `@mapbox/vector-tile` ;
8. vérifie les layers physiques, les UUID, le header et le budget de taille ;
9. écrit un manifest versionné et un hash SHA-256.

## Compatibilité MapLibre

La documentation officielle MapLibre utilise un `Protocol` PMTiles enregistré via `maplibregl.addProtocol("pmtiles", protocol.tile)`, puis une source vectorielle `url: "pmtiles://..."`.

Références :

- https://maplibre.org/maplibre-gl-js/docs/examples/pmtiles/
- https://github.com/protomaps/PMTiles
- https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md

Le branchement frontend est réalisé par la PR 5 et reste désactivé par défaut. Les modes, le contrat des cinq layers fixes et le protocole de comparaison sont décrits dans `docs/geospatial/runtime-feature-flag.md`.

## Tests

`tests/geospatial/pmtiles-writer.test.mjs` vérifie :

- lecture du header v3 par le client officiel ;
- lecture des metadata ;
- accès aléatoire à une tuile ;
- passage automatique en leaf directories lorsque le root dépasse son budget.

`tests/geospatial/build-zones.test.mjs` génère et décode un prototype Trappes réel avec le même pipeline.

## Limites avant publication

- la simplification et les budgets doivent encore être mesurés visuellement sur Paris ;
- le scope prototype contient uniquement les données existantes, pas encore France entière ;
- le layer `departments` sera rempli en PR 9 ;
- le CDN et les en-têtes HTTP Range/CORS seront configurés lors de la publication ;
- les bâtiments restent séparés jusqu'à la PR 10.
