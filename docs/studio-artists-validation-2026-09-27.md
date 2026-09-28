# Studio Meewav — régie pour artistes

## Périmètre

Windows, `codex/desktop-studio-polish`. La préparation du lancement et la régie pendant une Room utilisent `RoomProductionPreparation`. Le mixeur des Rooms conserve ses faders, ses effets et sa chaîne de traitement. Aucun moteur d’autotune n’a été remplacé. Aucun changement Web, Android, iOS ou backend dans cette livraison.

## Réalisation

- Régie graphite avec accents violets, séparation des sources vidéo, de la composition et du son. Sur un grand écran, image et son sont juxtaposés ; les réglages de cadrage sont repliables. Le mode performance conserve le son accessible.
- Voix et entrée musicale : faders logarithmiques de −60 à 0 dB, vumètres après traitement, témoin de crête mémorisé, mute et écoute privée désactivée par défaut. Le vumètre réserve sa zone chaude aux niveaux élevés.
- En Room, les contrôles de niveau et de mute utilisent les canaux du mixeur existant. L’essai de voix réutilise son moteur et ses effets. Un changement réel de périphérique ferme l’ancienne capture avant la nouvelle acquisition. Les réglages du lancement ne sont appliqués qu’une fois ; la Room reste ensuite la source de vérité.
- Instruments, platines et logiciels musicaux : entrée audio Windows dédiée, stéréo préservée, suppression des traitements automatiques de parole, mode mono avec compensation de niveau au centre, balance gauche/droite et retard de 0 à 1 000 ms. Ces réglages agissent sur la piste réellement envoyée par le transport.
- Reconnexion musicale : le silence du transport ne remet plus le gain à zéro. La reprise respecte le fader et le mute choisis.
- Essai local de 30 secondes : audio, ou image de sortie et audio, relecture, téléchargement du fichier réel et effacement. Un limiteur protège uniquement le mix d’essai. Les entrées empruntées ne sont pas arrêtées par le recorder. Le passage en direct annule l’essai privé.
- Accès aux effets vocaux existants depuis la régie. Le scanner VST3 est encore réservé au mode `audio-lab` ; aucun faux gestionnaire de plugins n’a été ajouté.

## Vérifications automatisées

- `npm run typecheck:ci` : aucun diagnostic.
- `npm run build` : succès. Avertissements déjà présents concernant la taille des chunks et des imports dynamiques non séparés.
- ESLint sur les nouveaux composants et le code audio modifié : succès. `PlaceRoomExperience.tsx` conserve ses avertissements de dépendances de hooks préexistants ; aucune erreur.
- 44 tests passent dans neuf fichiers : `RoomProductionPreparation.stress`, `StudioSoundcheck`, `DesktopMusicSource`, `DesktopMediaDevices`, `roomProductionSetup`, `RoomVideoProgram` (unitaires et stress), `videoScene`, `RoomLaunchDialog`.
- Couverture ciblée : double acquisition évitée avec le moteur voix de la Room, changements de gain/mute vers les canaux existants, permissions refusées et reprises, captures tardives, déconnexion vidéo, vingt cycles caméra, démarrage répété, arrêt préservant les caméras, réglages audio bornés, monitoring initialement coupé, gain préservé lors des reconnexions, export d’essai, limite des trente secondes, arrêt pendant le direct et libération des seules ressources appartenant au recorder.

## Validation dans Electron

Session Electron isolée avec vidéo et audio synthétiques, sans utiliser les périphériques personnels. Contrôles exercés : choix et reconnexion des sources, application du plan vidéo, faders, mute, écoute privée, mono, balance et retard. Captures vérifiées à 1 440 × 900 et 1 000 × 720 pixels CSS ; aucun débordement horizontal constaté.

Un essai caméra et audio de 2,2 secondes est relisible dans le lecteur. Un second essai audio seul a été exporté par le mécanisme de téléchargement Electron : état `completed`, 34 432 octets écrits. Le bouton Effacer retire le résultat et son lien. Les captures et journaux restent dans `.tmp/rooms-viewer-validation-5298`, hors Git ; le serveur et les fichiers du harness temporaire sont supprimés.

## Limites

Les essais matériels n’utilisent pas les périphériques personnels de l’utilisateur. La diffusion réelle vers le backend, les interfaces USB/ASIO, le casque physique et la latence acoustique de bout en bout ne sont pas validés par ces tests. ASIO et la capture audio d’une application isolée ne sont pas disponibles dans cette régie. Les entrées Windows déjà exposées par une interface ou un pilote virtuel sont prises en charge.
