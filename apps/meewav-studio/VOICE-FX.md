# FX Desktop — référence Android

Le Mixeur et ses états Room sont conservés. Le mode Simple Desktop présente les
cartes Autotune/Réverb, les sélecteurs Clé/Gamme et le retour casque de la référence
Android `WaveMixerScreen.kt`, `WaveMixerControls.kt`, `WaveMixerMaterials.kt`.
Le mode Pro conserve les autres effets et les plugins existants.

## Traitement

`placeSuperpoweredAdapter.ts` raccorde Superpowered WebAssembly 2.7.2 au même
AudioContext, au retour casque et à la piste traitée utilisée pour la publication.
Il remplace le moteur JS expérimental uniquement dans le runtime Desktop pour le
choix Autotune Meewav. Le moteur Web existant reste disponible dans le navigateur.

Les réglages suivent `WaveNativeDuplex.cpp` : WIDE, EXTREME, clamp OFF, A=440 Hz,
98 % corrigé + 2 % sec, puis réverbération Superpowered avec mix = position².
Les gammes suivent `waveTuneScale` (mineure → majeure relative). La réverbération
Web Audio est désactivée dans cette chaîne pour éviter un double traitement.
Vitesse et humanisation ne sont pas réglables avec ce moteur Simple Android.

Le SDK et le WASM sont servis localement depuis la dépendance npm épinglée.
La clé d’évaluation est limitée au développement local (`import.meta.env.DEV`).
Une build distribuée refuse l’activation sans `VITE_SUPERPOWERED_LICENSE_KEY`.
Une licence Android ne vaut pas automatiquement licence WebAssembly : vérifier
la licence de distribution auprès de Superpowered avant tout packaging public.
Référence : https://docs.superpowered.com/getting-started/licensing/

## Vérifications exécutées

- `node --test scripts/test-superpowered-voice.mjs` : vrai WASM, mapping de gamme,
  bypass mono/stéréo, correction 450 → environ 440 Hz, traîne de réverbération.
- Vitest : `PlaceMixer.voiceCorrection.test.tsx`, `placeLocalAudioEngine.test.ts`.
- Build Vite et ESLint ciblé.

Pas de vérification visuelle, d’écoute au micro, de mesure de latence matérielle
ni de réception audio par un viewer pendant cette correction.
