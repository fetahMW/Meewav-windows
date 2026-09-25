# La Scène — refonte du pilier vidéo

> Audit de consolidation, matrice de livraison et dépendances backend :
> [`scene-final-audit.md`](./scene-final-audit.md). Parcours de présentation :
> [`scene-investor-demo-script.md`](./scene-investor-demo-script.md).

## Identité et routes

- Nom public : **La Scène**.
- Signature : **Là où le talent règne sur l’algorithme.**
- Sous-signature : **Un flux 100 % musique conçu pour faire émerger les créations, les performances et les artistes.**
- Route canonique : `/scene`.
- Les anciennes routes `/shorts` et `/shorts/*` redirigent vers leur équivalent `/scene` en conservant recherche et hash.
- Les noms techniques `Shorts*`, certains DTO et certaines clés de stockage sont conservés temporairement pour compatibilité et migration. Ils ne sont plus exposés dans l’interface.

## Frontières produit

La Scène contient uniquement les vidéos publiées à la demande : clips, performances, sessions, DJ sets, freestyles, danse, covers, studio, coulisses, interviews, documentaires, collaborations, replays de Rooms publiés et MeeWav Originals.

Les directs, catalogues de Rooms, prochaines Rooms et classements de Rooms restent dans le pilier Rooms. Un replay n’entre dans La Scène qu’après publication. MeeWav TV programme des assets déjà publiés sans les dupliquer.

## Architecture livrée

- `ShortsPage.tsx` porte actuellement la page historique, désormais exposée comme La Scène.
- `sceneContract.ts` centralise l’identité et la migration de route.
- `sceneDiscoveryModel.ts` centralise taxonomie, recherche, filtres, URL et règles de recommandation.
- `sceneWatchHistory.ts` gère l'historique local, la reprise et la migration des anciennes données Shorts.
- `scenePlaylists.ts` et `playlists/ScenePlaylistsView.tsx` portent le repository local et la gestion visuelle complète des playlists.
- `recommendations/SceneRecommendationSettings.tsx` expose le contrôle utilisateur de l'historique et des préférences de recommandation.
- `mediaSession/` coordonne les lecteurs vidéo, audio visualizer, TV, Rooms et audio global afin de ne conserver qu'une source active.
- `scene/tv/*` porte le programme TV typé, ses fixtures et son rendu accessible.
- Le moteur de recherche et le panneau de filtres réutilisent les primitives partagées du Globe et du Tremplin.
- Le lecteur existant accepte une position initiale, remonte la progression et signale la fin de lecture.
- Le studio de publication accepte les formats verticaux et horizontaux, le multi-cam et un type de contenu explicite.

## Expérience

- Navigation : Accueil, Explorer, Suivis, TV.
- `FeaturedRail` « À la une » remplace l'ancien hero géant et sa file « À regarder ensuite » ; le contenu commence immédiatement sous l'identité compacte.
- Rails d'accueil type Netflix : dix contenus bouclés, navigation horizontale et mur vertical après « Voir tout ».
- Cartes vidéo 16:9 avec titre, artiste, grade, vues, date, durée et aperçu silencieux différé.
- Accueil personnalisé avec recommandations, nouveautés, reprise de lecture, suivis, formats éditoriaux, replays publiés et TV.
- Aucun autoplay audio ; les préférences de mouvement réduit désactivent les aperçus animés.
- Recherche, filtres et paramètres sont partageables via l'URL.
- Une création audio seule utilise sa pochette, un visualizer dédié et le même coordinateur média que le player vidéo.

## Routes fonctionnelles

- navigation : `/scene`, `/scene/suivis`, `/scene/tv`, `/scene/explorer` ;
- lecture : `/scene/watch/:slug` et `/scene/vertical/:videoId` ;
- découverte ciblée : `/scene/artist/:artistId` et `/scene/search` ;
- bibliothèque : `/scene/history`, `/scene/playlists`, `/scene/playlist/:playlistId` ;
- contrôle de recommandation : `/scene/recommendation-settings` ;
- publication : `/scene/upload` et `/scene/studio/*`.

## MeeWav TV

- masthead compact : `MEEWAV TV`, puis `La chaîne officielle de MeeWav.` ;
- une seule antenne publique avec watermark MW, station IDs, lower-third et annonce « Ensuite » ;
- EPG strictement vertical, libellés Aujourd'hui/Demain, progression courante et fallback matérialisé sans trou ;
- gate de disponibilité vérifiant droits `tvLinear`, sources, fallback, continuité et diversité avant ouverture ;
- analytics 25/50/75/completed dédupliqués par programme côté client, en attente d'un provider d'ingestion.

## Volume de démonstration

- 224 fiches de contenus ;
- 60 artistes distincts ;
- 60 formats portrait, 164 formats paysage, une démo multicam et une source audio visualisée.

## Données et dépendances backend

Le frontend ne prétend pas remplacer les services encore absents. Restent à connecter à une source serveur :

- catalogue vidéo et pagination ;
- moteur de recommandation et signaux d’équité ;
- recherche distante ;
- abonnements réels ;
- upload, transcodage, miniatures et modération ;
- commentaires, playlists et favoris synchronisés ;
- historique multi-appareil ;
- programmation TV éditoriale ;
- publication d’un replay depuis le cycle de vie d’une Room ;
- analytics produit et reprise dans un lecteur global.

Les fixtures actuelles servent uniquement à rendre les parcours testables. Les données live des Rooms et le backend financier du Tremplin ne sont pas modifiés.

## Régression

- Les six grades continuent d’utiliser les composants et assets existants.
- Aucun asset graphique de badge n’a été modifié.
- Les tests couvrent l’identité, les routes, les filtres, les cartes, la publication, la TV, l’historique et la reprise de lecture.
