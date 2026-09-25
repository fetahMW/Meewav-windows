# La Place Web — audit de correction de la régie

État consolidé le 9 août 2026 à partir de `Master_prompt_complet_correction_MeeWav_Rooms.md`.

## 1. Architecture réutilisée

La correction conserve l'architecture Rooms existante :

- `PlaceRoomExperience.tsx` compose le bandeau, la scène et le panneau contextuel ;
- `PlaceStage.tsx` porte la composition vidéo adaptative ;
- `PlaceStudioPanel.tsx` porte Chat, Outils et Invités sans démonter les surfaces inactives ;
- `PlaceMixer.tsx` porte Volumes et FX voix ;
- `usePlaceRoom.ts` orchestre l'état optimiste, les transitions et le realtime ;
- `place.service.ts` reste l'unique passerelle vers les RPC et tables Supabase ;
- `place.fixtures.ts` fournit le scénario investisseur explicite ;
- `place-room-premium.css` conserve le design system Rooms et reçoit la couche finale de correction.

Aucun second store, second mixeur ou second workflow Invités n'a été créé.

## 2. Référence iOS Outils retenue

Référence fonctionnelle :

- dépôt : `C:\Users\linkw\Desktop\LinkWave-IOS` ;
- branche : `upstream/rooms_v2/la-place-glow-up` ;
- commit : `ada85e05e00a39a259affefba534fe6277565c27` ;
- catalogue : `lib/features/rooms_v2/presentation/widgets/place/place_tools_carousel.dart` ;
- partage : `lib/features/rooms_v2/presentation/widgets/place/tools/place_tool_screen_share.dart` ;
- sondage : `lib/features/rooms_v2/presentation/widgets/place/tools/place_tool_poll.dart` ;
- mise en avant : `lib/features/rooms_v2/presentation/widgets/place/tools/place_tool_highlight.dart`.

Inventaire repris, sans outil supplémentaire :

| Ordre | Identifiant | Libellé | Paramètres Web repris |
| --- | --- | --- | --- |
| 1 | `screen_share` | Partage d'écran | Public fonctionnel, audio appareil, durée, arrêt ; individuel et groupe signalés indisponibles |
| 2 | `poll` | Sondage Rapide | Oui/Non ou Pour/Contre, 15/30/60 s, compte à rebours, résultats, arrêt et relance |
| 3 | `highlight_message` | Mettre en avant | Sélection depuis le Chat, 10/20/30 s, retrait ; rédaction libre visible comme évolution non active |

Le partage d'écran Web utilise aujourd'hui `getDisplayMedia` et une preview locale. L'interface ne prétend plus qu'il est reçu par le public : la publication RTC reste une dépendance backend/média.

## 3. Correction livrée

### Bandeau et scène

- identité compacte `La Place · Host … · badge · EN DIRECT` sans portrait dupliqué ;
- compteurs non cliquables Likes, Golden Likes et Chapeau, sans euro ;
- Réglages, qui ouvre la surface Outils canonique, et Terminer restent les seules actions de régie du bandeau ;
- composition média 1, 2, 3 ou 4 personnes ; caméra en `cover`, partage écran en `contain` ;
- un message épinglé dans le Chat n'est plus dupliqué sur la scène.

### Panneau Host

- exactement quatre onglets textuels : Chat, Mixeur, Outils, Invités ;
- quatre colonnes stables sur desktop ;
- surfaces conservées montées et masquées, afin de préserver brouillon, sélection, scroll et réglages ;
- largeur desktop `clamp(400px, 30vw, 560px)`.

### Chat

- aucun portrait ni badge dans les messages ;
- couleur de nom stable par participant ;
- message épinglé unique, messages système secondaires ;
- liste seule scrollable ;
- compositeur fixé avec brouillon, emoji et envoi.

### Mixeur

- sources publiques normalisées : Ma voix, invités réellement sur scène, une Musique commune, Master ;
- six lignes maximum ;
- faders horizontaux violets, VU vert/ambre/rouge selon le niveau ;
- Musique sans micro ni FX ; Master séparé et fixé ;
- FX voix ouverts dans le panneau, jamais au-dessus de la scène ;
- Auto-Tune, Reverb et Compression modifient seulement la chaîne personnelle autorisée ;
- mute personnel et mute public forcé sont représentés séparément : un Guest ne peut pas annuler le mute du Host et le Host ne prétend pas réactiver un micro coupé volontairement par le Guest ;
- les snapshots de gain/mute sont conservés lorsqu'un invité redescend puis remonte ;
- suppression du canal par identifiant local et identifiant profil pour éviter les canaux fantômes.

### Invités

- trois chips fixes : File d'attente, Coulisses, Sur scène ;
- fixture de 20 demandes, deux profils en Coulisses et trois invités sur scène ; redescendre un invité restaure immédiatement le scénario 2/3 ;
- lignes compactes, action primaire visible, actions secondaires dans `⋮` ;
- limite de trois invités hors Host ;
- scène, compteur et canaux de mixage mis à jour ensemble ;
- en live, le consentement serveur est conservé : file → invitation → acceptation → Green House → ready → Coulisses → scène ;
- en démonstration uniquement, Accepter peut matérialiser directement le passage en Coulisses pour présenter tous les états sans serveur.

## 4. Câblage réel conservé

Sont reliés aux services existants : Room et participants, présence, file, invitations, Green House/ready, Coulisses, scène, chat, suppression et épinglage, sondages et votes, gains/mutes persistés, Likes, Golden Likes, fin de Room, profil, messagerie et demande de collaboration.

Les transitions live ne contournent pas les RPC de sécurité. La limite 3/3 reste protégée dans l'interface, le hook et la migration SQL.

## 5. Résultats des 44 scénarios

Légende : `OK code` = chemin implémenté et inspecté ; `OK auto` = couvert par build/typecheck/tests ; `Partiel` = UI/état présent mais dépendance média ou backend manquante ; `Manuel` = validation visuelle/interactions navigateur encore à exécuter.

| # | Scénario | Résultat |
| ---: | --- | --- |
| 1 | Affichage sans scroll de page | OK code, Manuel |
| 2 | Chat → Mixeur → Outils → Invités | OK code, Manuel |
| 3 | Conservation des états entre onglets | OK code, Manuel |
| 4 | Repli/réouverture du panneau | OK code, Manuel |
| 5 | Mise à jour compacte des compteurs | OK code |
| 6 | Fin du live protégée | OK code |
| 7 | Chat vide | OK code, Manuel |
| 8 | Réception de plusieurs messages | OK code ; realtime existant |
| 9 | Couleur stable d'un nom | OK code |
| 10 | Aucun portrait dans le Chat | OK code |
| 11 | Épinglé affiché une fois | OK code |
| 12 | Brouillon conservé | OK code, Manuel |
| 13 | Échec puis renvoi d'un message | Partiel : erreur serveur exposée globalement, pas encore de bouton de renvoi par ligne |
| 14 | Host seul | OK code |
| 15 | Host + Musique | OK code |
| 16 | Host + un invité | OK code |
| 17 | Room complète à six tranches | OK auto via normalisation/fixtures |
| 18 | Six faders visibles à la référence desktop | OK code, Manuel |
| 19 | Aucun doublon Host | OK auto |
| 20 | Une seule source Musique | OK auto |
| 21 | Muet/réactivation d'une voix | OK code ; RPC existant |
| 22 | Saturation d'une source | OK code/fixture |
| 23 | Réglage d'un fader | OK code ; RPC existant |
| 24 | FX ouvert sur la bonne personne | OK code, Manuel |
| 25 | Trois traitements manipulables | OK code ; traitement sonore réel Partiel |
| 26 | Retour Volumes avec valeurs conservées | OK code, Manuel |
| 27 | Trois outils iOS présents | OK code |
| 28 | Aucun outil inventé | OK code |
| 29 | Permissions Outils | Partiel : capture navigateur réelle, publication RTC absente |
| 30 | États Outils | OK code, Manuel |
| 31 | Persistance Outils | OK code, Manuel |
| 32 | Retour au module canonique | OK code |
| 33 | File longue et scroll interne | OK auto via fixture, Manuel visuel |
| 34 | Onglets/chips fixes | OK code, Manuel |
| 35 | Acceptation vers Coulisses | OK code ; live conserve le consentement intermédiaire |
| 36 | Refus d'une demande | OK code ; RPC existant |
| 37 | Préparation en Coulisses | OK code ; preflight durable Partiel |
| 38 | Monter avec place disponible | OK code ; RPC existant |
| 39 | Monter désactivé à 3/3 | OK code |
| 40 | Redescendre en Coulisses | OK code ; RPC existant |
| 41 | Mise à jour de la scène | OK code ; média RTC réel Partiel |
| 42 | Création/suppression du canal | OK code |
| 43 | Host exclu des trois places | OK auto |
| 44 | Compteurs des chips | OK code ; realtime existant |

Validation automatisée exécutée :

- `npm run typecheck` : succès ;
- `npx vitest run src/features/rooms/place` : 2 fichiers, 9 tests, succès ;
- `npm run build` : succès ;
- `git diff --check` : succès.

## 6. Écarts encore réels

Ces capacités ne sont pas maquillées par la démonstration :

- pas de transport LiveKit/WebRTC Web pour les caméras et micros Guests ;
- partage écran capturé localement mais non publié au public ;
- VU et FX sonores non alimentés par un vrai graphe Web Audio en live ;
- preflight Green House non durable ;
- pas d'arrêt fournisseur Mux/BytePlus à la fin du live ;
- Chapeau sans paiement, ledger ni transaction ;
- renvoi individuel d'un message Chat échoué à compléter ;
- modération audience complète (ban/kick/slow mode) non exposée.

## 7. Captures

La validation navigateur n'a pas pu être exécutée dans cette session : le runtime Browser ne publiait aucune instance contrôlable (`agent.browsers.list()` vide). Aucune capture artificielle n'a été produite avec un outil non autorisé. Les vues à capturer dès qu'un navigateur est disponible sont : Chat, Mixeur à six tranches, chacun des trois outils, File d'attente, Coulisses et Sur scène 3/3, en 1920×1080 et 1440×900.
