# Intégration du globe vinyle

Intégration terminée et validée par l'utilisateur le 12 septembre 2026 : la
branche du globe est fusionnée dans `main` de Meewav-Web. Suivre
[VERSION-VALIDEE.md](VERSION-VALIDEE.md) et l'aperçu stable 5182. La branche
de travail provenait de `origin/main` au commit `e5aad8e8a`.

## Source et installation

Le tag `globe-vinyle-final` (`b5e5376`) du dépôt MeewavGlobe fournit le rendu
approuvé. Ses sources sont versionnées dans `vendor/globe-vinyle`, avec leurs
dépendances exactes, les médias et les données géographiques utilisées par
l'aperçu final. L'application ne dépend plus d'un dossier MeewavGlobe externe.

Après `npm ci`, exécuter `npm run globe:install`, puis `npm run dev:rooms:5182`
depuis Meewav-Web sur `main`. Le plugin Vite prépare les assets
depuis le dossier versionné sans les recopier au démarrage ; le développement utilise les sources et le HMR. Lors de
`vite build`, les deux workers et le globe sont compilés dans le paquet publié.

### Vinyle signature et chargement — 12 septembre 2026

L'utilisateur a fourni la référence corrigée `meewav-react-vite.zip`. Le composant
React/CSS/SVG est conservé dans `vendor/meewav-vinyl` et remplace le texte de
chargement entre les Rooms (ou une autre feature) et le globe. Sa rotation
d'origine à 33⅓ tours/minute reste active jusqu'au premier rendu de la scène,
se suspend dans un onglet masqué et respecte le mouvement réduit. Le document
interne ne lance pas de seconde animation sous celle de l'application parent.

La matière de l'anneau reprend les dégradés noirs, les reflets blancs et les
motifs gravés de cette référence, transposés dans un matériau Three.js filtré.
La face, les bords physiques et les dimensions du disque, la jonction au globe,
le rail de portraits et les vols sont conservés. Le shader Vinyl V2 de l'archive
précédente n'est plus chargé. Détails : `vendor/meewav-vinyl/INTEGRATION.md`.

## Navigation

`/globe` et ses alias historiques ouvrent le globe vinyle complet. Les boutons
Globe des Rooms, de la Messagerie, de la Scène, du Profil, du Market et du Tremplin
utilisent déjà cette route. Le nouvel écran accepte les anciens états de
navigation sans imposer l'ancien atterrissage sur le host.

Les boutons du poteau du globe commandent le routeur parent via un canal
`postMessage` limité aux six routes de features. L'origine et la fenêtre
émettrice sont contrôlées. L'authentification et les protections des routes
restent gérées par l'application parent. Le document interne isole les styles
globaux et la version Three.js du globe ; quitter la route détruit ce document
et ses workers. Aucun second moteur cartographique n'est monté en arrière-plan.

L'ancien composant de rendu `GlobeMapV2.tsx` est supprimé. Les composants partagés
(navbar, préprofils, contrats et services utilisés ailleurs) sont conservés.
Le serveur MVT historique n'est plus démarré automatiquement : son lancement
de maintenance reste disponible avec `--legacy-globe-tiles`.

## Périmètre et revue

Le globe conserve les profils fictifs et le Top 10 de démonstration de la version
validée, avec leurs indications existantes. Cette tâche connecte les routes et
le rendu ; elle n'effectue aucune migration des profils vers Supabase et ne
publie aucune modification de base de données.

Les instructions de l'utilisateur réservent les tests, mesures et contrôles
visuels à sa propre revue. Aucun test, profilage ni capture de validation n'a été
lancé lors de l'intégration initiale. La revue utilisateur et l'accord de fusion
sont désormais acquis ; voir VERSION-VALIDEE.md.

Aperçu canonique : `http://127.0.0.1:5182/globe` (ou `/rooms/home` pour
revenir au globe depuis la navbar des Rooms). L'ancien serveur 5194 est arrêté
et le dossier de travail est archivé.
