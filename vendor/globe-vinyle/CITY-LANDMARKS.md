# Monuments des vingt grandes villes

Périmètre confirmé par l’utilisateur : les vingt communes françaises les plus peuplées, outre-mer compris. Classement municipal 2023, applicable en 2026 : [population Insee](https://www.insee.fr/fr/statistiques/9006414) et [tableau des communes](https://fr.wikipedia.org/wiki/Liste_des_communes_de_France_les_plus_peupl%C3%A9es). Ce périmètre comprend Saint-Denis de La Réunion, et non Saint-Denis en Seine-Saint-Denis.

| Ville | Monument | Éléments du modèle |
| --- | --- | --- |
| Paris | Tour Eiffel | GLB de référence conservé ; Montparnasse également conservée |
| Marseille | Notre-Dame de la Garde | Nef, assises alternées, clocher, coupoles, statue sommitale |
| Lyon | Fourvière | Quatre tours, nef, fenêtres cintrées, porche et rosace |
| Toulouse | Capitole | Longue façade, huit colonnes centrales, pavillons et fronton |
| Nice | Negresco | GLB existant conservé |
| Nantes | Château des ducs de Bretagne | Sept tours, courtines, cour ouverte, logis et toitures |
| Montpellier | Arc du Peyrou | Passage réellement ouvert, voûte, corniches, médaillons |
| Strasbourg | Cathédrale Notre-Dame | Flèche unique ajourée, rosace, portails et contreforts |
| Bordeaux | Grosse Cloche | Tours jumelles, passage, horloge et cloche dans une chambre ouverte |
| Lille | Beffroi | Fût nervuré, horloges, couronnement octogonal |
| Rennes | Parlement de Bretagne | Façade classique, grandes toitures, lucarnes et fronton |
| Toulon | Opéra | Perron, colonnade, fronton et statuaire |
| Reims | Cathédrale Notre-Dame | Deux tours, triple portail, rosace, galerie et arcs-boutants |
| Saint-Étienne | Puits Couriot | Charpente métallique ajourée, contreventements, molettes, câbles et échelle |
| Le Havre | Église Saint-Joseph | Socle, tour octogonale nervurée et vitraux géométriques |
| Villeurbanne | Hôtel de ville | Façade, beffroi central et horloge |
| Dijon | Tour Philippe le Bon | Corps carré, baies, tourelles d’angle et parapet |
| Angers | Château | Dix-sept tours, assises alternées, remparts, logis et chapelle |
| Grenoble | Tour Perret | Huit montants, contreventements ajourés, plateformes et garde-corps |
| Saint-Denis, La Réunion | Ancien hôtel de ville | Galeries à arcades, colonnes, fronton, horloge et perron |

## Création et direction artistique

Les dix-huit nouveaux fichiers sont des **interprétations architecturales originales et stylisées**, pas des relevés photogrammétriques ou des répliques certifiées. Les proportions d’enveloppe, orientations et détails secondaires sont des choix de modélisation. Les monuments conservent une silhouette spécifique ; aucun ancien modèle Eiffel simplifié n’est réutilisé.

Palette PBR issue des conventions Eiffel de MeeWav : pierre `#A78BFA`, sculptures lavande, ardoise violette, métal violet et vitrages sombres ; rugosité et métallicité adaptées aux surfaces. Les matériaux ne sont pas remplacés par une teinte uniforme au chargement. Arcades, charpentes, garde-corps et flèches ouvertes utilisent de la géométrie ; aucune texture photographique ou ressource tierce n’est embarquée.

Références architecturales : [Fourvière](https://www.fourviere.org/fr/visiter-notre-dame-de-fourviere/), [Capitole](https://www.toulouse-tourisme.com/nos-incontournables/le-capitole/), [Notre-Dame de la Garde](https://www.marseille-tourisme.com/decouvrez-marseille/culture-et-patrimoine/sites-et-monuments/la-basilique-notre-dame-de-la-garde/), [Peyrou](https://www.montpellier-tourisme.fr/decouvrir/millenaire/les-incontournables/l-arc-de-triomphe/), [Strasbourg](https://www.visitstrasbourg.fr/en/discover/must-see-attractions/the-cathedral/), [Grosse Cloche](https://www.bordeaux-tourisme.com/sites-monuments/grosse-cloche), [Lille](https://www.lilletourism.com/explorer/hello-architecture-patrimoine/beffroi-hotel-ville/), [Parlement](https://www.tourisme-rennes.com/decouvrir-rennes/histoire/parlement-de-bretagne-rennes/), [Angers](https://www.chateau-angers.fr/), [Tour Perret](https://www.grenoble-tourisme.com/fr/catalogue/detail/grenoble-3014728/tour-perret-35439/). Chaque fiche du catalogue conserve également la page de référence du monument. Ces références n’attribuent pas les GLB à leurs auteurs photographiques ou architecturaux.

## Placement et navigation

- Les points des monuments sont indépendants des centres des villes. Les coordonnées documentées récupérées sont conservées dans `scripts/city-landmark-anchors.json` ; les autres points sont les ancrages approximatifs éditables de `scripts/city-landmark-definitions.mjs`.
- La génération rattache chaque point au polygone de quartier qui le contient. Le pied suit la hauteur de cette plaque ; un point hors quartier reste au sol du globe.
- Taille normalisée uniformément en mètres, base à zéro et orientation locale tangente au globe : aucun étirement selon un axe.
- Un cercle sans avatars, dimensionné suivant l’emprise du bâtiment, s’applique également aux quartiers voisins intersectés. Les autres quotas sont préservés.
- Le test de profondeur et le filtrage de sélection existants des monuments s’appliquent aux nouveaux bâtiments.
- Chaque nom de monument est recherché depuis la barre de recherche. L’arrivée inclinée utilise une distance adaptée à son enveloppe.

## Chargement et maintenance

Chaque modèle est fusionné en six matériaux au maximum, sans texture ni boucle d’animation. Le chargement GLB reste différé suivant la ville demandée et la visibilité locale. La scène et le chargeur Draco existants sont partagés ; aucun renderer supplémentaire.

`node scripts/build-city-landmarks.mjs` fabrique les GLB et `shared/src/city-landmarks.json` depuis les définitions et les ancrages enregistrés. Cette commande ne nécessite pas de réseau. `scripts/fetch-landmark-anchors.mjs` est un outil de collecte documentaire séparé, jamais appelé au démarrage du globe.

Les fichiers sont servis directement par l’aperçu Vite de la tâche. Aucun test, contrôle visuel, screenshot ni validation automatique n’a été exécuté : la visite et l’acceptation des modèles reviennent à l’utilisateur, conformément à sa consigne.
