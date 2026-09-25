# France Guide Alpha - Vague 8

Date de génération : 2026-07-14

## Périmètre

- 100 communes, de Fougères à Landerneau, triées par population décroissante parmi les communes métropolitaines encore non couvertes ;
- 751 IRIS officiels IGN/INSEE 2026 ;
- 741 plaques humaines visibles après regroupements et curations Guide Alpha ;
- 100 villes `standalone_split`, aucune commune `single_plate` dans cette vague ;
- catalogue runtime porté de 304 à 404 villes ;
- registre de possession porté de 738 à 838 communes ;
- conversion canonique globale portée de 8 930 à 9 671 zones.

Les inventaires et décisions exactes sont conservés dans :

- `geo/work/france-wave-8-plan.json` ;
- `geo/work/france-wave-8-curation-a.json` ;
- `geo/work/france-wave-8-curation-b.json` ;
- `geo/work/france-wave-8-curation-c.json` ;
- `geo/catalog/france-city-iris.json` ;
- `geo/catalog/france-city-curation.json`.

## Villes

1-25 : Fougères, L'Isle-sur-la-Sorgue, Grande-Synthe, Mont-Saint-Aignan, Sarreguemines, Cahors, Bruges, Bourg-lès-Valence, Albertville, Bressuire, Cournon-d'Auvergne, Mougins, Bruz, Lisieux, Sélestat, La Crau, Le Mée-sur-Seine, Saint-Lô, Villefontaine, Royan, Vitré, Juvisy-sur-Orge, Saint-Dié-des-Vosges, Moulins, Sorgues.

26-50 : Brie-Comte-Robert, Ploemeur, Riom, Meylan, Cesson-Sévigné, Pornic, Louviers, Mauges-sur-Loire, Bischheim, Le Puy-en-Velay, Sanary-sur-Mer, Cognac, Moissy-Cramayel, Éragny-sur-Oise, Le Pontet, Romorantin-Lanthenay, Floirac, Lunéville, Bagnols-sur-Cèze, Hendaye, Pontarlier, Soisy-sous-Montmorency, Saint-Égrève, Digne-les-Bains, Osny.

51-75 : Carvin, Saint-Maximin-la-Sainte-Baume, Limay, Jouy-le-Moutier, Brignoles, Cluses, Balma, Segré-en-Anjou Bleu, Ambarès-et-Lagrave, Villeneuve-Loubet, L'Isle-d'Abeau, Chamalières, Vire Normandie, Avion, Yutz, Lattes, Marmande, Sallanches, Saran, Fécamp, Annonay, Lamballe-Armor, Viroflay, Blanquefort, Orée d'Anjou.

76-100 : Montceau-les-Mines, Firminy, Saint-Cyr-sur-Loire, La Baule-Escoublac, Verdun, Guérande, Les Clayes-sous-Bois, Saint-Jean-de-la-Ruelle, Loire-Authion, Marly-le-Roi, Valserhône, Sedan, Cestas, Lons-le-Saunier, Bois-d'Arcy, Château-Gontier-sur-Mayenne, Châteaurenard, Mauguio, Les Herbiers, Orsay, Pamiers, Rumilly, Mennecy, Coulommiers, Landerneau.

## Classification INSEE

La sélection reste entièrement déterministe :

- au moins deux vrais IRIS officiels distincts donnent `standalone_split` ;
- exactement un IRIS de type `Z`, ou dont le code se termine par `0000`, donne `single_plate` ;
- un inventaire vide, ambigu, dupliqué ou mélangé reste en `resolution_required` ;
- les mono-plaques et inventaires ambigus sont différés sans consommer une place de cette vague de 100 villes découpées.

Aucune taille, population ou estimation de capacité n'invente de pseudo-quartier.

## Résolution sémantique

Le lot A couvre 282 IRIS et produit 282 plaques : 59 acceptations exactes, 63 renommages strictement contenus et aucune fusion.

Le lot B couvre 239 IRIS et produit 235 plaques : 92 acceptations exactes, 9 renommages strictement contenus et 4 fusions connectées.

Le lot C couvre 230 IRIS et produit 224 plaques : 61 acceptations exactes, 37 renommages strictement contenus et 5 fusions connectées.

Au total, 330 opérations exact-ID sont versionnées : 212 acceptations, 109 renommages et 9 fusions. Le contrôle indépendant a notamment remplacé les directions seules par de vrais lieux IGN : `Nord` devient Le Lançon à Sanary-sur-Mer ; `Sud` et `Nord` deviennent Cité des Mines et Saint-Aubin du Pavoil à Segré-en-Anjou Bleu. À Saint-Cyr-sur-Loire, la famille connectée `Ouest 1 / Ouest 2` devient La Béchellerie, dont la géométrie IGN traverse strictement les deux IRIS fusionnés.

Le validateur et l'étape d'application refusent désormais toute direction seule (`Nord`, `Sud`, `Est`, `Ouest` et leurs combinaisons) comme nouveau libellé final. La génération refuse également qu'un renommage ou une fusion recrée ce type de libellé.

## Navigation et fly

La couleur représente uniquement l'état courant :

- la commune ciblée par le dernier fly porte le rôle `active` et le fond Paris centre `#1B1234` ;
- les communes éligibles visibles autour portent le rôle `neighbor` et la palette claire Paris périphérie ;
- les autres territoires portent le rôle `normal` ;
- la population, la superficie et le nombre d'IRIS n'interviennent jamais dans ce choix ;
- cliquer une commune voisine lance son activation, son préchargement et son fly dans la même action.

Chaque ville de la vague possède une configuration runtime, une caméra calculée depuis son emprise officielle, une entrée de recherche et un propriétaire de commune déterministe. Les plaques sont restaurées à l'atterrissage du premier fly sans second clic.

## Audits indépendants

Trois audits séparés couvrent les rangs 1-34, 35-67 et 68-100. Ils contrôlent les mêmes artefacts runtime finaux, les géométries brutes et canoniques, les points-label strictement intérieurs, la recherche, l'ownership, les caméras, le premier clic et les rôles `active / neighbor / normal`.

Les rapports machine sont :

- `geo/work/france-wave-8-fly-audit-a.json` ;
- `geo/work/france-wave-8-fly-audit-b.json` ;
- `geo/work/france-wave-8-fly-audit-c.json`.

Aucun navigateur n'a été utilisé : le contrôle visuel reste volontairement à la charge de l'utilisateur.

## Validation finale

- audits indépendants : 34/34, 33/33 et 33/33, soit 100/100 villes validées sur les mêmes artefacts runtime finaux ;
- inventaire Guide Alpha : 100/100 villes, 751 IRIS officiels vers 741 plaques visibles ;
- points-label : 741/741 strictement intérieurs dans les sorties brutes et canoniques de la vague ;
- curation : 212 acceptations, 109 renommages et 9 fusions ;
- génération : 100/100 villes, zéro échec ;
- catalogue global : 404 villes runtime, 838 communes possédées et 9 671 zones canoniques ;
- migration canonique : valide, zéro erreur et zéro avertissement ;
- tests géospatiaux : 480/480 ;
- TypeScript : aucune erreur ;
- build Vite de production : réussi ;
- contrôle `git diff --check` : réussi.
