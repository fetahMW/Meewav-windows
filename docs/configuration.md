# Configurer Meewav

Référence : `f76bbf9c4db776c3131d2c7836374165cf6a8b93`, lecture statique du 13 septembre 2026. Les tableaux partent des consommateurs du code et des modèles suivis. **Aucun fichier local de secrets n'a été ouvert ; aucune valeur réelle de clé, jeton ou mot de passe n'est reproduite.** Aucun service n'a été interrogé ou reconfiguré.

Lire d'abord l'[installation](installation.md). Le guide des [services externes](services-externes.md) relie ces réglages aux capacités concernées.

## 1. Où les réglages sont chargés

### Frontend et lanceurs

[vite.config.js](../vite.config.js) fixe le dossier d'environnement ainsi :

- En mode `audio-lab`, `envDir` est la racine de cette copie du projet.
- Dans les autres modes, le code cherche d'abord `.env.local` ou `.env` à cette racine, puis **deux niveaux au-dessus**. Il retient le premier dossier trouvé, sinon la racine du projet. Malgré le nom interne `canonicalCheckoutRoot`, ce calcul de chemin ne garantit pas que le second dossier soit le dépôt canonique sur chaque poste.
- Vite reçoit le mode et charge l'environnement depuis ce dossier. [.env.audio-lab](../.env.audio-lab) est suivi et ne contient que l'activation du laboratoire vocal. Le choix d'`envDir` **n'est pas un mécanisme garantissant l'exclusion des autres fichiers locaux ou des variables héritées du processus**. Le commentaire « isolé » ne prouve pas un environnement sans secrets ni appels distants.

Les noms `VITE_*` lus par le frontend doivent être considérés comme **exposés au navigateur**, y compris dans les bundles produits. Une URL de service n'est pas un secret d'authentification ; elle peut néanmoins révéler une cible interne. Ne jamais y mettre de clé serveur.

[start-development.mjs](../scripts/start-development.mjs) transmet l'environnement du processus à Vite mais **réécrit les quatre flags d'aperçu** : entrée auth, Rooms, accueil Rooms et Classe. Avec ce lanceur, leur valeur dépend des arguments reçus (`true` si présents, `false` sinon). Le mode et les ports des scripts sont listés dans [package.json](../package.json).

### Backend et natif

Les fonctions Edge lisent `Deno.env` dans leur propre environnement serveur. Un nom sans préfixe `VITE_` n'est pas automatiquement configuré à distance parce qu'un fichier existe sur le poste. [supabase/config.toml](../supabase/config.toml) décrit la configuration locale Supabase et certaines options de fonctions, pas un inventaire du projet hébergé.

Le POC natif Windows lit des variables du **processus natif**. Ses options CMake sont, elles, des paramètres de compilation ; les mettre dans un `.env` Web ne les active pas.

## 2. Variables du frontend actif

« Requis » signifie nécessaire au parcours indiqué, pas que Vite refuse toujours de démarrer sans la valeur. Les flags attendent généralement la chaîne exacte `true`, sauf exception mentionnée.

| Nom exact | Rôle / valeur interprétée | Fichier lecteur | Côté | Requis ou conditionnel | Sensibilité |
|---|---|---|---|---|---|
| `VITE_SUPABASE_URL` | URL du projet Supabase ; une URL distante est codée en secours si absente. | [supabaseClient.ts](../src/lib/supabaseClient.ts) | Navigateur | À définir explicitement pour viser le bon backend. | Adresse exposée ; ne pas y inclure d'identifiants. |
| `VITE_SUPABASE_ANON_KEY` | Clé publique client ; vide entraîne un avertissement et un marqueur invalide. | [supabaseClient.ts](../src/lib/supabaseClient.ts) | Navigateur | Nécessaire aux appels Supabase réels. | Publique par conception, jamais `service_role` ; aucune valeur reproduite ici. |
| `VITE_AUTH_ENTRY_PREVIEW` | `true` force `/auth` au chargement du document, uniquement en développement. | [main.tsx](../src/main.tsx) | Navigateur, fourni par lanceur | Option `--auth-entry-preview` ; défaut du lanceur `false`. | Non secrète. |
| `VITE_ROOMS_WORKSPACE_PREVIEW` | Aperçu Rooms élargi, borné à `DEV`. | [App.tsx](../src/App.tsx) | Navigateur, fourni par lanceur | `--rooms-workspace-preview` ; défaut `false`. | Non secrète ; change les gardes d'interface. |
| `VITE_ROOMS_HOME_WORKSPACE_PREVIEW` | Aperçu d'accueil Rooms et usages du profil liés à cet aperçu. | [App.tsx](../src/App.tsx), [profile.preview.ts](../src/features/profile/profile.preview.ts) | Navigateur, fourni par lanceur | `--rooms-home-workspace-preview` ; défaut `false`. | Non secrète ; mode de démonstration. |
| `VITE_CLASSE_WORKSPACE_PREVIEW` | Frontière d'aperçu Classe en développement. | [App.tsx](../src/App.tsx) | Navigateur, fourni par lanceur | `--classe-workspace-preview` ; défaut `false`. | Non secrète. |
| `VITE_OPENDAW_VOICE_CORRECTION_LAB` | Active les entrées de correction vocale lorsque `MODE === "audio-lab"`. | [voiceCorrection.flags.ts](../src/features/rooms/voice-correction/voiceCorrection.flags.ts), [App.tsx](../src/App.tsx) | Navigateur | Laboratoire seulement ; `true` dans le fichier de mode suivi. | Non secrète ; ne vaut pas autorisation commerciale. |
| `VITE_WAVE_INFRA_MODE` | `local-explicit` choisit l'adaptateur local ; toute autre valeur choisit `production`. | [wave-infra/index.ts](../src/features/rooms/wave-infra/index.ts) | Navigateur | Conditionnel au travail Wave ; `production` par défaut. | Non secrète ; le nom du mode n'atteste aucun déploiement. |
| `VITE_MARKET_DEMO_FALLBACK` | `true` en développement sélectionne explicitement `demo` ; l'aperçu local peut aussi le sélectionner. | [market.flags.ts](../src/features/market/market.flags.ts) | Navigateur | Option de démonstration ; sinon `supabase`. | Non secrète. |
| `VITE_MESSAGING_DEMO_FALLBACK` | Même sélection explicite pour la messagerie ; pas de repli automatique après erreur serveur. | [messaging.flags.ts](../src/features/messaging/messaging.flags.ts) | Navigateur | Option de démonstration ; sinon `supabase`. | Non secrète. |
| `VITE_PROFILE_DEMO_FALLBACK` | Autorise des données de démonstration de profil en `DEV`, notamment médias/statistiques/classement. | [ProfilePage.tsx](../src/features/profile/ProfilePage.tsx), [profile.analytics.service.ts](../src/features/profile/profile.analytics.service.ts), [profile.ranking.service.ts](../src/features/profile/profile.ranking.service.ts), [ProfileMediaView.tsx](../src/features/profile/views/ProfileMediaView.tsx) | Navigateur | Option ; les aperçus locaux constituent aussi une condition distincte. | Non secrète. |
| `VITE_PROFILE_PRIVATE_DEMO` | Autorise la démonstration du profil privé en `DEV`. | [profile.private.service.ts](../src/features/profile/profile.private.service.ts) | Navigateur | Option ; modèle suivi à `false`. | Non secrète ; les données privées réelles restent protégées côté serveur. |

`DEV`, `MODE` et `BASE_URL` sont des valeurs fournies par Vite, pas trois secrets à obtenir. `BASE_URL` sert notamment aux ressources du [globe](../src/features/globe/VinylGlobe.tsx) et à la [géographie d'inscription](../src/features/auth/vinylGlobeGeography.ts).

Exemple **entièrement fictif**, qui ne connecte aucun service réel :

```dotenv
# Exemple à remplacer avec les valeurs publiques de l'environnement autorisé.
VITE_SUPABASE_URL=https://projet-fictif.invalid
VITE_SUPABASE_ANON_KEY=EXEMPLE_FICTIF_NON_FONCTIONNEL
VITE_WAVE_INFRA_MODE=local-explicit
```

Ce n'est pas une configuration hors connexion globale. Les services autres que l'adaptateur Wave peuvent encore effectuer des requêtes. Pour un parcours réel, il faut un backend et des permissions effectivement disponibles.

## 3. Variables serveur des fonctions Edge

Les lecteurs ci-dessous utilisent soit `Deno.env.get`, soit [requiredEnvironment](../supabase/functions/_shared/audioPairing.ts). Les dépendances communes sont aussi utilisées par les fonctions de médias via [_shared/waveInfra.ts](../supabase/functions/_shared/waveInfra.ts).

| Nom exact | Rôle | Fichier lecteur / raccordement | Côté | Requis ou conditionnel | Sensibilité |
|---|---|---|---|---|---|
| `SUPABASE_URL` | Cible de l'autorité de données et Auth. | [livekit-token](../supabase/functions/livekit-token/index.ts), [waveInfra](../supabase/functions/_shared/waveInfra.ts), [pairing-ticket](../supabase/functions/rooms-audio-engine-pairing-ticket/index.ts) | Serveur Edge | Requis pour ces fonctions. | Adresse ; distincte de la configuration Web. |
| `SUPABASE_ANON_KEY` | Client authentifié avec le JWT de l'appelant. | [livekit-token](../supabase/functions/livekit-token/index.ts), [waveInfra](../supabase/functions/_shared/waveInfra.ts) | Serveur Edge | Requis par les fonctions concernées, pas par tous les workers. | Clé publique ; aucune valeur ici. |
| `SUPABASE_SERVICE_ROLE_KEY` | Appels d'autorité réservés au serveur, lectures et signatures Storage. | [waveInfra](../supabase/functions/_shared/waveInfra.ts), [pairing-consume](../supabase/functions/rooms-audio-engine-pairing-consume/index.ts), [worker de révocation](../supabase/functions/livekit-revocation-worker/index.ts) | Serveur Edge | Requis par ces chemins. | **Secret privilégié, jamais dans le frontend.** |
| `MEEWAV_ALLOWED_WEB_ORIGINS` | Liste d'origines exactes séparées par des virgules ; liste vide par défaut. | [audioPairing.ts](../supabase/functions/_shared/audioPairing.ts), [waveInfra.ts](../supabase/functions/_shared/waveInfra.ts), [pairing-ticket](../supabase/functions/rooms-audio-engine-pairing-ticket/index.ts) | Serveur Edge | Nécessaire aux requêtes navigateur autorisées de ces fonctions. | Non secrète, mais frontière de sécurité. |
| `LIVEKIT_URL` | URL du serveur RTC ; les émetteurs de jetons attendent `ws:`/`wss:`. Le chemin appels exige WSS hors loopback. | [livekit-token](../supabase/functions/livekit-token/index.ts), [rooms-live-call-token](../supabase/functions/rooms-live-call-token/index.ts) | Serveur Edge, URL renvoyée au Web | Requise pour RTC ; priorité sur l'alias suivant. | Adresse exposable, sans identifiants intégrés. |
| `LIVEKIT_SERVER_URL` | Alias utilisé seulement si `LIVEKIT_URL` manque. | [livekit-token](../supabase/functions/livekit-token/index.ts), [worker d'appels](../supabase/functions/rooms-live-call-revocation-worker/index.ts) | Serveur Edge | Alternative, pas une deuxième instance à configurer. | Même traitement que `LIVEKIT_URL`. |
| `LIVEKIT_API_KEY` | Identifiant API pour signer les accès et administrer les Rooms. | [livekit-token](../supabase/functions/livekit-token/index.ts), [worker de révocation](../supabase/functions/livekit-revocation-worker/index.ts) | Serveur Edge | Requis pour RTC et révocation. | Identifiant de credential serveur ; conserver côté serveur avec le secret. |
| `LIVEKIT_API_SECRET` | Secret de signature et d'administration LiveKit. | [livekit-token](../supabase/functions/livekit-token/index.ts), [worker de révocation](../supabase/functions/livekit-revocation-worker/index.ts) | Serveur Edge | Requis. | **Secret.** |
| `LIVEKIT_REVOCATION_WORKER_SECRET` | Authentifie le déclenchement du worker de révocation Rooms, au moins 32 caractères. | [livekit-revocation-worker](../supabase/functions/livekit-revocation-worker/index.ts) | Serveur Edge / ordonnanceur | Requis pour ce worker. | **Secret partagé**, différent d'un JWT utilisateur. |
| `LIVE_CALL_REVOCATION_WORKER_SECRET` | Même responsabilité pour les appels privés, au moins 32 caractères. | [rooms-live-call-revocation-worker](../supabase/functions/rooms-live-call-revocation-worker/index.ts) | Serveur Edge / ordonnanceur | Requis pour ce worker distinct. | **Secret partagé.** |
| `MEEWAV_AUDIO_ENGINE_PAIRING_SECRET` | Signe/vérifie les tickets d'appairage audio. | [pairing-ticket](../supabase/functions/rooms-audio-engine-pairing-ticket/index.ts), [pairing-consume](../supabase/functions/rooms-audio-engine-pairing-consume/index.ts) | Serveur Edge | Requis pour l'appairage. | **Secret backend**, pas le secret de session natif. |

Les contrôles de CORS et de JWT ne sont pas uniformes entre toutes les fonctions. `MEEWAV_ALLOWED_WEB_ORIGINS` n'est pas une protection globale à supposer sur chaque endpoint ; voir les lecteurs cités et `verify_jwt` dans la configuration Supabase.

### Traitement et diagnostic Wave

Toutes ces variables sont **côté serveur Edge**. Une URL configurée n'atteste ni un worker actif ni un rendu disponible.

| Nom exact | Rôle / lecteur | Requis ou conditionnel | Sensibilité |
|---|---|---|---|
| `WAVE_AUDIO_PROCESSING_WORKER_URL` | Présence d'un service de traitement vérifiée par [upload-ticket](../supabase/functions/rooms-wave-asset-upload-ticket/index.ts), [upload-confirm](../supabase/functions/rooms-wave-asset-upload-confirm/index.ts), [processing-status](../supabase/functions/rooms-wave-asset-processing-status/index.ts). Ces chemins ne font pas un appel de traitement à cette URL. | Au moins cette URL ou l'URL de dispatch pour ces parcours. | Adresse serveur ; pas un secret. |
| `WAVE_AUDIO_PROCESSING_DISPATCH_URL` | Alternative de configuration ; [upload-confirm](../supabase/functions/rooms-wave-asset-upload-confirm/index.ts) y envoie aussi un POST de réveil après mise en file. | Conditionnel ; le réveil est effectué au mieux, la file SQL reste la référence. | Adresse serveur. |
| `WAVE_AUDIO_PROCESSING_DISPATCH_TOKEN` | Bearer du POST de réveil dans [upload-confirm](../supabase/functions/rooms-wave-asset-upload-confirm/index.ts). | Facultatif dans le code ; requis si le destinataire l'exige. | **Secret.** |
| `WAVE_AUDIO_ENGINE_RENDER_URL` | Déclare la capacité de rendu pour [private-audition](../supabase/functions/rooms-wave-private-audition/index.ts) et [infra-health](../supabase/functions/rooms-wave-infra-health/index.ts). La fonction d'audition signe un dérivé existant, elle ne rend pas les stems elle-même. | Requise ou alias suivant pour annoncer cette capacité. | Adresse serveur. |
| `WAVE_AUDIO_ENGINE_URL` | Alias de capacité de rendu, mêmes lecteurs. | Utilisé si l'URL précédente n'est pas configurée. | Adresse serveur. |
| `WAVE_REALTIME_HEALTH_URL` | Sonde HTTP de santé Realtime dans [infra-health](../supabase/functions/rooms-wave-infra-health/index.ts). | Requise par son contrat de disponibilité complète. | Adresse serveur. |
| `WAVE_AUDIO_PROCESSING_HEALTH_URL` | Sonde HTTP du traitement audio, même lecteur. | Requise par ce contrat. | Adresse serveur. |
| `WAVE_AUDIO_ENGINE_HEALTH_URL` | Sonde HTTP du moteur de rendu, même lecteur. | Requise par ce contrat. | Adresse serveur. |
| `WAVE_MEDIA_SFU_HEALTH_URL` | Sonde HTTP de distribution média, même lecteur. | Requise par ce contrat ; fournisseur non déduit du nom. | Adresse serveur. |
| `WAVE_HEALTH_PROBE_TOKEN` | Bearer commun aux sondes GET d'[infra-health](../supabase/functions/rooms-wave-infra-health/index.ts). | Facultatif dans le code ; dépend de l'authentification des sondes. | **Secret.** |
| `WAVE_DEPLOYMENT_ID` | Identifiant retourné par [infra-health](../supabase/functions/rooms-wave-infra-health/index.ts), sinon `null`. | Facultatif. | Non secret ; une chaîne seule ne prouve pas un déploiement. |

Les sondes imposent une URL HTTPS, avec exception locale dans le code, un délai de 2,5 s et le refus des redirections. Leur résultat et la présence d'une configuration restent à distinguer d'un essai audio de bout en bout.

## 4. Options internes : ni variables d'environnement ni calendrier produit

| Nom / emplacement | Rôle et état lu | Côté / condition | Sensibilité |
|---|---|---|---|
| `TREMPLIN_FEATURE_FLAGS` : `demoMode`, `apiTransactions`, `reciprocalArtistDiscovery`, `reciprocalSupportIdentityConsent`, `sponsoredEditorialModules`, `productAnalytics`, `tokenSuspensionState` | Dans [tremplinFeatureFlags.ts](../src/features/tremplin/tremplinFeatureFlags.ts), `demoMode` et `productAnalytics` sont à `true`, les autres à `false`. | Constantes navigateur ; modifier un `.env` ne les change pas. | Non secrètes ; `productAnalytics` ne prouve pas un fournisseur SaaS. |
| `checkoutEnabled={!marketLive.active}` | Désactive le checkout du parcours Market raccordé ; voir [MarketPage.tsx](../src/features/market/MarketPage.tsx) et [MarketCartPanel.tsx](../src/features/market/MarketCartPanel.tsx). | Option de composant navigateur, pas configuration d'un paiement distant. | Non secrète. |
| `meewav:local-auth-preview` | État d'aperçu stocké dans `sessionStorage`. Le mode `tremplin` le considère actif en développement ; d'autres parcours peuvent l'activer sur un hôte local. | [localAuthPreview.ts](../src/features/auth/localAuthPreview.ts), navigateur. | Identité de démonstration, pas credential ni compte réel. |
| `DEFAULT_AUDIO_ENGINE_PORTS` | Ports loopback `47191`, `47192`, `47193` et endpoint `http://127.0.0.1:<port>/v1`. | [audioEngine.client.ts](../src/features/rooms/audio-engine/audioEngine.client.ts), navigateur ; appairage natif seulement. | Non secret ; restrictions d'endpoint à conserver. |
| `WAVE_PRIVATE_BUCKET` | Nom fixe `room-wave-private`, contrôlé comme privé par les fonctions concernées. | [_shared/waveInfra.ts](../supabase/functions/_shared/waveInfra.ts), serveur. | Nom non secret ; les objets et URL signées peuvent être privés. |

**Les UX Marketplace et Tremplin sont implémentées.** Leur non-activation au lancement national est une décision de roadmap : Marketplace en **phase 2**, Tremplin en **phase 3**. Ces phases ne sont pas des valeurs calculées à partir des flags ; transactions réelles et services restent à vérifier séparément.

## 5. Réglages natifs et du laboratoire

### Variables réellement lues

| Nom exact | Rôle / lecteur | Côté | Requis ou conditionnel | Sensibilité |
|---|---|---|---|---|
| `MEEWAV_AUDIO_CONTROL_SESSION_ID` | Identifiant de session du [POC loopback Windows](../apps/meewav-audio-engine/src/poc/windows/LocalControlPocMain.cpp). | Natif | Requis pour ce POC. | Identifiant de session ; ne pas recopier une session réelle. |
| `MEEWAV_AUDIO_CONTROL_SESSION_SECRET` | Secret éphémère, 32 octets encodés base64url, même lecteur. | Natif | Requis pour ce POC. | **Secret de session**, distinct du secret de signature Edge. |
| `MEEWAV_AUDIO_CONTROL_ORIGIN` | Origine Web exacte autorisée, même lecteur. | Natif | Requise pour ce POC. | Non secrète, contrôle de sécurité. |
| `MEEWAV_AUDIO_CONTROL_PORT` | Port d'écoute ; défaut `47191`, même lecteur. | Natif | Facultatif ; doit rester compatible avec les ports permis du client Web. | Non secret. |
| `VST3_PATH` | Emplacements supplémentaires de plugins VST3. | [audio-lab-native-monitor.mjs](../scripts/audio-lab-native-monitor.mjs), serveur Vite local | Facultatif, pour le laboratoire natif. | Chemins de poste potentiellement personnels. |
| `VST2_PATH`, `VST_PATH` | Emplacements VST2, avec repli du premier sur le second. | [audio-lab-native-monitor.mjs](../scripts/audio-lab-native-monitor.mjs), serveur Vite local | Facultatifs ; découverte d'un fichier ne prouve pas son hébergement audio. | Chemins de poste. |
| `ProgramFiles`, `ProgramFiles(x86)`, `CommonProgramFiles`, `CommonProgramFiles(x86)`, `LOCALAPPDATA`, `APPDATA`, `USERPROFILE`, `SystemDrive` | Racines Windows utilisées pour chercher les plugins ; fournies habituellement par le système. | [audio-lab-native-monitor.mjs](../scripts/audio-lab-native-monitor.mjs) ; `ProgramFiles` et `LOCALAPPDATA` aussi dans [StandardPluginLocations.cpp](../apps/meewav-audio-engine/src/plugins/StandardPluginLocations.cpp) | Conditionnelles à l'OS ; ne pas les détourner pour configurer Meewav. | Chemins personnels possibles. |
| `HOME` | Racine utilisateur pour les plugins macOS dans [StandardPluginLocations.cpp](../apps/meewav-audio-engine/src/plugins/StandardPluginLocations.cpp). | Natif | Conditionnel à macOS ; variable système. | Chemin personnel. |

`MEEWAV_AUDIO_TELEMETRY`, cité dans les anciennes notes, est un marqueur de sortie dans [LiveAudioPocMain.cpp](../apps/meewav-audio-engine/src/poc/windows/LiveAudioPocMain.cpp), pas une variable d'environnement lue pour activer le moteur.

### Options de compilation

Tous les noms suivants sont définis dans [CMakeLists.txt](../apps/meewav-audio-engine/CMakeLists.txt). Ils concernent le build natif et ne sont pas des secrets.

| Nom exact | Défaut | Rôle / condition |
|---|---|---|
| `MEEWAV_AUDIO_BUILD_ENGINE` | `ON` | Construire le processus moteur. |
| `MEEWAV_AUDIO_BUILD_SCANNER` | `ON` | Construire le scanner de plugins. |
| `MEEWAV_AUDIO_BUILD_TESTS` | `OFF` | Construire les tests internes, option distincte de leur exécution. |
| `MEEWAV_AUDIO_BUILD_CONTROL_POC` | `OFF` | Construire le POC loopback, Windows seulement. |
| `MEEWAV_AUDIO_WITH_JUCE` | `OFF` | Chemin incomplet : erreur explicite même si les sources JUCE sont trouvées. |
| `MEEWAV_AUDIO_WITH_VST3_SDK` | `OFF` | Ajouter le SDK et les POC VST3 Windows. |
| `MEEWAV_JUCE_SOURCE_DIR` | Vide | Chemin de sources JUCE autorisées ; ne supprime pas l'absence de l'adaptateur. |
| `MEEWAV_VST3_SDK_DIR` | Vide | Chemin du SDK approuvé, requis lorsque son option est activée. |

La présence de ces options ne délivre aucune licence JUCE, Steinberg ou plugin tiers. Les notices et crédits restent les références à préserver.

## 6. Réglages de services : configuration locale et état distant séparés

| Réglage exact ou objet | Source | Portée / nécessité | Sensibilité et point restant à vérifier |
|---|---|---|---|
| `[api].port = 54321`, `[db].port = 54322`, `[db].major_version = 17`, `[studio].port = 54323`, `[inbucket].port = 54324` | [supabase/config.toml](../supabase/config.toml) | Configuration locale proposée pour Supabase, distincte des ports Vite. | Non secrets ; aucune instance locale démarrée, version distante non attestée. |
| `[auth].site_url`, `additional_redirect_urls` | [supabase/config.toml](../supabase/config.toml) | Valeurs locales suivies sur le port `3000`, à réconcilier avec l'URL de travail. [AuthPage.tsx](../src/pages/AuthPage.tsx) demande une redirection OAuth vers `/globe` sur l'origine courante. | Liste sensible au sens sécurité ; ne pas supposer `5182` autorisé à distance. |
| `[auth.email]`, fournisseurs Google/Apple | [config.toml](../supabase/config.toml), [AuthPage.tsx](../src/pages/AuthPage.tsx) | Formulaire email et appels OAuth présents. Le modèle local désactive la confirmation email et Apple ; il ne décrit pas les paramètres hébergés. | Identifiants fournisseurs et SMTP à obtenir côté serveur ; comptes et livraison email inconnus. |
| `[functions.<nom>].verify_jwt` | [supabase/config.toml](../supabase/config.toml) | `false` explicitement pour la consommation d'appairage et les deux workers de révocation, qui ont leurs contrôles propres. Plusieurs fonctions utilisateur sont à `true`. | Réglage de sécurité, pas un booléen à uniformiser ; état de déploiement inconnu. |
| `[db.migrations]`, `[db.seed]` | [config.toml](../supabase/config.toml), [migrations](../supabase/migrations/), [seed.sql](../supabase/seed.sql) | Migrations et seed local activés dans le modèle ; 88 migrations versionnées au checkpoint. | Fichiers protégés. Ni application des migrations ni chargement du seed prescrits par ce guide. |
| RLS, fonctions/RPC, publications Realtime | [migrations](../supabase/migrations/) et services décrits dans l'[architecture](architecture.md) | Nécessaires selon l'espace fonctionnel ; les URLs et clés seules ne créent pas ces contrats. | Autorisations serveur ; migrations réellement appliquées à réconcilier. |
| Buckets `profile-media`, `room-loge-previews`, `room-classe-resources`, `room-wave-private` | [profile.media.service.ts](../src/features/profile/profile.media.service.ts), [market.service.ts](../src/features/market/market.service.ts), [loge-preview-url](../supabase/functions/rooms-loge-preview-url/index.ts), [classe-resource-url](../supabase/functions/rooms-classe-resource-url/index.ts), [waveInfra.ts](../supabase/functions/_shared/waveInfra.ts) | Noms attendus par les parcours média concernés ; le Market utilise aussi `profile-media`. | Vérifier présence, caractère privé attendu, limites et politiques ; ne pas rendre un bucket public pour contourner une erreur. |
| `meewav_livekit_revocation_worker_url`, `meewav_livekit_revocation_worker_secret` | [migration de planification](../supabase/migrations/20260815154500_rooms_livekit_revocation_scheduler_v1.sql) | Noms d'entrées Vault pour le worker Rooms, **pas des variables Web**. Avec `pg_cron`/`pg_net`, cadence demandée de 15 s ; sinon état dégradé demandant un ordonnanceur externe. | URL et **secret** correspondant au worker ; installation du job et livraison effective à vérifier. |

Le modèle Supabase comporte également des substitutions **conditionnelles**, distinctes des besoins du site : `OPENAI_API_KEY` pour l'assistance de Studio ; `SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN` pour Twilio désactivé ; `SUPABASE_AUTH_EXTERNAL_APPLE_SECRET` pour Apple désactivé ; `S3_HOST`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` pour la configuration expérimentale de stockage. Les clés, jetons et secrets restent côté service. Leur présence dans [config.toml](../supabase/config.toml) n'atteste pas une intégration produit active. L'exemple SMTP commenté n'est pas un fournisseur configuré.

## 7. Paramètres historiques et outils ciblés

Ces noms ont des consommateurs, mais **ne sont pas des prérequis du globe vinyle actif**. Les conserver dans la cartographie évite de confondre l'ancien modèle avec la configuration de reprise.

| Noms exacts | Lecteur et rôle | Côté / condition | Sensibilité |
|---|---|---|---|
| `VITE_API_BASE_URL` | [globe.api.ts](../src/features/globe/api/globe.api.ts), ancienne API de globe. | Navigateur, chemin historique. | URL exposée. |
| `VITE_AVATAR_API_BASE_URL` | [useCanvasAvatarOverlay.tsx](../src/features/globe/hooks/useCanvasAvatarOverlay.tsx), [selectedZoneExtrusionController.ts](../src/features/globe/selectedExtrusion/selectedZoneExtrusionController.ts), API avatars de l'ancien rendu. | Navigateur, conditionnel. | URL exposée. |
| `VITE_USE_VECTOR_TILE_SERVER`, `VITE_MVT_TILE_URL`, `VITE_AVATAR_LABEL_MODE` | [avatarLayers.ts](../src/map/avatarLayers.ts), choix MVT, URL tuiles et labels `collision` ou `all`. | Navigateur, ancien moteur ; MVT actif sauf chaîne `false`. | Non secrets. |
| `VITE_GEO_PIPELINE_MODE`, `VITE_USE_NATIONAL_GEO_PIPELINE` | [geoPipelineMode.ts](../src/features/globe/geography/geoPipelineMode.ts), modes `legacy`, `national`, `comparison`, ancien booléen et override URL de développement. | Navigateur, géographie historique ; défaut `legacy`. | Non secrets. |
| `VITE_NATIONAL_GEO_TILESET_URL` | [nationalGeoPipeline.ts](../src/features/globe/geography/nationalGeoPipeline.ts), archive PMTiles, défaut local prévu. | Navigateur, pipeline historique. | URL exposée. |
| `VITE_MEEWAV_CLEAN_PERF_MODE` | [perfFlags.ts](../src/features/globe/perf/perfFlags.ts), mode de diagnostic sobre, aussi sélectionnable par URL/global JS. | Navigateur, outillage du globe. | Non secret. |
| `PORT`, `MEEWAV_MVT_LOCAL_ONLY`, `MEEWAV_ALLOW_DETERMINISTIC_50K_FALLBACK` | [serveur MVT](../server/mvt-tile-server/index.js) et [lanceur](../scripts/start-development.mjs), port, mode local et données déterministes. | Serveur Node historique ; lanceur sur option `--legacy-globe-tiles`, défauts `5000`, `1`, `1`. | Non secrets ; données synthétiques. |
| `DATABASE_URL`, `SUPABASE_DB_URL` | [serveur MVT](../server/mvt-tile-server/index.js), [avatar-dispatch/database.mjs](../scripts/avatar-dispatch/database.mjs), accès PostgreSQL des outils. | Serveur/outillage ; conditionnel, pas configuration du navigateur. | **Chaînes de connexion secrètes** lorsqu'elles contiennent des identifiants. |
| `PGSSLMODE`, `PGSSLROOTCERT`, `PGSSLCERT`, `PGSSLKEY` | [avatar-dispatch/database.mjs](../scripts/avatar-dispatch/database.mjs), paramètres TLS et chemins des certificats ; les paramètres de l'URL peuvent prendre priorité. | Outil d'import/export ciblé, non lancé. | Clé privée/chemins sensibles ; ne pas recopier leur contenu. |
| `AVATAR_DISPATCH_EXPECTED_PROJECT_REF`, `SUPABASE_URL`, `VITE_SUPABASE_URL` | [avatar-dispatch/database.mjs](../scripts/avatar-dispatch/database.mjs), contrôle de cible pour l'outillage. | Outil ciblé ; distinct du runtime Web. | Identifiants de cible, pas autorisation d'importer. |
| `PARIS_ANCHORS_PATH` | [geo-loader.mjs](../scripts/avatar-dispatch/geo-loader.mjs), source géographique optionnelle. | Outil ciblé. | Chemin local. |
| `PARIS_MOCK_ARTIST_LIMIT` | [seed-premium-paris-mockdata.js](../server/mvt-tile-server/seed-premium-paris-mockdata.js), limite d'un générateur de données. | Outil historique non exécuté. | Non secret ; ne justifie aucun chargement. |
| `MEEWAV_CAPTURE_URL`, `SWITCH_ROOM_URL`, `PGLITE_MODULE_PATH`, `GITHUB_ACTIONS` | [capture-scene-design.mjs](../scripts/capture-scene-design.mjs), [test-switch-room-browser.mjs](../scripts/test-switch-room-browser.mjs), [test-place-conversation-sql.mjs](../scripts/test-place-conversation-sql.mjs), [check-typecheck-baseline.mjs](../scripts/check-typecheck-baseline.mjs). | Outils de capture/test/contrôle, non exécutés. | URL/chemin/contexte ; `GITHUB_ACTIONS` ne prouve pas l'existence d'un workflow. |

Dans le corpus antérieur, **59 noms étaient des mentions documentaires**, pas un contrat de 59 variables. Notamment :

- `VITE_MAPBOX_TOKEN` et `VITE_MAPBOX_STYLE_URL` restent dans le modèle [.env.example](../.env.example), mais aucun lecteur applicatif de ces noms n'a été identifié dans les sources examinées. Ils ne sont pas requis pour le renderer actuel.
- `VITE_MEEWAV_ENV`, `VITE_MEEWAV_CONTRACT_VERSION` et leurs équivalents logiques sont décrits par l'ancienne [politique d'environnements](backend/ENVIRONMENTS_AND_RELEASES.md) ; aucun consommateur Web actuel n'établit ce contrôle de contrat.
- Les chemins de fichiers, labels de diagnostic, options CMake et identifiants de migration ne deviennent pas des variables d'environnement parce qu'ils sont écrits en capitales.

## 8. Séparations attestées et inconnues

Le dépôt distingue réellement modes Vite, flags d'aperçu, paramètres de processus natif, configuration locale Supabase et variables serveur Edge. Il **ne démontre pas** des projets local/staging/production provisionnés et isolés, des secrets déployés pour chaque cible ou un pipeline de promotion.

La politique historique d'environnements conserve une intention de séparation et de compatibilité Web/iOS ; ses affirmations sur l'état distant sont datées. Aucun workflow GitHub suivi n'est présent au checkpoint, et aucune automatisation externe n'a été inspectée.

Avant un futur essai connecté, il reste à établir : la cible autorisée et ses clés publiques, les origines/redirections, les migrations et RPC appliqués, les politiques/buckets, les fonctions et leurs variables serveur, les comptes LiveKit/OAuth, les workers et leurs ordonnanceurs. Cette liste décrit les inconnues ; aucune de ces opérations n'a été effectuée pendant la mission.
