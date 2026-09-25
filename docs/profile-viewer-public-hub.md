# Profil public MeeWav — hub visiteur

## Objectif

Le viewer ouvert depuis le Globe reprend l’identité visuelle du profil Host sans exposer ses outils privés. Il réunit dans une vue publique compacte l’artiste, son projet, ses créations et ses points d’entrée vers les autres piliers MeeWav.

La navigation locale affiche une seule vue à la fois :

- Aperçu ;
- Créations ;
- Statistiques, lorsqu’elles sont publiques ;
- Parcours.

Cette structure évite une longue page composée de plusieurs tableaux de bord empilés.

## Règles de publication

Les statistiques artistiques publiques sont disponibles lorsque :

- le profil est public ;
- l’artiste est inscrit au Tremplin ;
- son grade public est compris entre 2 et 6 ;
- les agrégats publics ont été publiés.

La valeur et la variation sur 24 heures n’apparaissent que pour un jeton de talent au statut `active`. Un statut `observation`, `eligible`, `verification`, `comingSoon` ou `suspended` n’affiche ni faux prix, ni variation artificielle.

Le viewer ne doit jamais publier : position personnelle, achats, reçus, historique transactionnel individuel, revenus, données KYC, visiteurs identifiables ou documents de vérification.

## Données de démonstration

`profileViewerPublicModel.ts` produit une fixture déterministe pour les avatars de démonstration du Globe. Les profils parisiens de grades 2 à 6 utilisent une médiathèque dense afin de tester l’interface : cinq à six vidéos, quatre extraits audio, un projet documenté, une prochaine Room et une annonce Marketplace.

Tous ces médias portent explicitement la mention :

> Média local de démonstration — non attribué à l’artiste

Le visuel éditorial `paris-singer-producer-studio-v1.webp` a été généré spécialement pour la maquette. Les deux courts fichiers audio du dossier `public/media/profile-demo/` ont été extraits de vidéos de démonstration déjà présentes localement ; ils ne sont pas attribués aux profils fictifs.

## Câblage disponible

- Ouverture depuis la popup du Globe dans un dialog accessible.
- Retour au Globe, fermeture par croix et touche Échap.
- Aucun clic extérieur ne ferme le profil.
- Suivi local pour les fixtures et suivi serveur pour un profil canonique.
- Accès à la messagerie.
- Accès contextuel aux Shorts et aux Rooms, et accès au Marketplace.
- Accès au Tremplin par nom ou ticker.
- Lecture audio/vidéo sans autoplay et une seule lecture simultanée.
- Partage natif ou copie du lien.

## Dépendances backend restantes

Le profil canonique réel reste volontairement prudent. Le serveur expose déjà l’identité publique et les médias publiés, mais il ne fournit pas encore une projection publique consolidée pour :

- l’inscription Tremplin ;
- les statistiques agrégées ;
- le projet documenté ;
- le statut et le marché du jeton ;
- la prochaine Room ;
- les annonces Marketplace.

La fixture Marketplace affichée dans le viewer n’est pas une annonce persistée. Son CTA ouvre donc honnêtement le Marketplace sans fabriquer d’identifiant de listing. Un lien exact `?listing=` sera utilisé dès que le serveur reliera une annonce publique au profil.

Les fixtures Tremplin ne possèdent pas encore toutes un `profileId` canonique permettant un raccord fiable avec le Globe. Tant que ce contrat manque, le viewer réel affiche « Résumé public en préparation » et n’invente aucune donnée financière.

Le contrat serveur cible devra appliquer les règles de visibilité avant de renvoyer ces modules. Le frontend ne doit pas décider seul de l’éligibilité, du statut, du prix ou de la publication des statistiques.

## Réutilisation future

Le Host conserve encore un ancien panneau d’aperçu visiteur. Une étape ultérieure pourra extraire le contenu du hub dans un composant commun avec deux modes : `visitor` et `owner-preview`. L’aperçu Host devra alors afficher exactement la même projection publique, accompagnée d’indications sur les modules masqués.
