# Déploiement France — vague 1

Date : 2026-07-14

Cette vague étend le runtime Guide Alpha aux grandes villes qui n'étaient pas encore
branchées sur la carte. Les subdivisions restent des territoires officiels : aucun
quartier produit n'a été inventé pour remplir une commune.

## Villes livrées

| Ville | Code INSEE | Subdivisions officielles | Type |
| --- | --- | ---: | --- |
| Montpellier | 34172 | 31 | Sous-quartiers officiels |
| Toulouse | 31555 | 153 | IRIS |
| Bordeaux | 33063 | 13 | Zones nommées issues de 88 IRIS officiels |
| Strasbourg | 67482 | 113 | IRIS nommés, avec Canardière regroupée |
| Rennes | 35238 | 93 | IRIS |
| Reims | 51454 | 84 | IRIS nommés, doublon agricole regroupé |
| Grenoble | 38185 | 70 | IRIS |
| Rouen | 76540 | 42 | IRIS |
| Toulon | 83137 | 70 | IRIS |
| Saint-Étienne | 42218 | 78 | IRIS |

Total branché au runtime dans cette vague : 747 zones humaines, soit 716 zones
issues de 795 IRIS officiels plus les 31 sous-quartiers de Montpellier déjà présents
dans le corpus national.

Sources :

- IRIS : IGN / INSEE, Contours IRIS WFS Géoplateforme, millésime 2026,
  Licence Ouverte 2.0 ;
- Montpellier : Montpellier Méditerranée Métropole Open Data, sous-quartiers 2026,
  ODbL 1.0.

## Contrat de fly

- Une cible de caméra unique par ville est enregistrée dans le moteur premium.
- Les plaques de la ville précédente sont retirées avant le départ.
- La géométrie de la destination est préchargée pendant le fly sans mutation des
  sources MapLibre.
- Les subdivisions sont appliquées uniquement au `moveend` et seulement lorsque
  `map.isMoving()` est faux.
- Un timeout de surveillance réessaie après 600 ms si la caméra bouge encore ; il
  ne peut plus injecter une couche au milieu du trajet.
- La Promise de chargement est partagée et mise en cache, ce qui évite un second
  téléchargement à la première arrivée comme aux visites suivantes.

Chaque ville de cette vague a été relue par un agent indépendant. Les audits ont
validé le routage ville/commune, le premier atterrissage sans second clic, le retour
Ville, la deuxième visite et le nettoyage singleton des sources, couches et
listeners.

## Petites communes

Le pipeline conserve la règle produit suivante pour les vagues à venir :

- moins d'environ 1 000 artistes projetés : une seule plaque communale ;
- au-dessus : utiliser uniquement un découpage officiel disponible ;
- ne jamais fabriquer `Centre-ville`, `Nord`, `Sud` ou `Lotissement` pour atteindre
  artificiellement un quota ;
- les IRIS non découpés fournissent naturellement une plaque unique pour de
  nombreuses petites communes.

## Validation consolidée

- Dataset canonique `2026.3-human-quartiers` : 4 164 zones, 0 erreur, 0 avertissement.
- Archive vectorielle : 5 058 tuiles, couche unique `music_zones`.
- Index de recherche : 4 164 zones.
- Tests géospatiaux : 58/58.
- TypeScript : valide.

Le contrôle visuel des cadrages reste volontairement à effectuer par l'utilisateur :
aucun navigateur n'a été ouvert pendant cette vague.
