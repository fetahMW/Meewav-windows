# Services externes et dépendances de Meewav

Référence : `f76bbf9c4db776c3131d2c7836374165cf6a8b93`, lecture statique du 13 septembre 2026. Ce guide identifie des dépendances et des points de raccordement dans le code. **Aucun compte, service, secret distant, migration appliquée, abonnement ou déploiement n'a été vérifié.** Aucune requête réseau n'a été faite pour cette rédaction.

Voir l'[installation](installation.md), la [configuration](configuration.md) et l'[architecture](architecture.md). Dans ce guide, « nécessaire » qualifie une fonctionnalité ; cela ne signifie pas qu'un compte actif ou un service disponible a été constaté.

## 1. Ce qui est nécessaire selon le niveau d'utilisation

| Objectif | Dépendances concernées | Limite à garder visible |
|---|---|---|
| Préparer le poste | Accès au dépôt, paquets npm Web/globe selon les verrous ; téléchargement ou cache des dépendances. | Préparation non effectuée dans cette mission. |
| Servir et afficher l'interface de base | Vite, code et ressources locales, dont le globe embarqué. | Aucun compte LiveKit, Mux ou plugin audio n'est requis pour servir ces fichiers. Le client Supabase est cependant construit et certains parcours peuvent déjà émettre des requêtes ; ce n'est pas une garantie de fonctionnement hors connexion. |
| Connexion réelle et données partagées | Supabase Auth, PostgreSQL/RPC, autorisations ; Realtime selon le parcours. | Une clé publique ne crée ni schéma, ni utilisateur, ni permission. |
| Médias réels | Supabase Storage et métadonnées ; fonctions d'autorisation pour certains médias Rooms. | La présence d'un média de démonstration ne valide pas l'envoi ou la lecture privée. |
| Participation audio/vidéo en direct et appels | Supabase pour les droits/états, fonctions Edge d'accès, LiveKit pour le média ; workers pour la révocation. | Autorisations, transport, nettoyage et réception entre comptes à tester séparément. |
| Source programme HLS Mux | Identifiant de lecture valide et source Mux disponible. | L'ingestion et la fabrication du programme ne sont pas prouvées par l'URL de lecture. |
| Traitement serveur Wave | Supabase, stockage privé, files et services de traitement/rendu, diagnostics et distribution média attendus. | La configuration attendue n'atteste pas que les workers sont livrés ou exécutés. |
| Correction audio locale avancée | Ressources openDAW du laboratoire ou moteur natif/plugins installés selon le parcours. | Bibliothèques et composants de poste, pas un service cloud universel ; droits et capacités distincts. |

## 2. Supabase : identité, données, médias et fonctions

### Auth, PostgreSQL/RPC et Realtime

Le [client partagé](../src/lib/supabaseClient.ts) utilise `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`. [AuthProvider.tsx](../src/features/auth/AuthProvider.tsx) suit la session ; [AuthPage.tsx](../src/pages/AuthPage.tsx) appelle connexion, inscription et OAuth ; [auth.service.ts](../src/features/auth/auth.service.ts) porte l'onboarding et des opérations de profil.

Le [profil](../src/features/profile/profile.service.ts), la [messagerie](../src/features/messaging/messaging.service.ts), le [Market](../src/features/market/market.service.ts), les [Rooms](../src/features/rooms/place/place.service.ts) et le [catalogue Scène](../src/features/scene/sceneCatalog.service.ts) contiennent des accès aux données et/ou RPC. Realtime synchronise notamment les états de programme via [placeProgramLayout.repository.ts](../src/features/rooms/place/placeProgramLayout.repository.ts). Ce canal de données ne transporte pas à lui seul les pistes audio/vidéo des participants.

La configuration locale est dans [supabase/config.toml](../supabase/config.toml). Les **88 migrations versionnées** sont dans [supabase/migrations/](../supabase/migrations/) ; ce nombre ne signifie pas qu'elles sont toutes appliquées à une base donnée. Les autorisations reposent aussi sur les politiques/RLS et fonctions SQL, pas uniquement sur les gardes React.

**À vérifier sur chaque cible** : identité du projet, version PostgreSQL, migrations appliquées, fonctions/RPC disponibles, droits et projections publiques/privées, publications Realtime, comptes autorisés, paramètres Auth et compatibilité des clients. Aucun environnement de staging ni contrat commun Web/iOS opérationnel n'est déduit de la seule présence des anciennes notes.

### Stockage des médias

| Usage | Point de raccordement et configuration attendue | Ce qui reste à vérifier |
|---|---|---|
| Profil et pièces média du Market | [profile.media.service.ts](../src/features/profile/profile.media.service.ts), [market.service.ts](../src/features/market/market.service.ts), bucket `profile-media`, métadonnées et URL signées selon les objets. | Bucket, politiques d'envoi/lecture, propriété, expiration et suppression effective des objets. |
| Catalogue public de La Scène | [sceneCatalog.service.ts](../src/features/scene/sceneCatalog.service.ts) lit `published_media_files` et les profils publics ; utilise une URL fournie ou signe le chemin Storage. | Publication autorisée, objets présents et lisibles, données de profil cohérentes. |
| Avant-premières Loge | [rooms-loge-preview-url](../supabase/functions/rooms-loge-preview-url/index.ts), bucket `room-loge-previews` et autorité SQL. | Contrôle d'accès et lecture temporaire entre les rôles prévus. |
| Ressources Classe | [rooms-classe-resource-url](../supabase/functions/rooms-classe-resource-url/index.ts), bucket `room-classe-resources`. | Présence des ressources, accès hôte/élève et restrictions de siège actif. |
| Assets Wave | [_shared/waveInfra.ts](../supabase/functions/_shared/waveInfra.ts), bucket `room-wave-private`, réservation/upload/confirmation et filiation des dérivés. | Bucket effectivement privé, objets autorisés, traitement des fichiers et accès viewer aux dérivés. |

Les variables serveur communes et les noms fixes sont détaillés dans la [configuration](configuration.md). Les URL signées donnent un accès temporaire à un objet ; elles ne doivent pas être prises pour des liens documentaires permanents. Les fichiers de démonstration et leurs crédits dans `public/` sont une autre catégorie de ressources.

### Inventaire des fonctions Edge présentes

**14 points d'entrée `index.ts`** sont présents. La configuration commune est `SUPABASE_URL` et, selon le rôle du client utilisé, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY`. Les noms supplémentaires renvoient au tableau de configuration. Les groupements ci-dessous ne fusionnent pas les fonctions.

| Fonction(s), avec source | Rôle et dépendance spécifique | Vérification distante manquante |
|---|---|---|
| [livekit-token](../supabase/functions/livekit-token/index.ts) | Accès RTC à une Room après résolution des droits ; URL et credentials LiveKit. | Fonction déployée, autorité SQL, permissions par rôle et jetons effectivement acceptés. |
| [livekit-revocation-worker](../supabase/functions/livekit-revocation-worker/index.ts) | Consomme la file de révocation Rooms ; secret de worker et API serveur LiveKit. | Déclenchement réel, reprises de file et révocation des participants. |
| [rooms-live-call-token](../supabase/functions/rooms-live-call-token/index.ts) | Accès aux appels Rooms privés et droits média associés. | Invitations, génération média et isolation des appels. |
| [rooms-live-call-revocation-worker](../supabase/functions/rooms-live-call-revocation-worker/index.ts) | Expiration/nettoyage des appels et actions de révocation ; secret propre. | Ordonnanceur de ce worker, expiration et nettoyage effectifs. |
| [rooms-audio-engine-pairing-ticket](../supabase/functions/rooms-audio-engine-pairing-ticket/index.ts), [rooms-audio-engine-pairing-consume](../supabase/functions/rooms-audio-engine-pairing-consume/index.ts) | Émission/consommation de tickets audio, secret d'appairage et origine autorisée. | Déploiement, ticket unique, expiration et chaîne d'association avec le poste. |
| [rooms-loge-preview-url](../supabase/functions/rooms-loge-preview-url/index.ts), [rooms-classe-resource-url](../supabase/functions/rooms-classe-resource-url/index.ts) | Autorité d'accès et URL signée d'une ressource précise. | Contrats SQL, objets privés, autorisations et expiration. |
| [rooms-wave-infra-health](../supabase/functions/rooms-wave-infra-health/index.ts) | État DB/Storage et sondes HTTP des dépendances Wave. | Endpoints, authentification des sondes et correspondance avec les services exploités. |
| [rooms-wave-asset-upload-ticket](../supabase/functions/rooms-wave-asset-upload-ticket/index.ts) | Réserve un asset et émet un ticket d'envoi signé pour un objet privé. | Autorité et contraintes d'envoi, configuration de traitement. |
| [rooms-wave-asset-upload-confirm](../supabase/functions/rooms-wave-asset-upload-confirm/index.ts) | Contrôle l'objet envoyé, confirme la mise en file, réveille éventuellement un dispatcher. | Vérification effective des octets par worker et reprise après panne. |
| [rooms-wave-asset-processing-status](../supabase/functions/rooms-wave-asset-processing-status/index.ts) | Projette l'état du traitement pour l'utilisateur autorisé. | Progrès réel de la file, erreurs et passage autorisé à l'état prêt. |
| [rooms-wave-private-audition](../supabase/functions/rooms-wave-private-audition/index.ts) | Demande une audition privée et signe un dérivé prêt ; ne mixe pas dans Edge. | Rendu serveur réellement produit, contrôle hôte et expiration. |
| [rooms-wave-viewer-media](../supabase/functions/rooms-wave-viewer-media/index.ts) | Signe un dérivé Wave prêt pour un viewer autorisé, sans distribuer l'original. | Autorité viewer, asset et comportement entre comptes. |

Les fonctions utilisent Deno et des imports `npm:` ; certains paramètres JWT de la passerelle sont suivis dans [config.toml](../supabase/config.toml). D'autres contrôles sont internes aux fonctions. Cette lecture ne constitue ni une revue exhaustive de sécurité ni une preuve de déploiement des options.

## 3. Google, Apple et livraison des emails

L'[interface Auth](../src/pages/AuthPage.tsx) accepte les fournisseurs **Google et Apple** et appelle Supabase `signInWithOAuth` avec `/globe` sur l'origine Web courante comme destination. Ces parcours requièrent un fournisseur configuré dans Supabase, les identifiants correspondants et les redirections autorisées. Aucun compte développeur, application OAuth ou secret fournisseur n'a été consulté.

La connexion/inscription email utilise également Supabase Auth. Le [modèle local](../supabase/config.toml) comporte Inbucket pour les emails locaux ; la configuration SMTP de production n'y est qu'un exemple commenté. Cela ne prouve ni un compte SendGrid, ni une livraison d'emails opérationnelle. Apple est désactivé dans ce modèle local ; les réglages hébergés peuvent différer.

**À vérifier** : domaines et URLs autorisés pour chaque environnement, fournisseur OAuth effectivement actif, identifiants côté serveur, politique de confirmation et de récupération, expéditeur et livraison email. Aucun de ces services n'est indispensable pour regarder une interface de démonstration ; ils le sont pour les parcours de compte qui les utilisent.

## 4. LiveKit : transport RTC et révocation

[placeLiveKit.service.ts](../src/features/rooms/place/placeLiveKit.service.ts) demande un accès à `livekit-token`, connecte le client `livekit-client` et gère les pistes média. Les appels privés ont leur [service média](../src/features/rooms/place/placeLiveCallMedia.service.ts) et leur [service d'invitations](../src/features/rooms/live-call/roomLiveCall.service.ts). Les deux workers utilisent `livekit-server-sdk` pour les actions serveur.

Configuration attendue : `LIVEKIT_URL` ou son alias `LIVEKIT_SERVER_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, plus les secrets des workers de révocation. Le navigateur reçoit une URL et un accès temporaires ; il ne reçoit pas le secret API serveur. Le code ne permet pas de conclure à un compte LiveKit Cloud, un serveur auto-hébergé ou une topologie TURN particulière.

La [migration de planification de révocation Rooms](../supabase/migrations/20260815154500_rooms_livekit_revocation_scheduler_v1.sql) prévoit `pg_cron`, `pg_net` et deux entrées Vault. Elle peut enregistrer un état dégradé si les prérequis manquent, et demander un ordonnanceur externe de confiance. **Appliquer la migration ne suffit donc pas à attester un worker régulièrement exécuté.** Ce mécanisme Rooms ne prouve pas que le worker distinct des appels privés est lui aussi planifié.

**À vérifier** : cible RTC, connectivité des participants, publication/réception autorisée, reconnexion, synchronisation des droits, exécution des files et retrait effectif des accès. Le live exige aussi les permissions micro/caméra et des périphériques disponibles ; ce sont des prérequis du poste, pas des services supplémentaires à souscrire.

## 5. Mux : point de lecture HLS identifié

[place.service.ts](../src/features/rooms/place/place.service.ts) lit `room_broadcasts_v2` et fabrique une URL `stream.mux.com` avec `mux_playback_id` lorsque `mux_status` vaut `active`. La [migration broadcast](../supabase/migrations/20260603123000_rooms_mux_broadcast.sql) fournit le modèle correspondant. [placeStageLayoutTile.tsx](../src/features/rooms/place/placeStageLayoutTile.tsx) contient le chemin de lecture HLS, avec hls.js selon le navigateur.

Configuration visible dans ce chemin : **données de broadcast en base**, pas une variable Web de secret Mux. hls.js est une bibliothèque de lecture ; elle ne fournit ni hébergement vidéo ni transcodage.

**À vérifier** : origine de l'identifiant de lecture, flux effectivement disponible, mode d'accès, création/alimentation du broadcast, ingestion, éventuel Egress, enregistrement et replay. Le dépôt ne démontre pas ici une chaîne automatisée LiveKit → Mux ou un compte Mux exploité. Aucun tarif, forfait ou capacité de production n'est affirmé.

## 6. Services de traitement Wave

Le client utilise [supabaseWaveInfra.ts](../src/features/rooms/wave-infra/supabaseWaveInfra.ts). Les fonctions Edge attendent des services de **traitement asynchrone**, de **rendu audio**, de **Realtime** et de **distribution média/SFU**. Les URLs et les jetons de diagnostic/dispatch sont détaillés dans la [configuration](configuration.md) ; les noms ne désignent pas à eux seuls un fournisseur commercial déterminé.

Le flux identifiable est : réservation autorisée → ticket signé → envoi vers Storage privé → confirmation → file durable de traitement → dérivés prêts → lecture autorisée. La confirmation peut envoyer un POST de réveil à `WAVE_AUDIO_PROCESSING_DISPATCH_URL`. En revanche, la présence de `WAVE_AUDIO_PROCESSING_WORKER_URL` sert ici à vérifier une configuration ; elle ne déclenche pas à elle seule l'exécution du worker. De même, la fonction d'audition vérifie la capacité de rendu et signe un dérivé existant, sans exécuter elle-même le mixage.

[rooms-wave-infra-health](../supabase/functions/rooms-wave-infra-health/index.ts) combine accès DB/Storage, URLs configurées et sondes de santé. Le champ `productionReady` décrit le résultat de ce contrat lorsqu'il s'exécute ; il n'est ni un label de validation documentaire ni une preuve de qualité musicale ou de traitement complet des fichiers.

**À vérifier** : implémentations réellement livrées des workers/rendeurs, versions, hébergement, consommation des files, autorisations, gestion des erreurs, génération et filiation des dérivés, nettoyage des objets et distribution audible. L'adaptateur `local-explicit` ne simule pas leur disponibilité ; il refuse les commandes critiques concernées.

## 7. Bibliothèques et composants audio : dépendances distinctes des services hébergés

| Composant | Usage et raccordement | Configuration / vérification restante |
|---|---|---|
| openDAW/WASM | Dépendances npm et ressources de [audio-lab-public](../audio-lab-public/), servies conditionnellement par [Vite](../vite.config.js). | Mode `audio-lab`, flag vocal, assets présents. Le [manifeste](../audio-lab-public/opendaw-wasm/0.0.11/manifest.json) indique `internal-prototype-only` et `productionApproved: false` : ne pas confondre disponibilité technique et droit d'exploitation. |
| Moteur audio natif Meewav | C++/CMake, contrôle loopback via [audioEngine.client.ts](../src/features/rooms/audio-engine/audioEngine.client.ts) et appairage Edge. | Binaire local, association autorisée, compatibilité de version et plugin ; aucun installateur opérationnel n'est attesté par ce guide. Le [pont générique](../apps/meewav-audio-engine/src/bridge/AudioBridge.h) reste distinct du contrôle. |
| JUCE et SDK Steinberg VST3 | Options de [CMakeLists.txt](../apps/meewav-audio-engine/CMakeLists.txt), sources externes conditionnelles. | Choix de build, SDK et droits. Le chemin JUCE s'arrête explicitement faute d'adaptateur ; les POC VST3 actuels sont Windows. |
| Auto-Tune, Voloco, Spoton, Graillon | Profils et liens éditeurs dans [PlacePluginManager.tsx](../src/features/rooms/place/PlacePluginManager.tsx), découverte locale dans [audio-lab-native-monitor.mjs](../scripts/audio-lab-native-monitor.mjs). | Détection, prise en charge effective, activation/licence du plugin sur le poste. Un lien éditeur ou un profil reconnu ne prouve pas une intégration cloud ni un accord de distribution. |

React, Three.js, Supabase JS, LiveKit client et hls.js sont également des dépendances logicielles définies dans les manifestes et verrous. Elles ne constituent pas autant de comptes SaaS à ouvrir. Le téléchargement des paquets à l'installation est distinct du trafic de l'application en fonctionnement.

## 8. Ressources distantes de démonstration et données géographiques

### Images et liens visibles

- `images.unsplash.com` est référencé dans les [fixtures des outils Rooms](../src/features/rooms/tools/roomTools.fixtures.ts) et [ClassSeatsPanel.tsx](../src/features/rooms/tools/panels/ClassSeatsPanel.tsx).
- `i.pravatar.cc` apparaît dans [messagingDemoData.ts](../src/features/messaging/messagingDemoData.ts) pour des portraits de démonstration. Ces images peuvent dépendre du réseau même lorsqu'un parcours utilise des données locales. Aucune clé de service n'est lue pour ces URLs.
- Le [catalogue Scène](../src/features/scene/sceneCatalog.service.ts) peut utiliser des URLs média fournies dans les enregistrements : leurs domaines et disponibilité ne sont pas déterminables intégralement depuis les sources.
- Les liens `meewav.com` des [données de démonstration Scène](../src/features/shorts/shorts-wall-data.ts) sont des destinations, pas une preuve d'hébergement de cette version. Les liens des éditeurs audio, les domaines d'exemple et les espaces de noms SVG ne sont pas des API produit supplémentaires.

**À vérifier avant une exploitation réelle** : disponibilité des ressources, compatibilité avec les en-têtes d'isolation navigateur et droits/provenances. Les notices existantes sont conservées ; cette mission ne réattribue aucun média et ne conclut pas à une licence obtenue depuis une simple URL.

### Géographie active, ancien moteur et outils de fabrication

Le globe actif lit les ressources de [vendor/globe-vinyle](../vendor/globe-vinyle/) servies par [vinyl-globe.mjs](../scripts/vinyl-globe.mjs). La géographie d'inscription utilise le même ensemble via [vinylGlobeGeography.ts](../src/features/auth/vinylGlobeGeography.ts). Les [sources et provenances](../vendor/globe-vinyle/data/SOURCES.md) restent protégées.

Les dépendances suivantes sont identifiées dans les anciens chemins cartographiques ou dans des outils de génération ; elles ne sont pas à provisionner pour démarrer le globe actuel :

| Source/service | Raccordement identifié | Configuration et limite |
|---|---|---|
| OpenFreeMap et tuiles d'élévation hébergées sur S3 | [meewavMapLibreStyle.ts](../src/features/globe/maplibre/meewavMapLibreStyle.ts), [niceJuraTerrain.ts](../src/features/globe/maplibre/terrain/niceJuraTerrain.ts), [generate-castle-hill-dem.mjs](../scripts/generate-castle-hill-dem.mjs). | URLs de ressources dans les sources ; cela ne prouve pas un compte AWS Meewav. Chemins hérités/outillage, disponibilité non interrogée. |
| API géographique de l'État et Géoplateforme/IGN | [generate-france-urban-areas.ts](../scripts/generate-france-urban-areas.ts), [generate-lille-metropole-communes.ts](../scripts/generate-lille-metropole-communes.ts), autres générateurs de villes. | URLs/datasets des scripts et options d'outil ; fraîcheur et droits des données à réconcilier avant régénération. |
| Portails open data territoriaux : Lyon, Lille, Nantes, Marseille, Nice, Saint-Quentin-en-Yvelines | Générateurs [Lyon](../scripts/generate-lyon-districts.ts), [Lille](../scripts/generate-lille-metropole-communes.ts), [Nantes](../scripts/generate-nantes-districts.ts), [Marseille](../scripts/generate-marseille-districts.ts), [Nice](../scripts/generate-nice-districts.ts), [Trappes](../scripts/generate-trappes-districts.ts). | Endpoints publics inscrits dans les outils ; une modification de leur format peut affecter une future génération, pas le service local des assets déjà préparés. |
| France GeoJSON et ressources sur GitHub | [generate-france-region-plates.ts](../scripts/generate-france-region-plates.ts), [generate-seine-saint-denis-boundary.ts](../scripts/generate-seine-saint-denis-boundary.ts). | Téléchargements de fabrication, distincts de GitHub comme hébergeur du dépôt. Versions/provenances à préserver. |
| Wikipédia | [fetch-landmark-anchors.mjs](../scripts/fetch-landmark-anchors.mjs), récupération de coordonnées de monuments. | API de génération ; ni génération ni requête exécutée ici. |
| Serveur MVT/PostGIS historique | [server/mvt-tile-server/index.js](../server/mvt-tile-server/index.js), option `--legacy-globe-tiles` du [lanceur](../scripts/start-development.mjs). | Variables PostgreSQL/outillage décrites dans la configuration. Composant local ou déployable séparément, pas service obligatoire du renderer actif. |

Les noms Mapbox présents dans l'ancien modèle d'environnement ne suffisent pas à établir une dépendance active à Mapbox. Aucun jeton Mapbox n'est requis par le chemin du globe vinyle décrit ici.

## 9. Ce qui n'est pas établi par cette cartographie

- Le modèle [Supabase](../supabase/config.toml) mentionne aussi l'assistance OpenAI de Studio et des options désactivées/expérimentales : Twilio, Apple, S3, autres exemples d'identité. Leur présence n'atteste pas un service produit actif, un abonnement ou un compte Meewav auprès de ces fournisseurs.
- Les UX **Marketplace et Tremplin sont implémentées** ; activation nationale prévue en **phase 2** et **phase 3** par choix de roadmap. Les limites du [checkout Market](../src/features/market/MarketPage.tsx) et les [flags Tremplin](../src/features/tremplin/tremplinFeatureFlags.ts) ne permettent d'affirmer ni paiements, ni séquestre, ni API financière opérationnels. Aucun prestataire de paiement actif n'est identifié dans ces raccordements.
- Git et les verrous de dépendances décrivent des sources, pas un hébergeur de production. Aucun workflow GitHub suivi n'est présent au checkpoint. Une CI/CD externe est possible, mais non attestée ; aucune chaîne de déploiement automatique n'est inventée ici.
- Les comptes, domaines d'exploitation, régions, plans commerciaux, limites de capacité, facturation, sauvegardes et procédures de reprise des services distants restent inconnus de cette analyse statique.

## État de vérification et suite

Points d'entrée, variables, appels, modèles et liens vers les sources examinés statiquement. Aucun endpoint de santé n'a été appelé, aucun service lancé et aucun compte connecté pendant la mission. Les tests multi-utilisateurs Rooms/lives, l'état des migrations, le déploiement des fonctions et l'exploitation des workers restent à établir par des preuves datées, dans une mission autorisée séparément.
