# ADR — Pont entre MeeWav Audio Engine et les Rooms

- Statut : **décision proposée ; contrôle Web/backend amorcé, pont audio absent**
- Date de vérification : **10 août 2026**
- Décision V1 : **Option A — PCM natif local vers AudioWorklet, puis publication LiveKit depuis le navigateur**
- Diffusion large/replay : **LiveKit Egress vers Mux**, pas Mux comme transport interactif.

## Résumé de décision

Le moteur natif traite et monitore la voix localement. Il transmet ensuite un flux PCM 48 kHz au navigateur par un canal loopback authentifié. Le navigateur alimente un ring buffer consommé par un `AudioWorklet`, crée un `MediaStreamTrack`, puis publie cette piste audio traitée dans la même session LiveKit que la caméra.

```text
Micro
  ↓
MeeWav Audio Engine natif
  ├── FX / limiteur ──→ casque local
  └── PCM traité 48 kHz
          ↓ loopback authentifié
     Worker + ring buffer
          ↓
     AudioWorklet
          ↓
 MediaStreamAudioDestinationNode
          ↓
 processedAudioTrack
          ↓
 LiveKit (interactif)
          ↓
 LiveKit Egress ──→ Mux RTMPS ──→ HLS / enregistrement
```

Cette option conserve la caméra dans le navigateur, évite un driver audio virtuel et fait appartenir la vidéo et l'audio traité au même participant LiveKit. Elle exige néanmoins deux POC avant production : transport PCM stable dans les navigateurs cibles et intégration LiveKit réelle dans le Web MeeWav.

Un POC local Windows x64 a maintenant été compilé dans `apps/meewav-audio-engine` : micro WASAPI événementiel → VST3 Antares/Voloco/Spoton/Graillon allowlisté par identifiant canonique → limiteur → sortie locale. Sa sonde VST3 hors ligne, sans micro ni sortie audio, a réellement instancié Auto-Key 2, Auto-Tune Pro 11.0.0, Spoton 1.1.2 et Graillon 3.2.0. Spoton et Graillon ont chacun traité quatre passages synthétiques déterministes après vérification stricte de leur class ID. Le chemin live WASAPI n'a pas été exécuté et aucun transport PCM vers le navigateur n'existe. Cette preuve valide l'hôte isolé ; elle ne valide ni correction audible, ni monitoring, ni Room distante.

## Audit du Web MeeWav actuel

### Ce qui existe

Le working tree contient déjà un moteur Web Audio local dans [`placeLocalAudioEngine.ts`](../src/features/rooms/place/placeLocalAudioEngine.ts). Il :

- demande un micro mono avec une fréquence idéale de 48 kHz ;
- désactive `echoCancellation`, `noiseSuppression` et `autoGainControl` ;
- construit input gain, égalisation, compression parallèle, reverb/delay, master et limiteur ;
- sépare le retour casque d'un `MediaStreamAudioDestinationNode` ;
- expose un `outputTrack` traité ;
- refuse de simuler une correction de hauteur et prévoit un adaptateur DSP licencié.

[`usePlaceLocalAudio.ts`](../src/features/rooms/place/usePlaceLocalAudio.ts) conserve le flux traité par Room et l'expose comme frontière d'un futur publisher. Cette piste n'est toutefois pas publiée vers un transport distant.

Le player de scène dans [`PlaceStage.tsx`](../src/features/rooms/place/PlaceStage.tsx) lit des URL vidéo et un flux HLS avec `hls.js`. [`place.service.ts`](../src/features/rooms/place/place.service.ts) résout un `mux_playback_id` en `https://stream.mux.com/{id}.m3u8`. Les migrations [`20260603123000_rooms_mux_broadcast.sql`](../supabase/migrations/20260603123000_rooms_mux_broadcast.sql) et [`20260809124500_rooms_host_guest_gain_v3.sql`](../supabase/migrations/20260809124500_rooms_host_guest_gain_v3.sql) gèrent état de broadcast et gains de régie.

### Ce qui manque

- aucune dépendance `livekit-client` dans le Web ;
- aucun participant LiveKit Web ;
- aucun endpoint serveur de token LiveKit identifié dans ce parcours ;
- aucun publisher de la piste traitée ;
- aucun bridge localhost natif ;
- aucun `AudioWorklet` alimenté en PCM natif ;
- aucune règle opérationnelle qui remplace atomiquement le micro brut par le micro traité ;
- aucun egress LiveKit vers Mux dans le dépôt audité.

Conclusion : l'UI et le DSP Web local ne constituent pas encore une chaîne de diffusion. Supabase est aujourd'hui un plan de contrôle/état et Mux HLS une surface de lecture. Aucun des deux ne transporte actuellement la voix traitée interactive entre les participants Web.

## Pourquoi Mux ne peut pas remplacer LiveKit

Mux documente des entrées RTMP/RTMPS/SRT et indique ne pas prendre en charge l'ingest WebRTC direct. Sa FAQ annonce des latences typiques supérieures à 20 secondes en standard, 12–20 secondes en mode réduit et jusqu'à environ 5 secondes en faible latence selon le contexte. Ce produit convient à une audience broadcast et au replay, pas au dialogue musical bidirectionnel. Sources : [démarrer un live Mux](https://www.mux.com/docs/guides/start-live-streaming), [FAQ live Mux](https://www.mux.com/docs/guides/live-streaming-faqs).

LiveKit JS accepte un `MediaStreamTrack` dans `publishTrack`, ce qui permet au navigateur de publier la piste construite par l'AudioWorklet. Source : [LiveKit JS `LocalParticipant.publishTrack`](https://docs.livekit.io/reference/client-sdk-js/classes/LocalParticipant.html#publishTrack).

Pour la diffusion large, LiveKit Egress peut produire des sorties RTMP/SRT/HLS. L'architecture cible est donc : participants interactifs dans LiveKit, puis egress serveur vers Mux pour l'audience HLS et l'enregistrement. Sources : [LiveKit Egress](https://docs.livekit.io/transport/media/ingress-egress/egress/), [sorties Egress](https://docs.livekit.io/transport/media/ingress-egress/egress/outputs/).

## Comparaison des trois options

| Critère | A — PCM vers navigateur | B — Engine publie LiveKit | C — périphérique virtuel |
|---|---|---|---|
| Caméra gérée par le navigateur | Oui | Oui, mais participant séparé probable | Oui |
| Unité audio/vidéo d'un participant | Simple | Complexe | Simple en apparence |
| Latence bridge local | À valider | Potentiellement la plus faible | Dépend du driver |
| Installation privilégiée | Application seule | Application seule | Application + driver |
| Support/maintenance | Modéré | Élevé | Très élevé |
| Auth LiveKit dans le natif | Non | Oui | Non |
| Risque double micro | Contrôlable | Élevé lors des transitions | Élevé |
| Compatibilité navigateur | À tester | Plus indépendante | Bonne après installation |
| Décision V1 | **Retenue** | Repli après POC A | Rejetée |

Le SDK C++ officiel LiveKit rend l'option B techniquement possible sur Windows et macOS et accepte des frames audio brutes. Elle est rejetée en V1 parce qu'elle duplique la responsabilité LiveKit entre navigateur et moteur. Une identité LiveKit ne doit pas être ouverte simultanément par deux clients ; utiliser deux identités sépare la caméra et la voix et complexifie permissions, affichage, synchronisation, E2EE, reconnexion et statistiques. Source : [SDK C++ LiveKit](https://docs.livekit.io/transport/sdk-platforms/cpp/).

## Plan de contrôle local

Le contrôle et l'audio utilisent des canaux distincts.

### Pairing

1. Le Web authentifié appelle `rooms-audio-engine-pairing-ticket` avec `roomId` et un `clientNonce` aléatoire, sous l'origine Web exacte.
2. L'Edge Function vérifie l'utilisateur et son rôle `host` ou `guest`, crée un ticket signé d'au plus 60 secondes et persiste uniquement son hash dans `room_audio_engine_pairing_tickets`.
3. Le Web ouvre `meewavaudio://pair` avec `pairingId`, le `token` opaque, `clientNonce`, `origin`, les ports loopback candidats et les versions de protocole. Le token n'est jamais envoyé aux ports loopback sondés.
4. Le moteur natif doit appeler en HTTPS `rooms-audio-engine-pairing-consume` avec `{ pairingId, token, clientNonce }`. L'endpoint vérifie le ticket puis appelle la RPC `consume_room_audio_engine_pairing_ticket`, qui marque atomiquement le ticket comme consommé. Aucun secret de signature ni clé Supabase `service_role` ne réside dans le navigateur ou le moteur.
5. Le Web appelle ensuite `POST /v1/session` avec seulement `{ pairingId, clientNonce, origin }`. Le moteur exige la correspondance exacte avec la consommation précédente et renvoie `sessionId`, `sessionSecret` et `ticketProof`.
6. `ticketProof` est un HMAC-SHA-256 base64url utilisant les octets UTF-8 du ticket comme clé sur la forme canonique `${pairingId}\n${clientNonce}\n${origin}\n${sessionId}\n${sessionSecret}`. Le navigateur vérifie cette preuve avant d'importer le secret de session ; un processus aléatoire sur un port sondé ne peut donc pas se faire passer pour le moteur ayant consommé le ticket.
7. Chaque commande suivante est authentifiée par HMAC, horodatée et protégée par nonce contre le rejeu. La fermeture appelle au mieux `POST /v1/session/close`.

Les deux Edge Functions et la migration `20260810130000_rooms_audio_engine_pairing.sql` sont présentes dans le dépôt. Leur présence ne prouve pas qu'elles ont été déployées ni que `MEEWAV_AUDIO_ENGINE_PAIRING_SECRET` et les autres secrets serveur ont été configurés. Le client Web implémente le contrat, mais le custom protocol, le consommateur HTTPS et le serveur loopback natifs restent absents.

Le serveur local écoute uniquement sur loopback. Il refuse `0.0.0.0`, les origines inconnues, les requêtes sans session et tout chemin de plugin fourni par le navigateur. CORS utilise une allowlist exacte des origines MeeWav production/staging, jamais `*`.

Chrome a introduit une permission d'accès au réseau local qui couvre également des accès loopback dans les scénarios concernés. L'onboarding doit donc expliquer l'autorisation en langage produit et le POC doit tester Chrome, Edge, Safari et Firefox séparément au lieu de supposer un comportement uniforme. Source : [Local Network Access dans Chrome](https://developer.chrome.com/blog/local-network-access).

### API de contrôle minimale

```text
GET   /v1/health
POST  /v1/session
POST  /v1/session/close
GET   /v1/devices
POST  /v1/devices/select
GET   /v1/plugins
POST  /v1/plugins/rescan
GET   /v1/chain
PUT   /v1/chain
PATCH /v1/chain/:slot
POST  /v1/preset
POST  /v1/monitor/start
POST  /v1/monitor/stop
GET   /v1/diagnostics
WS    /v1/control
```

L'upgrade WebSocket est signé canoniquement comme `GET /v1/control`, puis authentifié dans une première frame avec session, timestamp, nonce et signature. Les meters utilisent ce canal temps réel séparé à fréquence bornée. Les blobs de state vendor, chemins locaux, secrets de licence et contenus audio ne transitent pas vers le backend MeeWav.

`GET /v1/health` expose obligatoirement un état `audioPlane` :

- `unavailable` : aucune route audio native exploitable ;
- `local_monitor` : le signal traité peut être monitoré localement, mais n'est pas publié dans la Room ;
- `room_ready` : le pont et la piste traitée sont établis et prêts pour une bascule coordonnée.

Une session de contrôle connectée ne vaut jamais `room_ready`. Tant que cet état n'est pas explicitement atteint, le navigateur conserve sa piste micro actuelle et ne réalise aucune bascule supposée vers le moteur.

## Plan audio local

### Format du flux

- PCM `Float32` ;
- 48 kHz interne ;
- mono par défaut, stéréo seulement lorsqu'un cas produit le justifie ;
- frames binaires de taille fixe avec version, sequence, timestamp, nombre de frames et nombre de canaux ;
- aucun JSON sur le chemin audio ;
- aucun envoi depuis le callback par une primitive bloquante.

Le callback écrit dans une file lock-free préallouée. Un thread bridge distinct envoie les frames vers le navigateur. Côté Web, un Worker reçoit les frames, les dépose dans un ring buffer partagé et l'AudioWorklet les consomme. Si `SharedArrayBuffer` est retenu, MeeWav devra activer l'isolation cross-origin requise et auditer ses effets sur tous les embeds et ressources tierces. Un fallback `MessagePort` peut servir au POC, pas être déclaré stable avant mesure.

### Gestion du buffer

Le bridge expose uniquement en diagnostic :

- remplissage courant ;
- underruns/overruns ;
- dérive horloge ;
- frames perdues ;
- latence bridge estimée.

Le resampling et la compensation de drift se font hors thread temps réel critique. Une dérive ne doit jamais être corrigée par des sauts audibles brutaux.

## Invariants de publication

1. Un participant publie **une seule piste vocale**.
2. Lorsque le moteur est actif, le micro brut du navigateur n'est pas publié.
3. Le bypass garde la piste traitée publiée et bypass uniquement les effets ; il ne crée pas une seconde piste.
4. Le monitoring reste natif et ne repasse jamais par LiveKit.
5. Le host traite sa voix ; chaque invité traite sa propre voix sur son propre appareil. Le host ne peut pas appliquer Antares à distance sur un invité.
6. Les gains de régie reçus côté host ne remplacent pas les réglages créatifs privés de l'invité.
7. La caméra reste un track navigateur séparé, publié par le même participant.
8. Les tokens LiveKit sont courts, limités à la Room et émis par le backend. Aucun secret API LiveKit ne réside dans le navigateur ou le moteur.

## Machine d'état et fallback

```text
RAW_READY
  └── utilisateur active les effets
       → ENGINE_PAIRING
       → ENGINE_WARMING
       → PROCESSED_PREVIEW
       → PROCESSED_PUBLISHED

PROCESSED_PUBLISHED
  ├── bypass → PROCESSED_PUBLISHED (FX bypassés)
  ├── bridge dégradé → ENGINE_WARNING
  └── crash/timeout → USER_DECISION
                         ├── Reconnecter
                         └── Continuer sans effets → RAW_PUBLISHED
```

Le fallback vers le micro brut est explicite. MeeWav informe l'artiste avant le remplacement. La transition doit être atomique autant que le SDK le permet : préparer la nouvelle piste, couper/dépublier l'ancienne, publier la nouvelle et vérifier la réception distante. Une garde côté client et une assertion d'intégration empêchent deux tracks micro actifs.

La perte d'Internet ne coupe pas le monitoring local. À la reconnexion LiveKit, le navigateur republie le track traité si le bridge est sain ; sinon il demande une décision à l'utilisateur.

## Synchronisation et diffusion large

Le navigateur publie la caméra et la piste traitée dans la même connexion LiveKit. Les timestamps d'origine et les statistiques WebRTC servent à mesurer dérive et A/V sync chez un second appareil.

Pour Mux :

1. LiveKit reste la source interactive ;
2. un egress serveur compose la Room ou le participant ;
3. l'egress pousse en RTMPS/SRT vers Mux ;
4. le `playback_id` Mux alimente HLS pour l'audience large ;
5. les webhooks Mux mettent à jour `room_broadcasts_v2` ;
6. les clés Mux restent serveur uniquement.

Une audience HLS ne doit pas être présentée comme participante en temps réel au même niveau que les invités LiveKit.

## Sécurité et confidentialité

| Risque | Contrôle obligatoire |
|---|---|
| Site tiers pilote le moteur | allowlist d'origine + ticket court consommé côté backend + secret de session |
| Faux moteur sur un port loopback sondé | `ticketProof` HMAC vérifié avant import du secret local |
| Rejeu d'une commande | nonce consommé + numéro de séquence + expiration |
| Chargement arbitraire de code | `pluginId` allowlisté, chemin résolu par le registre local |
| Vol de token Room | token LiveKit court, scoped, émis serveur, jamais loggué |
| Exposition réseau | bind loopback uniquement + pare-feu/ACL appropriés |
| Fuite audio | aucun stockage/enregistrement par défaut, aucun audio analytics |
| Plugin hostile | scan isolé, timeout, cache de quarantaine, watchdog |
| Update compromise | artefacts signés, vérification avant installation |
| Double publication | invariant runtime + métrique + test d'intégration |
| Saturation du bridge | bornes de débit, frames fixes, backpressure et fermeture sûre |

## Dépendances backend

- sources de `rooms-audio-engine-pairing-ticket`, `rooms-audio-engine-pairing-consume`, table service-only et RPC de consommation atomique présentes ; déploiement, secrets et exploitation à valider ;
- endpoint de token LiveKit avec permissions dérivées du rôle serveur ;
- déploiement LiveKit et stratégie régionale ;
- service Egress si Mux reste la sortie broadcast ;
- webhooks Mux vérifiés et idempotents ;
- version minimale du moteur exposée au Web ;
- journal d'audit sans audio ni secrets ;
- feature flags par OS, navigateur et version du moteur.

## Critères Go/No-Go du POC bridge

GO uniquement si :

- le moteur reste à 48 kHz et le navigateur reçoit un flux continu ;
- aucun micro brut n'est publié avec la piste traitée ;
- 30 minutes de test n'ont aucun dropout audible sur la machine cible ;
- underrun, overrun et drift sont mesurés ;
- le monitoring natif continue pendant une perte réseau ;
- un second appareil reçoit la voix traitée et la caméra synchronisées ;
- le retour au micro brut après crash est explicite et fonctionnel ;
- le refresh Web restaure une session encore valide sans réutiliser un ticket consommé ;
- Chrome, Edge, Safari et Firefox ont un résultat documenté, avec fallback produit si un navigateur ne permet pas le bridge ;
- l'egress LiveKit vers Mux fonctionne sans exposer de stream key ;
- Maroc ↔ France est testé avec mesures de latence, packet loss, reconnexion et A/V sync.

NO-GO si le bridge nécessite un buffer local qui rend le monitoring ou la conversation musicale impropre, si l'isolation cross-origin casse des fonctions critiques du site, ou si la permission loopback ne permet pas un parcours fiable sur les navigateurs retenus. Dans ce cas seulement, réévaluer l'option B avec un participant natif explicitement lié au participant caméra.

## Ce qui reste simulé ou non construit

- le MeeWav Audio Engine de production et son serveur de contrôle loopback ;
- le custom protocol natif, le consommateur HTTPS du ticket, la génération cryptographique de session et `ticketProof` côté moteur ;
- le déploiement vérifié des Edge Functions/table/RPC d'appariement ;
- la sonde VST3 hors ligne a chargé Auto-Tune et traité un bloc synthétique, mais le POC live WASAPI, l'activation vendor, l'audio audible et la stabilité restent non validés ;
- le transport PCM ;
- l'AudioWorklet/ring buffer ;
- la publication LiveKit Web ;
- le token service Web ;
- l'Egress vers Mux ;
- le watchdog et l'auto-update ;
- la matrice navigateurs ;
- les mesures de latence et de stabilité.

La présence d'un `MediaStream` traité dans le Web est une base utile, mais ne permet pas encore de revendiquer une voix Auto-Tune distante fonctionnelle.
