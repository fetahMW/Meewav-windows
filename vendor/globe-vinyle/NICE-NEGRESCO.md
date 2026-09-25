# Nice — Le Negresco

Un seul monument ajouté pour Nice : `assets/models/hero-landmarks/le_negresco_violet_light.glb`.
Le modèle est une interprétation architecturale originale, générée par
`scripts/build-negresco-model.mjs`, et non un relevé photogrammétrique.

## Références et implantation

- [Office de tourisme Nice Côte d'Azur](https://www.explorenicecotedazur.com/culture/le-negresco/) : monument emblématique et adresse au 37 Promenade des Anglais. Son lien d'itinéraire fournit latitude 43.6943 et longitude 7.25802, utilisées pour l'ancrage.
- [Architecture et façade, site officiel du Negresco](https://www.lenegresco.com/architecture-et-facade) : référence de silhouette et de vocabulaire architectural, dôme, balcons, pilastres, corniches et ornements. Les photographies ne sont pas embarquées dans le GLB.
- Direction artistique : matériaux violets de la tour Eiffel Meewav ; six nuances conservent la lisibilité des fenêtres, du métal ajouré et des reliefs.

Le point se trouve dans le secteur France-Negresco de Nice,
`fr-quartier-06088-5ca3e1c99533`, ville `06088`. La hauteur de mise en scène
est de 43 mètres et l'orientation de 20 degrés. Ces dimensions et détails sont
des approximations de modélisation, pas des mesures certifiées du bâtiment.

## Modèle et parcours

Le GLB contient une façade d'angle arrondie, des rangées de fenêtres avec
encadrements et meneaux, des balcons réellement ajourés, des mansardes et
lucarnes, un dôme nervuré, une petite coupole avec mât, des corniches, des urnes,
un fronton, une marquise et le lettrage en géométrie.

Les éléments sont regroupés en six maillages par matériau et leurs sommets
compatibles sont soudés. Le fichier final pèse environ 4,59 Mo, sans texture
externe. Le modèle se charge à l'approche de Nice ou lorsqu'il entre dans le
champ, via le chargeur existant, et respecte la profondeur des avatars.
Un dégagement de 75 mètres évite de placer les profils dans son emprise.

Chercher **Negresco** ou **monument Nice** dans le globe ouvre un vol vers
le bâtiment et active son quartier. La pose d'arrivée dédiée est conservée
au lieu d'être remplacée par le cadrage générique des quartiers.

Le même changement réserve 110 mètres sans avatars autour de Montparnasse,
en réutilisant les coordonnées du modèle et l'exclusion lors de la génération.
La densité des autres quartiers ne change pas.

Le script a été exécuté uniquement pour fabriquer le GLB nécessaire à l'aperçu.
Aucun test, capture, inspection visuelle ni QA automatique n'a été lancé.
