# Accueil du Tremplin — passerelle vers le Soutien MW

Date de validation : 5 août 2026
Branche : `task/tremplin`

Périmètre : accueil public du Tremplin, navigation associée et tests responsive. Aucun changement du backend financier, des Rooms, des règles de grade ou des assets de badges.

## Modèle produit retenu

Le Tremplin n’est pas le lecteur principal de MeeWav. Les usages sont désormais explicitement répartis ainsi :

- **Shorts** : créations et performances courtes ;
- **Rooms** : création, jeu et échanges en direct ;
- **Globe** : exploration d’artistes, de lieux et de scènes ;
- **profil artiste** : créations, projet, parcours, Rooms et grade ;
- **Tremplin** : retrouver un artiste déjà repéré, vérifier son projet, son grade et le statut de son jeton, puis ouvrir volontairement Soutien MW.

La hiérarchie de l’accueil est donc :

`artiste ciblé → projet → parcours → grade → statut du jeton → Soutien MW`

Un aperçu audio bref subsiste sur une seule sélection éditoriale. Il fournit du contexte, sans transformer l’accueil en catalogue d’écoute.

## Résultat livré

Le premier écran permet maintenant de :

1. rechercher un artiste par son nom ou le symbole de son jeton ;
2. ouvrir directement l’ancre `Soutien MW` de son profil ;
3. comprendre où découvrir ou écouter les artistes ailleurs dans MeeWav ;
4. consulter un projet à la une avec son grade et l’état réel de son jeton ;
5. distinguer immédiatement gratuité artistique et soutien MW payant et facultatif.

L’accueil ne déclenche aucun achat. Il donne accès à l’espace volontaire où les informations financières complètes sont présentées.

## Architecture de la page

1. **Entrée Tremplin** — recherche artiste ou jeton, liens vers Shorts, Rooms et Globe, projet éditorial avec accès MW.
2. **Accès rapides** — artistes suivis lorsqu’ils existent, fixtures illustrant les états MW sinon.
3. **À la une du Tremplin** — projets documentés, jamais classés par achats ou variation.
4. **Du profil au soutien MW** — retrouver, vérifier, ouvrir volontairement.
5. **Six grades** — lecture du parcours sans influence automatique sur le prix.
6. **Confiance et entrée artiste** — informations préalables, risques, demande artiste et retour vers les surfaces de découverte.

## Routes concernées

- `/tremplin` : accueil recentré sur l’accès MW.
- `/tremplin/decouvrir` : catalogue du Tremplin pour une recherche libre.
- `/tremplin/artistes/:artistId#profile-support` : destination d’une recherche exacte ou d’un CTA Soutien MW.
- `/tremplin/mes-artistes` : accès aux artistes déjà suivis.
- `/tremplin/comprendre` : fonctionnement complet.
- `/tremplin/comprendre#tremplin-grades` : explication des grades.
- `/tremplin/comprendre#tremplin-token-mw` : règles détaillées du jeton.
- `/shorts`, `/rooms`, `/globe` : surfaces explicites de découverte et d’écoute.

Le métier des Rooms n’a pas été modifié.

## Composants et fichiers

### Modifiés

- `TremplinPublicHome` : nouvelle architecture, recherche par nom ou symbole, états MW, projets éditoriaux et grades.
- `TremplinPage` : ouverture directe de `#profile-support`, accès à Mes artistes et navigation vers les piliers MeeWav.
- `tremplin-public-home-gateway.css` : composition premium, responsive et décalage sous le header fixe.
- tests unitaires, contrats statiques et scénarios Playwright de l’accueil.

### Réutilisés

- `MeewavGradeBadge` et les six badges existants ;
- `TremplinDemoBanner` ;
- `tremplinArtistData`, `tremplinProjectData` et `tremplinTokenData` ;
- les états de cycle de vie du jeton ;
- le lecteur audio piloté par `TremplinPage` pour l’unique aperçu facultatif ;
- le shell, la navigation MeeWav et le bandeau Tremplin.

## États du jeton sur l’accueil

- observation : aucun jeton disponible ;
- éligible : demande possible, activation non garantie ;
- vérification : aucun prix affiché ;
- lancement prochain : aucune opération disponible ;
- actif : valeur neutre et accès Soutien MW ;
- suspendu : statut consultable, aucune opération.

Le prix est affiché uniquement pour un jeton actif. Aucun graphique, variation, horizon court ou classement financier n’apparaît sur l’accueil.

## Densité à 1440 × 1000

Mesures Chromium sur le rendu réel :

| Zone | Hauteur |
|---|---:|
| Accueil complet avant la première densification | 6 491 px |
| Accueil complet actuel | 4 080 px |
| Réduction totale | −37,1 % |
| Entrée Tremplin | 861 px |
| Accès rapides | 497 px |
| À la une | 708 px |
| Fonctionnement | 416 px |
| Six grades | 612 px |
| Conclusion | 476 px |

La page est plus courte tout en explicitant mieux la fonction réelle du Tremplin.

## Responsive et accessibilité

La matrice automatisée couvre 320, 375, 768, 1024, 1280, 1440 et 1920 px.

- aucun débordement horizontal global ;
- aucun CTA tronqué ou ellipsé ;
- recherche accessible avec `combobox`, suggestions, flèches, Échap et sélection ;
- ouverture clavier d’un artiste via son symbole ;
- boutons essentiels d’au moins 44 px ;
- sections protégées du header fixe par `scroll-margin-top` ;
- six badges présents, focus visibles et sélection colorée selon chaque badge ;
- aucune section standard en `100vh` ;
- un seul aperçu audio, sans lecture automatique ;
- navigation explicite vers Shorts, Rooms et Globe.

## Validation

- `npm run typecheck`
- `npm run test:tremplin` — 48 tests
- `npx vitest run src/features/tremplin/TremplinPublicHome.test.tsx` — 8 tests
- `npx playwright test tests/e2e/tremplin-public-home-premium.spec.ts tests/e2e/tremplin-public-home-levels.spec.ts --workers=1` — 16 tests
- `npm run build`

## Captures de livraison

Dans `docs/tremplin/screenshots/desktop` et `docs/tremplin/screenshots/mobile` :

- `accueil.png`
- `accueil-acces.png`
- `accueil-projets.png`
- `accueil-fonctionnement.png`
- `accueil-grades.png`
- `accueil-conclusion.png`

## Limites et dépendances backend

- les profils, projets, états et valeurs visibles restent des fixtures de démonstration ;
- la sélection éditoriale doit être alimentée et planifiée côté serveur ;
- la recherche exacte utilise actuellement le catalogue local ;
- les artistes suivis proviennent de l’état local existant avant branchement backend ;
- les prix et statuts de production devront venir d’un service autoritaire ;
- aucun montant, calcul financier, statut, règle de grade ou comportement de Room n’a été modifié.

## Intégrité des badges

Les fichiers graphiques sources des six badges n’ont pas été modifiés. Seuls leur taille proportionnelle, leur espacement, leur focus, leur rail responsive et la couleur de sélection issue de leurs métadonnées sont utilisés.
