# Schéma canonique et validation géographique

Date : 2026-07-13

PR : 2 — schéma canonique, IDs stables et premiers validateurs

## Portée

Cette étape ajoute les contrats et les gates du futur pipeline sans modifier le rendu, les GeoJSON legacy ou le contrôleur MapLibre.

## Contrats

Les contrats machine sont :

- `geo/schema/administrative-zone.schema.json` ;
- `geo/schema/music-zone.schema.json` ;
- `geo/schema/dataset-version.schema.json` ;
- `geo/schema/canonical-geography.d.ts`.

Une zone administrative conserve l'identité de la donnée source. Une `MusicZone` conserve l'identité produit affichée et référencée par les profils.

## Identifiants stables

`scripts/geo/lib/id.mjs` crée des UUID v5 opaques et déterministes dans trois namespaces séparés :

- zones administratives ;
- zones produit ;
- versions de dataset.

La clé de registre n'est utilisée que lors de la création initiale ou de la reconstruction contrôlée du mapping. L'UUID produit ne contient aucun nom de ville, nom de quartier ou code IRIS lisible. Une fois le mapping publié, le même UUID est conservé lors d'un renommage ou d'un changement de millésime.

## Validations bloquantes disponibles

- type Polygon ou MultiPolygon ;
- coordonnées longitude/latitude finies ;
- anneaux fermés ;
- aire non nulle ;
- self-intersections simples ;
- UUID valides et uniques ;
- champs obligatoires non vides ;
- source, millésime, statut et qualité ;
- `bbox` conforme à la géométrie ;
- `labelPoint` à l'intérieur de la zone ;
- source administrative existante ;
- parent existant et absence de cycle ;
- dataset publié sans zone draft.

Les validations de couverture, de chevauchement surfacique, de stabilité entre deux versions et de poids des tuiles seront ajoutées lorsque les datasets convertis et les tuiles existeront.

## Audit du couplage frontend

La baseline `geo/catalog/frontend-coupling-baseline.json` enregistre la dette existante :

| Signal | Baseline |
| --- | ---: |
| Littéraux `city-*` | 188 |
| Littéraux `commune-*` | 1 008 |
| Préfixes territoriaux | 509 |
| Branches sur préfixe | 39 |
| Total | 1 744 |

`npm run geo:audit` échoue si une PR augmente une de ces métriques. Une réduction est acceptée. L'objectif de PR 11 est de supprimer le couplage relatif aux zones et aux villes, tout en déplaçant les catalogues ou particularités visuelles nécessaires vers des données versionnées.

## Commandes de reproduction

```bash
npm run test:geo
npm run geo:validate
npm run geo:audit
```

Pour valider un dataset canonique :

```bash
npm run geo:validate -- geo/output/paris.canonical.json
```

Pour obtenir le rapport d'audit complet :

```bash
npm run geo:audit -- --json
```

## Critère de sortie PR 2

- schémas JSON parsables ;
- tests d'UUID, géométrie et dataset verts ;
- audit du couplage stable ou en baisse ;
- build production vert ;
- zéro modification des fichiers runtime de la carte par cette PR.
