# MeeWav Audio Bridge et correcteurs vocaux — bilan du prototype 2026

Date : 11 août 2026
Branche : `task/rooms`
Périmètre : laboratoire interne et preuves techniques locales
Déploiement public : **aucun**

## Verdict

Le Bridge existant n'a pas été réécrit. Le chantier a réutilisé :

- le squelette C++20/CMake `apps/meewav-audio-engine` ;
- son scanner et son registre de plugins ;
- la sonde VST3 et le POC WASAPI Windows ;
- l'abstraction Web `VoiceCorrectionEngine` ;
- le graphe audio local de La Place ;
- le routeur `RTCRtpSender.replaceTrack` du laboratoire ;
- le laboratoire openDAW déjà isolé derrière un feature flag.

Les ajouts portent sur le plan de contrôle local authentifié, les preuves VST3 versionnées, le registre des seize candidats, le corpus commun, les mesures par corrélation, les exports et un essai ABX exploratoire.

Décision globale :

- **GO SOUS CONDITIONS** pour poursuivre le laboratoire interne ;
- **NO-GO production** aujourd'hui ;
- **aucun vainqueur acoustique** ne peut être annoncé sans vraie voix, casque filaire, mesures physiques et écoute aveugle alignée.

Les conditions manquantes sont listées dans la section « Interventions manuelles ».

## Ce qui fonctionne réellement

### Navigateur / openDAW et moteur MeeWav test

La route interne est :

```text
/labs/correction-vocale
```

En mode `audio-lab`, elle propose désormais un vrai choix entre `Autotune openDAW` et `Autotune MeeWav test`. openDAW charge son Worklet et son bundle WASM ; le moteur MeeWav réutilise le véritable AudioWorklet YIN/quantification/doubles délais déjà branché dans la Room. Les deux conservent une piste sèche, produisent une piste traitée et peuvent être remplacés pendant une session sans simple changement cosmétique. Le laboratoire permet aussi la bascule Sec/Corrigé, les profils Naturel/Précis/Effet, l'enregistrement groupé des deux routes, l'export JSON/CSV avec identifiant moteur et une boucle WebRTC locale utilisant `RTCRtpSender.replaceTrack`.

Le même sélecteur rend désormais visibles `Autotune Spoton` et `Autotune Graillon 3` comme VST3 natifs vérifiés. Leur fiche fournit la commande réelle du POC casque. Ils ne sont jamais marqués actifs et ne remplacent pas le moteur Web tant que le Bridge natif n'expose ni host de production ni plan audio ; cette séparation évite toute simulation.

Les huit gammes affichées sont maintenant mappées dans le DSP MeeWav : Chromatique, Majeure, Mineure, Pentatonique majeure, Pentatonique mineure, Blues, Dorienne et Mixolydienne. Ce moteur reste expérimental et ne revendique aucune équivalence avec un plugin commercial.

La preuve automatisée existante a observé, dans Chromium headless avec un faux périphérique audio :

- `crossOriginIsolated = true` ;
- AudioWorklet et moteur WASM prêts à 48 kHz ;
- `baseLatency = 10 ms` et `outputLatency = 41 ms` rapportées par ce contexte automatisé ;
- délai architectural openDAW déclaré par l'intégration : 1 280 samples, soit environ 26,67 ms à 48 kHz ;
- remplacement de piste réussi ;
- progression RTP locale après remplacement : +19 paquets et +665 octets dans chaque sens.

Ce test ne constitue ni une écoute, ni une mesure acoustique, ni une preuve avec un second participant MeeWav distant.

### Hôte VST3 natif

La sonde Windows est séparée du navigateur et du registre de production. Elle n'accepte pas de chemin de plugin arbitraire. Les plugins installés sont résolus depuis les emplacements VST3 standards ; les candidats open source du laboratoire utilisent des IDs explicites vers des chemins relatifs fixes sous une racine locale.

Le signal de sonde est un signal déterministe « vocal-like » de 3 secondes suivi d'une seconde de queue, traité par blocs de 128 samples à 48 kHz. Il ne remplace pas une voix enregistrée.

| Candidat réellement sondé | Révision source | Métadonnée VST3 embarquée | Résultat DSP | Latence rapportée par le plugin | SHA-256 binaire |
|---|---|---|---|---:|---|
| QPitch | `v1.3.1` / `a0a95f103d2715650462344c1be3dfad4e2e9290` | `1.1.0` (upstream non synchronisé) | 3 sorties finies, non silencieuses et bornées ; hash identique `300c1e46d9472fe7` | 0 sample | `ABE772CC1D521FDF69BE311DC831FBA42AFA80E18715FC64E2835EDA00EBD8BA` |
| OpenVoxTuner | `v0.1.67` / `5570e8a6bf8e686c33c7971563c3d757f9c394d6` | `0.1.67` | 4 sorties finies, non silencieuses et bornées, mais non identiques bit à bit | 576 samples / 12 ms | `83011D254570D05B49958035E25736B1F2AB2E865CF4A6DB351FF51F06B18122` |
| Spoton | installation locale signée fournie par l'utilisateur | `1.1.2`, class ID `ABCDEF019182FAEB536978744C737733` | 4 sorties finies, non silencieuses et bornées ; hash identique `d8e05a3bb47db633` | 0 sample déclaré | `AA3D5C381FC77E1388F9F224512F4B5EA65A5F2BC62775FB039E13EAE2FF349C` |
| Graillon 3 Free | installation locale signée fournie par l'utilisateur | `3.2.0`, class ID `0B20BA920CE0B1456E62754133317340` | 4 sorties finies, non silencieuses et bornées ; hash identique `9bc560090eec634f` | 1 074 samples / 22,375 ms déclarés | `867103FEC0EC6B785E0D92A0EB5FB7C13961E740E469BA037DA7E936B1B99509` |
| Auto-Tune Pro installé | 11.0.0, différent d'AutoTune 2026 | 11.0.0 | non-régression de la sonde synthétique | 2 670 samples / 55,625 ms | `38C42D0B4B260FA72E7ED4AF58CB9E271CC48C9FC72372463254F040BBBF76F3` |

Les hashes FNV de sortie ne sont pas des notes de qualité. QPitch, Spoton et Graillon ont produit un hash stable lors des exécutions consécutives. OpenVoxTuner a produit des hashes différents entre quatre instanciations ; deux builds successifs ont aussi produit des binaires différents (`BDF635D6…`, puis `83011D25…`). Sa reproductibilité bit à bit reste donc à investiguer avec des tolérances audio et binaires adaptées.

Le companion Silvertune `companion-v0.4.0` / `7b9be1fb65e71eff2f274ddafbd12868c27bc171` a également été compilé en Release x64 sans modifier sa source. Son Worklet exact a passé la vérification syntaxique et ses références locales ont été résolues. Le binaire principal a pour SHA-256 `17604C5237262B70F8FDD16F510263861940DF1DA285AEB04B3AD8A40E9A6A78`. Un second build réussi a produit `EF5AEC8D475C883663CB43049F3F80D0C5DC56945DEA3C9F407E2125B43C75CA` : la compilation est répétable, mais pas bit à bit. Le companion n'a pas été lancé et aucun périphérique audio n'a été ouvert.

### Plan de contrôle du Bridge

Le POC Windows expose un serveur HTTP/1.1 borné sur `127.0.0.1` uniquement. Il ajoute :

- origin exacte en allowlist ;
- HMAC-SHA256 via Windows CNG ;
- session et secret uniquement injectés par variables d'environnement ;
- fenêtre temporelle, expiration et cache anti-replay ;
- comparaison de signature en temps constant ;
- limites de headers, body, réponse et temps de lecture ;
- rejet de `Transfer-Encoding`, des headers dupliqués, du pipelining et d'un `Host` différent de l'endpoint loopback ;
- CORS et Private Network Access limités à l'origine autorisée ;
- contrat de watchdog représenté par un bypass forcé et un retour au micro navigateur ; la reprise après crash natif n'est pas encore validée de bout en bout.

Le serveur répond honnêtement `audioPlane: unavailable` et `roomPublication.status: unavailable`. Il refuse de désactiver le bypass tant qu'aucun backend audio/plugin n'est associé. Il ne transporte actuellement ni PCM ni piste WebRTC.

## Registre obligatoire des seize candidats

La source machine-readable est [`experiments/voice-correction/candidates.json`](../experiments/voice-correction/candidates.json). Les preuves Windows reproductibles sont consignées séparément dans `experiments/voice-correction/windows-evidence.json` lorsqu'elles existent.

| # | Candidat | Statut après ce chantier | Conclusion honnête |
|---:|---|---|---|
| 1 | Spoton | `TESTÉ_PARTIELLEMENT` | VST3 signé 1.1.2 installé, identité exacte et DSP synthétique vérifiés ; aucune écoute |
| 2 | OpenVoxTuner | `TESTÉ_PARTIELLEMENT` | tag exact compilé, 102 tests upstream verts et passage DSP VST3 ; aucune écoute |
| 3 | Graillon 3 Free | `TESTÉ_PARTIELLEMENT` | VST3 signé 3.2.0 installé, identité exacte et DSP synthétique vérifiés ; aucune écoute |
| 4 | QPitch | `TESTÉ_PARTIELLEMENT` | tag exact compilé en VST3/CLAP et passage DSP VST3 ; aucune écoute |
| 5 | Silvertune | `BLOQUÉ_PAR_ENVIRONNEMENT` | companion taggé compilé et Worklet syntaxiquement valide, mais aucun passage audio commun ; licence absente du dépôt |
| 6 | AutoTune 2026 | `BLOQUÉ_PAR_LICENCE_OU_ACTIVATION` | version exacte absente ; Auto-Tune Pro 11 détecté n'est pas ce candidat |
| 7 | openDAW Autotune | `TESTÉ_PARTIELLEMENT` | Worklet/WASM et loopback RTC local synthétique ; pas de vraie voix ni Room distante |
| 8 | libsonare | `BLOQUÉ_PAR_ENVIRONNEMENT` | source native annonce Windows non pris en charge ; environnement Linux/WSL exploitable absent |
| 9 | Autotone | `NON_TEMPS_RÉEL_CONFIRMÉ` | pipeline après enregistrement, pas un correcteur live confirmé |
| 10 | Autotalent | `BLOQUÉ_PAR_ENVIRONNEMENT` | LADSPA/Linux requis ; URL GitHub du prompt disparue, source Debian résolue |
| 11 | TalentedHack | `BLOQUÉ_PAR_ENVIRONNEMENT` | LV2/Linux requis |
| 12 | x42/fat1 | `BLOQUÉ_PAR_ENVIRONNEMENT` | LV2/Linux requis |
| 13 | MXTune | `NON_REPRODUCTIBLE` | tag `v1.2.0` exact : configuration standard et avec policy 3.5 en échec sur une source JUCE Unity générée absente |
| 14 | MusicAI | `NON_REPRODUCTIBLE` | tests source en échec et implémentation explicitement simplifiée/placeholder |
| 15 | Loukai | `BLOQUÉ_PAR_ENVIRONNEMENT` | chemin Worklet continu présent, mais pas encore isolé et traversé par le corpus |
| 16 | BERT-APC | `NON_REPRODUCTIBLE` | dépôt de démonstration statique, sans code d'inférence ni poids |

`TESTÉ_PARTIELLEMENT` signifie ici « chargement et trajet DSP reproductibles sur signal synthétique ». Aucun candidat n'a le statut `TESTÉ`, réservé à une validation vocale réelle avec mesures et écoute.

## Corpus et comparaisons

Le manifeste [`experiments/voice-correction/corpus.manifest.json`](../experiments/voice-correction/corpus.manifest.json) couvre :

- 19 prises vocales manuelles obligatoires, encore absentes et hors Git ;
- 5 signaux mathématiques générés localement et vérifiés par SHA-256 ;
- les cas limites monophoniques : plusieurs voix, voix + instrument, forte réverbération et musique repassant dans le micro.

Les signaux générés servent uniquement au smoke test, à la latence et au trajet audio. Ils ne servent pas à noter le naturel d'une voix.

Le laboratoire contient maintenant un ABX de discrimination : A = sec, B = corrigé, X est tiré aléatoirement. Il affiche explicitement que les prises MediaRecorder ne sont pas encore alignées sample par sample ni égalisées au même niveau perçu. Le résultat ne doit pas être utilisé comme score de qualité.

Le module de mesure par corrélation fournit médiane, p95 et pire cas sur des paires de signaux. Une vraie mesure micro → casque exige toujours un loopback physique et n'a pas été exécutée.

## Latence

`null` ou « non mesuré » est volontaire : aucune valeur n'est déduite de `performance.now()` autour d'une fonction JavaScript.

| Candidat / trajet | Sample rate | Buffer | Latence déclarée/rapportée | Latence DSP mesurée par corrélation | Micro → casque filaire | Second participant |
|---|---:|---:|---:|---:|---:|---:|
| openDAW Autotune | 48 kHz | Worklet navigateur | 1 280 samples / 26,67 ms selon l'architecture inspectée | non mesurée acoustiquement | non mesurée | non mesurée |
| QPitch v1.3.1 | 48 kHz | 128 samples dans la sonde | 0 sample rapporté | non mesurée | non mesurée | non mesurée |
| OpenVoxTuner v0.1.67 | 48 kHz | 128 samples dans la sonde | 576 samples / 12 ms rapportés | non mesurée | non mesurée | non mesurée |
| Auto-Tune Pro 11.0.0, référence locale seulement | 48 kHz | 128 samples dans la sonde | 2 670 samples / 55,625 ms rapportés | non mesurée | non mesurée | non mesurée |
| 13 autres candidats | — | — | voir le registre | non mesurée | non mesurée | non mesurée |

Le contexte Chromium automatisé a rapporté 10 ms de `baseLatency` et 41 ms d'`outputLatency`. Ces valeurs décrivent ce contexte factice, pas un périphérique utilisateur ni une latence totale garantie.

## CPU, mémoire et dropouts

| Environnement | CPU moyen/pic | Mémoire | Xruns/dropouts | Durée stable |
|---|---:|---:|---:|---:|
| openDAW Chromium headless, faux micro | non archivé comme mesure de référence | non mesurée | aucun compteur matériel disponible | test court uniquement |
| QPitch VST3 synthétique | non mesuré | non mesurée | aucun device audio ouvert | 4 s de signal |
| OpenVoxTuner VST3 synthétique | non mesuré | non mesurée | aucun device audio ouvert | 4 s de signal |
| Spoton VST3 synthétique | 0 sample déclaré par le plugin | non mesurée | aucun device audio ouvert | 4 s de signal, 4 exécutions |
| Graillon VST3 synthétique | 1 074 samples / 22,375 ms déclarés | non mesurée | aucun device audio ouvert | 4 s de signal, 4 exécutions |
| Auto-Tune Pro 11 synthétique | non mesuré | non mesurée | aucun device audio ouvert | test court uniquement |

Le test 15 minutes, la charge par cœur, les allocations temps réel et la dérive de clocks restent des validations manuelles obligatoires. Aucune valeur n'a été inventée.

## Métriques de correction et écoute

Non mesurées dans cet environnement :

- erreur en cents et gross pitch error ;
- notes cibles correctes et erreurs d'octave ;
- voiced/unvoiced ;
- préservation du vibrato, des formants et des transitoires ;
- LUFS/crête vraie, bruit ajouté, clics et artefacts ;
- scores humains de justesse, naturel, timbre, artefacts et préférence.

Il n'y a donc pas de classement sonore général fiable. Le classement technique provisoire par usage est :

1. **intégré navigateur/mobile à poursuivre** : openDAW, sous clarification licence et mesures réelles ;
2. **plugins gratuits natifs à écouter en priorité** : QPitch et OpenVoxTuner, sans vainqueur avant ABX correctement aligné ;
3. **open source à approfondir/licencier** : openDAW et OpenVoxTuner, avec revue copyleft/commerciale ;
4. **référence professionnelle locale** : plugin Antares légitimement installé par l'utilisateur ; AutoTune 2026 exact reste absent ;
5. **référence hors-ligne future** : aucune recommandation BERT-APC tant que moteur et poids ne sont pas publiés.

## WebRTC et Rooms

Le laboratoire prouve un `replaceTrack` dans une boucle RTC locale. Le dépôt Web audité ne contient pas de sender audio interactif de Room : Supabase transporte l'état et Mux/HLS le flux public. Le Bridge natif expose lui-même `audioPlane: unavailable`.

Par conséquent :

- aucune piste native VST3 n'a atteint une Room réelle ;
- aucun second participant distant n'a reçu la voix corrigée ;
- la reconnexion Room, le changement de micro pendant la Room et le fallback après crash du processus natif ne sont pas validés de bout en bout ;
- la piste sèche navigateur reste la seule sortie de secours autorisée.

## Sécurité

Points validés par tests :

- bind loopback strict ;
- authentification HMAC-SHA256 ;
- session expirante et anti-replay ;
- origin exacte et CORS/PNA limité ;
- aucune valeur secrète imprimée ;
- aucun chemin de DLL/VST3 fourni par le navigateur ;
- IDs de candidats et chemins relatifs fixes pour le laboratoire ;
- refus d'un chemin arbitraire ;
- endpoints control-only fail-closed ;
- impossible d'activer la chaîne sans backend ;
- contrat de watchdog validé au niveau état par bypass et maintien du micro sec, sans preuve de crash/reprise native de bout en bout ;
- tailles et délais HTTP bornés.

Points restant avant production :

- backend de pairing avec ticket court signé ;
- audio plane PCM ou publication RTC native ;
- sandbox par plugin et scanner réellement externe avec timeout/crash quarantine ;
- signature du binaire, installateur, protocole custom et mises à jour signées ;
- stockage chiffré des états de plugin ;
- audit fuzzing du parseur HTTP ;
- suppression du secret prépartagé de huit heures au profit du pairing backend prévu.

## Licences

Le registre détaille chaque candidat. Les blocages majeurs sont :

- **openDAW** : dépôt AGPL/commercial mais manifests npm LGPL ; bundle WASM global charge des modules potentiellement exclus du contrat commercial ; confirmation écrite et bundle propre requis ;
- **OpenVoxTuner** : AGPL-3.0 et licence commerciale annoncée ; accord adapté à MeeWav requis ;
- **QPitch** : GPL-3.0, JUCE et dépendances à auditer ; pas d'intégration dans le code fermé sans décision juridique ;
- **Silvertune** : aucune licence trouvée, donc redistribution interdite en l'état ;
- **Spoton, Graillon, Antares** : charger localement une copie légitime ne donne aucun droit de redistribution ou d'hébergement cloud ;
- **JUCE** : une application MeeWav fermée exige la licence appropriée ; la licence MIT du SDK VST3 ne couvre pas JUCE ;
- **MusicAI/BERT-APC** : code, binaires, modèles, poids et données doivent être vérifiés séparément.

Aucune protection iLok/PACE ni activation éditeur n'a été contournée. Les installations silencieuses Spoton et Graillon ont été lancées uniquement après la demande explicite de l'utilisateur ; aucun compte, mot de passe ou secret éditeur n'a été transmis à MeeWav.

## Dépendances et versions

Aucune nouvelle dépendance runtime Web n'a été ajoutée pendant ce complément : le Bridge et le laboratoire déjà présents ont été réutilisés. Le lockfile contient toujours les versions exactes openDAW réellement installées :

- `@opendaw/studio-sdk@0.0.166` ;
- `@opendaw/studio-core-wasm@0.0.11` ;
- `@opendaw/studio-boxes@0.0.104` ;
- `@opendaw/studio-core@0.2.0`.

Les builds candidats restent hors dépôt et hors bundle MeeWav. QPitch utilise JUCE `8.0.8` (`d6181bde…`) et `clap-juce-extensions` au commit `c1a5ad02…`. Le SDK VST3 Steinberg utilisé par la sonde reste lui aussi externe au dépôt. Aucun binaire candidat n'est commité. Spoton et Graillon ont été installés dans les emplacements plugins Windows uniquement à la demande explicite de l'utilisateur ; MeeWav ne contient ni leurs archives ni leurs installateurs.

## Validation exécutée

| Vérification | Résultat du 11 août 2026 |
|---|---|
| Tests ciblés Web audio | 16 fichiers, **60/60 tests réussis** |
| TypeScript | `tsc --noEmit`, réussi |
| ESLint ciblé | réussi |
| Registre candidats | 16/16 fiches valides ; Spoton, Graillon, QPitch, OpenVoxTuner et Silvertune sont recoupés avec les preuves Windows archivées |
| Corpus | 24 cas décrits : 19 manuels absents, 5 synthétiques présents et SHA-256 vérifiés |
| Mesure par corrélation | 4/4 tests réussis |
| Assets openDAW | 32 fichiers, 4 308 637 octets, vérifiés |
| Build Web normal | réussi ; runtime et assets openDAW absents du résultat normal |
| Build Web `audio-lab` | réussi ; 32 assets openDAW présents et vérifiés |
| Tests C++ Bridge | CTest **2/2 réussis** en Debug et Release |
| POC VST3 | Spoton, Graillon, QPitch et OpenVoxTuner chargés depuis IDs fixes ; signal 48 kHz/128 traité ; chemin arbitraire rejeté ; matcher live Spoton/Graillon validé en mode sans périphérique |
| Suite Vitest complète | 116 fichiers / 762 tests réussis ; 13 fichiers / 44 tests hors audio en échec, sur 806 tests |
| Audit npm production | 2 alertes héritées : 1 modérée et 1 élevée dans React Router ; correctif disponible, upgrade non inclus hors périmètre |
| Navigateur interactif de cette exécution | indisponible dans l'outil intégré (`0` navigateur attaché) ; aucune prétention de nouveau test manuel |

Les 44 échecs globaux concernent des suites existantes hors de ce chantier (Messagerie, Shorts/La Scène, Marketplace, navigation, profil et fixture de La Place). Les 54 tests ciblant ce chantier sont tous verts. La preuve Chromium headless openDAW documentée plus haut provient de la validation automatisée existante du prototype ; elle n'a pas été présentée comme un nouveau test matériel.

## Feature flags et rollback

| Élément | État par défaut |
|---|---|
| `VITE_OPENDAW_VOICE_CORRECTION_LAB` | `false` hors mode `audio-lab` |
| route `/labs/correction-vocale` | inaccessible dans le build normal |
| assets openDAW | exclus du build normal |
| `MEEWAV_AUDIO_BUILD_CONTROL_POC` | `OFF` |
| `MEEWAV_AUDIO_WITH_VST3_SDK` | `OFF` |
| JUCE | `OFF` |
| allowlist production QPitch/OpenVox/Silvertune | non ajoutée |

Rollback fonctionnel immédiat : garder les flags désactivés. Le build normal n'importe ni le runtime openDAW ni le control POC. Pendant un test, sélectionner Sec ou couper le processus natif ; le routeur et le graphe Web restaurent la piste sèche.

Rollback Git du commit livré : utiliser un `git revert <commit>` après avoir vérifié la branche, jamais un reset destructif.

## Commandes d'utilisation

### MeeWav et laboratoire

```powershell
npm ci
npm run opendaw:assets:verify
npm run dev:audio-lab
```

Ouvrir `http://127.0.0.1:5178/labs/correction-vocale`.

### Validation du corpus et du registre

```powershell
npm run voice-correction:candidates:validate
npm run voice-correction:corpus:generate
npm run voice-correction:corpus:verify
npm run voice-correction:latency:test
```

### Bridge control-only Windows

```powershell
& 'C:\Program Files\Microsoft Visual Studio\18\Community\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe' `
  -S apps/meewav-audio-engine `
  -B apps/meewav-audio-engine/build-control-final-x64 `
  -G 'Visual Studio 18 2026' -A x64 `
  -DMEEWAV_AUDIO_BUILD_TESTS=ON `
  -DMEEWAV_AUDIO_BUILD_CONTROL_POC=ON

& 'C:\Program Files\Microsoft Visual Studio\18\Community\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe' `
  --build apps/meewav-audio-engine/build-control-final-x64 --config Release

ctest --test-dir apps/meewav-audio-engine/build-control-final-x64 -C Release --output-on-failure
```

Le lancement manuel exige trois valeurs de session non secrètes dans Git et un secret aléatoire fourni uniquement par l'environnement :

```powershell
$env:MEEWAV_AUDIO_CONTROL_SESSION_ID='<base64url 22-128 caractères>'
$env:MEEWAV_AUDIO_CONTROL_SESSION_SECRET='<32 octets aléatoires en base64url sans padding>'
$env:MEEWAV_AUDIO_CONTROL_ORIGIN='http://127.0.0.1:5178'
apps\meewav-audio-engine\build-control-final-x64\Release\meewav-control-poc.exe --run-internal-control-poc
```

Ce processus ne transporte pas encore l'audio.

### Sonde VST3 exacte

Le SDK Steinberg et les sources candidates restent hors dépôt. Après leurs builds reproductibles :

```powershell
apps\meewav-audio-engine\build-vst3-poc\Release\meewav-vst3-poc.exe `
  --target sixthsample.spoton `
  --target auburnsounds.graillon3 `
  --target meewav.lab.qpitch-v1.3.1 `
  --target meewav.lab.openvoxtuner-v0.1.67 `
  --candidate-root C:\Users\linkw\Desktop\Meewav-Audio-Candidate-Builds
```

Le POC live WASAPI ne doit être lancé qu'avec un vrai casque filaire et une activation éditeur légitime : voir `apps/meewav-audio-engine/docs/windows-live-poc.md`.

### Reproduction des builds candidats Windows

```powershell
powershell -ExecutionPolicy Bypass -File experiments\voice-correction\build-windows-candidates.ps1
```

Le parcours standard clone si nécessaire puis construit QPitch, OpenVoxTuner et le companion Silvertune dans `%LOCALAPPDATA%\MeeWav`, avec worktrees détachés propres et commits fixes. MusicAI, dont les tests upstream sont connus en échec, exige l'option explicite `-IncludeKnownFailingMusicAI` et n'est pas inclus dans `All`. Le script refuse les racines larges ou imbriquées, ne supprime rien, n'installe aucun plugin système et ne lance aucun executable susceptible d'ouvrir un périphérique audio. Les commandes exactes, hashes et limites de chaque build sont archivés dans `experiments/voice-correction/windows-evidence.json`.

## Interventions manuelles indispensables

1. Utiliser un microphone réel et un casque **filaire**, ouvrir le laboratoire et tester Sec/Corrigé avec les trois profils. Ne pas activer le monitoring sur haut-parleurs.
2. Enregistrer les 19 prises du corpus avec consentement et droits, renseigner URI contrôlée, taille, SHA-256 et preuve de droits dans le manifeste.
3. Exécuter 15 minutes par moteur avec buffers 64/128/256/512 lorsque possible ; relever CPU, mémoire, dropouts et corrélation acoustique micro → casque.
4. Refaire l'ABX après alignement sample par sample et égalisation de niveau perçu, puis noter séparément Naturel et Effet.
5. Tester Spoton, Graillon, QPitch et OpenVoxTuner dans le POC WASAPI avec un casque filaire. Leur installation/build et leur passage synthétique ne suffisent pas à choisir.
6. Si Spoton ouvre Moonbase, terminer l'activation localement. Installer volontairement AutoTune 2026 depuis son éditeur s'il doit être comparé. Ne transmettre aucun identifiant ou secret à MeeWav.
7. Fournir une machine macOS Apple Silicon et une machine Linux exploitable pour la matrice AU/LV2/CLAP/Web ; Android et iPhone nécessitent également de vrais appareils.
8. Brancher le futur sender audio de Room au routeur/Bridge, puis vérifier depuis un second compte et un second appareil que la piste corrigée est audible et que le crash repasse au sec.
9. Obtenir les confirmations juridiques écrites openDAW, OpenVoxTuner, QPitch/JUCE et Silvertune avant toute distribution.

## Fichiers modifiés ou créés

### Bridge natif et sondes

- `apps/meewav-audio-engine/CMakeLists.txt`
- `apps/meewav-audio-engine/src/bridge/CommandAuthenticator.cpp`
- `apps/meewav-audio-engine/src/bridge/CommandAuthenticator.h`
- `apps/meewav-audio-engine/src/bridge/ControlServer.cpp`
- `apps/meewav-audio-engine/src/bridge/ControlServer.h`
- `apps/meewav-audio-engine/src/bridge/LocalControlApi.cpp`
- `apps/meewav-audio-engine/src/bridge/LocalControlApi.h`
- `apps/meewav-audio-engine/src/bridge/windows/WindowsCommandCrypto.cpp`
- `apps/meewav-audio-engine/src/bridge/windows/WindowsCommandCrypto.h`
- `apps/meewav-audio-engine/src/bridge/windows/WindowsLoopbackHttpTransport.cpp`
- `apps/meewav-audio-engine/src/bridge/windows/WindowsLoopbackHttpTransport.h`
- `apps/meewav-audio-engine/src/plugins/vst3/Vst3PocMain.cpp`
- `apps/meewav-audio-engine/src/poc/windows/LocalControlPocMain.cpp`
- `apps/meewav-audio-engine/tests/ControlBridgeContractTests.cpp`

### Laboratoire Web

- `src/features/rooms/voice-correction/VoiceCorrectionAbxPanel.tsx`
- `src/features/rooms/voice-correction/VoiceCorrectionAbxPanel.test.tsx`
- `src/features/rooms/voice-correction/meewavTestVoiceCorrectionEngine.ts`
- `src/features/rooms/voice-correction/meewavTestVoiceCorrectionEngine.test.ts`
- `src/features/rooms/voice-correction/voiceCorrection.providers.ts`
- `src/features/rooms/voice-correction/voiceCorrection.providers.test.ts`
- `src/features/rooms/voice-correction/VoiceCorrectionLabPage.tsx`
- `src/features/rooms/voice-correction/VoiceCorrectionLabPage.test.tsx`
- `src/features/rooms/voice-correction/voice-correction-lab.css`
- `src/features/rooms/voice-correction/voiceCorrectionLab.abx.ts`
- `src/features/rooms/voice-correction/voiceCorrectionLab.abx.test.ts`
- `src/features/rooms/voice-correction/voiceCorrectionLab.media.ts`
- `src/features/rooms/voice-correction/voiceCorrectionLab.media.test.ts`
- `src/features/rooms/voice-correction/voiceCorrectionLab.report.ts`
- `src/features/rooms/voice-correction/voiceCorrectionLab.report.test.ts`
- `public/audio/meewav-pitch-correction.worklet.js`

### Expériences et documentation

- `experiments/voice-correction/build-windows-candidates.ps1`
- `experiments/voice-correction/candidates.json`
- `experiments/voice-correction/corpus.manifest.json`
- `experiments/voice-correction/generated/.gitignore`
- `experiments/voice-correction/generate-synthetic-fixtures.mjs`
- `experiments/voice-correction/latency-measurement.mjs`
- `experiments/voice-correction/latency-measurement.test.mjs`
- `experiments/voice-correction/README.md`
- `experiments/voice-correction/validate-candidates.mjs`
- `experiments/voice-correction/verify-corpus.mjs`
- `experiments/voice-correction/windows-evidence.json`
- `docs/meewav-audio-bridge-autotune-2026.md`
- `docs/opendaw-voice-correction-poc.md`
- `package.json`

## Définition de terminé — état honnête

Le prototype logiciel et les outils de preuve accessibles sur cette machine sont livrés. La définition de terminé complète du master prompt reste bloquée par du matériel, des licences propriétaires, des OS absents, le corpus vocal non enregistré et l'absence du média-plane RTC de Room. Ces blocages ne sont pas transformés artificiellement en succès.
