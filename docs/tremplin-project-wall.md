# Mur des projets du Tremplin

## Objectif

Le lien « Voir tous les projets » ouvre directement `/tremplin/decouvrir?collection=watchlist` et affiche un mur éditorial abondant. Le mur reste centré sur les projets artistiques : aucun tri par prix, achat, volume ou variation de jeton n'est utilisé.

## Implémentation

- 24 projets sont rendus au premier affichage.
- 24 projets supplémentaires sont ajoutés automatiquement à l'approche de la fin du scroller interne avec `IntersectionObserver`.
- Un bouton « Charger la suite » reste disponible comme solution accessible lorsque l'observation automatique n'est pas utilisable.
- La position interne, les filtres et le nombre de projets chargés sont restaurés au retour d'un profil artiste.
- Les filtres région, ville, catégorie, recherche et ordre éditorial remettent volontairement le mur en haut.
- La scrollbar native grise a été remplacée, uniquement dans la zone du mur, par une scrollbar violette fine avec états survol et actif. Un fallback `forced-colors` est conservé.
- Les cartes hors écran utilisent `content-visibility` et les images restent chargées paresseusement.

## Répartition éditoriale de démonstration

Le cycle initial est configuré pour privilégier les artistes vocaux :

- 75 % de chanteuses, chanteurs, rappeuses, rappeurs et vocalistes ;
- 12,5 % d'instrumentistes ;
- 12,5 % de DJ et producteurs live.

La première page vérifiée contient exactement 18 profils vocaux, 3 instrumentistes et 3 DJ. La sélection reste stable et ne dépend d'aucun signal financier.

## Portraits

45 nouveaux portraits hyperréalistes de personnes fictives ont été produits et optimisés en WebP dans `public/images/tremplin/artists/wall-2026/` :

- 31 artistes vocaux ;
- 8 instrumentistes ;
- 6 DJ.

Chaque portrait possède un fichier et une identité de démonstration uniques. Aucun asset des six badges de grade n'a été modifié.

## Production et backend

Le mur local expose au moins 70 projets uniques à partir des fixtures actuelles. Pour une continuité réellement non bornée en production, l'API devra fournir une pagination par curseur avec :

- un identifiant de curseur opaque ;
- un ordre éditorial stable ;
- la déduplication côté serveur ;
- les mêmes filtres région, ville et catégorie ;
- une réponse explicite de fin de catalogue ;
- des portraits autorisés et non issus des fixtures de démonstration.

## Vérifications

- navigation Accueil → mur ;
- pagination automatique jusqu'à au moins 70 profils uniques ;
- ratio de la première page ;
- scrollbar violette et zone réellement scrollable ;
- absence de CTA tronqué ou ellipsé ;
- restauration après ouverture puis fermeture d'un profil ;
- tests visuels des cartes à 320, 375, 768, 1024, 1440 et 1832 px.
