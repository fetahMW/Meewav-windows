# La Scène — menu du lecteur et Golden Like

Travail du 9 septembre 2026, fusion autorisée par l’utilisateur. Branche `codex/scene-watch-menu-fix` issue de `ff35aeb2b`. Aperçu stable après fusion : `http://127.0.0.1:5182/scene`.

- Le bouton menu reste visible à côté de Retour pendant une vidéo. Sur desktop, une colonne noire de 270 px reste réservée à gauche du lecteur, menu ouvert ou fermé. Le menu Abonnements / Vous occupe cette colonne sans recouvrir ni assombrir la vidéo. Sur mobile, il conserve son ouverture en superposition. Échap ferme le menu, la navigation ferme le panneau et la fin de la publicité ne vole pas son focus.
- Le grand trait violet de navigation est remonté de 2 pixels. Sa vitesse reste inchangée.
- La confirmation du Golden Like est partagée avec les Rooms : surface graphite, étoile dorée, annulation, envoi protégé contre les doubles clics, retour d’erreur et animation dorée uniquement après réussite. Le quota et les appels serveur existants de La Scène sont conservés.
- La fenêtre utilise le dialogue natif, y compris dans un lecteur plein écran, et restitue le focus à la fermeture.

Validation : 74 tests ciblés passent entre les suites menu/lecteur, progression, engagement et confirmation Rooms. Build Vite réussi. Contrôle Chromium desktop 1440 × 900 et mobile 390 × 844 : menu utilisable, confirmation visible, focus restitué, aucun débord horizontal mobile. Les contrôles visuels utilisent les données locales de démonstration, sans envoi à un compte réel.

Le contrôle TypeScript global relève encore les erreurs existantes du dépôt ; aucun nouveau diagnostic n’est conservé dans le code modifié. La fusion est autorisée par l’utilisateur.

Correction de placement : mesures Chromium à 1920 × 1000 identiques avant ouverture, après ouverture et après fermeture (lecteur x = 374,8 px, largeur = 1027,2 px). Colonne séparée du lecteur par 20 px. Vérification sans débord horizontal à 1024 et 390 px ; build réussi.

Version finale du bandeau : recherche compacte entre La Scène et les onglets, Bibliothèque/Historique dans la navbar, suppression du bandeau secondaire et du fond/blur ajouté à la navbar. Le châssis garde son aspect continu. La liste latérale est légèrement décalée à droite et Accueil est aligné avec les chips, qui restent directement sous la navbar. Scrollbar du menu de 12 px, entièrement transparente au repos et visible au survol.

Le filtre reprend la matière noire laquée des Rooms avec les critères de La Scène. Il glisse depuis la gauche sous la navbar, son bord droit s’aligne avec la recherche, le contenu défile et le pied reste accessible. Le message de rafraîchissement du catalogue est retiré ; les contenus disponibles sont conservés en cas d’échec.

La même recherche et les mêmes commandes restent présentes sur Accueil, Explorer, Suivis et TV. Une largeur stable est réservée à la scrollbar pour éviter le déplacement des onglets. Les icônes Accueil, Explorer et TV sont blanches ; Suivis conserve sa couleur. Le dernier contrôle de géométrie effectué avant la demande d’arrêt des tests a relevé des positions identiques sur les quatre onglets. L’utilisateur assure la validation visuelle finale et demande de ne plus lancer de tests.

Ajustement demandé après fusion : sur desktop, le filtre couvre toute la largeur entre le bord droit du poteau et le bord droit du champ de recherche, sans espace latéral laissé à découvert. Le format mobile reste inchangé. Aucun test supplémentaire lancé, conformément à la demande.

Les cadres, fonds et ombres autour des icônes Accueil, Explorer, Suivis et TV sont retirés ; leur espace et leur couleur sont conservés.
