# Cage viewer — réactions dans le chat

Les réactions occupent désormais une ligne compacte dans l'en-tête Discussion : Like et compteur, Golden Like et compteur, soutien séparé. La colonne encadrée de 58 px est supprimée pour la Cage ; les messages utilisent toute la largeur. Les nombres visibles sont abrégés, les libellés accessibles gardent les valeurs complètes. Les confirmations de Golden Like, restrictions et actions de soutien restent celles des composants partagés.

Vérifications :

- `npm run build` : réussi.
- Tests Chat et RoomGoldenLikeReactions : réussis.
- Test ciblé des interactions viewer Place/Cage : 2 réussis.
- Suite complète des actions : 6 échecs existants sur le scénario Host « Désépingler » (la fixture ne contient aucun message épinglé). Aucun échec des actions viewer.
- `git diff --check` : réussi.
- Rendu Electron non contrôlé : l'utilisateur a demandé de ne pas manipuler son ordinateur.

La transposition de la prod Cage est un travail distinct, confirmé par l'utilisateur après examen de `sipiyou39/Meewav`, branche `rooms-goal`, commit `cd2d40d75c6521f193be2f3c35c62ceef5233e21`.
