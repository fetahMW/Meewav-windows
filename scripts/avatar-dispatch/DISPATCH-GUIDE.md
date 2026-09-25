# Dispatch des avatars Paris + Grand Paris

Ce script construit un plan deterministe pour les 200 000 lignes existantes de `public.mock_artists`.
Il ne cree aucun UUID, conserve les noms et instruments des 199 550 profils hors Charonne, ramene
`avatar_31` et `avatar_32` vers `avatar_1`, et distribue uniquement les 30 styles canoniques.

La cible est de 80 000 profils dans les 80 quartiers Paris et 120 000 dans les 904 sous-zones du Grand
Paris. `avatar_3` (Utilisatrice) et `avatar_4` (Utilisateur) ont chacun une cible globale de 20 000.

Seed par defaut:

```text
meewav-avatar-dispatch-paris-grand-paris-v1-2026-07-11
```

## Sources spatiales

- 80 quartiers: `src/features/globe/data/paris-quartiers.geojson`
- Paris: points adresse BAN fournis via `--paris-anchors` ou `PARIS_ANCHORS_PATH`
- 123 communes: `public/map/grand-paris-communes-overview.geojson`
- 904 sous-zones: `public/map/grand-paris-subzones.geojson`
- Grand Paris: ancres blue-noise de reference derivees directement des polygones de sous-zone

Chaque ancre Grand Paris passe deux controles PIP: sous-zone et commune officielle. Les points Paris
passent le PIP du quartier. Les coordonnees sont uniques a sept decimales. Deux ancres de reference par
sous-zone valident le contrat du loader; les positions publiques et privees finales sont ensuite generees
au quota exact par la meme loi blue-noise polygonale. Aucune empreinte de batiment ni aucun manifest de
batiments n'intervient dans le dispatch. Le depot ne fournit pas de masque hydrologique polygonal distinct.

Les quotas existants par quartier sont conserves depuis la base. Lors d'un recalcul, le Grand Paris est
d'abord reparti entre les 123 communes selon leur propriete officielle `population`, puis entre leurs
sous-zones selon leur surface polygonale. Le hash ne sert qu'aux egalites et aux ordres reproductibles.

Les lignes Paris recoivent `city=Paris` et `city_id=city_paris`. Les lignes Grand Paris recoivent
`city=Grand Paris` et leur commune parente canonique comme `city_id`. Toutes les lignes utilisent la feuille
canonique comme `district_id`, notamment `paris_20e_charonne` pour les 450 reservations Charonne.
Les clusters stockes sont recalcules avec les precisions historiques 18/35/75/160/420, les densites par
quartiles regionaux de profils par km2, et `avatar_url` utilise les assets reels `/avatar/web/carousel/*.webp`.

`lat/lng` et `public_display_lat/lng` portent la position publique du plan. `private_mock_lat/lng` est une
seconde position deterministe, distincte a sept decimales, unique globalement et PIP dans la meme feuille
(et la meme commune au Grand Paris). Le placement vise 70-330 m du public et refuse toute distance hors
de la tolerance historique stricte 45-650 m. Le rapport fournit min/mediane/p95/max et les ecarts a la
plage preferee. Charonne conserve exactement ses 450 positions publiques fixture; seules ses positions
privees DB sont derivees et restent invisibles au runtime fixture.

## Charonne

450 UUID sont reserves avec la seed fixe et associes un-a-un aux 450 mocks produits par
`charonneStressTest.js`. Pour ces lignes seulement, nom, slug, instrument, avatar, position et metadonnees
de zone reprennent exactement le fixture. `identity_seed` reste celui de la ligne DB. Les lignes sont marquees:

```text
anchor_type = charonne_stress_fixture
anchor_id   = <id stable du fixture>
```

Le serveur MVT doit exclure ces lignes DB avant d'injecter le fixture. Le script refuse `--apply` tant que
ce contrat runtime n'est pas detectable.

## Commandes

Dry-run, mode par defaut et sans ecriture DB:

```powershell
node scripts/avatar-dispatch/index.mjs --dry-run --allow-unverified-tls --paris-anchors=..\..\data\paris_anchors.json
```

Tests unitaires:

```powershell
node --test scripts/avatar-dispatch/test/*.test.mjs
```

Application transactionnelle explicite:

```powershell
node scripts/avatar-dispatch/index.mjs --apply `
  --expected-plan-hash=<assignmentPlanHash approuve> `
  --expected-project-ref=dqabekaqpznjsagoxzwc `
  --allow-unverified-tls `
  --paris-anchors=..\..\data\paris_anchors.json
```

`--apply` recharge et verrouille le snapshot, compare son empreinte au dry-run du processus, stage les
200 000 mises a jour dans une table temporaire, verifie tous les invariants puis effectue `COMMIT`.
Toute erreur avant tentative de `COMMIT` provoque `ROLLBACK`. Si la reponse de `COMMIT` est perdue, une
nouvelle connexion compare le hash reel de la table avant d'annoncer l'etat. Aucun chemin d'application
n'est active par defaut et `--expected-plan-hash` doit venir du dry-run approuve, pas du recalcul implicite.

Avant d'ouvrir la transaction, `--apply` cree dans `backups/` un snapshot `jsonl.gz` des UUID et de toutes
les anciennes valeurs modifiees. Le fichier est relu integralement, son nombre de lignes est verifie et son
SHA-256 compresse et le fingerprint du contenu decompresse sont verifies. La transaction est refusee si
cette sauvegarde echoue. `--backup-dir=<path>` permet de
choisir un autre emplacement; les sauvegardes locales par defaut sont ignorees par Git.

Restauration explicite du backup, elle aussi transactionnelle:

```powershell
node scripts/avatar-dispatch/index.mjs `
  --restore=<backup.jsonl.gz> `
  --restore-sha256=<sha256 compresse> `
  --expected-current-plan-hash=<hash actuellement applique> `
  --expected-project-ref=dqabekaqpznjsagoxzwc `
  --allow-unverified-tls
```

La restauration refuse d'ecraser une table dont le plan courant differe du hash attendu. Elle compare
ensuite le staging et la table champ par champ, puis revalide le fingerprint du backup via une nouvelle
connexion apres `COMMIT`.

`--env=<path>` est prioritaire sur le process et doit contenir une cible DB non ambigue. Les operations en
ecriture exigent la reference projet explicite. TLS verifie est le defaut; l'instance Supabase actuelle
presente une chaine auto-signee, donc l'exception `--allow-unverified-tls` doit etre ecrite explicitement.
La sortie ne montre que host, database, project ref et mode TLS.

Les rapports sont ecrits dans `reports/dry-run-<empreinte>/`: `report.json`, `report.md`, `zones.csv`,
`communes.csv` et `styles.csv`. Aucun mapping ligne-par-ligne de 200 000 profils n'est persiste sur disque.
Le rapport contient aussi `assignmentPlanHash`, SHA-256 du schema de staging et des 200 000 affectations
triees par UUID. `--apply` recalcule cette empreinte dans la transaction, immediatement avant les INSERT,
et refuse toute divergence avec le plan rapporte.
`apply-result.json` est ecrit atomiquement avec un statut `committed_*`. Une erreur fichier post-COMMIT
affiche explicitement que la commande ne doit pas etre relancee sans audit.
