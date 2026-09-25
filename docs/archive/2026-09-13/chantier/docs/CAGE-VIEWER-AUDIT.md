# Cage viewer — audit et simulation

Base : main 89a34c699 (Wave et chat validés). Travail sur codex/cage-viewer-simulation.

Le host dispose de la sélection des invités, Green House, tirage, verrouillage, préparation des paires, passages, vote, incidents et qualification. Ces commandes ne doivent pas être exposées au public. Tournoi, championnat et open mic restent des mécaniques séparées.

La simulation viewer réutilise applyCageCompetitionCommand et 16 personnes du roster réel de démonstration. Elle manipule une copie locale indépendante : aucune commande ne touche la session host ni le backend. Elle génère 8 huitièmes, 4 quarts, 2 demi-finales et une finale. Départ uniquement au bouton Simulation dans le bandeau Cage viewer. La Wave ne possède plus ce bouton.

Par combat : passage simultané accéléré de 4 secondes, vote de 6 secondes, résultat affiché pendant 2 secondes avant la rencontre suivante. Le viewer peut voter une fois, consulter les résultats, voir le prochain duel et le tableau complet, mettre en pause et rejouer. Les voix du public sont explicitement fictives. La vidéo reste visible et n’est pas remplacée par le tableau ou le champion ; les sources vidéo de la room ne sont pas réaffectées par cette simulation locale de console.

Les vues officielles championnat et open mic ne sont pas modifiées. Les sondages partagés et les modifications Wave sont sur main. La migration de téléchargement Wave n’a pas été déployée sur Supabase.
