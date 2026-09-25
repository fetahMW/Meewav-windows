# Guide Alpha - Communes a plaque unique

Ce chapitre couvre la phase nationale qui suit les vagues de villes decoupees. Il permet de publier, en une seule execution reproductible, toutes les communes que l'inventaire IRIS officiel identifie comme une unite communale unique.

## Regle INSEE de classification

La classification est automatique, exclusive et fondee uniquement sur l'inventaire IRIS INSEE :

1. au moins deux IRIS officiels distincts et valides donnent `standalone_split` : la commune est decoupee selon ces vraies plaques ;
2. exactement un IRIS donne `single_plate` seulement si `type_iris === "Z"` **ou** si `code_iris` se termine par `0000` ;
3. exactement un IRIS qui ne satisfait aucun de ces deux marqueurs donne `resolution_required` ;
4. aucun IRIS, un code vide, un inventaire duplique ou un marqueur communal `Z/0000` melange a des IRIS decoupes donne `resolution_required`.

La population, la superficie, la capacite projetee et le fait qu'une ville paraisse petite ou grande ne participent jamais a cette decision. Ils peuvent regler la camera ou la charge d'affichage, mais ne peuvent ni creer une sous-zone, ni supprimer un IRIS, ni choisir un mode runtime.

Une commune deja possedee par un corpus Guide Alpha ou metropolitain reste exclue de la publication en doublon. Ce controle de possession intervient apres la classification et ne modifie pas son resultat INSEE.

Un inventaire a plusieurs IRIS dont les libelles sont ambigus conserve le mode `standalone_split` et passe par la resolution semantique Guide Alpha avant publication. Une commune mono-IRIS ambigue reste `resolution_required` ; elle ne doit jamais etre forcee en plaque unique pour terminer le lot.

La liste nationale des villes a decouper, estimee a environ 1900 communes, ne contient que les communes `standalone_split` a plusieurs vrais IRIS. Les communes `single_plate` restent navigables comme territoires, mais sont comptabilisees hors de cette liste multi-IRIS et traitees par le lot mono-plaque.

Cette appartenance ne porte aucune couleur. Une commune est foncee uniquement lorsqu'elle est la cible active du fly ; les communes visibles autour sont claires, y compris lorsqu'elles appartiennent elles aussi aux quelque 1900 villes multi-IRIS. Au fly suivant, les roles s'inversent sans tenir compte de la taille. Une `single_plate` active utilise donc exactement le meme fond fonce qu'une grande ville active.

## Une passe nationale, pas une implementation par commune

La publication est lancee par une seule commande et produit un manifeste national deterministe. Elle ne doit creer ni un script, ni un controleur, ni des listeners MapLibre par commune.

Les geometries peuvent etre reparties en fragments techniques par departement afin de conserver un chargement a la demande raisonnable. Ce partitionnement ne change pas le contrat produit : une commune eligible correspond exactement a une plaque et a une entree du manifeste national.

Le runtime reutilise :

- le registre national indexe par code INSEE et identifiant de recherche ;
- les sources et layers `selected-zone-*` partages ;
- le controleur de selection existant ;
- une camera calculee depuis la geometrie officielle ;
- le meme fly premium et les memes commandes souris que les villes decoupees.

Le fichier charge pour une commune ne doit contenir dans la collection active que sa plaque. Il est interdit d'injecter simultanement toutes les petites communes dans la source MapLibre active.

## Contrat de plaque

Chaque feature doit conserver au minimum :

- `feature.id === properties.zoneId` ;
- `zoneId: "commune_<code-insee>"` ;
- `label` egal au nom officiel de la commune ;
- `communeCode` et `districtCode` egaux au code INSEE ;
- `territoryType: "commune"` ;
- `runtimeMode: "single_plate"` dans le manifeste ;
- une geometrie officielle `Polygon` ou `MultiPolygon` en EPSG:4326 ;
- un point de label garanti dans la geometrie ;
- la provenance, le millesime et la licence.

Le generateur echoue sur les codes dupliques, les geometries invalides, les noms vides, les points de label exterieurs, les communes deja possedees par un autre corpus et toute derive du compte attendu.

## Passage des vagues decoupees au lot massif

Le planificateur applique la meme fonction de classification a chaque commune. Il consigne pour chacune le mode, la raison explicite, le nombre de features sources et le nombre d'IRIS distincts. Le bilan separe les communes decoupees, les mono-plaques eligibles et les resolutions d'inventaire encore ouvertes ; aucun seuil de population ou de capacite n'intervient.

Apres validation de ce bilan, toutes les candidates mono-plaque sont generees, indexees et auditees en une seule passe. Une seconde execution sans changement de source doit produire les memes IDs, les memes geometries fonctionnelles et le meme manifeste.

## Validations obligatoires

1. couverture exhaustive des codes eligibles et absence de doublon avec les corpus existants ;
2. une feature visible exactement par commune ;
3. recherche -> fly -> plaque visible au premier clic ;
4. bouton Ville, Pays puis seconde visite sans source, layer ou listener duplique ;
5. cadrage complet des communes concaves, insulaires et multipolygones ;
6. chargement paresseux : aucune geometrie nationale massive dans la source active ;
7. comparaison deterministe du manifeste entre deux generations ;
8. audit des raisons de classification : plusieurs IRIS, IRIS unique `Z`, code unique finissant par `0000` ou resolution explicite.
