# Version validée — authentification et cartes La Scène, 13 septembre 2026

L'utilisateur a demandé de réunir, commiter, fusionner et pousser toutes les corrections de cette session dans le même dépôt GitHub.

- Dépôt canonique : `C:/Users/linkw/Desktop/Meewav-Web`, branche `main`.
- Corrections réunies dans `codex/auth-ecosystem-entry`, état applicatif `93d126985` ; la correction des cartes verticales de La Scène y est intégrée.
- Repère : tag `meewav-auth-scene-valide-2026-09-13`.
- Aperçu stable : http://127.0.0.1:5182/auth.
- Pour conserver le retour à l'authentification à chaque actualisation de cet aperçu : `node scripts/start-development.mjs --rooms-home-workspace-preview --auth-entry-preview --mode audio-lab --host 127.0.0.1 --port 5182 --strictPort` depuis le dépôt canonique. Cette option concerne uniquement le développement ; la navigation interne reste libre.

État livré : tuiles d'entrée noires laquées avec contours violets et dégradé inférieur, fond d'authentification choisi, rail et commandes d'avatars réorganisés, introduction à plat dans l'interface, globe miniature avec vinyle agrandi et reflets solidaires du disque, animation de chargement conservée entre session et préparation du globe, bandeau noir compact sur les cartes verticales de La Scène. Les essais de pancarte et de fond avec texte incrusté ont été annulés et ne font pas partie du rendu final.

La validation visuelle appartient à l'utilisateur. Aucun test, build de validation ou contrôle visuel automatique n'a été lancé pendant cette livraison ; les contrôles de publication portent sur Git et la provenance du serveur. Les tests réels Rooms/lives restent à effectuer.

## Correctif du globe miniature — 13 septembre 2026

Fusion supplémentaire explicitement autorisée après le repère ci-dessus : `8a923d4bb`. La miniature d'inscription utilise désormais une carte intégrée et un matériau sans éclairage, avec océans gris et continents noirs. Le vinyle et ses reflets restent solidaires en rotation. Le correctif rejoint `main` et l'aperçu stable 5182 ; aucun test ni contrôle visuel automatique n'a été exécuté.

## Référence précédente

# Version site — finitions terminées le 13 septembre 2026

L'utilisateur a déclaré les finitions de la version site terminées et demandé leur commit, fusion et publication sur GitHub. Les tests réels des Rooms et des lives sont prévus lors de la prochaine session ; cette livraison ne constitue pas une validation de ces parcours.

- Dépôt canonique : `C:/Users/linkw/Desktop/Meewav-Web`, branche `main`.
- Finitions intégrées depuis `codex/profile-smoked-glass`, dernier commit applicatif `5acf6927f`.
- Repère de livraison : tag `meewav-site-finitions-2026-09-13`.
- Aperçu de référence : `http://127.0.0.1:5182/profile` ; Rooms : `http://127.0.0.1:5182/rooms/home`.
- Démarrage : `npm run dev:rooms:5182` depuis le dépôt canonique.

La livraison réunit les finitions du Profil propriétaire et visiteur, les lecteurs audio intégrés, les backgrounds choisis, les CTA violets, les cartes Rooms/Scène/Market, les héros et Mes artistes du Tremplin, ainsi que le correctif du double verrouillage du scroll après la vue visiteur. Le poteau et sa navigation conservent leur direction artistique.

L'audit de cohérence est conservé comme état des lieux daté ; il ne signifie pas que chaque recommandation a été appliquée. Aucun test fonctionnel, build de validation ou contrôle visuel automatique n'a été exécuté pendant cette fusion. Les contrôles de livraison concernent Git et le serveur de référence. Les fichiers personnels non suivis du dépôt principal sont conservés.

## Référence historique précédente

# Version MeeWav validée — 12 septembre 2026

L'utilisateur a vérifié tous les piliers, y compris la messagerie, puis demandé de conserver cette version comme référence et de fusionner le globe dans `main` de **Meewav-Web**.

- Dépôt canonique : `C:/Users/linkw/Desktop/Meewav-Web`, branche `main`.
- Source applicative validée : `9571ec8d3001650f2dbf9cef9e571bbb692c09b9`, intégrée par avance rapide depuis la branche du globe. Aucune ancienne variante n'a été ajoutée lors de la finalisation.
- Repère de livraison : tag `meewav-web-valide-2026-09-12`.
- Démarrage : `npm run dev:rooms:5182` depuis le dépôt canonique.
- Application : `http://127.0.0.1:5182/rooms/home` ; globe : `http://127.0.0.1:5182/globe` ; messagerie : `http://127.0.0.1:5182/messages`.

Cette base réunit le globe vinyle, les monuments, les avatars et la géographie d'inscription, les chargements au vinyle, les Rooms, la messagerie actuelle, le Market, le Tremplin et le Profil. Le disque tourne en vue globe à 72 secondes par tour et s'arrête durant l'exploration. Le Profil utilise ses données de démonstration dans l'aperçu local ; la boucle React des statistiques est corrigée.

## Anciennes copies

Les dossiers de travail `globe-next-audit`, `globe-vinyle-integration`, `messaging-audio-colors`, `profile-cage-premium` et `profile-nav-indicator` ont été déplacés dans `C:/Users/linkw/MeeWav-Archives/2026-09-12-main-valide`. Leurs branches locales portent le préfixe `archive/2026-09-12/` et leurs worktrees sont verrouillés comme archives. Les modifications et documents non commités y sont conservés ; ils ne doivent pas remplacer les fichiers de cette version validée.

Les serveurs de travail 5194 et de l'ancien laboratoire 4173 sont arrêtés. Le dépôt historique `C:/Users/linkw/Desktop/MeewavGlobe` est conservé comme archive de fabrication, identifié comme tel dans ses consignes. Le globe actif est exclusivement celui versionné dans `vendor/globe-vinyle` de Meewav-Web.

L'historique Git et les archives restent disponibles pour récupérer des éléments précis, jamais comme versions à relancer automatiquement. Les scripts et pièces jointes personnels non suivis déjà présents dans le dossier principal sont conservés.

La validation fonctionnelle et visuelle est celle effectuée par l'utilisateur. Aucun nouveau test ni contrôle visuel automatique n'a été lancé pendant cette finalisation.
