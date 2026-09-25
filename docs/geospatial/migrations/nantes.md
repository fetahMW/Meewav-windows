# Migration canonique — nantes

Date : 2026-07-13

## Résultat

- Zones administratives : 255
- Music zones : 255
- Erreurs bloquantes : 0
- Avertissements de validation : 0
- Avertissements de conversion : 118
- Dataset valide : oui

## Sources converties

| Fichier legacy | Features |
| --- | ---: |
| `public/map/nantes-quartiers.geojson` | 94 |
| `public/map/nantes-metropole-communes.geojson` | 23 |
| `public/map/nantes-metropole-subzones.geojson` | 138 |

## Avertissements de conversion

| Code | Nombre |
| --- | ---: |
| `parent.not_materialized` | 117 |
| `geometry.degenerate_polygon_removed` | 1 |

## Garanties

- Les géométries existantes sont conservées ; seules les coordonnées legacy encodées en chaînes sont normalisées en positions GeoJSON numériques.
- Chaque ancien ID possède un UUID produit stable.
- Les parents réellement présents dans le corpus sont convertis ; les groupes de présentation sans géométrie restent documentés comme non matérialisés.
- Aucun fichier frontend n'est modifié par cette migration.
