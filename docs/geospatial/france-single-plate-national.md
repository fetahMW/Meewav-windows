# Publication nationale des communes mono-plaque

Cette publication applique le chapitre `COMMUNES-MONO-PLAQUE.md` du Guide Alpha à l'inventaire national IRIS 2026.

## Périmètre

- Inventaire source : `geo/work/france-iris-national-inventory.json`.
- Règle d'éligibilité : exactement un IRIS officiel dont le type vaut `Z` ou dont le code finit par `0000`.
- Communes éligibles dans le cache courant : **32 762**.
- Départements métropolitains et corses concernés : **92**.
- Les communes déjà possédées par un corpus Guide Alpha, Grand Paris ou métropolitain font échouer la génération au lieu d'être dupliquées.
- Aucun seuil de population, de superficie ou de capacité n'intervient.

## Une seule passe nationale

La commande de publication est :

```powershell
node scripts/geo/generate-france-single-plate-national.mjs --resume --concurrency=1
```

La concurrence `1` est volontaire : elle protège le WFS IGN des rafales et permet la reprise département par département après une limitation HTTP 429. Chaque fragment déjà produit avec le même fingerprint d'inventaire est validé puis réutilisé par `--resume`.

La commande crée :

- `public/map/france-single-plate/2026/<departement>.geojson`, un fragment déterministe par département ;
- `public/map/france-single-plate/2026/manifest.json`, le manifeste d'audit national complet ;
- `public/map/france-single-plate/2026/runtime-index.json`, l'index compact réellement chargé par le navigateur.

Le manifeste d'audit conserve l'URL, l'index, l'identifiant, la caméra et la provenance de chaque commune. Le runtime n'en télécharge jamais les données verbeuses : son index tient sous **1 Mio brut** et associe directement `communeCode -> featureIndex` en O(1). Le département, l'URL du fragment et l'identifiant stable se déduisent du code ; le libellé, la bbox, la classification et la caméra sont lus ou calculés après le chargement du seul fragment concerné.

## Contrat de la feature

Chaque fragment contient des features triées par code INSEE :

- `feature.id === properties.zoneId === "commune_<code>"` ;
- `communeCode === districtCode` ;
- `territoryType === "commune"` ;
- `runtimeMode === "single_plate"` ;
- `label` est le `nom_commune` officiel du WFS ; le libellé du snapshot de recherche est conservé séparément pour auditer une éventuelle dérive ;
- la géométrie officielle IGN/INSEE est conservée en EPSG:4326 ;
- `labelLng/labelLat` est strictement à l'intérieur ;
- bbox, identifiant IRIS, type IRIS, fournisseur, millésime, dataset et licence sont conservés.

La caméra utilise l'étendue complète, y compris pour les communes concaves, insulaires et multipolygones. Elle ne dépend pas de la taille éditoriale de la ville.

## Runtime paresseux

`franceSinglePlateRegistry.ts` charge l'index runtime compact à la première résolution, puis au maximum un fragment départemental en cache. Le résultat remis au rendu est toujours une `FeatureCollection` d'exactement **une feature**.

Le branchement de recherche reste générique :

1. le résultat existant `commune-<code>` est résolu dans l'index compact ;
2. la seule plaque active est extraite du fragment ;
3. l'événement partagé `meewav:national-zone-selected` alimente les sources et layers `selected-zone-*` existants ;
4. la caméra déterministe calculée depuis la bbox de la feature lance le fly premium au premier clic.

Il n'existe donc ni source MapLibre, ni listener, ni composant React, ni script propre à une commune. Les boutons et commandes souris ne sont pas modifiés.

## Contrôles

Le test `tests/geospatial/france-single-plate-national.test.mjs` couvre :

- classification exhaustive et déduplication de possession ;
- IDs/propriétés stables ;
- déterminisme face à un ordre WFS différent ;
- points de label strictement intérieurs avec une vérification Turf indépendante ;
- cadrage d'un multipolygone concave ;
- chargement paresseux et collection active à une feature ;
- recherche vers plaque et fly dès la première sélection ;
- absence de listener par commune ;
- couverture réelle des 32 762 codes dès que la passe matérielle est présente ;
- correspondance exacte entre manifeste d'audit et index runtime ;
- budget brut inférieur à 1 Mio, temps de parsing et coût des accès O(1) de l'index runtime.

Avant publication, exécuter :

```powershell
node --test tests/geospatial/france-single-plate-national.test.mjs
npx tsc --noEmit --pretty false
npm run build
```
