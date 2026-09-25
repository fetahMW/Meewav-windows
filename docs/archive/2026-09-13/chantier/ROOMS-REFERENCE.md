# Référence actuelle des Rooms

## Validation globale du 12 septembre 2026

L'utilisateur a vérifié et validé tous les piliers, en confirmant explicitement la bonne version de la messagerie. La branche du globe vinyle et toutes ses corrections sont intégrées dans `main` de Meewav-Web. La référence opérationnelle est [VERSION-VALIDEE.md](VERSION-VALIDEE.md), tag `meewav-web-valide-2026-09-12`, aperçu stable 5182. Les anciens dossiers de travail sont archivés séparément ; ne pas les utiliser pour réintroduire d'anciennes interfaces. Aucun nouveau test ni contrôle visuel automatique pendant cette finalisation.

## Validation du 9 septembre 2026 — finalisation Messagerie, Collab, Projets et Groupes

Fusion autorisée de la tâche `codex/messaging-audio-colors`. Les demandes Collab disposent de cartes compactes, d’un mur à deux colonnes selon la largeur disponible et d’un espace de discussion distinct des amis. Le Track Pack des projets utilise la console intégrée et des formes d’onde calculées depuis les fichiers audio, avec les couleurs du mixer des Rooms. Les outils des groupes partagent des chips fixes et des cartes Membres compactes. Le champ de message compact reste en superposition au bas du fil. Le test de transparence du bandeau supérieur a été annulé : son fond opaque et la limite supérieure de défilement sont rétablis.

Validation visuelle effectuée par l’utilisateur ; aucune capture de contrôle par l’agent. Compilations Vite réalisées pendant le travail. La migration `20260909100000_messaging_collaboration_chats.sql` est versionnée mais non appliquée à la base distante ; les limites du câblage live restent documentées dans `MESSAGING-WIRING-AUDIT.md`. Aperçu stable après fusion : http://127.0.0.1:5182/messages.

## Validation du 9 septembre 2026 — Messagerie

Fusion autorisée de la refonte des cartes Collab, capsules audio et Track Pack, du menu de réactions MeeWav et de la composition du fil. La palette sombre et les accents lavande conservent le poteau existant. Détails : MESSAGING-PREMIUM-CARDS.md. Aucun test ni build lancé à la demande de l’utilisateur. La migration des réactions MeeWav est versionnée mais reste à appliquer à la base distante. Aperçu stable : http://127.0.0.1:5182/messages.


## Validation du 9 septembre 2026 — navigation La Scène

Corrections supplémentaires validées : suppression des raccourcis Bibliothèque et Historique de la navbar supérieure ; Publier et Mon Studio conservent leurs libellés sur desktop. Les menus des cartes vidéo utilisent des points plus grands, rapprochés du bord droit. Aucun test supplémentaire lancé à la demande de l’utilisateur.

Dernière correction validée : la fermeture du filtre à la souris restitue le focus sans contour de clavier résiduel. Le repère reste disponible pour la navigation au clavier. Aucun test supplémentaire lancé à la demande de l’utilisateur.

Fusion autorisée du menu accessible en lecture, de la colonne desktop permanente du lecteur et du Golden Like partagé avec les Rooms. La navigation supérieure conserve recherche et commandes sur tous les onglets, avec Explorer et TV en blanc. Le filtre utilise la matière noire laquée des Rooms et glisse sous la navbar ; le bandeau secondaire et le message de rafraîchissement sont supprimés. Détails et contrôles antérieurs : `SCENE-WATCH-MENU.md`. À la demande de l’utilisateur, aucun nouveau test après ses dernières instructions ; la validation visuelle lui revient.

## Validation du 8 septembre 2026 — La Scène

La Scène intègre le parcours vidéo V3 : menu latéral Abonnements et Vous, chips de catégories, grille de vidéos, lecteur dans la page, commentaires et file de lecture. MeeWav TV, le poteau et la navbar principale sont préservés. Le Studio utilise toute la largeur utile avec des surfaces noires et graphite laquées. Le trait de navigation violet avance progressivement.

Les vidéos présentent le même spot MeeWav de 15 secondes maximum, ignorable après 5 secondes de lecture. Le lecteur reste proche du poteau et propose des commandes et barres violettes avec un volume agrandi. La publicité interne utilise un média existant ; aucun réseau publicitaire payant n’est branché. L’indisponibilité éventuelle du catalogue distant est affichée sans supprimer les contenus déjà disponibles.

Validation : tests ciblés du parcours vidéo, du Studio et de la progression ; build Vite ; contrôles visuels desktop/mobile et enchaînement publicité vers vidéo. Détails dans `SCENE-WATCH-EXPERIENCE.md`. La correction du profil reste indépendante sur sa branche dédiée.

## Validation du 8 septembre 2026 — Marketplace

L’accueil du Market utilise un rail héros horizontal et des rails compacts. Le catalogue conserve ses cartes desktop compactes, avec des mises en scène regroupées dans une bibliothèque de 38 visuels. Les annonces de démonstration neuves identifient une boutique et celles d’occasion un particulier. Les annonces réelles conservent leurs données et leurs médias.

Le filtre s’ouvre à gauche sous la recherche avec une finition noire laquée et vert fumé. « Découvrir » et « Déposer une annonce » partagent le violet et les reflets du poteau de navigation. Les chevrons communs restent inchangés.

Validation : compilation Vite en mode Tremplin, huit tests ciblés des filtres et de la bibliothèque, vérifications visuelles desktop/mobile, ouverture des fiches, favoris, défilement et filtres. La correction indépendante du trait de navigation du profil reste sur sa branche dédiée.

## Validation du 8 septembre 2026 — Tremplin et chevrons partagés

La refonte du Tremplin est validée : accueil, parcours pédagogique, six grades communs avec activation au survol, rails héros et miniatures de Découvrir, et cartes de Mes artistes. Les rails utilisent la largeur disponible avec une marge latérale de 20 px sur desktop et 12 px sur mobile.

Le chevron rond translucide de 44 px est partagé par le Tremplin, la Marketplace, les rails de La Scène et l’accueil des Rooms. Il apparaît au survol ou au focus sans voile sombre sur toute la hauteur de l’image. Les gestionnaires de défilement existants et les limites des rails Rooms sont conservés.

Validation : compilation Vite en mode Tremplin, deux tests ciblés de composition/découverte, contrôles visuels desktop et mobile du Tremplin, clic de défilement dans Marketplace, La Scène et Rooms, et contrôle des états désactivés des Rooms. Les données financières affichées restent celles de la démonstration ; aucun paiement réel n’a été testé dans cette refonte.

## Base validée le 6 septembre 2026

La version de référence est `main`, publiée sur GitHub. Le jalon validé est `cebe6d05c4b2a5bc57e9165c6c8f135abd2ed7d6` : consolidation de l’accueil, des hosts et des viewers, puis restauration de la bourse avec préparation des lancers et animation au clic. Les prochains merges approuvés prolongent cette référence ; ne pas revenir automatiquement à ce hash.

- Dossier stable : `C:\Users\linkw\Desktop\Meewav-Web`.
- URL : `http://127.0.0.1:5182/rooms/home`.
- Commande depuis ce dossier sur `main` : `npm run dev:rooms:5182`.
- Les miniatures ouvrent les viewers ; le séquenceur et ses accès provisoires ouvrent les hosts actuels.
- Les commandes host et viewer restent distinctes, même lorsque leurs composants visuels sont partagés.

## Éléments à préserver

- Navbar vidéo premium partagée, champ de chat avec émoticônes, portraits et textes blancs ; CTA Chat et sous-menu bleus.
- Compteur de spectateurs à côté du bloc En direct ; titre Wave bleu.
- Cage : CTA blanc, Bracket / Régie / Match / Vote, invités compacts avec scroll, sélections 16/8/4 et Mes compétitions.
- Place : CTA blanc et tour de parole alimenté depuis les coulisses.
- Wave host : panneaux récupérés et profil du participant dans les contrôles du Beat ; conserver le viewer actuel.
- Mixeur viewer : Ma voix, Musique, Master ; ne pas réintroduire le chronomètre ni les faders des invités.
- Bourse : ajout de fonds, préparation de plusieurs lancers dans la pop-up, envoi depuis la navbar ; les fonds de démonstration restent fictifs.

## Travail à venir

Suivre `AGENTS.md` : une branche et un worktree temporaires par travail de feature, dans la conversation courante et avec un seul agent, sans création de conversation ni délégation sauf demande explicite, issus du `main` à jour, avec un aperçu distinct du 5182. Présenter le résultat puis demander le merge et le push, sauf autorisation explicite déjà donnée pour ce travail.

Les anciens worktrees ont été retirés. Les stashes `archive-before-worktree-removal-*` sont des sauvegardes historiques, pas des versions actives. L’historique Git conserve les détails des récupérations précédentes. La validation de cette base ne dispense pas de vérifier les prochains changements.

## Cage viewer — validation du 7 septembre 2026

Refonte validée : surfaces Hi-Fi noires laquées pour les battles, les tours et le vainqueur ; portraits agrandis avec contour violet et léger zoom au survol ; vote noir au repos et lumineux après sélection ; quatre matchs par page. La navbar vidéo du viewer apparaît à proximité du pointeur et les identités avec score ne recouvrent plus le retour vidéo du duel. Le bouton provisoire Simulation a été retiré. Les composants et le moteur de démonstration sont conservés sans cette entrée visible.

## Classe viewer, chat et Wave — validation du 7 septembre 2026

La Classe viewer réutilise la grille du host et sa navbar Hi-Fi à icônes. La maquette ouvre une place élève premium, avec 19 élèves assis et les places 20 à 24 libres. Le prix initial est de 4,99 €, réglable par le host ; l’achat et l’entrée sur une place libre sont simulés, sans paiement réel. La vue spectateur conserve ses permissions distinctes.

La navbar reste fixe pendant la consultation des questions. Les questions envoyées apparaissent en tête avec confirmation, et le brouillon est conservé en cas d’échec. Les messages privés du professeur apparaissent dans une bulle avec réponse directe ; le contour vert identifie la personne qui parle. La réception et la réponse ont été vérifiées entre deux onglets de démonstration ; les échanges réels utilisent les services de messagerie existants et n’ont pas été testés avec des comptes réels.

Toutes les rooms démarrent avec une seule vidéo. Le chat de démonstration utilise des noms gris préfixés par @, sans boutons de réaction ni Répondre, avec une cadence accélérée. Les CTA de contribution de la Wave utilisent un relief anthracite laqué.

## Consolidation validée le 7 septembre 2026 — Scène et viewers

- Bandeau viewer partagé entre Place, Wave, Cage, Classe, Scène et Loge : portrait cliquable avec pré-profil, grade accolé au nom, abonnés, partage compact, compteur de viewers, Suivre et Quitter. Matière sombre affinée, action Suivre légèrement violette.
- Pré-profils : composant partagé et limites de console communes avec la Wave ; conserver le survol violet et le zoom léger des portraits.
- Scène viewer : programme détaillé dès l’entrée, descriptions publiques éditables par le host, portraits d’artistes et grades, demande de passage via la file. Évaluation en fenêtre à la fin du show.
- Cagnotte du host : affichage noir laqué, don de démonstration distinct de la bourse. Aucun paiement réel raccordé ; ne pas annoncer un débit réel dans la maquette.
- Mixeur viewer : fader Retour du live indépendant de Ma voix, Musique et Master, appliqué aux retours vidéo des six rooms, y compris Cage.
- Port stable 5182 : dossier principal sur main. Les fichiers de contrôle sont conservés dans .git ; aucun ancien aperçu ne doit remplacer cette référence.

## Validation suivante — Place et bandeau viewer

- Compteur de viewers à gauche, près du chrono du live, dans les six rooms ; à droite : identité et grade, Suivre, Partager, Quitter.
- Place : Parole, Clash et Défis répartis sur trois colonnes et centrés. Accès à la file de montée sur scène dans chaque onglet, demande persistante entre onglets et fermeture contrôlée par le host.

## Switch Room — validation du 7 septembre 2026

Switch Room propose les six expériences depuis le bandeau host, avec préparation et choix individuel du public. Le live, la vidéo et les réglages locaux sont conservés. La Place viewer dispose du bouton de simulation ; le filtre Invités réutilise le panneau noir laqué coulissant. Les accès host provisoires ouvrent une session distincte à chaque lancement et les maquettes directes ont des identifiants séparés par room.

Les migrations SQL sont livrées, mais ne sont pas appliquées au Supabase distant. Les tests locaux ne constituent pas une validation de la notification Realtime entre comptes distants ni du worker audio de production. Voir SWITCH-ROOM.md.

Correction Switch Room : la pancarte Cage conserve sa largeur compacte (610 px maximum sur grand écran). Le viewer conserve la présentation précédemment acceptée pendant une invitation ; le titre et le thème changent après acceptation, tandis que les anciens outils restent bloqués.

## Classe et alignement Cage — validation du 7 septembre 2026

La pancarte Cage est centrée sur la navbar vidéo, y compris avec le panneau latéral replié. La migration vers la Classe propose une sélection de 1 à 24 élèves de la file, avec multi-sélection ; les sièges restants sont libres. Les 24 chaises conservent leur hauteur lorsque le lecteur audio est replié. Un micro éteint après migration ne bloque plus l’invitation à parler. Le prix host utilise un afficheur lisible en euros ; la fenêtre d’une chaise libre reprend ce montant.

La migration SQL des droits de sièges est incluse mais reste à appliquer à Supabase distant. Les contrôles locaux ne valident pas la livraison Realtime distante. Voir SWITCH-ROOM.md.

## Loge, Golden Like et mixeur viewer — validation du 8 septembre 2026

La Loge viewer ouvre les outils du moment, les questions et les demandes personnelles. Les files de cadeaux, dédicaces et rencontres sont contrôlées par le host. Le CTA est blanc et la scrollbar utilise la marge droite sans déplacer les cartes. Le Golden Like retrouve sa confirmation et son animation ; dans la Cage, la navbar reste visible pendant les étoiles.

Le mixeur viewer sépare le retour local du live et le Master envoyé. La Green House vérifie le même bus audio traité, conserve les niveaux et mutes et ne publie pas automatiquement. Le moteur de boucle et l’horloge Wave sont préservés.

Validation intégrée : build de production et 37 tests ciblés réussis. Les migrations SQL ne sont pas appliquées au distant ; les paiements, les échanges entre comptes réels et le parcours natif audio ne sont pas certifiés par ces tests. Voir LOGE-VIEWER.md et VIEWER-MIXER.md. Un audit room par room est demandé séparément.

## Mixeur — retouches validées du 8 septembre 2026

Lecteur et faders partagent une matière noire bombée, aux reflets discrets. Le signal passe du violet froid au bleu. La rangée des commandes du lecteur est remontée et décalée à gauche pour dégager le bord droit. Côté viewer uniquement, les tranches utilisent toute la largeur, réservent la hauteur des libellés et laissent une marge sous le Master. Routage audio et handlers inchangés. Rendu host/viewer vérifié dans le navigateur ; build audio-lab réussi.

## Mixeur viewer compact — validation du 8 septembre 2026

Tranches viewer à hauteur fixe de 64 px, Master compris, avec marges conservées ; dimensions host inchangées. Icône du morceau violette, boutons du lecteur légèrement grisés et chrono remonté. Le vumètre Musique reçoit la mesure Web Audio de la préécoute locale ; le retour du live utilise le niveau du programme de démonstration en mode demo uniquement. La mesure du retour réel reste distincte et n’est pas simulée. Build audio-lab et six tests ciblés réussis ; lecture d’un fichier WAV importé et activité du vumètre vérifiées dans Chromium.


## Accueil, Cage et likes viewer — intégration du 8 septembre 2026

- Accueil : emplacement de titre de deux lignes pour des miniatures de hauteur identique dans chaque rangée. Modale de lancement illustrée, Wave cyan et Classe bleu électrique ; marge au-dessus des cartes pour conserver le contour au survol.
- Les boutons « Provisoire » et « Accès direct host » partagent le même accès de démonstration pour les six rooms. Ils ouvrent une session host distincte sans préparation, uniquement en développement. Le parcours normal, dont la validation audio Wave et la Green House, reste séparé.
- Navigation locale : le mode d’aperçu permet d’ouvrir les piliers et la messagerie sans renvoi systématique vers l’accueil. L’exemption de connexion reste limitée aux pages autorisées en mode de développement.
- Cage : le lecteur spécialisé suit à nouveau la rencontre active. Le premier match dispose des actions Préparer puis Monter ; les états caméra et micro proviennent du participant présent. Le bandeau et la régie vidéo conservent les retouches validées.
- Likes viewer : cœur plein et compteur exact après ajout ; contour et décrément après retrait. Même composant dans les six rooms, host en lecture seule.
- Backend : le retrait d’un like réel utilise `rooms_unlike_v1`. La migration `20260908021000_rooms_unlike.sql` est livrée dans le dépôt mais n’a pas été appliquée à la base distante pendant cette intégration. Elle ne retire que le like ordinaire de l’utilisateur connecté, actif dans le live ; les Golden Likes restent indépendants.

## Cage — modes, Open Mic et podium, validation du 8 septembre 2026

- Le contrôle Mode propose Tournoi, Championnat et Open Mic avec une commande principale adaptée. Les portraits des listes Attente, Coulisses et Scène ouvrent le pré-profil partagé de droite à gauche.
- La montée individuelle Open Mic passe par la programmation, la préparation et la promotion existantes. Le lecteur et la pancarte utilisent les participants du runtime, même sans duel ; le viewer affiche le programme et les votes Open Mic.
- Voir les résultats ouvre le podium avec les portraits carrés de la pancarte et la suite du classement. Les résultats de match sont distincts du classement final et les égalités sont conservées. Le host ou la régie peut publier ce tableau au public et le retirer.
- Les migrations `20260908030000_rooms_cage_mode_controls.sql` et `20260908040000_rooms_cage_results_and_openmic.sql` sont livrées et contrôlées localement. Elles restent à appliquer à Supabase distant ; les essais locaux ne valident pas les échanges Realtime et média entre comptes réels.
- Aucun navigateur ni test visuel lancé pour cette tâche. Voir `docs/rooms/CAGE_COMPETITION_V1.md` pour les contrôles de logique, composants, build et SQL.


## Évolution validée le 8 septembre 2026

L’utilisateur a autorisé l’intégration du travail `codex/loge-host-restore` : contenu premium Loge retrouvé au commit `4d03cc2d0`, questions restaurées, lecteur repliable comme dans la Classe, module Invités graphite/argent, jury de quatre membres avec vote public, mixte 50/50 ou jury, et Open Mic Battle avec maintien du gagnant. Le commit de fusion sur main prolonge la référence historique ci-dessus. Les migrations `20260908060000_rooms_shared_jury.sql` et `20260908070000_rooms_cage_open_mic_battle.sql` sont incluses au dépôt mais non appliquées à la base distante.

## Loge, résultats et Invités — finalisation du 8 septembre 2026

Intégration autorisée du travail codex/loge-question-layout-fix (dernier ajustement UI : 2376614c7). Les questions Loge disposent d’un flux flexible défilant ; les résultats Cage restent lisibles même lorsque le vote est fermé. Les outils Cadeau et le résumé audio Loge retrouvent leur accent violet.

Invités utilise le bleu électrique et des cartes à reflets satinés. Seule la file d’attente est compactée ; les portraits ouvrent la pré-fiche partagée depuis la droite dans toutes les rooms. Les barres Attente et Coulisses sont alignées ; Filtrer, Tout sélectionner et Ajouter partagent leur gabarit et leur finition blanche. Les actions des cartes reprennent la hauteur et le noir bombé des boutons caméra/message ; File d’attente partage aussi leur contour au survol.

Aucun test, build ou contrôle visuel supplémentaire lancé, conformément à la consigne utilisateur. Les migrations distantes déjà documentées restent à appliquer séparément. Voir ROOMS-DISPLAY-FIX.md.

## Open Mic Battle — dernière intégration validée du 8 septembre 2026

Le travail guest-selection-white est autorisé à fusionner : sélections 16/8/4 blanches, participants Battle sélectionnables et ordonnables dans le même panneau, placement possible dès deux artistes, préparation du premier duel depuis la commande principale. Le gagnant reste sur scène et reçoit une couronne blanche avec son nombre de victoires sur le retour vidéo, visible côté host et public.

Validation : dix tests ciblés réussis pour le parcours et les modes, puis cinq tests du parcours après ajout de la couronne, dont trois victoires successives du même artiste et le rendu du compteur 3. Aucun build complet ni contrôle visuel. La migration 20260908080000_rooms_cage_battle_roster_flow.sql est livrée mais reste à appliquer à Supabase distant. Voir CAGE-BATTLE-FLOW.md.

Après fusion, utiliser main dans le dossier stable, sur http://127.0.0.1:5182/rooms/home. Le worktree et le serveur temporaires 5184 sont retirés.


## Messagerie — intégration autorisée le 9 septembre 2026

Cartes Collab avec profil et lecture inline, capsules audio et Track Packs, réactions MeeWav et composition premium. Audit de câblage demandé après les retouches : contact accepté visible, saisie Collab corrigée et lecture privée au premier clic. 231 tests ciblés et compilation réussis. Le schéma Supabase distant de messagerie générale manque ; les appels directs ne sont pas implémentés. Voir MESSAGING-PREMIUM-CARDS.md et MESSAGING-WIRING-AUDIT.md. Le main intégré remplace la référence historique sans la réinitialiser.
