# Modes runtime du pipeline géographique

Date : 2026-07-13

PR : 5 — intégration MapLibre derrière feature flag

## Résultat

Le prototype national peut être chargé par la carte sans remplacer ni supprimer le système historique. Le mode par défaut reste `legacy`. Une configuration absente ou invalide retombe systématiquement sur ce mode sûr.

```bash
VITE_GEO_PIPELINE_MODE=legacy
VITE_GEO_PIPELINE_MODE=national
VITE_GEO_PIPELINE_MODE=comparison
```

L'ancien booléen `VITE_USE_NATIONAL_GEO_PIPELINE=true` reste reconnu et active `national`. En développement uniquement, le paramètre `?geoPipeline=legacy|national|comparison` permet une comparaison sans reconstruire le frontend :

```text
/globe?geoPipeline=legacy
/globe?geoPipeline=national
/globe?geoPipeline=comparison
```

## Contrat MapLibre fixe

Une seule source vectorielle est installée :

```text
meewav-national-zones
```

Elle lit l'artefact PMTiles versionné `public/map/national/2026.1-prototype/france-zones.pmtiles` et promeut `zone_id` comme identifiant de feature pour les quatre source-layers. Depuis la PR 7, cet artefact contient les 3 440 zones des villes existantes et son URL porte le jeton de cache `2026.1-existing-cities`.

Le runtime crée exactement cinq layers, indépendamment de la ville :

```text
music-zones-fill
music-zones-outline
music-zones-hitarea
music-zones-extrusion
music-zones-label
```

Le survol, la sélection et le dimming utilisent exclusivement les états `hovered`, `selected` et `dimmed`. Aucun layer n'est créé lors d'un clic.

## Sémantique des modes

- `legacy` : aucune source nationale n'est installée ; le comportement de production est inchangé.
- `national` : la source PMTiles et les cinq layers génériques sont visibles et interactifs.
- `comparison` : le legacy reste la référence visible ; les layers nationaux sont masqués, à l'exception d'une sonde de fill pratiquement transparente nécessaire au diagnostic de chargement.

Le conteneur MapLibre expose uniquement des compteurs de diagnostic dans ses attributs `data-geo-*`. Le rapport rapproche `legacy_zone_id` et les identifiants actuellement rendus, sans introduire de dépendance permanente entre le futur référentiel et les anciens IDs.

## Vérification visuelle du 13 juillet 2026

Le contrôle a été effectué sur trois chargements froids distincts de `/globe` :

| Mode | Résultat observé |
| --- | --- |
| `legacy` | Carte, host, avatars, navigation et interactions inchangés ; aucune source nationale chargée. |
| `comparison` | Image identique au legacy ; 9 zones nationales chargées dans la fenêtre, 41 IDs legacy détectés et 1 correspondance directe sur le cadrage initial. |
| `national` | 9 zones chargées ; label Charonne visible ; survol et clic modifient bien le `feature-state` et l'extrusion sans masquer le host ni les avatars. |

Après correction de l'opacité d'extrusion, aucun nouveau message d'erreur MapLibre n'apparaît sur un chargement froid. L'avertissement Supabase relatif à la clé locale absente est antérieur et hors périmètre cartographique.

Ces observations valident le branchement technique, pas encore la parité visuelle de Paris. Les couleurs, hauteurs, transitions, caméra, sélection legacy et bâtiments restent le périmètre de la PR 6.

## Reproduction

```bash
npm run geo:build-zones -- --scope paris --version 2026.1-paris-prototype --minzoom 4 --maxzoom 14
npm run test:geo
npm run geo:audit
npm run build
```

## Retour arrière

Le rollback immédiat consiste à retirer `VITE_GEO_PIPELINE_MODE` ou à le remettre à `legacy`. Aucun fichier du système historique n'a été supprimé ou remplacé. Pour revenir au commit précédant l'intégration runtime :

```bash
git checkout 53be7d00
```

Le point stable complet reste également disponible via :

```bash
git checkout backup-before-national-geo-pipeline
```
