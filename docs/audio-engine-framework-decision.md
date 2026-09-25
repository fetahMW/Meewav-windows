# ADR — Framework du MeeWav Audio Engine

La stratégie produit, licence, sécurité et cloud à trois niveaux est détaillée dans [audio-engine-plugin-host-strategy.md](./audio-engine-plugin-host-strategy.md).

- Statut : **proposition à valider juridiquement ; compilation Windows et sonde Auto-Tune hors ligne validées, live non validé**
- Date de vérification : **10 août 2026**
- Portée V1 : **macOS Apple Silicon, puis Windows x64, VST3 uniquement**
- Décision proposée : **JUCE 9 sous licence commerciale**, derrière une abstraction MeeWav qui permet un repli vers le SDK VST3 natif.

## Résumé de décision

MeeWav doit construire un processus natif séparé en C++20/CMake. Pour la V1, JUCE est le meilleur compromis de délai, stabilité et maintenabilité parce qu'il fournit déjà les briques à risque du produit : périphériques audio, formats de plugins, instanciation, état des plugins et scan avec liste de plugins connus.

Cette décision est conditionnelle. Le développement destiné à une distribution production ne commence pas tant que :

1. MeeWav a choisi et acheté le niveau de licence JUCE adapté à son chiffre d'affaires ou financement et au nombre de développeurs concernés ;
2. Antares et Voloco ont confirmé par écrit que l'utilisation de leurs VST3 installés et activés localement dans un host MeeWav est permise ;
3. un POC macOS Apple Silicon a chargé les deux plugins réels sans contourner leur activation ;
4. les paramètres canoniques peuvent être mappés de façon stable par produit et version.

Si le point 1 échoue, l'alternative retenue est le SDK VST3 3.8.x de Steinberg sous MIT. Ce repli est juridiquement plus simple pour le framework, mais augmente fortement le périmètre d'ingénierie : CoreAudio, WASAPI, graph audio, scan, UI native des plugins, état, hot-plug et robustesse temps réel devront être construits ou assemblés séparément.

### État d'implémentation réellement atteint

Le dépôt contient désormais dans `apps/meewav-audio-engine` :

- un cœur C++20 et des frontières de sécurité qui restent indisponibles par défaut plutôt que de simuler un succès ;
- un POC VST3 Windows isolé de scan, instanciation et traitement d'un bloc ;
- un POC live Windows x64 compilable, `meewav-vst3-live-poc`, dont le chemin est : capture micro WASAPI événementielle 48 kHz mono → un VST3 Antares, Voloco, Spoton ou Graillon résolu par identifiant canonique → limiteur de sécurité −1 dB → rendu WASAPI stéréo local ;
- une invariance explicite : un échec du plugin arrête le chemin, sans substituer silencieusement le microphone brut.

Les deux cibles optionnelles ont été **compilées en Release** contre une copie externe propre du SDK VST3 officiel. La sonde hors ligne `meewav-vst3-poc` a été exécutée sans micro ni sortie audio. En plus des preuves antérieures Auto-Key 2 / Auto-Tune Pro 11, Spoton 1.1.2 et Graillon 3.2.0 ont été installés à la demande de l'utilisateur, verrouillés par vendor + nom + class ID, puis instanciés et traversés quatre fois par un signal synthétique. Spoton a déclaré 0 sample de latence ; Graillon 1 074 samples, soit 22,375 ms à 48 kHz. Cette preuve valide uniquement ce cycle d'hôte isolé ; elle ne prouve ni correction audible, ni monitoring WASAPI, ni stabilité, ni publication Room. Le POC live n'a pas été exécuté et Voloco reste absent de la machine. Le moteur de production et le pont PCM vers une Room n'existent toujours pas.

## Ce qui est vérifié

### JUCE 9

JUCE 9 est à double licence : licence JUCE ou AGPLv3. Un binaire MeeWav fermé et distribué doit donc utiliser une licence commerciale adaptée, sauf décision explicite de distribuer le produit sous AGPLv3. La page officielle affiche actuellement : Starter gratuit jusqu'à 20 000 USD de revenu/financement annuel, Indie à 40 USD par utilisateur et par mois ou 800 USD perpétuels jusqu'à 300 000 USD, et Pro à 175 USD par utilisateur et par mois ou 3 500 USD perpétuels sans plafond. L'EULA JUCE 9 impose notamment une licence à chaque personne qui contribue ou maintient un produit dépendant de JUCE et encadre la continuité de distribution d'un produit développé avec un abonnement. Ce document n'est pas un avis juridique : la qualification finale appartient au conseil de MeeWav. Sources : [tarifs et FAQ JUCE 9](https://juce.com/get-juce/), [EULA JUCE 9](https://juce.com/legal/juce-9-licence/).

JUCE fournit les abstractions nécessaires à un host VST3 : gestionnaire de formats, liste de plugins connus, scanner et instances de plugins. Le scanner expose un mécanisme de « dead man's pedal » utile pour identifier le plugin qui a interrompu un scan, mais MeeWav doit tout de même exécuter le scan dans un **processus distinct** avec timeout et quarantaine. Sources : [AudioPluginFormatManager](https://docs.juce.com/master/classjuce_1_1AudioPluginFormatManager.html), [PluginDirectoryScanner](https://docs.juce.com/master/classjuce_1_1PluginDirectoryScanner.html), [KnownPluginList](https://docs.juce.com/master/classjuce_1_1KnownPluginList.html), [AudioPluginInstance](https://docs.juce.com/master/classjuce_1_1AudioPluginInstance.html).

### SDK VST3 de Steinberg

Le dépôt officiel présente le SDK comme « VST SDK 3.8.x ». Il couvre Windows et macOS, Apple Silicon compris, inclut CMake, des exemples, un host de test et un validateur. Le SDK est maintenant sous licence MIT, ce qui autorise l'utilisation commerciale sous réserve de conserver les mentions requises. Source : [Steinberg VST3 SDK](https://github.com/steinbergmedia/vst3sdk), [licence MIT](https://github.com/steinbergmedia/vst3sdk/blob/master/LICENSE.txt).

Cette licence ne donne aucun droit sur les plugins tiers chargés. Elle ne permet ni de redistribuer Antares/Voloco, ni de contourner leur activation.

### Antares AutoTune 2026

Antares annonce AutoTune 2026 en VST3, AU et AAX, pour des fréquences d'échantillonnage de 44,1 à 192 kHz et des traitements 16/24/32-bit float. L'activation passe par Auto-Tune Central et peut utiliser l'ordinateur ou iLok selon le produit/licence. Sources : [FAQ AutoTune 2026](https://help.antarestech.com/hc/en-us/articles/42855736822932-AutoTune-2026-FAQ), [activation Auto-Tune Central](https://help.antarestech.com/hc/en-us/articles/41076506074772-How-To-Activate-Your-License-With-Auto-Tune-Central), [compatibilité Antares](https://www.antarestech.com/daw-compatibility).

La documentation publique cite des DAW pris en charge, pas MeeWav. La présence d'un VST3 rend le POC techniquement plausible, mais elle ne constitue ni une garantie de compatibilité avec un host personnalisé, ni un droit de redistribution. V1 doit donc fonctionner en mode **licence locale** : MeeWav charge uniquement une installation légale déjà activée par l'utilisateur. Un bundle ou une offre OEM exige un accord écrit distinct.

### Voloco Producer

Voloco Producer est proposé en VST3, AU, AAX et application autonome. Son manuel documente notamment correction de hauteur, compression, de-esser, reverb, limiteur, presets et état de plugin. Les prérequis publiés couvrent macOS 11+ Intel/Apple Silicon et Windows 10+ 64 bits. Sources : [Voloco Producer](https://voloco.com/plugin.html), [manuel officiel](https://voloco.com/plugin-manual.html), [activation](https://help.voloco.com/hc/en-us/articles/26846686751511-How-do-I-activate-my-plugin-license).

L'abonnement du plugin desktop est distinct de celui de l'application mobile. MeeWav ne doit pas importer ni redistribuer les presets usine et ne doit pas embarquer le binaire sans accord OEM. Source : [abonnements Voloco distincts](https://help.voloco.com/hc/en-us/articles/26677299640471-Do-I-get-access-to-Voloco-Producer-with-a-subscription-to-the-Voloco-app).

## Comparaison des options

| Critère | Option A — JUCE 9 | Option B — VST3 SDK natif |
|---|---|---|
| Délai du POC | Le plus court | Sensiblement plus long |
| Licence framework | Commerciale ou AGPLv3 | MIT |
| Périphériques audio | Abstraction existante | CoreAudio/WASAPI à construire |
| Hosting VST3 | Briques éprouvées | API de base, host complet à construire |
| Scan/cache | Briques disponibles | À construire |
| État et paramètres | Abstractions disponibles | À intégrer directement |
| UI native du plugin | Fenêtres/éditeurs disponibles | Intégration plateforme à construire |
| Cross-platform | Fort | Possible, mais plus de code MeeWav |
| Taille/dépendance | Plus importante | Potentiellement plus réduite |
| Contrôle fin | Bon | Maximal |
| Risque de maintenance | Plus faible | Plus élevé |

## Architecture native retenue

```text
MeeWavAudioWatchdog
├── MeeWavAudioScanner        processus isolé, sans accès à la Room
└── MeeWavAudioEngine         processus temps réel
    ├── DeviceManager         CoreAudio / WASAPI selon framework de production retenu
    ├── PluginRegistry        chemins locaux résolus par identifiant connu
    ├── AudioGraph
    │   ├── InputGain
    │   ├── VocalTuningSlot   Antares | Voloco | Spoton | Graillon | bypass
    │   ├── MeeWavCompressor
    │   ├── MeeWavReverb
    │   ├── SafetyLimiter
    │   └── MasterGain
    ├── MonitorRouter         casque local, hors chemin réseau
    ├── RoomAudioBridge       PCM traité vers le navigateur
    └── ControlServer         loopback authentifié
```

La chaîne V1 est fixe. Le compresseur, la reverb et le limiteur sont des effets MeeWav internes afin qu'une voix reste exploitable si aucun plugin tiers n'est installé. Le slot de correction vocale accepte un seul provider à la fois. Le navigateur ne transmet jamais un chemin de bibliothèque ; il transmet un `pluginId` allowlisté que le registre local résout.

## Contrat d'adaptation des plugins

L'interface publique manipule exclusivement ce modèle canonique :

```ts
type VocalPitchControls = {
  enabled: boolean;
  key: string;
  scale: string;
  correctionAmount: number;
  retuneSpeed: number;
  humanize: number;
  formant: number;
  preset: string | null;
};
```

Chaque adaptateur vendor est versionné par identifiant de classe VST3, version du plugin et métadonnées réelles de paramètres. Les identifiants de paramètres ne sont jamais supposés identiques entre versions. Si le mapping exact n'est pas connu, le mode simple n'expose pas le contrôle concerné et propose l'interface native du plugin aux utilisateurs avancés.

Le registre minimal contient :

- identifiant et class ID VST3 ;
- vendor, nom, version et architecture ;
- chemin local résolu uniquement par le scanner ;
- état disponible/licencié/non activé/scan échoué ;
- latence déclarée ;
- empreinte du binaire et date de scan ;
- version de l'adaptateur MeeWav compatible.

## Règles temps réel non négociables

Le callback audio ne réalise aucune allocation, attente de mutex, opération fichier, réseau, JSON, log, UI ni exception coûteuse. Les buffers sont préalloués. Les commandes UI passent par une file SPSC ou une structure lock-free ; les meters ressortent via des atomiques et sont échantillonnés par l'UI à 60 Hz maximum.

Le scan, la sérialisation de state, l'ouverture de l'éditeur natif, la validation des licences et les diagnostics s'exécutent hors callback. Un plugin peut déclarer une latence ; le graph additionne les latences et le monitoring signale une configuration trop lente sans promettre une valeur universelle.

## Installation et distribution

### État de préparation de la machine Windows auditée

La machine locale possède Visual Studio Community 2026, MSVC 14.50 et CMake. Elle contient également `Auto-Tune Pro.vst3` et une installation déclarée Antares Auto-Tune Pro 11.0.0. Voloco Producer n'a pas été détecté. Une copie externe propre du SDK VST3 officiel a permis de compiler les deux POC Windows ; le SDK n'est pas embarqué dans le dépôt. La sonde hors ligne a réellement chargé Auto-Tune Pro 11.0.0 (class ID `565354415438314175746F2D54756E65`) et traité un bloc synthétique. Cela ne permet toujours d'inférer ni le statut d'activation, ni la validité de la licence, ni un fonctionnement audio live. Le détail et les limites de cette preuve figurent dans [ios-audio-engine-audit.md](./ios-audio-engine-audit.md).

### État du contrôle sécurisé

Le dépôt possède maintenant les sources de deux Edge Functions Supabase, `rooms-audio-engine-pairing-ticket` et `rooms-audio-engine-pairing-consume`, ainsi qu'une migration créant `room_audio_engine_pairing_tickets` et la RPC atomique `consume_room_audio_engine_pairing_ticket`. Le ticket est court, lié à l'utilisateur, la Room, au rôle, à l'origine et au nonce navigateur ; seule son empreinte est persistée et sa consommation est unique.

Cela ne constitue pas encore un serveur de contrôle natif. Le moteur de production doit appeler l'endpoint de consommation en HTTPS, sans posséder de secret de signature ou de clé `service_role`, puis prouver au navigateur qu'il détient le ticket consommé avec `ticketProof`. La présence des fichiers SQL/Edge Function ne prouve pas leur déploiement ni la configuration de leurs secrets.

### macOS

- application signée avec Developer ID, Hardened Runtime et notarisation ;
- test de chargement de plugins tiers signés/notarisés et de leurs mécanismes d'activation ;
- validation spécifique Apple Silicon ;
- aucune désactivation globale de sécurité pour « faire marcher » un plugin ;
- mise à jour signée, jamais appliquée pendant une Room.

Références : [notarisation macOS](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution), [Hardened Runtime](https://developer.apple.com/documentation/security/hardened-runtime).

### Windows

- binaire x64 signé par un certificat de signature de code reconnu et horodaté ;
- WASAPI comme backend V1 ;
- validation Windows 11, interfaces USB et hot-plug ;
- aucune DLL arbitraire reçue du navigateur.

Smart App Control peut bloquer le code inconnu non signé ; la signature est donc un critère de livraison, pas une finition. Références : [Smart App Control](https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/overview), [SignTool](https://learn.microsoft.com/en-us/windows/win32/appxpkg/how-to-sign-a-package-using-signtool).

## Phases et critères Go/No-Go

### Phase 0 — juridique et reproductibilité

GO uniquement si :

- niveau JUCE et nombre de sièges validés ;
- mode licence locale Antares/Voloco confirmé par écrit ;
- machines de test avec installations légales et versions figées disponibles ;
- aucun secret LiveKit, licence ou vendor n'entre dans le client Web ou les logs.

### Phase 1 — host local macOS

GO uniquement si, avec les vrais plugins :

- scan isolé et cache fonctionnels ;
- Antares et Voloco chargent, traitent et bypassent ;
- key, scale, correction et state survivent à un redémarrage ;
- monitoring casque fonctionne à 48 kHz avec 64/128 samples sur matériel adapté ;
- 30 minutes de traitement ne produisent ni crash ni dropout dans le scénario cible ;
- un crash de scan/plugin ne ferme pas le navigateur.

### Phase 2 — chaîne MeeWav

GO uniquement si compresseur, reverb, limiteur, gains et meters ont des tests DSP déterministes, et si l'activation d'un preset ne produit ni saut de gain dangereux ni double voie audio.

### Phase 3 — bridge Web

GO uniquement après satisfaction des critères du document [audio-engine-room-bridge-decision.md](./audio-engine-room-bridge-decision.md).

### Phase 4 — Windows

Le POC Windows et sa sonde synthétique hors ligne ont été avancés pour profiter de la machine et du VST3 Antares disponibles. Cela ne change pas la séquence de livraison : le backend Windows de production commence après les validations précédentes, sans supposer qu'une configuration ou un identifiant de périphérique macOS est portable.

## Bloqueurs connus

1. Aucun accord vendor/OEM n'est présent dans le dépôt.
2. Un profil Auto-Tune 11 de niveau `locally_scanned_prototype_only` contient les IDs de métadonnées observés (`scale=1`, `key=2`, `retuneSpeed=4`, `humanize=61`, `formant=70`), mais la sémantique de `correctionAmount`/preset, le comportement de contrôle et tout mapping Voloco restent non validés.
3. La sonde VST3 hors ligne a été exécutée avec succès, mais le POC live VST3/WASAPI n'a pas été exécuté ; aucun host de production, device manager complet ou sandbox par plugin n'existe encore.
4. L'intégration iOS versionnée ne contient ni Antares ni Voloco ; elle ne peut pas servir de preuve de compatibilité vendor. Voir [ios-audio-engine-audit.md](./ios-audio-engine-audit.md).
5. Le chemin de publication du flux traité vers une Room Web n'est pas encore implémenté. Voir [audio-engine-room-bridge-decision.md](./audio-engine-room-bridge-decision.md).

## Décisions explicitement rejetées en V1

- construire un nouvel algorithme d'Auto-Tune ;
- exposer tous les VST3 installés ;
- charger une DLL ou un bundle indiqué par le navigateur ;
- intégrer AU/AUv3/AAX/VST2/LV2 ;
- embarquer Antares ou Voloco sans accord ;
- utiliser un driver audio virtuel comme architecture principale ;
- déplacer la caméra dans le moteur natif ;
- annoncer « Antares intégré » ou « Voloco intégré » avant validation légale et POC réel.
