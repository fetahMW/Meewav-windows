# Registre des correcteurs vocaux

Résolution effectuée le **11 août 2026** à partir des sites éditeurs, dépôts officiels, releases/tags, manifests npm et fichiers de licence. Le détail machine-readable et les URLs de preuve sont dans [`candidates.json`](./candidates.json).

Ce registre ne confond pas quatre niveaux de preuve : documentation, présence locale, traitement synthétique et validation audio humaine. Un candidat n'est `TESTÉ` que si un vrai signal audio l'a traversé avec une preuve reproductible. Aucune écoute humaine n'a eu lieu pendant cet inventaire et aucune latence de bout en bout n'a été fabriquée.

## Résultat des 16 candidats

| # | Candidat | Révision résolue | Présence locale | Statut actuel | Motif court |
|---:|---|---|---|---|---|
| 1 | Spoton | 1.1.2 | VST3 signé installé | `TESTÉ_PARTIELLEMENT` | identité exacte et quatre passages DSP synthétiques validés ; écoute micro/casque encore requise |
| 2 | OpenVoxTuner | v0.1.67 · `5570e8a6…` | build labo externe | `TESTÉ_PARTIELLEMENT` | deux builds taggés, 102 tests upstream et passage VST3 synthétique ; binaires/sorties non bit-identiques, aucune écoute |
| 3 | Graillon 3 Free | 3.2.0 | VST3 signé installé | `TESTÉ_PARTIELLEMENT` | identité exacte et quatre passages DSP synthétiques validés ; écoute micro/casque encore requise |
| 4 | QPitch | v1.3.1 · `a0a95f10…` | build labo externe | `TESTÉ_PARTIELLEMENT` | VST3/CLAP taggés compilés et passage VST3 synthétique ; aucune écoute |
| 5 | Silvertune | companion-v0.4.0 · `7b9be1fb…` | build labo externe | `BLOQUÉ_PAR_ENVIRONNEMENT` | companion compilé et Worklet vérifié statiquement, sans passage audio ; licence absente du dépôt |
| 6 | AutoTune 2026 | 1.2 | exact absent | `BLOQUÉ_PAR_LICENCE_OU_ACTIVATION` | seul Auto-Tune Pro 11 est présent ; ce n'est pas AutoTune 2026 |
| 7 | openDAW Autotune | WASM 0.0.11 + SDK 0.0.166 | présent | `TESTÉ_PARTIELLEMENT` | Worklet/WASM + audio synthétique + loopback local, sans micro/écoute/Room distante |
| 8 | libsonare | v1.6.0 · `9e23b374…` | absent | `BLOQUÉ_PAR_ENVIRONNEMENT` | API WASM non installée/testée ; natif Windows non supporté |
| 9 | Autotone | `fd4005ad…` | absent | `NON_TEMPS_RÉEL_CONFIRMÉ` | le code corrige seulement après l'arrêt de l'enregistrement |
| 10 | Autotalent | 0.2 / Debian 0.2-6 | absent | `BLOQUÉ_PAR_ENVIRONNEMENT` | LADSPA/Linux requis ; miroir GitHub du prompt en 404 |
| 11 | TalentedHack | v1.92 · `1b4c2e9d…` | absent | `BLOQUÉ_PAR_ENVIRONNEMENT` | LV2/Linux requis |
| 12 | x42/fat1 | v0.8.9 · `a9802042…` | absent | `BLOQUÉ_PAR_ENVIRONNEMENT` | LV2/Linux requis |
| 13 | MXTune | v1.2.0 · `b7f77b78…` | absent | `NON_REPRODUCTIBLE` | tag exact : configuration et build bloqués par une source JUCE Unity générée absente |
| 14 | MusicAI | manifest 1.0.0 · `92c0c53f…` | absent | `NON_REPRODUCTIBLE` | le code révèle un simple resampling et des placeholders, pas le PSOLA/formant annoncé |
| 15 | Loukai | v0.12.0 · `34c0a4b5…` | absent | `BLOQUÉ_PAR_ENVIRONNEMENT` | chemin Worklet réel trouvé, mais aucun build ni passage audio |
| 16 | BERT-APC | demo · `0b5a5d3f…` | absent | `NON_REPRODUCTIBLE` | dépôt statique avec résultats pré-rendus ; code et poids du moteur absents |

## Inventaire de la machine

Les emplacements VST3, CLAP, AAX et VST historiques standards de Windows ont été scannés. Deux éléments du périmètre ont été trouvés :

- `Auto-Tune Pro.vst3` 11.0.0, 44 975 616 octets, SHA-256 `38c42d0b4b260fa72e7ed4af58cb9e271cc48c9fc72372463254f040bbbf76f3`. Il s'agit d'un produit lié mais différent d'AutoTune 2026. Une sonde MeeWav existante avait traité un bloc synthétique ; activation, licence, micro, écoute et stabilité restent inconnus.
- `device_autotune.wasm` openDAW 0.0.11, SHA-256 `74e9d9757a3f9b0c9f24e734a0a05e1d6c6fe5fce63f201871c553ecd6c7ad18`, avec les quatre packages openDAW exacts déjà verrouillés dans le lockfile.

Spoton 1.1.2 et Graillon 3 Free 3.2.0 ont été installés dans les emplacements VST3 Windows à la demande explicite de l'utilisateur. Le host MeeWav a validé leur identité exacte, leur instanciation et quatre passages DSP synthétiques déterministes, sans ouvrir de périphérique audio. AutoTune 2026, libsonare, Autotone, Autotalent, TalentedHack, fat1, MXTune, MusicAI, Loukai et le moteur BERT-APC restent absents des emplacements système. QPitch, OpenVoxTuner et le companion Silvertune ont été construits sous une racine de laboratoire externe et n'ont pas été installés globalement. Le companion Silvertune n'a volontairement pas été lancé, car il peut ouvrir un périphérique audio.

## Points juridiques à ne pas masquer

- **openDAW** : le dépôt annonce AGPL-3.0-or-later / commercial, tandis que les manifests npm installés déclarent LGPL-3.0-or-later. Le bundle WASM requis charge aussi des modules annoncés comme exclus de la licence commerciale. Production bloquée avant clarification écrite et bundle propre.
- **Silvertune** : aucune licence n'est présente dans les révisions vérifiées. Sans licence explicite, le code n'est pas redistribuable par défaut.
- **QPitch/OpenVoxTuner/Loukai et les références GPL/LV2** : le chargement dynamique n'efface pas automatiquement les obligations copyleft. Validation juridique nécessaire pour un Bridge fermé.
- **Spoton/Graillon/Antares** : utilisation locale d'une copie légitime et redistribution par MeeWav sont deux sujets différents. Les archives Spoton/Graillon fournies par l'utilisateur ont servi à une installation locale autorisée ; aucun binaire propriétaire n'est versionné ou redistribué par MeeWav.
- **BERT-APC** : la licence MIT couvre le démonstrateur statique, pas un moteur/poids non publiés ni automatiquement les enregistrements de démonstration.

## Contrôles négatifs utiles

- Autotone est bien une correction après enregistrement, pas un flux live.
- MusicAI contient explicitement `simple resampling (placeholder)` et une préservation de formants pass-through : ses chiffres marketing ne sont pas repris comme mesures.
- BERT-APC ne publie dans le dépôt contrôlé que le site et des sorties pré-calculées.
- Loukai a évolué : v0.12.0 contient bien une chaîne détecteur micro → phase vocoder Worklet. Elle reste non testée, mais l'ancienne conclusion « simple effet robot uniquement » ne serait plus exacte pour la chaîne réellement connectée.

La recherche d'extension n'a ajouté aucun dix-septième moteur. EasyEffects 8.2.x a récemment ajouté l'effet x42 AutoTune, mais il s'agit du même moteur fat1 déjà enregistré.

## Validation

```powershell
node experiments/voice-correction/validate-candidates.mjs
```

Le validateur impose les 16 IDs et leur ordre, les statuts autorisés, les SHA au bon format, les champs de licence/OS/formats/install/latence et une raison explicite pour chaque résultat non final. Il recoupe aussi QPitch, OpenVoxTuner et Silvertune avec `windows-evidence.json`, afin qu'une preuve ne puisse plus être rattachée à la mauvaise fiche.

## Reproduire les builds Windows

Le script clone lui-même les dépôts officiels dans une racine dédiée, crée des worktrees détachés aux commits vérifiés et construit uniquement hors du dépôt MeeWav. Par défaut, `All` couvre les trois vérifications attendues vertes : QPitch, OpenVoxTuner et le companion Silvertune. Aucun plugin n'est installé dans les dossiers système et aucun périphérique audio n'est ouvert.

```powershell
# Racines par défaut : %LOCALAPPDATA%\MeeWav\AudioCandidateSources
# et %LOCALAPPDATA%\MeeWav\AudioCandidateBuilds
& .\experiments\voice-correction\build-windows-candidates.ps1

# Sélection explicite ; OpenVoxTuner prépare aussi son JUCE épinglé via QPitch si nécessaire
& .\experiments\voice-correction\build-windows-candidates.ps1 `
  -Candidate QPitch,OpenVoxTuner

# Racines personnalisées, obligatoirement distinctes et non imbriquées
& .\experiments\voice-correction\build-windows-candidates.ps1 `
  -SourceRoot 'D:\MeeWavLab\sources' `
  -BuildRoot 'D:\MeeWavLab\builds'
```

MusicAI reste un contrôle négatif : sa compilation passe actuellement, mais ses tests upstream sont connus en échec. Il est donc exclu de `All` et ne s'exécute qu'avec l'option explicite suivante, dont le code de sortie non nul est attendu tant que l'upstream n'est pas corrigé :

```powershell
& .\experiments\voice-correction\build-windows-candidates.ps1 `
  -Candidate QPitch `
  -IncludeKnownFailingMusicAI
```

## Ce que ce registre ne prouve pas

- aucune qualité sonore ;
- aucune écoute au casque ;
- aucune latence monitoring ou WebRTC ;
- aucune stabilité de 15/30 minutes ;
- aucune activation de plugin propriétaire ;
- aucune conformité juridique de production.

Les statuts devront être mis à jour par le laboratoire commun seulement après traitement audio reproductible, en conservant l'historique des révisions et artefacts réellement testés.

## Corpus et mesures reproductibles

[`corpus.manifest.json`](./corpus.manifest.json) sépare volontairement deux catégories :

- 19 prises vocales à enregistrer manuellement avec consentement et preuve de droits ;
- 5 signaux mathématiques générés localement (silence, impulsion, sweep, notes et accord), utilisables uniquement pour les smoke tests, le trajet du signal et la latence.

Les signaux synthétiques ne sont ni des voix ni une preuve de qualité musicale. Les gros enregistrements vocaux restent hors Git ; le manifeste recevra leur taille, SHA-256 et référence de droits après ingestion contrôlée.

```powershell
npm run voice-correction:corpus:generate
npm run voice-correction:corpus:verify
npm run voice-correction:latency:test
```

[`latency-measurement.mjs`](./latency-measurement.mjs) mesure un décalage par corrélation normalisée et agrège médiane, p95 et pire cas. Il ne remplace pas une mesure acoustique microphone → casque ni une mesure entre deux vrais participants WebRTC.
