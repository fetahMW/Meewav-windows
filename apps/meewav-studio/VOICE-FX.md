# Effets vocaux Windows

## Interface

Simple conserve les cartes Autotune et Réverb. Pro présente trois panneaux exclusifs : Correction, Effets et Plugins. Correction conserve sa présentation et ajoute deux faders verticaux (Retune speed et Humanisation). Effets utilise quatre faders avec bypass indépendant. Plugins reprend les surfaces graphite du mixeur. Les autorisations de capture et les états de disponibilité restent inchangés. Changer de panneau ne change pas le son.

## Moteur réellement sélectionné

Sur Electron, le choix `meewav_test` sélectionne `androidVoiceAdapter`. Il charge `/audio/meewav-android-voice.wasm` localement dans un AudioWorklet. Le traitement est compilé depuis le **code C++ Android inchangé** `native/voice-dsp/MeeWavVoiceDsp.h`. Provenance et empreinte dans `source.json`.

Ce chemin ne dépend ni d’un serveur de développement, ni de Superpowered, ni du prototype séparé de moteur natif/VST3.

- AudioContext à 48 kHz ; entrée mono dupliquée en stéréo comme Android.
- Même correction YIN et mêmes buffers. Vitesse, humanisation et lissage sont transmis aux paramètres existants de la classe C++ par `mw_process_pro`. Vitesse 100 %, humanisation 0 % et lissage 0 reproduisent le profil Android fixe ; d’autres réglages modifient le rendu. Le fader Humanisation pilote également le lissage conformément au modèle vocal existant.
- Gamme mineure convertie en majeure relative via le même mapping.
- Même réverbération C++ ; position du mix élevée au carré comme Android.
- La réverbération Convolver est neutralisée quand l’adaptateur la prend en charge.
- La piste traitée existante reste celle fournie à `prepareVoiceTrack`. Aucune nouvelle publication, aucun micro activé automatiquement par cette UI.
- Le navigateur conserve son adaptateur Web existant.

L’ancien fichier `placeSuperpoweredAdapter.ts` reste un candidat non sélectionné. Les descriptions antérieures de son activation dans la Room étaient inexactes.

## Reconstruction et vérifications

Le WASM (environ 10 Ko) est livré dans les assets Vite/Electron. Emscripten n’est nécessaire que pour le reconstruire : `EMXX=/chemin/em++ node scripts/build-android-voice.mjs`. Version utilisée : Emscripten 6.0.10. Voir `native/voice-dsp/README.md`.

`node --test scripts/test-android-voice.mjs` vérifie le vrai WASM, le bypass, la queue de réverbération, les blocs 96/128 échantillons et le wrapper AudioWorklet. Le test natif nécessite `MEEWAV_DSP_REFERENCE` pointant vers le programme compilé à partir de `native/voice-dsp/reference.cpp` ; sans ce programme, il est explicitement ignoré.

Les vecteurs exécutés avec la référence C++ MSVC ont un écart maximal inférieur à 6e-8 entre sorties native et WASM. Les blocs 96 et 128 échantillons donnent la même sortie. Cela valide le DSP sur ces signaux, **pas** une écoute sur téléphone.

À 48 kHz, le délai du pitch shifter varie de 1,33 à 22,67 ms (estimation moyenne 12 ms). L’historique d’analyse de 42,67 ms n’est pas une file de retard audio. La latence physique totale dépend du périphérique, des pilotes, du navigateur embarqué et du réseau : aucune égalité Android/Windows de bout en bout n’est affirmée sans mesure matérielle.
