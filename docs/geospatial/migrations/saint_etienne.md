# Migration canonique — saint_etienne

Date : 2026-07-13

## Résultat

- Zones administratives : 78
- Music zones : 78
- Erreurs bloquantes : 0
- Avertissements de validation : 0
- Avertissements de conversion : 78
- Dataset valide : oui

## Sources converties

| Fichier legacy | Features |
| --- | ---: |
| `public/map/saint-etienne-quartiers.geojson` | 78 |

## Avertissements de conversion

| Code | Nombre |
| --- | ---: |
| `parent.not_materialized` | 78 |

## Garanties

- Les géométries existantes sont conservées ; seules les coordonnées legacy encodées en chaînes sont normalisées en positions GeoJSON numériques.
- Chaque ancien ID possède un UUID produit stable.
- Les parents réellement présents dans le corpus sont convertis ; les groupes de présentation sans géométrie restent documentés comme non matérialisés.
- Aucun fichier frontend n'est modifié par cette migration.
