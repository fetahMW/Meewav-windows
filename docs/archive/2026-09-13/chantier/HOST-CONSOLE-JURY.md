# Console host, Loge et jury

Travail isolé depuis `main` au commit `9ab9b9f7c`, dans `.worktrees/loge-host-restore`.
Aperçu : http://127.0.0.1:5184/rooms/loge?demoRole=host

## Restauration Loge

Les modules dédiés proviennent des changements `6fcf08b05` et `46a591034` : sélection dans la file de jusqu’à huit invités, dédicaces audio/vidéo de groupe, Monter avec moi, questions et réponse privée. Les raccordements du composant partagé sont intégrés par portions. Les listes de demandes viewer/host récentes sont conservées. L’affichage des questions réutilise le handler d’épinglage temporisé existant.

Les CTA principaux Loge et Wave utilisent le blanc. L’onglet Invités partage désormais le même contour de 1,5 px que Chat, Mixeur et Outils, dans les six rooms.

## Jury commun

Coulisses propose le bouton Jury. Un host sélectionne de un à quatre invités présents dans les coulisses (statuts ready/backstage), puis choisit Public, Public + jury ou Jury uniquement. Le mode mixte est fixé à 50 % par groupe à la demande de l’utilisateur. Un juré n’appartient pas simultanément au groupe public. Un groupe sans bulletin ne peut pas décider seul d’un résultat mixte.

Le réglage est propre au live et partagé entre ses fenêtres. Les votes déjà enregistrés restent associés à leur auteur ; les votes ouverts utilisent le réglage courant. Les RPC existantes conservent leurs autorisations et protections contre les doublons. La migration `20260908060000_rooms_shared_jury.sql` ajoute le stockage protégé du jury, les gardes sur les bulletins et les calculs pondérés pour sondages, évaluations Scène, Wave et Cage. Cette migration est livrée mais pas appliquée au serveur distant.

## Validation

Avant la consigne d’arrêt des contrôles : 26 tests ciblés Loge réussis et build audio-lab réussi sur la restauration initiale. Le parcours de sélection de deux invités et le CTA Loge blanc ont été observés dans le navigateur. Une passe plus large a signalé trois échecs sur Classe, Cage et Scène ; elle ne constitue pas une validation globale.

À la demande explicite de l’utilisateur, aucun nouveau test, build ou contrôle visuel n’est lancé sur les modifications jury et contour. Les fonctionnalités live distantes requièrent l’application de la migration et une validation réelle des comptes, médias et votes. Aucun merge/push sur main n’est autorisé à ce stade.

## Open Mic Battle

Le travail Cage de la branche `codex/cage-open-mic-battle` est réuni dans cet aperçu de travail, sans merge dans main. Le mode Open Mic libre conserve ses passages individuels. Open Mic Battle organise les challengers dans l’ordre choisi : après chaque verdict, le gagnant conserve sa place sur scène et le perdant retourne au public. La régie prépare le challenger suivant, avec le consentement et la disponibilité existants. Les égalités passent par la manche décisive existante.

La migration `20260908070000_rooms_cage_open_mic_battle.sql` étend les transitions de scène serveur. Elle n’est pas appliquée à la base distante. Aucun test, build ou contrôle visuel n’a été exécuté sur ce mode, conformément à la consigne de l’utilisateur.

L’accueil de l’aperçu combiné est `http://127.0.0.1:5184/rooms/home`. Le port 78 conserve main tant que l’intégration n’est pas autorisée.

## Correction après retour utilisateur sur 5184

La première restauration n’est pas validée visuellement par l’utilisateur : le parcours mélangeait les listes de demandes et les actions VIP, et le sous-menu conservait son accent or. La sélection des personnes est désormais intégrée au panneau VIP, avec dédicace audio, dédicace vidéo, face-à-face et cadeau. Le cadeau réutilise le formulaire et les handlers existants, avec la première personne sélectionnée comme destinataire initial. Les listes de demandes sont conservées dans une section repliée. Le contour canonique passe lui-même à 1,5 px et le bouton Jury reçoit une finition sombre explicite.

Le ralentissement signalé a conduit à mutualiser le canal Realtime du jury par room, à dédupliquer les lectures simultanées et à ignorer les publications de politique inchangée. Le sondage ne reconstruit plus la room pour les événements de stockage étrangers ou pour une projection identique. Aucun benchmark, test ou contrôle visuel n’a été lancé ; l’amélioration ressentie reste à confirmer par l’utilisateur. Cette correction n’est pas fusionnée dans main.


## Révision demandée le 8 septembre : jury sur les cartes et console historique

Cette révision remplace la reconstruction précédente. Le panneau VIP, sa feuille moment-vip et le skin Loge sont repris de 4d03cc2d0 (5 septembre), dernier commit de console host retrouvé avant les modifications viewer du 8 septembre. Les sources de participants actuelles et les protections séparant démo et live restent raccordées. Cadeau et Sondage redeviennent accessibles dans la navigation Loge avec les handlers actuels. Les CTA restent blancs. Les listes de demandes ne sont plus insérées dans la console VIP historique ; les parcours viewer récents restent dans leurs composants dédiés.

La Loge vide provenait de la reconstruction précédente : ActionSelector appelait audienceLabel avec zéro invité, puis accédait à fans[0].name. La console historique remplace ce chemin. Une limite d’erreur placée dans le portail visible évite que son message de récupération se retrouve dans le panneau technique masqué.

La petite astuce flottante des coulisses et la fenêtre de configuration du jury sont supprimées. Chaque carte possède une action flèche vers le haut / Jury à côté de File d’attente. À quatre membres, les ajouts sont désactivés ; les jurés portent un badge vert menthe et peuvent être retirés. Le chip Jury affiche directement leurs cartes et le choix de vote (public, mixte 50/50, jury). Pas de nouveau test, build ou contrôle visuel, conformément à la demande utilisateur. Le serveur de travail reste sur 5184, aucune intégration main.


## Palette et espacements du module Invités

Retour utilisateur du 8 septembre : la couleur menthe du jury et l’orange dominant sont abandonnés. La navigation Invités, les trois listes, les actions, filtres et invitations emploient désormais une palette graphite / argent. Le jury utilise un badge texte et icône argenté placé sur la carte ; les portraits et grades gardent leur identité. Les alertes de connexion restent distinctes.

La liste des coulisses passe en colonne flexible : seules les cartes occupent l’espace restant. Le réglage du vote garde sa hauteur naturelle, sans panneau coloré, avec 10 px de séparation. Les boutons de la barre partagent une hauteur de 28 px et un écart de 8 px. Aucun test, build ou contrôle visuel lancé à la demande utilisateur ; travail conservé sur l’aperçu 5184.


## Intégration autorisée

L’utilisateur a validé le contenu Loge et demandé explicitement commit, push GitHub et merge le 8 septembre. Les styles du flux de questions sont rétablis dans une feuille dédiée pour éviter leur perte lors d’une évolution du panneau VIP. Le lecteur audio repliable existant dans la Classe est activé dans la Loge, avec un libellé adapté à la room. Le périmètre intégré comprend les changements de cette branche (Loge, module Invités, jury et Open Mic Battle). Aucun nouveau test, build ou contrôle visuel n’est lancé ; seuls la provenance et les opérations Git/serveur sont contrôlées pour publier la version autorisée. Les migrations live restent à appliquer séparément.
