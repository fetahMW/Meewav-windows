# Migration canonique — marseille

Date : 2026-07-13

## Résultat

- Zones administratives : 588
- Music zones : 588
- Erreurs bloquantes : 0
- Avertissements de validation : 0
- Avertissements de conversion : 202
- Dataset valide : oui

## Sources converties

| Fichier legacy | Features |
| --- | ---: |
| `public/map/marseille-quartiers.geojson` | 111 |
| `public/map/marseille-metropole-communes.geojson` | 91 |
| `public/map/marseille-metropole-subzones.geojson` | 386 |

## Avertissements de conversion

| Code | Nombre |
| --- | ---: |
| `parent.not_materialized` | 202 |

## Garanties

- Les géométries existantes sont conservées ; seules les coordonnées legacy encodées en chaînes sont normalisées en positions GeoJSON numériques.
- Chaque ancien ID possède un UUID produit stable.
- Les parents réellement présents dans le corpus sont convertis ; les groupes de présentation sans géométrie restent documentés comme non matérialisés.
- Aucun fichier frontend n'est modifié par cette migration.
