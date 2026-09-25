# Audit — audio des Rooms iOS et reproductibilité du MeeWav Audio Engine

- Date d'audit : **10 août 2026**
- Dépôt audité : copie locale du dépôt `LinkWave-IOS`
- Checkout observé : `feature/web-landing-meewav`
- Référence complémentaire lue sans modification : `origin/rooms_v2/la-place-glow-up`
- Conclusion : **l'intégration Antares/Voloco annoncée n'est pas présente dans le code iOS versionné audité**.

## Conclusion exécutive

Le dépôt iOS apporte deux preuves utiles :

1. `rooms_v2` utilise LiveKit pour publier caméra/micro et recevoir des participants distants ;
2. une branche distante contient un processeur iOS qui intercepte le micro avant publication WebRTC et y mélange une musique locale.

En revanche, aucun fichier, package, pod, framework ou adaptateur Antares/Voloco n'a été trouvé dans le checkout actuel ni dans la branche audio inspectée. Aucun traitement de pitch, compresseur, reverb, limiteur, monitoring casque ou host de plugin n'y est implémenté. L'affirmation « cela fonctionne sur l'application mobile » peut correspondre à un build privé, une branche non disponible, un SDK non versionné ou une expérimentation externe ; elle n'est pas reproductible depuis les sources auditées.

La bonne décision n'est pas de nier le test utilisateur, mais de le traiter comme **une preuve à retrouver**. Avant de recopier une architecture supposée, MeeWav doit obtenir le commit/build exact, la liste des SDK/licences, le signal flow, les paramètres et les mesures de latence de cette version.

## Deux générations de Rooms

### Parcours legacy actif

Le parcours historique `RoomLiveUniversal` et ses widgets fournissent un inventaire riche d'interface — chat, mixeur, outils et invités — mais une grande partie de l'audio, des compteurs et des interactions est locale ou simulée. Il ne constitue pas une preuve de traitement vocal distant professionnel.

### `rooms_v2`

Le module `rooms_v2` contient une intégration LiveKit (`livekit_client: ^2.6.4`) avec publication caméra/micro pour le host, lecture seule initiale pour le viewer et reconnexion publiable pour un invité qui monte sur scène. Supabase porte chat, file, invitations, sondages, réactions et états de mixeur.

Ce module est la meilleure référence iOS pour les rôles et le transport distant. Il ne fournit pas un moteur de correction vocale.

## Inventaire des dépendances audio iOS

La recherche dans `pubspec.yaml`, `Podfile.lock`, `lib/` et les fichiers natifs n'a trouvé :

- ni Antares ;
- ni Voloco ;
- ni JUCE ;
- ni VST3 ;
- ni AudioKit ;
- ni Superpowered ;
- ni AUv3 host dédié.

Les dépendances pertinentes visibles sont LiveKit/flutter-webrtc et des packages de lecture/enregistrement génériques. Cette absence ne prouve pas qu'aucun build privé n'a jamais existé ; elle prouve que **le dépôt disponible ne permet pas de reconstruire cette intégration**.

## Branche distante `rooms_v2/la-place-glow-up`

Trois fichiers importants existent sur cette branche :

- `ios/Runner/MeewavLiveAudio/MeewavLiveAudioPlugin.swift` ;
- `ios/Runner/MeewavLiveAudio/MusicMixerProcessor.swift` ;
- `lib/features/rooms_v2/data/services/live_audio_engine.dart`.

### Chaîne réellement implémentée

```text
Micro capturé par flutter-webrtc
        ↓
capturePostProcessingAdapter
        ↓
MusicMixerProcessor
  ├── gain micro
  └── musique locale décodée, resamplée et sommée
        ↓
buffer micro modifié
        ↓
publication LiveKit existante
```

Le plugin Flutter utilise des `MethodChannel`/`EventChannel`. Il expose start/stop, chargement d'un morceau, lecture/pause/stop/seek, gains micro/musique, durée/position et meters. Le processeur lit un fichier avec `AVAudioFile`, le convertit avec `AVAudioConverter` vers le format de capture, puis mélange les échantillons dans le callback `RTCAudioCustomProcessingDelegate` attaché à `AudioManager.sharedInstance().capturePostProcessingAdapter`.

Ce mécanisme démontre une idée importante : le micro peut être modifié **avant** sa publication LiveKit, de sorte que les participants distants reçoivent le résultat. Il ne démontre pas Antares, Voloco ni un mini-DAW.

### Fonctions présentes

- micro et musique sommés localement ;
- gains indépendants micro/musique ;
- lecture, pause, stop et seek ;
- conversion du fichier vers la fréquence de capture, généralement 48 kHz ;
- meters RMS envoyés à Flutter ;
- retrait du processeur au stop.

### Fonctions absentes

- correction de hauteur ;
- tonalité, gamme, retune speed, humanize ou formant ;
- compresseur ;
- reverb ;
- safety limiter ;
- presets vocaux ;
- state vendor ;
- scan/host VST3 ou AUv3 ;
- sélection de périphérique ;
- monitoring casque pré-réseau ;
- mesure de latence de bout en bout ;
- watchdog/sandbox de plugin ;
- activation Antares/Voloco.

## Audit temps réel de la branche audio

Le commentaire du processeur indique qu'un `NSLock` court est acceptable. Or le callback `audioProcessingProcess` acquiert le verrou pour prendre un snapshot, puis l'acquiert à nouveau pendant la boucle d'échantillons pour lire/avancer `sourcePCM`, et encore pour publier l'état. Même si les sections sont courtes, un mutex bloquant dans le callback ne respecte pas les exigences temps réel du MeeWav Audio Engine.

Autres limites :

- le morceau complet est décodé en mémoire ;
- l'accès à l'état mélange contrôle et audio au lieu d'utiliser des snapshots lock-free ;
- aucune stratégie robuste de hot-plug/sample-rate change n'est visible ;
- aucun test long ne prouve l'absence de dropout ;
- les meters ne prouvent pas une calibration en dBFS ;
- la gestion de fin de piste et les changements de gains partagent le même verrou que l'audio.

Cette branche est un prototype de mix micro/musique, pas une base temps réel à copier telle quelle en C++.

## Transport LiveKit : acquis et risque critique

Le provider iOS sait publier caméra et micro, recevoir les tracks et reconnecter un viewer avec `canPublish: true` lorsqu'il monte sur scène. C'est une référence utile pour le modèle de permission et la grille multicam.

Le dépôt contient toutefois un générateur de token local qui lit `LIVEKIT_API_SECRET` depuis l'environnement et un repository qui tente d'abord une Edge Function puis retombe sur cette génération locale. Ce fallback est acceptable uniquement pour un prototype local. Un secret LiveKit ne doit jamais être embarqué dans une application distribuée, et le backend doit dériver `canPublish` du rôle/état serveur plutôt que d'accepter la demande du client.

La V1 Web décrite dans [audio-engine-room-bridge-decision.md](./audio-engine-room-bridge-decision.md) impose donc des tokens courts émis serveur et interdit ce fallback.

## État de la machine Windows disponible

L'inventaire local effectué pendant cet audit a trouvé :

- `C:\Program Files\Common Files\VST3\Antares\Auto-Tune Pro.vst3` — environ 45 MB ;
- une installation déclarée comme **Antares Auto-Tune Pro 11.0.0** ;
- **aucun Voloco Producer** détecté dans les emplacements inspectés ;
- Visual Studio Community 2026, MSVC 14.50 et CMake disponibles ;
- aucun SDK VST3 embarqué dans MeeWav ; une copie externe propre du SDK officiel a ensuite été fournie explicitement à CMake pour la preuve de compilation.

La présence du bundle Antares prouvait initialement seulement qu'un fichier VST3 était installé. Une sonde MeeWav hors ligne a depuis chargé Auto-Tune Pro 11.0.0 et traité un bloc synthétique, ce qui prouve ce cycle d'hôte local précis. Cela ne prouve toujours ni son statut d'activation, ni une licence valide, ni un traitement audible/stable, ni son fonctionnement sur une autre machine. Aucun secret ou statut d'activation n'a été inspecté. Voloco doit être installé et activé légalement pour son POC.

### Avancement desktop postérieur à l'audit iOS

Le dépôt contient désormais deux cibles Windows optionnelles fondées sur le SDK Steinberg officiel :

- `meewav-vst3-poc`, pour découverte standard, métadonnées, instanciation et traitement d'un bloc ;
- `meewav-vst3-live-poc`, pour une route locale micro WASAPI événementielle → VST3 Antares ou Voloco sélectionné par identifiant canonique → limiteur −1 dB → sortie WASAPI.

Ces cibles ont compilé en Release. `meewav-vst3-poc` a été exécuté sans audio réel : Auto-Key 2 et Auto-Tune Pro 11.0.0 se sont instanciés et ont chacun traité un bloc synthétique (`targets=2`, `probesPassed=2`). Auto-Tune a exposé 182 paramètres et déclaré 2 670 échantillons de latence à 48 kHz. Les IDs observés sont consignés dans un profil prototype local, sans inventer `correctionAmount` ni preset. Le POC live n'a pas été exécuté : activation, son audible, latence de bout en bout et stabilité restent donc non validés. Il n'intègre ni Voloco absent, ni bridge Room, ni serveur de contrôle de production.

Cet avancement desktop ne modifie pas la conclusion de l'audit iOS : aucune intégration Antares/Voloco reproductible n'a été retrouvée dans les sources mobiles auditées.

Le Web applique en outre une garde `audioPlane` : une connexion au plan de contrôle ne vaut pas une piste audio traitée. `unavailable` et `local_monitor` interdisent la bascule de publication ; seul `room_ready`, qui dépend du pont Room encore absent, autorisera plus tard le handoff coordonné sans double micro.

## Comparaison entre la cible et les sources iOS

| Besoin cible | Preuve iOS disponible | État |
|---|---|---|
| Publication caméra/micro distante | LiveKit `rooms_v2` | Présente |
| Modification du micro avant publication | branche distante, capture post-processing | Prototype présent |
| Mix d'une musique locale | `MusicMixerProcessor` | Prototype présent |
| Meters micro/musique | EventChannel | Présents, non calibrés |
| Antares AutoTune | aucune dépendance/adaptation trouvée | Absent |
| Voloco Producer | aucune dépendance/adaptation trouvée | Absent |
| Pitch canonique key/scale/correction | aucun modèle trouvé | Absent |
| Compression/reverb/limiteur | aucune chaîne DSP trouvée | Absent |
| Monitoring casque local traité | aucune route trouvée | Absent |
| Scan et isolation de plugin | non pertinent sur iOS actuel | Absent |
| Presets MeeWav persistés | aucun modèle trouvé | Absent |
| Mesure de latence/dropouts | aucun instrument trouvé | Absent |
| Sécurité token production iOS | Edge Function LiveKit amorcée + fallback secret client | À corriger sur iOS |
| Pairing Audio Engine Web/Desktop | Edge Functions ticket/consume + table/RPC présentes ; natif absent | Contrat amorcé, non opérationnel |

## Ce qui peut être réutilisé conceptuellement

- traiter chaque voix sur l'appareil de son propriétaire avant publication ;
- ne jamais appliquer les FX du host aux invités distants ;
- garder caméra et audio dans la même identité de participant ;
- utiliser un état explicite pour viewer, backstage et onstage ;
- séparer les gains créatifs personnels des gains de régie du host ;
- rendre le monitoring local indépendant du réseau ;
- conserver LiveKit comme transport interactif.

## Ce qui ne doit pas être repris tel quel

- le mutex dans le callback audio ;
- le secret LiveKit côté client ;
- la génération locale de droits `canPublish` ;
- les vumètres simulés ou basés sur la position d'un fader ;
- l'état invité indexé par position ;
- le décodage systématique de longs fichiers en mémoire ;
- les contrôles visuels non reliés au signal ;
- la présentation d'un prototype local comme une intégration vendor.

## Éléments à demander pour retrouver la version mobile annoncée

1. hash du commit ou archive du build exact ;
2. `pubspec.lock`, `Podfile.lock` et frameworks embarqués de ce build ;
3. nom/version/licence du SDK Antares ou Voloco utilisé ;
4. accord OEM, compte de développement ou preuve de licence correspondant ;
5. schéma du signal avant publication WebRTC ;
6. paramètres/presets exposés ;
7. fréquence, buffer et périphérique du test ;
8. méthode de monitoring casque ;
9. mesure de latence et durée du test ;
10. confirmation que le participant distant recevait bien la voix traitée et non un playback local.

Si ce matériel est retrouvé, cet audit doit être révisé. Il pourrait réduire fortement le POC, mais ne dispense pas de l'analyse des licences desktop VST3.

## Décision Phase 0 / POC

Le statut est **NO-GO production, GO pour un POC légalement encadré**.

Le POC Windows a atteint la compilation et la sonde synthétique Auto-Tune hors ligne a réussi. Le passage au test live puis à la production reste conditionné par :

- la validation du choix JUCE/SDK VST3 selon [audio-engine-framework-decision.md](./audio-engine-framework-decision.md) ;
- Antares installé sur la machine de test est légalement activé ;
- Voloco est installé et activé légalement ;
- les versions des deux plugins sont figées ;
- le test ne redistribue aucun binaire/preset vendor ;
- les mappings de paramètres sont découverts par métadonnées, pas inventés ;
- le test local valide monitoring, state, bypass, latence et stabilité avant toute connexion Web.

Ne pas promettre publiquement « Antares et Voloco intégrés » avant satisfaction de ces critères et d'un test distant documenté. La formulation honnête à ce stade est : **architecture et POC Windows compilés, sonde synthétique Auto-Tune réussie hors ligne, live micro/casque non testé, Voloco absent, moteur de production et bridge Room encore à construire**.

## Verdict

La version iOS confirme que MeeWav sait bâtir des Rooms LiveKit et qu'un prétraitement audio avant publication est faisable. Elle ne fournit pas le moteur vocal professionnel demandé. Le MeeWav Audio Engine desktop reste un nouveau produit natif, avec son propre périmètre juridique, temps réel, sécurité, distribution et validation audio.
