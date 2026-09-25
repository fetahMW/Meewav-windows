# Rapport d'acceptation — pipeline géographique national

Date : 2026-07-13

Branche : `test/national-geo-pipeline`

Point stable : tag `backup-before-national-geo-pipeline` (`b10f4041`)

Dernier commit fonctionnel audité : `cddab2ca`

## Décision

Les lots PR 1 à PR 10 de l'architecture expérimentale sont implémentés, versionnés et reproductibles. Le système historique reste le mode par défaut et aucun GeoJSON, bâtiment, script ou comportement legacy n'a été supprimé.

La PR 11 n'est volontairement pas exécutée. La fusion dans `main`, la suppression du legacy et l'activation nationale en production restent interdites tant que le propriétaire produit n'a pas validé explicitement les captures, les performances sur l'infrastructure cible et le corpus France officiel.

## Périmètre livré

| Capacité | Résultat vérifié |
| --- | --- |
| Référentiel canonique | `AdministrativeZone`, `MusicZone`, versions de dataset, UUID stables et traçabilité source |
| Corpus existant | 20 jeux convertis, 3 440 zones, Paris/Grand Paris, Nice, Lyon, Nantes, Marseille, Lille et Trappes |
| Tuiles de zones | Une archive PMTiles v3 de 21 100 352 octets, 4 429 tuiles, SHA-256 `60928a09f74c05e89b2b86313ead9df06bed962b38c542c3a00be483dd455758` |
| Runtime MapLibre | Une source générique, quatre source-layers et exactement cinq layers fixes |
| Modes | `legacy`, `national`, `comparison`; valeur absente, invalide ou erreur de chargement → `legacy` |
| Sélection | `zone_id` stable promu dans MapLibre, états `hovered`, `selected`, `dimmed` via `feature-state` |
| Recherche | Index data-driven ; l'interface transmet uniquement le `zoneId` stable au pipeline |
| Caméra | `bbox` et `labelPoint` par défaut, `cameraOverride` optionnel stocké dans les données |
| API point → zone | Résolution PostGIS, fallback commune et aucune coordonnée précise renvoyée au client |
| Bâtiments | Registre générique : 14 archives, 3 000 zones, 2 361 803 bâtiments, aucun mapping ou fichier manquant |
| Import et publication | Import transactionnel PostGIS, releases candidates immuables, hashes contrôlés, activation séparée |
| Curation | Renommage, alias, fusion et caméra par fichiers d'overrides, sans modification frontend |

## Matrice d'acceptation

| Gate demandé | État | Preuve ou réserve |
| --- | --- | --- |
| Travail isolé de `main` | PASS | Branche dédiée et tag stable créés avant la migration |
| Aucun commit direct sur `main` | PASS | Les douze commits sont sur `test/national-geo-pipeline` |
| Legacy intact et réactivable immédiatement | PASS | Mode par défaut `legacy`; aucun asset historique supprimé |
| Paris sans régression technique importante | PASS technique | Delta moyen 2,008/255 en vue d'ensemble; validation produit explicite encore requise |
| Communes autour de Paris | PASS technique | 123 communes et 904 sous-zones converties; clic/fly et bâtiments conservés via l'adaptateur |
| Villes déjà réalisées | PASS technique | Nice, Lyon, Marseille, Lille, Nantes et Trappes vérifiées dans le navigateur |
| Extrusions et sélection | PASS technique | Cinq layers fixes, `feature-state`, adaptateur de transition testé |
| Bâtiments présents | PASS technique | Inventaire complet et capture de bâtiments extrudés; sources legacy conservées |
| Recherche et caméra | PASS technique | « Centre Ouest · Trappes · Quartier » arrive à `48.77477, 1.99904`, zoom `15.70` |
| Points lumineux et fly existants | PASS non-régression | Le chemin legacy demeure inchangé; Trappes et les presets existants ont été rejoués |
| Aucun ajout territorial dans React | PASS | Audit inchangé à 1 744 signaux historiques; le gate interdit toute hausse |
| Ajout d'une ville sans nouveau layer/preset/commande | PASS sur le corpus existant | Un convertisseur et une commande paramétrée produisent le corpus commun |
| Performances au moins équivalentes en production | À VALIDER | Les tests locaux sont verts; les mesures réseau/CDN et appareil mobile réel ne peuvent pas être simulées ici |
| France entière | NON ACTIVÉE | L'input national officiel, licencié et validé n'est pas présent; le pipeline refuse de prétendre une couverture nationale sans cet input |
| PostGIS d'environnement | À VALIDER | SQL et tests unitaires fournis; 3 tests live sont ignorés faute d'URL de base live |
| Suppression du legacy | INTERDITE | Nécessite la validation produit explicite prévue par la consigne de sécurité |

## Résultats de la dernière barrière

Commandes exécutées sur `cddab2ca` :

```bash
npm run build
npm run test:geo
npm test --prefix server/mvt-tile-server
npm run geo:audit
```

Résultats :

- build Vite : succès, 1 909 modules transformés en 7,06 s ;
- tests géographiques : 32/32 réussis en 9,18 s ;
- tests serveur : 23 réussis, 0 échec, 3 tests live ignorés ;
- audit frontend : 88 fichiers, 1 744 signaux de couplage, baseline inchangée ;
- contrôle Git : aucun espace ou patch invalide dans le commit ;
- console navigateur : aucune nouvelle erreur recherche, PMTiles, MapLibre ou bâtiments ; seul l'avertissement local de clé Supabase absente subsiste.

Le warning Vite sur la taille du bundle existant reste visible. Il ne provient pas d'une régression bloquante du pipeline, mais devra être traité dans un chantier de découpage du bundle distinct.

## Preuves visuelles

- [Paris legacy](visual-regression/paris-pr6-legacy.jpg)
- [Paris national](visual-regression/paris-pr6-national.jpg)
- [Différence Paris amplifiée ×6](visual-regression/paris-pr6-diff-x6.jpg)
- [Commune Paris legacy](visual-regression/paris-pr6-commune-legacy.jpg)
- [Commune Paris national](visual-regression/paris-pr6-commune-national.jpg)
- [Villes existantes legacy](visual-regression/existing-cities-pr7-legacy.jpg)
- [Villes existantes national](visual-regression/existing-cities-pr7-national.jpg)
- [Trappes legacy](visual-regression/trappes-pr7-legacy.jpg)
- [Trappes national](visual-regression/trappes-pr7-national.jpg)
- [Bâtiments génériques](visual-regression/generic-buildings-pr10.jpg)
- [Suggestion nationale Centre Ouest](visual-regression/national-search-suggestion-pr10b.jpg)
- [Arrivée nationale Centre Ouest](visual-regression/national-search-trappes-pr10b.jpg)

## Historique réversible

| Lot | Commit |
| --- | --- |
| PR 1 — audit et plan | `c15cbbc6` |
| PR 2 — schémas et validateurs | `5c4d9c8b` |
| PR 3 — conversion des villes existantes | `59224ab4` |
| PR 4 — PMTiles générique | `53be7d00` |
| PR 5 — modes runtime | `a1dcc5e4` |
| PR 6 — parité Paris | `f0a1826b` |
| PR 7 — villes terminées | `b300bb85` |
| PR 8 — recherche et API point → zone | `7a4c7c4e` |
| PR 9 — import et releases | `a03f5e60` |
| PR 10 — bâtiments génériques | `efd1df05` |
| Outil de curation | `e9af900b` |
| Raccordement final recherche/runtime | `cddab2ca` |

Chaque lot peut être annulé séparément. Aucun commit ne regroupe toute la migration.

## Retour arrière sans reconstruction

Rollback fonctionnel immédiat :

```bash
VITE_GEO_PIPELINE_MODE=legacy
```

Retour à la branche stable :

```bash
git checkout main
```

Retour exact au point sauvegardé :

```bash
git checkout backup-before-national-geo-pipeline
```

La procédure détaillée se trouve dans [rollback.md](rollback.md).

## Actions encore nécessaires avant production

1. Fournir le corpus officiel France, ses licences, ses millésimes et ses métadonnées de provenance.
2. Exécuter l'import et les trois tests live sur une instance PostGIS de validation.
3. Publier les PMTiles et manifests candidats sur le CDN de préproduction.
4. Mesurer chargement, mémoire, interactions et réseau sur desktop et mobile réels.
5. Faire valider explicitement par le propriétaire produit Paris, les communes voisines, les villes terminées, les extrusions, les bâtiments, les fly et le rollback.
6. Seulement après ces validations, décider de la fusion dans `main`; la suppression du legacy doit rester une PR séparée.

Tant que ces six points ne sont pas validés, le chantier expérimental doit rester sur sa branche, avec `legacy` comme valeur par défaut.
