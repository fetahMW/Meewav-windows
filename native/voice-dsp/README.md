# DSP Android commun à Windows

`MeeWavVoiceDsp.h` est une copie inchangée du fichier Android identifié dans
`source.json`. Ne pas corriger cette copie isolément : reprendre la version
Android voulue, mettre à jour sa provenance/empreinte et reconstruire le WASM.
Le test d’intégrité normalise uniquement les fins de ligne.

`voice-dsp.cpp` expose les deux classes Android à un AudioWorklet. Il ne
remplace aucun algorithme. `mw_process` conserve les réglages fixes de
WaveNativeDuplex ; `mw_process_pro` transmet vitesse, humanisation et lissage
aux paramètres déjà présents dans cette même classe C++.
Le profil Android correspond à vitesse 1, humanisation 0 et lissage 0.
Windows transmet les réglages vocaux affichés dans le mixeur ; modifier les
faders change donc le rendu. Le fader Humanisation pilote humanisation et
lissage ensemble, comme le contrat vocal existant de l’application.
Les buffers et instances appartiennent au module WASM de chaque micro ; aucun
partage entre utilisateurs, aucune allocation pendant le traitement.

## Build

Avec Emscripten 6.0.10 installé, depuis la racine :

```powershell
$env:EMXX = 'C:\chemin\emsdk\upstream\emscripten\em++.exe'
node scripts/build-android-voice.mjs
```

Le binaire est versionné dans `public/audio`, sans dépendance réseau à
l’exécution. Le build desktop copie automatiquement ce dossier.

## Oracle natif

Depuis un terminal développeur MSVC, compiler `reference.cpp` avec
`cl /std:c++17 /O2 /EHsc native\voice-dsp\reference.cpp /Fe:reference.exe`.
Ce programme appelle directement les classes Android sur des blocs de
96 échantillons, séparément du wrapper WASM utilisé sur des blocs de 128.

```powershell
$env:MEEWAV_DSP_REFERENCE = 'C:\chemin\reference.exe'
node --test scripts/test-android-voice.mjs
```

Les tests utilisent des signaux synthétiques avec changements de hauteur et
silence, plusieurs gammes et les états bypass/correction/réverb/cumul.
Ils vérifient le traitement numérique. Ils ne mesurent ni le micro physique,
ni le délai réseau, ni la réception d’une Room par un autre appareil.
