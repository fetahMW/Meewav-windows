# Plan de migration vers le référentiel géographique national

Date : 2026-07-13

Statut : architecture proposée après audit, aucune migration runtime commencée

Golden master : Paris sur le mode legacy

## Règle d'architecture

La géographie appartient au référentiel et au pipeline de données. Elle n'appartient plus au code de la carte.

Cette règle implique à terme, pour l'ajout d'une commune :

```text
0 fichier React modifié
0 contrôleur MapLibre modifié
0 layer ajouté
0 identifiant territorial ajouté au frontend
0 preset caméra ajouté au code
0 commande NPM propre à la ville
```

MapLibre, le globe, les styles et la mécanique d'interaction actuelle sont conservés.

## Architecture cible

```text
IGN / INSEE / collectivités / données Meewav existantes
                         |
                         v
                 CLI ETL générique
            import -> normalize -> curate
                         |
                         v
              PostGIS canonique versionné
       administrative_zones + music_zones + aliases
                         |
          +--------------+---------------+
          |                              |
          v                              v
  tuiles vectorielles              API géographique
  PMTiles versionné                point -> music_zone
  CDN avec HTTP Range              recherche par zoneId
          |                              |
          +---------------+--------------+
                          v
                   MapLibre GL JS
          sources/layers fixes + feature-state

Avatars / présence / collabs / événements
                         |
                         v
          API et MVT dynamiques existants
```

Les tuiles statiques ne sont jamais régénérées lorsqu'un avatar se connecte. La position exacte d'un utilisateur n'est jamais exposée par le frontend public.

## Modes d'exécution

Le flag proposé est un mode explicite plutôt qu'un booléen :

```env
VITE_GEO_PIPELINE_MODE=legacy
```

Valeurs autorisées :

| Mode | Source de zones | But |
| --- | --- | --- |
| `legacy` | GeoJSON et loaders actuels | Défaut et rollback instantané |
| `national` | PMTiles et référentiel canonique | Architecture expérimentale |
| `comparison` | Legacy + national | Mesures, différences et overlays de diagnostic |

Une compatibilité transitoire avec `USE_NATIONAL_GEO_PIPELINE=false` peut être fournie, mais le mode tri-état doit être la source de vérité. Une valeur absente, invalide ou une erreur de chargement doit retomber sur `legacy`.

Le mode `comparison` doit comparer au minimum :

- `zoneId` détecté ;
- nom affiché et aliases ;
- hash de géométrie, aire et `bbox` ;
- `labelPoint` ;
- caméra calculée et caméra réellement atteinte ;
- bâtiments trouvés et nombre de features ;
- durée de chargement et poids transféré ;
- erreurs MapLibre, API et tuiles ;
- résultat point vers zone.

## Schéma canonique

### Zone administrative source

```ts
type AdministrativeZone = {
  id: string;
  sourceType: "region" | "department" | "commune" | "iris" | "local_district";
  sourceProvider: string;
  sourceCode: string;
  sourceVintage: string;
  officialName: string;
  parentId: string | null;
  communeCode: string | null;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
};
```

### Zone produit Meewav

```ts
type MusicZone = {
  zoneId: string;
  displayName: string;
  aliases: string[];
  communeCode: string;
  communeName: string;
  parentZoneId: string | null;
  sourceZoneIds: string[];
  sourceType:
    | "official"
    | "merged"
    | "local"
    | "generated"
    | "commune_fallback"
    | "custom";
  sourceVintage: string;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  bbox: [number, number, number, number];
  center: [number, number];
  labelPoint: [number, number];
  status: "draft" | "validated" | "published";
  quality: "official" | "curated" | "fallback";
  cameraOverride?: {
    zoom?: number;
    pitch?: number;
    bearing?: number;
    padding?: number;
  };
};
```

### Identifiants

Le `zoneId` produit sera un identifiant opaque stable, généré une seule fois et conservé entre les millésimes. Il ne contiendra ni nom de ville ni code IRIS. Les anciens IDs restent dans une table de correspondance et peuvent continuer à résoudre les profils existants.

Le mapping doit être bidirectionnel pendant la migration :

```text
legacy_zone_id -> stable_zone_id
stable_zone_id -> legacy_zone_id[]
```

Un changement de nom, une fusion de sources ou un nouveau millésime ne modifie pas le `stable_zone_id`.

## Modèle PostGIS

Tables minimales :

```text
administrative_zones
music_zones
music_zone_sources
zone_aliases
zone_camera_overrides
legacy_zone_id_mappings
dataset_versions
buildings
building_zone_assignments
```

Contraintes essentielles :

- géométries en SRID 4326 à l'import, reprojection seulement pour les calculs/tuiles ;
- index GiST sur les géométries ;
- unicité des IDs stables et des couples fournisseur/code/millésime ;
- clés étrangères de parenté et de provenance ;
- statut de publication séparé de l'état d'import ;
- géométrie précise conservée en base ;
- géométries simplifiées générées par niveau de zoom ;
- version de dataset immuable après publication.

## Couche de curation produit

Les overrides contiennent uniquement des décisions produit et jamais du code frontend. Exemple de forme :

```json
{
  "communeCode": "75101",
  "sourceVintage": "2026",
  "zones": [
    {
      "stableZoneId": "zone_opaque_stable",
      "displayName": "Les Halles",
      "aliases": ["Quartier des Halles"],
      "sourceZoneIds": ["source-zone-id"],
      "status": "validated",
      "cameraOverride": null
    }
  ]
}
```

L'outil de curation minimal doit permettre renommer, ajouter des aliases, fusionner, déplacer un point de label, prévisualiser la caméra et valider. Une scission ou une géométrie locale est permise, mais reste exceptionnelle et traçable.

## Tileset générique

Un artefact de publication `france-zones-<version>.pmtiles` expose quatre source-layers stables :

```text
regions
departments
communes
music_zones
```

Propriétés minimales d'une feature `music_zones` :

```text
zone_id
display_name
commune_code
commune_name
parent_zone_id
quality
status
source_vintage
label_lon
label_lat
```

La géométrie reste dans la feature. Les longues listes d'aliases et les détails de provenance peuvent rester dans l'index/API afin de ne pas gonfler les tuiles.

Le frontend garde un nombre fixe de layers :

```text
music-zones-fill
music-zones-outline
music-zones-hitarea
music-zones-extrusion
music-zones-label
```

La sélection continue d'utiliser :

```ts
map.setFeatureState(
  {
    source: "national-geography",
    sourceLayer: "music_zones",
    id: zoneId,
  },
  { selected: true, hovered: false, dimmed: false },
);
```

Aucun layer n'est créé lors d'un clic.

## Caméra data-driven

Comportement par défaut :

1. charger la `bbox` de la zone ou de la commune ;
2. calculer la caméra avec `fitBounds` ;
3. appliquer le pitch et le bearing globaux de la vue ville ;
4. utiliser `labelPoint` pour le point lumineux et le centrage perceptuel ;
5. appliquer un `cameraOverride` seulement si une comparaison prouve qu'il est nécessaire.

Le calcul doit être une fonction pure et testable. Paris fournit les captures de référence. Un override est une ligne de données versionnée, jamais `if (city === ...)`.

## Recherche générique

L'index de recherche est produit depuis le référentiel et retourne :

```ts
type GeographySearchResult = {
  zoneId: string;
  displayName: string;
  aliases: string[];
  communeName: string;
  departmentName: string;
  regionName: string;
  bbox: [number, number, number, number];
  labelPoint: [number, number];
};
```

Un clic ne transmet qu'un `zoneId`. Le frontend ne traduit plus un nom de ville vers une URL, un préfixe ou un preset. L'index actuel de 20,9 Mo n'est pas conservé comme payload navigateur obligatoire ; il est remplacé par une API de recherche ou un index segmenté/compact avec cache.

## API point vers zone

Route cible :

```text
POST /api/geography/resolve-zone
```

Règles :

- validation stricte latitude/longitude ;
- requête `ST_Covers` ou équivalent sur la géométrie précise ;
- priorité à une `music_zone` publiée ;
- fallback sur la commune ;
- création/résolution d'une zone communale fallback si nécessaire ;
- réponse sans adresse ni coordonnées précises ;
- conservation publique du `zoneId` et du libellé seulement ;
- cache par grille privée ou geohash tronqué, jamais exposé publiquement ;
- tests sur frontières, enclaves et points hors France.

## Bâtiments

La migration des zones ne doit pas attendre le tuilage générique des 1,27 Gio de bâtiments actuels.

Ordre :

1. conserver le loader et les manifests legacy ;
2. introduire un adapter `BuildingRepository` sélectionné par le même mode ;
3. attribuer chaque bâtiment à un `stableZoneId` ;
4. générer des archives techniques régionales ;
5. vérifier nombre, hauteur et rendu zone par zone ;
6. retirer les dossiers par ville seulement après validation PR 10.

Le manifeste générique peut référencer des archives comme `buildings-idf.pmtiles` ou `buildings-paca.pmtiles`, mais le frontend ne doit connaître ni Paris, ni Nice, ni aucun nom de ville.

## Validateurs bloquants

`geo:validate` doit échouer pour :

- géométrie invalide ou vide ;
- self-intersection ;
- `zoneId` dupliqué ;
- nom vide ;
- commune absente ;
- parent inexistant ou cycle de parenté ;
- zone orpheline ;
- `bbox`, centre ou `labelPoint` absent ;
- `labelPoint` hors géométrie ;
- chevauchement au-delà du seuil autorisé ;
- couverture de commune insuffisante ;
- bâtiment sans zone ou attribution incohérente ;
- disparition ou réaffectation non approuvée d'un ID stable ;
- source, fournisseur ou millésime absent ;
- statut publié sans validation ;
- budget de tuile ou de temps de chargement dépassé.

Les avertissements non bloquants incluent les faibles chevauchements de précision, les aliases dupliqués et les overrides de caméra devenus inutiles.

## Commandes génériques cibles

```text
pnpm geo:audit
pnpm geo:import --scope france --vintage 2026
pnpm geo:migrate-existing --city paris
pnpm geo:build-zones --scope paris
pnpm geo:build-buildings --scope ile-de-france
pnpm geo:validate --scope paris
pnpm geo:publish --version 2026.1
```

L'option `--city` de migration n'est pas une branche frontend : elle choisit un jeu d'entrée dans le convertisseur générique. Une nouvelle ville n'ajoute aucune nouvelle commande.

## Fichiers à créer progressivement

Les chemins exacts pourront être ajustés lors des PR, mais la séparation de responsabilités doit rester la suivante.

### Référentiel et ETL

```text
geo/catalog/datasets.json
geo/schema/administrative-zone.schema.json
geo/schema/music-zone.schema.json
geo/sql/001_geography_schema.sql
geo/overrides/paris.json
geo/overrides/grand-paris.json
geo/overrides/trappes.json
geo/overrides/marseille.json
geo/overrides/lyon.json
geo/overrides/nice.json
geo/overrides/lille.json
geo/overrides/nantes.json
geo/mappings/legacy-zone-ids/*.json
geo/output/.gitignore
scripts/geo/cli.ts
scripts/geo/audit.ts
scripts/geo/import.ts
scripts/geo/migrate-existing.ts
scripts/geo/normalize.ts
scripts/geo/validate.ts
scripts/geo/build-zones.ts
scripts/geo/build-buildings.ts
scripts/geo/publish.ts
```

### Frontend derrière flag

```text
src/features/globe/geography/geoPipelineMode.ts
src/features/globe/geography/GeographyRepository.ts
src/features/globe/geography/LegacyGeographyRepository.ts
src/features/globe/geography/NationalGeographyRepository.ts
src/features/globe/geography/ComparisonGeographyRepository.ts
src/features/globe/geography/nationalZoneLayers.ts
src/features/globe/geography/cameraFromZone.ts
src/features/globe/geography/geographyDiagnostics.ts
```

### Backend

```text
server/mvt-tile-server/geography/router.js
server/mvt-tile-server/geography/repository.js
server/mvt-tile-server/geography/resolve-zone.js
server/mvt-tile-server/geography/search.js
```

### Documentation et tests

```text
docs/geospatial/migrations/paris.md
docs/geospatial/migrations/grand-paris.md
docs/geospatial/migrations/trappes.md
docs/geospatial/migrations/marseille.md
docs/geospatial/migrations/lyon.md
docs/geospatial/migrations/nice.md
docs/geospatial/migrations/lille.md
docs/geospatial/migrations/nantes.md
tests/geospatial/fixtures/
tests/geospatial/validators/
tests/geospatial/visual/
```

## Fichiers à modifier progressivement

| Fichier | PR | Modification autorisée |
| --- | --- | --- |
| `package.json` | 2 puis 9/10 | Ajouter les commandes génériques, garder les anciennes jusqu'à PR 11 |
| `src/features/globe/components/GlobeMapV2.tsx` | 5 | Brancher le repository par mode, sans supprimer les branches legacy |
| `src/features/globe/selectedExtrusion/selectedZoneExtrusionController.ts` | 5 | Accepter une collection canonique via adapter, conserver l'entrée legacy |
| `src/features/globe/selectedExtrusion/selectedZoneExtrusionLayers.ts` | 4/5 | Ajouter les layers nationaux fixes ou adapter les layers partagés |
| `src/features/globe/selectedExtrusion/selectedZoneBuildingLoader.ts` | 5/10 | Introduire le repository de bâtiments, conserver le routage legacy |
| `server/mvt-tile-server/index.js` | 8 | Monter un router géographique isolé uniquement |
| configuration de déploiement | 4/9 | URL PMTiles versionnée, cache CDN et mode legacy par défaut |

Aucun de ces fichiers n'est modifié dans la PR 1.

## Fichiers candidats à suppression en PR 11 uniquement

- générateurs nommés par ville après remplacement et reproduction validée ;
- commandes NPM nommées par ville ;
- `citySubdivisionConfig.ts` ou sa partie territoriale, après disparition de tous ses consommateurs ;
- GeoJSON ville/métropole servis au navigateur, après validation PMTiles ;
- manifests et dossiers de bâtiments par ville, après validation PR 10 ;
- standalone Saint-Denis legacy après migration et validation du mapping ;
- cinq fichiers orphelins de `public/buildings/paris/` après preuve d'inutilisation ;
- conditions et tableaux territoriaux de `GlobeMapV2.tsx` ;
- routage par préfixes du loader de bâtiments.

Une suppression n'est acceptée que si le diff de comparaison est documenté et si le tag précédent permet un retour sans reconstruction.

## Ordre des migrations de données existantes

1. Paris seul, avec les 80 quartiers et leurs bâtiments legacy.
2. Grand Paris et les communes autour de Paris déjà présentes.
3. Trappes, pour prouver qu'une ville isolée n'exige aucun code frontend.
4. Marseille, pour tester volume et millésimes hétérogènes.
5. Lyon.
6. Nice, avec vérification séparée des assets terrain.
7. Lille, avec communes associées.
8. Nantes, comme benchmark documenté par le Guide Alpha.
9. autres territoires détectés ou ajoutés par données seulement.

L'import France entière n'est autorisé qu'après la preuve Paris et au moins deux villes non parisiennes.

## Découpage en pull requests

### PR 1 — Audit et documentation

Livrables :

- inventaire exact de l'existant ;
- pipeline manuel actuel ;
- dettes par ville ;
- architecture cible ;
- plan de fichiers, risques et rollback ;
- aucun changement runtime.

Gate : `npm run build`, état legacy inchangé, documentation relue.

### PR 2 — Schéma canonique et validateurs

Livrables :

- types/schémas `AdministrativeZone` et `MusicZone` ;
- modèle d'ID stable ;
- premiers validateurs géométriques et de métadonnées ;
- fixtures unitaires ;
- commandes `geo:audit` et `geo:validate`.

Gate : tests de schéma, IDs et géométrie ; aucun import national ; aucun diff frontend.

### PR 3 — Convertisseur des villes existantes

Livrables :

- convertisseur générique ;
- conversion Paris en premier ;
- mapping IDs legacy vers IDs stables ;
- rapports de migration ;
- conversion des autres villes sans refaire les géométries.

Gate : compte de features, aire, noms, labels et bâtiments identiques ; fichiers legacy conservés.

### PR 4 — Tileset générique des zones

Livrables :

- génération vectorielle/PMTiles pour un scope paramétrable ;
- source-layers fixes ;
- manifest versionné et budgets de tuiles ;
- prototype Paris seulement.

Gate : décodage de tuiles, IDs promus, couverture et poids ; aucune activation produit.

### PR 5 — Intégration MapLibre derrière feature flag

Livrables :

- modes `legacy`, `national`, `comparison` ;
- repository abstrait ;
- layers fixes et `feature-state` ;
- diagnostics comparatifs ;
- défaut strictement `legacy`.

Gate : build, tests du fallback, panne PMTiles simulée, captures legacy inchangées.

### PR 6 — Migration de Paris

Livrables :

- Paris alimenté par le pipeline canonique ;
- caméra data-driven ;
- recherche par `zoneId` ;
- buildings legacy via adapter ;
- captures avant/après desktop et mobile.

Gate : parité visuelle et fonctionnelle explicite sur les scénarios Paris. Aucun retrait legacy.

### PR 7 — Migration des autres villes terminées

Livrables :

- Grand Paris, Trappes, Marseille, Lyon, Nice, Lille et Nantes ;
- rapports et mappings par ville ;
- aucune condition territoriale ajoutée au frontend.

Gate : ajout de chaque dataset avec zéro diff React/MapLibre et suite visuelle par ville.

### PR 8 — API point vers zone

Livrables :

- tables PostGIS nécessaires ;
- route `resolve-zone` ;
- fallback commune ;
- recherche géographique générique ;
- confidentialité testée.

Gate : tests de frontières, points hors zone, non-exposition des coordonnées.

### PR 9 — Pipeline national

Livrables :

- import national versionné ;
- régions, départements, communes, IRIS et fallbacks ;
- build/publish PMTiles ;
- index de recherche national compact ;
- provenance et licences.

Gate : validation France, budgets tuiles et test de publication/rollback.

### PR 10 — Bâtiments génériques

Livrables :

- attribution par ID stable ;
- archives techniques régionales ;
- manifest générique ;
- comparaison de compte/hauteur/rendu.

Gate : bâtiments présents sur Paris et toutes les villes terminées, performances au moins équivalentes.

### PR 11 — Suppression du système legacy

Précondition : validation explicite du propriétaire produit.

Livrables :

- retrait des conditions, scripts, GeoJSON et manifests devenus inutiles ;
- suppression du mode legacy seulement si elle est explicitement autorisée ;
- archive/tag de dernière version compatible legacy ;
- documentation définitive.

Gate : suite complète, rollback par tag testé, aucun identifiant territorial dans React.

## Commits réversibles

Chaque PR est découpée au minimum en commits séparés :

1. contrat/documentation ;
2. données ou schéma ;
3. implémentation ;
4. tests ;
5. captures/métriques.

Avant un changement risqué, le commit précédent doit être vert et identifiable. Les données générées ne doivent pas être mêlées au code de runtime dans le même commit.

## Matrice de non-régression

| Scénario | Desktop | Mobile | Mesures |
| --- | --- | --- | --- |
| Vue générale Paris | Capture | Capture | sources, layers, transfert |
| Sélection arrondissement | Capture | Capture | zoneId, caméra, extrusion |
| Survol et dimming | Capture | Capture | feature-state, frame time |
| Bâtiments | Capture | Capture | nombre, hauteur, poids |
| Point lumineux | Capture | Capture | labelPoint, alignement |
| Recherche et fly | Vidéo/capture | Vidéo/capture | durée, centre final |
| Retour ville/globe | Capture | Capture | artefacts, mémoire |
| Commune Grand Paris | Capture | Capture | parent/enfants, bâtiments |
| Trappes | Capture | Capture | zéro branche frontend |
| Marseille/Lyon/Nice/Lille/Nantes | Capture | ciblé | différences documentées |

La baseline de `docs/MAP_PERFORMANCE_AUDIT.md` est conservée. Une différence importante n'est acceptée qu'avec justification produit explicite.

## Critères de passage à France entière

L'import national n'est lancé que si :

- Paris passe en mode national sans régression importante ;
- le mode comparison ne signale aucun écart critique ;
- Grand Paris et Trappes fonctionnent avec le même code ;
- au moins deux métropoles non parisiennes sont migrées sans changement frontend ;
- le fallback legacy a été réellement testé ;
- les budgets de tuiles et de mémoire sont respectés ;
- la stabilité des IDs est couverte par des tests.

## Définition de réussite finale

Une nouvelle commune suit uniquement ce flux :

1. import des données nationales ou locales ;
2. génération automatique des zones ;
3. overrides éventuels de nom, alias ou fusion ;
4. validation automatique ;
5. génération des tuiles ;
6. publication versionnée.

Le frontend reçoit le nouveau territoire par les données publiées. Il ne reçoit aucun nouveau nom de ville, préfixe, tableau d'IDs, preset de caméra, layer ni commande spécifique.
