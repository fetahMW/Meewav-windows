# Provenance des sources Windows

Base : archive des fichiers suivis de `fetahMW/Meewav-Web`, commit `8592d00c8326ccf9591b0c2b09ede760930b8ae7` sur `main` le 25 septembre 2026.

Les modifications de sources suivies présentes dans le dossier Web local à cette date ont été reprises dans ce dépôt pour conserver le comportement de l'application Electron ouverte, notamment son entrée desktop, les Rooms, le Mixeur, l'audio, la messagerie et les autres écrans partagés. Les nouveaux fichiers source appelés par ces changements ont été repris depuis `src/`, ainsi que la documentation desktop et le test de voix associés. Les proportions des boutons du Mixeur ont ensuite été ajustées dans le dépôt Windows.

Le frontend React est partagé par conception avec le site. Les ressources du Globe déjà intégrées au dépôt Web restent incluses. Aucun projet natif Android ou iOS, clone historique du Globe, profil local, fichier d'environnement, dépendance installée, build, capture ou artefact de diagnostic n'a été importé.

Pour suivre l'évolution du site, comparer explicitement `upstream/main` avec `main` puis porter uniquement les changements utiles au bureau. Ne pas fusionner automatiquement les historiques des dépôts de plateformes.
