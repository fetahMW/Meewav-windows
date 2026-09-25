# La Place — contrat de réalisation vidéo

Ce document décrit la première version Web de la régie vidéo de **La Place**. Il sépare volontairement le plan de contrôle déjà partagé par Supabase Realtime du plan média qui doit encore être relié au SFU, à l'enregistrement et à la composition de diffusion.

## Invariants produit

- Une Room contient un host et au plus trois invités sur scène.
- Une source `16:9`, `9:16` ou `4:3` conserve son ratio natif. Le rendu par défaut utilise `object-fit: contain`.
- Le cadrage visuel ne modifie jamais le mix audio.
- La réalisation officielle et la vue personnelle sont deux états distincts.
- Un participant peut publier plusieurs sources, mais il n'occupe qu'une seule place sur scène.
- Un partage d'écran est une source du participant, pas un cinquième participant.
- Le host sélectionne d'abord un aperçu, puis déclenche explicitement **Mettre à l'antenne**.

## Deux états de disposition

### Program layout

L'état de programme représente la réalisation officielle :

- mode `auto`, `stage`, `grid` ou `solo` ;
- participant principal ;
- éventuel participant verrouillé ;
- ordre des participants ;
- source choisie par participant ;
- transition `cut` ou `dissolve` ;
- preset `performance`, `discussion` ou `collaboration` ;
- cadence Auto Director `calm`, `dynamic` ou `manual` ;
- configuration de cadrage sûr, désactivée tant qu'aucun service réel ne la fournit ;
- auteur et date de la dernière modification.

En Room de démonstration, cet état reste local. En Room live, `usePlaceProgramLayout` attend un abonnement Supabase Realtime confirmé, recharge ensuite `room_program_layout_v1` sans fenêtre de perte d'événement et transmet l'état contrôlé au moteur de scène. Une erreur de lecture transitoire est retentée trois fois avec temporisation bornée ; pendant cette reprise, les actions PROGRAM restent désactivées. Les mutations passent par la RPC host-only `rooms_set_program_layout_v1` avec révision compare-and-swap capturée au moment de l'intention : le serveur valide le host, le statut live, le host plus trois invités maximum, l'appartenance de chaque participant à la scène et la borne de zoom sûr `1..1.18`. En cas de conflit, le client recharge la version autoritaire. Si la migration ou Realtime n'est pas disponible après reprise, l'interface l'annonce, garde un aperçu local et ne prétend jamais avoir modifié l'antenne.

### Viewer layout

L'état de vue personnelle reste local à chaque client :

- suivre ou non le programme ;
- participant focalisé, solo ou plein écran ;
- grille locale ;
- éventuelle source personnelle choisie par participant, sans quitter la disposition officielle ;
- rail à droite ou en bas ;
- position du PiP.

Une vue personnelle ne doit jamais être enregistrée dans le replay, envoyée à MeeWav TV ou diffusée aux autres spectateurs.

## Recettes de disposition

| Participants | Scène par défaut | Grille disponible |
|---|---|---|
| 1 | solo contenu | solo |
| 2 | principal + PiP déplaçable | duo |
| 3 | principal + deux secondaires | grille à trois |
| 4 | principal + rail de trois | grille 2 × 2 |

Lorsque toutes les sources sont verticales, la grille peut devenir une galerie de trois ou quatre colonnes `9:16`. Pour les mélanges de ratios, le moteur score aussi une grille mixte qui réserve des colonnes indépendantes aux médias larges et verticaux. Il compare la surface principale, la surface média réellement visible sous `contain`, la fidélité moyenne et minimale des ratios et l’espace perdu ; crop et chevauchement restent à zéro. Pour la disposition Scène, il compare un rail à droite et un rail en bas selon les mêmes priorités. Une petite zone matte est préférable à un crop automatique.

## Sources vidéo

Le contrat accepte :

- `front_camera` ;
- `rear_camera` ;
- `screen` ;
- `desktop_composite` ;
- `portrait_composite`.

La source `desktop_composite` préférée est utilisée en priorité sur le Web, puis le partage d'écran, la caméra principale et les autres sources disponibles. Chaque publication doit fournir un identifiant stable, `active`, `programEligible` et `viewerSelectable`. Un contrat partiel échoue fermé. Le host peut prévisualiser les sources autorisées pour le PROGRAM ; un viewer ne peut choisir personnellement que les sources `viewerSelectable`. Le HLS Mux du host est construit depuis le playback ID lu côté serveur. Les seuls fallbacks sans publication sont les assets locaux de démonstration sous `/media` et `/images`.

Le contrat prévoit une `SafeVideoRegion` et un zoom intelligent plafonné à `1.18x`. Le client n’active la transformation que si la source fournit réellement une région sûre avec une confiance d’au moins `0.65`; sans cette donnée, le contrôle reste désactivé. Quand le host verrouille le cadrage, l’identifiant de source et une copie normalisée de cette région sont persistés dans le PROGRAM : tous les viewers, un remontage React et les métadonnées de réalisation utilisent donc le même cadre figé. Mettre une autre source à l’antenne libère automatiquement l’ancien cadre et exige un nouveau verrou. Aucun suivi de visage fictif et aucun crop implicite ne sont activés dans la V1.

## Réalisation automatique musicale

Trois cadences sont prévues :

- **Manuel** : aucun changement automatique ;
- **Auto calme** : recommandé pour les performances ;
- **Auto dynamique** : destiné aux discussions.

Le verrouillage manuel gagne toujours. L'Auto Director exploite uniquement des signaux disponibles et vérifiables : rôle, performer désigné par le host, activité audio soutenue, état micro/caméra, stabilité réseau et partage d'écran. La durée minimale d'un plan est de huit secondes en Auto calme et six secondes en Auto dynamique, avec un cooldown d'au moins deux secondes. Une suggestion peut être présentée au host sans modifier l'antenne.

Les presets **Performance**, **Discussion** et **Collaboration** règlent la cadence et la disposition ; ils ne modifient jamais silencieusement les volumes.

## Interactions hôte

- clic sur une vignette : sélection PREVIEW ;
- **Mettre à l'antenne** : mutation PROGRAM explicite ;
- **Verrouiller à l'antenne** : suspend l'automatisme ;
- double-clic : solo local ;
- plein écran : vue locale navigateur ;
- `A`, `S`, `G`, `F`, `Échap` et flèches : raccourcis hors champs de saisie ;
- transitions V1 : cut ou dissolve uniquement.

## État de câblage de cette version

| Capacité | État |
|---|---|
| Mise en page 1 à 4 participants | interface fonctionnelle |
| Ratios natifs et `contain` | interface fonctionnelle |
| PREVIEW / PROGRAM explicites | interface fonctionnelle |
| Solo, grille et plein écran locaux | interface fonctionnelle |
| Rail des autres participants en Solo | auto-masqué, réaffiché au mouvement/focus |
| Choix de source sur DTO enrichi | contrat prêt ; dépend des publications RTC |
| Partage d'écran navigateur | capture et aperçu local explicites ; publication RTC distante à raccorder |
| Program layout partagé | repository, RPC host-only, révisions CAS et abonnement Realtime implémentés ; migration à déployer |
| Sélection de couche simulcast/SVC | intentions source-spécifiques calculées ; binding SFU à fournir |
| Smart Framing | remapping `contain`, validation et zoom ≤ `1.18x` implémentés ; service de détection absent |
| Journal de réalisation | backend absent |
| Replay dirigé | reconstruction backend absente |
| Program feed MeeWav TV | orchestration backend absente |

## Dépendances backend obligatoires

La mise en production nécessite le déploiement du contrat de contrôle et le raccordement du plan média :

1. déployer dans l’ordre `20260810145000_rooms_public_stage_projection.sql`, `20260810151000_room_program_layout_v1.sql`, `20260810152000_rooms_own_camera_state.sql` puis `20260810153000_rooms_program_transition_lock.sql`. Cette dernière migration sérialise par Room la réalisation PROGRAM et toutes les mutations d’appartenance à la scène avant leurs verrous de ligne ;
2. un mapping stable participant → publications LiveKit/SFU, incluant type de source et ratio ;
3. des commandes de sélection de couche haute/basse et de demande de keyframe ;
4. un journal horodaté des changements de plan et de source ;
5. un enregistrement ISO des pistes quand les droits l'autorisent ;
6. un compositeur de replay/TV utilisant exclusivement le Program layout ;
7. des contrôles de droits pour le partage, le replay et MeeWav TV.

Le Program layout peut donc devenir la source de vérité synchronisée dès que sa migration est appliquée. Cela ne rend pas encore la réalisation complète en production : tant que les publications RTC individuelles, les commandes de couche SFU, le journal, l'enregistrement ISO et les compositeurs replay/TV ne sont pas raccordés, la régie partage ses décisions mais ne produit pas encore à elle seule un programme média distant ou enregistré.
