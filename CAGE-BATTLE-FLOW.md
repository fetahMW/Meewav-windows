# Open Mic Battle : sélection et progression

Base main 9103c9c71, aperçu de cette tâche sur 5184. La retouche blanche des boutons 16/8/4 est conservée dans ce travail.

Le bouton de placement héritait du quota obligatoire du tournoi : quatre inscrits pour une capacité de seize bloquaient la génération. Open Mic Battle utilise désormais le nombre réellement sélectionné, de deux à la capacité configurée, sans exemptions ni réduction manuelle du format. La capacité reste disponible pour ajuster la sélection avant de préparer le premier duel.

Participants affiche directement la sélection et les flèches de classement. Les invités de la file de démonstration sont sélectionnables dans ce panneau comme les inscriptions à la file réelle ; sélectionner ne valide ni les appareils ni les accords. Les règles des autres modes sont conservées.

La commande persistante guide la suite : Appliquer le placement, Préparer le premier duel, Monter les deux sur scène, Démarrer le duel, performances et vote, puis Monter le prochain challenger. Préparer le premier duel verrouille le placement et utilise la préparation existante, avec les invitations et accords habituels. Le gagnant reste sur scène, le perdant retourne au public ; seules les rencontres réelles sont affichées en régie Battle.

Validation ciblée : dix tests réussis (quatre nouveaux tests du parcours et six tests existants des modes). Les nouveaux tests couvrent la sélection directe, l’ordre choisi, quatre artistes sur seize places, une battle complète pilotée par le CTA avec trois gagnants successifs, les appareils non prêts et les règles du tournoi. Aucun contrôle visuel ni build complet.

La migration 20260908080000_rooms_cage_battle_roster_flow.sql porte les mêmes ajustements de génération/préparation côté serveur et conserve les contrôles de droits et de concurrence existants. Elle dépend de la migration Battle précédente et reste à appliquer sur Supabase distant. Les tests locaux ne certifient pas les invitations et médias entre comptes distants.

Compteur sur la vidéo : petite couronne blanche et nombre de duels gagnés, en bas à droite de chaque retour Battle, côté host et public. Calcul depuis les résultats enregistrés de la battle actuelle, conservé entre les challengers, absent avant la première victoire et dans les autres modes. Aucun compteur parallèle ni migration supplémentaire.

Validation du compteur : cinq tests ciblés réussis, dont une battle complète avec trois victoires du même artiste et le rendu de la couronne 3 sur son retour vidéo, ainsi que le changement de gagnant.

Fusion dans main et push GitHub explicitement autorisés le 8 septembre 2026 après ajout de la couronne. La version intégrée est disponible sur le port stable 5182 ; le worktree temporaire est retiré après publication.
