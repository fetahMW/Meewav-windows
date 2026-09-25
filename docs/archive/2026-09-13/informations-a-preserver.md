# Informations à préserver — registre de sauvegarde, mission 3

Date : 13 septembre 2026. Référence de lecture : `8e07a1071f13d72f07aa0aacfdf3a6534caa0ecb`.

Ce registre conserve les informations de l'ancien corpus avant reconstruction. Ce n'est pas la nouvelle documentation officielle. Les extraits historiques ne constituent ni des instructions à exécuter, ni une validation du produit ou du déploiement. Les originaux archivés restent conservés octet pour octet ; les chemins, empreintes et dépendances figurent dans [inventaire.csv](inventaire.csv).

## Cadre de la suite

- Future organisation : `docs/fonctionnalites/`, jamais `docs/piliers/`. La liste des fonctionnalités ne définit pas les six piliers officiels ; terminologie à établir avec l'utilisateur. Aucun de ces futurs guides n'est créé ici.
- Distinguer : présent dans le code ; implémenté/raccordé ; vérifié avec méthode et date ; déployé dans un environnement identifié avec preuve. Une version stabilisée et un push Git ne prouvent pas le déploiement des services.
- Les SQL, migrations, schémas, configurations, licences, crédits, provenance, fixtures et ressources consommées restent à leur emplacement. Aucun changement applicatif.
- La phase suivante attend la validation de l'utilisateur.

## 1. Architecture et raisons des choix

### Globe embarqué et frontière de confiance

Le globe actif est séparé dans `vendor/globe-vinyle`, servi dans une iframe par `src/features/globe/VinylGlobe.tsx`. La séparation évite de remettre l'ancien moteur MapLibre/MVT au centre du produit. Le pont de navigation borne les destinations et contrôle l'émetteur ; conserver ces raisons, pas seulement le chemin d'un composant. Le serveur MVT n'est lancé que sur option historique dans `scripts/start-development.mjs`.

Source historique : [GLOBE-VINYLE-INTEGRATION.md](<../../../GLOBE-VINYLE-INTEGRATION.md>), ligne originale 43.

> `postMessage` limité aux six routes de features. L'origine et la fenêtre
> émettrice sont contrôlées. L'authentification et les protections des routes
> restent gérées par l'application parent. Le document interne isole les styles
> globaux et la version Three.js du globe ; quitter la route détruit ce document
> et ses workers. Aucun second moteur cartographique n'est monté en arrière-plan.

### Programme partagé et vue personnelle

Conserver la distinction entre décision host sur le programme diffusé, cadrage propre au viewer et flux média réellement publié. La synchronisation d'une décision ne prouve pas le raccordement SFU, la sélection de couche, l'enregistrement ou le replay. Sources : [docs/rooms-place-infrastructure-contract.md](<../../rooms-place-infrastructure-contract.md>), [docs/rooms-place-video-direction.md](<../../rooms-place-video-direction.md>).

### Alternatives du moteur audio

Ne pas perdre la séparation correction navigateur openDAW/WASM, hôte natif de plugins déjà installés, et éventuel service cloud sous accord éditeur. Les recherches JUCE et le POC Steinberg Windows ne sont pas une autorisation de distribution, ni la preuve d'un moteur natif prêt pour la production. Sources : [docs/audio-engine-framework-decision.md](<../../audio-engine-framework-decision.md>), [apps/meewav-audio-engine/docs/framework-decision.md](<../../../apps/meewav-audio-engine/docs/framework-decision.md>), [docs/audio-engine-plugin-host-strategy.md](<../../audio-engine-plugin-host-strategy.md>).

## 2. Sécurité et règles métier

### Jury et calcul mixte

Décision unique à conserver : un à quatre jurés, groupes public et jury séparés, pondération mixte 50/50, impossibilité pour un seul groupe sans bulletin de déterminer seul un résultat mixte. La règle ne se résume pas à un compteur de voix.

Source historique : [HOST-CONSOLE-JURY.md](<chantier/HOST-CONSOLE-JURY.md>), ligne originale 14.

> Coulisses propose le bouton Jury. Un host sélectionne de un à quatre invités présents dans les coulisses (statuts ready/backstage), puis choisit Public, Public + jury ou Jury uniquement. Le mode mixte est fixé à 50 % par groupe à la demande de l’utilisateur. Un juré n’appartient pas simultanément au groupe public. Un groupe sans bulletin ne peut pas décider seul d’un résultat mixte.

### Identité, projections publiques et droits

Conserver l'autorité serveur pour badges, grades et écritures sensibles ; les projections publiques du profil doivent rester distinctes des données propriétaire. L'ancien audit décrit un blocage lié aux lectures iOS de profils privés : c'est un risque historique à réconcilier avec le client iOS et le serveur, pas une vulnérabilité actuelle démontrée par cette mission. Sources : [docs/backend/ARCHITECTURE.md](<../../backend/ARCHITECTURE.md>), [docs/backend/SECURITY_AND_BACKEND_READINESS.md](<chantier/docs/backend/SECURITY_AND_BACKEND_READINESS.md>), [docs/backend/PLATFORM_V1_ORCHESTRATION.md](<chantier/docs/backend/PLATFORM_V1_ORCHESTRATION.md>).

### Demandes Loge et changement de Room

Une demande de cadeau n'est ni un paiement, ni un débit, ni un droit acquis. Les invitations gardent une acceptation explicite. Préserver les contrôles d'identité, de propriété, d'accès au live, les doublons et l'idempotence lors des commandes et switches. Sources : [LOGE-VIEWER.md](<../../../LOGE-VIEWER.md>), [SWITCH-ROOM.md](<../../../SWITCH-ROOM.md>), [CAGE-BATTLE-FLOW.md](<../../../CAGE-BATTLE-FLOW.md>).

### Appairage du moteur audio

Conserver le ticket opaque à usage unique, l'expiration, l'origine exacte, les nonces, l'autorité backend et les restrictions de ports/identifiants de plugins. Aucun chemin arbitraire de plugin ou secret de vérification embarqué ne doit devenir un raccourci de réimplémentation. Source : [apps/meewav-audio-engine/docs/web-engine-contract.md](<../../../apps/meewav-audio-engine/docs/web-engine-contract.md>).

## 3. Migrations, services et état distant

Les 88 fichiers de `supabase/migrations/` restent intacts. Le registre comprend également les autres SQL, dont les migrations historiques hors chemin d'application et les contrats de tests ; aucun SQL n'est déplacé. Une mention « non appliqué » ci-dessous décrit la session de son auteur, pas un constat distant du 13 septembre.

| Migration / service cité | Information historique à conserver | Source |
|---|---|---|
| `20260908001000_loge_viewer_requests_v1.sql` | Demandes viewer Loge ; application distante et Realtime entre comptes à établir | [LOGE-VIEWER.md](<../../../LOGE-VIEWER.md>) |
| `20260908060000_rooms_shared_jury.sql` | Jury partagé et calculs pondérés ; migration annoncée non appliquée lors de la livraison | [HOST-CONSOLE-JURY.md](<chantier/HOST-CONSOLE-JURY.md>) |
| `20260908070000_rooms_cage_open_mic_battle.sql` | Transitions de scène Open Mic Battle ; état distant non établi | [HOST-CONSOLE-JURY.md](<chantier/HOST-CONSOLE-JURY.md>) |
| `20260908080000_rooms_cage_battle_roster_flow.sql` | Roster et enchaînement de la Cage ; ne pas déduire son application de sa présence dans Git | [CAGE-BATTLE-FLOW.md](<../../../CAGE-BATTLE-FLOW.md>) |
| `20260815150000_rooms_livekit_revocation_outbox_v1.sql` | File serveur de révocation LiveKit | [supabase/functions/livekit-revocation-worker/README.md](<../../../supabase/functions/livekit-revocation-worker/README.md>) |
| `20260815154500_rooms_livekit_revocation_scheduler_v1.sql` | Planificateur conditionné par extensions et Vault ; migration non fatale si prérequis absents | [supabase/functions/livekit-revocation-worker/README.md](<../../../supabase/functions/livekit-revocation-worker/README.md>) |

La révocation nécessite un worker effectivement invoqué. Le guide décrit `pg_cron`, `pg_net`, Vault et un appel alternatif par infrastructure de confiance ; réussir à appliquer une migration ne prouve pas que l'ordonnanceur fonctionne. Les fonctions Edge sont présentes sous `supabase/functions/` (LiveKit, appels Rooms, appairage audio, médias Loge/Classe/Wave). Aucun inventaire distant ni déploiement n'est effectué ici.

## 4. Configuration, stockage et exploitation

### Objets privés et traitement des médias

Préserver le flux précis : réservation avec consentement et clé d'idempotence, ticket signé pour un objet, envoi direct vers Storage privé, confirmation, file de traitement, worker autorisé, filiation des dérivés et accès viewer contrôlé. Le bucket documenté est `room-wave-private` ; la file est `wave_asset_processing_outbox_v4`. Sources : [docs/backend/WAVE_ASSET_PIPELINE_V4.md](<../../backend/WAVE_ASSET_PIPELINE_V4.md>), [docs/rooms/WAVE_PRODUCTION_V2.md](<../../rooms/WAVE_PRODUCTION_V2.md>), [docs/rooms/WAVE_VIEWER_V6.md](<../../rooms/WAVE_VIEWER_V6.md>).

### Aperçu local et production

Le port stable 5182 et le drapeau `--auth-entry-preview` concernent le développement. Ce drapeau force l'entrée d'authentification à l'actualisation de l'aperçu ; il ne décrit pas une règle de navigation de production. Source : [VERSION-VALIDEE.md](<../../../VERSION-VALIDEE.md>).

Les guides MVT/VPS conservés en archive appartiennent à l'ancien moteur et ne constituent pas une procédure de déploiement du produit actuel. Les politiques de promotion/staging sont à récupérer comme intentions de sécurité, sans affirmer l'existence d'une CI/CD. Aucun workflow `.github` suivi n'a été identifié dans le commit de référence. Sources : [docs/GLOBE_WEB_MVT_CHECKPOINT.md](<chantier/docs/GLOBE_WEB_MVT_CHECKPOINT.md>), [server/mvt-tile-server/README.md](<chantier/server/mvt-tile-server/README.md>), [docs/backend/ENVIRONMENTS_AND_RELEASES.md](<../../backend/ENVIRONMENTS_AND_RELEASES.md>).

### Variables d'environnement : index de récupération

La future liste doit être construite depuis les consommateurs réels, avec rôle, portée, caractère requis, défaut et sensibilité. Les exemples et configurations sont conservés sur place, sans recopier leurs valeurs. Les noms suivants sont seulement un index de mentions documentaires ; certains appartiennent à l'ancien moteur.

| Nom mentionné, sans valeur | Documents sources |
|---|---|
| `LIVEKIT_API_KEY` | [supabase/functions/livekit-revocation-worker/README.md](<../../../supabase/functions/livekit-revocation-worker/README.md>) |
| `LIVEKIT_API_SECRET` | [docs/ios-audio-engine-audit.md](<../../ios-audio-engine-audit.md>) ; [supabase/functions/livekit-revocation-worker/README.md](<../../../supabase/functions/livekit-revocation-worker/README.md>) |
| `LIVEKIT_REVOCATION_WORKER_SECRET` | [supabase/functions/livekit-revocation-worker/README.md](<../../../supabase/functions/livekit-revocation-worker/README.md>) |
| `LIVEKIT_SERVER_URL` | [supabase/functions/livekit-revocation-worker/README.md](<../../../supabase/functions/livekit-revocation-worker/README.md>) |
| `LIVEKIT_URL` | [supabase/functions/livekit-revocation-worker/README.md](<../../../supabase/functions/livekit-revocation-worker/README.md>) |
| `MEEWAV_ALLOWED_WEB_ORIGINS` | [docs/backend/WAVE_ASSET_PIPELINE_V4.md](<../../backend/WAVE_ASSET_PIPELINE_V4.md>) |
| `MEEWAV_AUDIO_BUILD_CONTROL_POC` | [docs/meewav-audio-bridge-autotune-2026.md](<../../meewav-audio-bridge-autotune-2026.md>) |
| `MEEWAV_AUDIO_CONTROL_ORIGIN` | [docs/meewav-audio-bridge-autotune-2026.md](<../../meewav-audio-bridge-autotune-2026.md>) |
| `MEEWAV_AUDIO_CONTROL_READY` | [apps/meewav-audio-engine/docs/windows-live-poc.md](<../../../apps/meewav-audio-engine/docs/windows-live-poc.md>) |
| `MEEWAV_AUDIO_CONTROL_SESSION_ID` | [docs/meewav-audio-bridge-autotune-2026.md](<../../meewav-audio-bridge-autotune-2026.md>) |
| `MEEWAV_AUDIO_CONTROL_SESSION_SECRET` | [docs/meewav-audio-bridge-autotune-2026.md](<../../meewav-audio-bridge-autotune-2026.md>) |
| `MEEWAV_AUDIO_ENGINE_PAIRING_SECRET` | [docs/audio-engine-room-bridge-decision.md](<../../audio-engine-room-bridge-decision.md>) |
| `MEEWAV_AUDIO_TELEMETRY` | [apps/meewav-audio-engine/docs/windows-live-poc.md](<../../../apps/meewav-audio-engine/docs/windows-live-poc.md>) |
| `MEEWAV_AUDIO_WITH_VST3_SDK` | [apps/meewav-audio-engine/docs/framework-decision.md](<../../../apps/meewav-audio-engine/docs/framework-decision.md>) ; [apps/meewav-audio-engine/docs/windows-live-poc.md](<../../../apps/meewav-audio-engine/docs/windows-live-poc.md>) ; [docs/meewav-audio-bridge-autotune-2026.md](<../../meewav-audio-bridge-autotune-2026.md>) |
| `MEEWAV_CONTRACT_VERSION` | [docs/backend/ENVIRONMENTS_AND_RELEASES.md](<../../backend/ENVIRONMENTS_AND_RELEASES.md>) |
| `MEEWAV_ENV` | [docs/backend/ENVIRONMENTS_AND_RELEASES.md](<../../backend/ENVIRONMENTS_AND_RELEASES.md>) |
| `ROOMS_DATA_LAYER_PATH` | [docs/backend/IOS_CODER_MASTER_PROMPT.md](<../../backend/IOS_CODER_MASTER_PROMPT.md>) |
| `ROOMS_LAUNCH_AUDIT` | [docs/rooms/ROOMS_FINISHING_PLAN.md](<../../rooms/ROOMS_FINISHING_PLAN.md>) |
| `ROOMS_ROOT_PATH` | [docs/backend/IOS_CODER_MASTER_PROMPT.md](<../../backend/IOS_CODER_MASTER_PROMPT.md>) |
| `SUPABASE_ANON_KEY` | [docs/backend/WAVE_ASSET_PIPELINE_V4.md](<../../backend/WAVE_ASSET_PIPELINE_V4.md>) |
| `SUPABASE_CLIENT_PATH` | [docs/backend/IOS_CODER_MASTER_PROMPT.md](<../../backend/IOS_CODER_MASTER_PROMPT.md>) |
| `SUPABASE_DB_PASSWORD` | [docsDO_NOT_USE_FOR_UI_TASKS_SUPABASE_SETUP.md](<../../../docsDO_NOT_USE_FOR_UI_TASKS_SUPABASE_SETUP.md>) |
| `SUPABASE_DB_URL` | [docsDO_NOT_USE_FOR_UI_TASKS_SUPABASE_SETUP.md](<../../../docsDO_NOT_USE_FOR_UI_TASKS_SUPABASE_SETUP.md>) |
| `SUPABASE_LOCAL_DB_URL` | [docsDO_NOT_USE_FOR_UI_TASKS_SUPABASE_SETUP.md](<../../../docsDO_NOT_USE_FOR_UI_TASKS_SUPABASE_SETUP.md>) |
| `SUPABASE_LOCAL_INBUCKET_URL` | [docsDO_NOT_USE_FOR_UI_TASKS_SUPABASE_SETUP.md](<../../../docsDO_NOT_USE_FOR_UI_TASKS_SUPABASE_SETUP.md>) |
| `SUPABASE_LOCAL_REF_OR_URL` | [docs/backend/IOS_CODER_MASTER_PROMPT.md](<../../backend/IOS_CODER_MASTER_PROMPT.md>) |
| `SUPABASE_LOCAL_STUDIO_URL` | [docsDO_NOT_USE_FOR_UI_TASKS_SUPABASE_SETUP.md](<../../../docsDO_NOT_USE_FOR_UI_TASKS_SUPABASE_SETUP.md>) |
| `SUPABASE_LOCAL_URL` | [docsDO_NOT_USE_FOR_UI_TASKS_SUPABASE_SETUP.md](<../../../docsDO_NOT_USE_FOR_UI_TASKS_SUPABASE_SETUP.md>) |
| `SUPABASE_PRODUCTION_PROJECT_REF` | [docs/backend/IOS_CODER_MASTER_PROMPT.md](<../../backend/IOS_CODER_MASTER_PROMPT.md>) |
| `SUPABASE_PROJECT_REF` | [docs/backend/IOS_CODER_MASTER_PROMPT.md](<../../backend/IOS_CODER_MASTER_PROMPT.md>) ; [docsDO_NOT_USE_FOR_UI_TASKS_SUPABASE_SETUP.md](<../../../docsDO_NOT_USE_FOR_UI_TASKS_SUPABASE_SETUP.md>) |
| `SUPABASE_PUBLISHABLE_KEY` | [docsDO_NOT_USE_FOR_UI_TASKS_SUPABASE_SETUP.md](<../../../docsDO_NOT_USE_FOR_UI_TASKS_SUPABASE_SETUP.md>) |
| `SUPABASE_SERVICE_ROLE_KEY` | [README.md](<../../../README.md>) ; [docs/backend/WAVE_ASSET_PIPELINE_V4.md](<../../backend/WAVE_ASSET_PIPELINE_V4.md>) ; [supabase/functions/livekit-revocation-worker/README.md](<../../../supabase/functions/livekit-revocation-worker/README.md>) |
| `SUPABASE_SHARED_INTEGRATION_PROJECT_REF` | [docs/backend/IOS_CODER_MASTER_PROMPT.md](<../../backend/IOS_CODER_MASTER_PROMPT.md>) |
| `SUPABASE_STAGING_PROJECT_REF` | [docs/backend/IOS_CODER_MASTER_PROMPT.md](<../../backend/IOS_CODER_MASTER_PROMPT.md>) |
| `SUPABASE_SWIFT_VERSION` | [docs/backend/IOS_CODER_MASTER_PROMPT.md](<../../backend/IOS_CODER_MASTER_PROMPT.md>) |
| `SUPABASE_URL` | [MESSAGING-WIRING-AUDIT.md](<../../../MESSAGING-WIRING-AUDIT.md>) ; [README.md](<../../../README.md>) ; [docs/backend/WAVE_ASSET_PIPELINE_V4.md](<../../backend/WAVE_ASSET_PIPELINE_V4.md>) ; [docsDO_NOT_USE_FOR_UI_TASKS_SUPABASE_SETUP.md](<../../../docsDO_NOT_USE_FOR_UI_TASKS_SUPABASE_SETUP.md>) ; [supabase/functions/livekit-revocation-worker/README.md](<../../../supabase/functions/livekit-revocation-worker/README.md>) |
| `VITE_GEO_PIPELINE_MODE` | [docs/geospatial/acceptance-report.md](<../../geospatial/acceptance-report.md>) ; [docs/geospatial/existing-cities-validation.md](<../../geospatial/existing-cities-validation.md>) ; [docs/geospatial/national-geo-pipeline-migration-plan.md](<../../geospatial/national-geo-pipeline-migration-plan.md>) ; [docs/geospatial/rollback.md](<../../geospatial/rollback.md>) ; [docs/geospatial/runtime-feature-flag.md](<../../geospatial/runtime-feature-flag.md>) |
| `VITE_MEEWAV_CONTRACT_VERSION` | [docs/backend/ENVIRONMENTS_AND_RELEASES.md](<../../backend/ENVIRONMENTS_AND_RELEASES.md>) |
| `VITE_MEEWAV_ENV` | [docs/backend/ENVIRONMENTS_AND_RELEASES.md](<../../backend/ENVIRONMENTS_AND_RELEASES.md>) |
| `VITE_MVT_TILE_URL` | [docs/GLOBE_WEB_MVT_CHECKPOINT.md](<chantier/docs/GLOBE_WEB_MVT_CHECKPOINT.md>) |
| `VITE_OPENDAW_VOICE_CORRECTION_LAB` | [docs/meewav-audio-bridge-autotune-2026.md](<../../meewav-audio-bridge-autotune-2026.md>) ; [docs/opendaw-voice-correction-poc.md](<../../opendaw-voice-correction-poc.md>) |
| `VITE_SUPABASE_ANON_KEY` | [docs/backend/ENVIRONMENTS_AND_RELEASES.md](<../../backend/ENVIRONMENTS_AND_RELEASES.md>) ; [docs/rooms/WAVE_PRODUCTION_V2.md](<../../rooms/WAVE_PRODUCTION_V2.md>) |
| `VITE_SUPABASE_URL` | [MESSAGING-WIRING-AUDIT.md](<../../../MESSAGING-WIRING-AUDIT.md>) ; [docs/backend/ENVIRONMENTS_AND_RELEASES.md](<../../backend/ENVIRONMENTS_AND_RELEASES.md>) ; [docs/rooms/WAVE_PRODUCTION_V2.md](<../../rooms/WAVE_PRODUCTION_V2.md>) |
| `VITE_USE_NATIONAL_GEO_PIPELINE` | [docs/geospatial/runtime-feature-flag.md](<../../geospatial/runtime-feature-flag.md>) |
| `VITE_USE_VECTOR_TILE_SERVER` | [docs/GLOBE_WEB_MVT_CHECKPOINT.md](<chantier/docs/GLOBE_WEB_MVT_CHECKPOINT.md>) ; [docs/geospatial/current-city-pipeline-audit.md](<../../geospatial/current-city-pipeline-audit.md>) |
| `VITE_WAVE_INFRA_MODE` | [docs/rooms/WAVE_PRODUCTION_V2.md](<../../rooms/WAVE_PRODUCTION_V2.md>) |
| `WAVE_ASSET_PIPELINE_V4` | [docs/rooms/WAVE_PRODUCTION_V2.md](<../../rooms/WAVE_PRODUCTION_V2.md>) |
| `WAVE_AUDIO_ENGINE_HEALTH_URL` | [docs/backend/WAVE_ASSET_PIPELINE_V4.md](<../../backend/WAVE_ASSET_PIPELINE_V4.md>) |
| `WAVE_AUDIO_ENGINE_RENDER_URL` | [docs/backend/WAVE_ASSET_PIPELINE_V4.md](<../../backend/WAVE_ASSET_PIPELINE_V4.md>) |
| `WAVE_AUDIO_ENGINE_URL` | [docs/backend/WAVE_ASSET_PIPELINE_V4.md](<../../backend/WAVE_ASSET_PIPELINE_V4.md>) |
| `WAVE_AUDIO_PROCESSING_DISPATCH_TOKEN` | [docs/backend/WAVE_ASSET_PIPELINE_V4.md](<../../backend/WAVE_ASSET_PIPELINE_V4.md>) |
| `WAVE_AUDIO_PROCESSING_DISPATCH_URL` | [docs/backend/WAVE_ASSET_PIPELINE_V4.md](<../../backend/WAVE_ASSET_PIPELINE_V4.md>) |
| `WAVE_AUDIO_PROCESSING_HEALTH_URL` | [docs/backend/WAVE_ASSET_PIPELINE_V4.md](<../../backend/WAVE_ASSET_PIPELINE_V4.md>) |
| `WAVE_AUDIO_PROCESSING_WORKER_URL` | [docs/backend/WAVE_ASSET_PIPELINE_V4.md](<../../backend/WAVE_ASSET_PIPELINE_V4.md>) |
| `WAVE_DEPLOYMENT_ID` | [docs/backend/WAVE_ASSET_PIPELINE_V4.md](<../../backend/WAVE_ASSET_PIPELINE_V4.md>) |
| `WAVE_HEALTH_PROBE_TOKEN` | [docs/backend/WAVE_ASSET_PIPELINE_V4.md](<../../backend/WAVE_ASSET_PIPELINE_V4.md>) |
| `WAVE_MEDIA_SFU_HEALTH_URL` | [docs/backend/WAVE_ASSET_PIPELINE_V4.md](<../../backend/WAVE_ASSET_PIPELINE_V4.md>) |
| `WAVE_REALTIME_HEALTH_URL` | [docs/backend/WAVE_ASSET_PIPELINE_V4.md](<../../backend/WAVE_ASSET_PIPELINE_V4.md>) |
| `WAVE_VIEWER_V6` | [docs/rooms/WAVE_PRODUCTION_V2.md](<../../rooms/WAVE_PRODUCTION_V2.md>) |

Les constantes et flags ressemblant à des variables sont inclus dans cet index conservatoire ; leur statut doit être établi depuis le code avant publication du catalogue de configuration.

## 5. Droits, licences et provenance

- Les instantanés géographiques portent une date, une source, une échelle et des transformations. `vendor/globe-vinyle/data/SOURCES.md` mentionne notamment Natural Earth (domaine public), des données de communes (ODbL), WGS84 et le sens de l'échelle 1:110 millions. Ne pas remplacer la provenance par un comptage actualisé.
- Les rapports `docs/geospatial/`, les contrats de données du globe et le guide de dispatch des avatars restent en place par prudence : ils peuvent être les seuls témoins d'une correction de géométrie, d'un quota, d'un nom de quartier ou d'une transformation déterministe.
- Crédits portraits Cage, sons tiers, atlas Rooms, génération des images Tremplin, décodeurs/modèles et notices du vinyle restent avec leurs ressources. Les noms fictifs des artistes ne constituent pas une attribution aux personnes photographiées.
- Les manifestes de licences des médias Scène/TV/préprofil sont conservés. Leur présence ne signifie pas automatiquement que chaque média est autorisé pour la production.
- Les accords éditeurs nécessaires aux plugins natifs/cloud, leur activation et les conditions OEM ne doivent pas être déduits de la présence d'un adaptateur ou d'un POC.

Sources protégées : [vendor/globe-vinyle/data/SOURCES.md](<../../../vendor/globe-vinyle/data/SOURCES.md>), [vendor/globe-vinyle/assets/models/README.md](<../../../vendor/globe-vinyle/assets/models/README.md>), [public/audio/rooms/twists/THIRD_PARTY_NOTICES.md](<../../../public/audio/rooms/twists/THIRD_PARTY_NOTICES.md>), [public/images/cage/portraits/CREDITS.md](<../../../public/images/cage/portraits/CREDITS.md>), [public/images/rooms/launch/ASSET.md](<../../../public/images/rooms/launch/ASSET.md>), [docs/tremplin-final-cards-images.md](<../../tremplin-final-cards-images.md>), [docs/tremplin-home-talents-image.md](<../../tremplin-home-talents-image.md>), [scripts/avatar-dispatch/DISPATCH-GUIDE.md](<../../../scripts/avatar-dispatch/DISPATCH-GUIDE.md>).

## 6. Implémentation, démonstration et roadmap

- Tremplin : les estimations `quoteOnly` ne sont pas une autorité financière. Les endpoints d'ordres/quotes décrits dans le contrat restent un contrat cible tant que l'implémentation et le déploiement ne sont pas attestés. La limite finale de 5 %, l'idempotence, le KYC serveur et l'absence de vente à découvert sont des contraintes de conception à préserver, pas une déclaration de service financier disponible. Source : [docs/tremplin/token-backend-contract.md](<../../tremplin/token-backend-contract.md>).
- Marketplace : préserver la frontière Phase A catalogue/panier/annonces/intention non financière versus paiement, commande, payout et ledger. Source : [docs/backend/MARKETPLACE_SUPABASE_SPEC.md](<../../backend/MARKETPLACE_SUPABASE_SPEC.md>), [docs/handoffs/platform-latest-reconcile/market-commerce-handoff.md](<chantier/docs/handoffs/platform-latest-reconcile/market-commerce-handoff.md>).
- Audio : un POC compilé, un signal traité localement et une voix effectivement reçue par un autre compte sont des preuves différentes. Le code comprend maintenant un client LiveKit et des publications ; l'ancien « aucun client LiveKit installé » ne doit pas être recopié. Sources : [docs/rooms-local-audio.md](<../../rooms-local-audio.md>), `package.json`, `src/features/rooms/place/placeLiveKit.service.ts`.
- TV/Scène : conserver la distinction calendrier éditorial simulé, média local, droits d'accès, transcodage, source live, enregistrement et diffusion autoritaire. Les scripts investisseurs sont des scénarios datés, jamais une preuve de mise en production. Sources : [docs/scene-acceptance-matrix.md](<chantier/docs/scene-acceptance-matrix.md>), [docs/tv-investor-demo-script.md](<chantier/docs/tv-investor-demo-script.md>), [docs/tv-editorial-policy.md](<../../tv-editorial-policy.md>).
- La version locale stabilisée ne vaut pas recette multi-utilisateurs Rooms/lives : [VERSION-VALIDEE.md](<../../../VERSION-VALIDEE.md>) indique encore des essais réels à effectuer. Aucun test produit n'est exécuté dans cette mission documentaire.

## Contradictions à transmettre à la reconstruction

1. Ancien globe canonique MapLibre versus globe vinyle réellement monté : sauvegarder les anciens guides, repartir de `MonGlobe.tsx` et `VinylGlobe.tsx`.
2. Statuts « non fusionné », anciens ports, fonctionnalités annoncées absentes : garder leur date historique, pas leur formulation comme état présent.
3. Pipeline CI/CD décrit par des politiques mais non attesté par un workflow suivi : ne pas inventer de chaîne de production.
4. Totaux géographiques divergents entre étapes : comparer les jeux chargés et leur version, sans supprimer les sources anciennes.
5. Moteur audio : présence actuelle du contrôle loopback/scanner versus descriptions de leur absence ; ne pas en déduire la disponibilité du pont audio complet.
6. Terminologie : les « sept domaines produit » d'un ancien document ne définissent pas les six piliers officiels. La reconstruction utilise `fonctionnalites`.

## Continuité entre missions

La prochaine mission doit lire ce registre, l'inventaire et les consignes actives ; travailler sur un morceau documentaire nommé ; citer ses sources de code au commit étudié ; distinguer les faits établis des inconnues ; puis attendre la validation correspondante. Aucun remplacement, guide officiel ni déplacement supplémentaire n'est autorisé par cette phase.
