# Switch Room — six expériences

## État

Intégration autorisée dans main le 7 septembre 2026.
Aperçu stable : http://127.0.0.1:5182/rooms/home
Le bouton provisoire de lancement crée une session indépendante ; un ancien switch ne redirige pas les nouveaux lancements.

Les six expériences sont proposées depuis chacune des autres : Place, Scène, Cage, Classe, Wave, Loge. La room actuelle seule est grisée. Un passage peut être temporairement bloqué par une activité incompatible : vote, combat, parole élève ou échange privé en cours. Le message indique quoi terminer.

**Les migrations ne sont pas appliquées au Supabase distant.** Le parcours a été validé avec plusieurs clients locaux ; les transactions SQL ont été exécutées dans PostgreSQL via PGlite. Ces tests ne prouvent pas la livraison Realtime entre des comptes de production ni le bon fonctionnement du worker audio distant. Aucune intégration distante n’est annoncée comme déployée.

## Comportement

- Commande host après l’audience, avec menu compact et réglages du séquenceur existant.
- Scène : programme préparé. Cage : vraie configuration de compétition, participants choisis ensuite dans la régie, sans roster inventé. Classe : sièges libres, les viewers restent spectateurs. Loge : accès au live inchangé ; les avantages VIP gardent leurs contrôles propres. Wave : import d’une véritable base et contrôle de ses paramètres.
- Les outils sont archivés par expérience sur le serveur avant remplacement de l’état actif. Retour sur un programme/tableau/SAS existant sans réinitialisation. Les versions des commandes restent monotones.
- Le serveur valide le changement une fois, puis chaque participant accepte pour sa propre version. Fermer/Échap/Pas maintenant garde le lecteur et le chat, avec les anciens outils désactivés.
- Le socle React et le rendu vidéo partagé restent stables, y compris lors des passages par la Cage. La disposition change ; pas de navigation ni de nouveau live.
- Invitation retardée pendant un dialogue visible ; un ancien panneau masqué ne la bloque pas.
- `Simuler un switch` sur la Place viewer de démonstration simule une décision du host vers la Scène. Ce bouton n’est pas disponible en live réel et ne donne aucun droit host côté serveur.
- Le filtre Invités réutilise la matière noire existante de l’accueil et le tiroir de console de droite à gauche.

## Backend

`20260907190000_rooms_switch_experience_v1.sql` : état versionné, demandes idempotentes, acceptations individuelles, archive privée des outils, préparation des expériences, sauvegarde/reprise, gardes des anciennes commandes, même rooms_v2 et un message système par changement. Réutilise les réducteurs Place et l’initialisateur Cage existants ; corrige une expression CASE ambiguë dans le validateur Cage repris.

`20260907191000_rooms_switch_wave_preparation_v1.sql` : préparation du moteur Wave normalisé dans la même session, import via le circuit de tickets/traitement existant, adoption de la base uniquement après traitement compatible, référence téléchargeable et gardes des commandes/votes Wave devenus périmés. Aucun résultat audio READY n’est fabriqué par le client. Le live ne bascule pas pendant le traitement. Un échec du worker laisse le live en place.

Transport : Supabase Realtime existant sur rooms_v2, plus récupération au retour d’onglet, à la reconnexion et contrôle périodique. Pas de second transport réseau ajouté. La simulation locale utilise Web Locks et les événements Storage, conformément aux repositories de démonstration existants.

## Vérifications

- 37 tests Vitest passent : SwitchRoom, PlaceRoomExperience.audio, place.service, PlaceConversationTools, RoomLaunchDialog.
- Playwright : préparation des cinq destinations depuis Place, puis les 30 paires dirigées entre six expériences via les vrais contrôles host et l’acceptation viewer. Même élément vidéo tout au long. Simulation viewer vérifiée.
- Autre parcours multi-client : host + deux comptes participants, acceptation immédiate, Échap, réponse tardive, rechargement, volumes, chrono, popup mobile.
- Filtre Invités : panneau noir, contenu dans la console, ouverture depuis la droite ; capture inspectée.
- SQL PGlite : 30 transitions, même live, permissions, idempotence, invitations périmées, ancien outil interdit, état conservé, participant ayant manqué l’événement, nouvel arrivant, activité/appel privé et anti-spam.
- Préparation SQL Wave : permission host, absence de notification/basculement avant la préparation, refus d’un asset non traité. Le test utilise des tables/retours de traitement de contrôle et un stub de l’initialisateur Wave ; il ne lance pas le worker audio réel. L’évaluation Scène est également un stub pour vérifier son enveloppe d’autorisation. Les réducteurs Place et le validateur/état vide Cage sont réels.
- Build Vite audio-lab réussi. Le typecheck global reste affecté par des erreurs préexistantes ; il n’est pas annoncé vert.

## Fichiers

Ajouts : `src/features/rooms/switch-room/` (domaine, contrôleur, menu, préparation, invitation, service, circuit Wave, styles et tests), les deux migrations ci-dessus, `scripts/test-switch-room-{sql,browser,six-browser,filter-browser}.mjs`.

Modifications : `PlaceRoomExperience`, `PlaceRoomShellHeader`, `PlaceStage`, `PlaceStudioPanel`, `place.service`, `usePlaceRoom`, `placeConversationTools.store`, `roomTools.service`, les types de boucle et le validateur de fichier (base 64 Mo / contribution 25 Mo), `rooms-home-filter-lacquer.css`. Le test audio utilise un mock partiel du provider partagé.

## Rejouer

Depuis le worktree, avec les dépendances accessibles :

```powershell
node C:/Users/linkw/Desktop/Meewav-Web/node_modules/vitest/vitest.mjs run src/features/rooms/switch-room/SwitchRoom.test.tsx src/features/rooms/place/PlaceRoomExperience.audio.test.tsx src/features/rooms/place/place.service.test.ts src/features/rooms/place/PlaceConversationTools.test.tsx src/features/rooms/launch/RoomLaunchDialog.test.tsx
node C:/Users/linkw/Desktop/Meewav-Web/node_modules/vite/bin/vite.js build --mode audio-lab
node scripts/test-switch-room-browser.mjs
node scripts/test-switch-room-six-browser.mjs
node scripts/test-switch-room-filter-browser.mjs
$env:PGLITE_MODULE_PATH='C:/Users/linkw/AppData/Local/Temp/meewav-switch-sql/node_modules/@electric-sql/pglite/dist/index.js'
node scripts/test-switch-room-sql.mjs
```

## Validation distante restant à faire

Appliquer les migrations sur l’environnement cible après vérification du schéma complet, vérifier Realtime avec host et viewers authentifiés distincts, puis effectuer l’import Wave avec Storage privé et worker audio configurés. Contrôler aussi invités réels et périphériques/connexions média réseau. La simulation sert à revoir l’UX, elle ne remplace pas ces contrôles.

## Préparation Classe — sélection des élèves

Avant le passage vers la Classe, le host ouvre la file actuelle et sélectionne de 1 à 24 identités distinctes. Il peut continuer avec 8 élèves : 16 chaises restent libres. Le serveur verrouille et revalide la file, refuse les accès révoqués, puis utilise la table existante des droits de siège (manual_grant). La transaction annule les réservations si le switch échoue ; les droits déjà attribués à d’autres élèves ne sont pas écrasés. Chaque viewer conserve le choix de son invitation. Aucun microphone ni caméra n’est activé.

La migration `20260907220000_rooms_switch_class_roster_v1.sql` est requise, avec les migrations Switch Room précédentes. Elle n’a pas été appliquée à Supabase distant. Le test SQL local couvre sélection, retrait, droits host et rollback avec une projection de sièges de test ; il ne valide pas Realtime ni la projection distante complète.

Vérifications ciblées : SwitchRoomPreparation.test.tsx, switchRoom.classRoster.test.ts, scripts/test-switch-class-roster-sql.mjs. L’ancien script de matrice six rooms ne prépare pas de sélection d’élèves et doit être adapté avant de servir à nouveau de validation complète.

La grille du host réserve désormais une ligne au prix, une à la grille extensible et une à la navbar. Les 24 chaises restent visibles lorsque le lecteur audio est replié.
