# Test national data-driven — Montpellier

Date : 2026-07-13

## Objectif

Vérifier qu'une ville qui n'avait pas de pipeline cartographique dédié peut être
ajoutée sans condition territoriale dans React, sans nouveau layer MapLibre et
sans commande NPM propre à la ville.

## Source

- Producteur : Montpellier Méditerranée Métropole Open Data
- Jeu : Sous-quartiers de Montpellier
- URL : <https://data.montpellier3m.fr/dataset/sous-quartiers-de-montpellier>
- Ressource : `VilleMTP_MTP_SousQuartiers.json`
- Millésime : 2026
- Licence : ODbL 1.0
- Commune : Montpellier (`34172`)

La ressource officielle contient 31 polygones de sous-quartiers rattachés à
sept quartiers administratifs. Le fichier source expose les noms mais aucun ID
de feature. L'importeur générique fabrique donc une clé source déterministe à
partir du couple `quartier parent + sous-quartier`, puis le convertisseur
canonique produit l'UUID produit stable.

## Commandes reproductibles

```bash
npm run geo:fetch-local -- --config geo/imports/montpellier.json
npm run geo:migrate-existing -- --city montpellier --version 2026.2-montpellier-test
npm run geo:migrate-existing -- --scope all --version 2026.2-montpellier-test
npm run geo:build-zones -- --scope all --version 2026.2-montpellier-test --minzoom 4 --maxzoom 14
npm run geo:build-index -- --scope all --version 2026.2-montpellier-test
npm run test:geo
```

## Résultat technique

- 31 zones Montpellier importées ;
- 3 471 zones dans le corpus expérimental complet ;
- validation canonique : 0 erreur, 0 avertissement ;
- recherche par ville et par quartier ;
- sélection et caméra pilotées par les propriétés de la tuile ;
- les cinq layers MapLibre nationaux restent inchangés ;
- aucun identifiant Montpellier n'est ajouté au frontend ;
- un unique point de label est tuilé par zone pour empêcher les répétitions aux
  frontières des tuiles ;
- extrusion de surface limitée à 0,6 m au survol ; la sélection n'extrude plus
  jamais le sol du quartier ;
- géométrie complète de chaque quartier publiée dans `zone-details/` afin que
  la sélection ne dépende pas des fragments de tuiles visibles ;
- extraction des seuls bâtiments situés dans la géométrie sélectionnée ;
- rendu des bâtiments Montpellier par le renderer de sélection de Paris, avec
  la même palette violet, magenta, rose et bleu.

## Limite du test

Ce test valide l'ajout data-driven des zones, la recherche, la caméra, les
interactions et l'extrusion générique des bâtiments déjà disponibles dans les
tuiles OpenFreeMap. Il ne prétend pas encore publier une archive nationale de
bâtiments Meewav : cette industrialisation reste une étape séparée. Le système
legacy reste la valeur par défaut et aucun merge vers `main` n'est autorisé
avant validation visuelle explicite.

## Captures de vérification

- `visual-regression/montpellier-national-selected.png` : La Martelle
  sélectionnée sans dalle massive et avec un seul label ;
- `visual-regression/montpellier-national-rotation.png` : rotation à 60° sans
  fragment triangulaire ;
- `visual-regression/montpellier-national-altitude.png` : vue en altitude sans
  z-fighting du référentiel national.
- `visual-regression/montpellier-national-antigone-selected-buildings.png` :
  seuls les bâtiments d'Antigone sont extrudés dans son contour ;
- `visual-regression/montpellier-national-centre-historique-selected-buildings.png` :
  seuls les bâtiments du Centre historique sont extrudés dans son contour ;
- `visual-regression/montpellier-national-la-martelle-selected-buildings.png` :
  La Martelle reste seule sélectionnée, sans dalle couvrant Montpellier ;
- `visual-regression/paris-charonne-selected-buildings-reference.png` :
  référence Paris capturée dans le même build pour vérifier la parité de couleur.
