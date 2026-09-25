# La Cage — compétition et affichage public

Implémentation du 6 septembre 2026, dans le worktree `classe-latest-preview-08048e3`.

## Parcours

Le séquenceur de l’accueil accepte une configuration neuve ou une copie du modèle préparé depuis le profil. Chaque lancement possède sa propre configuration. Le modèle original n’est jamais réécrit par le live.

| Format | Organisation | Passage et décision |
| --- | --- | --- |
| Tournoi | Bracket à élimination, seeds, génération et verrouillage. Les vainqueurs avancent vers la finale. | Deux adversaires, passages prévus par le règlement, vote et départage. |
| Championnat | Calendrier où chaque participant rencontre les autres, classement cumulé par victoires et rencontres jouées. Les totaux égaux restent ex æquo. | La résolution d’une rencontre, y compris un forfait, ne retire aucun des deux participants des journées suivantes. |
| Open Mic | Programme ordonné de passages individuels ; les ajouts conservent les passages existants. Aucun adversaire, bracket, vainqueur ou qualification. | Un artiste sur scène. Au lancement, choix explicite entre appréciation publique, note de 1 à 5 sans élimination, ou aucun vote. |

Les quatre onglets sont **Bracket / Régie / Match / Vote** pour le tournoi, **Classement / Régie / Match / Vote** pour le championnat et **Programme / Régie / Passage / Public** pour l’Open Mic. Le journal et les opérations de préparation restent réservés à la régie.

La commande en bas reste visible lorsque l’on change d’outil. Une première génération utilise les présences effectives ; le rechargement retrouve ensuite le tirage conservé, sans le refaire.

Les invités passent par le module existant : acceptation, Green House privée, confirmation caméra/micro/connexion/Mixeur/autorisations, puis montée de la paire ou de l’artiste solo en une commande. Le Mixeur partagé et les réglages personnels sont conservés. La disponibilité des médias RTC est vérifiée avant le démarrage.

La paire ou l’artiste suivant se prépare pendant le passage courant lorsque les personnes sont disponibles. L’auto-régie peut les monter une fois prêts et la scène libérée, mais elle ne démarre jamais une performance. Les passages Open Mic reportés ou retirés restent distincts des passages effectués ; un retrait ne produit aucun vainqueur.

En Open Mic, la fenêtre d’appréciation est indépendante du passage actuellement sur scène. Chaque compte éligible peut répondre une seule fois, les agrégats restent masqués jusqu’à la clôture et une note ne déclenche aucune élimination. Les anciennes configurations qui ne précisent pas de mode restent lisibles sans leur attribuer un choix implicite.

## Tableau à l’antenne

Le bouton **Afficher le bracket au public** de l’onglet Bracket déclenche `broadcast.bracket` avec `{ enabled: true }`. Le host peut ensuite le retirer depuis cet onglet ou la croix du tableau.

Le même contrôle affiche le **classement et le calendrier** en championnat ou le **programme des passages** en Open Mic. Le contenu dépend du format enregistré au lancement.

`CageBracketBroadcast` est placé dans le lecteur commun, en dehors du choix RTC/HLS. Le tableau accompagne donc aussi le plein écran. Les spectateurs voient les noms, rencontres et résultats clôturés ; aucun contrôle de régie, journal privé ou détail de préparation des autres participants.

## Contrat live

Migration : `supabase/migrations/20260906180000_rooms_cage_competition_v1.sql`.

- `rooms_cage_launch_v1` crée la session et sa configuration dans une transaction idempotente.
- `rooms_apply_cage_command_v1` reçoit une action, son contenu, une clé d’idempotence et les gardes de révision/match/étape. Son huitième paramètre, `p_expected_entry_id`, cible le passage individuel Open Mic et évite d’appliquer une commande au mauvais artiste.
- `rooms_get_specialized_state_v1` restitue la projection adaptée à l’utilisateur.
- `rooms_cage_presence_v1` reçoit une pulsation toutes les 15 secondes ; une présence expire après 45 secondes. La confirmation Ready nécessite un geste de l’invité.
- La clôture et la résolution du vote, la progression du tableau et les transitions des invités sont enregistrées ensemble côté serveur.
- Les anciens appels qui remplaçaient tout l’état Cage sont refusés. Une session live n’est jamais remplacée par des données de démonstration en cas d’erreur.

Les dates de démarrage et le temps écoulé sont conservés côté serveur. Le minuteur libre du Mixeur ne remplace pas le chrono officiel de la compétition.

## Démonstration locale

Le séquenceur de développement produit une URL avec `cageSession`. La configuration initiale et la progression sont stockées séparément. Le roster provient des invités de démonstration existants, sans ajout automatique pour compléter les places.

L’entrée de prévisualisation Cage ouvre **Mon tournoi — La Cage**, un tournoi vierge prévu pour 16 participants : aucune sélection, aucun tableau, aucun match, aucun résultat ni artiste envoyé automatiquement sur scène. L’ancien scénario automatique est remplacé une seule fois ; les rafraîchissements suivants conservent les choix du host. Les sessions créées par le séquenceur gardent leur propre règlement et leur sélection.

Tous les profils de démonstration restent dans la file Invités. Le host les appelle manuellement : la démo simule alors leur acceptation et leur préparation, puis les rend disponibles dans le Bracket. Le placement manuel permet de choisir les inscrits et l’ordre des rencontres. Aucun remplissage du roster n’est exécuté à l’ouverture. Les déplacements Invités sont persistés dans le même état que le tournoi ; le host peut utiliser les retours vidéo avant de verrouiller son tableau.

Le bandeau **Tournoi démo · pilotage manuel** n’a plus de lecture automatique. Chaque démarrage, fin de passage, ouverture et clôture du vote, puis montée de la paire suivante dépend d’une commande du host. Le chrono ne déclenche pas de passage suivant. Les bulletins fictifs ne sont ajoutés qu’après l’ouverture manuelle du vote ; le vote de cette démo attend une clôture manuelle. Les échéances des sessions personnalisées et du live restent inchangées.

Les identités, portraits, grades et rôles du panneau, de la scène, des cartes et des Invités proviennent du même roster. Chaque profil de la démo manuelle conserve un média illustratif attribué à son identité, indépendamment de son placement : la file mélange des sources desktop et verticales. L’ancien paramètre de prévisualisation `cageDemo=landscape` ne force plus toutes les sources de ce tournoi au même format. Les six médias existants sont réutilisés ; ce ne sont pas des captations de chaque profil.

Les vidéos du dernier duel restent affichées pendant le vote et après le verdict, jusqu’à la montée manuelle des prochains artistes. Aucun écran de victoire ne remplace la vidéo : le résultat apparaît dans le panneau et dans les outils. L’afficheur emploie des textes composés sur deux lignes, ajustés à la largeur disponible, y compris pour les noms longs.

Le moteur de démonstration persiste ses commandes et signale les changements entre onglets. Il ne remplace pas le serveur pour un live réel.

## Périmètre et mise en service

Le tournoi et le championnat partagent le déroulement d’une rencontre à deux, en mode successif, alterné ou simultané, avec des règles de progression distinctes. L’Open Mic utilise son propre moteur de passages individuels. Les choix jury/mixte restent désactivés au lancement tant qu’un contrat de jurés et de pondération n’est pas défini. Le championnat utilise les victoires cumulées ; aucun barème de points ou départage final supplémentaire n’est inventé.

La migration est préparée dans le dépôt mais n’a pas été appliquée à une base distante dans cette intervention. Aucun test, build ou essai navigateur n’a été lancé : la validation fonctionnelle et visuelle est laissée à l’utilisateur, conformément à sa consigne.


## Sélecteur de mode et pré-profils — 8 septembre 2026

Le contrôle « Mode » dans la console host/régisseur propose Tournoi, Championnat et Open Mic. Le nombre de places et les votes Open Mic sont réglables. Une configuration remplace le programme seulement après confirmation ; un passage actif, son vote ou un artiste encore sur scène interdit ce changement. Les identités, accès, positions en coulisses et réglages de préparation sont conservés. La sélection est conservée dans la limite du nouveau nombre de places.

Le CTA principal pilote les moteurs existants. Le championnat cumule les victoires sans élimination ; l’Open Mic déroule ses artistes individuellement puis permet d’ouvrir et clore leurs votes. Les onglets deviennent Classement ou Programme, Passage et Vote selon le format. La vidéo et la pancarte continuent de lire le même runtime, conservé au rechargement des sessions de démonstration.

Les portraits des trois listes Invités (Attente, Coulisses, Scène) utilisent `ClassStudentPreProfile`, comme les autres rooms : ouverture de droite à gauche, fermeture avec Échap ou la croix et retour du focus au portrait. L’ouverture ne déplace pas le participant et ne navigue pas vers une autre page.

Le dépôt live utilise les RPC Cage `rooms_get_cage_state_v1` et `rooms_apply_cage_command_v1`, et `rooms_configure_cage_v1` pour changer le format. Il ne substitue plus de maquette à une erreur de contrat Cage réel. La nouvelle migration `20260908030000_rooms_cage_mode_controls.sql` conserve l’ancien runtime dans le journal serveur, protège la révision et l’idempotence et publie la nouvelle révision. Une parenthèse manquante du validateur de configuration dans la migration Cage initiale est également corrigée.

Validation locale : 23 tests de logique/composants réussis, avec parcours complets des trois formats et restauration de session ; build audio-lab réussi. `scripts/test-cage-mode-sql.mjs` exécute la migration dans PGlite avec présence/authentification de test et les vrais helpers de configuration/projection. Le contrôle TypeScript global conserve des erreurs déjà présentes sur main. Aucun navigateur ni test visuel utilisé pour cette tâche, conformément à la demande. Migrations non appliquées à Supabase distant ; livraison Realtime et média entre comptes réels non validée par ces tests.

## Résultats et montée Open Mic

La montée individuelle Open Mic utilise successivement les commandes de programmation, préparation et promotion avec leurs révisions courantes. Les portraits vidéo et la pancarte proviennent des participants du runtime, y compris lorsque le programme ne contient aucun duel. Le viewer utilise le programme et les votes Open Mic.

Voir les résultats ouvre un podium noir laqué avec portraits carrés identiques à la pancarte et classement restant. Un match affiche ses deux participants ; le classement final conserve les ex æquo. Publier au public partage le même tableau ; Retirer du public rétablit le panneau habituel. La commande ne transmet aucun score client et reste réservée au contrôle host/régie. La migration 20260908040000_rooms_cage_results_and_openmic.sql est nécessaire pour les sessions live. Elle est validée localement avec PGlite, mais non appliquée à Supabase distant. Aucun navigateur ni test visuel effectué.
