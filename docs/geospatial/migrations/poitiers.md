# Migration canonique — poitiers

Date : 2026-07-13

## Résultat

- Zones administratives : 41
- Music zones : 41
- Erreurs bloquantes : 0
- Avertissements de validation : 0
- Avertissements de conversion : 41
- Dataset valide : oui

## Sources converties

| Fichier legacy | Features |
| --- | ---: |
| `public/map/poitiers-quartiers.geojson` | 41 |

## Avertissements de conversion

| Code | Nombre |
| --- | ---: |
| `parent.not_materialized` | 41 |

## Garanties

- Les géométries existantes sont conservées ; seules les coordonnées legacy encodées en chaînes sont normalisées en positions GeoJSON numériques.
- Chaque ancien ID possède un UUID produit stable.
- Les parents réellement présents dans le corpus sont convertis ; les groupes de présentation sans géométrie restent documentés comme non matérialisés.
- Aucun fichier frontend n'est modifié par cette migration.
