# Guide Alpha - Checklist de livraison

Cette checklist est une porte de sortie. Une case non validee doit etre corrigee ou declaree comme limitation ; elle ne doit pas etre ignoree.

## A. Demarrage

- [ ] Le travail est effectue dans le worktree demande.
- [ ] Les modifications preexistantes ont ete identifiees et preservees.
- [ ] `README.md` et `CONTRATS-DONNEES.md` du Guide Alpha ont ete lus.
- [ ] Paris a ete auditee dans le code actuel, pas seulement d'apres un souvenir.
- [ ] Le build initial et les avertissements initiaux ont ete notes.
- [ ] Des captures Paris de reference ont ete prises.
- [ ] Le perimetre est limite a la ville intra-muros, sauf phase metropolitaine explicitement demandee et documentee.

## B. Source officielle

- [ ] La source geographique est officielle ou publiquement documentee.
- [ ] Son URL, sa licence, son millesime et son schema sont consignes.
- [ ] Les donnees sont en EPSG:4326 a la sortie du generateur.
- [ ] Les zones sont des Polygon/MultiPolygon valides.
- [ ] Les noms et IDs officiels sont presents.
- [ ] Le filtre exclut les communes voisines.
- [ ] La granularite convient a la limite d'environ 500 avatars par quartier.
- [ ] Les grandes zones ont ete comparees a Charonne.
- [ ] Les macrosecteurs servent seulement de parents s'ils sont trop vastes.
- [ ] Aucun quartier n'a ete invente.
- [ ] Les familles `Nom 1`, `Nom 2`, `Nom 3` et les variantes collees comme `Nom4` ont ete auditees et ne sont pas exposees comme des quartiers distincts.
- [ ] Chaque plaque visible porte un nom humain unique comparable au modele Paris.
- [ ] Les cellules regroupees partagent le meme nom officiel et le meme parent.
- [ ] Chaque regroupement conserve tous ses `sourceIrisIds` et recalcule son point interieur.
- [ ] Les doublons situes dans des parents differents sont desambiguises, jamais fusionnes a travers la ville.
- [ ] Toute anomalie semantique a une resolution versionnee par IDs sources exacts ; aucune ville n'a ete remplacee ou abandonnee.
- [ ] Chaque curation declare ses anciens libelles attendus, sa justification et ses sources, et echoue en cas de derive du millesime.
- [ ] Les connaissances geographiques ont servi a retrouver les lieux, puis leur rattachement aux geometries officielles a ete verifie.

## C. GeoJSON canonique

- [ ] Un generateur reproductible `generate-<ville>-districts` existe.
- [ ] Le nombre officiel attendu est verifie par le script.
- [ ] Chaque `zoneId` suit `<ville>_<official-id>_<slug>`.
- [ ] `feature.id === properties.zoneId` pour chaque zone.
- [ ] Les `zoneId` sont uniques et stables entre deux executions.
- [ ] Toutes les proprietes obligatoires du contrat sont presentes.
- [ ] Chaque label dispose d'un point interieur valide.
- [ ] Les metadata de provenance sont presentes.
- [ ] Les surfaces min, moyenne et max ont ete controlees.

## D. Configuration runtime

- [ ] `CitySubdivisionId` contient la ville.
- [ ] `CITY_SUBDIVISION_CONFIGS` contient la ville.
- [ ] `sourceUrl` charge le bon GeoJSON.
- [ ] `zoneIdPrefix` correspond aux IDs generes.
- [ ] `isCitySubdivisionId(...)` reconnait la ville.
- [ ] `getCitySubdivisionIdForTarget(...)` reconnait preset, hub et recherche.
- [ ] Aucun nouveau controleur, source partagee ou layer partage n'a ete duplique.

## E. Camera et chemins d'entree

- [ ] Le preset est centralise dans `CITY_CAMERA_PRESETS`.
- [ ] Le cadrage montre toute la ville avec un peu de contexte.
- [ ] Le centre camera tombe dans une subdivision visible ; une commune insulaire ou discontinue declare un override explicite au lieu d'utiliser le milieu de sa bbox globale.
- [ ] Centre, zoom, pitch et rotation viennent d'une mesure visuelle.
- [ ] Le raccourci de ville utilise ce preset.
- [ ] La recherche utilise ce preset.
- [ ] Le hub ou point de ville utilise ce preset.
- [ ] Le fly premium utilise ce preset.
- [ ] Le bouton Ville restaure ce preset et les subdivisions.
- [ ] Recherche, hub, plaque communale et vue metropolitaine chargent tous le meme corpus canonique de subdivisions pour une commune donnee.
- [ ] Aucun handler ne contient un second preset contradictoire.

## F. Architecture sans batiments

- [ ] Aucun generateur, manifeste ou fichier de batiments n'est ajoute pour la ville.
- [ ] Aucun loader, preload, cache ou appel reseau de batiments n'est ajoute au runtime.
- [ ] Aucune source ni couche MapLibre de batiments n'est creee.
- [ ] Aucun bouton, toggle, panneau de debug ou handler de clic dedie aux batiments n'est cree.
- [ ] Les quartiers, routes, labels et avatars restent fonctionnels sans cette couche.
- [ ] Les landmarks GLB existants restent presents et independants du rendu geographique.

## G. Rendu geographique et GLB

- [ ] Les seules couches partagees de quartier sont les sources et layers `selected-zone-*` documentes.
- [ ] Les extrusions geographiques nationales ou regionales ne sont pas confondues avec des batiments.
- [ ] Les custom layers GLB restent ordonnes correctement par rapport aux quartiers et avatars.
- [ ] Les chemins raccourci, recherche, hub, premium et Ville conservent la meme selection.
- [ ] `moveend` et `idle` ne recreent aucune couche supprimee.
- [ ] Aucun echantillonneur ou `requestAnimationFrame` de debug ne reste en production.

## H. Interactions et rendu

- [ ] Les fonds de quartiers correspondent a Paris.
- [ ] Les contours correspondent aux memes etats que Paris.
- [ ] Aucun contour blanc n'a ete invente pendant la selection.
- [ ] Le hover ne touche qu'une zone.
- [ ] Le clic ne selectionne qu'une zone.
- [ ] La selection precedente est effacee.
- [ ] Les labels sont lisibles et utilisent la collision MapLibre.
- [ ] Aucun controle de batiments n'apparait dans l'interface.
- [ ] Le mode 2D/3D fonctionne.
- [ ] Rotation, pitch, zoom et dezoom fonctionnent.
- [ ] Les avatars et leurs pop-ups n'ont pas ete modifies.

## I. Nettoyage et robustesse

- [ ] Ville -> Pays vide les zones de la ville.
- [ ] Quartier -> Ville efface la selection avant le fly.
- [ ] Une requete geographique terminee apres le depart est ignoree.
- [ ] Une seconde visite ne duplique aucune source.
- [ ] Une seconde visite ne duplique aucun layer.
- [ ] Une seconde visite ne duplique aucun listener.
- [ ] Un rechargement de style restaure une seule fois les layers partages.
- [ ] Le feature-state hover/selection est reinitialise.
- [ ] Une erreur de source ne casse pas toute la carte.
- [ ] Aucune nouvelle erreur console n'apparait.

## J. Regression et preuves

- [ ] `npm run build` passe apres les modifications.
- [ ] Paris fonctionne avant et apres le test de la nouvelle ville.
- [ ] Trois quartiers de tailles differentes ont ete survoles.
- [ ] Trois quartiers de tailles differentes ont ete selectionnes.
- [ ] Aucun chargement, layer ou controle de batiments n'apparait pendant le parcours.
- [ ] La ville a ete visitee au moins deux fois.
- [ ] Un `setStyle` ou rechargement equivalent a ete teste.
- [ ] Des captures comparables Paris/nouvelle ville ont ete prises.
- [ ] La capture de retour Ville ne montre aucun flash de couche obsolete.
- [ ] Le compte rendu contient sources, fichiers, chiffres, tests et limites.
- [ ] Les communes voisines sont hors perimetre ou integrees explicitement via la configuration metropolitaine et des donnees officielles separees.

## K. Extension communes metropolitaines

Ne cocher cette section que si les communes voisines font explicitement partie de la mission.

- [ ] La ville centre est deja fonctionnelle et validee avec les sections A a J.
- [ ] `COMMUNES-METROPOLITAINES.md` a ete lu avant toute modification.
- [ ] Les limites communales proviennent d'une source officielle documentee.
- [ ] Leurs codes INSEE ont ete compares a une appartenance EPCI courante si le millesime des geometries est plus ancien.
- [ ] La ville centre est exclue du GeoJSON des communes parentes.
- [ ] Les communes associees eventuelles conservent leur nature officielle, sont signalees comme non-membres EPCI autonomes et ne dupliquent aucune sous-zone intra-muros.
- [ ] Les sous-zones couvrent toutes les communes ou les absences officielles sont documentees.
- [ ] La nature reelle des sous-zones est conservee (`iris`, quartier municipal, etc.).
- [ ] Aucun faux quartier, grille ou nom administratif n'a ete invente.
- [ ] Les communes a sous-zone officielle unique restent accessibles sans faux decoupage.
- [ ] Les comptes attendus, surfaces et ratios de couverture parent/enfants sont verifies.
- [ ] La proportion de communes a sous-zone unique et la plus grande surface enfant sont consignees.
- [ ] Les parents utilisent `territoryType: "commune"` et `paletteFamily: "metropolitan"`.
- [ ] Les enfants possedent `parentCode`, un ID stable et leur `territoryType` reel.
- [ ] `metropolitanArea` configure les deux GeoJSON et les deux prefixes sans nouveau controleur.
- [ ] Les resolvers testent le prefixe metropolitain avant celui de la ville.
- [ ] La vue Ville fusionne quartiers centraux et communes sans ID duplique.
- [ ] Le focus conserve un fond communal actif `#1B1234` sous les vrais enfants multi-IRIS ; une mono-plaque n'ajoute aucun faux enfant.
- [ ] L'outline du parent actif reste visible sans remettre sa surface.
- [ ] Le fly place la commune entiere au centre utile de l'ecran, avec un cadrage calcule depuis sa geometrie et non un centre code en dur.
- [ ] L'outline parent est blanc, epais, continu et persiste pendant la navigation entre ses enfants.
- [ ] Toutes les sous-zones officielles sont visibles simultanement avec des couleurs distinctes et deterministes.
- [ ] La couleur d'une sous-zone reste identique apres retour Ville, rechargement du style et seconde visite.
- [ ] Une seule commune est `active` et foncee ; les communes voisines visibles sont claires, les autres territoires gardent leur fond normal.
- [ ] Deux villes eligibles adjacentes echangent proprement leurs roles `active`/`neighbor` au fly, independamment de leur population, superficie ou nombre d'IRIS.
- [ ] Les feature-states du contexte precedent sont nettoyes : aucune ancienne cible ou voisine ne conserve une couleur obsolete apres un nouveau fly.
- [ ] Le hover, le clic, la selection et les labels reutilisent les layers partages.
- [ ] La camera parent reutilise `cameraForBounds` et le profil Grand Paris mesure.
- [ ] Toute exception de zoom minimum pour une emprise tres vaste est configuree, mesuree et documentee sans modifier les valeurs compactes des autres villes.
- [ ] Une metropole tres etendue conserve le preset Ville intra-muros sans retirer ses membres officiels de la collection.
- [ ] Le fly enfant reutilise le fly de quartier et son plafond de zoom metropolitain.
- [ ] Le clic enfant rapproche la camera de l'enfant et ne recule jamais vers le cadrage parent.
- [ ] Aucune sous-zone ne declenche de chargement ou de rendu de batiments.
- [ ] Les landmarks GLB restent visibles selon leur registre sans dependre du focus commune.
- [ ] Les navigations concurrentes utilisent des tokens et annulent listeners/timeouts obsoletes.
- [ ] Commune dense, moyenne et a sous-zone unique ont ete testees.
- [ ] Romainville reproduit le contrat de reference : centrage, contour blanc, enfants differencies, parent actif fonce et communes voisines claires.
- [ ] Un dezoom manuel sous le seuil overview restaure naturellement les couleurs et la collection normales sans clic sur Ville.
- [ ] Cette restauration conserve la camera courante et n'appelle aucun fly ou recentrage.
- [ ] La sortie naturelle nettoie parent actif, outline, sous-zone et feature-states `selected`/`dimmed`.
- [ ] La verification du seuil se fait au settle de camera et ne reconstruit rien a chaque frame.
- [ ] Un fly programme en cours ne peut pas declencher prematurement la sortie naturelle.
- [ ] Une seconde visite apres sortie naturelle est strictement identique a la premiere.
- [ ] Commune -> Ville -> Pays -> Ville -> commune fonctionne sans duplication.
- [ ] Paris fonctionne encore apres le parcours metropolitain complet.

## L. Lot national des communes a plaque unique

Ne cocher cette section que pour la phase massive documentee dans `COMMUNES-MONO-PLAQUE.md`.

- [ ] Chaque commune est absente des corpus Guide Alpha et metropolitains deja couverts.
- [ ] Au moins deux IRIS INSEE officiels distincts et valides donnent toujours `standalone_split`.
- [ ] Un IRIS unique donne `single_plate` seulement si `type_iris === "Z"` ou si `code_iris` se termine par `0000`.
- [ ] Un IRIS unique sans ces marqueurs, un inventaire vide, invalide, duplique ou melangeant `Z/0000` avec des IRIS decoupes reste `resolution_required`.
- [ ] Population, superficie et capacite projetee ne changent jamais le mode de subdivision.
- [ ] `eligibleForSplitCityWave` est vrai uniquement pour les communes `standalone_split` a plusieurs vrais IRIS ; les `single_plate` restent hors de cette liste.
- [ ] Une seule commande genere le lot et son manifeste national.
- [ ] Aucun script, controleur, source ou listener propre a une commune n'est cree.
- [ ] Les geometries proviennent d'une limite communale officielle en EPSG:4326.
- [ ] Une plaque, un code INSEE, un nom officiel et un point interieur existent par commune.
- [ ] Les fragments techniques sont charges a la demande et la source MapLibre active ne contient que la commune visitee.
- [ ] Le registre national resout recherche et code INSEE en temps constant.
- [ ] Recherche, fly, bouton Ville, retour Pays et seconde visite fonctionnent au premier clic.
- [ ] Deux generations successives produisent les memes IDs et le meme manifeste fonctionnel.
- [ ] Le bilan du basculement indique separement villes decoupees, mono-plaques eligibles, resolutions ouvertes et raisons de classification.

## Conditions d'arret immediat

Suspendre uniquement la publication de la ville concernee et ouvrir sa resolution au lieu de produire une fausse reussite si :

- aucune source de quartiers assez fine et fiable n'existe ;
- la licence interdit l'usage ou la redistribution prevue ;
- la projection ou le schema ne peuvent pas etre identifies ;
- une partie des quartiers manque apres generation ;
- les IDs ne sont pas stables ;
- la ville ne peut etre integree sans modifier les avatars, pop-ups ou mecanique Paris hors perimetre ;
- une couche de batiments reapparait pendant les flies ;
- Paris regresse.

Cette suspension n'autorise ni remplacement, ni abandon. La ville reste inscrite dans le lot avec son motif, ses IDs sources concernes et l'action necessaire ; elle est reintegree des que la resolution tracee passe les validations.

Dans ces cas, conserver les sorties deja valides, expliquer precisement le blocage et ne pas maquiller le resultat.
