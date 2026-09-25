# Guide Alpha - Communes metropolitaines

Ce chapitre couvre le niveau supplementaire demande autour d'une ville deja compatible Guide Alpha :

```text
ville + communes voisines -> clic commune -> sous-zones officielles -> clic sous-zone -> selection et fly
```

Il ne remplace pas le guide intra-muros. La ville doit deja fonctionner seule avant d'ajouter sa metropole.

## Regles de donnees

1. Utiliser un jeu officiel de limites communales.
2. Retirer la ville centre du fichier des communes voisines ; ses quartiers Guide Alpha restent la source de verite au centre.
3. Chercher des quartiers communaux officiels assez fins.
4. Si leur couverture est incomplete ou leur granularite insuffisante, un referentiel officiel infra-communal tel que les IRIS IGN/INSEE peut etre utilise.
5. Conserver `territoryType: "iris"` pour un IRIS. Ne jamais le rebaptiser quartier municipal.
6. Une commune couverte par un seul IRIS peut exposer cet IRIS officiel comme sous-zone unique afin de conserver le chemin de selection. Elle ne doit jamais etre presentee comme un quartier municipal ni remplacee par une grille artificielle.
7. Mesurer la surface mediane, les maxima et la couverture enfants/parent avant de brancher le runtime.
8. Ne pas corriger les petits ecarts de referentiels en deformant les geometries officielles.
9. Si le millesime des limites communales est anterieur au millesime courant, comparer la liste complete des codes INSEE a une source EPCI courante et faire echouer le generateur en cas d'ecart.
10. Une commune associee officiellement distinguee de la ville centre peut rester un parent separe si la source fournit sa geometrie et son code. Conserver sa nature officielle, la marquer comme non-membre EPCI autonome et retirer ses sous-zones de la collection intra-muros afin d'eviter tout doublon.

## Cas pilote Nantes Metropole

Sources :

- 24 limites communales : Nantes Metropole Open Data, dataset `244400404_communes-nantes-metropole` ;
- 138 sous-zones hors Nantes : WFS Geoplateforme `STATISTICALUNITS.IRIS:contours_iris`, edition 2026, coedition IGN/INSEE ;
- Nantes `44109` est exclue du niveau communes et conserve ses 94 microquartiers ;
- 23 communes restent dans l'overview ;
- 17 communes ont plusieurs IRIS ;
- 6 communes ont un IRIS unique, affiche comme unique sous-zone officielle : Brains, Indre, Mauves-sur-Loire, Le Pellerin, Saint-Aignan de Grand Lieu et Saint-Leger-les-Vignes.

Fichiers reproductibles :

- generateur : `scripts/generate-nantes-metropole-communes.ts` ;
- parents : `public/map/nantes-metropole-communes.geojson` ;
- enfants : `public/map/nantes-metropole-subzones.geojson` ;
- commande donnees : `npm run generate:nantes-metropole-communes`.

## Configuration minimale

Etendre la configuration de la ville, sans ajouter de controleur :

```ts
metropolitanArea: {
  overviewUrl: "/map/<ville>-metropole-communes.geojson",
  subzonesUrl: "/map/<ville>-metropole-subzones.geojson",
  communeZoneIdPrefix: "<ville>_metropole_commune_",
  subzoneZoneIdPrefix: "<ville>_metropole_subzone_",
  // A renseigner seulement si des emprises officielles tres vastes le prouvent.
  parentCameraMinZoom: 8.2,
  subzoneCameraMinZoom: 8.2,
}
```

Les IDs parent et enfant doivent etre stables et ne jamais etre derives d'un index aleatoire.

Ajouter `paletteFamily: "metropolitan"` aux parents et enfants. Cette propriete applique la palette claire inspiree du Grand Paris sans coder le nom d'une ville dans les expressions MapLibre.

Contrat minimal recommande :

| Niveau | Proprietes obligatoires |
| --- | --- |
| Commune parent | `zoneId`, `districtCode`, `label`, `territoryType: "commune"`, `paletteFamily: "metropolitan"` |
| Sous-zone | `zoneId`, `parentCode`, `label`, `territoryType` reel, `paletteFamily: "metropolitan"` |

Le resolver de configuration doit tester les prefixes metropolitains avant le prefixe de la ville. Avec `nantes_`, un test trop large intercepterait sinon `nantes_metropole_subzone_...` et choisirait la mauvaise configuration.

## Collection attendue par niveau

Vue Ville :

```text
quartiers de la ville centre + toutes les communes voisines
```

Focus sur une commune :

```text
quartiers de la ville centre
+ communes voisines sauf la commune active
+ sous-zones officielles de la commune active
```

Le parent actif est retire avant d'ajouter ses enfants. Sinon les surfaces se superposent, les clics deviennent ambigus et le GPU dessine deux geometries au meme endroit.

La source d'outline actif peut conserver la geometrie du parent pendant le focus. Elle ne doit pas remettre le fill du parent.

## Contrat de reference valide a Romainville

Romainville est le stress test canonique pour le focus d'une commune du Grand Paris. Une nouvelle commune n'est pas consideree comme terminee tant qu'elle ne reproduit pas simultanement les comportements suivants :

1. le fly cadre la commune entiere et place son centre visuel au centre utile de l'ecran, en tenant compte des panneaux de l'interface ;
2. le contour du parent reste affiche en blanc, epais et continu pendant tout le focus ;
3. le fill du parent est retire avant l'insertion de ses enfants ;
4. toutes les sous-zones officielles sont visibles en meme temps ;
5. les sous-zones utilisent des couleurs violettes distinctes, stables et deterministes, comparables aux quartiers de Paris ;
6. le territoire exterieur est assombri pour rendre le niveau actif immediatement comprehensible ;
7. un clic sur une sous-zone poursuit le fly vers elle : il ne doit jamais reculer, dezoomer ni revenir au cadrage parent ;
8. le contour parent reste un repere visuel et ne redevient jamais une surface interactive au-dessus des enfants.

Les couleurs enfants ne doivent pas dependre de l'ordre courant du tableau. Utiliser une cle stable (`zoneId`, `districtCode` ou `colorIndex` genere de facon deterministe) afin qu'un quartier conserve sa couleur apres un retour Ville, un second fly ou un rechargement du style.

Le cadrage doit etre calcule depuis les bounds de la geometrie parent ou de l'union de ses enfants, pas depuis un centre code en dur. Verifier visuellement les communes concaves, allongees et multi-polygones : leur centre geometrique brut peut placer la masse principale hors axe.

Pour une metropole tres etendue, la collection doit quand meme contenir tous les membres officiels. Le preset Ville continue de cadrer la ville centre et ses zones lisibles ; il ne doit pas etre dezoome artificiellement pour afficher tout l'arriere-pays. Ne pas reduire le perimetre officiel pour compenser ce choix de camera.

## Runtime a reutiliser

Reutiliser exclusivement :

- `selected-zone-polygons` pour le hitbox et les feature-states ;
- `selected-zone-polygons-render` pour les surfaces et contours ;
- `selected-zone-label-points` pour les labels ;
- l'unique jeu de listeners du `SelectedZoneExtrusionController`.

Ne pas creer une source et des listeners par commune. Les collections GeoJSON sont chargees une fois, mises en cache, puis fusionnees uniquement lors d'un changement de niveau produit, jamais pendant un mouvement de camera.

Les feature-states restent ceux du controleur partage : `hover`, `selected` et `dimmed`. L'etat `selected` doit toujours avoir priorite sur `hover`, y compris apres un drag, un `moveend` ou un `idle`, afin d'eviter le clignotement de la zone active.

Le focus commune est un etat produit complet. Il comprend au minimum : parent actif, collection enfants, outline parent, etats `selected`/`dimmed` et eventuelle sous-zone active. Ne jamais modifier seulement la collection rendue en laissant les autres champs actifs : Paris ou la ville centre resterait assombrie apres le dezoom.

## Camera de reference

Pour le focus d'une commune, reutiliser le profil valide du Grand Paris :

- calcul du cadrage avec `cameraForBounds` sur les sous-zones du parent ;
- padding haut/bas/gauche/droite adapte a l'UI ;
- zoom borne entre `13.9` et `17.4` pour une metropole compacte ;
- pitch d'arrivee `60` degres ;
- bearing courant conserve ;
- `speed: 0.85` ;
- `curve: 1.24`.

Le clic sur une sous-zone reutilise ensuite le fly de quartier partage. Pour une sous-zone metropolitaine, conserver le meme plafond de zoom `17.4` que le Grand Paris. Ne pas ajouter de preset par commune et ne pas calculer un nouveau cadrage pendant les mouvements de camera.

Si `cameraForBounds` calcule un zoom inferieur pour une commune officielle tres vaste, ne pas le relever jusqu'a couper la geometrie. Des minima `parentCameraMinZoom` et `subzoneCameraMinZoom` plus bas peuvent etre configures pour la metropole concernee, apres mesure des plus grandes emprises sur desktop et mobile. Les valeurs par defaut compactes de Paris et Nantes restent inchangees.

Le cadrage du bouton Ville reste calcule sur la ville centre. Une metropole peut couvrir un territoire beaucoup plus vaste que l'agglomeration visible ; utiliser les bounds de toutes ses communes pour ce preset rendrait les quartiers centraux illisibles. Les communes hors ecran restent chargees dans l'overview partage et deviennent accessibles par navigation cartographique ou recherche, sans modifier le sens du preset Ville.

## Sortie naturelle du focus au dezoom

Le bouton Ville n'est pas le seul moyen de quitter une commune. Lorsque l'utilisateur dezoome naturellement au-dessus du niveau de lecture des communes, le runtime doit restaurer automatiquement la vue Ville normale.

Pour le Grand Paris, le seuil de reference actuel est :

```ts
GRAND_PARIS_PARENT_OVERVIEW_RETURN_MIN_ZOOM = 12.05
```

Sous ce seuil, une fois le mouvement de camera stabilise :

1. vider la sous-zone selectionnee ;
2. effacer les feature-states `selected` et `dimmed` ;
3. supprimer le focus et l'outline du parent actif ;
4. restaurer la collection overview de Paris et des communes ;
5. restaurer leurs couleurs normales et leurs labels ;
6. conserver exactement la camera courante.

Cette restauration est un changement d'etat de rendu, pas une navigation. Elle ne doit appeler ni `flyTo`, ni `easeTo`, ni recentrer Paris. L'utilisateur doit continuer son dezoom sans saut de camera.

Declencher la verification sur la stabilisation (`moveend`, `idle` ou le point de settle partage), jamais avec une reconstruction GeoJSON a chaque frame de zoom. Ne pas restaurer l'overview pendant un fly programme : le garde `isZoneFlyActive` ou son equivalent doit proteger toute navigation en cours.

Le seuil doit etre centralise et nomme. Une hysteresis peut etre ajoutee si une oscillation est observee autour de la limite, mais les couches ne doivent jamais alterner en boucle entre focus et overview.

## Procedure pour une nouvelle metropole

1. Terminer et valider la ville centre avec le Guide Alpha intra-muros.
2. Trouver les limites officielles des communes membres, comparer leurs codes a l'appartenance EPCI courante et exclure la ville centre du niveau parent.
   Si la source distingue des communes associees, verifier leurs codes et leurs geometries separement : elles ne doivent pas etre ajoutees a la liste des membres EPCI.
3. Chercher un decoupage officiel complet des communes ; si la couverture est partielle, auditer un referentiel infra-communal officiel sans renommer sa nature.
4. Generer deux GeoJSON canoniques et reproductibles : parents puis sous-zones.
5. Verifier les comptes attendus, IDs, geometries, labels interieurs, surfaces et couverture enfant/parent.
6. Ajouter uniquement `metropolitanArea` a la configuration existante de la ville.
7. Reutiliser les sources, layers, feature-states et listeners `selected-zone-*` existants.
8. Construire la collection de focus en retirant le parent actif avant d'inserer ses enfants, tout en conservant son outline dans la source dediee.
9. Reutiliser la camera Grand Paris et le fly de quartier partage.
10. Verifier qu'aucune source, couche, requete ou commande UX de batiments n'est introduite ; les landmarks GLB restent independants.
11. Annuler toute restauration de ville obsolete avec un jeton et retirer les listeners/timeouts precedents.
12. Tester Romainville comme reference visuelle et fonctionnelle, puis une commune dense, une commune moyenne, une commune a sous-zone unique, deux visites et un retour Paris.
13. Cocher la section K de `CHECKLIST.md` avant de declarer le travail termine.

## Reference validee a Nantes

Le pilote Nantes fournit les ordres de grandeur suivants pour detecter une regression :

- overview : `94` microquartiers de Nantes + `23` communes voisines = `117` zones uniques ;
- sous-zones : `138` IRIS repartis sur les `23` communes ;
- Saint-Herblain : `28` IRIS, soit `144` zones dans le contexte de focus ;
- Orvault : `15` IRIS, soit `131` zones dans le contexte de focus ;
- Reze : `13` IRIS, soit `129` zones dans le contexte de focus ;
- granularite mediane des IRIS : environ `1.23 km2`, contre environ `2.09 km2` pour Charonne ;
- couverture enfants/parent observee : environ `98.53 %` a `100.80 %` selon la commune.

Ces chiffres ne doivent pas etre recopies pour une autre ville. Ils servent de controles de coherence pour Nantes et d'exemple du niveau de preuve attendu.

## Reference de donnees Nice Cote d'Azur

Nice illustre une metropole beaucoup plus etendue et rurale que Nantes :

- ville centre : `146` IRIS IGN/INSEE, groupes par `6` territoires municipaux officiels ;
- overview : `146` IRIS de Nice + `50` communes voisines = `196` zones uniques ;
- appartenance : `51` codes communaux identiques entre les limites Open Data 2022 et l'EPCI `200030195` courant en 2026 ;
- sous-zones : `92` IRIS repartis sur les `50` communes voisines ;
- `7` communes ont plusieurs IRIS et `43` conservent leur IRIS officiel unique ;
- Cagnes-sur-Mer : `17` IRIS, soit `212` zones dans le contexte de focus ;
- Carros : `5` IRIS, soit `200` zones dans le contexte de focus ;
- Levens : un IRIS officiel, soit `196` zones dans le contexte de focus apres remplacement du parent ;
- granularite mediane hors Nice : environ `4.52 km2`, maximum environ `171.51 km2` pour une commune alpine a IRIS unique ;
- couverture enfants/parent observee : environ `98.70 %` a `101.43 %` ;
- minima camera parent/enfant abaisses a `8.2` pour laisser le cadrage derive de la geometrie couvrir les communes alpines ; plafond conserve a `17.4`.

Ces valeurs documentent un cas de controle. La forte proportion d'IRIS uniques et les grandes surfaces rurales ne justifient ni une grille ni de faux quartiers.

## Tests obligatoires

1. Fly Ville : ville centre + toutes les communes presentes, sans couche de batiments.
2. Hover de trois communes : une seule surface change, une seule carte de hover.
3. Clic sur une commune divisee : parent retire, enfants visibles, cadrage sur le parent.
4. Clic sur trois enfants de tailles differentes : fly, couleurs et selection identiques a Paris.
5. Clic sur une commune a IRIS unique : l'IRIS officiel unique remplace le parent, reste type `iris` et reste selectionnable sans fausse subdivision.
6. Passage direct d'une commune a une autre : aucune source, couche ou interaction dupliquee.
7. Bouton Ville : retour a la collection overview complete.
8. Pays puis retour Ville : nettoyage complet et seconde visite identique.
9. Style reload : sources restaurees, aucun listener duplique.
10. Audit donnees : IDs, comptes, labels interieurs et geometries valides.
11. Reference Romainville : commune centree, outline blanc persistant, parent sans fill et enfants simultanement differencies.
12. Clic sur chaque type d'enfant : le fly avance vers l'enfant et ne recule jamais vers le cadrage commune.
13. Dezoom manuel sous le seuil overview : couleurs normales restaurees sans clic sur Ville, sans saut de camera et sans Paris assombri.
14. Dezoom pendant un fly programme : aucune restauration prematuree et aucun conflit de camera.
15. Seconde visite apres sortie naturelle : meme cadrage, memes couleurs, meme contour et aucun feature-state obsolete.

## Pieges observes

- Les jeux appeles « quartiers des communes » peuvent ne couvrir qu'une minorite des communes.
- Une couche nommee « micro quartier » peut ne contenir que des points, donc ne pas etre utilisable pour des surfaces.
- Un identifiant interne de metropole n'est pas forcement le code INSEE.
- Un prefixe metropolitain commencant comme le prefixe de la ville doit etre teste avant celui-ci dans le loader et exclu du helper intra-muros.
- Une commune active ne doit jamais rester sous ses enfants.
- Une simple remise de la collection overview ne suffit pas : si `selected`, `dimmed` ou l'outline ne sont pas nettoyes, la ville centre reste sombre jusqu'au clic sur Ville.
- Une sortie automatique au dezoom ne doit jamais reutiliser le handler du bouton Ville si celui-ci recadre la camera.
- Des couleurs enfants derivees de l'index courant changent apres une fusion de collections ; elles doivent etre derivees d'un identifiant stable.
- Verifier le seuil de retour seulement au settle de camera evite un recalcul GeoJSON et des mutations de feature-state a chaque frame.
- Une grande metropole administrative ne doit pas imposer ses bounds complets au preset de la ville centre.
- Un jeu de limites plus ancien peut rester compatible avec l'EPCI courant, mais seulement apres comparaison exhaustive des codes ; les deux millesimes doivent rester distincts dans les metadata.
- Une metropole peut s'etendre tres loin de la ville centre. Conserver tous ses membres dans les donnees sans remplacer le preset Ville intra-muros par un cadrage metropolitain illisible.
- Forcer le minimum compact `13.9` ou `14.5` sur une commune alpine coupe son emprise ; parametrer un minimum plus bas et conserver le resultat de `cameraForBounds`.
