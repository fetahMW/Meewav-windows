# La Scène — matrice d'acceptation produit et technique

Date de l'audit : 8 août 2026  
Périmètre : état courant du worktree canonique `platform-canonical-publish`  
Méthode : lecture des routes, composants, modèles, fixtures, services, migrations et documentation, puis consolidation du Studio et du câblage transversal.

## Légende

| État | Définition utilisée dans cette matrice |
| --- | --- |
| **Implémentée** | L'exigence est utilisable dans l'application actuelle, dans les limites explicites de la démo. |
| **Mock** | L'expérience existe, mais ses données, sa persistance ou son traitement sont locaux/simulés. |
| **Contrat prêt** | Types, validations, services purs ou événements existent et sont testables, sans raccordement de production complet. |
| **Backend requis** | Un raccordement de production manque encore : backend, infrastructure média/edge, service externe ou câblage client dépendant de cette infrastructure. Lorsqu'un reliquat est strictement frontend, la colonne « Limite / suite » le précise. |
| **Hors lot** | Fonction volontairement attribuée à un autre pilier, explicitement exclue du MVP ou non demandée par le master prompt. |

Une même capacité peut donc avoir deux lignes : une interface **Implémentée** et sa persistance de production **Backend requis**. Cela évite de qualifier de « livré » un comportement uniquement stocké dans le navigateur.

## Verdict exécutif

La Scène constitue aujourd'hui une démonstration investisseurs cohérente et partiellement raccordée : identité officielle, quatre usages distincts, catalogue public réel avec fallback éditorial, player, Studio créateur, upload propriétaire, profil, suivi, messagerie, collaboration, likes, Golden Likes et impressions serveur. Elle n'est pas encore publiable comme plateforme média de production complète.

Les blocages majeurs sont :

1. la recherche et les recommandations serveur à grande échelle ;
2. l'upload résumable, le transcodage adaptatif, les sous-titres et le CDN ;
3. les droits et validations serveur du Studio au-delà de l’ownership média déjà branché ;
4. la synchronisation des commentaires, playlists et historique ;
5. la modération, les recours et le registre de droits auditable ;
6. l’extension de l’analytics ingéré au-delà des impressions déjà autorisées ;
7. le SSR, les métadonnées vidéo, les sitemaps et les rewrites de deep-links ;
8. la régie TV distante, ses sources live et son observabilité.

## Chiffres vérifiés de la démo

| Élément | État constaté |
| --- | --- |
| Fiches vidéo du catalogue | **224** |
| Artistes distincts | **60** |
| Images de contenu distinctes référencées | **224** |
| Images WebP sous `public/images/shorts` | **264** |
| Fichiers vidéo MP4 physiques | **6**, réutilisés dans le catalogue |
| Vidéos portrait | **60** |
| Vidéos paysage | **164** |
| Items multicam préconfigurés dans le catalogue | **1**, avec deux sources synchronisées dans le player |
| Sources audio seules | **1**, avec pochette et visualizer dédié |
| Chaînes TV publiques | **1** : `meewav-main` |
| Programmation TV | générateur J à J+13, soit 14 jours ; plus de 120 entrées |
| Droits des six MP4 et du MP3 de démo | manifestés comme `prototype-only-not-cleared-for-production` |

Sources principales : `src/features/shorts/shorts-wall-data.ts`, `public/media/shorts-demo/`, `data/scene-media-license-manifest.json`, `data/tv-media-license-manifest.json` et `src/features/scene/tv/sceneTvGuide.fixtures.ts`.

## 1. Identité, frontières produit et navigation

| ID | Exigence | État | Preuve dans le dépôt | Limite / suite |
| --- | --- | --- | --- | --- |
| ID-01 | Nom public « La Scène » | **Implémentée** | `sceneContract.ts` centralise `SCENE_NAME`. | Conserver ce contrat comme unique source de vérité. |
| ID-02 | Signature « Là où le talent règne sur l'algorithme. » | **Implémentée** | `SCENE_SIGNATURE`, rendu dans l'accueil. | — |
| ID-03 | Sous-signature officielle 100 % musique | **Implémentée** | `SCENE_SUBSIGNATURE`, rendue dans l'introduction compacte de l'accueil. | — |
| ID-04 | Aucun libellé public « Shorts » | **Implémentée** | Routes et navigation publiques utilisent La Scène ; les noms `shorts` restants sont techniques/legacy. | Une migration physique des dossiers n'est pas nécessaire à l'acceptation produit. |
| ID-05 | Accueil = recommandation vidéo | **Implémentée** | Vue `home`, `FeaturedRail` « À la une » et rails bouclés dans `ShortsPage.tsx`. | Recommandation encore locale. |
| ID-06 | Suivis = publications choisies et chronologiques | **Implémentée** | Groupes temporels, non-vus, tri récent dans `ShortsPage.tsx`. | Le graphe de suivi est une fixture. |
| ID-07 | Explorer = découverte contrôlée par l'utilisateur | **Implémentée** | Recherche, filtres, tri et chargement progressif. | Catalogue et pagination distants requis. |
| ID-08 | TV = programmation linéaire unique | **Implémentée** | `SceneTvSchedule.tsx`, canal `meewav-main`. | Sources et EPG sont locaux. |
| ID-09 | Rooms conserve la découverte du direct | **Hors lot** | La Scène n'affiche pas de catalogue de Rooms ni de « Top Rooms ». | À maintenir dans le pilier Rooms. |
| ID-10 | Replay publié visible comme VOD | **Mock** | Items `room-replay` et badge de replay dans le catalogue. | Publication Room → Scène réelle requiert le backend et les consentements. |
| ID-11 | Room simulcast uniquement comme programme TV | **Contrat prêt** | Source TV `room_simulcast`, contrat de replay et lien Rooms. | Flux Room réel et bascule automatique à raccorder. |
| ID-12 | Aucun prix/jeton du Tremplin sur les cartes vidéo | **Implémentée** | Anatomie des cartes limitée au média, auteur, grade, vues et date. | Le lien profil peut ensuite mener au profil complet. |
| ID-13 | Marketplace non dupliquée dans La Scène | **Hors lot** | Aucun catalogue produit dans La Scène. | À maintenir dans Marketplace. |
| ID-14 | Grade MeeWav visible sans certification violette parallèle | **Implémentée** | Réemploi de `MeewavGradeBadge`; identité artiste partagée. | Assets de grades non modifiés. |

## 2. Routes, aliases, deep-links et contrôle d'accès

| ID | Exigence | État | Preuve dans le dépôt | Limite / suite |
| --- | --- | --- | --- | --- |
| RT-01 | Route accueil `/scene` | **Implémentée** | `SCENE_ROUTE` et montage `${SCENE_ROUTE}/*` dans `App.tsx`. | — |
| RT-02 | Route `/scene/suivis` | **Implémentée** | Déclarée dans `sceneContract.ts`, interprétée par `ShortsPage`. | — |
| RT-03 | Route `/scene/tv` | **Implémentée** | Contrat et vue TV dédiés. | — |
| RT-04 | Route `/scene/explorer` | **Implémentée** | Contrat et vue Explorer dédiés. | — |
| RT-05 | Route `/scene/watch/:slug` | **Implémentée** | Helper de route, résolution du slug et ouverture du player. | Rendu client, sans SSR public. |
| RT-06 | Route `/scene/history` | **Implémentée** | Vue historique alimentée par `sceneWatchHistory`. | Stockage local uniquement. |
| RT-07 | Route `/scene/playlists` | **Implémentée** | `ScenePlaylistsView` expose liste, création, renommage, suppression, ordre, lecture et états vides. | Persistance locale uniquement. |
| RT-08 | Routes Studio `/scene/studio/*` | **Implémentée** | Dashboard, contenus, brouillons, programmation, analytics, commentaires, droits, playlists, collaborations. | Données et actions principales restent mock. |
| RT-09 | Alias historique `/shorts` | **Implémentée** | `LEGACY_SHORTS_ROUTE`, redirection conservant query/hash/state dans `App.tsx`. | Alias imbriqués non reconnus sont normalisés mécaniquement. |
| RT-10 | Rewrites directs `/scene/*` en hébergement | **Backend requis** | Aucun fichier de règle CDN/edge ne garantit les entrées directes. | Configurer Vercel/CDN/serveur avant production. |
| RT-11 | Synchronisation recherche/filtres avec l'URL | **Implémentée** | Parse/serialize/merge dans `sceneDiscoveryModel.ts`. | Source distante à raccorder. |
| RT-12 | Deep-link artiste `/scene/artist/:artistId` | **Implémentée** | `SCENE_ARTIST_ROUTE`, helper et grille des créations de l'artiste. | Identités issues des fixtures ; SSR absent. |
| RT-13 | Accès au profil canonique | **Implémentée** | Navigation vers `/profile/view/:profileId` depuis cartes/player. | Identités encore issues des fixtures. |
| RT-14 | Contacter l'artiste | **Implémentée** | Navigation vers le contrat de messagerie existant. | Livraison réelle dépend du backend Messagerie. |
| RT-15 | Envoyer une demande de collaboration | **Implémentée** | Action player/profil vers la messagerie/collaboration canonique. | Workflow serveur de collaboration hors du domaine Scène. |
| RT-16 | Masquer Studio/Publier aux viewers | **Implémentée** | `scenePublishingAccess.ts` et métadonnées de session. | Le contrôle frontend n'est pas une autorisation de sécurité. |
| RT-17 | Autorisation créateur serveur/RLS | **Backend requis** | Aucune policy serveur fiable n'est incluse. | Vérifier rôle, ownership, quota et droits côté serveur. |
| RT-18 | Deep-link vertical `/scene/vertical/:videoId` | **Implémentée** | `SCENE_VERTICAL_ROUTE` et helper dédié. | Rendu SPA uniquement. |
| RT-19 | Route recherche `/scene/search` | **Implémentée** | `SCENE_SEARCH_ROUTE`, requête et filtres conservés dans l'URL. | Index distant requis à l'échelle. |
| RT-20 | Détail playlist `/scene/playlist/:playlistId` | **Implémentée** | `SCENE_PLAYLIST_ROUTE`, sélection et lecture ordonnée. | Persistance locale uniquement. |
| RT-21 | Réglages `/scene/recommendation-settings` | **Implémentée** | `SceneRecommendationSettings` contrôle historique et préférences locales. | Le moteur serveur devra respecter ces choix. |
| RT-22 | Publication `/scene/upload` | **Implémentée** | `SCENE_UPLOAD_ROUTE` ouvre le parcours de publication pour les comptes autorisés. | Upload/transcodage durables restent backend. |

## 3. Accueil, Suivis, Explorer, recherche et recommandation

| ID | Exigence | État | Preuve dans le dépôt | Limite / suite |
| --- | --- | --- | --- | --- |
| DS-01 | `FeaturedRail` « À la une », contenu dominant | **Implémentée** | Le rail vedette remplace l'ancien hero géant et sa file « À regarder ensuite ». | — |
| DS-02 | Premiers rails visibles dans le premier viewport | **Implémentée** | Introduction et `FeaturedRail` resserrés ; le catalogue commence immédiatement. | À surveiller par capture 1024/1440. |
| DS-03 | Rails type Netflix avec boucle et 10 items | **Implémentée** | Composants de rails bouclés de l'accueil. | Dataset local. |
| DS-04 | « Voir tout » ouvre un mur vertical | **Implémentée** | Mode wall piloté par section. | Pagination serveur absente. |
| DS-05 | Preview silencieuse après délai au hover | **Implémentée** | Logique de preview du `FeaturedRail` et des cartes, respect de reduced motion. | Dépend de six MP4 réutilisés. |
| DS-06 | Aucun son en autoplay | **Implémentée** | Previews forcées muettes et player explicite. | — |
| DS-07 | Cartes vidéo simples en 16:9 | **Implémentée** | Thumbnail, durée, avatar, titre, artiste/grade, vues/date. | — |
| DS-08 | Vidéos verticales éditorialisées sans crop destructif | **Implémentée** | `format: portrait`, fond/backdrop et pillarboxing dans le player. | Les miniatures restent des compositions 16:9. |
| DS-09 | Identités artiste cohérentes et portraits dédiés | **Implémentée** | `sceneArtistPortraits.ts` et données normalisées. | Les artistes sont fictifs. |
| DS-10 | Recherche partagée avec Globe/Tremplin | **Implémentée** | `MeewavSearchFilterBar` partagé. | — |
| DS-11 | Recherche artiste, vidéo, morceau, style | **Implémentée** | Recherche locale accent-insensitive dans `sceneDiscoveryModel.ts`. | Fuzzy search, indexation et ranking serveur requis à l'échelle. |
| DS-12 | Filtres par 28 profils artistiques | **Implémentée** | Catalogue d'avatars/métiers partagé avec le Globe. | Les images servent à la sélection du métier, non du style. |
| DS-13 | Filtres par styles musicaux | **Implémentée** | 25 styles dans `sceneDiscoveryModel.ts`. | Taxonomie serveur à normaliser. |
| DS-14 | Filtres type, durée, grade, lieu, date | **Implémentée** | Configuration de découverte et panneau partagé. | « Près de moi » réel exige géolocalisation et API. |
| DS-15 | Tri par défaut Pertinence/Pour toi | **Implémentée** | Défaut invité « relevance », connecté « for-you ». | Personnalisation locale seulement. |
| DS-16 | Pas de popularité comme tri par défaut | **Implémentée** | Vues/likes ne pilotent que des tris avancés explicites. | L'équité du ranking doit être contrôlée côté serveur. |
| DS-17 | Recommandation par suivis, goûts, ville, historique | **Mock** | Score local de `sceneDiscoveryModel.ts`. | Remplacer par service de recommandation explicable et auditable. |
| DS-18 | Diversité artiste dans la recommandation | **Implémentée** | Diversification des artistes adjacents dans le modèle local. | Contrôle de fréquence serveur à définir. |
| DS-19 | « Pourquoi cette vidéo ? » | **Mock** | Raisons issues du contexte local quand disponibles. | Explications réelles du moteur distant requises. |
| DS-20 | Suivis dans l'ordre de publication | **Implémentée** | Tri récent et groupes Aujourd'hui/semaine/plus tôt. | Horodatage fixture. |
| DS-21 | Nouveau depuis la dernière visite | **Mock** | État vu/non-vu et séparations temporelles locales. | Synchronisation compte/appareil requise. |
| DS-22 | Recherche Suivis priorisant les artistes suivis | **Implémentée** | Dataset de l'onglet limité/priorisé par suivi. | Graphe de suivi distant requis. |
| DS-23 | Explorer avec quick filters + panneau avancé | **Implémentée** | Deux niveaux de filtres et chips actifs. | — |
| DS-24 | Chargement progressif du mur Explorer | **Implémentée** | `IntersectionObserver` et fallback manuel. | Ce n'est pas une pagination API. |
| DS-25 | Catalogue distant paginé | **Backend requis** | Les 224 items sont bundlés dans le frontend. | Endpoint cursor-based, cache et invalidation nécessaires. |
| DS-26 | Recherche/recommandation distante | **Backend requis** | Modèle purement client/fixture. | Index, ranking, fairness, observabilité et protections anti-abus. |
| DS-27 | Skeletons lors des changements de requête | **Backend requis** | Aucun skeleton de résultats n'a été identifié dans la vue actuelle. | Travail frontend restant, à brancher aux états pending/error de la future API. |

## 4. Player, mini-player, formats verticaux et audio

| ID | Exigence | État | Preuve dans le dépôt | Limite / suite |
| --- | --- | --- | --- | --- |
| PL-01 | Lecture/pause | **Implémentée** | `ShortsVideoPlayer.tsx`. | — |
| PL-02 | Seek et progression | **Implémentée** | Barre de lecture, raccourcis et callbacks de progression. | — |
| PL-03 | Volume et mute persistés | **Implémentée** | Préférences locales du player. | Synchronisation compte non nécessaire au MVP. |
| PL-04 | Vitesses de lecture | **Implémentée** | Menu et persistance locale de la vitesse. | — |
| PL-05 | Plein écran | **Implémentée** | API Fullscreen avec fallback d'état. | Comportement navigateur à valider sur Safari mobile. |
| PL-06 | Picture-in-Picture | **Implémentée** | API PiP conditionnelle. | Support navigateur variable. |
| PL-07 | Mode cinéma | **Implémentée** | État et layout dédiés. | — |
| PL-08 | Raccourcis clavier | **Implémentée** | Gestion clavier et tests du player. | Documenter les raccourcis dans l'aide produit. |
| PL-09 | Media Session navigateur | **Implémentée** | Metadata et handlers play/pause/seek. | Intégration OS variable. |
| PL-10 | Mini-player sans recréer une seconde vidéo | **Implémentée** | Même instance `ShortsVideoPlayer`, changement de présentation. | Persiste tant que l'orchestrateur La Scène reste monté. |
| PL-11 | Mini-player entre toutes les features | **Implémentée** | Le lecteur VOD et MeeWav TV réclament le slot de `mediaSessionCoordinator.ts`; le mini-player conserve la même instance. | Rooms et le lecteur audio global devront réclamer le même slot lors de leur câblage définitif. |
| PL-12 | Une seule source média MeeWav à la fois | **Implémentée** | Coordinateur global testé sur `scene_video`, `scene_audio`, `scene_tv`, `room`, `global_audio`; VOD, audio-visualizer et TV sont branchés. | Les deux sources hors Scène consommeront la même API à leur raccordement. |
| PL-13 | Reprise de lecture | **Implémentée** | `sceneWatchHistory.ts`, réouverture à la position sauvegardée. | Local au navigateur. |
| PL-14 | Buffering, erreur et retry | **Implémentée** | Poster, états de buffering et action réessayer. | Pas de bascule multi-CDN. |
| PL-15 | Vidéo portrait | **Implémentée** | 60 fiches portrait, rendu pillarbox/backdrop. | — |
| PL-16 | Vidéo paysage | **Implémentée** | 164 fiches paysage. | — |
| PL-17 | Multicam dans le player | **Implémentée** | Support `secondaryVideo`, synchronisation et une session de collaboration préconfigurée dans le catalogue. | Le traitement multicam serveur reste à brancher. |
| PL-18 | Publication multicam | **Mock** | Étape de composition du Creator Drawer. | Traitement et synchronisation serveur requis. |
| PL-19 | Audio d'une vidéo | **Implémentée** | Contrôles natifs du `<video>` et volume/mute. | — |
| PL-20 | Publication/lecture audio seule | **Mock** | Une création MP3 est lisible via le même player avec pochette, visualizer et session `scene_audio`. | Le publisher audio, la waveform calculée et le pipeline serveur restent à brancher. |
| PL-21 | HLS/DASH et bitrate adaptatif | **Backend requis** | Sources MP4 directes seulement. | Packaging, manifests, origin/CDN et fallback qualité. |
| PL-22 | Sélecteur de qualité | **Backend requis** | Aucun variant de transcodage disponible. | Dépend du pipeline adaptatif. |
| PL-23 | Captions/sous-titres | **Backend requis** | Aucun track VTT/TTML ni éditeur de captions. | Génération, correction, stockage et sélection de langue. |
| PL-24 | Transcription accessible | **Backend requis** | Aucune transcription liée aux vidéos. | Service ASR + édition créateur + exposition publique. |
| PL-25 | DRM/offline | **Hors lot** | Aucun contrat DRM ni téléchargement hors ligne. | À décider selon droits et distribution mobile. |
| PL-26 | Transition View Transitions vers le player | **Backend requis** | Aucun appel à `document.startViewTransition` n'a été identifié. | Travail frontend restant ; conserver obligatoirement un fallback sans blocage. |
| PL-27 | Préchargement raisonnable | **Implémentée** | Lazy images, preview différée, preload metadata. | CDN et budget réseau à instrumenter. |

## 5. Artistes, réactions, commentaires, playlists et historique

| ID | Exigence | État | Preuve dans le dépôt | Limite / suite |
| --- | --- | --- | --- | --- |
| SO-01 | Likes visibles dans le player | **Implémentée** | `useShortsEngagement.ts` et contrôles du player. | Like standard stocké localement. |
| SO-02 | Likes synchronisés par compte | **Backend requis** | `localStorage` pour les likes classiques. | API idempotente, compteurs atomiques et anti-abus. |
| SO-03 | Golden Like | **Implémentée** | `goldenLikeApi.ts` appelle le contrat pré-profil existant et le player expose l'action. | Comportement démo local si profil/API indisponible. |
| SO-04 | Quota Golden Like serveur | **Contrat prêt** | État serveur, disponibilité quotidienne et réponse typée. | Robustesse dépend de l'API Globe/auth existante. |
| SO-05 | Partage vidéo | **Implémentée** | Action de partage dans player/menu. | Open Graph vidéo absent. |
| SO-06 | Profil depuis carte et player | **Implémentée** | Lien visible, non dépendant du clic implicite sur toute la carte. | — |
| SO-07 | Page/grille des créations d'un artiste dans La Scène | **Implémentée** | Vue dédiée et deep-link `/scene/artist/:artistId`. | Route SPA sans SSR ni catalogue artiste autoritatif. |
| SO-08 | Page profil complète propriétaire de l'identité | **Hors lot** | Réutilisation de `/profile/view/:profileId`. | Le produit Profil reste la source de vérité. |
| SO-09 | Commentaires : lecture et ajout | **Implémentée** | `SceneCommentsDrawer.tsx` et repository local. | — |
| SO-10 | Réponse à un commentaire | **Implémentée** | Un niveau de réponse. | Threads profonds non prévus. |
| SO-11 | Like, signaler, supprimer son commentaire | **Implémentée** | Méthodes repository et UI. | Identité viewer hardcodée/localement simulée. |
| SO-12 | Anti-spam commentaire | **Mock** | Cooldown local de 5 secondes et limite de 800 caractères. | Rate limiting serveur, fingerprint et détection d'abus requis. |
| SO-13 | Modération/persistance commentaires | **Backend requis** | `localStorage`, aucune file de revue. | DB, RLS, modération, notifications, recours et audit. |
| SO-14 | Watch Later protégé | **Implémentée** | `scenePlaylists.ts`, playlist système non supprimable. | Local uniquement. |
| SO-15 | Playlists nommées, rename/delete/reorder/déduplication | **Implémentée** | Repository et `ScenePlaylistsView` testés, limites et migrations legacy. | Stockage local uniquement. |
| SO-16 | Gestion complète des playlists dans `/scene/playlists` | **Implémentée** | Liste, création, renommage, suppression, ordre, détail jouable, état vide et erreurs locales. | Synchronisation et conflits multi-appareils restent backend. |
| SO-17 | Partage/confidentialité/collaboration playlist | **Backend requis** | Aucun modèle de compte ou permissions distantes. | API, ACL, URLs publiques, invitations et résolution de conflits. |
| SO-18 | Synchronisation playlists multi-appareils | **Backend requis** | Persistance `localStorage`. | Source de vérité serveur. |
| SO-19 | Historique avec position, complétion et replay | **Implémentée** | `sceneWatchHistory.ts`, limite 60 et migrations. | Local uniquement. |
| SO-20 | Rail « Continuer à regarder » | **Implémentée** | Items incomplets issus de l'historique. | — |
| SO-21 | Suppression/effacement de l'historique | **Backend requis** | Aucune UI utilisateur observée pour gérer l'historique. | Ajouter contrôles confidentialité et sync serveur. |
| SO-22 | Synchronisation historique multi-appareils | **Backend requis** | `localStorage`. | API privée, horodatage, fusion et rétention. |

## 6. Studio créateur et publication

| ID | Exigence | État | Preuve dans le dépôt | Limite / suite |
| --- | --- | --- | --- | --- |
| ST-01 | Dashboard Studio | **Mock** | `SceneCreatorStudio` avec résumé et fixtures. | Métriques serveur requises. |
| ST-02 | Liste des contenus | **Mock** | Quatre contenus de démonstration, statuts et droits. | CRUD distant absent. |
| ST-03 | Brouillons | **Mock** | Sauvegarde locale du Creator Drawer et vue Studio. | Synchronisation serveur et upload partiel requis. |
| ST-04 | Programmation de publication | **Mock** | Section et statuts planifiés. | Scheduler serveur, timezone, retry et notifications. |
| ST-05 | Analytics créateur | **Mock** | Courbes/rétention/chiffres en fixture. | Pipeline d'événements et agrégations privées. |
| ST-06 | Inbox commentaires | **Mock** | Écran Studio présent. | Connecter au service de commentaires/modération. |
| ST-07 | Droits et réclamations | **Mock** | Écran Studio et états de démonstration. | Workflow juridique et coffre de preuves. |
| ST-08 | Playlists créateur | **Mock** | Cartes et navigation Studio. | Connecter au repository puis au backend. |
| ST-09 | Collaborations créateur | **Mock** | Inbox et états de collaboration. | Connecter au produit Collaboration/Messagerie. |
| ST-10 | Publication en quatre étapes | **Implémentée** | Média, composition, informations/visibilité, crédits/droits. | Publie seulement dans l'état local courant. |
| ST-11 | Upload vidéo local | **Mock** | Fichier `video/*`, limite 1 Go, blob URL. | Upload résumable/chunké serveur requis. |
| ST-12 | Portrait et paysage | **Implémentée** | Choix et preview des formats. | Pipeline serveur doit préserver masters et renditions. |
| ST-13 | Version 16:9 liée à une verticale | **Mock** | Champ de média lié dans le Creator Drawer. | Association et transcodage serveur. |
| ST-14 | Deuxième caméra et layout multicam | **Mock** | Étape composition. | Synchronisation, montage et compatibilité player/CDN. |
| ST-15 | Métadonnées vidéo | **Implémentée** | Titre, description, type, style, lieu et visibilité. | Validation et taxonomies serveur nécessaires. |
| ST-16 | Crédits artistes/musique | **Contrat prêt** | `musicCredits` et validations de gouvernance. | Persistance et identifiants professionnels à brancher. |
| ST-17 | Attestations de droits | **Contrat prêt** | Preflight droits appelé avant publication locale. | Le client ne peut pas attester juridiquement seul. |
| ST-18 | Antivirus et analyse de fichier | **Backend requis** | Aucun scan serveur. | Quarantaine avant traitement. |
| ST-19 | Transcodage, thumbnail, waveform, captions | **Backend requis** | Blob local uniquement. | Jobs asynchrones, état de traitement et retry. |
| ST-20 | Publication réelle et durable | **Backend requis** | Aucun asset/catalogue serveur créé. | Endpoint idempotent, ownership, quota et modération. |
| ST-21 | Audio seul dans le Studio | **Mock** | Le contrat `audio_visualizer`, la lecture MP3, la pochette et le visualizer sont présents dans la démo. | Étendre l’upload Studio à `audio/*`, calculer waveform et transcodages côté serveur. |
| ST-22 | Journal d'état upload/processing | **Backend requis** | Aucun job distant à suivre. | SSE/websocket ou polling, erreurs récupérables. |

## 7. Droits, crédits, modération et sécurité

| ID | Exigence | État | Preuve dans le dépôt | Limite / suite |
| --- | --- | --- | --- | --- |
| RG-01 | Droits VOD distincts | **Contrat prêt** | `MediaRightsGrant` avec usage `sceneVod`. | Persistance serveur requise. |
| RG-02 | Droits TV distincts | **Contrat prêt** | Usage `tvLinear`, non déduit de la VOD. | Revalidation au moment de l'antenne. |
| RG-03 | Droits de génération d'extraits distincts | **Contrat prêt** | Usage `clipGeneration`. | Job de clip doit revalider le grant. |
| RG-04 | Territoire, dates, révocation et preuve | **Contrat prêt** | Validations pures dans `mediaGovernance`. | Normalisation et géorestriction serveur. |
| RG-05 | Crédits attachés au bon asset | **Contrat prêt** | Validation asset/order/dédoublonnage/primary. | Registre persistant requis. |
| RG-06 | Room terminée et recording prêt avant replay | **Contrat prêt** | `roomReplayContract` et tests. | État Room/recording serveur requis. |
| RG-07 | Consentement de chaque personne capturée, par usage | **Contrat prêt** | Preflight replay vérifie les participants et usages. | Signature et preuve auditables requises. |
| RG-08 | Coffre de preuves immuable | **Backend requis** | Aucun stockage de contrats/signatures. | Versioning, empreinte, audit et rétention. |
| RG-09 | Takedown propagé VOD/TV/clips/CDN | **Backend requis** | Les contrats sont sans effet de bord. | Orchestration transactionnelle et purge cache. |
| RG-10 | Manifests de licences | **Implémentée** | Manifests Scene et TV présents. | Toutes les sources de démo sont explicitement non approuvées production. |
| RG-11 | Médias de production juridiquement autorisés | **Backend requis** | `productionApproved: false` pour les six MP4 et le MP3. | Remplacer ou obtenir preuve/licence compatible. |
| RG-12 | Signaler une vidéo | **Mock** | Action utilisateur et état local. | File Trust & Safety serveur. |
| RG-13 | Signaler un commentaire | **Mock** | Repository commentaires local. | File de revue et sanctions serveur. |
| RG-14 | Statuts revue/bloqué côté créateur | **Mock** | Types et écrans Studio. | Moteur de politique et agents de revue. |
| RG-15 | Modération serveur, appels et audit | **Backend requis** | Aucun workflow complet. | SLA, preuves, décisions, recours et notifications. |
| RG-16 | Scan contenu/abus/copyright | **Backend requis** | Aucun service d'analyse. | Fingerprinting, règles de sécurité, contrôles humains. |
| RG-17 | Contrôle d'âge et géorestriction | **Backend requis** | Pas de décision serveur. | Policy produit/juridique et enforcement CDN/API. |
| RG-18 | RLS et isolation des données privées | **Backend requis** | Données de démo/localStorage. | Policies par compte, créateur, modérateur et admin. |
| RG-19 | Contenus sponsorisés transparents | **Contrat prêt** | Politique éditoriale TV documente la séparation. | Modèle sponsor/label et validation serveur à ajouter si activé. |

## 8. MeeWav TV

| ID | Exigence | État | Preuve dans le dépôt | Limite / suite |
| --- | --- | --- | --- | --- |
| TV-01 | Une seule chaîne officielle | **Implémentée** | `channelId: "meewav-main"`. | Architecture extensible, UI publique mono-chaîne. |
| TV-02 | Entrée directe sur l'antenne | **Implémentée** | `/scene/tv` rend immédiatement `SceneTvSchedule`. | — |
| TV-03 | Un seul player principal | **Implémentée** | Aucun mur de chaînes ou de players. | — |
| TV-04 | Autoplay muted et CTA si bloqué | **Implémentée** | Logique de démarrage/activation du son. | Comportement variable selon navigateur. |
| TV-05 | Rejoindre au bon offset linéaire | **Implémentée** | Calcul elapsed/program duration dans la schedule. | MP4 local ; synchronisation live réelle absente. |
| TV-06 | Programme courant, suivant et progression | **Implémentée** | Engine `getCurrentProgram`, next, remaining et progress. | — |
| TV-07 | Horaires UTC et affichage Europe/Paris/DST | **Implémentée** | Engine et tests de timezone/changement d'heure. | Confirmer la timezone cible avec le backend EPG. |
| TV-08 | Continuité sans trou | **Implémentée** | Engine détecte conflits/trous et fixtures continues. | Observabilité distante nécessaire. |
| TV-09 | Fallback en cas d'erreur média | **Implémentée** | Source de secours et événement analytics. | Multi-CDN/live failover serveur absent. |
| TV-10 | 14 jours de programme et 120+ entrées | **Mock** | Générateur dynamique J à J+13. | EPG éditorial distant requis. |
| TV-11 | Formats propriétaires variés | **Mock** | Sessions, La Relève, Carte blanche, Connexions, ville/style, Première, Info, etc. | Titres, artistes et médias sont de démonstration. |
| TV-12 | « À L'ANTENNE » distinct de « EN DIRECT » | **Implémentée** | Labels et source type différenciés. | — |
| TV-13 | EPG Maintenant/Ce soir/Demain/Programme | **Implémentée** | Chronologie strictement verticale, progression courante, libellés relatifs Aujourd'hui/Demain et continuité exposée. | — |
| TV-14 | Rappels | **Mock** | `sceneTvReminders.ts`, persistance locale. | Notifications web/mobile/email serveur requises. |
| TV-15 | Catch-up vers La Scène | **Implémentée** | Lien si `catchupVideoId` disponible. | Catalogue distant requis. |
| TV-16 | Replay Room sélectionné | **Mock** | Programmes/badges et source de démonstration. | Contrats et asset Room réels requis. |
| TV-17 | Room simulcast | **Contrat prêt** | Type source, lien Rooms et garde de disponibilité. | Flux live, fin de Room et retour antenne à brancher. |
| TV-18 | Popup événement live non agressive | **Mock** | Modèle d'événement et garde de disponibilité. | Signal serveur et mémoire des dismiss multi-appareils. |
| TV-19 | MeeWav Original | **Mock** | Labels et formats de fixture. | Productions/assets réellement exclusifs requis. |
| TV-20 | Masthead, watermark, lower-third, « Ensuite », station ID | **Implémentée** | Masthead `MEEWAV TV` / `La chaîne officielle de MeeWav.`, signature MW canonique et transitions de `SceneTvSchedule`. | Assets éditoriaux définitifs à produire. |
| TV-21 | Plein écran et PiP | **Implémentée** | Contrôles TV conditionnels. | — |
| TV-22 | Reprendre depuis le début / retour au direct | **Backend requis** | Pas de fenêtre de rewind/catch-up linéaire fiable. | DVR/HLS et règles de droits requis. |
| TV-23 | Mode cinéma TV | **Implémentée** | Contrôle et layout `cinemaMode` dans `SceneTvSchedule`. | — |
| TV-24 | HLS live/ABR/captions/qualité/live edge | **Backend requis** | TV utilise les mêmes assets MP4 locaux. | Pipeline broadcast/CDN complet. |
| TV-25 | Régie `/internal/tv-scheduler` | **Backend requis** | Aucun scheduler interne routé complet. | Admin auth, timeline, conflits, édition et publication. |
| TV-26 | Programme urgent/déclaration officielle | **Mock** | Format fixture `official_statement`. | Workflow de priorité/régie serveur absent. |
| TV-27 | Page/drawer programme léger | **Mock** | Guide expose les métadonnées essentielles. | Fiche détaillée/partage/rappel à compléter. |
| TV-28 | Pas de chat TV permanent | **Hors lot** | Aucun chat permanent. | Conforme au MVP ; discussion événementielle optionnelle. |
| TV-29 | Pas de catalogue général VOD dans TV | **Hors lot** | Le guide reste une chronologie, renvoi vers La Scène. | Conforme à la frontière produit. |
| TV-30 | Politique éditoriale | **Implémentée** | `docs/tv-editorial-policy.md`. | Gouvernance opérationnelle et audits restent organisationnels. |
| TV-31 | Gate de disponibilité avant ouverture | **Contrat prêt** | `sceneTvAvailabilityGate.ts` contrôle fenêtre, continuité, sources, fallback, diversité et grants `tvLinear`. | Le serveur doit recalculer le gate au moment de diffuser. |

## 9. SEO, analytics, accessibilité et performance

| ID | Exigence | État | Preuve dans le dépôt | Limite / suite |
| --- | --- | --- | --- | --- |
| OP-01 | Titre de document La Scène | **Implémentée** | `document.title = "La Scène — MeeWav"`. | Métadonnées vidéo dynamiques absentes. |
| OP-02 | Route vidéo lisible `/scene/watch/:slug` | **Implémentée** | Slug local et deep-link. | Le contenu n'est pas rendu côté serveur. |
| OP-03 | SSR/prerender vidéo | **Backend requis** | Application SPA uniquement. | Rendu HTML par vidéo/profil et cache edge. |
| OP-04 | Canonical URL | **Backend requis** | Aucun canonical dynamique vérifié. | Ajouter par route publique. |
| OP-05 | Open Graph/Twitter video | **Backend requis** | Aucune metadata sociale dynamique. | Image, titre, auteur, durée, player URL. |
| OP-06 | Schema.org `VideoObject` | **Backend requis** | Aucun JSON-LD dynamique. | Générer depuis le catalogue autoritatif. |
| OP-07 | Sitemap vidéo | **Backend requis** | Aucun générateur/sitemap média. | Génération incrémentale et règles d'indexation. |
| OP-08 | Robots/retired legacy URLs | **Backend requis** | Redirection SPA seulement. | 301 edge et politique canonical `/shorts` → `/scene`. |
| OP-09 | Analytics TV côté client | **Contrat prêt** | `sceneTvAnalytics.ts` émet `meewav:analytics`. | Aucun provider n'ingère encore les événements. |
| OP-10 | Quartiles TV 25/50/75/completed | **Contrat prêt** | `sceneTvAnalytics.ts` émet les quatre jalons, dédupliqués par programme dans la session du composant. | Ingestion, consentement et déduplication serveur restent à brancher. |
| OP-11 | Analytics vidéo La Scène | **Contrat prêt** | `sceneAnalytics.ts` émet starts, quartiles, completion, recherche, filtres, profil, partage, sauvegarde et préférence. | Consentement, ingestion, déduplication serveur et observabilité restent à brancher. |
| OP-12 | Analytics Studio | **Mock** | Courbes et valeurs de fixtures. | Agrégations serveur, délais et confidentialité. |
| OP-13 | Consentement et gouvernance analytics | **Backend requis** | Aucun pipeline/consent manager identifié dans le domaine. | Identité pseudonyme, rétention, opt-out et schéma versionné. |
| OP-14 | Navigation clavier du player | **Implémentée** | Raccourcis, focus et tests du player. | Audit manuel complet restant. |
| OP-15 | Dialogues accessibles | **Implémentée** | Drawer commentaires et dialogs avec rôles/focus. | Vérifier lecteur d'écran sur mobile. |
| OP-16 | `prefers-reduced-motion` | **Implémentée** | CSS et preview conditionnelle. | — |
| OP-17 | Information non portée uniquement par la couleur | **Implémentée** | Labels, icônes et texte pour les principaux états. | Audit WCAG complet non fourni. |
| OP-18 | Sous-titres pour accessibilité | **Backend requis** | Aucun track captions. | Bloquant pour une conformité vidéo complète. |
| OP-19 | WCAG 2.2 AA certifié | **Backend requis** | Bon socle, mais aucun audit/certificat complet. | Audit clavier, SR, zoom 200/400 %, contraste et mobile. |
| OP-20 | Images lazy et `content-visibility` | **Implémentée** | Optimisations CSS/HTML des rails/murs. | Mesurer LCP/CLS/INP sur build production. |
| OP-21 | Chargement différé des previews | **Implémentée** | Preview créée après intention de hover. | — |
| OP-22 | Catalogue non bundlé | **Backend requis** | 224 objets importés côté client. | API paginée et cache de requêtes. |
| OP-23 | CDN et adaptive streaming | **Backend requis** | Assets locaux/directs. | Origin, CDN, signed URLs, ABR et observabilité. |
| OP-24 | Offline/PWA | **Hors lot** | Aucun cache média offline. | À décider selon stratégie mobile et droits. |

## 10. Données, tests et documentation

| ID | Exigence | État | Preuve dans le dépôt | Limite / suite |
| --- | --- | --- | --- | --- |
| QA-01 | 60 artistes fictifs | **Mock** | 60 identités distinctes dans le catalogue. | Remplacer par données autorisées en production. |
| QA-02 | 150+ vidéos cataloguées | **Mock** | 224 fiches. | Seulement six fichiers MP4 physiques. |
| QA-03 | Variété réelle des médias | **Backend requis** | Six MP4 sont fortement réutilisés. | Fournir masters variés, licenciés et transcodés. |
| QA-04 | 20+ contenus portrait | **Mock** | 60 fiches portrait. | Assets physiques réutilisés. |
| QA-05 | Démo multicam visible | **Implémentée** | Player/publisher/tests supportent `secondaryVideo`; une collaboration à deux sources est préconfigurée dans le catalogue. | Remplacer les médias de prototype par deux masters réellement synchronisés et autorisés. |
| QA-06 | Démo audio seule | **Mock** | Une fixture audio-only, un visualizer et un test player sont présents. | Upload audio et traitement waveform restent à raccorder. |
| QA-07 | Manifests de licence | **Implémentée** | Manifests Scène et TV. | Ils signalent l'absence de clearance production. |
| QA-08 | Tests du contrat de routes | **Implémentée** | `sceneContract.test.ts`. | Ajouter un E2E serveur/edge pour les deep-links. |
| QA-09 | Tests découverte/recommandation | **Implémentée** | `sceneDiscoveryModel.test.ts`. | Ne valide pas un moteur distant. |
| QA-10 | Tests player | **Implémentée** | Tests composant pour contrôles, mini-player et états. | Matrice navigateur/device réelle restante. |
| QA-11 | Tests historique/playlists/commentaires | **Implémentée** | Suites unitaires et composant locales. | Ajouter tests API/permissions après backend. |
| QA-12 | Tests Studio/publisher | **Implémentée** | Suites Studio, Creator Drawer et publishing access. | Upload/transcodage réels non couverts. |
| QA-13 | Tests droits/replay | **Implémentée** | Tests de séparation des usages et consentements. | Ajouter intégration serveur et races de révocation. |
| QA-14 | Tests TV engine/schedule/reminders/analytics/gate | **Implémentée** | Suites dans `src/features/scene/tv`, incluant continuité, dates relatives, quartiles et droits de diffusion. | Ajouter tests HLS/live/failover une fois branchés. |
| QA-15 | Captures 375/768/1024/1440/1920 | **Implémentée** | `scripts/capture-scene-design.mjs`. | Le script ne prouve pas 320/430/1280 ni tous les états. |
| QA-16 | E2E La Scène | **Backend requis** | Aucun scénario Playwright dédié sous `tests/e2e`. | Ajouter parcours Accueil→watch→mini-player, Suivis, Explorer, Studio, TV. |
| QA-17 | Régression sans scrollbar globale | **Contrat prêt** | Harness de capture vérifie l'overflow horizontal. | Intégrer à la CI sur toutes les largeurs. |
| QA-18 | Documentation de refonte | **Implémentée** | `docs/scene-refactor.md` et `docs/scene-final-audit.md`. | Maintenir après raccordements. |
| QA-19 | Script démo investisseurs | **Implémentée** | `docs/scene-investor-demo-script.md`. | Revalider après déploiement et données réelles. |
| QA-20 | Dépendances droits/backend documentées | **Implémentée** | `mediaGovernance/BACKEND_DEPENDENCIES.md`. | Convertir en backlog technique propriétaire. |

## Éléments explicitement hors lot

- le catalogue, la recherche, les « Top » et le chat des Rooms ;
- les prix, variations et opérations des jetons de talent dans l'interface vidéo ;
- le catalogue Marketplace ;
- plusieurs chaînes TV au lancement ;
- un chat permanent sur MeeWav TV ;
- le DRM, le téléchargement offline et la monétisation publicitaire, faute de décision produit et juridique ;
- la reconstruction du produit Profil : La Scène doit seulement fournir des liens explicites et une grille vidéo artiste.

## Plan de sortie recommandé

### P0 — avant toute production publique

1. Étendre l’ownership Studio aux droits, crédits, sous-titres, commentaires et TV.
2. Upload résumable, scan, transcodage HLS, captions, thumbnails et CDN.
3. Recherche/recommandation distantes avec pagination et fairness auditable ; le catalogue public est déjà lu depuis `published_media_files`.
4. Registre de droits, consentements, signatures et takedown propagé.
5. Modération vidéo/commentaires, anti-abus, recours et journal d'audit.
6. Persistance compte des commentaires, historique et playlists ; les likes réels sont déjà persistés.
7. SSR, metadata sociales, `VideoObject`, sitemaps et rewrites edge.
8. Analytics avec consentement, schéma d'événements, ingestion et observabilité.
9. Remplacement des six MP4 et du MP3 non cleared par des médias autorisés.

### P1 — qualité produit

1. Brancher Rooms et le lecteur audio global au coordinateur déjà utilisé par La Scène et MeeWav TV.
2. Synchroniser le gestionnaire visuel de playlists et les contrôles d'historique avec les comptes et appareils.
3. Étendre la fixture multicam/audio et fournir des médias beaucoup plus variés.
4. Couvrir les parcours critiques par E2E et audit WCAG 2.2 AA.
5. Brancher Studio analytics, programmation, commentaires, droits et collaborations.
6. Raccorder `/scene/artist/:artistId` à un catalogue canonique et rendre cette route indexable côté serveur.

### P2 — diffusion avancée

1. Régie TV, EPG distant, HLS linéaire, source Room live et failover multi-source.
2. DVR « reprendre du début / retour au direct » lorsque les droits le permettent.
3. Notifications de rappel multi-canaux.
4. Partage/collaboration de playlists.
5. Traitement audio adaptatif, waveform calculée et reprise globale lorsque le pipeline média sera disponible.

## Conclusion d'acceptation

La démo actuelle peut être présentée comme un produit cohérent et profond, mais pas comme une plateforme déjà raccordée à son infrastructure de production. La formulation exacte recommandée est :

> La Scène est fonctionnelle en démonstration et ses parcours identitaires, média, collaboration, suivi, réactions et publication sont raccordés lorsqu’un profil canonique est disponible. Le transcodage, les droits, la modération, la synchronisation des données locales, la TV autoritative et le SEO public restent à brancher sur des services de production.
