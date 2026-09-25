# Validation des villes existantes

Date : 2026-07-13

PR : 7 — migration des villes terminées

## Résultat

Un seul appel au convertisseur et au générateur produit le corpus commun de toutes les villes déjà présentes dans le dépôt :

```bash
npm run geo:build-zones -- --scope all --version 2026.1-existing-cities --minzoom 4 --maxzoom 14
```

| Territoire | Jeux convertis | Zones |
| --- | ---: | ---: |
| Paris / Grand Paris | 4 | 1 115 |
| Nice / métropole | 3 | 288 |
| Lyon / métropole | 3 | 569 |
| Nantes / métropole | 3 | 255 |
| Marseille / métropole | 3 | 588 |
| Lille / métropole | 3 | 613 |
| Trappes | 1 | 12 |
| **Total** | **20** | **3 440** |

Le frontend ne reçoit aucun nouvel identifiant territorial, aucune condition par ville et aucun layer supplémentaire.

## Archive commune

| Mesure | Résultat |
| --- | ---: |
| Music zones | 3 440 |
| Communes matérialisées | 440 |
| Tuiles | 4 429 |
| Taille | 21 100 352 octets |
| Plus grosse tuile | 245 939 octets |
| SHA-256 | `60928a09f74c05e89b2b86313ead9df06bed962b38c542c3a00be483dd455758` |

Le manifest reproductible est `geo/tilesets/2026.1-existing-cities.json`. L'artefact expérimental servi par Vite garde une URL stable avec un jeton de version `2026.1-existing-cities` pour invalider les caches de requêtes Range.

## Audit visuel

Chaque preset a été ouvert dans `national`, puis dans `legacy`, sur la même fenêtre et avec le même pitch. Les différences incluent les variations normales de labels et de rendu WebGL entre deux chargements froids.

| Ville | Zoom national | Zoom legacy | Delta RGB moyen / 255 | Pixels delta > 10 |
| --- | ---: | ---: | ---: | ---: |
| Nice | 11,49 | 11,57 | 2,716 | 5,410 % |
| Lyon | 12,70 | 12,70 | 3,339 | 3,161 % |
| Marseille | 11,80 | 11,80 | 2,816 | 3,612 % |
| Lille | 13,44 | 13,46 | 4,838 | 8,195 % |
| Nantes | 12,64 | 12,64 | 3,215 | 3,643 % |
| Trappes | 12,95 | 12,95 | 0,116 | 0,0015 % |

Les centres et le pitch des cinq presets sont identiques à la précision affichée, hors Nice où la capture nationale a été prise 0,08 niveau de zoom avant la fin du même ajustement terrain. Aucun territoire n'est absent, aucun sous-découpage n'est empilé sur la vue métropolitaine et les cours d'eau restent au-dessus des surfaces.

Captures :

- [planche legacy des cinq métropoles](visual-regression/existing-cities-pr7-legacy.jpg)
- [planche nationale des cinq métropoles](visual-regression/existing-cities-pr7-national.jpg)
- [différences amplifiées ×6](visual-regression/existing-cities-pr7-diff-x6.jpg)
- [Trappes legacy](visual-regression/trappes-pr7-legacy.jpg)
- [Trappes national](visual-regression/trappes-pr7-national.jpg)
- [différence Trappes amplifiée ×6](visual-regression/trappes-pr7-diff-x6.jpg)

## Trappes

La recherche France retourne `Trappes — Yvelines · Île-de-France — Commune`. Sa validation au clavier déclenche le fly à `zoom 12,95`, `pitch 60°`, centre `48.77380, 1.99639` en national et `48.77380, 1.99641` en legacy. Les 12 zones existantes sont rendues par le même source-layer `music_zones` que les autres villes.

## Barrières

```bash
npm run test:geo   # 20/20, dont conversion intégrale des 3 440 zones
npm run geo:audit  # baseline frontend inchangée
npm run build      # succès
```

Les bâtiments et le détail après sélection restent servis par l'adaptateur legacy jusqu'à la PR 10. Aucun dossier de bâtiments existant n'est supprimé.

## Retour arrière

Le rollback fonctionnel immédiat reste `VITE_GEO_PIPELINE_MODE=legacy`. Pour revenir au dernier état Paris-only :

```bash
git checkout f0a1826b
```
