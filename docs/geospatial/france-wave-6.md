# France Guide Alpha - Vague 6

Date de generation : 2026-07-14

## Perimetre

- 100 communes, de Merignac a Grigny, triees par population decroissante parmi les communes metropolitaines encore non couvertes ;
- 1 359 IRIS officiels IGN/INSEE 2026 ;
- 1 288 plaques humaines visibles apres regroupements et curations Guide Alpha ;
- 100 villes `standalone_split`, aucune commune `single_plate` dans cette vague ;
- catalogue runtime porte de 104 a 204 villes ;
- registre de possession porte a 638 communes en incluant les corpus metropolitains existants.

Les inventaires et decisions exactes sont conserves dans :

- `geo/work/france-wave-6-plan.json` ;
- `geo/work/france-wave-6-curation-a.json` ;
- `geo/work/france-wave-6-curation-b.json` ;
- `geo/catalog/france-city-iris.json` ;
- `geo/catalog/france-city-curation.json`.

## Villes

1-25 : Merignac, Cergy, Pessac, Evry-Courcouronnes, Sarcelles, Chelles, Corbeil-Essonnes, Sartrouville, Massy, Talence, Melun, Saint-Germain-en-Laye, Mantes-la-Jolie, Anglet, Villenave-d'Ornon, Le Cannet, Garges-les-Gonesse, Poissy, Colomiers, Boulogne-sur-Mer, Pontault-Combault, Joue-les-Tours, Thonon-les-Bains, Franconville, Saint-Martin-d'Heres.

26-50 : Savigny-sur-Orge, Echirolles, Palaiseau, Six-Fours-les-Plages, Conflans-Sainte-Honorine, Athis-Mons, Bezons, Villefranche-sur-Saone, Saint-Chamond, Sainte-Genevieve-des-Bois, Auxerre, Schiltigheim, Les Mureaux, Houilles, Romans-sur-Isere, Montlucon, Nevers, Lens, Saint-Medard-en-Jalles, Agen, Montigny-le-Bretonneux, Aix-les-Bains, Epinal, Pontoise, Begles.

51-75 : Plaisir, Herblay-sur-Seine, Vienne, Carpentras, Mont-de-Marsan, Dreux, Vigneux-sur-Seine, Goussainville, Ris-Orangis, Savigny-le-Temple, Cambrai, Chatellerault, Viry-Chatillon, Le Chesnay-Rocquencourt, Menton, Chatou, Tournefeuille, Bourgoin-Jallieu, Draveil, Lievin, Villiers-le-Bel, Vandoeuvre-les-Nancy, Agde, Guyancourt, Orange.

76-100 : Saint-Etienne-du-Rouvray, Ermont, Vallauris, Perigueux, Sotteville-les-Rouen, Maubeuge, Dieppe, Soissons, Yerres, Illkirch-Graffenstaden, Rambouillet, Gonesse, Blagnac, Taverny, La Teste-de-Buch, Bussy-Saint-Georges, Champs-sur-Marne, Cormeilles-en-Parisis, Bergerac, Sens, Gradignan, Villeparisis, Sannois, Etampes, Grigny.

## Resolution semantique

Le lot A couvre 788 IRIS et produit 746 plaques. Il applique 95 operations exactes : 34 acceptations, 52 renommages et 9 fusions. Les inventaires techniques de Saint-Germain-en-Laye, Savigny-sur-Orge et Athis-Mons ont ete renommes avec des lieux IGN strictement contenus dans les polygones sources.

Le lot B couvre 571 IRIS et produit 542 plaques. Il applique 57 operations exactes : 21 acceptations, 33 renommages et 3 fusions. Cambrai, Draveil et Illkirch-Graffenstaden disposent de 33 renommages humains appuyes par 66 points IGN strictement contenus. Les references routieres `A15` a Herblay-sur-Seine et `Route Nationale 3` a Villeparisis sont acceptees explicitement : leur nombre fait partie du nom officiel et n'est pas un suffixe statistique.

Chaque operation cible des IDs sources exacts, verifie l'ancien libelle et echoue si le millesime derive. Aucune commune n'a ete remplacee ou abandonnee.

## Pipeline et runtime

- `scripts/plan-france-city-wave.mjs` planifie une vague reproductible ;
- `scripts/apply-france-city-wave-plan.mjs` applique un audit complet de facon idempotente ;
- `scripts/generate-city-wave.mjs --resume` reprend uniquement les sorties absentes ou invalides et limite les requetes au service officiel ;
- `scripts/sync-france-city-datasets.mjs` synchronise le catalogue de donnees en une passe ;
- `scripts/geo/generate-city-runtime-manifest.mjs` regenere configurations, cameras et registre de possession ;
- la recherche par slug et par `commune-<code-insee>` utilise le meme registre O(1) ;
- le premier fly reutilise le chemin partage et restaure les plaques apres l'arrivee, sans controleur ni listener par ville.

La future phase des communes `single_plate` est normative dans `src/features/globe/guide-alpha/COMMUNES-MONO-PLAQUE.md`. Elle sera executee en une passe nationale partagee, pas commune par commune.

## Validations

- 204/204 sorties de villes verifiees par le test pilote par catalogue ;
- 231/231 tests combines donnees, manifeste runtime et contrats de fly ;
- 265/265 tests geospatiaux complets ;
- conversion canonique : 8 004 zones, 0 erreur, 0 avertissement ;
- TypeScript et build de production valides ;
- trois audits independants des flys : rangs 1-34, 35-67 et 68-100, soit 100/100 villes et 1 288/1 288 plaques en PASS ;
- pour chaque ville auditee : source, compte, registre recherche/code INSEE, centre interieur, bbox, camera extent, preset premium et restauration du premier fly conformes ;
- aucun navigateur utilise : le controle visuel reste volontairement a la charge de l'utilisateur.
