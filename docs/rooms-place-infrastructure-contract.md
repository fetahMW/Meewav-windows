# La Place — contrat d’infrastructure Web

Ce document est la frontière de vérité entre l’interface Web de La Place, Supabase et le futur transport média temps réel. Il interdit de présenter un état local, un média de démonstration ou une lecture HLS comme une piste RTC réellement publiée.

## Topologie cible

```text
Host / Guest Web ou iOS
├── caméra, micro, partage écran, sources composites
├── MeeWav Audio Engine local optionnel
└── publication SFU individuelle
          │
          ├── viewers : pistes individuelles et program metadata
          ├── recorder : ISO audio/vidéo + journal de réalisation
          └── compositor : replay dirigé / reprise MeeWav TV

Supabase
├── identité de Room et participants
├── file, invitations, Green House et coulisses privées
├── projection publique Host + invités `onstage`
├── réalisation PROGRAM versionnée
├── chat, sondages, highlight et réactions
└── droits, enregistrement et publication du replay à ajouter
```

Le SFU conserve les pistes de chaque participant. Le navigateur ne reçoit pas uniquement un composite déjà fusionné : cette séparation est indispensable au focus personnel, au simulcast, au plein écran local, aux ISO et au remontage du replay.

## État livré dans ce dépôt

### Plan de contrôle

- `rooms_public_stage_v1(room_id)` projette uniquement le host et au plus trois invités `onstage`. La file, la Green House, les coulisses, les previews et les identifiants d’invitation ne sont pas publics.
- `room_program_layout_v1` porte la réalisation officielle : mode, principal, verrou, ordre, sources, transition, preset et cadence Auto Director.
- `rooms_set_program_layout_v1` est réservé au host, vérifie les participants présents sur scène et utilise une révision compare-and-swap.
- `20260810153000_rooms_program_transition_lock.sql` impose un verrou transactionnel commun par Room avant les verrous de lignes de PROGRAM et de chaque mutation scène/coulisses/fin de passage ; un layout ne peut plus être validé sur une ancienne appartenance à la scène. Sous ce même verrou, `rooms_reconcile_program_layout_v1` conserve l’ordre des participants encore présents, ajoute les nouveaux arrivants, retire toute référence obsolète des sources et cadrages, annule un verrou devenu invalide et rabat le principal sur le host (puis sur le premier invité `onstage` si nécessaire). La fin de la Room supprime ce PROGRAM dérivé.
- `rooms_set_own_camera_enabled_v1` persiste uniquement l’intention caméra du host/guest courant ; la publication RTC reste la vérité du média-plane.
- Le focus personnel n’est jamais persisté dans ce document PROGRAM.
- Chat, sondages, highlights, engagement et workflow invité utilisent les RPC Rooms existants.

### Plan média

- Le host live peut actuellement être lu en HLS Mux lorsque le playback est actif.
- Les médias de démonstration sont des fichiers locaux explicitement libellés `MÉDIA` ou `APERÇU`.
- Une source n’est libellée `RTC` que si le DTO la déclare comme telle.
- La capture navigateur du partage d’écran est locale tant qu’elle n’est pas publiée au SFU.
- Les invités live n’ont pas encore de publication Web RTC raccordée dans ce dépôt.
- Les réglages Web Audio et les Twists restent locaux tant qu’une piste traitée n’est pas publiée dans la Room.

## Contrat de piste vidéo

```ts
type RoomVideoPublication = {
  publicationSid: string;
  roomId: string;
  participantId: string;
  sourceId: string;
  sourceType:
    | "front_camera"
    | "rear_camera"
    | "screen"
    | "desktop_composite"
    | "portrait_composite";
  aspectRatio: "16:9" | "9:16" | "4:3";
  transport: "rtc" | "hls";
  active: boolean;
  programEligible: boolean;
  viewerSelectable: boolean;
  preferredForDesktop: boolean;
  safeRegion?: {
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: number;
  };
};
```

Les identifiants de source sont générés par le média-plane ou par le service broadcast autoritaire, jamais par une URL fournie librement par le navigateur. Les contrats partiels sont rejetés. Le rendu PROGRAM utilise uniquement `active && programEligible`; une sélection personnelle utilise uniquement `active && viewerSelectable`. Le HLS Mux host est normalisé depuis `room_broadcasts_v2.mux_playback_id`. Une composition avant/arrière d’un même mobile reste une source du même participant et ne consomme pas une place d’invité supplémentaire.

## Contrat de réalisation PROGRAM

Seul le host ou un rôle de régie explicitement autorisé peut écrire :

```ts
type ProgramLayoutState = {
  mode: "auto" | "stage" | "grid" | "solo";
  primaryParticipantId: string;
  lockedParticipantId?: string;
  participantOrder: string[];
  selectedSourceByParticipant: Record<string, string>;
  transition: "cut" | "dissolve";
  preset: "performance" | "discussion" | "collaboration";
  autoDirectorProfile: "calm" | "dynamic" | "manual";
  safeFramingByParticipant: Record<string, {
    enabled: boolean;
    locked: boolean;
    maxZoom: number;
    sourceId?: string;
    safeRegion?: {
      x: number;
      y: number;
      width: number;
      height: number;
      confidence: number;
    };
  }>;
  updatedBy: string;
  updatedAt: number;
};
```

Invariants serveur :

- le host et chaque invité `onstage` apparaissent exactement une fois dans l’ordre ;
- le principal et le verrou appartiennent à cet ensemble ;
- aucune personne en file, Green House ou coulisses n’est référencée ;
- chaque montée, descente, fin de passage, départ ou exclusion réconcilie le PROGRAM dans la transaction de transition et incrémente sa révision uniquement si son contenu change ;
- un changement concurrent échoue sur conflit de révision puis le client recharge l’état autoritaire ;
- le zoom de cadrage automatique ne dépasse jamais `1.18x` ;
- un cadrage verrouillé exige `enabled`, la source PROGRAM sélectionnée et une `SafeVideoRegion` normalisée entièrement comprise dans le média ; un cadrage non verrouillé ne conserve aucune région figée ;
- une source sélectionnée devra être vérifiée contre le registre de publications SFU lorsqu’il existera.

## Focus personnel

Le focus, la grille locale, le solo, le plein écran, la position du PiP et celle du rail restent dans le client du viewer. Ils ne modifient ni le PROGRAM, ni les autres viewers, ni le replay, ni MeeWav TV. Le bouton **Revenir à la réalisation** supprime cet override local.

## Auto Director

Le moteur n’utilise pas un changement de plan immédiat sur `activeSpeaker`. Il reçoit des signaux normalisés : rôle déclaré, RMS/activité audio, activité soutenue, priorité manuelle, partage d’écran, stabilité de plan et qualité réseau.

- `manual` : suggestions seulement ;
- `calm` : durée minimale de plan de huit secondes et seuil de bascule élevé ;
- `dynamic` : durée minimale de six secondes et seuil plus réactif, sans descendre sous les garde-fous musicaux ;
- un verrou manuel gagne toujours ;
- le canal Musique/Master n’est jamais un candidat vidéo.

La détection chant/instrument n’est pas prétendue tant qu’un service réel ne fournit pas ces signaux. Le rôle et les métriques audio vérifiables restent le fallback.

## Contrat audio public

Le mix visuel est indépendant du mix audio. Mettre un participant à l’antenne, en solo ou en plein écran ne change aucun gain.

Chaîne cible d’une voix locale :

```text
Micro → gain d’entrée → pitch/FX → compresseur → reverb
      → limiteur → master → monitoring casque local
                         └→ unique piste audio traitée publiée au SFU
```

Lorsque la piste traitée est active, le micro brut ne doit pas être publié simultanément. En cas de crash du moteur, le client demande explicitement **Reconnecter** ou **Continuer sans effets** avant de republier le micro brut.

Une valeur `audioPlane: room_ready` ne suffit jamais à couper la capture Web. Le healthcheck natif doit aussi fournir une preuve `roomPublication` complète (Room, piste, mécanisme et instant de publication). Dans cette version, seule une publication `native_webrtc` correspondant exactement à la Room courante autorise le retrait du micro brut. Un futur `pcm_bridge` devra remettre un vrai `MediaStreamTrack` au navigateur avant toute bascule.

Les faders Host/Guest/Musique/Master exigent quatre effets distincts : valeur UI, valeur persistée, commande du média-plane et état reçu par les viewers. Une valeur Supabase seule ne coupe pas physiquement une piste RTC.

## Realtime

La table PROGRAM est publiée dans Supabase Realtime. Le client n'autorise aucune commande PROGRAM avant `SUBSCRIBED` et hydratation d'un `SELECT` exécuté après cet abonnement ; les échecs transitoires de cette lecture suivent trois reprises bornées avant passage en indisponible. Une révision attendue est capturée avec chaque intention afin qu'un événement concurrent provoque un conflit au lieu d'un écrasement. Les changements de montée/descente de scène provoquent aussi un événement participant et entraînent un rechargement de la projection publique.

Les changements publics micro/caméra projetés par le RPC peuvent attendre un autre événement visible tant qu’il n’existe pas de relation publique dédiée ou que le SFU ne fournit pas directement l’état de piste. La production doit choisir une seule source de vérité : événements de publication SFU recommandés, ou projection publique matérialisée avec outbox Realtime.

## Enregistrement, replay et TV

Une fin de Room doit créer un job idempotent, pas publier automatiquement un replay. Le backend attendu enregistre :

- pistes ISO autorisées ;
- audio master ;
- journal horodaté `primary_changed`, `layout_changed`, `source_changed`, `participant_joined`, `participant_left` ;
- consentements individuels ;
- droits distincts La Scène, replay, extraits et MeeWav TV.

Le Studio La Scène reçoit ensuite un brouillon de replay : couper début/fin, miniature, titre, chapitres, crédits et droits. MeeWav TV consomme uniquement le PROGRAM officiel, jamais une vue personnelle.

## Déploiement requis

1. Appliquer les migrations Rooms dans l’ordre, notamment la projection publique, PROGRAM et l’état caméra propre, puis régénérer les types Supabase.
2. Déployer les Edge Functions de pairing du MeeWav Audio Engine et configurer leurs secrets serveur.
3. Choisir/déployer le SFU et un endpoint de jetons vérifiant le rôle réel de la Room.
4. Publier les caméras, micros traités et partages d’écran ; mapper publication, source, ratio et participant.
5. Brancher mute/gain, sélection de couches et keyframes au transport réel.
6. Ajouter l’outbox de présence média ou utiliser les événements SFU comme source d’état public.
7. Ajouter recorder ISO, journal PROGRAM, job de replay et vérification des droits TV.
8. Valider Antares/Voloco sur des installations licenciées ; ne jamais redistribuer un plugin sans accord vendor.

Tant que les étapes 3 à 7 ne sont pas déployées, l’interface de régie et son plan de contrôle sont utilisables, mais le multicam distant, l'audio distant Host/Guest, l'application des intentions simulcast/SVC, le mix public, les Twists publics, le partage d’écran public et le replay dirigé ne doivent pas être annoncés comme terminés.
