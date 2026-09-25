# Migration canonique — paris

Date : 2026-07-13

## Résultat

- Zones administratives : 1115
- Music zones : 1115
- Erreurs bloquantes : 0
- Avertissements de validation : 0
- Avertissements de conversion : 1035
- Dataset valide : oui

## Sources converties

| Fichier legacy | Features |
| --- | ---: |
| `src/features/globe/data/paris-quartiers.geojson` | 80 |
| `public/map/grand-paris-communes-overview.geojson` | 123 |
| `public/map/grand-paris-subzones.geojson` | 904 |
| `public/map/saint-denis-subzones.geojson` | 8 |

## Avertissements de conversion

| Code | Nombre |
| --- | ---: |
| `label_point.recomputed` | 1035 |

## Garanties

- Les géométries existantes sont conservées ; seules les coordonnées legacy encodées en chaînes sont normalisées en positions GeoJSON numériques.
- Chaque ancien ID possède un UUID produit stable.
- Les parents réellement présents dans le corpus sont convertis ; les groupes de présentation sans géométrie restent documentés comme non matérialisés.
- La conversion seule ne modifie aucun fichier frontend. Le branchement runtime est décrit ci-dessous et reste isolé derrière le feature flag.

## Parité golden master — PR 6

Le référentiel canonique conserve désormais les décisions de présentation nécessaires à la parité :

```text
colorIndex
groundColor
territoryType
paletteFamily
overviewVisible
```

Elles sont converties depuis la référence existante, validées par le schéma canonique, puis encodées dans le PMTiles. Le renderer ne contient aucune liste de quartiers, aucun nom de ville et aucun preset ajouté pour Paris.

La vue d'ensemble `national` utilise les cinq layers fixes et la source PMTiles. `overviewVisible` affiche les 80 quartiers de Paris avec les 123 communes environnantes sans superposer les 904 sous-zones. Les surfaces sont placées sous les routes et l'eau comme dans le golden master.

Au clic, `legacy_zone_id` sert uniquement d'adaptateur de transition vers les comportements déjà validés de détail : caméra, sous-zones et bâtiments. Les layers nationaux se masquent durant ce détail puis reviennent lors du retour sous le zoom 12,05. Cette étape préserve la parité pendant que les bâtiments restent volontairement legacy jusqu'à la PR 10.

## Comparaison visuelle

Les deux modes ont été capturés sur le même navigateur, au même preset, au zoom 11,80 et au pitch 60°.

| Scène | Delta RGB moyen | Pixels delta > 10 | Pixels delta > 30 |
| --- | ---: | ---: | ---: |
| Vue d'ensemble Paris | 2,008 / 255 | 1,014 % | 0,0067 % |
| Clic commune et fly | 2,507 / 255 | 0,489 % | 0,240 % |

Captures :

- [référence legacy](../visual-regression/paris-pr6-legacy.jpg)
- [pipeline national](../visual-regression/paris-pr6-national.jpg)
- [différence amplifiée ×6](../visual-regression/paris-pr6-diff-x6.jpg)
- [commune legacy](../visual-regression/paris-pr6-commune-legacy.jpg)
- [commune national](../visual-regression/paris-pr6-commune-national.jpg)
- [différence commune amplifiée ×6](../visual-regression/paris-pr6-commune-diff-x6.jpg)

La caméra du clic commune termine à `zoom 13,73`, `pitch 60°`, centre `48.91280, 2.38855`, contre `zoom 13,74`, `pitch 60°`, centre `48.91281, 2.38856` en legacy.

## Barrières validées

```bash
npm run test:geo   # 19/19
npm run geo:audit  # 1 744 signaux, baseline inchangée
npm run build      # succès
```

Le journal navigateur ne contient aucune nouvelle erreur MapLibre. L'unique avertissement applicatif observé concerne la clé Supabase locale absente et est hors périmètre.

## Retour arrière

Le mode par défaut reste `legacy`. Pour annuler uniquement la parité Paris, revenir au commit runtime précédent :

```bash
git checkout a1dcc5e4
```
