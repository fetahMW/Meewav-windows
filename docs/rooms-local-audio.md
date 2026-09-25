# Audio local de La Place

La Place possède maintenant une chaîne Web Audio locale réelle pour le micro du Host ou de l’invité actif :

`micro → gain/mute → EQ → correction optionnelle → compression parallèle → dry/reverb/delay → limiteur → MediaStreamDestination`

- Le navigateur ne demande le microphone qu’après une action explicite sur « retour casque ».
- Le monitoring est local, désactivé par défaut et séparé du flux destiné à la diffusion. Le bouton prévient d’utiliser un casque afin d’éviter le larsen.
- L’EQ utilise des `BiquadFilterNode`, la compression un `DynamicsCompressorNode`, la reverb un `ConvolverNode` avec une impulsion générée localement et le delay un `DelayNode` avec feedback borné.
- Les niveaux d’effets utilisent un mix dry/wet à puissance constante et le master passe par un limiteur de sécurité.
- `getPlaceProcessedAudioStream(roomId)` expose le `MediaStreamDestination` traité au futur adaptateur de publication LiveKit. Il n’est pas encore publié sur le réseau dans le Web actuel.

## Correction de justesse : deux chemins explicites

- **Voloco** reste un plugin VST3 desktop externe. Il doit être légalement installé et activé sur la machine, puis chargé par MeeWav Audio Engine. Aucun binaire ni aucune licence Voloco n’est embarqué dans le Web.
- **Moteur test MeeWav** est un processeur monophonique expérimental livré sous forme d’`AudioWorklet`. Il estime la fondamentale avec YIN, choisit la note autorisée la plus proche et applique une correction lissée avec deux têtes de délai croisées. Il est fonctionnel pour une comparaison locale au casque, mais ne possède pas encore la préservation de formants ni la qualité validée d’un produit commercial.

Le choix est local à l’appareil. Une seule route de correction peut être active afin d’éviter le doublement et les problèmes de phase. La conception et les limites du moteur test sont documentées dans [meewav-test-pitch-engine.md](./meewav-test-pitch-engine.md).

## Limites backend actuelles

- Le flux traité est prêt localement mais aucun client LiveKit Web n’est installé pour le publier. Le public ne reçoit donc pas encore le moteur test.
- Les paramètres FX vivent encore dans l’état local de la Room ; leur persistance serveur n’est pas nécessaire au traitement personnel.
- Le moteur test sert au prototypage et au monitoring. Une promesse professionnelle requiert encore des écoutes comparatives, des mesures de latence, une meilleure protection des transitoires/formants et une validation par navigateur/appareil.
