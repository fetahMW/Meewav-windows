# Audit Cage — capacité et parcours complets

## Blocage signalé : 16 artistes obligatoires

Le programme exigeait la capacité configurée (16 par défaut) pour créer un tournoi ou un championnat. Le changement de capacité était caché dans Mode ; l'autre option de réduction dépendait d'un règlement désactivé par défaut.

Correction dans la préparation :

- Nombre d'artistes visible directement au-dessus de la liste, avant création du tableau.
- Les tailles inférieures à la sélection en cours sont désactivées pour ne pas retirer des artistes silencieusement.
- Avec une sélection compatible de taille inférieure, l'action principale propose « Adapter à N artistes ». Elle réutilise le contrat existant `competition.configure` et conserve exactement les artistes cochés et leur ordre. L'action suivante crée le tableau ou le calendrier.
- Fonctionne pour une session déjà enregistrée à 16 ; pas de recréation de room.
- Les tailles non puissances de deux restent dépendantes des exemptions prévues au règlement du tournoi. Les championnats peuvent utiliser tout effectif de 2 à 64.
- L'ancienne réduction tournoi de 6 vers 4 (ou 14 vers 8) est désactivée dans l'interface pour éviter de perdre des sélectionnés.

Vérifications initiales : 23 tests réussis dans `cagePreparation.test.tsx`, `cageModeControls.test.tsx`, `cageBattleFlow.test.tsx`, dont adaptation tournoi 16 vers 2/4/8, championnat à 6, conservation intégrale des artistes et création/verrouillage du tableau.

L'audit Luna vérifie les quatre modes avec tests de composants et commandes métier isolés, sans piloter l'application Electron de l'utilisateur. Le contrôle visuel et une session multi-appareils réelle ne sont pas revendiqués.
