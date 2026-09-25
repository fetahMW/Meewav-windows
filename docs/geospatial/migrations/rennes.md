# Migration canonique — rennes

Date : 2026-07-13

## Résultat

- Zones administratives : 93
- Music zones : 93
- Erreurs bloquantes : 0
- Avertissements de validation : 0
- Avertissements de conversion : 93
- Dataset valide : oui

## Sources converties

| Fichier legacy | Features |
| --- | ---: |
| `public/map/rennes-quartiers.geojson` | 93 |

## Avertissements de conversion

| Code | Nombre |
| --- | ---: |
| `parent.not_materialized` | 93 |

## Garanties

- Les géométries existantes sont conservées ; seules les coordonnées legacy encodées en chaînes sont normalisées en positions GeoJSON numériques.
- Chaque ancien ID possède un UUID produit stable.
- Les parents réellement présents dans le corpus sont convertis ; les groupes de présentation sans géométrie restent documentés comme non matérialisés.
- Aucun fichier frontend n'est modifié par cette migration.
