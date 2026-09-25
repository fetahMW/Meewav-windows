# Meewav Desktop — validation Windows

## Nouveau dépôt Windows — 25 septembre 2026

- Installation propre réussie à la racine, dans `apps/meewav-studio` et dans `vendor/globe-vinyle`.
- `npm run build` réussi ; le build signale encore les avertissements de taille des modules partagés et l'usage d'`eval` dans la dépendance Superpowered.
- Test ciblé `PlaceMixerPlaybackMenu.test.tsx` : 6 tests réussis.
- `npm run typecheck` échoue sur 62 diagnostics des sources React partagées reprises depuis le travail Web : 20 en production, 42 dans les tests. Les causes dominantes sont une cible TypeScript ES2020 pour des API plus récentes, des types Node absents dans les tests, des options Testing Library invalides et des types/fixtures désynchronisés. Ce contrôle n'est pas validé.
- L'application Electron du dépôt Windows s'ouvre sur le port 5197. Dans la Room Place DEMO host, onglet Mixeur sélectionné, mesure du rendu à 1440 × 902 px CSS : « Privé » 40 × 30 px avec libellé complet, pistes précédente/suivante 20 × 20 px, retour au curseur et options de lecture 28 × 28 px sur la même ligne. Aucun débordement ni texte coupé observé. Dans cette Room sans piste chargée, les commandes de transport, destination et retour au curseur sont désactivées ; les états actifs avec une piste restent à vérifier.

## Tranche historique du 24 septembre 2026

## Exécuté / non exécuté

- Build Vite après intégration du compositeur : réussi.
- Tests unitaires ciblés du wizard Web/Desktop, de La Cage, du compositeur et du transport réussis. Dernière sélection : 33/33 tests réussis dans six fichiers. Un lancement complémentaire de `PlaceMixer.audioPlayer.test.tsx` a signalé 6 échecs sur 16 dans des attentes de son interface ; ce fichier n’a pas été modifié dans cette tranche. Doubles de périphériques et de transport : **aucune preuve matérielle déduite de ces tests**.
- Syntaxe main/preload vérifiée. ESLint ciblé : aucune erreur, avertissements Fast Refresh et cleanup du wizard.
- Typecheck global en échec avec 119 diagnostics dans les autres surfaces ; aucun diagnostic sur les fichiers de production Desktop modifiés au contrôle ciblé. Sortie locale antérieure : `desktop-typecheck.log`.
- Avant l’interdiction de Computer Use : Globe observé dans la fenêtre native Meewav. Aucun contrôle UI effectué après cette interdiction.
- Interface USB/pro, deuxième caméra, réception viewer : non vérifiées pour cette tranche.
- Fenêtre Windows sans cadre natif, avec un petit bandeau gris dédié aux menus Fichier/Modifier/Affichage/Fenêtre et aux commandes de fenêtre ; le logo reste dans l’interface Meewav. Build et tests React ciblés réussis ; rendu dans la fenêtre non vérifié après l’interdiction de Computer Use.

## Lancer et vérifier manuellement

Depuis `C:\Users\linkw\Desktop\Meewav-Windows` : `npm run desktop:dev`. Relancer pour charger aussi les changements Electron. Après régénération depuis ce dépôt, le raccourci **Meewav** lance la même commande.

Pour vérifier le bandeau, fermer entièrement l’ancienne fenêtre et arrêter son processus `desktop:dev`, puis relancer la commande. Le rechargement de la page ne recrée pas la fenêtre Electron : l’ancien cadre blanc peut donc rester visible tant que l’ancien processus tourne.

1. Se connecter avec le host QA. Rooms → créer → Place → saisir le titre et les premières informations → Continuer. **Configuration** reprend les champs existants de la Room ; **Studio Meewav** vient ensuite. Le parcours Desktop est Identité → Configuration → Studio Meewav → Lancement, y compris pour La Cage. Pas de Résumé ni de seconde Green Room sur Desktop.
2. Dans Studio Meewav : détecter les entrées audio, sélectionner le micro/endpoint USB, mesurer l’entrée. Parler/jouer : le meter privé doit varier. Couper/réactiver le micro privé : silence puis retour. Dans la Room LIVE, vérifier que la ligne micro du Mixeur Meewav mesure le signal traité lorsque la diffusion démarre.
3. Détecter les caméras, ajouter A et B si disponible. Choisir A en Preview, TAKE. Choisir B : Program doit rester sur A jusqu’à TAKE. Refaire B→A, essayer split/PIP/grille, déplacer l’incrustation et utiliser FADE. Ajouter une fenêtre/écran : aucun changement Program avant TAKE.
4. Pour un logiciel musical, diriger sa sortie vers une entrée audio loopback/virtuelle visible par Windows. Dans le Source Rack, choisir cette entrée distincte du micro et vérifier son meter privé. Dans la Room LIVE, vérifier au viewer indépendant la source musicale, le fader/mute Musique, le master et l’arrêt. Le MIDI ne fournit pas lui-même de son.
5. Après le Studio, continuer directement vers Lancement. Le Studio de lancement est privé ; quitter son étape libère les captures. Pour Place LIVE : sujet séparé vide, accès Public, puis « Créer ma Room LIVE ».
6. Dans la Room, la régie host rouvre les caméras et conserve la disposition préparée. Effectuer TAKE puis « Passer en direct ». Dans un navigateur indépendant connecté au viewer QA, ouvrir `/rooms/place?room=<UUID>` sur le serveur Web local. Comparer le roomId, l’image reçue à **Program**, le son et les actions du Mixeur. « Transport connecté » ne prouve pas la réception.
7. Arrêter la diffusion, puis terminer la Room avec sa commande existante. Quitter : caméra et micro doivent être libérés.

Pour préparer sans Room backend : accès direct host **DEMO** → Production. La diffusion est désactivée.

## Fonctionnement et limites

Une UI React/Vite partagée, aucun deuxième frontend. Le même composant Studio sert au séquenceur de lancement et à la préparation dans la Room host. Les choix caméra/micro/disposition passent par un état de session lié au roomId ; les flux privés sont ouverts à nouveau dans la Room. Le Mixeur existant utilise le micro sélectionné ; la piste canvas Program passe par la connexion LiveKit existante comme vidéo caméra host. Preview est séparé. CUT/TAKE sont immédiats ; FADE dure 500 ms. Les captures sont libérées à la sortie et l’annulation d’une publication tardive est testée.

`enumerateDevices` et `getUserMedia` exposent les endpoints réels du pilote Windows via Chromium. Cela inclut les interfaces USB reconnues, mais **pas un moteur ASIO/WASAPI exclusif**. Les canaux physiques regroupés par le pilote ne sont pas inventés comme entrées distinctes. Le format affiché vient de `getSettings`. La chaîne voix du Mixeur demande du mono 48 kHz. Le périphérique pro doit être branché pour validation.

Le Mixeur Meewav existant reste la seule surface audio de la Room. Ses lignes micro host/invités, musique et master, ses faders/mutes, ses effets voix, son monitoring et ses appels RPC de gain/mute restent en place. La source micro Desktop sélectionnée par `deviceId` entre dans la chaîne voix existante puis dans la publication LiveKit de la Room ; le vumètre micro host LIVE lit la piste traitée. Une seconde entrée Windows, distincte du micro, est capturée comme source musicale et utilise la piste LiveKit Musique et les états audio host existants. Ses gains et mutes Musique/Master pilotent le signal avant publication. Aucune source fictive ni nouvel état backend. La capture ASIO exclusive ou du son d’une seule application n’est pas implémentée ; un logiciel musical exige une sortie loopback ou virtuelle exposée comme entrée Windows. Les autres lignes LIVE ne reçoivent pas encore de nouvelle mesure Desktop. Les meters privés du Studio servent au contrôle d’entrée avant publication.

Le petit bandeau gris est la barre de fenêtre Windows : le cadre blanc et le menu natif File/Edit/View/Window sont supprimés. Les actions utiles de ces menus sont accessibles sous Fichier/Modifier/Affichage/Fenêtre, avec les commandes réduire, agrandir/restaurer et fermer. Le logo Android exporté reste dans l’interface Meewav ; le titre « Rooms » reste uniquement dans la page Rooms. Le trait lumineux sous le bandeau a été retiré. Son apparence et les gestes de déplacement/redimensionnement doivent être vérifiés manuellement après redémarrage complet de `npm run desktop:dev`.

Capture vidéo écran/fenêtre raccordée ; son système pas encore intégré au Mixeur. Invités gérés par la Room, pas encore sources du compositeur. Moments/rappel complet de configurations non implémentés.

La création Place utilise le contrat Android : `rooms_v2` → `room_participants_v2` host, même UUID sur retry. Elle crée directement une Room **LIVE publique** ; les médias restent privés avant publication, mais aucun état backend draft n’existe dans ce chemin. Accès privés et sujet séparé refusés explicitement, description persistée. Les autres préparations restent DEMO et sont étiquetées. Le pipeline avancé Wave reste distinct, non validé ici.

## Fichiers concernés

- `src/App.tsx`, `package.json` : entrée partagée et lancement Desktop.
- `apps/meewav-studio/main.cjs`, `preload.cjs`, `dev.mjs`, `platforms/*`, `install-desktop-shortcut.ps1` : shell et capacités.
- `src/runtime/RuntimeProvider.tsx`, `DesktopTitleBar.tsx`, `desktop-titlebar.css`, `DesktopMediaDevices.ts`, `DesktopMusicSource.ts`, `RoomVideoProgram.ts` et tests.
- `src/features/rooms/place/RoomProductionPreparation.tsx`, `room-production-preparation.css`, `PlaceRoomExperience.tsx`.
- `src/features/rooms/place/placeLiveKit.service.ts`, `usePlaceLiveKitRoom.ts`, `placeLocalAudioEngine.ts`, `roomDevicePreferences.ts`, `placeLiveKit.callProgram.test.ts`.
- `src/features/rooms/launch/RoomLaunchDialog.tsx`, `CageLaunchDialog.tsx`, `createLiveRoom.ts` et tests : Studio dans les étapes du lancement.
- `src/features/rooms/place/roomProductionSetup.ts` : transmission locale des choix au roomId créé.

Ancien prototype `src/features/studio` conservé sans route. Logo/icône issus des vecteurs Android, provenance dans `assets/provenance.json`.

## Retour arrière et Mac

Retirer seulement ces fichiers/hunks Desktop en préservant l’arbre dirty antérieur ; aucun reset global. Le Web host est conservé. Aucun import/build/sync Android, aucune migration Supabase/RLS, aucune fixture investisseur modifiée, aucun déploiement.

Mac reprend le même frontend/preload et l’adapter `platforms/macos.cjs`. Restent : permissions caméra/micro/écran, descriptions Info.plist, entitlements/hardened runtime, validation CoreAudio et périphériques, capture et reprise, packaging arm64/x64, signature et notarisation. Son système annoncé indisponible. Aucun binaire Mac compilé/testé ici.

## Ajustements Studio et lancement

Surfaces noires/graphite, accents violet `#9561ff`, rose Program conservé. Contrôles Studio isolés des styles du wizard pour éviter les textes coupés. Split réserve deux zones ; Incrustation expose son emplacement déplaçable même avant la seconde source. Les zones manquantes sont des indications privées et bloquent TAKE/CUT/FADE ; elles ne sont pas publiées. Les nouvelles captures sont sélectionnées dans Preview. Tests ciblés : 31 réussis (parcours Web/Desktop, configurations des Rooms et géométrie canvas). Build Vite réussi. Aucune nouvelle validation visuelle ou matérielle.

## Séquenceur pleine page et composition vidéo

Le séquenceur Desktop utilise la page sous la barre Windows sur ses quatre étapes, pour les six types de Room. La Cage ouverte depuis les modèles utilise également ce mode. Le Studio ne rétrécit plus dans le body flex de La Cage ; le scroll reste sur le corps du séquenceur. Validation visuelle à effectuer par l’utilisateur (computer use interdit).

Les zones disposent de sélecteurs caméra/capture explicites et du cadrage Image entière/Remplir. Split possède un séparateur réglable ; la miniature PiP se déplace et se redimensionne. Le mode Libre ajoute déplacement, taille, coordonnées et premier plan. Ces réglages restent dans Preview avant CUT/TAKE/FADE. Le snapshot Program copie aussi la géométrie et les cadrages. Une zone B n’est plus décalée en A quand A est vide.

La géométrie et les affectations caméra sont mémorisées dans la configuration locale. Les captures écran/fenêtre sont libérées en quittant Studio et doivent être sélectionnées de nouveau dans la Room ; ce point est indiqué à côté de leur ajout. Aucun changement de contrat backend.

Vérifications : 42 tests ciblés réussis ; les 5 tests éditeur/canvas ont été relancés après le dernier ajustement et passent. Build Vite réussi. Le typecheck global signale 47 diagnostics hors des fichiers modifiés de cette tranche ; aucun diagnostic filtré sur les fichiers éditeur, composition, persistance ou séquenceurs. Aucun test physique ni nouvelle vérification visuelle effectué.
