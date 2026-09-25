# La Place — contexte produit, UX et architecture

> Document de référence pour reprendre La Place sans devoir relire l'ensemble du code iOS et Web.
>
> État audité le 9 août 2026. Ce document distingue systématiquement la cible produit, ce qui existe réellement sur iOS, ce qui est déjà câblé sur le Web et ce qui reste simulé.

## 1. Sources de vérité utilisées

La version locale courante du dépôt iOS n'était pas la version la plus récente de La Place. La référence fonctionnelle auditée est :

- dépôt iOS : `LinkWave-IOS` ;
- branche : `upstream/rooms_v2/la-place-glow-up` ;
- commit : `ada85e0` ;
- version : `V2.1.40` ;
- module principal : `lib/features/rooms_v2` ;
- moteur audio iOS : `ios/Runner/MeewavLiveAudio`.

La référence Web auditée se trouve dans :

- `src/features/rooms/RoomsPage.tsx` ;
- `src/features/rooms/place/PlaceRoomExperience.tsx` ;
- `src/features/rooms/place/PlaceStage.tsx` ;
- `src/features/rooms/place/PlaceStudioPanel.tsx` ;
- `src/features/rooms/place/PlaceMixer.tsx` ;
- `src/features/rooms/place/PlaceDonationHat.tsx` ;
- `src/features/rooms/place/usePlaceRoom.ts` ;
- `src/features/rooms/place/place.service.ts` ;
- `src/features/rooms/place/place.types.ts` ;
- `src/features/rooms/place/place.fixtures.ts` ;
- `src/features/rooms/place/place-room.css` ;
- `src/features/rooms/place/place-room-premium.css` ;
- migrations Supabase `rooms_*`.

## 2. Définition de La Place

La Place est une Room musicale participative. Un Host diffuse une session, des Viewers la regardent et interagissent, et jusqu'à trois Guests peuvent être invités successivement ou simultanément sur scène.

La Place n'est pas :

- une visioconférence générique ;
- une simple page de streaming HLS ;
- un lecteur entouré d'un tableau de bord ;
- un clone de TikTok Live ;
- un duplicata de la messagerie MeeWav.

Sa valeur vient de la combinaison suivante :

1. une scène média dominante ;
2. une file de candidatures avec preview ;
3. une Green House privée avant passage ;
4. des Coulisses contrôlées par le Host ;
5. une régie de diffusion distincte du mix personnel des Guests ;
6. des outils éditoriaux légers ;
7. les profils, grades, suivis et collaborations de l'infrastructure MeeWav.

## 3. Règles produit non négociables

- Le média est le produit principal. Il doit dominer l'écran.
- Un Viewer ne voit pas une régie de production.
- Un Guest contrôle sa propre création et son propre confort d'écoute.
- Le Host contrôle ce qui part à l'antenne, pas les choix artistiques privés du Guest.
- Trois Guests maximum peuvent être `onstage` en même temps.
- Le direct appartient aux Rooms ; un éventuel replay publié appartient ensuite à La Scène.
- Le chat de Room est contextuel au direct. Les messages privés et demandes de collaboration utilisent les services partagés MeeWav.
- Une action affichée comme réelle doit être reliée à un backend ou explicitement signalée comme simulation.
- Les faders du Web restent **horizontaux**. L'orientation verticale de certains contrôles iOS ne doit pas être copiée sur desktop.

## 4. Rôles

### 4.1 Host

Le Host est le propriétaire opérationnel de la Room active.

Il peut, dans la cible iOS/Web :

- diffuser sa caméra et son micro ;
- utiliser sa propre piste musicale ;
- consulter le chat ;
- ouvrir ou fermer la file ;
- regarder les previews de candidature ;
- inviter une personne de la file ;
- inviter un profil éligible issu de ses relations MeeWav ;
- annuler une invitation encore en préparation ;
- faire passer un Guest de `ready` vers `backstage` ;
- faire passer un Guest de `backstage` vers `onstage` ;
- redescendre un Guest vers les Coulisses ;
- terminer le passage d'un Guest ;
- contrôler le gain et le mute publics du MIC de chaque Guest ;
- contrôler l'unique source Musique commune à la Room ;
- couper sa caméra de la sortie si nécessaire ;
- utiliser un Master mute ;
- lancer ou arrêter un sondage ;
- mettre un message en avant ;
- partager son écran ;
- terminer la Room avec confirmation explicite.

Le Host ne peut pas :

- modifier l'Auto-Tune personnel d'un Guest ;
- modifier la reverb personnelle d'un Guest ;
- modifier la compression personnelle d'un Guest ;
- remplacer silencieusement les réglages locaux d'un Guest ;
- publier à la place d'un Guest sans consentement ;
- accorder lui-même un droit média que le serveur n'a pas validé.

### 4.2 Viewer

Le Viewer entre dans la Room en mode réception uniquement.

Il peut :

- regarder et écouter ;
- activer le son après l'entrée si l'autoplay est bloqué ;
- ouvrir ou replier le chat ;
- envoyer un message s'il est connecté et non banni ;
- réagir ;
- envoyer un Golden Like selon le cooldown ;
- suivre le Host ;
- partager la Room ;
- ouvrir le profil du Host ;
- voter à un sondage ;
- rejoindre ou quitter la file ;
- accepter ou refuser une invitation ;
- passer en plein écran ou mode théâtre.

Il ne voit pas :

- le mixeur Host ;
- les gains des Guests ;
- les FX des participants ;
- les Coulisses ;
- les outils de régie ;
- les previews privées des autres candidatures.

### 4.3 Guest

Le Guest est un Viewer dont l'invitation a progressé dans le workflow.

Il conserve le chat et les interactions sociales, mais gagne :

- une Green House privée ;
- un contrôle caméra/micro avant passage ;
- un choix de format ;
- une table MIC personnelle ;
- ses FX voix personnels ;
- une préparation musicale ;
- un état Coulisses ;
- la publication caméra/micro/audio uniquement lorsqu'il monte sur scène.

Le Guest ne contrôle jamais les autres participants.

## 5. Cycle de vie d'une invitation

Le cycle de référence est :

```text
pending
  ├── declined
  ├── cancelled
  └── accepted
        └── ready
              └── backstage
                    ├── onstage
                    │     ├── backstage
                    │     └── ended / kicked
                    └── ended / kicked
```

Définition des états :

- `pending` : invitation envoyée, réponse attendue ;
- `accepted` : invitation acceptée, Green House ouverte ;
- `ready` : le Guest a terminé son preflight ;
- `backstage` : le Guest est prêt dans les Coulisses, non visible publiquement ;
- `onstage` : le Guest est diffusé ;
- `declined` : refus du Guest ;
- `cancelled` : annulation par le Host avant passage ;
- `ended` : passage terminé proprement ;
- `kicked` : retrait forcé/modération.

Chaque transition doit être validée côté serveur. Le client ne doit pas pouvoir sauter directement de `pending` à `onstage`.

## 6. Parcours complet Viewer → Guest

### 6.1 Entrée dans la Room

1. Le Viewer est authentifié si possible.
2. Une présence `viewer` est créée dans `room_participants_v2`.
3. Il rejoint le transport RTC en réception seule.
4. Le chat, les réactions et les votes deviennent disponibles selon ses droits.
5. Quitter l'écran retire sa présence sans terminer la Room.

### 6.2 Rejoindre la file

Sur iOS, rejoindre la file ouvre un enregistreur caméra avant :

- preview verticale ;
- durée maximale de 15 secondes ;
- réessayer ;
- valider ;
- upload best effort ;
- possibilité de continuer sans preview si la caméra est indisponible.

Le Host voit la preview avant d'inviter. La preview n'est jamais diffusée au public.

### 6.3 Invitation

Le Host peut inviter depuis la file. Sur iOS, le Viewer reçoit une invitation explicite avec deux choix :

- Accepter ;
- Refuser.

La décision ne doit pas être cachée dans un toast. Une invitation active reste visible jusqu'à action ou expiration.

### 6.4 Green House

Après acceptation, la Green House devient l'espace privé du futur Guest.

Fonctions présentes dans la branche iOS auditée :

- preview caméra réelle ;
- caméra avant/arrière ;
- caméra on/off ;
- micro on/off ;
- format 16:9 ou 9:16 ;
- panneau musicien ;
- métronome ;
- accordeur de référence ;
- sélection d'une piste dans « Ma table » ;
- préchargement de la piste dans le moteur audio ;
- CTA « Je suis prêt ».

Limite iOS connue : les choix caméra, format et mute restent locaux à l'écran Green House et ne sont pas tous transférés au publisher créé ensuite. Le Web doit corriger cette limite avec un état durable :

```ts
type GuestPreflightState = {
  cameraDeviceId?: string;
  microphoneDeviceId?: string;
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
  facingMode: "user" | "environment";
  format: "landscape" | "portrait";
  selectedTrackId?: string;
  localMicGain: number;
  localMusicGain: number;
};
```

### 6.5 Coulisses

Le Guest `ready` ne monte pas automatiquement sur scène. Le Host l'envoie d'abord en `backstage`.

Les Coulisses sont privées :

- pas d'image Guest dans le flux public ;
- pas de son Guest dans le flux public ;
- conservation du preflight ;
- préparation du transport RTC ;
- possibilité de revenir en Green House ou de terminer le passage.

### 6.6 Scène

Lorsque le Host passe l'invitation à `onstage` :

1. le serveur confirme que le Guest possède une invitation valide ;
2. le serveur délivre un token RTC autorisé à publier ;
3. le Guest publie caméra, micro et mix musique autorisé ;
4. le Viewer reçoit la composition mise à jour ;
5. les niveaux MIC Guests et la source Musique commune deviennent disponibles dans la régie Host ;
6. le Host conserve les commandes publiques ;
7. le Guest conserve ses réglages personnels.

En sortie de scène, la publication est coupée ou repasse en backstage. Le Guest revient ensuite au rôle Viewer lorsque son passage est terminé.

## 7. Composition média desktop

Le desktop ne doit pas être une version agrandie de l'iPhone.

La surface média doit reprendre la grammaire cinématographique de MeeWav TV :

- ratio principal 16:9 ;
- média occupant environ 70 à 75 % de la largeur utile ;
- panneau contextuel de 25 à 30 % maximum ;
- rayon proche de 22 px ;
- bordure très discrète ;
- halo dérivé du média ;
- aucune succession de cartes imbriquées ;
- une seule barre de contrôles immédiats ;
- aucune répétition de « La Place », « En direct » et du titre dans plusieurs surfaces.

Composition recommandée :

- 0 Guest : Host plein cadre ;
- 1 Guest : duo 60/40 ou duo équilibré ;
- 2 Guests : Host dominant et deux Guests empilés ;
- 3 Guests : grille 2×2 ;
- partage écran : écran principal et présentateur en PiP.

Sur Viewer, la scène est maximale et le chat est repliable. Sur Guest, les entrées sont Chat et Mon mixeur. Sur Host, le panneau de régie expose exactement quatre onglets textuels, dans cet ordre : Chat, Mixeur, Outils et Invités. Le bouton « Réglages » du bandeau agit comme raccourci vers la surface Outils sans créer une seconde implémentation.

## 8. Modèle audio : mix local × régie publique

Le principe essentiel de La Place est la séparation de deux couches :

```text
gain final diffusé = gain local du participant × gain public du Host
```

Les mutes s'appliquent de la même manière :

```text
diffusion active = micro local non muet ET régie Host non muette
```

### 8.1 Propriété du Guest

Le Guest contrôle :

- gain MIC local ;
- mute MIC local ;
- préparation de sa source avant le passage, sans créer une tranche Musique supplémentaire dans la régie ;
- monitoring personnel ;
- FX voix personnels.

### 8.2 Propriété du Host

Le Host contrôle séparément :

- gain public MIC de chaque Guest ;
- mute public MIC de chaque Guest ;
- gain et mute de l'unique source Musique commune ;
- caméra publique ;
- Master mute ;
- son propre MIC et sa propre musique.

Le Host peut atténuer ou retirer un Guest de l'antenne, mais il ne modifie jamais la valeur locale affichée au Guest.

### 8.3 Interface Web

Tous les faders Web sont horizontaux :

```text
[avatar] [nom/canal] [VU] [──────── fader ────────] [dB] [mute] [antenne]
```

Il ne faut ni faders verticaux, ni carrousel de tranches. Les sources doivent être lisibles dans une liste compacte et stable.

## 9. Moteur audio iOS réellement présent

La branche iOS récente contient un plugin natif `MeewavLiveAudio` et `MusicMixerProcessor`.

Il permet :

- de charger une piste locale ;
- de la décoder ;
- de lire, mettre en pause et seek ;
- de régler MIC et MUSIC ;
- d'appliquer les deux étages local × Host ;
- de mélanger la musique dans le buffer micro avant publication WebRTC ;
- de limiter les samples ;
- de remonter des niveaux RMS autour de 30 Hz ;
- de notifier la fin de piste ;
- d'envoyer les niveaux MIC/MUSIC au Host par LiveKit DataMessages.

Le Web ne possède pas encore l'équivalent. Une implémentation crédible nécessite au minimum :

- Web Audio API ;
- `AudioContext` partagé ;
- `MediaStreamAudioSourceNode` pour le micro ;
- source/décodage de la piste ;
- `GainNode` local MIC/MUSIC ;
- `GainNode` de régie publique ;
- nœuds FX personnels ;
- `MediaStreamAudioDestinationNode` ;
- publication de la piste résultante dans LiveKit ;
- analyseurs VU ;
- coordinateur média global MeeWav.

## 10. FX voix

La branche iOS Rooms V2 auditée ne contient pas d'Auto-Tune, de reverb ou de compression effectivement traités dans le moteur natif. L'ancien code comporte seulement des simulations plus simples.

Le Web affiche actuellement une UI plus ambitieuse :

- presets Clean, Warm, Rap, Trap, Radio ;
- Auto-Tune ;
- tonalité et gamme ;
- vitesse et humanisation ;
- reverb ;
- compression ;
- réglages détaillés.

La règle d'ownership est :

```ts
type ParticipantFxState = {
  roomId: string;
  participantId: string;
  preset: string;
  autoTune: FxAutoTuneState;
  reverb: FxReverbState;
  compression: FxCompressionState;
};
```

- Le Host édite uniquement ses propres FX.
- Le Guest édite uniquement ses propres FX.
- Le Viewer ne voit aucun réglage FX.
- Les FX ne sont jamais stockés comme un unique objet global de Room.
- Les changements doivent agir sur le graphe audio avant publication.
- Une persistance éventuelle doit être privée au participant, pas exposée comme régie publique.

## 11. Outils Host

### 11.1 Sondage

La cible iOS permet :

- question courte ;
- choix Oui/Non ou Pour/Contre ;
- durée 15, 30 ou 60 secondes ;
- lancement ;
- arrêt ;
- relance ;
- vote Viewer/Guest ;
- résultats realtime.

Le Host ne vote pas à son propre sondage. Un Viewer ne vote qu'une fois.

### 11.2 Mise en avant

La cible principale consiste à sélectionner un message du chat et l'afficher en lower-third pendant 10, 20 ou 30 secondes.

Le texte libre peut exister comme outil éditorial secondaire, mais ne remplace pas la sélection d'un message.

### 11.3 Partage d'écran

Le partage doit être une vraie publication RTC :

- le Host choisit un écran ;
- la piste est publiée ;
- le Viewer reçoit la piste screen-share ;
- elle devient le média principal ;
- le présentateur reste en PiP ;
- la fin de partage restaure automatiquement la scène.

Un `getDisplayMedia` affiché seulement localement n'est pas un partage d'écran de Room.

## 12. Chat, profils et collaboration

Le chat La Place est realtime et lié à la Room.

Il doit supporter :

- envoi ;
- messages système ;
- grades ;
- mise en avant ;
- suppression/modération ;
- slow mode ;
- signalement.

Les actions d'infrastructure ne doivent pas être recodées localement :

- « Voir le profil » ouvre le profil Viewer MeeWav ;
- « Message » ouvre ou crée la conversation dans la messagerie ;
- « Demande de collaboration » utilise le workflow partagé de collaboration ;
- « Suivre » utilise le repository Follow partagé.

Ces actions sont contextuelles, dans une fiche/popover de participant ou le profil. Elles ne doivent pas encombrer chaque miniature vidéo.

## 13. Likes, réactions et Golden Likes

### iOS récent

- réactions répétables ;
- emoji associé ;
- rafales ;
- pluie de réactions ;
- compteur realtime ;
- Golden Like avec cooldown glissant de 24 h ;
- Follow réellement câblé.

### Web actuel

- Like relié à `rooms_like_v1` ;
- un seul Like par utilisateur et par Room ;
- Golden Like relié à `rooms_give_golden_like_v1` ;
- un Golden Like global par jour civil Europe/Paris, cohérent avec Profil et Globe ;
- compteurs chargés via `rooms_engagement_state_v1` ;
- abonnement aux changements de `room_reactions_v2` ;
- pas encore de roue emoji, rafale ou pluie de réactions ;
- les compteurs restent disponibles dans l'état realtime ; dans la régie Host, ils sont affichés comme trois métriques compactes et non cliquables dans le bandeau supérieur ;
- Viewer et Guest peuvent les actionner uniquement pendant une Room live ;
- l'accès au profil, au message privé et à la demande de collaboration réutilise les routes partagées MeeWav ;
- Follow reste géré depuis le profil partagé, pas directement sur la scène de la Room.

Les Likes et Golden Likes Web sont donc câblés, mais le langage de réactions iOS n'est pas encore reproduit entièrement.

## 14. Chapeau

Le Chapeau n'est pas présent dans la branche iOS Rooms V2 récente. Une ancienne implémentation iOS utilisait des montants et répartitions simulés.

Le Web contient actuellement :

- un modèle 3D généré dans `PlaceDonationHat.tsx` ;
- un drawer de montants ;
- des montants de démonstration ;
- des notices indiquant que le paiement n'est pas raccordé.

Le Chapeau est une action Viewer/Guest. Dans la régie Host, seule sa valeur cumulée apparaît comme compteur compact et non cliquable dans le bandeau supérieur ; le contrôle permettant d'envoyer des pièces n'y apparaît jamais.

Il ne contient pas :

- wallet ;
- PSP/paiement ;
- transaction ;
- ledger ;
- remboursement ;
- split artiste/plateforme ;
- mise à jour realtime du total ;
- gestion fiscale ou territoriale.

Le Chapeau doit rester explicitement désactivé ou marqué comme simulation tant que ces dépendances ne sont pas disponibles. Aucun bouton ne doit laisser croire qu'un débit a eu lieu.

## 15. Modération et sécurité communautaire

Le backend possède déjà une partie des primitives nécessaires :

- bannissement ;
- kick ;
- slow mode ;
- suppression de message ;
- vérification de présence active ;
- contrôle des utilisateurs bannis.

L'UI La Place Web expose maintenant l'épinglage et la suppression d'un message. Le bannissement, le kick d'audience et le slow mode restent à exposer de manière compacte et auditable.

Le Host ne doit pas disposer de droits d'administration globaux. Ses permissions sont limitées à sa Room active.

## 16. État du câblage Web

### 16.1 Câblé ou largement câblé

- chargement Room, profils, participants, invitations et file depuis Supabase ;
- présence Viewer automatique via `rooms_enter_room_v2` ;
- sortie Viewer via `rooms_leave_room_v2` ;
- chat et abonnement realtime ;
- invitation depuis la file ;
- acceptation ;
- validation `ready` ;
- passages `backstage` et `onstage` ;
- limite UI de trois Guests ;
- gain MIC personnel ;
- gain public MIC Guest par le Host ;
- gain et mute de la source Musique commune ;
- mute MIC personnel ;
- mute MIC forcé par le Host ;
- Like ;
- Golden Like ;
- création de sondage Host ;
- vote, résultats, expiration et arrêt de sondage ;
- pin custom et mise en avant d'un message existant ;
- suppression Host d'un message ;
- fin de Room avec confirmation UI et nettoyage des états Supabase ;
- affichage HLS/Mux du broadcast Host ;
- realtime sur les tables Room principales ;
- distinction d'interface Host/Guest/Viewer ;
- FX visibles uniquement pour le participant courant ;
- faders horizontaux ;
- accès participant au profil, à la messagerie et à la demande de collaboration ;
- file, acceptation, refus, annulation, Coulisses, Scène, fin de passage et état prêt ;
- confidentialité RLS des invitations, de la file, du mixeur et des votes.

### 16.2 Partiellement câblé

- partage écran : capture locale oui, publication RTC non ;
- Green House : preview locale oui, preflight durable non ;
- mixeur Host : gains MIC Guests et source Musique commune stockés, traitement audio public réel absent sans RTC ;
- Master : interface de démonstration locale, sans contrat de mix serveur ;
- transport musical : état local et Supabase oui, upload, décodage et mix réel non ;
- caméra/micro : états UI/DB oui, pistes RTC non ;
- chapeau : visuel oui, paiement non ;
- engagement : Like/Golden oui, réactions iOS complètes non ;
- fin de Room : nettoyage Supabase oui, arrêt du fournisseur Mux/BytePlus non.

### 16.3 Simulé ou absent

- LiveKit Web ;
- caméra Guest en live ;
- micro Guest publié ;
- multicam live ;
- moteur audio Web ;
- injection piste dans WebRTC ;
- VU live ;
- FX audio réels ;
- preview file 15 secondes ;
- caméra avant/arrière Green House ;
- métronome/accordeur Web ;
- Follow direct dans La Place, disponible via le profil partagé ;
- modération audience complète : ban, kick et slow mode ;
- paiement Chapeau ;
- réactions emoji en rafale ;
- invitation depuis les suivis réciproques ;
- bulk invite ;
- arrêt serveur du flux externe Mux/BytePlus.

## 17. Modèle Supabase actuel

Tables principales :

- `rooms_v2` ;
- `room_participants_v2` ;
- `room_invitations_v2` ;
- `room_queue_v2` ;
- `room_messages_v2` ;
- `room_mixer_state_v2` ;
- `room_broadcasts_v2` ;
- `room_reactions_v2` ;
- `room_polls_v2` ;
- `room_poll_votes_v2` ;
- `room_pinned_items_v2` ;
- `room_bans_v2`.

RPC utilisées par le Web actuel :

- `rooms_enter_room_v2` ;
- `rooms_leave_room_v2` ;
- `rooms_send_message_v2` ;
- `rooms_join_queue_v2` ;
- `rooms_invite_from_queue_v2` ;
- `rooms_accept_invitation_v2` ;
- `rooms_mark_invitation_ready_v2` ;
- `rooms_move_invitation_to_backstage_v2` ;
- `rooms_move_invitation_to_stage_v2` ;
- `rooms_move_invitation_to_invitations_v2` ;
- `rooms_set_own_mic_gain_v2` ;
- `rooms_set_own_music_gain_v2` ;
- `rooms_set_own_mic_muted_v2` ;
- `rooms_set_host_mic_forced_muted_v2` ;
- `rooms_set_host_guest_mic_gain_v3` ;
- `rooms_set_host_guest_music_gain_v3` ;
- `rooms_set_own_music_muted_v3` ;
- `rooms_set_audio_live_enabled_v2` ;
- `rooms_set_own_audio_playback_state_v2` ;
- `rooms_like_v1` ;
- `rooms_give_golden_like_v1` ;
- `rooms_engagement_state_v1` ;
- `rooms_create_poll_v2` ;
- `rooms_stop_poll_v2` ;
- `rooms_vote_poll_v2` ;
- `rooms_poll_state_v3` ;
- `rooms_pin_custom_item_v2` ;
- `rooms_pin_message_item_v2` ;
- `rooms_clear_pinned_item_v2` ;
- `rooms_delete_message_v2` ;
- `rooms_leave_queue_v2` ;
- `rooms_decline_invitation_v2` ;
- `rooms_cancel_invitation_v2` ;
- `rooms_set_queue_open_v3` ;
- `rooms_end_guest_passage_v3` ;
- `rooms_end_place_v3`.

RPC présentes dans les migrations mais encore non exposées par l'interface actuelle :

- `rooms_kick_invitation_v2` ;
- bannissement et slow mode d'audience.

## 18. Limites backend restantes

### 18.1 Gains et routage

La migration Web V3 conserve les contrats de compatibilité iOS, mais l'interface Web applique la décision produit suivante : une tranche MIC par participant et une seule tranche Musique commune. Les pistes individuelles ne créent jamais de lignes « Musique · Prénom » dans la régie.

Il faut distinguer explicitement, par participant :

- `local_mic_gain` ;
- `local_music_gain` ;
- `host_mic_gain` ;
- `host_music_gain` ;
- `self_mic_muted` ;
- `self_music_muted` ;
- `host_mic_muted` ;
- `host_music_muted` ;
- `audio_live_enabled`.

Le contrat de contrôle est stabilisé côté état et persistance. Son effet audible dépend encore du futur transport RTC et du moteur de mixage serveur/client.

### 18.2 Présence Guest

`rooms_enter_room_v2` préserve désormais le rôle Guest lorsqu'une invitation est `ready`, `backstage` ou `onstage`. Une entrée n'est acceptée que si la Room est réellement `live`.

### 18.3 Fin de Room

`rooms_end_place_v3` termine la Room, ferme les présences, invitations et file, nettoie le mixeur, ferme le sondage et la mise en avant puis marque le broadcast arrêté en base. Il reste à appeler réellement le fournisseur vidéo pour arrêter/revoquer le flux externe et les futurs droits RTC.

### 18.4 Erreurs live

Le fallback automatique vers des fixtures a été supprimé pour les routes live. Les données de démonstration sont activées uniquement par un rôle demo explicite ; une Room absente ou arrêtée affiche une antenne fermée sans participants fictifs.

## 19. RTC et transport média attendus

Le Web doit posséder une abstraction indépendante du fournisseur :

```ts
type PlaceMediaRole = "host" | "guest" | "viewer";

type PlaceMediaSession = {
  connect(roomId: string): Promise<void>;
  disconnect(): Promise<void>;
  setRole(role: PlaceMediaRole): Promise<void>;
  publishCamera(enabled: boolean): Promise<void>;
  publishMicrophone(enabled: boolean): Promise<void>;
  publishMixedAudio(track: MediaStreamTrack): Promise<void>;
  publishScreenShare(enabled: boolean): Promise<void>;
};
```

Comportement :

- Viewer : subscribe-only ;
- Host : publish caméra/mix audio/screen share ;
- Guest `accepted/ready/backstage` : permissions locales mais aucune publication publique ;
- Guest `onstage` : publish autorisé ;
- Guest redescendu : publication révoquée ou désactivée immédiatement ;
- fin de Room : tous les publishers sont révoqués.

Le flux HLS/Mux peut rester utile pour la distribution à grande échelle, mais ne remplace pas le transport interactif des Guests ni les retours de régie.

## 20. Sécurité RTC

La branche iOS auditée présente deux risques à ne pas reproduire :

- le client fournit `roomName` et `canPublish` à la fonction de token ;
- une clé de signature de secours peut être présente côté application.

Règles Web/production :

1. le serveur déduit la Room depuis la base ;
2. le serveur authentifie l'utilisateur ;
3. le serveur vérifie l'invitation et son état ;
4. seul le Host ou un Guest réellement `onstage` reçoit `canPublish` ;
5. un Viewer reçoit uniquement `canSubscribe` ;
6. aucun secret LiveKit n'est livré au navigateur ;
7. chaque changement de rôle invalide ou renouvelle les grants ;
8. un ban ou kick révoque immédiatement l'accès ;
9. toutes les transitions sont journalisées ;
10. les URLs d'upload de preview sont signées, limitées et expirables.

## 21. Intégration avec le coordinateur média MeeWav

Une seule source audio MeeWav doit jouer à la fois.

La Place doit s'intégrer au coordinateur global avec une source telle que :

```ts
type ActiveMediaSource =
  | "room"
  | "scene_video"
  | "scene_audio"
  | "scene_tv"
  | "global_audio";
```

Entrer dans une Room active met en pause La Scène, MeeWav TV et le lecteur audio global. Lancer un autre média après la Room coupe ou met en pause la Room selon l'action explicite de l'utilisateur.

## 22. Contrat responsive et accessibilité

### Desktop

- scène dominante ;
- rail latéral compact ;
- faders horizontaux ;
- Host : quatre surfaces textuelles, Chat + Mixeur + Outils + Invités, sur une seule ligne ;
- Guest : Chat + Mixeur ;
- Viewer : Chat uniquement ;
- plein écran et mode théâtre.

### Mobile

- média en premier ;
- rail converti en bottom sheet ;
- pas de double scroll ;
- contrôles tactiles d'au moins 44 px ;
- Green House plein écran ;
- mixeur personnel compact.

### Accessibilité

- focus visible ;
- annonces accessibles pour invitation, arrivée sur scène et fin de passage ;
- dialogue d'invitation correctement libellé ;
- valeurs de fader exposées en dB ;
- états mute/routage exprimés par texte et icône ;
- aucun état transmis uniquement par couleur ;
- support `prefers-reduced-motion` ;
- focus restitué après drawer/dialogue ;
- sous-titres lorsque la source le permet.

## 23. Critères de conformité fonctionnelle

La Place Web est conforme au modèle iOS seulement lorsque :

1. un Viewer rejoint automatiquement en subscribe-only ;
2. le chat et les réactions sont immédiatement cohérents ;
3. la file peut être rejointe et quittée ;
4. une preview 15 secondes peut être envoyée ;
5. le Host peut la lire avant invitation ;
6. l'invitation peut être acceptée ou refusée ;
7. la Green House conserve ses réglages ;
8. le Guest ne publie rien avant `onstage` ;
9. les Coulisses restent privées ;
10. le Host peut gérer trois Guests maximum ;
11. les caméras Guests apparaissent réellement ;
12. un MIC existe pour chaque Guest et une seule source Musique commune existe dans la régie ;
13. les gains personnels MIC et publics MIC sont indépendants ;
14. les faders Web sont horizontaux ;
15. les FX sont personnels et réellement appliqués ;
16. les VU reposent sur des signaux réels ;
17. le sondage peut être créé, voté, arrêté et relancé ;
18. un message du chat peut être mis en avant ;
19. le partage écran est reçu par les Viewers ;
20. Follow, profil, message et collaboration utilisent l'infrastructure ;
21. Likes et Golden Likes restent cohérents en realtime ;
22. le Chapeau ne simule jamais un paiement réel ;
23. le Host peut modérer ;
24. terminer la Room nettoie tout le runtime ;
25. aucun client ne peut s'accorder lui-même un droit de publication RTC.

## 24. Résumé opérationnel

La Place iOS possède déjà le bon modèle mental : Viewer, invitation, Green House, Coulisses, Scène, mix personnel et régie Host. Son moteur audio MIC + MUSIC est réel et son multicam repose sur LiveKit.

Le Web possède désormais la séparation Host/Guest/Viewer, les outils de régie, le workflow file/Coulisses/Scène, le chat avec mise en avant et suppression, les sondages complets, les Likes/Golden Likes, les gains MIC personnels/publics, une source Musique commune et le nettoyage Supabase. L'interface est exploitable comme démonstration produit cohérente. La production média reste toutefois conditionnée au transport RTC, au moteur audio réel, à l'arrêt externe Mux/BytePlus, au paiement du Chapeau et à la modération audience complète.

La règle qui doit guider toute suite du chantier est :

> Le Guest crée et règle son signal. Le Host décide de ce qui part à l'antenne. Le Viewer profite du live sans voir la régie.
