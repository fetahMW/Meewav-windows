# Accueil du Tremplin — audit de refactor UX/UI 2026

Date : 6 août 2026

## Positionnement vérifié

MeeWav possède déjà les surfaces artistiques suivantes :

- `/shorts` pour les créations et performances courtes ;
- `/rooms` pour le direct, la création et les échanges ;
- `/globe` pour l’exploration d’artistes, de lieux et de scènes ;
- les profils pour les créations, le projet, le parcours, les Rooms et le grade.

Le rôle propre de `/tremplin` est de retrouver un artiste déjà rencontré, consulter son projet et les éléments vérifiés par MeeWav, comprendre son grade, connaître l’état de son jeton et ouvrir volontairement son espace de jeton de talent.

## Stack et architecture existantes

- React 19, TypeScript, React Router et Vite.
- Shell, routes, lecteur audio et état de suivi : `TremplinPage.tsx`.
- Accueil public : `TremplinPublicHome.tsx`.
- Catalogue du Tremplin : `TremplinHomeExperience.tsx`.
- Cycle de vie du jeton : `tremplinProductModel.ts`.
- Artistes, projets et jetons de démonstration : `tremplinArtistData.ts`, `tremplinProjectData.ts`, `tremplinTokenData.ts`.
- Feature flags : `tremplinFeatureFlags.ts`, avec `demoMode: true` et transactions API désactivées.
- Analytics frontend : `tremplinAnalytics.ts`.
- Styles : feuilles Tremplin dédiées ; la nouvelle home utilise des classes `tremplin-gateway__*` isolées.
- Badges : `MeewavGradeBadge` et assets de grades existants.

Le serveur devra rester la source de vérité du statut, du prix, des frais, de la part artiste, de l’éligibilité et de toute opération. Cette tâche ne modifie aucun calcul financier.

## Audit de la version avant refactor

### Composants conservés

- le champ de recherche accessible par nom et ticker ;
- le panneau contextuel projet / grade / état MW ;
- le mapping du cycle de vie existant ;
- la section « Des projets, pas un classement » ;
- le parcours « retrouver → consulter le parcours → voir le jeton de talent » ;
- la carte de transparence avant opération ;
- l’entrée artiste contextuelle ;
- la passerelle vers Shorts, Rooms et Globe ;
- la section des six grades, entièrement verrouillée.

### Duplications à supprimer

- la section « Retrouve rapidement un artiste » répète la recherche, les artistes, les statuts et les CTA du hero ;
- le même artiste éditorial apparaît dans le hero, les accès de démonstration et les projets à la une ;
- l’accès aux trois piliers est présenté dans le hero puis dans la conclusion ;
- plusieurs CTA « Ouvrir Soutien MW », « Voir le statut MW » et « Comprendre ce statut » se répètent avant que l’utilisateur ait choisi un résultat.

### Composants à fusionner ou simplifier

- `TokenStatus` doit consommer un dictionnaire de statuts centralisé ;
- le résultat du hero doit devenir contextuel à la recherche au lieu de rester une publicité statique ;
- les trois étapes doivent devenir un stepper partagé, sans trois grandes cartes indépendantes ;
- la passerelle vers Shorts, Rooms et Globe doit rester uniquement en fin de page ;
- les projets mobiles doivent devenir un rail avec snap.

### Composants à retirer de l’accueil visiteur

- la section d’accès rapide remplie de fixtures quand aucun historique réel n’existe ;
- la répétition des liens de découverte dans le hero ;
- le prix placé au même niveau visuel que le projet.

## Données encore simulées

- artistes, médias, villes, projets et étapes ;
- états et valeurs des jetons ;
- sélection éditoriale et rotation ;
- historique récent ;
- suivi et personnalisation ;
- statut du visiteur / artiste ;
- règles transactionnelles visibles dans les tunnels.

Les fixtures restent identifiées dans le code et la documentation. Dans l’interface publique, seul un indicateur discret réservé au développement les signale ; aucun grand bandeau ne consomme la page et l’indicateur est absent du build de production.

## Plan de migration

1. Centraliser les libellés, helpers, CTA, `showPrice` et `allowSupport` des six états.
2. Transformer le hero en résolveur : recherche dès deux caractères, tolérance simple aux fautes, sélection au clavier et panneau mis à jour sans navigation immédiate.
3. Utiliser une sélection éditoriale rotative par défaut, indépendante de tout signal financier.
4. Masquer complètement les accès récents pour le visiteur sans historique.
5. Mettre le projet avant le prix dans les cartes éditoriales et adapter le CTA à l’état.
6. Compacter le parcours en trois étapes dans une surface unique.
7. Ne modifier ni le JSX, ni les styles, ni les assets de la section des grades.
8. Conserver la transparence et contextualiser l’entrée artiste.
9. Réduire la passerelle finale vers l’écosystème.
10. Ajouter analytics, tests unitaires, intégration, E2E, captures et documentation finale.

## Différences desktop / mobile attendues

- Desktop : hero en deux colonnes, quatre projets, stepper horizontal.
- Tablette : hero empilé, projets en deux colonnes.
- Mobile : titre, recherche, résultat contextuel, rail de projets avec snap, stepper vertical compact.
- Aucune scrollbar horizontale globale ; aucune action tronquée ; cibles de 44 px minimum.

## Risques de régression

- ouverture trop précoce du profil lors de la sélection d’une suggestion ;
- prix visible pour un état non actif ;
- réapparition des fixtures d’accès rapide chez un visiteur ;
- styles génériques affectant la section verrouillée des grades ;
- ancre `#profile-support` masquée par le header fixe ;
- CTA transactionnel remplacé par le langage émotionnel « donner de la force » ;
- navigation mobile ou cartes projet débordant horizontalement.

## Règle de langage

- émotion : « Donner de la force au projet de… », avec explication immédiate de l’achat ;
- produit : « Soutien MW » pour l’espace, les statuts et l’accès ;
- transaction : « Acheter / Revendre des jetons » avec montants exacts dans les tunnels, reçus et historiques.

« Force » ne devient ni un score, ni une quantité, ni une variation, ni un libellé de confirmation transactionnelle.

## Implémentation livrée

### Routes concernées

- `/tremplin` : accueil recentré sur la recherche et la vérification d’un parcours ;
- `/tremplin/decouvrir` : destination des recherches libres et de « Voir tous les projets » ;
- `/tremplin/artistes/:artistId` : parcours de l’artiste ;
- `/tremplin/artistes/:artistId#profile-support` : état ou espace Soutien MW ouvert volontairement ;
- `/shorts`, `/rooms`, `/globe` : passerelle finale compacte, sans duplication dans le hero.

### Composants conservés

- shell, navigation latérale et bandeau du Tremplin ;
- `MeewavGradeBadge` et l’intégralité de la section des six grades ;
- lecteur de préécoute global existant ;
- données projet et cycle de vie existants ;
- cartes finales de transparence et d’entrée artiste.

### Composants corrigés ou consolidés

- le hero devient un resolver artiste/ticker avec aperçu contextuel ;
- `TokenStatus` consomme `TREMPLIN_HOME_TOKEN_STATUS_UI`, dictionnaire unique des six états ;
- l’ancien accès rapide rempli de fixtures disparaît pour le visiteur ;
- les vrais artistes suivis peuvent devenir « Tes accès récents » pour un membre ;
- les projets éditoriaux excluent l’artiste déjà affiché dans le resolver ;
- le parcours profil → Soutien MW devient un stepper compact ;
- la passerelle vers les autres piliers n’existe plus qu’en conclusion.

### Composants retirés ou fusionnés

- retrait de la publicité statique permanente pour un même artiste ;
- retrait des faux « accès de démonstration » lorsque l’historique est vide ;
- retrait des liens Shorts/Rooms/Globe dans le hero ;
- retrait de tout prix pour un état autre que `active` ;
- fusion des libellés de statut, helpers et CTA dans un seul mapping.

## Dictionnaire de microcopy et invariants

Le mapping `tremplinHomeTokenStatus.ts` fournit pour chaque état : libellé, aide, action, visibilité du prix et autorisation d’ouverture de Soutien MW.

- expression émotionnelle autorisée : « Donner de la force au projet de [artiste] » ;
- explication obligatoire à proximité : « En achetant des jetons [ticker]. L’achat est payant, facultatif et comporte un risque de perte. » ;
- nom produit : « Soutien MW » ;
- langage transactionnel obligatoire dans les tunnels et reçus : « Acheter des jetons », « Revendre des jetons », montant, frais, part artiste et montant net ;
- « Donner de la force » n’est jamais un libellé de confirmation, un montant, un score ou une unité économique.

## Résultats mesurés à 1440 px

Mesures Playwright, viewport 1440 × 1000 :

| Zone | Baseline initial | Après cette passe |
| --- | ---: | ---: |
| Page complète | 6 491 px | 3 296 px |
| Hero | non isolé dans le baseline | 664 px |
| Projets à la une | non isolé dans le baseline | 708 px |
| Parcours compact | objectif précédent inférieur à 460 px | 366 px |
| Grades | section validée | 612 px |
| Conclusion | non isolée dans le baseline | 508 px |

La page est environ 49 % plus courte que le baseline initial, sans `100vh`, sans débordement global et sans CTA tronqué.

## Tests et captures

- TypeScript et build Vite de production ;
- tests React du resolver, de la recherche, des grades et de la transparence ;
- tests unitaires des six états ;
- assertions statiques du shell et du vocabulaire ;
- Playwright aux largeurs 320, 375, 768, 1024, 1280, 1440 et 1920 px ;
- parcours clavier, recherche par ticker, recherche libre et ouverture volontaire de Soutien MW ;
- captures de livraison dans `docs/tremplin/screenshots/home-2026/`.

## Dépendances backend restantes

- recherche artiste/ticker et historique récent réels ;
- sélection éditoriale autorisée et rotation côté service ;
- statut, prix, frais, part artiste, plafond et disponibilité de revente ;
- persistance du suivi et de la dernière consultation ;
- distinction de comptes visiteur, membre et artiste ;
- remplacement ou masquage des fixtures avant production.

## Protection de la section des grades

La structure JSX, la composition, les interactions et les assets graphiques des six grades n’ont pas été modifiés pendant cette passe. Le test visuel dédié vérifie les six badges, leurs six strokes actifs et le responsive ; une capture de régression 1440 px est fournie séparément.

## Passe du 6 août 2026 — Découvrir et Mes artistes

### Recherche et filtres partagés

- Le Globe et le mur des projets consomment désormais les mêmes primitives `MeewavSearchFilterBar`, `MeewavFilterPanel`, `MeewavFilterSection` et `MeewavActiveFilterChips`.
- La grande rangée de champs propre au Tremplin a été retirée.
- Le panneau conserve la mécanique du Globe : overlay, fermeture par Échap, piège de focus, retour du focus, actions fixes et adaptation mobile.
- La configuration métier du Tremplin contient uniquement des filtres alimentés par les fixtures actuelles : région, ville, métier, style, grade, état du jeton et tri.
- Les critères sont synchronisés dans l’URL (`q`, `region`, `city`, `category`, `style`, `grade`, `tokenStatus`, `sort`) et restaurés lors de la navigation arrière.

### Rail « Premiers projets sur MeeWav »

- Les cartes restent horizontales sur desktop mais leur hauteur suit désormais le contenu.
- Les variantes sans prix affichent seulement des informations réelles de parcours ou de dossier ; aucun emplacement financier vide n’est réservé.
- Les actions ne sont plus poussées artificiellement au bas de la carte.
- Les flèches sont placées dans l’en-tête du rail et la scrollbar native reste masquée.

### Tableau de bord « Mes artistes »

La route `/tremplin/mes-artistes` charge par défaut la fixture investisseurs `populated`. Deux scénarios restent directement testables :

- `?tremplinFixture=populated` : six artistes suivis, trois jetons détenus, actualités, statuts à surveiller et deux Rooms ;
- `?tremplinFixture=followingOnly` : suivi artistique en premier, sans métriques financières à zéro ;
- `?tremplinFixture=empty` : état vide pédagogique, sans tableau ni filtre inutile.

L’aperçu `populated` montre d’abord la valeur estimée, la variation sur 24 heures, l’écart estimé depuis les achats, les détentions, puis l’activité artistique et les Rooms. Les montants de fixture restent des chaînes décimales ; ils ne constituent ni des calculs financiers définitifs ni un contrat backend.

### Validation de cette passe

- `npm run test:tremplin` ;
- `npm run typecheck` ;
- `npm run build` ;
- vérification Git dédiée : aucun fichier sous `public/images/tremplin/grades` n’a été modifié par cette passe.

Le navigateur intégré n’étant pas disponible dans l’environnement au moment de cette validation, aucune nouvelle capture manuelle n’est déclarée pour cette passe. Les captures antérieures restent des références, pas une preuve visuelle de ces deux écrans actualisés.

### Dépendances backend restantes

- recherche, facettes, total et pagination du mur depuis une API commune ;
- statut, prix, variation 24 h et date de mise à jour fournis par le serveur ;
- détentions et coût d’achat moyen authentifiés ;
- agrégation serveur de la valeur estimée et de l’écart depuis les achats ;
- actualités lues/non lues, rappels de Rooms et suivi persistant ;
- remplacement des trois fixtures par l’état réel du compte en production.
