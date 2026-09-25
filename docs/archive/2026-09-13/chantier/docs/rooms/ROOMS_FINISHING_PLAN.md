# Finition Rooms — accueil, accès viewer et Green House

Implémentation et vérifications réalisées. Le détail des parcours, de l’audit des six lancements et des limites serveur figure dans [ROOMS_LAUNCH_AUDIT.md](ROOMS_LAUNCH_AUDIT.md).

## Ordre d’implémentation

1. Enregistrer les finitions host, intégrer les changements de main et fusionner sans écraser les travaux Wave.
2. Séparer découverte et sessions : les onglets filtrent un catalogue France ; une carte ouvre une session viewer ; les liens host explicites restent utilisables.
3. Compléter les six murs avec plusieurs rails, des artistes et des formats variés, des états vides utiles, puis affiner la matière des cartes sans sacrifier leur lisibilité.
4. Insérer Green House entre Attente et Coulisses. L’invité accepte, vérifie sa caméra, son micro et sa connexion en privé, puis confirme sa préparation. Le host ne peut pas contourner cette étape. Les simulations doivent être identifiées et respecter les mêmes transitions.
5. Auditer les options propres aux six lancements ; réutiliser le séquenceur Cage, compléter les cinq autres et transmettre leur configuration à la session host.
6. Vérifier les transitions et les restrictions de rôle, les filtres, les rails et les formats. Capturer l’accueil, chaque catégorie, le lancement et la préparation en grand écran et sur écran étroit ; corriger les débordements et les défauts visuels.
7. Livrer les résultats vérifiés et leurs limites, commit et push.

## Critères de réception

- Les six onglets de découverte restent sur les murs ; aucun clic de carte ne donne les commandes host.
- Catalogue de présentation varié, français, explicitement simulé ; aucun chiffre présenté comme une audience de production réelle.
- Retour au mur d’origine après une session ; recherche, format et collections restent utilisables.
- Aucun invité non prêt ne rejoint les coulisses. Les permissions refusées, la perte de connexion et les pistes interrompues empêchent la validation.
- La Green House ne publie pas l’aperçu privé. Les périphériques sont libérés à sa fermeture.
- La configuration de lancement est conservée, propre à chaque room et relisible avant l’ouverture.
- Pas de modification des autres worktrees ni de déploiement serveur implicite.
