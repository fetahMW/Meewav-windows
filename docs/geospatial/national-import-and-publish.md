# Import et publication géographiques

Date : 2026-07-13

PR : 9 — import PostGIS versionné et publication immuable

## Résultat

Le pipeline sait maintenant prendre un dataset canonique validé et produire, sans modifier le frontend :

- un import PostGIS transactionnel ;
- un PMTiles avec les quatre source-layers fixes ;
- un index de recherche ;
- les manifests et sommes SHA-256 ;
- un SQL d'activation séparé ;
- un bundle de release immuable.

La préparation d'une release n'active ni la base ni le mode `national`. Le runtime reste en `legacy` tant qu'une promotion explicite n'a pas été effectuée.

## Import PostGIS sans connexion implicite

```bash
npm run geo:import -- \
  --scope trappes \
  --version 2026.1-trappes-candidate \
  --vintage 2015
```

Cette commande produit :

```text
geo/output/imports/2026.1-trappes-candidate/trappes.import.sql
geo/output/imports/2026.1-trappes-candidate/trappes.import-manifest.json
```

Elle n'ouvre aucune connexion réseau et n'exécute aucun SQL. L'application en base reste une opération relue et explicite :

```bash
psql "$DATABASE_URL" -f server/mvt-tile-server/sql/geography.sql
psql "$DATABASE_URL" -f geo/output/imports/2026.1-trappes-candidate/trappes.import.sql
```

Le SQL refuse de réécrire une version déjà active. Les versions antérieures restent dans PostGIS et l'activation passe par `geography_active_datasets`.

## Publication d'un candidat immuable

```bash
npm run geo:publish -- \
  --scope trappes \
  --version 2026.1-trappes-release-v2 \
  --minzoom 8 \
  --maxzoom 14
```

Le bundle contient :

```text
canonical-dataset.json
france-zones.pmtiles
music-zones-search.json
tiles-manifest.json
search-manifest.json
postgis-import.sql
postgis-validate.sql
postgis-activate.sql
release-manifest.json
```

Une version existante n'est jamais écrasée. Il faut choisir un nouveau numéro de version. Avant le renommage atomique du répertoire final, le pipeline recalcule les hashes du PMTiles et de l'index copié.

## Preuve Trappes

Le candidat `2026.1-trappes-release-v2` a été produit à partir du convertisseur générique :

| Mesure | Valeur |
| --- | ---: |
| Zones administratives | 12 |
| Music zones | 12 |
| Tuiles vectorielles | 97 |
| Plus grosse tuile | 3 135 octets |
| Limite bloquante | 500 000 octets |
| Enregistrements de recherche | 12 |
| PMTiles | 70 447 octets |

Hashes de preuve :

- dataset canonique : `dd22f2e7babdaa81905fca0f4d4fe13ccee706c4ad6345c6e3557e19877d251a` ;
- PMTiles : `b2d19ffbf68224f47a8c362a144f31de67c307f31a4466cd9de17f6783698019` ;
- index de recherche : `da44a95febaa94d4664f9e655fa8c6bc38722d56a864ce36bda18dc09256b621` ;
- validation PostGIS : `b5901a1b2166d0d2f6db5637009d78ff4b9ae01dcb9a4daa6ab8bcfffe512630`.

Le manifest de preuve versionné est `geo/releases/2026.1-trappes-release-v2.json`. Les artefacts volumineux restent sous `geo/output`, volontairement ignoré par Git.

## Garde-fous France entière

La commande suivante est volontairement refusée si aucun dataset canonique n'est fourni :

```bash
npm run geo:import -- --scope france --vintage 2026
```

L'import national exige :

```bash
npm run geo:import -- \
  --scope france \
  --vintage 2026 \
  --version 2026.1 \
  --input geo/input/france-2026.canonical.json
```

Cette règle empêche un téléchargement ou un remplacement national implicite. Le fichier doit respecter le schéma canonique, contenir ses licences et millésimes, puis passer `geo:validate`. Le registre `geo/catalog/national-source-registry.json` indique clairement que les quatre collections nationales attendent encore cet input validé ; aucune couverture nationale n'est prétendue dans cette PR.

## Activation contrôlée

Après import, le validateur PostGIS bloque les géométries invalides, les points de label extérieurs, les chevauchements problématiques, une couverture communale inférieure à 95 % et les IDs devenus instables entre deux versions :

```bash
psql "$DATABASE_URL" -f postgis-validate.sql
```

Après ce contrôle et le déploiement des fichiers sur le CDN, l'activation en base utilise uniquement le fichier versionné :

```bash
psql "$DATABASE_URL" -f postgis-activate.sql
```

Ce SQL refuse une version absente, non validée ou contenant des zones `draft`. Le passage de l'interface à `national` reste un changement séparé du feature flag.

## Rollback

Le rollback immédiat de l'interface reste :

```text
USE_NATIONAL_GEO_PIPELINE=legacy
```

Pour la base, il suffit de réactiver l'ancien couple `(dataset_id, version)` dans `geography_active_datasets`. Aucune géométrie historique n'a besoin d'être reconstruite. Pour annuler le code de cette PR :

```bash
git checkout 7a4c7c4e
```

Le système legacy, ses GeoJSON, ses bâtiments et ses contrôleurs n'ont pas été supprimés.
