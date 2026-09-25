# La Place iOS — contexte produit et technique complet

> Source de vérité destinée aux développeurs, designers et agents qui doivent comprendre, maintenir ou transposer **La Place** sans avoir à redécouvrir le dépôt iOS.

## Référence de l'audit

| Élément | Valeur |
|---|---|
| Dépôt canonique audité | `sipiyou39/Meewav` |
| Branche | `main` |
| Commit iOS de référence | `f0fac284d872d27c2225a84cc5a4da41439c7286` |
| Date de consolidation | 8 août 2026 |
| Périmètre | Lobby Rooms, création d'une Room, La Place Host, Viewer, Invité, Green House, Scène, Coulisses, chat, outils, mixeur, effets, audio, BytePlus et Supabase |
| Spécifications autoritaires | `PLACE_BACKEND_AND_WORKFLOW_SPEC.md`, `PLACE_MIXER_SPEC.md`, `PLACE_VOCAL_EFFECTS_SPEC.md` |

Ce document décrit **ce qui existe réellement dans le code iOS**, les règles produit verrouillées et les éléments encore simulés. En cas de divergence :

1. les règles de workflow et d'autorité décrites dans les trois spécifications ci-dessus priment ;
2. Supabase est la source de vérité métier ;
3. BytePlus est la source de vérité du transport média ;
4. l'interface locale ne doit jamais inventer un état serveur réussi.

---

## 1. La Place en une phrase

**La Place est la Room sociale ouverte de MeeWav : un Host anime un live, les Viewers regardent et participent, et certains Viewers peuvent devenir Guests uniquement après invitation, préparation privée, validation et décision explicite du Host.**

Le modèle mental est celui d'un plateau avec une régie :

```text
Lobby Rooms
   ├─ Créer une Room → Studio de composition → Vérifications → Direct
   └─ Ouvrir une Room → Viewer ou Host selon la propriété

Viewer
   → File d'attente
   → Invitation du Host
   → Green House privée
   → Prêt
   → Coulisses
   → Scène publique

Host
   → anime le live
   → produit le mix public
   → contrôle les invitations, les coulisses et la scène
   → reste l'autorité finale de modération et de diffusion
```

La limite publique est **1 Host + 3 Guests maximum**. Le Host ne compte pas dans les trois places Guests.

---

## 2. Position dans le pilier Rooms

Le Lobby iOS connaît six formats de Room :

| Format | Intention | État dans le périmètre audité |
|---|---|---|
| **La Place** | Libre, conversation, partage, improvisation | Contrat V1 complet et implémentation la plus avancée |
| La Cage | Duel, battle, vote | Présente dans le catalogue et la création, logique spécifique à poursuivre |
| La Wave | Création musicale collaborative | Présente dans le catalogue et la création, logique spécifique à poursuivre |
| La Scène | Show, concert, première | Présente dans le catalogue et la création, ne pas confondre avec le pilier vidéo web du même nom |
| La Loge | Moment privé/premium avec des invités | Présente dans le catalogue et la création, logique spécifique à poursuivre |
| La Classe | Cours, méthode, atelier | Présente dans le catalogue et la création, logique spécifique à poursuivre |

La Place sert de fondation : vidéo, chat, invitations, régie, transport RTC, modération et états participants pourront être spécialisés pour les autres formats.

---

## 3. Architecture générale

La Place est découpée en trois plans complémentaires.

### 3.1 Plan produit et interface

SwiftUI orchestre :

- le Lobby ;
- le Studio de création ;
- la vue Host ;
- la vue Viewer ;
- la Green House ;
- le chat, les overlays et les outils ;
- les surfaces du mixeur ;
- le contrôle de la chaîne vocale et des plugins.

Les deux ViewModels centraux sont :

- `PlaceHostViewModel` : régie, participants, invités, mix public, outils, messages, sondages, dashboard et session média ;
- `PlaceViewerViewModel` : lecture publique, engagement, file, invitation, Green House, rôle Guest, mix personnel et session média.

### 3.2 Plan de contrôle : Supabase

Supabase conserve les états durables et autoritaires :

- Room ;
- participants ;
- messages ;
- modération ;
- file d'attente ;
- invitations ;
- état du mixeur ;
- sondages et votes ;
- réactions, Likes et Golden Likes.

Les transitions sensibles passent par des RPC/RLS. Un contrôle d'accès visible dans l'UI ne remplace jamais le contrôle serveur.

### 3.3 Plan média : BytePlus

BytePlus transporte :

- la vidéo Host ;
- la vidéo et l'audio des Guests autorisés ;
- l'audio public final ;
- la production importée lorsqu'elle est injectée dans le bus de performance.

Une Room utilise **un canal BytePlus unique**. Les états `ready`, `backstage` et `onstage` sont des états métier et de routage ; ils ne nécessitent pas de reconnecter le Guest à chaque transition.

### 3.4 Chaîne de responsabilité

```text
Interface SwiftUI
   ↓ intentions utilisateur
Host/Viewer ViewModel
   ├─ RoomsRepository → Supabase / RPC / Realtime
   └─ PlaceBytePlusSession → RTC BytePlus
          └─ bus audio performance
               ├─ micro
               ├─ effets vocaux
               └─ production importée
```

---

## 4. Navigation et cycle d'ouverture

`RoomsRootView` n'utilise pas une `NavigationStack` classique pour les Rooms live. Il conserve le Lobby et la destination dans une même racine, avec une transition horizontale contrôlée et une surface compositée. Le but est d'éviter que les animations internes de la Room, le clavier et les safe areas déstabilisent l'écran pendant la navigation.

Routes internes :

- `create` ;
- `host(roomId)` ;
- `viewer(roomId)`.

À l'ouverture d'une Room :

1. le Lobby prépare la Room ;
2. la route Host ou Viewer dépend de `isOwnedByCurrentUser` ;
3. la présence est créée côté dépôt ;
4. l'activation RTC reste bloquée pendant la transition ;
5. si l'entrée serveur échoue, l'écran revient proprement au Lobby.

À la fermeture :

1. la navigation revient au Lobby ;
2. la session média est arrêtée ;
3. la présence est quittée ;
4. la Room active locale est libérée.

---

## 5. Rôles et autorité

| Capacité | Host | Viewer | Guest |
|---|:---:|:---:|:---:|
| Regarder la Scène | Oui | Oui | Oui |
| Publier le flux principal | Oui | Non | Selon état |
| Envoyer des messages | Oui | Oui | Oui |
| Liker / Golden Like | Non comme Viewer actif | Oui | Selon rôle actif et contrat serveur |
| Rejoindre la file | Non | Si ouverte | Non pendant une invitation active |
| Inviter depuis la file | Oui | Non | Non |
| Valider caméra/micro en Green House | Non | Après acceptation | Oui |
| Déplacer Invitations → Coulisses → Scène | Oui | Non | Non |
| Contrôler le mix public | Oui | Non | Son propre signal uniquement |
| Forcer le mute d'un Guest | Oui | Non | Non |
| Régler ses effets vocaux | Oui | Non | Oui |
| Importer une production | Oui | Non | Oui après accès Guest |
| Créer/arrêter un sondage | Oui | Non | Non |
| Voter | Non nécessaire | Oui | Oui côté audience |
| Épingler un message/contenu | Oui | Non | Non |
| Bannir / exclure / slow mode | Oui | Non | Non |
| Terminer la Room | Oui | Non | Non |

Règle centrale : **le Host est le producteur du signal public ; le Guest est propriétaire de sa préparation et de son traitement personnel ; le Viewer ordinaire n'a jamais accès au mixeur.**

---

## 6. Parcours Invité complet

### 6.1 États autoritaires

Les statuts canoniques d'une invitation sont :

```text
pending
accepted
ready
backstage
onstage
cancelled
declined
ended
kicked
```

Il n'existe pas d'état serveur `greenhouse`. La Green House correspond à l'état `accepted`, pendant lequel le Viewer prépare sa caméra, son micro et sa régie.

### 6.2 Machine d'états

```text
Viewer
  │
  ├─ rejoint la file si queue_open = true
  │     └─ aperçu vidéo optionnel ≤ 30 s
  │
  └─ Host invite
        ↓
      pending
        ├─ Host annule → cancelled
        ├─ Viewer refuse → declined
        └─ Viewer accepte → accepted / Green House
                                 │ caméra + micro + RTC prêts
                                 ↓
                               ready
                                 ↓ Host
                             backstage
                                 ↓ Host + place disponible
                              onstage
                                 ↓ Host
                             backstage

Toute étape active peut finir par ended ou kicked selon la cause.
```

### 6.3 File d'attente

- Une nouvelle Room commence avec `queue_open = false`.
- La file est administrée depuis la sheet Host **Ajouter un invité**.
- Fermer la file empêche de nouvelles entrées mais conserve celles déjà présentes.
- L'aperçu vidéo est facultatif, choisi avant l'invitation et figé une fois l'invitation envoyée.
- L'absence d'aperçu est un état explicite et ne bloque pas l'invitation.
- Une invitation `pending` reste dans la sheet avec un état envoyé ; elle n'apparaît pas encore dans la carte Invitations du plateau.

### 6.4 Invitation et refus

Le Viewer reçoit une sheet claire : il sera d'abord préparé et rien ne sera public avant la décision du Host.

Règles de retour :

- refus du Viewer : impossible de revenir dans la file pour cette Room en V1 ;
- annulation du Host avant acceptation : retour possible ;
- exclusion par le Host : retour impossible ;
- départ volontaire : retour possible si la file est ouverte et si aucun blocage antérieur ne l'interdit.

Ces règles doivent être exécutées par RPC/RLS, pas seulement par l'affichage.

### 6.5 Green House

`PlaceGreenHouseView` est la salle de préparation privée. Elle possède deux pages :

- **Caméra** : aperçu caméra réel, caméra on/off, micro on/off, changement avant/arrière ;
- **Régie** : canaux, gains, production, boucle, effets vocaux, preset et monitoring.

Le bouton **Je suis prêt** reste désactivé tant que caméra et micro ne sont pas actifs. La validation demande aussi que les permissions de publication et la préparation RTC soient prêtes.

Après validation :

- `accepted → ready` ;
- le Host voit l'invité dans Invitations avec son état ;
- le Guest ne devient pas public automatiquement.

### 6.6 Invitations, Coulisses et Scène côté Host

Les trois cartes Host sont toujours dans cet ordre :

1. **Invitations** ;
2. **Coulisses** ;
3. **Scène**.

Règles :

- Invitations contient `accepted` et `ready` ;
- un invité `accepted` n'est pas déplaçable ;
- un invité `ready` peut passer en Coulisses ;
- Coulisses peut contrôler caméra, micro et mouvement ;
- **Monter** est désactivé si caméra/micro ne sont pas valides ou si la Scène est pleine ;
- revenir vers Invitations conserve `ready` si le média reste valide, sinon revient à `accepted` et impose une nouvelle préparation ;
- un Guest descendu de Scène revient en Coulisses ;
- un Guest exclu disparaît des surfaces actives et ne peut pas revenir.

### 6.7 Accès au mixeur Guest

- Viewer normal, file et `pending` : Chat uniquement ;
- `accepted`, `ready`, `backstage`, `onstage` : bascule Chat/Mixeur ;
- le mixeur Guest est rendu **dans la page**, pas dans une sheet ;
- badges d'état : PRÉPARATION, COULISSES, SCÈNE ;
- le plein écran ne montre ni mixeur ni dock audio ;
- perdre le rôle Guest ramène au Chat et arrête le monitoring.

---

## 7. Surface Host

`PlaceHostRoomView` assemble :

- la vidéo Host et jusqu'à trois Guests publics ;
- le header live ;
- les statistiques et l'identité Host ;
- les contrôles caméra, micro, changement de caméra et plein écran ;
- les notifications live ;
- le chat ;
- le mixeur ;
- les outils ;
- le module invités ;
- le dashboard et l'activité du live ;
- les sheets de profil, plugins, track picker et modération.

### 7.1 Onglets Studio Host

Le modèle `PlaceStudioTab` connaît :

- Chat ;
- Mixeur ;
- Outil ;
- Invite.

Les panneaux bas ne sont pas des écrans indépendants : ils partagent la même Room et le même état média. Les feuilles modales sont coordonnées pour empêcher des empilements incohérents.

### 7.2 Contrôles vidéo Host

Les contrôles sont des cercles sombres compacts :

- inverser la caméra ;
- activer/désactiver la caméra ;
- activer/désactiver le micro ;
- plein écran.

Ils restent visibles environ trois secondes après interaction. Le plein écran conserve média, identité, chat et actions sociales, mais retire les surfaces de régie.

### 7.3 Dashboard Host

Le dashboard expose :

- durée du live ;
- pic de spectateurs ;
- moyenne de spectateurs ;
- Likes ;
- Golden Likes ;
- dons ;
- abonnements/followers ;
- volume de chat ;
- activité récente.

L'écran Activité centralise sondages terminés, dons, nouveaux abonnements, followers et Golden Likes. Certaines valeurs présentes dans les fixtures/ViewModels sont encore des données de démonstration ; elles ne doivent pas être présentées comme des métriques serveur tant que le backend dédié n'est pas branché.

---

## 8. Surface Viewer

`PlaceViewerRoomView` assemble :

- le flux Host et les Guests `onstage` ;
- le contrôle volume/mute distant ;
- la sélection de caméra quand plusieurs slots publics existent ;
- le plein écran et le mode mono plein écran ;
- l'identité Host et le suivi ;
- les Likes et Golden Likes ;
- le chapeau de don ;
- le chat, les messages épinglés et les sondages ;
- la file, l'invitation, la Green House puis le mixeur Guest ;
- les notifications et overlays d'arrivée sur Scène.

La surface de participation change selon l'état autoritaire, pas selon une animation locale.

---

## 9. Vidéo et composition

### 9.1 Slots caméra

`PlaceCameraSlot` décrit :

- le participant ;
- la piste vidéo ;
- Host ou Guest ;
- paysage/portrait ;
- micro coupé ;
- vidéo coupée ;
- partage d'écran ;
- prise de parole active.

La composition publique est automatique. Le Viewer ne choisit pas manuellement une grille de réalisation.

### 9.2 Formats

Le modèle Room supporte 16:9 et 9:16, mais la politique live mobile reste actuellement **portrait-only** tant que la composition créée dans le Studio n'est pas connectée à une composition runtime autoritaire.

### 9.3 Règles de diffusion

- Host : toujours source publique principale ;
- Guest `ready`/`backstage` : peut publier techniquement pour la régie Host sans être distribué au public ;
- Guest `onstage` : distribué à tous ;
- Viewer : reçoit le Host et uniquement les Guests sur Scène.

---

## 10. Chat, épinglage et modération

### 10.1 Chat

Composants principaux :

- `PlaceChatView` : panneau complet ;
- `PlaceFloatingChatOverlay` : aperçu au-dessus du média ;
- `PlaceCommandBar` : saisie et envoi ;
- `PlaceChatMessageRow` : rendu utilisateur/message ;
- `PlaceMessageActionSheet` : actions Host/modération.

Les saisies importantes utilisent un présentateur flottant pour éviter que le clavier recompose tout l'écran live.

### 10.2 Épinglage

Le Host peut :

- épingler un message du chat ;
- créer un message mis en avant ;
- choisir 30 secondes, 1 minute, 5 minutes, 15 minutes ou jusqu'au retrait ;
- retirer l'élément épinglé.

`PlacePinnedItemView` affiche l'élément sur les surfaces Host et Viewer.

### 10.3 Modération

Le dépôt expose :

- supprimer un message ;
- bannir un utilisateur ;
- exclure un utilisateur ;
- appliquer un slow mode avec délai et durée ;
- lire l'état de modération courant.

La différence bannissement/exclusion doit rester claire : l'exclusion retire de la Room ; le bannissement porte une interdiction durable selon la politique serveur.

---

## 11. Engagement social

### 11.1 Like de Room

- un Like de Room par Viewer et par Room ;
- contrainte unique côté base ;
- seuls les Viewers actifs autorisés passent par `rooms_like_v1` ;
- l'état renvoyé par le serveur remplace l'état local optimiste.

### 11.2 Golden Like

- confirmation explicite via `PlaceGoldenLikeConfirmationSheet` ;
- consommation limitée à un Golden Like sur une fenêtre de 24 heures ;
- verrou transactionnel PostgreSQL par donneur pour empêcher deux appareils de consommer la même allocation ;
- `goldenLikeAvailableAt` vient du serveur ;
- la disponibilité ne doit pas être calculée uniquement dans le client.

### 11.3 Chapeau et dons

La couche iOS contient :

- `PlaceDonationHatControl` : point d'entrée sur le live ;
- `PlaceDonationView` : sheet du chapeau ;
- don unique ;
- mode **lancer** avec budget divisé en plusieurs pièces ;
- choix de montants et montant libre ;
- affichage du solde ;
- `PlaceDonationCoinFlightOverlay` : trajectoire de pièce ;
- `PlaceHatRealityModel` et `PlaceHatRealityView` : impact/animation du chapeau ;
- célébrations et notifications côté Host.

Le flux de don est actuellement riche côté interface et simulation, mais aucun contrat de paiement n'existe dans `RoomsRepository`. Il doit donc être considéré **non câblé financièrement** tant qu'un service transactionnel autoritaire n'est pas ajouté.

---

## 12. Sondages et outils Host

### 12.1 Sondages

Le Host peut :

- rédiger une question ;
- choisir un format choix multiple ou notation ;
- configurer les choix ;
- sélectionner 30, 60 ou 120 secondes ;
- lancer et arrêter le sondage ;
- consulter le dernier résultat.

Le Viewer :

- reçoit un overlay ;
- vote une seule fois selon le contrat serveur ;
- voit une confirmation locale ;
- peut fermer son overlay sans fermer le sondage global ;
- reçoit les résultats finaux.

### 12.2 Mise en avant

Le module Outils sait choisir :

- un message existant du chat ;
- un message personnalisé ;
- une expiration.

### 12.3 Module invités

`PlaceGuestPanelView` et `PlaceInviteSheet` présentent :

- Scène ;
- Coulisses ;
- Invitations ;
- file d'attente ;
- sélection simple ou multiple ;
- aperçu candidat ;
- invitation, annulation, déplacement, caméra, micro et exclusion.

### 12.4 Éléments préparés mais non complets

Le carrousel Outils contient une surface de partage d'écran. L'audio du partage d'écran est explicitement hors périmètre V1. Une présence UI ne doit pas être interprétée comme un transport média complet.

---

## 13. Mixeur : philosophie et responsabilités

`PlaceMixerView` est la surface principale de régie. Le mixeur est une régie réelle, pas une animation décorative.

### 13.1 Autorité

| Signal | Host | Guest | Viewer |
|---|---|---|---|
| Mix public final | Contrôle | Non | Non |
| Bus Guest combiné | Gain/mute public | Produit son bus | Écoute |
| Micro personnel | Contrôle le sien | Contrôle le sien | Aucun |
| Mute forcé | Peut l'imposer | Ne peut pas le lever | Aucun |
| Production importée personnelle | Contrôle la sienne | Contrôle la sienne | Aucun |
| Effets vocaux Guest | Ne voit ni ne règle en V1 | Contrôle | Invisible |
| Soundboard | Oui | Non en V1 | Non |

Le Host voit **un bus combiné par Guest** : voix traitée + production. Il n'obtient pas deux faders publics indépendants par Guest en V1.

### 13.2 Mute personnel et mute forcé

Deux états distincts existent :

- `selfMicMuted` : choix du Guest ;
- `hostMicForcedMuted` : décision du Host.

Le mute forcé a priorité. Quand le Host le retire, l'état personnel précédent du Guest est restauré. Un mute sur Scène ne rend pas automatiquement la Green House invalide.

### 13.3 Interaction réseau

- les contrôles réagissent immédiatement en local ;
- les mutations de gain sont throttled pendant le glissement ;
- un mute critique part immédiatement ;
- Supabase reconverge ensuite l'état ;
- Realtime propage les changements aux autres clients.

### 13.4 Pages du mixeur

Le mixeur a deux pages horizontales :

1. **Traitement** : faders, production importée, deck, presets et effets ;
2. **Live** : outils propres au format ; pour La Place V1, le soundboard.

La navigation utilise swipe, tap et points de page centrés. Il n'y a pas d'onglets texte permanents occupant la surface.

### 13.5 Canaux

`PlaceMixerChannel` décrit :

- identifiant ;
- nom et icône ;
- gain ;
- niveau ;
- mute ;
- type micro ou audio ;
- participant ;
- autorité du mute ;
- état de la production ;
- titre de piste.

`PlaceMixerGuestState` ajoute les gains locaux/publics, la caméra, l'état de preview, de lecture et les métadonnées de la piste.

### 13.6 Mesures

- un vrai buffer PCM permet RMS et true peak en dBFS ;
- un niveau BytePlus normalisé ne doit pas être présenté comme un faux dBFS ;
- les meters sont alimentés par les callbacks audio réels ;
- clipping et silence sont distingués.

---

## 14. Import de production et deck audio

### 14.1 Formats et import

`PlaceAudioImportService` accepte :

- MP3 ;
- M4A ;
- WAV.

Le fichier sélectionné est copié dans le stockage temporaire de l'application, sa durée est lue et un `PlaceTrack` est construit.

### 14.2 Deck

`PlaceMixerDeckPlayer` fournit :

- import/changement de piste ;
- lecture/pause ;
- seek ;
- progression ;
- forme d'onde réelle ;
- boucle avec poignées ;
- titre, artiste, durée ;
- BPM et tonalité si disponibles.

Sans piste, l'interface montre honnêtement **Importer une chanson**. Elle n'affiche jamais une fausse waveform.

### 14.3 Analyse

`PlaceProductionAnalysisService` :

- décode le PCM via `AVAudioFile` ;
- calcule une waveform min/max/RMS ;
- envoie un buffer stéréo au `PlaceSuperpoweredTrackAnalyzer` ;
- estime BPM et tonalité ;
- rend l'analyse annulable lors d'un remplacement de piste.

Règles de fiabilité :

- moins de 8 secondes : analyse indéterminée ;
- silence sous le seuil : indéterminé ;
- BPM hors 60–200 : indéterminé ;
- BPM/tonalité estimés sont présentés avec `≈` ;
- une valeur indisponible ne devient jamais `0 BPM` ;
- l'analyse ne modifie jamais AutoTune, plugins, gain, monitoring ou RTC.

### 14.4 Boucle

`PlaceAudioLoopRange` garantit :

- une boucle d'au moins 1 seconde ;
- au moins 2 % de la piste ;
- des seeks bornés ;
- une timeline déterministe ;
- un reconciler empêchant les seeks répétés avant confirmation du précédent.

---

## 15. Chaîne audio complète

### 15.1 Chaîne logique d'un performer

```text
Micro mono
   ↓
Simple AutoTune ou chaîne AUv3
   ↓
EQ / Compression / Reverb selon le mode
   ↓
Bus voix
                         Production importée
                                  ↓
                    ┌──────── mix performer ────────┐
                    ↓                               ↓
             monitoring local                bus public final
                                                    ↓
                                           BytePlus external audio
```

La production est ajoutée **après** la chaîne vocale. Les effets vocaux ne doivent jamais traiter la production importée.

### 15.2 Bus de performance

`PlacePerformanceAudioBus` est un ring buffer temps réel :

- 48 kHz ;
- stéréo ;
- compatible trames RTC ;
- conversion Float32 → PCM16 ;
- pré-roll ;
- détection underflow/overflow ;
- rejet de latence excessive ;
- comptage des échantillons clippés ;
- absence d'allocation dans le chemin critique.

Le limiteur garde environ `-1 dB` de headroom après traitement.

### 15.3 Moteur de graphe

`PlaceAUv3VocalPluginHost` possède :

- `AVAudioEngine` ;
- mixeur d'entrée ;
- mixeur vocal ;
- mixeur production ;
- mixeur final ;
- monitoring vocal/local ;
- limiteurs ;
- lecteur de production ;
- unités AUv3 ;
- sauvegarde/restauration des états ;
- génération de configuration pour ignorer les réponses obsolètes ;
- fallback propre si un plugin échoue.

### 15.4 Transport externe et fallback

Le flux final peut alimenter `PlaceBytePlusExternalAudioPublisher`. Si le bus externe devient indisponible ou se bloque :

1. le système détecte la dégradation ;
2. il tente une récupération bornée ;
3. il peut revenir au chemin de capture interne BytePlus ;
4. le live ne doit pas être interrompu simplement parce qu'un effet ou plugin échoue ;
5. l'interface doit signaler le fallback au lieu de prétendre que le traitement est toujours actif.

---

## 16. Effets vocaux — mode Simple

### 16.1 Presets

| Preset | Résumé | Modules activés |
|---|---|---|
| Clean | Naturel | Aucun insert vocal |
| Warm | Rond | EQ + Comp + Reverb |
| Rap | Devant | EQ + Comp |
| Trap | Hard tune | Tune + EQ + Comp + Reverb |
| Radio | Broadcast | EQ + Comp |

### 16.2 Modules visibles

- Tune ;
- Reverb ;
- EQ ;
- Comp.

Delay et Limiter existent comme types techniques mais sont volontairement masqués en V1 pour préserver la clarté.

Chaque carte effet possède deux zones :

- zone principale : activer/désactiver ;
- zone réglages : ouvrir la sheet détaillée.

Les paramètres génériques disponibles sont intensité, ton, espace et présence. Tune ajoute tonalité, gamme, registre, vitesse, clamp, fréquence de référence et retune.

### 16.3 AutoTune Simple

L'AutoTune Simple est une Audio Unit interne MeeWav construite autour de `Superpowered::AutomaticVocalPitchCorrection` :

- aucune dépendance Voloco ;
- clé et gamme configurent directement le processeur ;
- intensité fixée à 98 % ;
- vitesse EXTREME dans la configuration simple actuelle ;
- traitement mono ;
- callback sans lock, allocation ni logique UI.

### 16.4 Reverb Simple

- valeur initiale : 18 % ;
- knob vertical relatif ;
- valeur bornée ;
- précision 1 % ;
- styles Soft et Full.

### 16.5 Monitoring et diagnostics

Le monitoring propose :

- Auto / route iOS ;
- iPhone ;
- écouteurs/casque ;
- volume de retour ;
- état actif/inactif ;
- diagnostic de latence.

`PlaceLocalVocalDawEngine` mesure notamment temps de rendu, temps DSP, charge callback, erreurs et surcharges.

---

## 17. Effets vocaux — mode Pro / AUv3

Le mode Pro scanne les plugins AUv3 installés, sait reconnaître plusieurs familles et permet :

- ajouter un plugin ;
- utiliser plusieurs instances du même plugin ;
- activer/bypasser chaque insert ;
- retirer un insert ;
- ouvrir l'interface native du plugin ;
- conserver l'état complet de chaque instance.

Familles détectées :

- isolation vocale ;
- Apple Dynamics ;
- Apple EQ ;
- Apple Limiter ;
- Apple Delay ;
- Apple HighPass ;
- Apple Reverb ;
- Vocal Tune Pro ;
- Antares ;
- Voloco si installé ;
- RoughRider ;
- Rack Reverb ;
- plugins inconnus compatibles.

Règles absolues :

- chaque insert possède un UUID stable ;
- l'état complet appartient à l'instance, pas seulement au type de plugin ;
- modifier une instance ne modifie pas les autres ;
- l'interface native AUv3 est la source de vérité visuelle ;
- l'ajout de plugin remplace seulement la zone FX concernée ;
- un plugin déjà chargé s'édite dans une sheet ;
- tout paramètre écrit doit être relu et validé ;
- l'échec d'un plugin revient vers une chaîne Clean sans couper le live.

Risque connu : la licence fournisseur Superpowered doit être régularisée avant une mise en production publique.

---

## 18. Soundboard et page Live

La page Live du mixeur La Place contient le soundboard Host :

- pads sonores ;
- déclenchement immédiat ;
- volume global ;
- rendu dans le bus AUDIO HOST.

Chaîne :

```text
source locale / soundboard
   ↓
volume source
   ↓
fader AUDIO HOST
   ↓
live public
```

Un fader à zéro ou un mute coupe toutes les sources du bus Host. Le Guest n'a pas de soundboard V1.

---

## 19. BytePlus : rôles, publication et abonnements

### 19.1 Rôle local

`PlaceBytePlusSession` maintient :

- room/channel ;
- identité ;
- état disconnected/connecting/connected/reconnecting/error ;
- droits de publication ;
- caméra/micro ;
- pistes locales et distantes ;
- audio meters ;
- production locale ;
- mode transport interne ou bus externe ;
- propriétaire de connexion pour éviter les mutations concurrentes.

### 19.2 Politique d'abonnement audio

| Client local | Audio Host distant | Guest ready | Guest backstage | Guest onstage |
|---|:---:|:---:|:---:|:---:|
| Host | N/A | Oui | Oui | Oui |
| Viewer | Oui | Non | Non | Oui |
| Guest | Oui | Non | Non | Oui |

Le Host doit entendre et inspecter les Guests publiants avant leur passage public. Le public ne doit jamais entendre un Guest en préparation ou en Coulisses.

`PlaceRemoteAudioSubscriptionReconciler` recalcule les abonnements lors :

- de la publication d'un stream ;
- d'un changement de rôle local ;
- d'un changement de métadonnées participant ;
- d'un retrait de stream.

Il n'envoie une commande BytePlus que si la décision cible diffère de l'abonnement effectivement appliqué.

### 19.3 Préparation sans reconnexion

- `accepted` : caméra/micro préparés localement, rien de public ;
- `ready` : publication technique préparée ;
- `backstage` : le Host reçoit le Guest ;
- `onstage` : le public reçoit le Guest ;
- les transitions modifient politiques et métadonnées, pas la session RTC entière.

### 19.4 Perte de connexion

Ne pas déclencher un timeout simplement parce que :

- la vidéo manque mais l'audio continue ;
- l'application passe en arrière-plan ;
- la caméra est volontairement coupée.

Un timeout unique de 60 secondes ne s'applique que si BytePlus est déconnecté ou si audio **et** vidéo disparaissent assez longtemps. Il est annulé dès le retour.

Il n'y a pas d'auto-kick. Dégradation métier :

```text
onstage  → backstage
backstage → ready ou accepted
ready → accepted
```

---

## 20. Contrat backend Supabase

### 20.1 Tables principales

| Table | Responsabilité |
|---|---|
| `rooms_v2` | Room, Host, état, canal média, file ouverte, format |
| `room_participants_v2` | Présences et rôles |
| `room_queue_v2` | File d'attente et aperçu optionnel |
| `room_invitations_v2` | Cycle invité autoritaire |
| `room_mixer_state_v2` | Gains, mute, caméra, production et playback |
| `room_messages_v2` | Chat |
| `room_polls_v2` | Sondages |
| `room_poll_votes_v2` | Votes |
| `room_reactions_v2` | Likes et Golden Likes agrégés |
| `daily_golden_likes` | Consommation globale et cooldown Golden Like |

### 20.2 Contrat `RoomsRepository`

Le protocole iOS expose les groupes d'opérations suivants :

- Room : charger, détailler, créer, rejoindre, quitter, terminer ;
- participants ;
- messages et modération ;
- épinglage ;
- sondages et votes ;
- invitations et transitions ;
- file d'attente ;
- mixeur Host et personnel ;
- stream Realtime du mixeur ;
- engagement Like/Golden Like.

`SupabaseRoomsRepository` implémente ce contrat avec tables, RPC, mapping de profils et canaux Realtime.

### 20.3 Realtime

La convergence attendue concerne :

- Room ;
- file ;
- invitations ;
- messages ;
- sondages ;
- mixeur ;
- réactions.

Une boucle de refresh existe encore comme filet de sécurité. Elle ne doit pas devenir la stratégie principale lorsque Realtime est disponible.

### 20.4 Sécurité

- client authentifié obligatoire pour les mutations ;
- transitions invité validées côté serveur ;
- privilèges RPC durcis ;
- cooldown Golden Like sérialisé transactionnellement ;
- gains bornés côté dépôt/serveur ;
- le frontend ne décide jamais seul d'un rôle ou d'une autorisation de scène.

---

## 21. Création d'une Room

### 21.1 Étapes

`CreateRoomView` orchestre trois étapes :

1. **Configuration — Nouvelle Room** : choix du format, titre, public/privé ;
2. **Studio — Composer les vues** : composition 9:16 et 16:9 ;
3. **Aperçu — Avant le direct** : vérifications et validation.

### 21.2 Deux compositions

- Mobile plein écran : 9:16 ;
- Lobby & paysage : 16:9.

Une action permet de copier/adopter une composition entre formats, sans modifier silencieusement le ratio source de la caméra.

### 21.3 Couches du Studio

Le canvas connaît :

- fond ;
- caméra ;
- texte ;
- image ;
- logo ;
- forme ;
- cadre.

Chaque couche peut posséder :

- position normalisée ;
- taille ;
- opacité ;
- visibilité ;
- verrouillage ;
- z-index ;
- mode Ajuster/Remplir ;
- ratio ou cadre libre ;
- crop, zoom et point focal ;
- texte/symbole ;
- caméra avant/arrière.

Le Studio supporte :

- ajouter ;
- dupliquer ;
- supprimer ;
- réordonner ;
- avancer/reculer ;
- undo/redo ;
- édition continue ;
- variantes de layouts ;
- inspecteur de couches ;
- crop editor ;
- aperçu appareil.

### 21.4 Presets de composition

- Portrait entier ;
- Solo + partage ;
- Caméra + contenu ;
- Caméra en coin ;
- Duo ;
- Interview ;
- Présentation ;
- Focus caméra.

Les presets ont des variantes Inverser/Changer de coin selon leur type.

### 21.5 Préflight

Le préflight vérifie connexion et microphone et expose les états idle, running, ready, warning et failed.

Limite actuelle importante : `CreateRoomPreflightViewModel` utilise encore une séquence simulée de niveaux micro. Cette partie ne doit pas être annoncée comme diagnostic réseau/audio de production tant que les vraies mesures ne la remplacent pas.

---

## 22. Modèles métier majeurs

### Room et profils

- `PlaceRoomStatus` : live, scheduled, ended ;
- `PlaceRoomRole` : host, guest, viewer ;
- `PlaceVideoFormat` : landscape, portrait ;
- `PlaceRoom` : identité, Host, canal, compteurs, engagement, file, format, slow mode, heure de début ;
- `PlaceProfile` : nom, handle, avatar, rôle, étoiles et grade.

### Participation

- `PlaceQueueEntry` ;
- `PlaceInvitation` ;
- `PlaceInvitationStatus` ;
- `PlaceModerationState` ;
- `PlaceViewerRemovalNotice`.

### Interaction live

- `PlaceMessage` ;
- `PlacePinnedItem` et expiration ;
- `PlacePoll` ;
- `PlaceReaction` ;
- `PlaceDonation` ;
- `PlaceLiveNotification` ;
- `PlaceDashboardActivity` ;
- `PlaceLiveStats`.

### Audio et régie

- `PlaceMixerChannel` ;
- `PlaceMixerGuestState` ;
- `PlaceMixerMuteAuthority` ;
- `PlaceMixerAudioPlaybackState` ;
- `PlaceTrack` ;
- `PlaceAudioLoopRange` ;
- `PlaceProductionAnalysis` ;
- `PlaceVocalEffectsState` ;
- `PlaceVocalMonitoringState` ;
- `PlaceVocalPluginSlot` ;
- `PlacePerformanceAudioGraphResult`.

### Vidéo

- `PlaceCameraSlot` ;
- `PlaceBytePlusVideoTrack` ;
- `PlaceBytePlusSessionState`.

---

## 23. Ce qui est réellement branché, partiel ou simulé

| Domaine | État iOS constaté | Lecture correcte |
|---|---|---|
| Rooms, participants, présence | Branché Supabase | Source serveur |
| Chat | Branché Supabase/RPC, avec simulateur optionnel | Réel hors mode simulation |
| Invitations/file/transitions | Branché RPC | Autoritaire serveur |
| Mixer state | Branché Supabase + Realtime | Contrôle réel |
| BytePlus audio/vidéo | Implémentation réelle | Nécessite credentials/token et tests appareils |
| Likes/Golden Likes | Branché RPC | Cooldown réel côté serveur |
| Sondages/pins/modération | Branché repository | Réel si migrations déployées |
| Import piste/waveform/BPM/tonalité | Implémentation locale réelle | Analyse indicative pour BPM/clé |
| AutoTune Simple/Reverb/AUv3 | Implémentation native réelle | Validation d'écoute sur iPhone obligatoire |
| Soundboard | Surface et logique locale | Vérifier assets/routage final selon build |
| Dons/chapeau | UX, animation, fixtures | Paiement non branché dans `RoomsRepository` |
| Dashboard analytics | Mélange d'état calculé et fixtures | Ne pas vendre comme analytics backend complet |
| Preflight micro/réseau | Prototype partiellement simulé | À remplacer avant production |
| Profil Host détaillé | Sheet présente | Bio/stats détaillées signalées comme à venir |
| Partage d'écran audio | Préparé visuellement | Hors V1 |
| Autres formats de Room | Catalogue/création présents | Mécaniques dédiées incomplètes |

---

## 24. Règles de design iOS à préserver

Identité :

- fond principal `#0A0A1A` ;
- fond sombre `#0A0E14` ;
- violet principal `#7E44E3` ;
- accents cyan, ambre, vert, rouge, rose et or avec parcimonie ;
- fond acoustique `PlaceBackground`/`RoomsBackground` ;
- surfaces sombres harmonisées ;
- bordures communes blanches autour de 8–10 % d'opacité ;
- pas de glow/color border systématique ;
- radius compact autour de 12 pt ;
- contrôles accessibles, tactiles et non tronqués.

Principes :

- la vidéo reste la surface dominante ;
- le mixeur peut être dense mais doit rester lisible ;
- les sheets ont une hauteur bornée et scrollent intérieurement ;
- les notifications Viewer restent sous l'identité et au-dessus du Chat ;
- aucune notification ne doit masquer les contrôles live ;
- les animations respectent `Reduce Motion` ;
- le plein écran élimine la régie, pas les interactions essentielles.

---

## 25. Correspondance iOS → web

Le web doit conserver les **contrats**, pas copier pixel par pixel l'iPhone.

| iOS | Adaptation web recommandée |
|---|---|
| Panneaux bas et carrousels compacts | Colonnes/panneaux desktop persistants et redimensionnables |
| Chat/Mixeur toggle Guest | Onglets dans le rail Guest, même autorité |
| Scène portrait | Plateau desktop 16:9, sans casser la limite Host + 3 |
| Sheets Host | Drawers/popovers contextuels |
| Touch/drag | Pointer, clavier, raccourcis et sliders accessibles |
| AUv3/Superpowered | Adaptateur Web Audio/WASM explicite ; ne pas simuler un DSP inexistant |
| BytePlus iOS | SDK BytePlus web derrière l'adaptateur média |
| Supabase | Réutiliser tables, RPC et Realtime existants |

Invariants web :

- mêmes statuts d'invitation ;
- mêmes règles de passage ;
- même limite Scène ;
- même séparation Host/Guest/Viewer ;
- même priorité du mute forcé ;
- même routage public des Guests uniquement `onstage` ;
- mêmes règles Golden Like ;
- aucun faux effet, faux meter, faux paiement ou fausse réussite serveur.

---

## 26. Inventaire complet des fichiers iOS Rooms

### Racine et vues

| Fichier | Responsabilité |
|---|---|
| `RoomsRootView.swift` | Navigation Lobby/Create/Host/Viewer et activation différée de la session |
| `RoomsLobbyView.swift` | Accueil Rooms, recherche, catégories, création, ouverture |
| `CreateRoomView.swift` | Flux de création en trois étapes |
| `PlaceHostRoomView.swift` | Composition complète de la régie Host |
| `PlaceViewerRoomView.swift` | Composition Viewer et parcours Guest |
| `PlaceGreenHouseView.swift` | Préparation privée caméra, micro et régie |

### ViewModels

| Fichier | Responsabilité |
|---|---|
| `RoomsLobbyViewModel.swift` | Chargement, refresh, création, join/leave du Lobby |
| `CreateRoomViewModel.swift` | Canvas, couches, presets, undo/redo, formats |
| `CreateRoomPreflightViewModel.swift` | Vérifications avant direct, encore partiellement simulées |
| `PlaceHostViewModel.swift` | État Host, outils, invités, mix public, BytePlus, dashboard |
| `PlaceViewerViewModel.swift` | État Viewer/Guest, engagement, Green House, mix personnel, BytePlus |
| `PlaceVocalPluginConsole.swift` | Modes Simple/Pro, plugins, presets, monitoring et graph audio |

### Composants de création

| Fichier | Responsabilité |
|---|---|
| `CreateRoomCameraPreview.swift` | Preview caméra du Studio |
| `CreateRoomChrome.swift` | Header/navigation du flux de création |
| `CreateRoomCompositionSwitcher.swift` | Bascule 9:16/16:9 |
| `CreateRoomCropEditor.swift` | Zoom et point focal |
| `CreateRoomDevicePreview.swift` | Prévisualisation dans un appareil |
| `CreateRoomLayerInspector.swift` | Liste, ordre et propriétés des couches |
| `CreateRoomLayoutPresetPicker.swift` | Choix des presets de composition |
| `CreateRoomPreflightPanel.swift` | Interface des vérifications |
| `CreateRoomQuickTools.swift` | Actions rapides du Studio |
| `CreateRoomReviewStep.swift` | Aperçu final et validation |
| `CreateRoomSceneCanvas.swift` | Canvas éditable |
| `CreateRoomSimpleStudioControls.swift` | Contrôles simplifiés de composition |
| `CreateRoomStudioView.swift` | Workspace complet du Studio |
| `CreateRoomTypePicker.swift` | Choix du format de Room |

### Composants Lobby

| Fichier | Responsabilité |
|---|---|
| `LobbyPreviewVideoComponents.swift` | Preview vidéo et cache médias |
| `LobbyRankBadge.swift` | Badge/grade sur les cartes Rooms |
| `RoomsLobbyComponents.swift` | Rails, cartes, catégories et fond acoustique |

### Composants La Place

| Fichier | Responsabilité |
|---|---|
| `PlaceChannelStrip.swift` | Fader, meter, gain et mute d'un canal |
| `PlaceChatComponents.swift` | Chat, messages, saisie, épinglage et actions |
| `PlaceChromeComponents.swift` | Headers, stats, identité, tabs, sheets et cartes live |
| `PlaceDonationCoinFlightOverlay.swift` | Animation de pièce vers le chapeau |
| `PlaceDonationHatControl.swift` | Contrôle du chapeau |
| `PlaceFloatingTextInputPresenter.swift` | Saisie flottante compatible clavier/live |
| `PlaceGoldenLikeConfirmationSheet.swift` | Confirmation Golden Like |
| `PlaceGuestMixerComponents.swift` | Régie personnelle Guest |
| `PlaceHatRealityModel.swift` | Modèle d'état du chapeau animé |
| `PlaceHatRealityView.swift` | Rendu du chapeau et impacts |
| `PlaceHostToolComponents.swift` | Sondages, highlights, invités, track picker, carrousels |
| `PlaceMixerComponents.swift` | Mixeur principal, effets, soundboard, diagnostics |
| `PlaceMixerDeckComponents.swift` | Deck piste, waveform, seek et boucle |
| `PlaceOverlayComponents.swift` | Sondages, résultats, notifications, fullscreen, profil, dashboard, dons |
| `PlaceStudioCarousel.swift` | Carrousels de régie et cartes expansibles |
| `PlaceVideoBoundaryReader.swift` | Mesure des limites vidéo pour positionner les overlays |
| `PlaceVideoComponents.swift` | Grille, slots, contrôles, pistes BytePlus et réactions |
| `PlaceViewerParticipationComponents.swift` | File, invitation et dock de participation |
| `PlaceVocalPluginConsolePanel.swift` | UI Simple/Pro, picker AUv3 et éditeur natif |

### Design et layout

| Fichier | Responsabilité |
|---|---|
| `CreateRoomStudioTheme.swift` | Tokens visuels du Studio de création |
| `PlaceTheme.swift` | Couleurs, dimensions et assets La Place |
| `RoomsSocialTheme.swift` | Thème social partagé |
| `PlaceLayoutContext.swift` | Dimensions, safe areas et métriques adaptatives |

### Modèles

| Fichier | Responsabilité |
|---|---|
| `LobbyPreviewMedia.swift` | Médias de preview Lobby |
| `LobbyPreviewRoom.swift` | Formats et cartes du Lobby |
| `PlaceAudioLoopRange.swift` | Boucle et reconciler de seek |
| `PlaceAudioWaveform.swift` | Échantillons waveform |
| `PlaceModels.swift` | Modèles Room, profils, chat, invités, outils, mixeur, vidéo |
| `PlacePerformanceAudioGraphResult.swift` | Résolution/échec/fallback du graphe audio |
| `PlaceProductionAnalysis.swift` | BPM, clé, analyse et politiques de validité |
| `PlaceRoomEngagementState.swift` | Likes, Golden Likes et disponibilité |
| `PlaceSimpleVocalControlPolicy.swift` | Valeurs AutoTune/Reverb Simple |
| `PlaceSuperpoweredSimpleTuneConfiguration.swift` | Configuration DSP AutoTune |
| `PlaceVocalDiagnosticsModels.swift` | Diagnostics de latence et audio |
| `PlaceVocalEffectsModels.swift` | Presets, effets, Tune et monitoring |
| `PlaceVocalPluginModels.swift` | Plugins AUv3, inserts, paramètres et routage |
| `PlaceVocalPluginStateStore.swift` | Persistance d'état des instances de plugins |
| `RoomCreationDraft.swift` | Étapes, canvas, couches, snapshots |
| `RoomCreationLayoutPreset.swift` | Géométrie et presets de composition |
| `RoomCreationPreflight.swift` | États des vérifications |

### Services

| Fichier | Responsabilité |
|---|---|
| `BytePlusTokenProvider.swift` | Obtention des accès/tokens BytePlus |
| `CreateRoomCameraSession.swift` | Session caméra du Studio |
| `PlaceAUv3VocalPluginHost.swift` | Graphe AVAudioEngine, AUv3, production et monitoring |
| `PlaceAudioImportService.swift` | Import local MP3/M4A/WAV |
| `PlaceBytePlusAudioDiagnosticLabels.swift` | Libellés de diagnostics RTC |
| `PlaceBytePlusAudioDiagnostics.swift` | Collecte/analyse des diagnostics BytePlus |
| `PlaceBytePlusAudioTransportPreference.swift` | Choix transport interne/externe |
| `PlaceBytePlusExternalAudioPublisher.swift` | Injection du bus final dans BytePlus |
| `PlaceBytePlusSession.swift` | Session RTC, pistes, caméra, micro, audio et récupération |
| `PlaceBytePlusVocalEffectsAudioProcessor.swift` | Traitement vocal sur le chemin BytePlus interne |
| `PlaceLocalVocalDawEngine.swift` | Moteur local faible latence et monitoring |
| `PlaceMessageSimulator.swift` | Messages simulés opt-in pour démonstration |
| `PlacePerformanceAudioBus.swift` | Ring buffer temps réel du mix final |
| `PlacePerformanceAudioPolicy.swift` | Politique d'activation/fallback du graphe |
| `PlacePerformancePlaybackTimeline.swift` | Timeline de lecture production |
| `PlaceProductionAnalysisService.swift` | Waveform, BPM et tonalité |
| `PlaceRemoteAudioSubscriptionPolicy.swift` | Routage Host/Viewer/Guest des streams distants |
| `PlaceSuperpoweredRuntime.h/.mm` | Runtime et pont Superpowered |
| `PlaceSuperpoweredSimpleTuneAudioUnit.h/.mm` | Audio Unit AutoTune Simple |
| `PlaceSuperpoweredTrackAnalyzer.h/.mm` | Analyse BPM/clé |
| `PlaceSuperpoweredVocalDSP.h/.mm` | DSP vocal temps réel |
| `PlaceVocalEffectsEngine.swift` | Abstraction et moteur des effets vocaux |
| `RoomsRepository.swift` | Contrat backend Rooms |
| `SupabaseRoomsRepository.swift` | Implémentation Supabase/RPC/Realtime |

### Ressources

- 14 vidéos Lobby locales portrait/paysage ;
- 12 avatars Lobby dédiés ;
- assets `RoomsCreate.xcassets` et `RoomsLobby.xcassets` ;
- `THIRD_PARTY_NOTICES.md` pour les dépendances et médias tiers.

---

## 27. Invariants à ne jamais casser

1. Aucun Guest n'est public sans décision du Host.
2. La Green House reste privée.
3. `accepted` n'est pas `ready`.
4. Caméra **et** micro sont nécessaires pour être prêt.
5. Le public n'entend que le Host et les Guests `onstage`.
6. Le Host peut entendre les Guests prêts/Coulisses pour produire le live.
7. La Scène ne dépasse jamais trois Guests.
8. Le mute forcé Host a priorité sur le mute personnel.
9. Les effets vocaux ne traitent jamais la production importée.
10. Un plugin défaillant ne coupe pas le live.
11. Une estimation BPM/tonalité ne configure jamais automatiquement AutoTune.
12. Un Viewer ordinaire n'a jamais de mixeur.
13. Le plein écran n'affiche pas la régie.
14. Supabase décide des transitions métier.
15. BytePlus décide de l'état média réel.
16. Aucun faux dBFS, faux paiement ou fausse réussite réseau.
17. Les Golden Likes restent sérialisés côté serveur.
18. Le refus et l'exclusion respectent les règles de réentrée.
19. Quitter/revenir dans la même Room peut restaurer le mix Guest ; terminer la Room ne crée pas un preset pour la suivante.
20. Le web conserve ces contrats même si sa disposition est différente.

---

## 28. Validation avant production

### Fonctionnelle

- créer une Room et entrer comme Host ;
- entrer avec plusieurs vrais comptes Viewer ;
- ouvrir/fermer la file ;
- rejoindre avec et sans preview ;
- inviter, annuler, refuser et vérifier les règles de retour ;
- valider Green House avec caméra/micro réels ;
- passer Invitations → Coulisses → Scène ;
- vérifier la limite de trois Guests ;
- tester montée/descente/exclusion ;
- tester chat, pin, slow mode, sondage, Like et Golden Like ;
- tester mute personnel/forcé et restauration ;
- tester import, waveform, BPM, tonalité, loop et seek ;
- tester presets, AutoTune, Reverb et plugins AUv3 ;
- tester le fallback audio sans coupure du live.

### Multi-appareils et réseau

- minimum Host + Viewer + Guest sur plusieurs iPhone physiques ;
- Wi‑Fi ↔ 4G/5G ;
- interruption réseau ;
- application en arrière-plan ;
- caméra volontairement coupée ;
- casque branché/débranché ;
- route Bluetooth ;
- changement de caméra ;
- retour après 59/60 secondes ;
- deux appareils tentant un Golden Like simultanément.

### Audio

- écoute réelle, pas seulement assertions logicielles ;
- absence de double audio ;
- absence de voix sèche parallèle à la voix traitée ;
- synchronisation voix/production ;
- latence monitoring acceptable ;
- absence de clipping ;
- pas d'audio Guest backstage côté Viewer ;
- fallback Clean audible et non destructif.

---

## 29. Résumé opérationnel

Pour travailler sur La Place sans se tromper, retenir ceci :

```text
Supabase décide QUI peut faire QUOI.
BytePlus transporte QUI entend et voit QUI.
Le Host produit le signal public.
Le Guest prépare et contrôle son propre signal.
Le Viewer regarde, discute et peut demander à participer.
La Green House prépare.
Les Coulisses rendent le Guest disponible au Host.
La Scène le rend public.
Le mixeur agit réellement sur le signal.
Le mode Simple est MeeWav/Superpowered.
Le mode Pro utilise des AUv3 natifs.
Les dons restent une UX sans paiement branché.
Le web doit transposer ces contrats, pas seulement l'apparence.
```

Ce document doit être mis à jour dès qu'un statut, une autorité, une table, un RPC, une règle de routage média ou une chaîne audio change dans le dépôt iOS.
