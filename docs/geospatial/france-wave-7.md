# France Guide Alpha - Vague 7

Date de generation : 2026-07-14

## Perimetre

- 100 communes, de Cenon a Lannion, triees par population decroissante parmi les communes metropolitaines encore non couvertes ;
- 950 IRIS officiels IGN/INSEE 2026 ;
- 926 plaques humaines visibles apres regroupements et curations Guide Alpha ;
- 100 villes `standalone_split`, aucune commune `single_plate` dans cette vague ;
- catalogue runtime porte de 204 a 304 villes ;
- registre de possession porte a 738 communes en incluant les corpus metropolitains existants ;
- conversion canonique globale portee a 8 930 zones.

Les inventaires et decisions exactes sont conserves dans :

- `geo/work/france-wave-7-plan.json` ;
- `geo/work/france-wave-7-curation-a.json` ;
- `geo/work/france-wave-7-curation-b.json` ;
- `geo/work/france-wave-7-curation-c.json` ;
- `geo/catalog/france-city-iris.json` ;
- `geo/catalog/france-city-curation.json`.

## Villes

1-25 : Cenon, Bretigny-sur-Orge, Lunel, La Garde, Elancourt, Saumur, Aurillac, Eaubonne, Biarritz, Muret, Castelnau-le-Lez, Les Ulis, Sevremoine, Le Grand-Quevilly, Lormont, Henin-Beaumont, Brunoy, Cavaillon, Saint-Ouen-l'Aumone, Alencon, Saintes, Vernon, Bethune, Vichy, Le Bouscat.

26-50 : Vierzon, Libourne, Eysines, Montbeliard, Laon, Frontignan, Montgeron, Beaupreau-en-Mauges, Rodez, Dole, La Valette-du-Var, Dammarie-les-Lys, Olivet, Herouville-Saint-Clair, Rochefort, Combs-la-Ville, Lanester, Roissy-en-Brie, Saint-Jean-de-Braye, Deuil-la-Barre, Maisons-Laffitte, Velizy-Villacoublay, Challans, Saint-Dizier, Torcy.

51-75 : Saint-Louis, Manosque, Gif-sur-Yvette, Oyonnax, Montigny-les-Cormeilles, Auch, Abbeville, Villeneuve-sur-Lot, Mantes-la-Ville, Montereau-Fault-Yonne, Acheres, Le Petit-Quevilly, Epernay, Gujan-Mestras, Dax, Millau, Fontaine, Chemille-en-Anjou, Longjumeau, Hazebrouck, Nogent-sur-Oise, Voiron, Fleury-les-Aubrais, Saint-Michel-sur-Orge, Montmorency.

76-100 : Montigny-les-Metz, Morsang-sur-Orge, Mandelieu-la-Napoule, Lagny-sur-Marne, Bruay-la-Buissiere, Saint-Gratien, Saint-Cyr-l'Ecole, Ozoir-la-Ferriere, Montaigu-Vendee, Plaisance-du-Touch, Concarneau, Chaumont, Lingolsheim, Carrieres-sous-Poissy, Coudekerque-Branche, Denain, Cugnaux, Maurepas, Le Creusot, Forbach, La Celle-Saint-Cloud, Mitry-Mory, Chilly-Mazarin, Beaune, Lannion.

## Classification INSEE

La decision ne depend plus de la population, de la superficie ni d'une estimation de capacite :

- au moins deux vrais IRIS officiels distincts donnent `standalone_split` ;
- exactement un IRIS de type `Z`, ou dont le code se termine par `0000`, donne `single_plate` ;
- un inventaire vide, ambigu, duplique ou melange reste en `resolution_required` ;
- les mono-plaques et les inventaires ambigus rencontres pendant la planification sont differes sans consommer une place de la vague de 100 villes decoupees.

Le classifieur partage, le planificateur et le runtime appliquent la meme regle. Aucune pseudo-sous-zone n'est inventee dans une commune mono-plaque.

## Resolution semantique

Le lot A couvre 339 IRIS et produit 334 plaques. Il applique 52 operations exactes : 38 acceptations, 10 renommages strictement contenus et 4 fusions.

Le lot B couvre 328 IRIS et produit 316 plaques. Il applique 147 operations exactes : 139 acceptations et 8 fusions.

Le lot C couvre 283 IRIS et produit 276 plaques. Il applique 48 operations exactes : 25 acceptations et 23 renommages strictement contenus.

Au total, 247 operations exact-ID sont versionnees : 202 acceptations, 33 renommages et 12 fusions. Les anciens libelles statistiques de Mitry-Mory ont notamment ete remplaces par six lieux IGN BD TOPO dont la geometrie est strictement contenue dans l'IRIS source : Residence de la Briqueterie, Moulin a Vent, Mory, Residence Antoine Cusino, Mitry-le-Neuf et Bois le Vicomte. Le validateur refuse desormais aussi les formes internes comme `Ville 1 Nord-Ouest`, et pas uniquement les numeros places en fin de libelle.

## Etat de navigation et couleurs

La couleur represente exclusivement l'etat de navigation :

- la cible du dernier fly porte le role `active` et le fond Paris centre `#1B1234` ;
- les communes eligibles visibles autour portent le role `neighbor` et la palette claire Paris peripherie ;
- les autres territoires portent le role `normal` ;
- la population, la superficie, le nombre d'IRIS et l'eligibilite ne donnent aucune priorite visuelle ;
- deux communes eligibles contigues inversent donc leurs roles au prochain fly ;
- les anciens etats sont nettoyes a chaque changement de cible.

Une commune multi-IRIS affiche un fond communal actif fonce sous ses vraies plaques internes colorees. Une commune mono-plaque affiche une seule plaque communale foncee. Le contrat est partage entre le pipeline national, les metropoles, Grand Paris et le mode produit historique.

## Geometrie et points-label

Le repli historique sur le milieu d'une bordure pouvait placer une etiquette sur la limite exterieure d'une plaque concave. Le calcul utilise maintenant un point strictement interieur et un scanline deterministe lorsque le centroide ou le centre de bbox ne conviennent pas.

Le controle a ete retro-applique a tout le catalogue : 5 482/5 482 points-label bruts des 304 villes sont strictement interieurs a leur geometrie, tout comme 8 930/8 930 zones musicales du canonical global. Les 926 plaques de la vague 7 satisfont toutes ce contrat dans les deux representations.

## Pipeline et runtime

- `scripts/geo/lib/classify-commune-iris.mjs` centralise la classification INSEE ;
- `scripts/plan-france-city-wave.mjs` remplit une vague uniquement apres classification ;
- `scripts/apply-france-city-wave-plan.mjs` refuse les libelles statistiques non resolus ;
- `scripts/generate-city-wave.mjs --resume` reprend aussi les sorties dont le point-label n'est pas strictement interieur ;
- `scripts/geo/generate-city-runtime-manifest.mjs` regenere configurations, cameras et ownership ;
- la recherche par ville et par `commune-<code-insee>` utilise le meme registre ;
- le premier fly precharge et restaure les plaques sans second clic.

## Audits independants

Trois audits separes couvrent les rangs 1-34, 35-67 et 68-100. Ils verifient les inventaires officiels, les comptes de plaques, les IDs, la recherche, l'ownership, les cameras, le premier clic, le preload, la restauration, les points-label stricts et les roles `active / neighbor / normal`.

Les rapports machine sont :

- `geo/work/france-wave-7-fly-audit-a.json` ;
- `geo/work/france-wave-7-fly-audit-b.json` ;
- `geo/work/france-wave-7-fly-audit-c.json`.

Aucun navigateur n'a ete utilise : le controle visuel reste volontairement a la charge de l'utilisateur.

## Validation finale

- audits independants : 34/34, 33/33 et 33/33, soit 100/100 villes validees sur les memes hashes runtime finaux ;
- inventaire de vague : 950 IRIS officiels vers 926 plaques visibles, 202 acceptations, 33 renommages et 12 fusions ;
- points-label : 926/926 strictement interieurs dans les sorties brutes et canoniques de la vague ;
- catalogue global : 304 villes runtime, 738 communes possedees et 8 930 paires de zones canoniques ;
- tests geospatiaux : 380/380 ;
- TypeScript : aucune erreur ;
- build Vite de production : reussi ;
- controle `git diff --check` : reussi.

Les permutations legacy ont ete controlees avec plusieurs couples de communes eligibles contigues, notamment Orleans/Olivet et Longjumeau/Chilly-Mazarin. Le clic sur la voisine lance l'activation et le fly en parallele dans la meme action ; le contexte utilise les emprises officielles, le viewport, une tolerance de contiguite de 250 m, douze voisines au maximum et une concurrence de chargement limitee a quatre.
