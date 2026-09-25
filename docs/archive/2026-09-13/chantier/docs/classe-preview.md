# La Classe — preview réservée

## Attribution

- Branche de travail : `codex/classe-premium-ux`.
- Serveur : `http://127.0.0.1:5179/rooms/classe`, exclusivement.
- Vérification : Chrome lancé par Playwright avec des contextes isolés par room.
- Présentation : navigateur externe local, dans un onglet dédié à cette mission.
- Ne pas contrôler les onglets personnels ni ceux des autres tâches.
- La propagation aux autres worktrees utilise 5178, 5180 et 5181 ; la Classe reste sur 5179.

## Démarrage

Depuis le worktree La Classe, lancer `npm run dev:classe`, puis ouvrir l’adresse
ci-dessus dans l’onglet dédié à cette mission. Le lancement n’ouvre plus
le navigateur par défaut. `--strictPort` empêche Vite de basculer sur un autre
port si 5179 est occupé : identifier le propriétaire avant toute intervention,
ne jamais arrêter un processus d’une autre tâche.

Afficher **Classe → La Classe**, puis replier le lecteur pour la grille des
24 élèves. Après chaque correction, actualiser uniquement cet onglet.

## Épinglés dans le Chat

Le panneau Épinglés affiche le message retenu avec son auteur et permet de le
désépingler. « Choisir dans le chat » revient à la conversation. Un clic sur le
message, le nom ou les trois points ouvre les actions : épingler, mettre en avant,
voir le profil et supprimer. La durée de 10, 20 ou 30 secondes se choisit seulement
pour la mise en avant. Le public conserve uniquement l’accès au profil.

Les messages animés de la démo peuvent aussi être épinglés. En live, seuls les
messages présents dans la room sont acceptés par l’action d’épinglage.

Les auteurs du Chat affichent leur portrait devant leur nom, avec une initiale
de secours si l’image est absente ou indisponible. Le bandeau épinglé réserve
la largeur réelle de son icône pour éviter tout chevauchement avec le texte.
Tous les noms sont en blanc perlé, 11 px et graisse 500. Les messages du host utilisent une carte en
verre sombre avec un badge discret près du nom, sans accent vertical latéral.
Le profil host partagé de la maquette est PUFf, avec son portrait ; les profils
live restent fournis par le service. Les tests couvrent l’envoi de PUFf en démo
et celui d’un host live distinct (43 tests ciblés).
La démo renouvelle une seule liste chronologique bornée, messages initiaux
compris ; le bandeau épinglé reste séparé et l’historique live n’est pas tronqué.

## Barre de saisie en verre noir

La référence de la barre de chat est une capsule noire à reflets bleus/violets.
Le champ et le bouton image partagent une coque intérieure plus basse, avec
un seul filet extérieur et des reflets doux. La touche d’envoi reste noire au
repos et s’éclaire en bleu/violet lorsque le focus est dans la barre, même avant
de saisir du texte. Elle reste fonctionnellement désactivée tant qu’aucun texte
utile n’est saisi. Les gradients sont statiques. La finition est isolée dans
`place-chat-composer-glass.css`.

L’icône image ouvre la galerie des visuels MeeWav existante, avec le même libellé
accessible et le même contrat de messages texte/émoticônes. Elle n’ajoute pas un
upload de photos. Les captures contrôlent la coque et les boutons à largeur
compacte et bureau. La passe d’affinage réduit la hauteur compacte de 52,3 à
43,3 px, sans débordement horizontal. Le contrôle du focus couvre le champ vide,
la saisie et un brouillon conservé après sortie du champ : l’envoi s’éteint bien
au repos. Le build passe ; les tests du chat et des émoticônes de la passe
fonctionnelle précédente passent (37 tests).

## Navigation et mixeur partagés

La navigation verticale en verre violet a été reprise depuis `main` à
`1ddb1cc53` (propagation initiale `d93958357`). Le port 5179 sert ce worktree
Classe, resté à `8855b9b7a` : actualiser ne pouvait pas récupérer les changements
faits dans le checkout principal. Les six fichiers du composant de navigation,
de son matériau et de sa marque partagée ont été synchronisés seuls, en
conservant les travaux locaux de la Classe. Rendu bureau contrôlé ; 32 tests
de navigation et build réussis. Le matériau violet suit la règle existante
de la source : à partir de 761 px de largeur, hors route Globe.

La barre compacte de la classe comporte six boutons. « Pré-profil » remplace
le raccourci Questions ; l’onglet Questions reste disponible en haut. Le
pré-profil reprend le cadre et le contenu du Globe, en glissant depuis la droite
en 220 ms dans la seule zone des élèves. La vidéo et la barre restent visibles
et interactives, sans voile ni flou. La fermeture dure 180 ms et rend le focus au
bouton ; les animations sont désactivées si les mouvements réduits sont demandés.

Le cadre partagé `PreProfileFrame` reprend désormais le châssis du Mixeur :
contour métallisé de 5 px, double bord arrondi et façade noire laquée à reflets
fumés. L'ancien visuel SVG ondulé est remplacé par ce cadre CSS. Portrait,
boutons, onglets et cartes médias utilisent la même finition ; les badges,
repères et états actifs conservent leurs couleurs. Après correction, les
tailles du contenu sont conservées : portrait visiteur de 100 px, boutons de
39 px, tailles de texte et espacements de la pop-up initiale. Le Globe conserve
son cadre de 413 × 588 px. Dans la Classe, la pop-up conserve toute la hauteur
de la zone des élèves, au-dessus de la navbar, et laisse une marge latérale de
4 %. Sa composition de référence est ajustée proportionnellement à la place
disponible sans agrandissement au-delà de sa taille native ; la hauteur du cadre
est calculée séparément pour rester élancée. Les variantes qui empilaient les
informations et imposaient un défilement sont retirées. Le contrôle à 1280 ×
900 px donne un cadre de 356 × 545 px avec tous les blocs visibles, sans scroll.
La fermeture est une touche carrée de 30 px avant mise à l'échelle, laquée et
en relief comme les commandes de la navbar.
Le Globe et la Classe utilisent ce même composant et la même feuille de style.
Le rendu a été contrôlé dans la Classe, sans débordement horizontal. Le serveur
réservé à la Classe redirige les autres routes : le contrôle visuel du Globe
n'a donc pas été effectué sur ce port. Les 12 tests ciblés du contenu partagé
et du panneau Classe passent, ainsi que le build.

« À l’écran », identifié par une caméra, cible l’élève sélectionné et
utilise le programme vidéo partagé, indépendamment de la commande de parole.
En démo, la dernière place invité est réservée à cette mise en avant. En live,
le passage conserve l’invitation, la préparation caméra et la capacité serveur ;
aucun invité réel n’est remplacé automatiquement.
Le bouton attend l’acceptation puis la validation Green House. Un profil prêt
encore dans la file passe par les coulisses avant la scène, sans nouvelle
invitation. Le Host n’appelle jamais la validation de préparation à la place
de l’élève. La future interface Green House doit confirmer cette préparation
via le contrat existant `markInvitationReady` ; les vérifications physiques
des appareils restent à réaliser dans cette interface.

Les six rooms reprennent la typographie et le matériau du sous-menu Mixeur,
avec Chat en bleu et Invités en orange, y compris leurs sous-menus et icônes.
Le mixeur host de La Classe sert de référence commune pour les faders et le
lecteur ; l’onglet et les outils propres à chaque room restent inchangés.

## Réactivité du studio — mesure locale du 5 septembre 2026

Le roster Invités reste monté entre les onglets, mais ne se reconstruit plus
pour chaque changement de surface ou niveau de vumètre. Ses données de profils
et de file sont mémorisées séparément. Les petits contrôles média continuent
de recevoir l’état et les commandes actuels, sans modifier le moteur du mixeur.

Sur quatre bascules Chat/Mixeur dans le navigateur intégré, à 1280 × 720 et
DPR 1,5, le délai clic → commit passe de 74–239 ms à 30,5–81,7 ms, et le délai
clic → première frame de 96–295 ms à 57,4–102,6 ms. La seconde passe ramène
les rendus périodiques Invités de 96–153 ms à 9–11 ms. L’instrumentation DEV
temporaire a été retirée après comparaison.

Un écart de 383 ms entre frames subsiste dans cette passe. Le gel intermittent
de 3–4 secondes signalé n’a pas été reproduit ; aucun essai avec une seule
instance de navigateur n’a été effectué. Ces mesures ne désignent pas le GPU
comme cause et ne garantissent pas l’absence de tout ralentissement.

## Plusieurs instances

Chaque tâche doit avoir son propre worktree, sa branche, son port fixe et son
onglet de navigateur identifié. Des onglets séparés n’isolent pas les fichiers
de code ; des ports différents n’isolent pas les profils ni les cookies.
Cette convention sépare les surfaces de travail, sans prétendre fournir un
cloisonnement de sécurité entre les tâches.

## Vérification visuelle

La grille utilise des cartes en verre bleu, des reflets sur les bords et des
touches bombées noires pour les actions, colorées lorsqu’elles sont actives.
La barre sans libellés visibles mesure 52 px ; les noms accessibles sont conservés.
Les halos restent fixes, sans flou animé par carte. Lecteur replié, les six
rangées partagent l’espace disponible sans défilement. Lecteur déplié, les
cartes gardent au moins 64 px de hauteur et seule la grille peut défiler.

`npm run capture:classe-design -- current` produit les captures locales dans
`artifacts/classe-design/current` et vérifie la grille, les portraits, la
sélection, les mains et les panneaux privés/ressources. Le contrôle du lecteur
replié exige que les 24 élèves restent visibles sans défilement.

`node scripts/capture-room-studio-design.mjs current` contrôle les six rooms
sur leurs ports attribués (Place/Loge/Wave 5178, Classe 5179, Cage 5180,
Scène 5181), sur bureau et mobile. Il capture Chat, Mixeur, outils spécifiques
et Invités, contrôle les quatre actions du Chat, les icônes, le partage dans
la navbar vidéo et l’absence de pieds ou de débordement global. Les rôles host
et viewer sont vérifiés. Ajouter des identifiants après le label limite la
passe, par exemple `current classe` ; les serveurs doivent déjà être lancés.

## Propagation vérifiée le 5 septembre 2026

### Cartes invités compactes — passe locale suivante

Les cartes partagées par les six routes utilisent une finition noire avec des
reflets orange discrets pour tous les profils. Portraits, marges, espacement et
boutons sont réduits ; « Vers les coulisses » reste sur une seule ligne. Les
états média et les actions de déplacement restent ceux du participant, et le
badge MeeWav conserve sa forme et la couleur de son grade. Les reflets sont
statiques, sans filtre animé par carte.

Le choix de couleur dans le profil et sa migration non appliquée ont été retirés.
Aucune donnée de genre n’intervient dans les cartes. Ces changements restent
dans le worktree Classe et ne sont pas encore propagés vers les autres worktrees
ni poussés sur GitHub.

### Propagation antérieure

La référence commune est `14407553b`. La propagation a été contrôlée dans les
worktrees existants, sans piloter les anciennes conversations.

| Worktree | Branche | Commit intégré | Port |
| --- | --- | --- | --- |
| `rooms-latest-integration` | `codex/refondre-le-design-des-boucles` | `81f2f249e` | 5178 |
| `cage-tools` | `codex/cage-tools` | `8042cfbad` | 5180 |
| `scene-tools` | `codex/scene-tools` | `326b1b595` | 5181 |

Les builds réussissent. Les captures bureau/mobile des six rooms vérifient
les surfaces Chat, Mixeur, outils spécifiques et Invités, ainsi que les rôles
host et viewer. Le correctif Cage dégage la poignée du studio public mobile
de la barre d’actions sans modifier le duel. Les changements Cage déjà locaux
dans `rooms-latest-integration` restent conservés hors des commits de propagation.

Les tests ciblés passent ; le contrôle TypeScript global de Classe et Scène
conserve des diagnostics préexistants de types/dépendances hors de cette
propagation. La vérification locale ne remplace pas une session multi-utilisateur
avec publication réelle de médias.

## Integration des six regies — 5 septembre 2026

La console Classe approuvee est commune aux six presentations : chat bleu,
invites orange, volumes, FX voix, pads et Time avec la meme finition noire.
Les outils specifiques restent propres a chaque room. Les derniers outils
Place, Scene et Loge de main sont conserves.

Les titres retrouvent leurs couleurs : Cage rouge, Wave cyan, Classe bleu,
Loge or, Place blanc et Scene violet. Verification DOM dans les six rooms,
controle visuel de la console et navigation entre les outils effectues.

Validation : build Vite reussi ; 166 tests cibles de console/chat/profil/
spotlight reussis (2 ignores), plus 13 tests des derniers outils Loge.
La suite globale reste non verte : des echecs hors perimetre sont egalement
reproduits sur main (17 echecs dans le sous-ensemble de comparaison).
Les contrats SQL comportent aussi des attentes sensibles aux fins de ligne
Windows. Cette validation ne remplace pas une session media multi-utilisateur.
