# Récompenses cachées du Globe

Ce document est destiné à l’équipe produit et aux tests internes. Les coordonnées ne doivent jamais être publiées dans l’interface, dans les résultats de recherche ordinaires, dans un marqueur ou dans un calque visible.

## Cadeau MeeWav existant

- Asset : `public/models/hidden-rewards/boite_cadeau_MW_optimisee.glb`
- Coordonnées : `6.0716, 44.9501`
- Hauteur 3D : `0,32 m`
- Commandes internes : `SHTATA` et `SHTATA007`
- Zoom rapproché autorisé : `24`, uniquement dans son périmètre invisible

## iPhone 16

- Asset : `public/models/hidden-rewards/iphone_16_optimized.glb`
- Nom de code / commande fly-to exacte : `shtata000`
- Coordonnées : `6.35775, 44.92162`
- Emplacement : replat de haute montagne isolé dans le massif des Écrins, sans ville au point d’ancrage
- Hauteur 3D : `0,42 m`, soit une présence visuelle proche d’une boîte à chaussures
- Cible de clic : cercle technique invisible de `28 px`, actif à partir du zoom `17`
- Périmètre de zoom : entrée à `440 m`, sortie à `590 m` pour éviter les oscillations de seuil
- Zoom rapproché autorisé : `24`, uniquement dans ce périmètre invisible ou durant le fly-to secret
- Fly-to : zoom `21,4`, pitch `46°`, bearing `-22°`
- Confirmation au clic : `Félicitations, vous venez de gagner l’iPhone 16.`

## Contrats de sécurité visuelle

- Aucun cercle, halo, marker ou label ne matérialise le périmètre.
- Le plafond de zoom ordinaire du Globe est restauré dès que la caméra quitte la zone.
- Les deux récompenses utilisent des IDs MapLibre distincts et restent montées indépendamment.
- Le cadeau MeeWav existant est conservé ; la commande `shtata000` ne le remplace pas.
- Les coordonnées ne sont accessibles que par les contrats internes et les tests ciblés.
