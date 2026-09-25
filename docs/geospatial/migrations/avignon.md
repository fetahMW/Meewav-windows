# Migration canonique — avignon

Date : 2026-07-13

## Résultat

- Zones administratives : 36
- Music zones : 36
- Erreurs bloquantes : 0
- Avertissements de validation : 0
- Avertissements de conversion : 36
- Dataset valide : oui

## Sources converties

| Fichier legacy | Features |
| --- | ---: |
| `public/map/avignon-quartiers.geojson` | 36 |

## Avertissements de conversion

| Code | Nombre |
| --- | ---: |
| `parent.not_materialized` | 36 |

## Garanties

- Les géométries existantes sont conservées ; seules les coordonnées legacy encodées en chaînes sont normalisées en positions GeoJSON numériques.
- Chaque ancien ID possède un UUID produit stable.
- Les parents réellement présents dans le corpus sont convertis ; les groupes de présentation sans géométrie restent documentés comme non matérialisés.
- Aucun fichier frontend n'est modifié par cette migration.
