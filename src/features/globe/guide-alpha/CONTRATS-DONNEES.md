# Guide Alpha - Contrats de donnees

Ce document fixe les schemas attendus par la mecanique partagee. Il faut adapter la source officielle a ces contrats dans un generateur, pas disperser les noms de proprietes bruts de chaque portail open data dans le runtime.

## 1. Collection des quartiers

Le fichier final est un `GeoJSON.FeatureCollection` de `Polygon` ou `MultiPolygon` en longitude/latitude WGS84.

Exemple minimal inspire de Nantes :

```json
{
  "type": "FeatureCollection",
  "metadata": {
    "generatedAt": "2026-07-10T16:54:04.371Z",
    "source": "Portail officiel - nom du jeu de donnees",
    "datasetId": "identifiant-documente",
    "datasetUrl": "https://source-officielle.example/dataset",
    "license": "Licence Ouverte / Open Licence",
    "featureCount": 94
  },
  "features": [
    {
      "type": "Feature",
      "id": "nantes_0101_dobree_bon_port",
      "properties": {
        "zoneId": "nantes_0101_dobree_bon_port",
        "label": "Dobree-Bon Port",
        "districtCode": "0101",
        "arrondissementCode": "1",
        "colorIndex": 0,
        "parentZoneId": "nantes_parent_01_centre_ville",
        "parentCode": "1",
        "parentLabel": "Centre-ville",
        "territoryType": "quartier",
        "source": "Nantes Metropole NAOGeoW",
        "sourceYear": "2023",
        "officialId": "0101",
        "communeCode": "440109",
        "officialAreaM2": 333171.929,
        "labelLng": -1.5671948,
        "labelLat": 47.2114624
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": []
      }
    }
  ]
}
```

Les coordonnees sont omises dans l'exemple uniquement pour le rendre lisible. Une feature reelle doit contenir un anneau ferme valide.

## 2. Proprietes des quartiers

| Propriete | Statut | Regle |
| --- | --- | --- |
| `zoneId` | obligatoire | ID stable, unique, identique a `feature.id` |
| `label` | obligatoire | nom lisible affiche par MapLibre |
| `districtCode` | obligatoire | identifiant officiel de la microzone, conserve comme chaine |
| `arrondissementCode` | obligatoire | code du groupe parent ; utiliser une chaine vide seulement si aucun parent reel n'existe |
| `colorIndex` | obligatoire | entier stable de `0` a `7`, jamais aleatoire |
| `parentZoneId` | obligatoire pour Guide Alpha | ID stable du secteur parent ; le layer `selected-zone-labels` actuel filtre sur sa presence |
| `parentCode` | obligatoire pour Guide Alpha | code officiel du parent, utile au groupement des sous-zones |
| `parentLabel` | recommande | nom humain du parent |
| `territoryType` | obligatoire | `"quartier"` pour un quartier officiel ; conserver `"iris"` si le referentiel infra-communal officiel retenu est un IRIS |
| `source` | obligatoire | organisme et jeu de donnees |
| `sourceYear` | obligatoire | millesime sous forme de chaine |
| `officialId` | obligatoire | identifiant brut de la source officielle |
| `communeCode` | recommande | code officiel conserve sans conversion numerique destructrice |
| `officialAreaM2` | recommande | surface officielle ou calculee, utile au controle de granularite |
| `labelLng` | obligatoire | longitude d'un point garanti dans la geometrie |
| `labelLat` | obligatoire | latitude d'un point garanti dans la geometrie |

Le runtime `normalizeSelectableZoneFeature(...)` complete ensuite :

- `groundColor` a partir de `colorIndex` et de la palette partagee ;
- `isSelectable: true` ;
- `hoverCountLabel` ;
- les valeurs de secours propres aux anciens GeoJSON Paris.

Une nouvelle source ne doit pas dependre de ces fallbacks historiques : elle doit fournir directement les proprietes canoniques.

Le type de territoire decrit la source, pas l'usage produit. Un IRIS utilise comme zone selectionnable intra-muros reste donc un `iris` ; il ne doit pas etre rebaptise quartier. Cette regle est la meme pour la ville centre et pour les sous-zones metropolitaines.

Exception documentee : plusieurs IRIS partageant le meme nom humain officiel et le meme parent peuvent etre dissous en une zone produit unique. Cette feature groupee utilise `territoryType: "quartier"` et doit fournir :

- `groupingRule` : regle deterministe de regroupement ;
- `sourceZoneCount` : nombre de cellules absorbees ;
- `sourceIrisIds` : liste triee de tous les identifiants officiels ;
- `sourceIrisLabels` : libelles officiels d'origine ;
- un `officialId` stable derive de la liste complete des IDs sources.

Il est interdit de supprimer uniquement le numero d'un label sans fusionner sa geometrie. Il est aussi interdit de fusionner deux cellules de parents officiels differents.

Une ville en resolution semantique peut utiliser une curation Guide Alpha versionnee. Chaque operation cible uniquement un `sourceId` exact, ou une liste exhaustive `sourceIds` pour une fusion, et declare : un identifiant d'operation, les libelles sources attendus, le nom humain final ou l'acceptation explicite, une justification et des references de preuve. Les operations autorisees sont `rename`, `merge` et `accept`. Aucun joker, aucune regex et aucune geometrie dessinee a la main ne sont admis.

Une sortie curee doit aussi fournir :

- `metadata.curationStatus: "resolved"` et `metadata.curationRevision` ;
- `metadata.curationSources` et `metadata.sourceCorrections` ;
- `curationOperationId`, `curationEvidenceRefs`, `curationRationale` et `semanticResolution` sur chaque feature transformee ;
- tous les `sourceIrisIds` et `sourceIrisLabels` sur une fusion.

Une anomalie de libelle est une quarantaine temporaire et resolvable. Elle ne constitue jamais une autorisation de remplacer ou d'abandonner la ville.

Si la source ne fournit aucun secteur parent, utiliser un groupe technique stable documente, par exemple la ville elle-meme, uniquement pour le chargement et les labels. Ce groupe ne doit pas etre affiche comme un faux quartier ni devenir selectionnable. Si une vraie hierarchie officielle existe, elle reste prioritaire.

### 2.1. Classification automatique de la subdivision communale

Le mode runtime d'une commune est derive de son inventaire IRIS INSEE, jamais de sa population, de sa superficie ou d'une capacite artistique projetee :

- au moins deux `code_iris` officiels distincts et valides donnent `standalone_split` ;
- exactement un IRIS donne `single_plate` si `type_iris === "Z"` ou si son `code_iris` se termine par `0000` ;
- exactement un IRIS sans ces marqueurs donne `resolution_required` ;
- aucun IRIS, un code vide, un code duplique ou un marqueur communal `Z/0000` melange a des IRIS decoupes donne `resolution_required`.

Le plan conserve une `classificationReason` stable et les compteurs de chaque raison. Une resolution semantique de libelle ne peut pas transformer une commune a plusieurs vrais IRIS en mono-plaque. Inversement, le runtime ne doit jamais inventer des quartiers internes dans une commune officiellement classee `single_plate`.

Le champ de plan `eligibleForSplitCityWave` vaut `true` uniquement pour `standalone_split`. Les communes `single_plate` restent navigables mais demeurent hors du corpus national des villes multi-IRIS a decouper ; elles alimentent le lot mono-plaque separe.

### 2.2. Etat de navigation et couleur

L'eligibilite INSEE et l'etat visuel sont deux notions independantes. En runtime, une seule commune porte le role `active` : la cible du dernier fly. Elle utilise le fond de reference Paris centre `#1B1234`. Les communes officielles visibles dans son contexte portent le role `neighbor` et utilisent la palette claire de la peripherie parisienne. Tout autre territoire conserve son `groundColor` normal.

Deux communes `standalone_split` peuvent se toucher. Cela ne cree aucune priorite de taille : si Lyon est active, Villeurbanne est voisine claire ; apres un fly vers Villeurbanne, Villeurbanne devient active foncee et Lyon redevient voisine claire si elle reste visible. Population, superficie, nombre d'IRIS et appartenance a la liste des villes eligibles ne choisissent jamais ces roles.

Le passage d'une cible a une autre doit effacer les anciens feature-states avant d'appliquer les nouveaux. Une commune multi-IRIS affiche un fond communal actif fonce sous ses vraies plaques internes colorees. Une commune `single_plate` affiche uniquement sa plaque communale active foncee : aucune pseudo-sous-zone ne doit etre superposee.

## 3. Convention d'identifiants

Format :

```text
<ville>_<officialId-complete>_<slug-du-label>
```

Contraintes :

- prefixe identique a `zoneIdPrefix` dans `citySubdivisionConfig.ts` ;
- caracteres ASCII minuscules, chiffres et underscores ;
- ID officiel complete a gauche si cette forme est documentee ;
- slug sans accents ;
- unicite verifiee avant ecriture ;
- stabilite entre deux executions ;
- aucune dependance a l'ordre renvoye par l'API.

Le `feature.id` et `properties.zoneId` doivent etre identiques. MapLibre utilise `promoteId: "zoneId"` pour les feature-states de hover et de selection.

## 4. Invariants geographiques

Le generateur de quartiers doit echouer si :

- une feature n'a pas d'ID ou de nom ;
- une geometrie est absente ou n'est pas Polygon/MultiPolygon ;
- une zone n'appartient pas a la ville cible ;
- deux features produisent le meme `zoneId` ;
- le nombre recu differe du nombre officiel attendu ;
- un point de label ne peut pas etre place dans sa geometrie ;
- les coordonnees ne ressemblent pas a des longitudes/latitudes WGS84 ;
- un parent obligatoire dans la source ne peut pas etre resolu.
- une famille de labels numerotes, y compris un suffixe colle comme `Nom4`, reste exposee comme plusieurs zones visibles ;
- deux zones visibles conservent le meme label humain dans un meme parent ;
- un regroupement traverse une frontiere parente ou perd un identifiant source.

Si la source officielle contient un doublon ou un libelle manifestement errone, ne pas fabriquer un suffixe arbitraire pour forcer l'unicite. La correction doit etre recoupee avec une seconde publication officielle, rester deterministe, ne pas modifier la geometrie et etre inscrite dans `metadata.sourceCorrections`.

Controler aussi, dans un rapport ou une commande d'audit :

- nombre de zones ;
- nombre de parents ;
- surfaces min, moyenne et max ;
- bbox globale ;
- labels vides ou dupliques ;
- IDs dupliques ;
- geometries invalides ;
- trous ou chevauchements visibles.

## 5. Point interieur de label

Le label ne doit pas utiliser aveuglement le centroide. Une zone concave, en croissant ou avec des trous peut avoir un centroide exterieur.

Strategie deterministe validee :

1. calculer le centroide geographique ;
2. le garder seulement s'il est dans le polygone ;
3. essayer le centre de la bbox s'il est dans le polygone ;
4. parcourir une grille fixe dans la bbox ;
5. retenir le point interieur le plus proche de la cible ;
6. echouer si aucun point n'est trouve.

Ne pas calculer ce point au runtime et ne pas utiliser `map.project()` pour placer les labels. `labelLng` et `labelLat` sont calcules une seule fois par le generateur.

## 6. Configuration de ville

Exemple de branchement minimal :

```ts
export type CitySubdivisionId = "paris" | "nantes" | "toulouse";

export const CITY_SUBDIVISION_CONFIGS = {
  // Paris et Nantes restent inchanges.
  toulouse: {
    id: "toulouse",
    sourceUrl: "/map/toulouse-quartiers.geojson",
    zoneIdPrefix: "toulouse_",
    usesOverviewPresetForSearch: true,
  },
} satisfies Record<CitySubdivisionId, CitySubdivisionConfig>;
```

`isCitySubdivisionId(...)` doit reconnaitre la nouvelle valeur. Eviter de laisser une liste differente de celle de `CITY_SUBDIVISION_CONFIGS` si une petite derivation typee peut etre faite sans refonte risquee.

Le champ `usesOverviewPresetForSearch` doit etre `true` pour qu'une nouvelle ville reutilise son preset Ville par la recherche. Une valeur historique `false`, comme celle de Paris, conserve explicitement son arrivee de recherche existante sans imposer cette exception aux villes suivantes.

## 7. Preset camera

Exemple, avec des valeurs a mesurer et non a deviner :

```ts
toulouse: {
  name: "toulouse",
  center: [MEASURED_LONGITUDE, MEASURED_LATITUDE],
  zoom: MEASURED_CITY_ZOOM,
  pitch: 60,
  bearing: MEASURED_BEARING,
  speed: 0.85,
  curve: 1.4,
},
```

Le type `PremiumFlyPresetName` doit deja accepter la ville ou etre etendu a la meme occasion. Tous les chemins doivent utiliser ce preset unique.

## 8. Contrat des layers partages

| ID | Type | Role |
| --- | --- | --- |
| `selected-zone-polygons` | source GeoJSON | hitbox et feature-state canonique |
| `selected-zone-polygons-render` | source GeoJSON | rendu des surfaces et contours |
| `selected-zone-label-points` | source GeoJSON points | labels places dans les zones |
| `selected-zone-fill` | fill | fond des quartiers |
| `selected-zone-interior-light` | fill | surbrillance interieure |
| `selected-zone-hover-glow` | line | guide de hover |
| `selected-zone-outline` | line | contours selon l'etat |
| `selected-zone-hitbox` | fill transparent | interactions pointeur |
| `selected-zone-labels` | symbol | noms avec collision MapLibre |

Invariants :

- aucune ville n'ajoute un second exemplaire de ces IDs ;
- `promoteId: "zoneId"` reste actif sur les sources de quartiers ;
- le hitbox est transparent mais present ;
- les labels utilisent les collisions MapLibre ;
- aucune source, couche ou commande UX de batiments n'est ajoutee ;
- les landmarks GLB restent des custom layers independants de ce contrat ;
- les avatars restent au-dessus de la stack cartographique ;
- les pop-ups restent des composants UI et ne sont pas migrees dans ce systeme.

## 9. Validation automatisee minimale des donnees

Avant le test navigateur, verifier par script ou test :

```text
quartierFeatureCount === expectedOfficialCount
unique(zoneId).length === quartierFeatureCount
every(feature.id === feature.properties.zoneId)
every(required canonical property exists)
every(label point is inside its zone)
largest output file < 100 MB
```

Une validation de schema ne remplace pas la comparaison visuelle : elle empeche seulement une fausse reussite technique.
