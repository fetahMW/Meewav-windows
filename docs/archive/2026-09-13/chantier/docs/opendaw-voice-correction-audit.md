# Audit d’intégration openDAW — Autotune

Date de l’audit : 11 août 2026

Périmètre : prototype interne MeeWav Web, branche `task/rooms`
Statut : audit réalisé, intégration expérimentale uniquement, aucun déploiement

## Résumé

MeeWav possède déjà un graphe Web Audio local adapté à une insertion de correction vocale. Il capture un microphone, applique les traitements locaux existants, produit une piste `MediaStream` séparée du retour casque et conserve le mute et le nettoyage de fin de Room. Ce graphe doit être conservé.

Le point bloquant pour une preuve Room de bout en bout n’est pas le DSP : le dépôt Web audité ne contient actuellement ni transport interactif LiveKit, ni `RTCPeerConnection` de Room, ni `RTCRtpSender` de Room. Le player public lit un composite Mux/HLS et Supabase sert de plan de contrôle. Une piste audio traitée peut donc être produite et testée avec `replaceTrack` dans le laboratoire, mais elle ne peut pas encore être publiée à un second participant par une Room réelle sans le futur média-plane RTC.

Le moteur openDAW publié peut servir de base au prototype interne. Sa version actuelle impose toutefois l’isolation cross-origin et charge un bundle WASM global incluant des modules que la documentation openDAW exclut de la licence commerciale. Le prototype est donc autorisé uniquement derrière le feature flag, sans mise en production. Ses binaires résident dans `audio-lab-public/` et sont ajoutés par un plugin Vite ciblé, actif uniquement en mode `audio-lab`. Le `publicDir` normal reste `public/` dans tous les modes : les assets MeeWav habituels sont conservés, tandis que le build normal n’embarque ni les assets ni la signature du runtime openDAW.

## Précautions prises avant modification

- Les instructions du dépôt dans `GEMINI.md` et `agents/master.md` ont été lues.
- `git status --short` a été inspecté avant installation.
- Le worktree contenait déjà des modifications MeeWav ; elles ont été préservées et aucun reset, checkout destructif ou déploiement n’a été effectué.
- Le clone complet d’openDAW a été placé hors du dépôt MeeWav, sous `%LOCALAPPDATA%\Temp\meewav-opendaw-official`.
- Aucun schéma Supabase, aucune Edge Function et aucun service distant n’ont été modifiés.

## État technique de MeeWav avant intégration

| Élément | Constat vérifié |
|---|---|
| Frontend | React `19.2.6`, React Router `7.17.0` |
| Build | Vite `8.0.12` |
| Langage | TypeScript `6.0.3`, cible ES2020, mode strict |
| Paquets | npm, lockfile `package-lock.json` |
| Runtime de l’audit | Node `24.12.0`, npm `11.6.2` |
| Hébergement | Le dépôt ne contient pas de configuration de rewrite/hébergement faisant autorité. La documentation mentionne Vercel, mais aucune cible n’a été déployée pendant ce travail. |
| Données Rooms | Supabase pour l’état, les profils et le Realtime |
| Vidéo publique | HLS/Mux lorsque `room_broadcasts_v2.mux_playback_id` est actif |
| Transport RTC Room Web | Absent du dépôt audité |

### Graphe audio local existant

Le graphe principal se trouve dans `src/features/rooms/place/placeLocalAudioEngine.ts` et est piloté par `src/features/rooms/place/usePlaceLocalAudio.ts`.

Trajet avant openDAW :

```text
getUserMedia(micro mono, traitements navigateur désactivés)
  → input gain / mute
  → filtre passe-haut / égalisation
  → point d’insertion PlacePitchCorrectionAdapter
  → compression parallèle
  → reverb / delay
  → master / safety limiter
  ├─→ MediaStreamAudioDestinationNode (sortie Room)
  └─→ GainNode de monitoring (sortie locale, OFF par défaut)
```

Points positifs :

- le point d’insertion `PlacePitchCorrectionAdapter` existe déjà ;
- `getPlaceProcessedAudioStream(roomId)` expose la sortie traitée sans le retour casque ;
- le mute utilise un gain local et ne nécessite pas de recréer le graphe ;
- le monitoring est séparé, déclenché par une action explicite et désactivable ;
- `stop()` arrête les pistes, déconnecte les nœuds et ferme l’`AudioContext` possédé par le moteur ;
- un changement d’adapter n’impose pas de remplacer toute l’architecture audio.

Points à surveiller :

- le fader Micro de l’interface ne pilote pas encore toute la chaîne comme un gain de diffusion serveur ;
- Musique et Master ne correspondent pas encore à un mix distant autoritaire ;
- la Green House possède une capture `getUserMedia` distincte : une double ouverture du micro est possible si les deux parcours sont actifs ;
- aucun consommateur de `getPlaceProcessedAudioStream(roomId)` ne publie aujourd’hui la piste dans une Room réelle ;
- aucun appel Room à `RTCRtpSender.replaceTrack` n’existait avant ce prototype.
- l’ancien panneau natif `src/features/rooms/audio-engine/VoiceFxEnginePanel.tsx` conserve encore des libellés publics Antares/Voloco ; il doit être neutralisé ou confirmé hors parcours public pour respecter la nouvelle nomenclature.

### Capture, périphériques et cycle de vie

La capture existante demande une piste audio mono avec :

- `echoCancellation: false` ;
- `noiseSuppression: false` ;
- `autoGainControl: false` ;
- fréquence demandée à 48 kHz lorsque le navigateur et le périphérique l’acceptent.

L’`AudioContext` est créé avec `latencyHint: "interactive"`. La permission micro et la reprise d’un contexte suspendu passent par une action utilisateur. Le changement de microphone n’est pas encore un flux unifié de bout en bout avec un média-plane RTC ; il doit être retesté lorsque celui-ci existera.

## Audit des versions openDAW

Les versions ont été vérifiées sur le registre npm le 11 août 2026, puis installées exactement, sans plage flottante :

| Package | Version npm vérifiée et verrouillée |
|---|---:|
| `@opendaw/studio-sdk` | `0.0.166` |
| `@opendaw/studio-core-wasm` | `0.0.11` |
| `@opendaw/studio-boxes` | `0.0.104` |
| `@opendaw/studio-core` | `0.2.0` |
| `@opendaw/studio-adapters` | `0.2.0` |
| `@opendaw/studio-enums` | `0.0.84` |
| `@opendaw/lib-std` | `0.0.82` |

Le clone officiel inspecté avait pour `HEAD` :

```text
2f9e60fec44903f51e84a4d1ce60d9e4a8b5e113
```

Après `npm install`, son `package-lock.json` local était modifié. Deux autres fichiers apparaissaient modifiés uniquement à cause de la normalisation CRLF de Git ; aucune modification fonctionnelle du clone n’a été intégrée à MeeWav.

Ce `HEAD` du clone ne doit pas être présenté comme un commit de release commun aux packages npm. Les manifests publiés contiennent des `gitHead` différents (`studio-sdk`/`studio-core`/`studio-adapters` : `e4f7017…`, `studio-boxes` : `c1a5287…`, `studio-enums` : `20290e3…`, `lib-std` : `2b6f638…`) et `studio-core-wasm` n’en déclare pas. La compatibilité retenue repose sur les versions exactes publiées et leurs types réellement installés, pas sur l’hypothèse d’un commit unique.

### API réellement publiée

`@opendaw/studio-sdk@0.0.166` a bien été installé et inspecté en premier. Son `dist/index.d.ts` ne réexporte toutefois que la version SDK, `BpmDetector`, `SampleService`, `WasmBpmDetector` et `Workers` ; il n’expose ni `WasmEngine`, ni `AutotuneDeviceBox`, ni une API microphone → effet. Le prototype utilise donc directement les packages constituants exacts que ce SDK dépend déjà, au lieu d’inventer une API haut niveau absente.

Les déclarations TypeScript de `@opendaw/studio-core-wasm@0.0.11` exposent :

```ts
WasmEngine.install(urls)
WasmEngine.ensureReady(audioContext)
WasmEngine.isReady()
```

Le README du SDK montre encore `isEnabled()` et `setEnabled()`, mais ces méthodes n’existent pas dans le fichier `WasmEngine.d.ts` installé. Le prototype se base sur les types et le code distribués, pas sur cet exemple obsolète.

### Paramètres vérifiés

La couche canonique MeeWav mappe `AutotuneDeviceBox` ainsi :

| Paramètre openDAW | Plage | Valeur technique initiale |
|---|---:|---:|
| `key` | `0…11` | `0` |
| `scale` | `0…7` | `0` |
| `amount` | `0…1` | `1` |
| `retune` | `0…1` | `0.5` |
| `shift` | `-12…+12` demi-tons | `0` |
| `smooth` | `0…1` | `0.6` |
| `enabled` | booléen | `false` côté MeeWav |

Ordre des tonalités vérifié : `C, C#, D, D#, E, F, F#, G, G#, A, A#, B`.

Ordre des gammes vérifié : `Chromatique, Majeure, Mineure, Pentatonique majeure, Pentatonique mineure, Blues, Dorienne, Mixolydienne`.

### Nature du DSP

Le code openDAW inspecté implémente une correction monophonique avec détection YIN et transposition TD-PSOLA. Il indique notamment :

- une plage de détection approximative de 80 à 1 100 Hz ;
- une fenêtre d’analyse YIN de 640 échantillons décimés ;
- une ligne de délai PSOLA fixe de 1 280 échantillons, soit environ 26,7 ms à 48 kHz.

Ces caractéristiques ne constituent pas une validation musicale. Elles annoncent au contraire les limites probables sur les accords, plusieurs voix, un mélange instrument + voix et les signaux très réverbérés.

## Validation du dépôt officiel séparé

Prérequis réellement présents :

- Git `2.52.0.windows.1` ;
- Node `24.12.0` ;
- npm `11.6.2` ;
- Rust stable `1.93.1` ;
- toolchain Rust nightly et composant `rust-src` ;
- cible `wasm32-unknown-unknown` ;
- `mkcert` ;
- OpenSSL via l’environnement Git Bash.

`wasm-opt`/Binaryen n’était pas installé ; il est facultatif pour cette validation.

Résultats :

- `npm run cert` : succès, avec avertissement que l’autorité locale n’était pas encore approuvée dans tous les stores ;
- `npm install` : succès après une première erreur réseau `ECONNRESET` ;
- les premières tentatives de build ont rencontré une commande `rm` non portable puis l’absence du fichier `$HOME/.cargo/env` attendu par les scripts Bash ; un fichier d’environnement minimal ajoutant `$HOME/.cargo/bin` au `PATH` et l’exécution dans Git Bash ont permis de poursuivre ;
- `npm run build` : succès final, `27/27` tâches ;
- `npm run dev:studio` : le script POSIX `CI=true ...` échoue tel quel sous PowerShell ;
- lancement direct Vite avec `$env:CI='true'` : succès sur `https://localhost:8080` ;
- `/` : HTTP 200 avec COOP/COEP ;
- `/wasm-engine/wasm/engine.wasm` : HTTP 200, `application/wasm` ;
- `/wasm-engine/wasm/plugins/device_autotune.wasm` : HTTP 200, `application/wasm` ;
- `WebAssembly.compile` sous Node : succès pour `engine.wasm` et `device_autotune.wasm` copiés dans MeeWav ;
- `cargo test -p device-autotune` : 3 tests réussis ;
- `cargo test -p dsp --test autotune_lab -- --nocapture` : 2 tests réussis.

`WebAssembly.compile` prouve que ces deux fichiers sont des modules WASM compilables par le moteur JavaScript, pas que le side module est lié au moteur, chargé dans l’AudioWorklet ou traversé par de l’audio. Cette limite a ensuite été partiellement levée par la preuve runtime MeeWav ci-dessous.

### Preuve runtime MeeWav en Chromium headless

Un Chromium headless a ouvert la page de laboratoire isolée avec le faux périphérique audio du navigateur et un signal synthétique. Résultats observés :

- `window.crossOriginIsolated === true` ;
- `AudioWorklet` prêt ;
- moteur WASM openDAW prêt ;
- fréquence du contexte : 48 kHz ;
- `audioContext.baseLatency` : 10 ms ;
- `audioContext.outputLatency` : 41 ms ;
- délai DSP déclaré par l’intégration : 27 ms (arrondi des 1 280 échantillons à 48 kHz) ;
- `RTCRtpSender.replaceTrack` réussi ;
- boucle WebRTC locale, relevée autour du remplacement : 3/3 paquets avant, 22/22 après, soit un delta de +19 envoyés / +19 reçus et +665 / +665 octets.

Cette preuve confirme le chargement navigateur du Worklet/WASM, le trajet d’un signal synthétique jusqu’à une piste corrigée et le point d’injection RTC local. Elle n’est pas une validation auditive : aucun microphone physique, aucune voix humaine, aucun casque, aucun haut-parleur de contrôle et aucune Room distante n’ont été utilisés.

## Isolation cross-origin et ressources

Le SDK exige `window.crossOriginIsolated === true`. Les headers nécessaires sont :

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Le prototype ajoute aussi `Cross-Origin-Resource-Policy: same-origin`, mais seulement au mode Vite `audio-lab`. Le serveur et le build normaux n’utilisent pas ces headers. Ils ne sont pas appliqués globalement à MeeWav, car ils peuvent bloquer ou modifier le comportement de :

- Mux/HLS ;
- images et vidéos CDN ;
- médias de la médiathèque ;
- authentification et fenêtres auxiliaires ;
- iframes ;
- services tiers ne fournissant ni CORS ni CORP.

Les sources d’assets sont versionnées sous `audio-lab-public/opendaw-wasm/0.0.11/` et servies sous `/opendaw-wasm/0.0.11/` uniquement en mode laboratoire par le plugin Vite `meewav-audio-lab-assets`. Ce plugin intercepte uniquement ce préfixe en développement et copie uniquement ce dossier dans `dist/opendaw-wasm` lors du build laboratoire. Le `publicDir` reste `public/`, y compris dans le laboratoire. Le manifest consigne provenance, MIME, taille et SHA-256. Le vérificateur refuse les fichiers vides, les réponses HTML à la place d’un module, les magic bytes WASM invalides, un hash différent ou une version incohérente.

Les contrôles consolidés ont vérifié deux comportements opposés :

- mode `audio-lab` : COOP/COEP actifs et `.wasm` servi avec le bon MIME ;
- mode normal : aucun COOP/COEP, aucun asset openDAW ; une requête au chemin absent reçoit le fallback HTML de la SPA, que le préflight du moteur rejette explicitement au lieu de tenter de le compiler.

Le build normal a réussi et son `dist` ne contenait ni `/opendaw-wasm/` ni signature du runtime openDAW. Le build `audio-lab` a également réussi ; `npm run opendaw:assets:verify:dist` y a validé 32 ressources pour 4 308 637 octets. Un second build avec `--outDir` personnalisé a vérifié que le plugin copie désormais les binaires dans le véritable répertoire d’artefact plutôt que dans un `dist` codé en dur.

Le moteur attend aussi `EngineWorklet.isReady()` avec un timeout de 15 secondes avant de déclarer l’état prêt. Un `processorerror` est traité comme terminal : la sortie repasse au sec et un changement de micro ne fait pas croire qu’un Worklet mort a récupéré.

L’intégration Room respecte le point d’insertion existant : `placeOpenDawPitchAdapter.ts` transforme l’`AudioNode` entrant en `MediaStream`, appelle le moteur openDAW avec l’`AudioContext` de la Room, puis rend la sortie traitée comme `MediaStreamAudioSourceNode`. L’adapter ne possède ni le microphone original ni le contexte. Son bus à deux branches commute exactement entre sec et corrigé : une erreur d’initialisation, un `processorerror`, une piste de sortie terminée ou une erreur de paramétrage rétablit immédiatement la branche sèche. `PlaceRoomExperience` ne charge cet adapter que par import dynamique lorsque le mode compile-time `audio-lab` **et** le flag sont actifs, ce qui explique son absence du build normal.

## Conclusion d’audit

Décision technique : utiliser openDAW dans un laboratoire interne, par une abstraction `VoiceCorrectionEngine`, sans copier le studio et sans remplacer le graphe MeeWav.

Décision produit : le nom public est **Autotune** (sans trait d’union, pour ne pas reprendre la marque Antares `Auto-Tune`). L’interface se limite à tonalité, gamme, retune speed et humanisation ; cette dernière pilote le paramètre openDAW `smooth`.

Décision de sécurité : conserver une piste sèche, basculer une seule piste à la fois avec `replaceTrack`, désactiver le retour casque par défaut et restaurer automatiquement la piste sèche sur erreur.

Décision de diffusion : `replaceTrack` et une progression RTP postérieure au remplacement ont été observés en Chromium headless (delta +19 paquets et +665 octets dans chaque sens). Cela valide le point d’injection local sur signal synthétique, mais une preuve Room distante reste bloquée par l’absence du transport RTC interactif dans ce dépôt.

Décision de licence : prototype interne possible pour évaluation ; **NO-GO production** tant qu’un accord commercial écrit et un bundle débarrassé des composants exclus n’ont pas été obtenus.
