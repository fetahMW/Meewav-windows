# Globe vinyle intégré

Source : `sipiyou39/MeewavGlobe`, tag `globe-vinyle-final`, commit `b5e5376`.
Les sources, les portraits et les modèles proviennent de ce tag. Le dossier `data`
reprend les données préparées utilisées par l'aperçu final du laboratoire.

Le globe possède son propre document et ses versions de React/Three.js pour
préserver le rendu validé et isoler ses styles globaux des autres features.
Il est servi depuis la même application, sans dépendre du port 4173 ni d'un autre
dossier local. Les échanges avec le routeur passent par un canal limité aux
destinations de la navbar, avec contrôle d'origine et de fenêtre émettrice.

Installation : `npm ci --prefix vendor/globe-vinyle` après l'installation du projet.
Vite prépare automatiquement les assets au démarrage et compile le globe pour
la livraison. En développement, les sources sont servies par Vite avec HMR.

La géographie, les vols, le Top 10 et les profils de démonstration
restent ceux de la version validée. À la demande de l'utilisateur du 12 septembre,
le matériau du vinyle provient désormais de `meewav-react-vite.zip` : voir
`../meewav-vinyl/INTEGRATION.md`. Le même composant fourni tourne pendant le
chargement depuis les autres features. Cette intégration ne transforme pas les
profils fictifs en comptes Supabase et ne modifie pas les données distantes.
