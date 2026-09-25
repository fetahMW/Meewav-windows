# Stratégie — Autotune intégré et hôte de plugins locaux MeeWav

- Date de vérification : **11 août 2026**
- Statut : **prototype interne ; aucune mise en production**
- Décision : **deux offres locales complémentaires, puis un catalogue cloud seulement sous accords éditeurs**

## Décision produit

MeeWav doit conserver deux chemins distincts sur l'appareil de l'artiste :

1. **Autotune** : correction openDAW/WASM intégrée au navigateur et disponible sans plugin propriétaire. L'interface publique reste volontairement limitée à Tonalité, Gamme, Retune speed et Humanisation.
2. **Mes plugins — mode Pro** : MeeWav Audio Engine charge un plugin compatible déjà installé et activé légalement par son propriétaire. Le navigateur ne reçoit jamais le binaire, le compte vendor, le mot de passe, le secret iLok ou un chemin arbitraire.

Une troisième offre, **Plugins Cloud MeeWav**, n'est envisageable qu'après accords OEM/enterprise/cloud écrits. Elle ne fait pas partie du prototype actuel.

## État réellement obtenu

Le dépôt possédait déjà `apps/meewav-audio-engine`, un squelette C++20/CMake avec registre, scanner contractuel, host abstrait, adapters Antares/Voloco, POC VST3 Windows et route WASAPI de monitoring. L'incrément actuel a renforcé le contrat de scan : seuls des identifiants canoniques bornés peuvent traverser la frontière ; un chemin, une majuscule, un segment vide ou plus de 64 cibles sont rejetés avant tout transport.

La sonde VST3 hors ligne a été exécutée sans microphone ni sortie audio :

| Cible locale | Résultat |
|---|---|
| Auto-Key 2 | instanciation et bloc synthétique réussis |
| Auto-Tune Pro 11.0.0 | instanciation et bloc synthétique réussis |
| Spoton 1.1.2 | installation signée, identité exacte, 16 paramètres et quatre passages synthétiques réussis ; 0 sample déclaré |
| Graillon 3 Free 3.2.0 | installation signée, identité exacte, 2 147 paramètres et quatre passages synthétiques réussis ; 1 074 samples / 22,375 ms déclarés |
| Résumé du passage Spoton + Graillon | `requestedTargets=2`, `requestedTargetsPassed=2` |
| Auto-Tune Pro | 182 paramètres ; class ID `565354415438314175746F2D54756E65` |
| IDs observés | Scale `1`, Key `2`, Retune Speed `4`, Humanize `61`, Formant `70` |
| Latence déclarée | 2 670 échantillons à 48 kHz, soit 55,625 ms |

Les profils Spoton et Graillon sont enregistrés avec leur vendor, class ID et hash locaux vérifiés. L'allowlist autorise ces identités dans les POC isolés, mais l'interface Room reste fermée tant que l'adaptateur canonique et le plan audio du Bridge sont absents. Ces sondes prouvent l'instanciation et le traitement synthétique ; elles ne prouvent ni qualité vocale, ni monitoring casque, ni stabilité, ni publication dans une Room. Voloco n'est pas installé sur cette machine.

## Formats et framework

Ordre recommandé :

1. VST3 sur Windows et macOS ;
2. AUv2 sur macOS ;
3. CLAP pour les plugins qui le publient ;
4. pas d'AAX au MVP.

Le SDK VST3 3.8 est sous MIT. La spécification CLAP est également sous MIT. Ces licences couvrent le format/SDK, pas les droits du plugin tiers chargé. JUCE 9 sous licence commerciale reste le meilleur candidat pour le moteur de production multiplateforme ; le SDK VST3 natif utilisé dans le POC reste un repli possible et plus exigeant en maintenance.

Références : [SDK VST3 et licence](https://github.com/steinbergmedia/vst3sdk), [licence et marque VST](https://steinbergmedia.github.io/vst3_dev_portal/pages/VST%2B3%2BLicensing/Index.html), [spécification CLAP](https://github.com/free-audio/clap), [fonctionnalités JUCE](https://juce.com/juce/features/), [EULA JUCE 9](https://juce.com/legal/juce-9-licence/).

## Licence Antares : point bloquant

Antares publie AutoTune 2026 en VST3, AUv2 et AAX pour Windows/macOS, avec deux activations simultanées et un mode faible latence. Le Bridge local doit rechercher puis charger en mémoire le bundle local ; il est exact de dire qu'il ne l'upload, ne le copie et ne le redistribue pas, mais pas qu'il ne lit jamais le fichier.

La politique Antares interdit notamment de rendre une licence individuelle accessible à autrui par time-sharing, service bureau, SaaS ou « virtual recording studio ». Conséquences :

- une licence individuelle ne peut pas être répliquée sur des workers MeeWav ;
- le BYOL local, contrôlé uniquement par son titulaire et ne renvoyant que l'audio traité, est techniquement le scénario le plus prudent, mais doit être confirmé par écrit avant d'être commercialisé comme compatibilité officielle ;
- le contrôle distant de l'interface Antares par d'autres participants reste hors MVP ;
- aucun contournement Auto-Tune Central/iLok, aucune activation automatisée et aucun preset propriétaire ne sont permis.

Références : [FAQ AutoTune 2026](https://help.antarestech.com/hc/en-us/articles/42855736822932-AutoTune-2026-FAQ), [fiche AutoTune 2026](https://www.antarestech.com/products/pitch-correction/at2026), [politique de transfert et d'accès](https://help.antarestech.com/hc/en-us/articles/41113165662228-Antares-Transfer-of-Ownership-Policy).

Questions à obtenir par écrit d'Antares avant lancement : BYOL local dans une Room, transmission de l'audio traité, automatisation de paramètres par le seul titulaire, ouverture de l'UI native et futur hébergement cloud. Aucun message externe n'a été envoyé.

## Sécurité du Bridge local

Le navigateur demande un `pluginId` connu ; le registre natif résout l'installation locale. Il ne peut jamais demander « charge ce DLL/VST3 à ce chemin ».

Exigences de production :

- scanner dans un processus séparé, timeout parent de 10 secondes par plugin et quarantaine après crash ;
- un processus sandboxé par plugin ou chaîne ; droits fichiers/réseau réduits lorsque la plateforme le permet ;
- chemin sec hors du processus plugin, pour qu'un crash ne coupe ni la vidéo ni la Room ;
- watchdog sur callback, CPU, non-réponse, underrun/overrun et mémoire ;
- serveur de contrôle lié uniquement à `127.0.0.1`, origin allowlist, ticket court consommable une fois et secret de session ;
- aucun token de licence, credential vendor ou audio dans les logs ;
- mises à jour signées, notarisation macOS et signature Windows ;
- callback temps réel sans allocation, mutex bloquant, disque, réseau, JSON ou log.

Le squelette actuel ne satisfait pas encore ces critères : son scanner de production, son serveur loopback, son sandbox, son installer, son updater et son pont Room sont absents ou fail-closed. Le POC live charge le plugin dans son propre processus de test ; un crash y arrêterait la session.

## Plugins Cloud et serveurs spécialisés

Le cloud doit utiliser un catalogue fermé de plugins approuvés, jamais des uploads arbitraires. Chaque session obtient un worker Windows ou macOS éphémère, car Antares ne publie pas de plugin Linux. Chaque plugin tourne avec isolation forte, limites CPU/mémoire/temps de bloc, réseau et système de fichiers restreints, watchdog et bypass automatique. Le worker est détruit à la fin de la session.

Cette architecture ajoute : machines spécialisées, licences éditeur/OEM, orchestration régionale, GPU éventuel selon plugins, egress audio, observabilité temps réel et capacité de secours. Le coût ne se limite donc pas à une licence JUCE : il comprend au minimum sièges JUCE, signature/notarisation, certificats, maintenance Windows/macOS, support éditeurs, workers actifs par session et tests matériel.

Le traitement cloud peut convenir au son du public. Il est déconseillé pour le retour vocal de l'artiste, car l'aller-retour réseau s'ajoute au DSP, au buffer et au périphérique. Le monitoring professionnel doit rester local.

## Navigateur et références de recherche

Web Audio Modules 2 permet de construire une famille de plugins Web avec AudioWorklet/WASM, paramètres, automation, état et GUI. WCLAP montre qu'un plugin CLAP spécialement recompilé pour WebAssembly peut être hébergé dans le navigateur. Cela ne convertit pas un VST3/CLAP natif déjà installé et ne permet pas de charger Auto-Tune Pro dans le DOM.

Références : [WAM 2](https://github.com/webaudiomodules/api), [documentation WAM](https://www.webaudiomodules.com/docs/intro/), [WebCLAP](https://github.com/WebCLAP), [hôte de test WebCLAP](https://github.com/WebCLAP/browser-test-host).

AudioGridder confirme le principe d'un host réseau VST3/AU, avec chaînes, compensation de latence, automatisation, UI distante et isolation. Son client reste toutefois un plugin de DAW et sa stable publique date de mars 2023 ; il sert de référence d'architecture, pas de dépendance de production immédiate. Références : [AudioGridder](https://audiogridder.com/), [dépôt](https://github.com/apohl79/audiogridder), [historique](https://audiogridder.com/latest-releases/).

## Décision Go/No-Go

- **GO sous conditions** pour poursuivre le laboratoire Autotune openDAW et le POC local VST3.
- **NO-GO production** pour « Mes plugins — mode Pro » tant que le test micro/casque 30 minutes, le mode faible latence, le sandbox, le Bridge Room et l'autorisation écrite Antares ne sont pas obtenus.
- **NO-GO cloud** sans accords OEM/enterprise explicites et workers isolés.

Prochaine preuve utile : exécuter le POC live au casque filaire, mesurer la latence, vérifier zéro dropout pendant 30 minutes, puis brancher un seul flux traité à une vraie Room LiveKit de développement avec retour sec atomique.
