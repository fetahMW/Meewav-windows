# La Place — première version web

> Contexte iOS complet et règles produit de référence : [`PLACE_IOS_COMPLETE_CONTEXT.md`](./PLACE_IOS_COMPLETE_CONTEXT.md).

## Intention

Cette version transpose sur desktop le produit La Place défini dans l’application iOS, sans dupliquer son interface mobile. Elle conserve le shell Rooms déjà livré (mousse acoustique, top bar et navigation primaire) et donne la priorité à trois surfaces : la Scène, le Studio live et la régie audio.

La limite publique reste `1 Host + 3 Guests`. Le chemin d’un Viewer vers la scène reste :

`file d’attente → invitation → Green House → prêt → Coulisses → Scène`.

## Ce qui est relié au backend existant

- chargement de la Room Place active, ou d’une Room ciblée par `?room=<id>` ;
- profils publics, participants, invitations, messages et états du mixeur ;
- abonnement Realtime aux tables Rooms ;
- chat via `rooms_send_message_v2` ;
- gains du micro et de la production du Host ;
- mute du micro du Host et mute forcé d’un Guest ;
- état lecture/pause de la production ;
- transitions Green House, Coulisses et Scène ;
- Like de Room et Golden Like côté Viewer, via les RPC Rooms dédiées ;
- lecture du composite Mux en HLS quand un `mux_playback_id` actif existe ;
- arbitrage audio avec le coordinateur média global MeeWav.

Les mutations sont optimistes pour garder l’interface instantanée. Une indisponibilité réseau est signalée et ne se fait jamais passer pour une réussite serveur. Le gain d’un Guest, le Master, le mute musique et les FX ne sont pas envoyés au serveur tant qu’un contrat dédié n’existe pas.

## Démonstration locale

Lorsque Supabase n’est pas disponible ou qu’aucune Room active n’existe, l’interface utilise un jeu de données cohérent : une Host, deux Guests sur scène, une artiste en Coulisses, une file d’attente, un chat actif, un mix cinq canaux, une production analysée et un traitement vocal Trap. Un compte connecté reste Viewer par défaut ; en développement uniquement, `?demoRole=host` ouvre explicitement la régie de démonstration sans modifier les permissions d’une Room live.

Les vidéos de démonstration utilisent uniquement les médias déjà présents dans le dépôt.

## Régie et traitement vocal

Le mixeur conserve la séparation produit iOS :

- Host : mix public, bus combiné par Guest et mute forcé ;
- Guest : son micro, production et traitement personnel ;
- Viewer ordinaire : pas de mixeur.

Le panneau possède exactement deux vues : **Volumes** et **FX voix**. Volumes affiche d’abord la voix du Host, puis jusqu’à trois Guests dans l’ordre d’arrivée, la musique lorsqu’une source existe réellement, et le Master fixé au bas du panneau hors du défilement. Les états Signal, Silence, Muet, Saturation, Connexion et Déconnecté sont distingués.

FX voix expose Auto-Tune, Reverb et Compression, puis une vue de réglages détaillés. Un Host peut régler sa propre voix ; les FX d’un Guest restent explicitement non partagés. Le DSP Superpowered et les AUv3 restent natifs à iOS : le web conserve les réglages localement sans prétendre les appliquer au signal tant qu’un graphe Web Audio ou WASM n’est pas raccordé.

## Host, engagement et chapeau

La scène n’est plus réduite par une seconde barre de production. Les commandes immédiates **Micro, Caméra, Monitoring et Plein écran** restent discrètement intégrées au bord du lecteur. **Inviter, Réglages et Terminer** restent dans l’en-tête de la régie. Le Mixeur s’ouvre exclusivement depuis la colonne droite ; il n’est dupliqué dans aucune autre zone.

Le Host voit les compteurs Like et Golden Like issus des RPC Rooms dans un rail en lecture seule, en réutilisant exactement le composant visuel de La Scène. Ces compteurs sont des états, pas des boutons : le Host ne peut jamais s’auto-liker ni s’offrir un Golden Like.

Le chapeau reste exclusivement une action audience. Son rendu web porte les profils de révolution du modèle RealityKit iOS dans une vraie scène Three/R3F : couronne, bord, ruban cylindrique, cavité inversée, lèvre, plaque, anneau et cœur sont générés en géométrie 3D avec la palette graphite et violet. Aucune pièce ne flotte au repos. Le flux de paiement web n’est pas encore raccordé.

## Transport média

- Mux HLS : branché pour le composite public quand le broadcast est actif ;
- Supabase : plan de contrôle et synchronisation métier ;
- BytePlus RTC : reste le transport temps réel de référence côté iOS ; son SDK web doit être ajouté derrière l’adaptateur média de La Place pour obtenir les flux séparés Host/Guests ;
- assets locaux : uniquement pour la démonstration sans serveur.

## Migrations ajoutées

- `20260803190000_rooms_live_engagement.sql` ;
- `20260803194500_rooms_golden_like_serialization.sql` ;
- `20260805062000_rooms_rpc_privilege_hardening.sql`.

Elles alignent le web sur le dépôt iOS pour les engagements live, le cooldown Golden Like et les privilèges RPC.

## Limites explicites de cette première version

- le SDK BytePlus web n’est pas encore présent dans le dépôt ;
- le véritable traitement vocal web n’est pas encore implémenté ;
- l’import audio prépare le fichier mais l’analyse BPM/tonalité/waveform reste à raccorder au worker média ;
- le chapeau affiche son point d’entrée et son rendu procédural, mais le flux de paiement n’est pas activé ;
- les gains Guest, Master et le mute musique n’ont pas encore de RPC serveur ;
- les réglages FX sont locaux tant que le graphe audio web n’est pas disponible ;
- les composants La Loge, La Wave, La Cage, La Classe et Le Studio restent à construire.

Ces limites sont des dépendances techniques identifiées ; aucun faux branchement n’est présenté comme fonctionnel.

## Vérification

Commandes de référence :

```bash
npm run typecheck
npm run test:unit -- src/features/rooms/place/place.fixtures.test.ts src/features/rooms/place/place.service.test.ts
npm run build
```

La validation visuelle doit couvrir au minimum Chat, Mixeur (Volumes et FX voix) et Invités en 1920×1080, 1440×900, 1024×768 et 430×932 dès qu’un navigateur de contrôle est disponible.

Pour cette passe, conformément à la consigne produit, aucune commande de test ou build n’a été exécutée par l’agent. Les captures servent uniquement à la passe Design Master explicitement demandée après livraison de la base fonctionnelle.
