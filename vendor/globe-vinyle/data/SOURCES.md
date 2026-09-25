# Données géographiques du prototype GlobeLab

Jeux récupérés le **5 septembre 2026**. Les clients peuvent utiliser les fichiers préparés entièrement hors ligne ; aucune requête vers Mapbox, un VPS Meewav ou une API publique n’est nécessaire pendant l’utilisation.

## Fichiers à intégrer

### Labels ajoutés le 9 septembre 2026

Le build prépare `data/labels.json` depuis les snapshots locaux, sans appel réseau : 242 noms de pays/territoires en français, leurs ancrages `LABEL_X`/`LABEL_Y` et priorités `LABELRANK` issus de `world-50m-source.json` (Natural Earth, domaine public), et 46 villes de `major-france-cities.json`.

Les 40 villes métropolitaines reprennent les noms et centres du catalogue `src/features/globe/maplibre/franceRegionCityCatalog.ts` du globe Meewav Web consulté localement. Les six centres ultramarins proviennent du snapshot versionné `communes-centers-source.json` (API Découpage administratif du 5 septembre 2026, ODbL). Cette sélection réunit de grandes villes et des pôles régionaux ; ce n’est ni un classement démographique exhaustif ni un nouveau recensement. Le champ `rank` désigne uniquement la priorité visuelle. Les centres sont des ancrages cartographiques sans donnée individuelle.

Le catalogue des villes est conservé sous ODbL avec les attributions administratives de ce document. La police utilise la famille système Arial/sans-serif ; les couleurs et le halo sont adaptés des labels du globe Meewav de référence, sans embarquer ses glyphes Noto Sans.

| Fichier | Contenu | Taille approximative |
|---|---|---|
| `world-countries.geojson` | 177 entités pays/territoires de Natural Earth | 270 Ko |
| `world-countries-50m.geojson` | 242 entités Natural Earth, contours mondiaux plus détaillés | 2 295 Ko |
| `sectors.json` | 80 quartiers administratifs de Paris + commune de Lourmarin | 362 Ko |
| `communes-paris.geojson` | 123 communes de Paris et de la petite couronne + Lourmarin | 448 Ko |
| `regions.geojson` | 18 régions françaises, contours officiels au niveau 100 m | 965 Ko |
| `communes/index.json` | Index spatial des communes nationales par département/collectivité | 39 Ko |
| `communes/<code>.geojson` | 109 fichiers : toutes les identités de l’API communale nationale | 63,5 Mo au total |
| `validation.json` | Contrôles, couverture communale exacte, ajustements des centres et empreintes SHA-256 | 5 Ko |

Les coordonnées sont en longitude/latitude WGS84 `[longitude, latitude]`. Les géométries restent celles des sources : aucune simplification supplémentaire, aucun rectangle de remplacement, aucune extrusion. Le format accepte `Polygon` et `MultiPolygon`, avec leurs anneaux intérieurs éventuels. Les contours mondiaux incluent l’antiméridien : leur rendu doit traiter correctement la coupure ±180°.

`center` sert au cadrage et à la disposition de la démonstration ; il ne représente aucune personne. Le placement d’avatars doit lui aussi être une présentation de membres d’un secteur, indépendante d’une adresse ou d’une position réelle.

## Monde : Natural Earth

- Producteur : Natural Earth, dépôt maintenu par Nathaniel Vaughn Kelso et les contributeurs.
- Couche : `ne_110m_admin_0_countries`, **échelle 1:110 millions**. « 110m » ne signifie pas une précision de 110 mètres.
- [Présentation officielle](https://www.naturalearthdata.com/downloads/110m-cultural-vectors/110m-admin-0-countries/).
- [Source GeoJSON téléchargée](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson).
- [Dépôt de la source](https://github.com/nvkelso/natural-earth-vector).
- Licence : **domaine public** ; attribution volontaire « Made with Natural Earth ». [Conditions officielles](https://www.naturalearthdata.com/about/terms-of-use/).

Limites : géométrie très généralisée adaptée au globe entier. Petites îles et territoires peuvent manquer. Les découpages sont des choix cartographiques de la source, sans validation de leur interprétation politique par GlobeLab. Cette couche ne constitue pas une référence de détail au niveau ville ou quartier.

### Variante mondiale 50m

La couche additionnelle `world-countries-50m.geojson` est préparée depuis [le GeoJSON Natural Earth 50m](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson) ; [fiche officielle](https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-admin-0-countries-2/). Elle reste dans le domaine public, avec la même attribution facultative. Le snapshot effectivement téléchargé compte **242 entités**, **99 613 sommets** (fermetures incluses), contre 177 entités et 10 654 sommets pour le 110m. Taille du fichier préparé : **2 294 883 octets**.

L’échelle est **1:50 millions**, sans lien avec une précision de 50 mètres. Cette variante est destinée aux contours vectoriels et aux vues intermédiaires, sans simplification supplémentaire de notre part. Elle conserve les îles, les trous et les géométries multiparties de la source. `world-countries.geojson` 110m reste inchangé ; l’ajout ne décide pas du niveau chargé par le client.

## France : niveau régional intermédiaire

`regions.geojson` contient les **18 régions** renvoyées par l’[API officielle des régions](https://geo.api.gouv.fr/regions) le 5 septembre 2026 : 13 en métropole (Corse comprise) et cinq DROM. Les contours viennent du [fichier officiel régional au niveau 100 m](https://etalab-datasets.geo.data.gouv.fr/contours-administratifs/latest/geojson/regions-100m.geojson.gz), publié le **4 mai 2026** selon l’[index du fournisseur](https://etalab-datasets.geo.data.gouv.fr/contours-administratifs/latest/geojson/). Il s’agit du niveau de généralisation métrique officiel, sans simplification supplémentaire dans l’asset ; ce n’est pas une promesse de précision à 100 mètres sur chaque point.

Le fichier fournisseur contient également huit collectivités d’outre-mer exposées à ce niveau cartographique ; elles ne figurent pas dans la liste officielle des 18 régions et sont donc exclues de cet asset. Leurs contours communaux/territoriaux restent dans la collection nationale existante. Le résultat pèse **965 419 octets**, avec **55 769 sommets**, fermetures incluses. Il est destiné au passage pays → région ; les contours communaux détaillés restent la référence de navigation locale.

La source est **Contours administratifs — data.gouv.fr / IGN ADMIN EXPRESS**, sous **ODbL 1.0** selon les [métadonnées officielles conservées](https://www.data.gouv.fr/api/1/datasets/contours-administratifs/). L’asset normalisé est diffusé sous la même licence. L’attribution et le lien de licence sont intégrés au fichier. Le snapshot de catalogue décrit aussi les sources des collectivités d’outre-mer, exclues ici.

Chaque Feature possède `id: "fr-region-<code>"`, `bbox: [west, south, east, north]`, une géométrie `Polygon` ou `MultiPolygon` WGS84, et les propriétés suivantes :

```js
{
  id: "fr-region-11", name: "Île-de-France", nom: "Île-de-France",
  code: "11", kind: "region", center: [longitude, latitude]
}
```

Les codes sont des chaînes conservant les zéros initiaux. Le centre de cadrage est calculé à l’intérieur de la plus grande composante du territoire, hors des trous ; il ne représente ni chef-lieu ni position humaine. Toutes les coordonnées des contours sont strictement conservées. Les niveaux officiels 100 m (régions), 50 m (communes) et API précise (Paris/petite couronne) peuvent présenter de faibles écarts de généralisation : les frontières de niveaux différents ne sont pas garanties topologiquement identiques. Natural Earth reste une autre source pour la silhouette terrestre.

Reproduction hors ligne : `python3 data-prep/prepare_regions.py`. Les trois snapshots `regions-100m-source.geojson.gz`, `regions-identities-source.json` et `regions-catalog-source.json` sont conservés. Le script contrôle les 18 identifiants, les noms officiels, la fermeture des anneaux, les coordonnées finies, les emprises et les centres intérieurs ; il conserve les géométries source et génère `validation-regions.json` ainsi que la section `regionalAssets` de `source-manifest.json`. Ces contrôles ne constituent pas un audit topologique exhaustif. Pour renouveler volontairement le snapshot, télécharger les trois URLs citées en suivant les redirections, puis actualiser la date de récupération dans le script et valider le nouveau résultat avant intégration.

## Paris : 80 quartiers administratifs

- Producteur : **Direction de l’Urbanisme — Ville de Paris** ; création des données par le Service de la Topographie et de la Documentation Foncière.
- [Fiche officielle « Quartiers administratifs »](https://opendata.paris.fr/explore/dataset/quartier_paris/information/).
- [Export GeoJSON](https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/quartier_paris/exports/geojson).
- [Métadonnées de l’API](https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/quartier_paris).
- Licence déclarée par ces métadonnées : **Open Database License (ODbL)**. [Texte ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
- Métadonnées observées : `modified` 2017-02-17 ; `data_processed` 2026-09-01. Le traitement récent n’atteste pas une révision récente des limites.

Attribution à conserver : « Quartiers administratifs — Ville de Paris, disponibles sous ODbL 1.0 ». Le fichier `sectors.json`, qui normalise cette base, est fourni sous ODbL 1.0. Le JSON distribué et cette documentation donnent accès aux données et à leur licence.

Limites : quatre quartiers administratifs par arrondissement ; ils ne correspondent pas nécessairement aux quartiers vécus ou aux appellations culturelles. Belleville désigne ici précisément le quartier administratif du 20e. Les noms officiels sont conservés. Identifiants construits depuis `c_quinsee` ; arrondissement et surface officielle conservés.

## Lourmarin : secteur communal rural

- Commune : **Lourmarin**, code INSEE `84068`, Vaucluse.
- [Contour utilisé](https://geo.api.gouv.fr/communes?nom=Lourmarin&fields=nom,code,contour,centre,population&format=geojson&geometry=contour).
- [Nom, code et centre](https://geo.api.gouv.fr/communes/84068?fields=nom,code,centre,population,departement,region).
- [Documentation API Découpage administratif](https://geo.api.gouv.fr/decoupage-administratif/communes).
- [Jeu « Contours administratifs » utilisé par l’API](https://www.data.gouv.fr/datasets/contours-administratifs/).
- [Métadonnées de ce jeu](https://www.data.gouv.fr/api/1/datasets/contours-administratifs/).
- Source géométrique en métropole : IGN ADMIN EXPRESS, via les contours administratifs diffusés par data.gouv.fr. Le jeu agrégé déclare **ODbL** (`license: odc-odbl`) ; cette licence est conservée pour l’extrait.

Attribution : « Contours administratifs — data.gouv.fr / IGN ADMIN EXPRESS, via l’API Découpage administratif, extrait du 5 septembre 2026, ODbL 1.0 ».

Limites : le secteur couvre toute la commune, campagnes et habitat dispersé inclus, sans découpage inventé. Le millésime exact du contour n’est pas transmis dans la réponse de l’API ; la date de récupération ne doit pas être présentée comme le millésime IGN. Le centre est fourni par l’API et vérifié dans le contour.

## Paris et petite couronne : communes

`communes-paris.geojson` reprend toutes les communes actives renvoyées par les quatre endpoints officiels au téléchargement, puis ajoute le contour existant de Lourmarin :

| Département | Nombre | Endpoint |
|---|---:|---|
| Paris (75) | 1 | [Communes 75](https://geo.api.gouv.fr/departements/75/communes?fields=nom,code,codeDepartement,centre,contour&format=json) |
| Hauts-de-Seine (92) | 36 | [Communes 92](https://geo.api.gouv.fr/departements/92/communes?fields=nom,code,codeDepartement,centre,contour&format=json) |
| Seine-Saint-Denis (93) | 39 | [Communes 93](https://geo.api.gouv.fr/departements/93/communes?fields=nom,code,codeDepartement,centre,contour&format=json) |
| Val-de-Marne (94) | 47 | [Communes 94](https://geo.api.gouv.fr/departements/94/communes?fields=nom,code,codeDepartement,centre,contour&format=json) |
| Vaucluse (84), Lourmarin uniquement | 1 | Contour de Lourmarin cité ci-dessus |

Couverture totale : **124 communes**, **20 290 sommets** (fermetures incluses), **448 109 octets**. Les noms complets par département figurent dans `validation.json`. Les arrondissements parisiens ne sont pas ajoutés comme communes : Paris est un seul contour `fr-commune-75056`. La réponse du 93 compte 39 communes ; Saint-Denis y figure, Pierrefitte-sur-Seine n’y est pas une commune séparée. La grande couronne et le reste de la France sont hors couverture de ce fichier.

La source et la licence sont celles des contours administratifs déjà cités pour Lourmarin : **data.gouv.fr / IGN ADMIN EXPRESS via l’API Découpage administratif, ODbL 1.0**. Le jeu normalisé est lui aussi fourni sous [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Attribution à conserver : « Contours administratifs — data.gouv.fr / IGN ADMIN EXPRESS, via l’API Découpage administratif, extrait du 5 septembre 2026, ODbL 1.0 ».

Chaque Feature expose uniquement `id`, `name`, `kind: "commune"`, `center` et `department`. Les identifiants utilisent `fr-commune-<code INSEE>`. Tous les polygones sont strictement identiques aux réponses API ; aucun sommet n’est arrondi ou simplifié. Aucun renseignement individuel ou adresse n’est demandé.

Deux centres retournés par l’API se trouvent hors de leur contour : Vaucresson et L’Île-Saint-Denis. Pour leur affichage, `prepare.py` calcule un centre intérieur (centroïde s’il convient, sinon milieu d’une section horizontale intérieure). Les centres originaux, les centres d’affichage et le motif sont tracés dans `validation.json`. Les autres centres restent ceux de la source. Tous les 124 centres d’affichage sont vérifiés à l’intérieur des communes et hors des trous.

## Couverture nationale chargée à la demande

Le dossier `communes/` contient **34 969 identités communales/territoriales** correspondant exactement aux codes de l’API nationale observée le 5 septembre 2026. Elles sont réparties dans **109 fichiers** : 101 départements, Corse et DROM compris, et huit groupes des collectivités d’outre-mer (`975`, `977`, `978`, `984`, `986`, `987`, `988`, `989`). Certains objets d’outre-mer, comme les districts des TAAF et Clipperton, sont des territoires exposés par l’API communale et ne sont pas juridiquement des communes ordinaires. Le champ `kind: "commune"` désigne ici cette catégorie de navigation.

Sources :

- [Contours communaux nationaux au niveau officiel 50 m, GeoJSON gzip](https://etalab-datasets.geo.data.gouv.fr/contours-administratifs/latest/geojson/communes-50m.geojson.gz).
- [Index officiel avec tailles et dates](https://etalab-datasets.geo.data.gouv.fr/contours-administratifs/latest/geojson/) : fichier publié le 4 mai 2026.
- [Noms, codes, départements et centres actuels via l’API](https://geo.api.gouv.fr/communes?fields=nom,code,codeDepartement,centre&format=json).
- [Noms et codes des départements](https://geo.api.gouv.fr/departements).

Licence : **ODbL 1.0**, conformément au catalogue national déjà cité. Attribution : « Contours administratifs — data.gouv.fr / IGN ADMIN EXPRESS et sources des collectivités d’outre-mer, ODbL 1.0 ». Les sources d’outre-mer comprennent celles indiquées par le catalogue national, notamment OpenStreetMap, la Polynésie française et la Nouvelle-Calédonie ; la provenance ne doit pas être réduite à IGN pour ces collectivités. Chaque FeatureCollection et l’index contiennent la licence et l’attribution.

Le niveau national 5 m pèserait **292 489 559 octets** décompressé, au-dessus du seuil de 150 Mo retenu pour cette passe. Le fichier national officiel 50 m pèse **59 690 746 octets**, ou **17 577 060 octets en gzip**. Ce « 50 m » est un niveau de généralisation métrique des contours administratifs ; il est distinct du nom « 50m » de Natural Earth qui signifie 1:50 millions. Le choix conserve les géométries du fournisseur, sans simplification calculée par GlobeLab.

Le source comprend 35 014 features : les **45 arrondissements municipaux de Paris, Lyon et Marseille** sont exclus de cette couche communale pour ne pas superposer leurs limites au contour de leur commune. Toutes les autres identités sont conservées. Les géométries plus précises déjà téléchargées pour les départements 75, 92, 93, 94 et pour Lourmarin remplacent le niveau 50 m de ces 124 communes, sans altération. Les autres communes du Vaucluse restent au niveau officiel 50 m. Les quatre fichiers précédents, dont `communes-paris.geojson`, restent inchangés.

Le résultat contient **2 830 638 sommets**, fermetures des anneaux comprises. Le nombre exact d’octets, le poids de chaque fichier, les empreintes et les 581 centres d’affichage recalculés car le centre de l’API était hors contour figurent dans `validation-france.json`. Tous les centres d’affichage sont dans les géométries et hors des trous. Ces points sont des ancrages cartographiques et ne décrivent aucun habitant. Les centres de l’index départemental sont seulement les milieux des emprises, pour le préchargement et le cadrage.

### Contrat du chargement par caméra

`communes/index.json` expose :

```js
{
  schemaVersion: 1,
  assetBase: "../",
  license: "ODbL-1.0",
  sources: [/* identifiant, URL, date, licence */],
  assets: [{
    department: "01", name: "Ain", path: "communes/01.geojson",
    bounds: [west, south, east, north], center: [longitude, latitude],
    featureCount, vertexCount, bytes, sha256, sourceIds,
    detail: "official-50m" // ou api-original / official-50m-with-api-overrides
  }]
}
```

Résoudre un chemin avec `new URL(asset.path, new URL(index.assetBase, indexURL))`. Charger les départements dont `bounds` intersecte l’emprise de la caméra. Chaque Feature dispose aussi d’un `bbox` pour filtrer les communes dans le fichier chargé ; ses propriétés sont `id`, `name`, `kind`, `center`, `code` et `department`. L’identifiant reste `fr-commune-<code INSEE>`. Les bounds sont en longitude/latitude WGS84, ordre ouest/sud/est/nord. Les territoires éloignés et insulaires ne doivent pas être supposés proches de leur métropole.

La reproduction est hors ligne : `python3 data-prep/prepare_france.py`. Le snapshot national est conservé uniquement en gzip ; il n’existe pas de seconde copie nationale décompressée, les fichiers départementaux étant les livrables. `geometry_utils.py` est partagé par les deux scripts de préparation.

## Exemples et reproduction

| Secteur | Identifiant |
|---|---|
| Saint-Germain-des-Prés | `fr-paris-7510604` |
| Clignancourt | `fr-paris-7511802` |
| Belleville | `fr-paris-7512001` |
| Lourmarin | `fr-commune-84068` |

Les fichiers `*-source.json` sont des snapshots publics conservés pour reproduire les transformations. `source-manifest.json` conserve les URLs, licences, métadonnées utiles et empreintes. `prepare.py` se relance avec Python standard, sans téléchargement ni dépendance :

```sh
python3 data-prep/prepare.py
```

Vérifications effectuées : 177 entités monde 110m, 242 entités monde 50m, 80 quartiers Paris, 124 communes ; identifiants uniques dans chaque collection ; coordonnées numériques dans les bornes ; anneaux fermés avec suffisamment de sommets ; tous les centres de secteurs et de communes à l’intérieur des contours et hors des trous ; égalité des géométries préparées avec les snapshots. Les sommes de sommets incluent les sommets de fermeture de chaque anneau. Cela ne remplace pas un audit topologique complet ni la validation produit d’un référentiel national.

## Quartiers des villes — septembre 2026

Les quartiers nommés sont servis dans `quarters/` ; le catalogue de provenance détaillé est `quarters/sources.json`. Ils reprennent les contours municipaux et IGN/INSEE du projet Meewav-Web, complétés par les Contours IRIS IGN 2026 via la Géoplateforme, sous Licence Ouverte 2.0. Les contours municipaux complets d’Angers proviennent de https://data.angers.fr/explore/dataset/ccq_007/. Les codes techniques restent internes ; les subdivisions numérotées partageant un nom sont fusionnées. Les communes de moins de 5 000 habitants et celles sans deux quartiers nommés utilisables ne sont pas subdivisées. Paris conserve son découpage et son attribution existants. Les détails et limites sont documentés dans `Docs/CITY-QUARTERS.md`.

## Relief expérimental de la France métropolitaine

Altitudes : Mapzen / Tilezen Terrain Tiles, récupérées le 10 septembre 2026 depuis AWS Open Data : https://registry.opendata.aws/terrain-tiles/. Les fournisseurs et leurs conditions d’attribution sont listés dans https://github.com/tilezen/joerd/blob/master/docs/attribution.md. Le fichier `relief/source.json` décrit le raster préparé ; les 42 tuiles originales sont conservées dans `data-prep/relief-source-tiles`. Cet essai utilise 60 % de l’altitude réelle et une résolution d’environ 800 à 900 mètres en métropole, Corse comprise. Le masque utilise les contours régionaux déjà attribués dans ce document.
