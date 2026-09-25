# Recherche géographique et résolution point → zone

Date : 2026-07-13

PR : 8 — index générique et API PostGIS

## Index de recherche

La commande suivante construit l'index directement depuis le référentiel canonique :

```bash
npm run geo:build-index -- --scope all --version 2026.1-existing-cities
```

Résultat :

| Mesure | Valeur |
| --- | ---: |
| Zones | 3 440 |
| Taille | 1 405 021 octets |
| SHA-256 | `0b32de60f3b0d48172fe435bfcdbc380d67c7ffe17ca4f33834b69855a8d6331` |

Chaque entrée expose :

```text
zoneId
displayName
aliases
communeCode
communeName
departmentName
regionName
bbox
labelPoint
quality
sourceVintage
cameraOverride
searchKey
```

`departmentName` et `regionName` sont `null` dans le corpus des villes existantes, car ces rattachements ne doivent pas être inventés. Ils seront remplis par l'import national officiel de la PR 9.

Le module `nationalGeoSearch.ts` fournit le chargement de `music-zones-search.json` et la recherche générique côté navigateur. La recherche est insensible aux accents et à la casse, classe d'abord une correspondance exacte et ne transmet ensuite qu'un `zoneId`, une bbox et un `labelPoint`. Le fichier réellement servi a été contrôlé en HTTP 200 avec 3 440 entrées et 12 zones pour Trappes.

En modes `national` et `comparison`, l'interface fusionne cet index aux résultats communaux existants. Un résultat de zone transmet uniquement son `zoneId` stable au pipeline, qui attend la tuile d'arrivée, applique `feature-state`, puis utilise l'adaptateur legacy pour préserver l'extrusion et les bâtiments pendant la période de comparaison. Le mode `legacy` continue de charger uniquement l'index historique.

## API point → zone

Endpoint :

```http
POST /api/geography/resolve-zone
Content-Type: application/json

{
  "latitude": 48.892,
  "longitude": 2.238
}
```

Réponse exacte :

```json
{
  "zoneId": "5fb2d651-38bd-5a6f-8673-665f6e131ddd",
  "displayName": "Petit Nanterre",
  "communeCode": "92050",
  "communeName": "Nanterre",
  "quality": "official",
  "sourceVintage": "2026",
  "resolution": "music_zone"
}
```

La requête utilise `ST_Covers`, un index GiST et choisit la plus petite zone valide en privilégiant les décisions produit curatées puis les zones officielles. La latitude et la longitude ne sont jamais incluses dans la réponse.

## Fallback non bloquant

Si aucun quartier n'est trouvé :

1. l'API recherche la commune officielle ;
2. elle retourne sa `commune_fallback` lorsqu'elle existe ;
3. sinon elle répond `sector_selection_required` avec la commune ;
4. hors couverture, elle répond `manual_selection_required` avec HTTP 200.

L'inscription n'est donc pas bloquée par une lacune géographique. Une coordonnée invalide renvoie en revanche HTTP 400.

## Recherche serveur

```http
GET /api/geography/search?q=charonne&limit=12
```

Cette route fournit le même contrat à partir de PostGIS pour les clients qui ne chargent pas l'index statique.

## Schéma PostGIS

Le fichier `server/mvt-tile-server/sql/geography.sql` crée :

- `geography_dataset_versions` ;
- `administrative_zones` ;
- `music_zones` ;
- `music_zone_sources` ;
- `zone_aliases` ;
- `zone_camera_overrides` ;
- les index GiST et textuels nécessaires.

Il ne modifie ni ne tronque les tables d'avatars.

## Vérification

```bash
npm run test:geo
npm test --prefix server/mvt-tile-server
npm run geo:audit
npm run build
```

Résultats au 13 juillet 2026 :

- frontend géographique : 22/22 tests ;
- serveur : 23 tests réussis, 3 tests live ignorés faute d'URL live ;
- audit territorial : baseline inchangée ;
- build Vite : succès.

Les tests serveur prouvent aussi que la réponse de résolution n'écho jamais les coordonnées précises.

## Activation et rollback

Le SQL doit être appliqué avant d'activer les endpoints sur un environnement connecté :

```bash
psql "$DATABASE_URL" -f server/mvt-tile-server/sql/geography.sql
```

L'endpoint retourne `503 geography_not_ready` tant que le schéma n'est pas disponible. Le frontend de production reste en `legacy` par défaut ; revenir au commit PR 7 désactive ce lot sans modifier les données :

```bash
git checkout b300bb85
```

## Vérification visible du raccordement national

Scénario rejoué en mode `?geoPipeline=national` :

1. saisir « Centre Ouest » ;
2. constater le résultat « Centre Ouest · Trappes · Quartier » ;
3. valider avec Entrée ;
4. vérifier l'arrivée à `48.77477, 1.99904` ;
5. vérifier la vue ville à zoom `15.70` et le chargement des bâtiments ;
6. auditer les logs apparus après le rechargement.

Le résultat est correct : l'UUID `f4989928-836e-5763-b942-296f927e4fe7` pilote le fly, la sélection et l'adaptateur de bâtiments. Aucune erreur de recherche, PMTiles, MapLibre ou bâtiments n'apparaît ; seul l'avertissement local de clé Supabase absente reste présent.

Captures :

- `docs/geospatial/visual-regression/national-search-suggestion-pr10b.jpg` ;
- `docs/geospatial/visual-regression/national-search-trappes-pr10b.jpg`.
