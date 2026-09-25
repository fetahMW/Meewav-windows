# La Scène — audit final de consolidation

Date de contrôle : 8 août 2026  
Branche contrôlée : `main` dans le worktree canonique de la plateforme.

## Consolidation Studio et infrastructure

Le back-office créateur est désormais une destination séparée de la navigation spectateur. Les CTA `Publier` et `Mon Studio` sont contextuels, les médias publics réels sont injectés avant les fixtures, et les identifiants de profil canoniques sont propagés aux services partagés.

Le câblage transversal couvre désormais : catalogue public, médiathèque propriétaire, publication, édition des métadonnées, profils, suivi, messagerie, collaboration avec provenance, Golden Likes, likes média et impressions analytiques autorisées. Les commentaires, playlists, historique, droits, encodage, replay et TV restent en démonstration tant qu’aucun service autoritatif n’existe. Voir `docs/scene-studio-spec.md` pour le contrat détaillé.

## Verdict

La Scène n’est plus un feed vertical renommé. Le produit possède désormais quatre usages distincts et lisibles :

- **Accueil** recommande et éditorialise des vidéos publiées ;
- **Suivis** restitue chronologiquement les artistes choisis ;
- **TV** diffuse une chaîne linéaire unique ;
- **Explorer** laisse l’utilisateur piloter recherche, formats et filtres.

Le nom technique historique `shorts` demeure dans certains fichiers, DTO, migrations et chemins d’assets afin de préserver les données et les intégrations. Il n’est plus un libellé public.

## État des critères structurants

| Domaine | État | Preuve principale |
| --- | --- | --- |
| Identité officielle | Livré | `sceneContract.ts` centralise nom, signature et sous-signature. |
| Migration `/shorts` | Livré côté SPA | Redirections des alias et deep-links vers les routes `/scene/*`. Rewrite CDN encore requis. |
| Accueil média | Livré | `FeaturedRail` « À la une », rails Netflix bouclés de dix contenus et murs verticaux « Voir tout ». L’ancien hero géant avec file « À regarder ensuite » a été retiré. |
| Suivis chronologique | Livré | Regroupements Aujourd’hui / semaine / plus tôt, non-vus et tri récent. |
| Explorer | Livré | Recherche partagée, quick filters, panneau avancé, tri Pertinence et chargement progressif. |
| Player | Livré en démo | MP4, vertical, multicam, vitesse, clavier, PiP, cinéma, plein écran, reprise. HLS/CDN à raccorder. |
| Mini-player et session média | Livré localement | Une instance du lecteur, reprise et Media Session ; le coordinateur global arbitre `scene_video`, `scene_audio`, `scene_tv`, `room` et `global_audio`. Rooms et le lecteur audio global doivent encore consommer ce contrat en production. |
| Likes et Golden Likes | Livré sur le contrat existant | Réactions restaurées dans le lecteur et persistance existante. |
| Commentaires | Livré en service local | Discussion, réponse, like, signalement, suppression de son message et anti-spam court. |
| Playlists | Livré en UI et repository local | Watch Later protégé, création, renommage, suppression, ordre, détail jouable, état vide, migration legacy et déduplication. La synchronisation multi-appareils reste backend. |
| Historique | Livré en repository local | Progression, reprise, complétion et migration des anciennes clés. |
| Studio créateur | Livré en démo routée | `/scene/studio/*`, dashboard, contenus, brouillons, programmation, analyses, commentaires, droits, playlists, collaborations. |
| Publication | Livré en mock fonctionnel | Upload local, brouillon, formats, multicam, crédits et préflight droits. Transcodage serveur absent. |
| Crédits musicaux | Livré comme contrat | Rôles, artistes et validations typés dans `mediaGovernance`. |
| Droits VOD / TV / extraits | Livré comme contrat | Grants distincts ; une autorisation VOD ne vaut jamais autorisation TV. |
| Room → replay → TV | Livré comme contrat testable | Room terminée, enregistrement prêt, consentements individuels et contrôles par usage. |
| MeeWav TV | Livré en démo riche | Masthead compact, antenne unique, EPG vertical relatif à l’heure, continuité stricte, fallback, gate de disponibilité/droits, station IDs et analytics 25/50/75/completed dédupliqués. |
| SEO / SSR public | À brancher | Le frontend SPA ne fournit pas encore un rendu serveur ni le sitemap vidéo. |
| Modération serveur | À brancher | Les états locaux existent ; files de revue, recours et RLS restent backend. |

## Architecture conservée et consolidée

- `src/features/shorts/ShortsPage.tsx` reste l’orchestrateur historique pour éviter une réécriture risquée.
- `src/features/scene/` accueille les nouveaux domaines indépendants : découverte, historique, playlists, commentaires, Studio, gouvernance média et TV.
- Les badges de grade réutilisent exclusivement `MeewavGradeBadge` et leurs assets existants.
- Les primitives recherche/filtre restent partagées avec le Globe et le Tremplin.
- Le profil, la messagerie et les demandes de collaboration continuent d’utiliser leurs routes et contrats canoniques.

## Routes

### Publiques ou utilisateur

- `/scene`
- `/scene/suivis`
- `/scene/tv`
- `/scene/explorer`
- `/scene/watch/:slug`
- `/scene/vertical/:videoId`
- `/scene/artist/:artistId`
- `/scene/search`
- `/scene/history`
- `/scene/playlists`
- `/scene/playlist/:playlistId`
- `/scene/recommendation-settings`
- `/scene/upload`

### Créateur

- `/scene/studio`
- `/scene/studio/content`
- `/scene/studio/drafts`
- `/scene/studio/scheduled`
- `/scene/studio/analytics`
- `/scene/studio/comments`
- `/scene/studio/rights`
- `/scene/studio/playlists`
- `/scene/studio/collaborations`

Le CTA Publier et le Studio sont masqués pour les comptes viewer. Ce contrôle d’affichage ne remplace pas une autorisation serveur.

## MeeWav TV

Le moteur génère aujourd’hui puis J+13 dans le fuseau `Europe/Paris`. Il garantit :

- un seul canal public `meewav-main` ;
- `programme.endAt === programmeSuivant.startAt` ;
- calcul dynamique du temps restant et de la progression ;
- gestion des changements d’heure ;
- programme précédent, courant et suivant ;
- fallback de continuité ;
- guide strictement vertical ;
- masthead limité à « MEEWAV TV » et « La chaîne officielle de MeeWav. » ;
- watermark MW canonique, lower-third, annonce « Ensuite » et ident court à l’ouverture et lors du changement de programme ;
- gate de disponibilité qui contrôle continuité, sources, fallback, diversité et droits `tvLinear` ;
- événements `tv_program_25`, `tv_program_50`, `tv_program_75` et `tv_program_completed`, une seule fois par programme et par session.

Les contenus restent des assets locaux de démonstration. La régie distante, le HLS linéaire et le simulcast réel doivent être câblés au backend.

## Données et médias de démonstration

- **224 contenus** répartis entre formats paysage, verticaux, multicam et une création audio avec visualizer.
- **60 artistes** fictifs distincts alimentent les quatre onglets, les rails, les murs et les pages artiste.
- Identités, portraits et grades partagés au lieu de miniatures recadrées en faux avatars.
- Manifest La Scène : `data/scene-media-license-manifest.json`.
- Manifest TV : `data/tv-media-license-manifest.json`.

Les manifests marquent volontairement les assets sans preuve de licence dans le dépôt comme **prototype uniquement, non autorisé en production**. Le modèle `mediaGovernance` doit recevoir une preuve avant publication ou diffusion TV.

## Dépendances backend restantes

1. Catalogue paginé, recherche distante et moteur de recommandation/fairness.
2. Upload résumable, analyse antivirus, transcodage HLS, thumbnails, captions et CDN.
3. Persistance des commentaires, modération, recours, anti-spam et notifications.
4. Playlists, historique et progression synchronisés par compte et appareil.
5. RLS de publication fondée sur le rôle serveur, pas sur `user_metadata`.
6. Registre de crédits, signatures, consentements et preuves de droits immuables.
7. Service Room replay et autorisations territoriales/expiration.
8. Régie TV, EPG distant, source live, fallback et observabilité.
9. Analytics produit et créateur côté serveur.
10. SSR, Open Graph, `VideoObject`, sitemap vidéo et deep-links natifs.
11. Migration additive des enums/analytics `shorts` vers `scene` avec dual-read.
12. Rewrite SPA/CDN des anciennes URLs.

Le détail du domaine droits/replay est dans `src/features/scene/mediaGovernance/BACKEND_DEPENDENCIES.md`.

## Ce qui reste volontairement simulé

- nombres de vues et courbes d’analyses ;
- commentaires et playlists au-delà du navigateur courant ;
- publication effective et traitement média ;
- preuve cryptographique ou signature des ayants droit ;
- diffusion linéaire distante et notifications de rappel ;
- recommandation personnalisée de production ;
- permissions push et emails.

Ces limites sont visibles dans la documentation et ne sont pas présentées comme des opérations backend réelles.
