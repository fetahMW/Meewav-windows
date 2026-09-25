# Procédure de rollback du pipeline géographique national

Date : 2026-07-13

Point stable : `backup-before-national-geo-pipeline`

Commit stable : `b10f4041`

## Garantie actuelle

Le chantier expérimental est isolé sur :

```text
test/national-geo-pipeline
```

Le tag suivant pointe sur l'état fonctionnel exact qui précède le chantier :

```text
backup-before-national-geo-pipeline
```

Le système cartographique legacy, tous ses GeoJSON, scripts, manifests et bâtiments sont encore présents. La PR 1 ne modifie aucun fichier runtime.

## Attention concernant `main`

Au moment de créer le point de sauvegarde :

- la branche locale `main` pointait sur `14bc2700` ;
- elle était en retard de 79 commits sur `origin/main` ;
- l'état produit courant et `origin/main` avaient divergé de 6 commits d'un côté et 134 de l'autre ;
- l'état stable réellement affiché par `/globe` pointait sur `b10f4041`.

`git checkout main` quitte bien l'expérimentation, mais ne restaure pas le golden master courant. Pour revenir exactement à l'état validé avant le chantier, utiliser le tag de sauvegarde ou la branche stable d'origine.

## Retour immédiat à la branche stable d'origine

```bash
git switch codex/isolate-canonical-map-3094f17c
```

Vérifier :

```bash
git rev-parse --short HEAD
git status --short --branch
```

Le premier résultat attendu est `b10f4041` tant que la branche stable n'a pas reçu de nouveau commit.

## Retour exact au tag immuable

Pour inspecter ou lancer l'état sauvegardé sans déplacer une branche :

```bash
git switch --detach backup-before-national-geo-pipeline
```

Pour reprendre du travail depuis ce point :

```bash
git switch -c recovery/national-geo-pipeline backup-before-national-geo-pipeline
```

Cette procédure ne reconstruit aucun fichier manuellement.

## Retour sur `main`

Si le but est uniquement de quitter la branche expérimentale et de revenir à la branche principale locale :

```bash
git switch main
```

Ne pas lancer automatiquement `git pull`, `git merge` ou `git rebase` après ce changement tant que la divergence n'a pas été réconciliée explicitement.

## Rollback runtime après introduction du feature flag

À partir de la PR 5, la réponse opérationnelle de premier niveau sera :

```env
VITE_GEO_PIPELINE_MODE=legacy
```

Puis reconstruire/redéployer le frontend avec cette configuration. Les règles obligatoires sont :

- `legacy` est la valeur par défaut ;
- une valeur invalide retombe sur `legacy` ;
- un échec PMTiles/API retombe sur `legacy` pendant l'expérimentation ;
- aucun retrait d'asset legacy avant validation complète ;
- le mode peut être vérifié dans les diagnostics sans exposer de donnée privée.

## Rollback d'une PR ou d'un commit

Chaque étape importante doit être un commit autonome. Pour annuler un commit déjà partagé, utiliser un revert non destructif :

```bash
git revert <commit>
```

Pour tester l'état juste avant un commit sans modifier l'historique :

```bash
git switch --detach <commit-parent>
```

Les données générées, le code runtime et les tests doivent rester dans des commits distincts afin que leur rollback puisse être ciblé.

## Checklist avant tout changement risqué

1. Confirmer la branche : `git branch --show-current`.
2. Confirmer qu'elle commence par `test/` ou une branche de PR dédiée.
3. Vérifier que le dernier commit passe `npm run build`.
4. Vérifier le mode legacy sur `/globe`.
5. Créer un commit de sauvegarde clair.
6. Noter le hash dans le document de migration concerné.
7. Ne modifier que la nouvelle architecture ou son adapter.
8. Exécuter tests, métriques et captures après modification.
9. Tester `VITE_GEO_PIPELINE_MODE=legacy` après la modification.
10. Documenter la commande de rollback dans la PR.

## Conditions imposant le rollback

Revenir au commit précédent ou au mode legacy si un des cas suivants apparaît :

- Paris perd un quartier, un label, une extrusion ou un bâtiment ;
- la recherche ou le fly ne retombe pas sur la même zone ;
- une zone utilisateur change d'ID sans mapping ;
- des tuiles nationales bloquent le chargement initial ;
- le mode legacy ne peut plus être activé seul ;
- les performances dépassent les budgets de la baseline ;
- le mode national exige une modification frontend pour ajouter une commune ;
- une publication écrase une version de dataset existante ;
- une position exacte apparaît dans une réponse publique.

## Validation du rollback avant fusion

Avant chaque fusion de PR fonctionnelle :

1. lancer le mode national ;
2. collecter les preuves de test ;
3. basculer sur `legacy` sans modifier le code ;
4. relancer les scénarios Paris ;
5. simuler une erreur PMTiles/API ;
6. vérifier le fallback ;
7. revenir au commit précédent par branche ou tag dans un worktree de test ;
8. confirmer que `/globe` fonctionne sans reconstruction manuelle.

La suppression du legacy en PR 11 reste interdite sans validation explicite du propriétaire produit, même si les PR précédentes sont techniquement vertes.
