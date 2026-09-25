# Migration canonique — lille

Date : 2026-07-13

## Résultat

- Zones administratives : 590
- Music zones : 590
- Erreurs bloquantes : 0
- Avertissements de validation : 0
- Avertissements de conversion : 157
- Dataset valide : oui

## Sources converties

| Fichier legacy | Features |
| --- | ---: |
| `public/map/lille-quartiers.geojson` | 61 |
| `public/map/lille-metropole-communes.geojson` | 96 |
| `public/map/lille-metropole-subzones.geojson` | 433 |

## Avertissements de conversion

| Code | Nombre |
| --- | ---: |
| `parent.not_materialized` | 157 |

## Garanties

- Les géométries existantes sont conservées ; seules les coordonnées legacy encodées en chaînes sont normalisées en positions GeoJSON numériques.
- Chaque ancien ID possède un UUID produit stable.
- Les parents réellement présents dans le corpus sont convertis ; les groupes de présentation sans géométrie restent documentés comme non matérialisés.
- Aucun fichier frontend n'est modifié par cette migration.
