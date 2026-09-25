# Preuve de concept openDAW — Autotune MeeWav

Date du rapport : 11 août 2026

Route interne : `/labs/correction-vocale`
Décision : **GO sous conditions pour poursuivre le prototype interne ; NO-GO production**

## 1. Résultat obtenu et limite de preuve

Le prototype fournit le chemin logiciel suivant :

```text
Microphone mono
  ├─→ piste sèche de secours
  └─→ AudioWorklet + moteur WASM openDAW + AutotuneDeviceBox
        → MediaStreamAudioDestinationNode
        → piste corrigée
        → VoiceCorrectionTrackRouter
        → RTCRtpSender.replaceTrack(...)
```

Le traitement reste local dans le navigateur. Aucun échantillon vocal n’est envoyé à un serveur pour calculer la correction.

La route de laboratoire permet de choisir réellement entre `Autotune openDAW` et le moteur AudioWorklet `Autotune MeeWav test`, sélectionner et activer un microphone, remplacer le moteur pendant une session, basculer explicitement entre signal sec et corrigé, appliquer les profils de comparaison Naturel/Précis/Effet, régler Tonalité, Gamme, Retune speed et Humanisation, activer volontairement le retour local, enregistrer une paire sec/corrigé démarrée dans la même tâche (8 secondes maximum), exporter l’état, le moteur sélectionné et les mesures en JSON ou CSV, puis exécuter une boucle WebRTC locale qui publie d’abord la piste sèche et appelle `replaceTrack` avec la piste corrigée. L’état moteur, la route réellement sélectionnée, les erreurs et le fallback sec sont visibles et inclus dans l’export. Les paramètres avancés openDAW restent internes au moteur et aux profils techniques ; ils ne surchargent pas le Mixeur public simplifié.

En développement Windows, cette même route expose aussi Spoton et Graillon 3 via le POC VST3 natif. Après confirmation explicite d’un casque filaire, le bouton de retour lance le trajet réel `micro de communication Windows → VST3 allowlisté → limiteur → sortie multimédia Windows par défaut`. Cette sortie correspond mieux à la destination utilisée par le navigateur et La Place. Le moteur Web est libéré avant ce lancement afin d’éviter une double capture et un double retour. Le serveur Vite ne considère le trajet actif qu’après réception du marqueur émis une fois le plugin et WASAPI réellement ouverts. Ce lanceur est limité au mode `audio-lab`, à la boucle locale, à un token de session injecté dans la page et aux deux identifiants canoniques allowlistés ; aucun chemin de plugin fourni par le navigateur n’est accepté.

Ce qui est prouvé automatiquement :

- versions et assets openDAW verrouillés ;
- intégrité, MIME attendu, magic bytes et hash des modules WASM ;
- compilation CLI de `engine.wasm` et `device_autotune.wasm` avec `WebAssembly.compile` ;
- exclusion des assets et du runtime openDAW du build MeeWav normal ;
- conversion et bornage des paramètres ;
- feature flag désactivé par défaut ;
- bascule sèche/corrigée par un seul slot `RTCRtpSender` ;
- fallback sec si la piste corrigée manque, se termine ou échoue au remplacement ;
- absence de publication simultanée de deux pistes dans le routeur ;
- nettoyage des listeners et retour sec lors du `dispose()` ;
- compilation TypeScript du prototype ;
- exécution de la page isolée dans Chromium headless avec capture audio factice et signal synthétique ;
- `AudioWorklet` et moteur WASM prêts à 48 kHz ;
- remplacement local de la piste par `RTCRtpSender.replaceTrack` ;
- transport continu après le remplacement dans une boucle WebRTC locale : 3/3 paquets avant, 22/22 après, delta +19/+19 paquets et +665/+665 octets.

Ce qui n’est **pas** prouvé dans cet environnement :

- la voix d’un vrai microphone traversant le WASM dans un navigateur ;
- l’écoute qualitative avec un casque filaire ;
- la stabilité pendant 15 minutes ;
- la latence acoustique entrée/sortie ;
- l’audio audible chez un second participant MeeWav distant ;
- Chrome/Edge/Android/Safari sur appareils réels.

Un navigateur automatisé était disponible : Chromium headless a exécuté le laboratoire avec un faux microphone et un signal synthétique. Il n’y avait en revanche ni microphone physique, ni casque, ni voix humaine à écouter. De plus, la Room Web actuelle n’expose aucun sender RTC réel : Supabase transporte l’état et Mux/HLS la vidéo publique, mais aucun média-plane interactif ne publie encore le microphone Web. La boucle WebRTC locale valide donc le graphe navigateur et le contrat d’injection, pas la qualité sonore ni une Room distante de production.

## 2. Ouvrir le prototype

Le feature flag normal est désactivé :

```dotenv
VITE_OPENDAW_VOICE_CORRECTION_LAB=false
```

Le mode interne `.env.audio-lab` l’active uniquement pour le laboratoire :

```powershell
npm install
npm run opendaw:assets:verify
npm run dev:audio-lab
```

Ouvrir ensuite :

```text
http://127.0.0.1:5178/labs/correction-vocale
```

La commande Vite ouvre normalement cette route automatiquement. Le mode `audio-lab` active les headers COOP/COEP, le plugin Vite ciblé `meewav-audio-lab-assets` et, en mode serveur uniquement, le lanceur local `meewav-audio-lab-native-monitor`. En développement, le premier sert uniquement le préfixe `/opendaw-wasm/` depuis `audio-lab-public/opendaw-wasm/` ; lors du build laboratoire, il copie uniquement ce dossier dans le véritable `outDir` du build. Le lanceur VST3 n’est ni exposé par le serveur normal ni inclus comme service dans un build statique. `publicDir` reste `public/` dans tous les modes : les assets MeeWav normaux sont donc préservés. La route est chargée uniquement si le mode compile-time est `audio-lab` **et** si `VITE_OPENDAW_VOICE_CORRECTION_LAB=true`. Un build normal reste donc fermé même si la variable est définie par erreur ; il n’active pas le plugin et ne contient ni les binaires ni le module runtime openDAW.

Chemin stable des ressources :

```text
/opendaw-wasm/0.0.11/
```

Avant d’autoriser le microphone, vérifier dans le diagnostic du laboratoire :

- `window.crossOriginIsolated = true` ;
- AudioWorklet disponible ;
- manifest disponible ;
- `engine.wasm` disponible ;
- `device_autotune.wasm` disponible ;
- aucune ressource renvoyée comme HTML.

## 3. Architecture livrée

### Abstraction moteur

`VoiceCorrectionEngine` est la seule API dont l’interface et la Room doivent dépendre :

```ts
initialize()
connectInput(stream)
updateSettings(settings)
setBypass(bypass)
setMonitoring(enabled)
getDryStream()
getProcessedStream()
getDiagnostics()
dispose()
```

L’implémentation `OpenDawVoiceCorrectionEngine` concentre :

- installation et préparation de `WasmEngine` ;
- préflight des ressources ;
- attente effective de `EngineWorklet.isReady()`, avec échec après 15 secondes plutôt qu’un faux état prêt ;
- construction du graphe openDAW minimal ;
- `CaptureAudioBox`, `AudioUnitBox` et `AutotuneDeviceBox` ;
- injection et récupération des bus AudioWorklet ;
- routage sec/corrigé à gains exclusifs ;
- monitoring séparé, à gain nul par défaut ;
- mesures disponibles de contexte et CPU ;
- fallback sur erreur d’initialisation, timeout/erreur Worklet ou piste micro terminée ;
- destruction des nœuds, pistes, listeners, Worklet et contexte possédé.

Le package `studio-sdk` est verrouillé et a été inspecté, mais son point d’entrée publié ne réexporte pas le moteur ou la box de correction. L’implémentation importe donc les packages constituants officiels (`studio-core-wasm`, `studio-core`, `studio-boxes`, `studio-adapters`, `studio-enums`, `lib-std`) aux versions exactes, plutôt que d’appeler une API SDK inexistante.

### Branchement au Mixeur

Le Mixeur conserve son architecture. Les deux choix expérimentaux deviennent :

- **Autotune openDAW** — visible uniquement derrière le feature flag ;
- **Moteur test MeeWav** — l’algorithme de comparaison déjà construit.

Voloco n’est plus proposé. Une ancienne préférence locale `voloco` est ignorée et revient à `none`.

L’interface publique Autotune expose uniquement :

- tonalité et gamme ;
- retune speed ;
- humanisation, mappée au paramètre openDAW `smooth`.

Le bypass et le retour casque restent des actions techniques séparées. Les
paramètres `amount`, `shift` et les préréglages restent dans le modèle interne
pour le moteur, les tests et la compatibilité des états enregistrés, mais ils ne
sont plus présentés comme réglages publics. Leurs valeurs internes sont :

| Préréglage | amount | retune | smooth | shift |
|---|---:|---:|---:|---:|
| Naturel | 0,55 | 0,35 | 0,82 | 0 |
| Précis | 0,88 | 0,72 | 0,45 | 0 |
| Effet | 1,00 | 1,00 | 0,08 | 0 |

Ces valeurs sont des points de départ UX, pas une validation artistique.

L’adapter Room `placeOpenDawPitchAdapter.ts` convertit le point d’insertion `AudioNode` existant en `MediaStream`, le traverse dans `OpenDawVoiceCorrectionEngine`, puis reconvertit sa sortie en `MediaStreamAudioSourceNode`. Il réutilise l’`AudioContext` de la Room et ne possède ni le micro original ni ce contexte. Son bus sec/corrigé commute sans mélange : initialisation refusée, Worklet en panne, piste traitée terminée ou mise à jour rejetée rétablissent la voix sèche. Lors d’un changement de moteur, `PlaceLocalAudioEngine` reconnecte la route sèche avant d’attendre le `dispose()` de l’ancien plugin. L’adapter n’est importé dynamiquement que lorsque le mode `audio-lab` et le feature flag sont actifs, ce qui permet au build normal de l’éliminer.

### Injection WebRTC

`VoiceCorrectionTrackRouter` possède un seul slot audio. Il utilise exclusivement `RTCRtpSender.replaceTrack` et ne crée jamais une deuxième publication :

- piste sèche au départ ;
- piste corrigée quand elle est demandée et vivante ;
- retour automatique à la piste sèche si la piste corrigée est absente, terminée ou refusée par le sender ;
- sérialisation des changements pour éviter les courses ;
- `dispose()` restaure la piste sèche en best effort.

Le laboratoire crée deux `RTCPeerConnection` locales, publie la piste sèche, négocie les pairs, relève les compteurs RTP, remplace la piste par la sortie corrigée, puis exige une progression des paquets **et** des octets dans les deux sens. Chromium headless a observé 3/3 paquets avant, 22/22 après, soit +19/+19 paquets et +665/+665 octets après le remplacement.

## 4. Dépendances verrouillées

| Dépendance directe | Version exacte |
|---|---:|
| `@opendaw/studio-sdk` | `0.0.166` |
| `@opendaw/studio-core-wasm` | `0.0.11` |
| `@opendaw/studio-boxes` | `0.0.104` |
| `@opendaw/studio-core` | `0.2.0` |
| `@opendaw/studio-adapters` | `0.2.0` |
| `@opendaw/studio-enums` | `0.0.84` |
| `@opendaw/lib-std` | `0.0.82` |

Les versions sont enregistrées dans `package.json`, `package-lock.json` et le manifest des assets. L’installation npm a signalé 6 vulnérabilités dans l’arbre complet, dépendances de développement incluses. La vérification finale `npm audit --omit=dev` isole 2 vulnérabilités de production (1 modérée, 1 élevée), toutes deux héritées de `react-router-dom@7.17.0` / `react-router@7.17.0`, avec correction annoncée dans `7.18.2`. Elles ne proviennent pas des packages openDAW. Cette mise à jour transverse n’a pas été appliquée aveuglément dans le chantier audio ; elle doit être traitée avec sa propre suite de régression.

Le clone de référence avait pour `HEAD` `2f9e60f…`, mais ce n’est pas un commit de release commun démontré. Les packages npm installés déclarent des `gitHead` différents et `studio-core-wasm` n’en déclare aucun ; seules les versions exactes et les API installées font foi pour ce prototype.

## 5. Ressources WASM

Le bundle source réservé au laboratoire se trouve dans `audio-lab-public/opendaw-wasm/0.0.11/`. Il contient 32 ressources vérifiées totalisant 4 308 637 octets, plus son `manifest.json`. Il comprend :

- `wasm-processor.js` ;
- `wasm-offline-worker.js` ;
- `processors.js` ;
- `wasm/engine.wasm` ;
- `wasm/plugins/device_autotune.wasm` ;
- les autres side modules codés en dur dans le loader openDAW `0.0.11` ;
- `wasm/stretch_wasm.wasm`.

Le vérificateur compare chaque fichier publié à la version installée dans `node_modules`, vérifie taille et SHA-256 et rejette un contenu HTML à la place du binaire. Vite sert les `.wasm` en `application/wasm` dans les essais HTTP officiels.

Dans le mode `audio-lab`, le plugin Vite ciblé copie ce répertoire vers `dist/opendaw-wasm/0.0.11/`, puis `npm run opendaw:assets:verify:dist` en vérifie à nouveau les 32 ressources. `publicDir` reste `public/` aussi bien dans le build normal que dans le build laboratoire. La différence est que le plugin n’est activé que par `vite build --mode audio-lab` : le résultat normal conserve tous les assets MeeWav habituels, mais ne contient aucun dossier openDAW ni signature du runtime. Le serveur normal n’a pas COOP/COEP ; sa réponse SPA HTML au chemin WASM absent est détectée et rejetée par le préflight.

Attention : `WasmEngine.ensureReady()` charge les 27 side modules déclarés par cette version, y compris `device_compressor.wasm` et `device_neural_amp.wasm`, même si MeeWav ne crée pas ces devices. Le manifest marque explicitement ce bundle `internal-prototype-only` et `productionApproved: false`.

## 6. Commandes réellement exécutées

### Vérification du registre

```powershell
npm view @opendaw/studio-sdk version
npm view @opendaw/studio-core-wasm version
npm view @opendaw/studio-boxes version
npm view @opendaw/studio-core version
npm view @opendaw/studio-sdk license
npm view @opendaw/studio-core-wasm license
```

### Dépendances MeeWav

```powershell
npm install --save-exact `
  @opendaw/studio-sdk@0.0.166 `
  @opendaw/studio-core-wasm@0.0.11 `
  @opendaw/studio-boxes@0.0.104 `
  @opendaw/studio-core@0.2.0 `
  @opendaw/studio-adapters@0.2.0 `
  @opendaw/studio-enums@0.0.84 `
  @opendaw/lib-std@0.0.82
npm run opendaw:assets:sync
npm run opendaw:assets:verify
```

Compilation binaire CLI réellement exécutée :

```powershell
@'
const { readFile } = await import('node:fs/promises');
for (const path of [
  'audio-lab-public/opendaw-wasm/0.0.11/wasm/engine.wasm',
  'audio-lab-public/opendaw-wasm/0.0.11/wasm/plugins/device_autotune.wasm',
]) {
  await WebAssembly.compile(await readFile(path));
  console.log(`WebAssembly.compile OK: ${path}`);
}
'@ | node --input-type=module -
```

### Dépôt openDAW officiel, hors bundle MeeWav

```powershell
git clone https://github.com/andremichelle/openDAW `
  "$env:LOCALAPPDATA\Temp\meewav-opendaw-official"
rustup target add wasm32-unknown-unknown
rustup toolchain install nightly --component rust-src
npm run cert
npm install
npm run build
npm run dev:studio
```

Le dernier script contient `CI=true` en syntaxe POSIX et a échoué sous PowerShell. L’équivalent effectivement utilisé depuis `packages/app/studio` a été :

```powershell
$env:CI='true'
npx vite --clearScreen false --host
```

Les scripts Bash officiels attendaient aussi `$HOME/.cargo/env`. L’environnement de test Windows a dû fournir ce fichier avec `$HOME/.cargo/bin` dans le `PATH`. `wasm-opt` est resté absent, car Binaryen est facultatif pour cette preuve.

Vérifications HTTP :

```powershell
curl.exe -k -I https://localhost:8080/
curl.exe -k -I https://localhost:8080/wasm-engine/wasm/engine.wasm
curl.exe -k -I https://localhost:8080/wasm-engine/wasm/plugins/device_autotune.wasm
```

Tests Rust réellement exécutés :

```powershell
cargo test -p device-autotune
cargo test -p dsp --test autotune_lab -- --nocapture
```

Tests MeeWav réellement exécutés le 11 août 2026 :

```powershell
npm run opendaw:assets:verify
npx vitest run src/features/rooms/voice-correction `
  src/features/rooms/place/PlaceMixer.voiceCorrection.test.tsx `
  src/features/rooms/place/placeOpenDawPitchAdapter.test.ts `
  src/features/rooms/place/placeLocalAudioEngine.test.ts
npm run typecheck
npm run build
npx vite build --mode audio-lab
npm run opendaw:assets:verify:dist
npm run voice-correction:candidates:validate
npm run voice-correction:corpus:verify
npm run voice-correction:latency:test
npm test
npm audit --omit=dev
```

## 7. Résultats automatisés

| Vérification | Résultat |
|---|---|
| Build officiel openDAW | 27/27 tâches réussies |
| Tests `device-autotune` | 3 réussis |
| Tests DSP `autotune_lab` | 2 réussis |
| Assets MeeWav | 32 ressources, 4 308 637 octets, vérification OK |
| Tests ciblés MeeWav | 14 fichiers, 54 tests réussis, incluant export, ABX exploratoire, captures non vides, fallback sec, Mixeur et routeur |
| Suite Vitest complète | 116 fichiers réussis sur 129 ; 762 tests réussis sur 806 ; 13 fichiers / 44 tests hors chantier restent en échec |
| TypeScript | `tsc --noEmit`, réussi |
| Build MeeWav normal | Réussi ; aucun asset `/opendaw-wasm/` ni signature du runtime openDAW dans `dist` |
| Build MeeWav `audio-lab` | Réussi |
| Assets du build `audio-lab` | 32 ressources, 4 308 637 octets, vérification `dist` réussie |
| Compilation CLI WASM | `engine.wasm` et `device_autotune.wasm` réussis avec `WebAssembly.compile` |
| Runtime MeeWav dans Chromium headless | Réussi sur page isolée, faux microphone et signal synthétique |
| AudioWorklet / WASM | Prêts à 48 kHz |
| Injection WebRTC locale | `replaceTrack` réussi ; avant 3/3, après 22/22, delta +19/+19 paquets et +665/+665 octets |
| Test Room distante | Non exécutable : sender RTC Room absent du dépôt |

Les échecs de la suite globale concernent notamment les fixtures/navigation historiques de La Place, La Scène, Marketplace, Messagerie et l'authentification de tests. Le test `place.fixtures.test.ts` attend déjà trois invités sur scène alors que la fixture versionnée avant ce chantier n'en contient qu'un. Les 14 fichiers ciblant l'Autotune, son fallback, le Mixeur, l'ABX, les exports et le routeur sont tous verts ; aucun échec global n'a été masqué ou corrigé hors périmètre.

### Preuve runtime automatisée

La page isolée `/labs/correction-vocale` a été exécutée dans Chromium headless avec une capture audio factice alimentée par un signal synthétique. Le diagnostic observé était :

| Diagnostic runtime | Valeur observée |
|---|---:|
| Isolation cross-origin | Active |
| `AudioWorklet` | Prêt |
| Moteur WASM openDAW | Prêt |
| Fréquence de l’`AudioContext` | 48 kHz |
| `audioContext.baseLatency` | 10 ms |
| `audioContext.outputLatency` | 41 ms |
| Latence DSP déclarée par le moteur | 27 ms |
| `RTCRtpSender.replaceTrack` | Réussi avec la piste traitée locale |
| Paquets RTP de la boucle locale | avant 3/3 ; après 22/22 ; delta +19/+19 paquets et +665/+665 octets |

Les statistiques RTP prouvent que des données audio ont circulé après le remplacement de piste dans la paire WebRTC locale. Elles ne prouvent ni que la correction est artistiquement satisfaisante, ni qu’un humain l’a entendue, ni qu’une Room distante la reçoit. Aucun microphone physique, aucun casque, aucune voix réelle et aucun second participant distant n’ont été utilisés pour cette preuve.

Les essais DSP openDAW sur signaux synthétiques ont rapporté les valeurs suivantes :

| Cas synthétique | Conservation vibrato | Erreur moyenne | Réponse observée |
|---|---:|---:|---:|
| Réglage par défaut | 58 % | 0,8 cent | 73 ms |
| Naturel | 81 % | 1,1 cent | 73 ms |
| Effet marqué | 8 % | 0,4 cent | 73 ms |
| Amount 50 % | 87 % | 24,1 cents | 105 ms |

Ces nombres proviennent de signaux de test, pas d’une voix humaine. La colonne « réponse » n’est ni la latence AudioContext, ni la latence casque, ni la latence WebRTC.

## 8. Mesures de latence

Il est essentiel de ne pas additionner arbitrairement des mesures de nature différente.

| Grandeur | Résultat réel | Méthode / statut |
|---|---:|---|
| Render quantum navigateur | 128 échantillons, soit 2,67 ms à 48 kHz | Granularité standard AudioWorklet, valeur théorique |
| Délai fixe PSOLA openDAW | 1 280 échantillons, soit 26,67 ms à 48 kHz | Estimation issue du code openDAW |
| Centre de fenêtre d’analyse YIN | environ 13 ms | Commentaire du code openDAW ; ne pas additionner naïvement au délai PSOLA |
| `audioContext.baseLatency` | 10 ms | Valeur exposée par Chromium headless pendant le test synthétique |
| `audioContext.outputLatency` | 41 ms | Valeur exposée par Chromium headless pendant le test synthétique |
| Latence DSP déclarée | 27 ms | Diagnostic du moteur, cohérent avec 1 280 échantillons à 48 kHz ; ce n’est pas une mesure acoustique |
| Retard entrée → sortie corrigée | Non mesuré | Nécessite signal de référence et corrélation |
| Surcoût openDAW réel | Non mesuré | Nécessite comparaison sec/corrigé enregistrée sur le même appareil |
| Retour casque filaire total | Non mesuré | Aucun casque/micro accessible |
| Retour casque Bluetooth | Non mesuré | Doit uniquement servir à illustrer le retard, pas de référence live |
| WebRTC jusqu’au second participant | Non mesuré | Aucun média-plane Room ni second appareil |
| CPU / mémoire / xruns sur 15 min | Non mesurés | Test navigateur long requis |

Aucune promesse de latence publique ne peut être faite à ce stade.

## 9. Procédure manuelle avec casque filaire

1. Brancher un casque filaire avant d’ouvrir le microphone. Ne pas utiliser les haut-parleurs pour ce test.
2. Fermer les autres applications susceptibles de monopoliser le micro.
3. Lancer `npm run dev:audio-lab` puis ouvrir `/labs/correction-vocale`.
4. Vérifier `crossOriginIsolated`, AudioWorklet et chaque ressource WASM dans Diagnostics.
5. Choisir le microphone et garder les traitements navigateur désactivés pour le premier essai.
6. Cliquer **Activer le microphone**. Vérifier le niveau d’entrée avant toute écoute.
7. Garder **Retour corrigé dans le casque** désactivé au départ.
8. Enregistrer 8 secondes de voix avec une note tenue, un glissando, du vibrato et une phrase chantée. Comparer les fichiers Originale/Corrigée.
9. Comparer **Bypass**, **Naturel**, **Précis** et **Effet** à niveau identique. Vérifier qu’il n’y a ni doublage ni effet de phase.
10. Activer ensuite le retour casque à faible volume. Comparer `baseLatency`, `outputLatency` et le délai ressenti.
11. Tester le bouton de preuve WebRTC locale ; attendre une route `processed`, une piste distante `live` et des paquets envoyés non nuls.
12. Retirer le micro pendant le test : la piste sèche doit rester/restaurer la route sûre et l’erreur doit être lisible.
13. Refaire le test avec traitements navigateur activés uniquement si le micro intégré donne un signal inutilisable.
14. Laisser tourner 15 minutes et consigner CPU, mémoire, erreurs Worklet, coupures et dérive.
15. Cliquer Réinitialiser, quitter la route et vérifier que l’indicateur système du microphone s’éteint.

Pour Spoton ou Graillon, ne pas activer d’abord le microphone Web. Choisir le plugin natif dans **Autotune**, cocher **Casque filaire branché**, puis cliquer **Activer le retour Spoton/Graillon**. Attendre l’état `Micro → VST3 → limiteur → casque actif`, vérifier les noms Entrée/Sortie affichés, puis couper le retour avant de changer de plugin. Les réglages Tonalité/Gamme/Retune/Humanisation du navigateur ne pilotent pas encore les paramètres propriétaires de ces VST3 et l’interface le signale explicitement.

Pour mesurer la latence acoustique, injecter un clic ou chirp de référence, enregistrer simultanément la source et la sortie et calculer le décalage par corrélation. Un `performance.now()` autour d’un setter de paramètre ne mesure pas la latence audio.

## 10. Matrice réellement testée

| Plateforme / périphérique | Testé | Résultat |
|---|---:|---|
| Node 24 / Windows, scripts et tests | Oui | Réussi selon section 7 |
| Serveur officiel openDAW HTTPS, vérification HTTP CLI | Oui | HTTP 200, COOP/COEP, MIME WASM correct |
| Compilation WASM sous Node | Oui | Moteur et module correction compilables ; aucun `AudioContext` impliqué |
| Chromium headless, capture audio factice | Oui | Page isolée ; Worklet et WASM prêts à 48 kHz ; `replaceTrack` réussi ; delta RTP +19/+19 paquets et +665/+665 octets |
| Serveur MeeWav `audio-lab` | Oui | COOP/COEP actifs, MIME WASM correct, assets servis par le plugin ciblé |
| Serveur MeeWav normal | Oui, niveau HTTP | Aucun COOP/COEP ; asset absent renvoyé en HTML puis rejeté par le préflight |
| Chrome Windows avec matériel réel | Non | Aucun microphone/casque physique accessible |
| Edge Windows avec matériel réel | Non | Aucun microphone/casque physique accessible |
| Chrome Android | Non | Aucun appareil accessible |
| Safari iPhone | Non | Aucun appareil accessible |
| Micro intégré | Non | Aucun accès matériel navigateur |
| Micro USB | Non | Aucun accès matériel navigateur |
| Casque filaire | Non | Aucun accès matériel navigateur |
| Casque Bluetooth | Non | Aucun accès matériel navigateur |
| Deuxième participant distant | Non | Média-plane Room absent et aucun second appareil |

Il serait incorrect de déclarer le microphone, le casque ou la qualité vocale « validés ».

## 11. Problèmes et risques constatés

1. **Transport Room manquant.** La sortie traitée existe, mais aucun sender RTC de Room ne la consomme encore.
2. **Validation audio réelle manquante.** Chromium headless a chargé le Worklet et le WASM dans un vrai `AudioContext`, mais uniquement avec une capture factice et un signal synthétique. La qualité vocale, le monitoring physique et la latence acoustique restent inconnus.
3. **Isolation cross-origin.** Une activation globale peut casser Mux, CDN, auth, iframes ou médias tiers ; elle reste limitée au mode laboratoire.
4. **Loader non minimal.** `ensureReady()` charge les 27 side modules, pas seulement la correction vocale.
5. **Licence contradictoire.** Les manifests npm annoncent LGPL-3.0-or-later alors que README/SDK annoncent AGPLv3+ ou licence commerciale. Les `gitHead` npm diffèrent aussi selon les packages ; aucun commit de release commun n’est revendiqué.
6. **Composants exclus présents.** Compressor CTAG et Neural Amp sont physiquement présents dans le bundle publié, même non instanciés.
7. **Script officiel Windows.** `CI=true` n’est pas portable sous PowerShell sans adaptation.
8. **Vulnérabilités npm.** Six alertes existent dans l’arbre complet. En production seulement, deux alertes React Router (1 modérée, 1 élevée) restent à corriger par une montée testée vers `7.18.2` ou ultérieure, sans upgrade aveugle de toute l'application.
9. **Support mobile.** Le studio officiel traite le mobile comme expérimental ; Android et Safari iOS doivent être validés séparément.
10. **Double capture potentielle.** Green House et Room peuvent encore ouvrir des captures distinctes.
11. **Ancien wording natif.** `VoiceFxEnginePanel.tsx`, hors nouvelle UI Place, contient encore des libellés publics Antares/Voloco. Il doit être corrigé ou rendu strictement interne avant acceptation de la nomenclature.

## 12. Limites sonores attendues

Le correcteur est monophonique. Les cas suivants ne sont pas officiellement pris en charge tant que l’écoute ne les a pas validés :

- deux voix ou davantage en même temps ;
- accords ;
- voix et instrument dans le même micro ;
- musique forte repassant dans le micro ;
- réverbération de pièce importante ;
- fondamentale sous environ 80 Hz ou au-dessus d’environ 1 100 Hz ;
- consonnes/bruits non voisés ;
- transitions rapides avec correction maximale ;
- Bluetooth pour un monitoring de chant en direct.

Les artefacts possibles sont : mauvais verrouillage d’octave, warble, attaques durcies, vibrato aplati, formants artificiels et instabilité sur signal polyphonique. Aucun de ces points n’a encore été évalué avec une voix humaine dans cet environnement.

## 13. Feature flag et sécurité de publication

Flag :

```text
VITE_OPENDAW_VOICE_CORRECTION_LAB
```

État par défaut : `false` dans `.env.example`.

État du laboratoire local : `true` uniquement dans `.env.audio-lab`, chargé par le mode Vite `audio-lab`.

Garde supplémentaire : `import.meta.env.MODE === "audio-lab"`. Le laboratoire et l’option openDAW du Mixeur exigent à la fois ce mode de build explicite et le feature flag ; le moteur test MeeWav reste disponible séparément. Le plugin Vite `meewav-audio-lab-assets` est désactivé dans le build normal et n’ajoute alors aucun binaire openDAW. Il ne remplace jamais `publicDir`, qui reste `public/` : les assets normaux de MeeWav sont conservés dans tous les modes.

Le retour casque est désactivé par défaut. La piste sèche reste disponible. Une bascule ne publie jamais sec + corrigé simultanément.

## 14. Retour en arrière exact

Retour immédiat, sans supprimer de code :

1. mettre `VITE_OPENDAW_VOICE_CORRECTION_LAB=false` ;
2. redémarrer Vite ;
3. sélectionner **Aucun** ou **Moteur test MeeWav** dans le Mixeur ;
4. appeler `VoiceCorrectionTrackRouter.useDry()` ou `dispose()` avant de libérer le moteur ;
5. vérifier que la piste micro originale est celle du sender.

Retrait complet du prototype dans une branche dédiée :

- supprimer la route et son import conditionnel dans `src/App.tsx` ;
- supprimer `src/features/rooms/voice-correction/` ;
- retirer l’option provider `opendaw` du Mixeur et de l’état Room ;
- retirer l’adapter openDAW du graphe Place ;
- supprimer `audio-lab-public/opendaw-wasm/`, `scripts/sync-opendaw-wasm.mjs`, `scripts/verify-opendaw-wasm.mjs` et `.env.audio-lab` ;
- retirer les sept dépendances openDAW exactes avec `npm uninstall` ;
- retirer les scripts npm et les headers `audio-lab` de `vite.config.js` ;
- exécuter tests, typecheck et build ;
- ne toucher à aucune migration Supabase, car ce prototype n’en ajoute aucune.

Ne pas utiliser un reset Git global : le worktree contient d’autres changements MeeWav à préserver.

## 15. Fichiers de l’expérimentation

Fichiers nouveaux :

- `.env.audio-lab`
- `scripts/sync-opendaw-wasm.mjs`
- `scripts/verify-opendaw-wasm.mjs`
- `audio-lab-public/opendaw-wasm/0.0.11/manifest.json`
- `audio-lab-public/opendaw-wasm/0.0.11/processors.js`
- `audio-lab-public/opendaw-wasm/0.0.11/wasm-processor.js`
- `audio-lab-public/opendaw-wasm/0.0.11/wasm-offline-worker.js`
- `audio-lab-public/opendaw-wasm/0.0.11/wasm/**`
- `src/features/rooms/voice-correction/VoiceCorrectionEngine.ts`
- `src/features/rooms/voice-correction/openDawVoiceCorrectionEngine.ts`
- `src/features/rooms/voice-correction/VoiceCorrectionLabPage.tsx`
- `src/features/rooms/voice-correction/voice-correction-lab.css`
- `src/features/rooms/voice-correction/voiceCorrection.flags.ts`
- `src/features/rooms/voice-correction/voiceCorrection.presets.ts`
- `src/features/rooms/voice-correction/voiceCorrection.types.ts`
- `src/features/rooms/voice-correction/voiceCorrectionLab.media.ts`
- `src/features/rooms/voice-correction/voiceCorrectionLab.utils.ts`
- `src/features/rooms/voice-correction/voiceCorrectionTrackRouter.ts`
- tests `*.test.ts`/`*.test.tsx` correspondants dans le même dossier
- `src/features/rooms/place/PlaceMixer.voiceCorrection.test.tsx`
- `src/features/rooms/place/placeOpenDawPitchAdapter.ts`
- `src/features/rooms/place/placeOpenDawPitchAdapter.test.ts`
- `docs/opendaw-voice-correction-audit.md`
- `docs/opendaw-voice-correction-poc.md`

Fichiers modifiés pour le branchement et le flag :

- `.env.example`
- `package.json`
- `package-lock.json`
- `vite.config.js`
- `src/vite-env.d.ts`
- `src/App.tsx`
- `src/features/rooms/place/PlaceMixer.tsx`
- `src/features/rooms/place/PlaceRoomExperience.tsx`
- `src/features/rooms/place/place-room-premium.css`
- `src/features/rooms/place/placeLocalAudioEngine.ts`
- `src/features/rooms/place/placeMeeWavPitchAdapter.ts`
- `src/features/rooms/place/place.types.ts`
- `src/features/rooms/place/place.fixtures.ts`
- `src/features/rooms/place/place.fixtures.test.ts`
- `src/features/rooms/place/place.service.ts`

Le diff final doit être relu avant commit pour exclure les modifications MeeWav sans rapport avec l’expérimentation.

## 16. Licence : bilan et questions à transmettre

Constats vérifiés :

- le README principal et le README SDK du commit audité annoncent AGPL v3 ou ultérieure, ou une licence commerciale pour un produit fermé/SaaS ;
- les manifests du monorepo et les manifests npm publiés annoncent `LGPL-3.0-or-later` ;
- les `gitHead` des packages npm ne sont pas uniformes et `studio-core-wasm` n’en fournit pas ; le `HEAD` du clone ne prouve donc pas à lui seul une release combinée ;
- le README SDK exclut explicitement Compressor CTAG, Neural Amp/Tone3000 et AI Tempo Detection de la licence commerciale ;
- le bundle publié `studio-core-wasm@0.0.11` contient Compressor et Neural Amp et le loader les référence ;
- aucun message n’a été envoyé au créateur.

Cette contradiction doit être résolue par écrit avant toute diffusion publique. Questions préparées pour `andre.michelle@opendaw.org`, à n’envoyer qu’après autorisation :

1. Quelle licence fait foi pour les versions exactes SDK/WASM/Boxes/Core utilisées : LGPL déclarée dans npm ou AGPL/commerciale décrite dans les README ?
2. La licence commerciale couvre-t-elle explicitement `AutotuneDeviceBox`, `device_autotune.wasm`, `engine.wasm`, le Worklet et toutes leurs dépendances indispensables ?
3. Un SaaS qui télécharge ces binaires dans le navigateur entre-t-il bien dans le périmètre commercial convenu ?
4. Un bundle commercial minimal, sans CTAG Compressor, Neural Amp/Tone3000 ni AI Tempo Detection, peut-il être fourni ?
5. Sinon, quelle procédure de build officielle permet d’exclure réellement ces modules de la table hardcodée et des binaires distribués ?
6. Les side modules non instanciés mais téléchargés sont-ils considérés comme « distribués » au regard de l’accord ?
7. Quels avis de copyright, attributions et fichiers de licence doivent accompagner le bundle commercial ?
8. Les modifications/adapters MeeWav autour du moteur doivent-ils être communiqués au fournisseur ou faire l’objet d’un audit ?
9. Quelles plateformes et versions de navigateur openDAW garantit-il pour ce module en temps réel ?
10. Existe-t-il des engagements de support, sécurité et notification de vulnérabilité pour les versions commerciales ?

## 17. Recommandation

### GO sous conditions — prototype interne

Poursuivre un test manuel contrôlé sur Chrome/Edge Windows avec micro USB ou intégré et casque filaire. Le code est isolé, réversible, derrière un flag OFF par défaut et conserve une piste sèche.

Conditions avant de dire « prototype fonctionnel validé » :

1. entendre et enregistrer une voix réellement corrigée avec un microphone et un casque filaire ;
2. mesurer la latence entrée/sortie par corrélation sur matériel réel ;
3. tenir 15 minutes sans coupure ;
4. retester mute, changement de micro, reset et fermeture avec des périphériques physiques ;
5. intégrer un vrai sender RTC de Room et valider avec un second appareil distant.

### NO-GO — production publique

Ne pas mettre cette expérimentation en production tant que :

- les tests matériels et navigateurs ne sont pas terminés ;
- le média-plane Room n’existe pas ;
- la chaîne distante n’est pas audible et mesurée ;
- l’impact COOP/COEP sur toute la plateforme n’est pas validé ;
- les vulnérabilités npm ne sont pas triées ;
- la contradiction de licence n’est pas résolue ;
- un accord commercial écrit et un bundle sans composants exclus ne sont pas disponibles.

La conclusion honnête est donc : **la base technique est suffisamment solide pour continuer l’évaluation interne, mais aucune validation sonore ni autorisation de production n’est encore acquise.**
