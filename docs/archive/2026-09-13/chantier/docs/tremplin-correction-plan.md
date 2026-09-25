# Tremplin MeeWav — audit, correction et état réel

Date de mise à jour : 5 août 2026
Branche : `task/tremplin`
Périmètre : frontend Tremplin livré en mode démonstration. Aucun backend financier de production n’est connecté.

## 1. Objectif produit retenu

Le parcours artistique global reste :

`Shorts / Rooms / Globe → profil → projet → parcours → grade`

Le Tremplin intervient ensuite comme passerelle volontaire :

`artiste ciblé → statut du jeton → Soutien MW`

Les invariants visibles dans l’interface sont les suivants :

- l’écoute et la découverte appartiennent d’abord aux Shorts, Rooms, Globe et profils ;
- l’accueil du Tremplin ne conserve qu’un bref aperçu éditorial facultatif ;
- suivre un artiste reste une action gratuite et distincte d’un achat ;
- les cartes artistiques ne montrent ni prix, ni variation, ni graphique financier ;
- le Soutien MW est une destination volontaire, séparée du parcours artistique normal ;
- les opérations affichées sont explicitement des simulations ;
- les grades sont présentés comme des repères de parcours, pas comme une promesse de succès ou de valeur future.

## 2. Architecture constatée et conservée

- Stack : React 19, TypeScript 6, React Router 7 et Vite 8.
- Entrée applicative : `/tremplin/*` dans `src/App.tsx`.
- Shell et navigation interne : `TremplinPage.tsx`.
- Styles : feuilles CSS dédiées aux expériences Tremplin.
- Données artistes : fixtures locales dans `tremplinArtistData.ts` et les rosters associés.
- Données MW : fixtures et calculs déterministes de démonstration dans `tremplinTokenData.ts` et `tremplinQuoteService.ts`.
- Textes publics et transactionnels : source centralisée `tremplinCopy.ts`.
- États et capacités : `tremplinStateContracts.ts` et `tremplinFeatureFlags.ts`.
- Contrat backend prévu, non branché : `docs/tremplin/token-backend-contract.md`.

Les composants communs MeeWav et l’identité sombre, musicale et violette ont été conservés. Aucun second moteur audio et aucune variante parallèle des Rooms n’ont été créés.

## 3. Routes livrées

- `/tremplin`
- `/tremplin/decouvrir`
- `/tremplin/comprendre`
- `/tremplin/mes-artistes`
- `/tremplin/artistes/:artistId`
- `/tremplin/soutien-mw/:artistId/achat`
- `/tremplin/soutien-mw/:artistId/revente`
- `/tremplin/demande`
- `/tremplin/mon-jeton`

Les passages vers `/rooms`, `/shorts` et `/globe` restent des intégrations de navigation. Le métier des Rooms n’a pas été modifié.

## 4. Navigation contextuelle réellement livrée

- L’ouverture d’un profil depuis l’accueil, Découvrir ou Mes artistes conserve une destination de retour contextuelle.
- Découvrir encode une collection ouverte dans `?collection=…`.
- Mes artistes encode ses vues et sections dans la query string.
- Les instantanés de filtres, de lecture et de défilement utiles au retour sont conservés côté client pendant la navigation dans l’application.
- Une entrée Room reçoit le contexte nécessaire pour revenir vers le profil Tremplin d’origine.
- Les tunnels achat et revente possèdent leurs propres routes plein écran et un retour explicite.

Cette restauration repose sur l’état de navigation et la session du navigateur. Elle n’est pas présentée comme une persistance serveur et ne garantit pas la restauration après toute ouverture externe ou suppression de session.

## 5. Audio persistant : comportement exact

`TremplinPage` porte un moteur audio unique, créé seulement lorsqu’un extrait démarre.

- La lecture peut continuer entre les surfaces artistiques du Tremplin : accueil, Découvrir, profil et Mes artistes.
- Une barre de lecture partagée expose l’extrait actif.
- Le lecteur est volontairement arrêté lors de l’entrée dans les parcours pédagogiques, l’espace artiste ou un parcours transactionnel MW.
- Quitter le shell Tremplin, notamment vers un autre pilier, met fin à cette persistance locale.

Il ne s’agit donc pas d’un lecteur global à toute l’application.

## 6. État livré, onglet par onglet

### Accueil

- Recherche réelle d’un artiste ou du symbole de son jeton dès le premier écran.
- Ouverture directe de l’ancre volontaire Soutien MW d’un profil ciblé.
- Rôle des Shorts, Rooms, Globe et profils clairement séparé de celui du Tremplin.
- Projets à la une fondés sur une sélection éditoriale, jamais sur les achats ou les variations.
- Prix affiché de façon neutre uniquement pour les jetons actifs ; aucun graphique ni classement financier.
- Un seul aperçu audio bref et facultatif, utilisé comme contexte et non comme action dominante.
- Grades plus lisibles, badge actif proportionnellement agrandi et section pédagogique conservée avant l’accès financier.
- La hauteur à 1440 × 1000 passe de 6 491 px à 4 080 px, soit une réduction de 37,1 %. Le détail est documenté dans `docs/tremplin-home-refonte.md`.

### Découvrir

- La sélection reste éditoriale et ne devient pas un classement financier.
- Les fiches présentent le projet avant le statut, puis le prix et la variation 24 h uniquement lorsque le jeton est actif.
- Le rail « Premiers projets » utilise des cartes horizontales compactes dont la hauteur suit le contenu, sans espace réservé à un prix inexistant.
- Le mur « Tous les projets » réutilise les primitives exactes de recherche et de filtres du Globe ; sa configuration métier est distincte mais son interaction et son rendu sont communs.
- La recherche et les filtres actifs sont synchronisés dans l’URL.
- Le score local de démonstration utilise des signaux artistiques et une rotation déterministe ; il n’utilise ni prix, ni détention, ni variation de jeton.
- Aucun tri financier n’est actif par défaut.

### Profil artiste

- Aperçu, création, projet, étapes, Rooms et grade précèdent l’espace financier.
- Navigation interne vers les sections du profil.
- Soutien MW accessible volontairement ; prix et historique n’apparaissent que pour un jeton actif.
- Les retours vers la collection, le filtre, l’actualité ou la Room d’origine sont contextualisés.

### Comment ça marche

- Lecture rapide : découvrir, suivre gratuitement, soutenir avec des jetons seulement si souhaité.
- Rôle de Rooms, Shorts, Globe et Tremplin expliqué.
- Grades, reconnaissance du parcours antérieur et états du jeton explicités.
- Définition du jeton et risques issus de la source de textes centralisée.
- Informations détaillées présentées progressivement plutôt qu’en mur de conditions.

### Mes artistes

- La démonstration charge par défaut un tableau de bord peuplé : six artistes suivis, trois jetons détenus, huit actualités de fixture et deux Rooms.
- La valeur estimée, la variation sur 24 h et l’écart estimé depuis les achats apparaissent avant le fil artistique lorsqu’il existe des détentions.
- Les variantes `followingOnly` et `empty` suppriment les métriques financières inutiles et réordonnent le contenu selon les données.
- Les variations restent séparées du fil artistique ; celui-ci conserve ses filtres artiste, type et non-lu.
- Les onglets Aperçu, Mes jetons, Artistes suivis, Rooms et Activité ont des destinations explicites.

### Achat et revente

- Routes plein écran, sans petite modale à double défilement.
- Étapes achat : Montant, Récapitulatif, Règles et risques, Confirmation.
- Estimation identifiée, temporaire et recalculée par le service de démonstration.
- Montant, quantité, frais, part artiste, répartition, conditions de revente et risques sont exposés avant la simulation finale.
- Les CTA finaux décrivent l’opération simulée ; aucun paiement réel n’est déclenché.

### Espace artiste

- Demande en étapes et tableau de bord disponibles avec données de démonstration.
- États canoniques préparés pour une future persistance API.
- Reconnaissance du parcours antérieur présentée comme une évaluation distincte, sans automatiser le grade.

## 7. Composants consolidés

### Conservés et corrigés

- `TremplinPage`
- `TremplinPublicHome`
- `TremplinHomeExperience`
- `TremplinGradeSystem`
- `MeewavGradeBadge`
- `TremplinTokenEducation`
- `TremplinTokenFlow`
- `TremplinTokenWorkspace`
- `TremplinArtistAnalytics`
- navigation MeeWav commune et intégration de retour de `RoomsPage`

### Ajoutés ou centralisés

- `MeewavSearchFilterBar`, `MeewavFilterPanel`, `MeewavFilterSection` et `MeewavActiveFilterChips`
- `tremplinMyArtistsFixtures`
- `TremplinDemoBanner`
- `tremplinCopy`
- `tremplinFeatureFlags`
- `tremplinStateContracts`
- `tremplinQuoteService`
- `tremplinAnalytics`

### Retirés du parcours principal

- prix et variations sur les cartes artistes ;
- classement public fondé sur les hausses ;
- trois CTA concurrents dans une même carte ;
- bloc MW dans les rails de projets ;
- grande courbe d’« impact » dans le tunnel ;
- vocabulaire non expliqué de position, sortie, quote et bonding curve.

## 8. Données et fonctions encore simulées

- profils, biographies, médias, projets, Rooms et actualités de démonstration ;
- raisons de recommandation et personnalisation locale ;
- suivis, lectures et préférences non autoritaires ;
- prix, historiques, quantités détenues et reçus ;
- estimations, opérations, remboursements et statuts de vérification ;
- frais, part artiste, réserve, délais et paramètres du mécanisme de valeur ;
- grades, dates d’évaluation et preuves reconnues ;
- demande artiste et tableau de bord associé.

L’instrumentation produit fournit des hooks frontend. Aucun pipeline de collecte ou stockage analytics de production n’est affirmé comme connecté.

## 9. Dépendances backend non connectées

Les éléments suivants ne sont pas livrés comme services de production :

- session et vérification d’identité autoritaires ;
- création d’une estimation avec identifiant et expiration ;
- recalcul serveur et confirmation idempotente ;
- prix, quantité finale, frais, répartition et limite de détention ;
- états du jeton, suspensions et opérations en attente ;
- historique, reçus, remboursements et documents téléchargeables ;
- détentions réelles par artiste ;
- persistance des suivis, actualités lues et préférences ;
- demandes artistes, réévaluations, preuves et modération ;
- recommandations personnalisées avec garde-fous d’équité ;
- consentement et confidentialité des interactions entre artistes ;
- collecte analytics de production.

Le repository API prévu échoue explicitement tant que ces contrats ne sont pas branchés. Le frontend ne transforme pas une simulation en succès de production.

## 10. Règles financières, produit et conformité à valider

Ces décisions restent distinctes des dépendances techniques :

- qualification juridique et formulation finale du jeton ;
- formule de calcul de la valeur ;
- commissions, frais techniques, réserve et part réellement destinée à l’artiste ;
- plafond de détention définitif et base de calcul ;
- durée minimale, fenêtres, délais et éventuel coût de revente ;
- cas de suspension et traitement des opérations en cours ;
- politique de vérification d’identité ;
- données publiques du grade, processus humain et réévaluation ;
- sponsorisation éditoriale et critères de rotation ;
- consentement et confidentialité de l’entraide entre artistes ;
- version finale des textes de risque.

Les montants des fixtures ne définissent ni le modèle économique ni une règle contractuelle.

## 11. Feature flags actuels

- `demoMode: true`
- `apiTransactions: false`
- `reciprocalArtistDiscovery: false`
- `reciprocalSupportIdentityConsent: false`
- `sponsoredEditorialModules: false`
- `productAnalytics: true`
- `tokenSuspensionState: false`

Ces flags sont actuellement des constantes frontend, pas une configuration distante.

## 12. Vérification au 5 août 2026

- Contrats statiques : `npm run test:tremplin` — **48/48 réussis**.
- Suite unitaire complète : dernière passe globale documentée — **522/522 réussis**.
- Vitest ciblé accueil et navigation : **10/10 réussis** aujourd’hui.
- Validation TypeScript et build de production : **réussis**.
- Playwright accueil premium : **11/11 réussis** aujourd’hui sur 320, 375, 768, 1024, 1280, 1440 et 1920 px.
- Playwright grades de l’accueil : **3/3 réussis** aujourd’hui, avec espacement des sections et couleur de sélection contrôlés.
- Passe navigateur combinée navigation, cartes responsives et tunnels MW : **13/13 réussis**.
- Playwright captures de livraison : **1/1 réussi** aujourd’hui, générant les vues prévues avec le Chrome local configuré.
- Playwright présentation du jeton et sélecteur de grades : **5/5 réussis** aujourd’hui, en mobile et sur les principaux grands écrans.
- Playwright tunnels MW : **2/2 réussis** aujourd’hui pour les parcours achat et revente jusqu’à la confirmation de simulation.
- Playwright navigation artiste : **5/5 réussis** aujourd’hui, couvrant le retour profil, Mes artistes, Soutien MW, Room et profil inconnu.
- Playwright cartes projets : **6/6 réussis** aujourd’hui aux largeurs 320, 375, 768, 1024, 1440 et 1832 px.
- Captures présentes : **20 fichiers**, soit dix écrans en desktop et les mêmes dix en mobile.

Les captures couvrent : accueil, Découvrir, profil, Comment ça marche, présentation du jeton MW, grades, Mes artistes, achat, revente et demande artiste.

## 13. Suite de migration

Le frontend artiste-first et la démonstration explicite sont livrés. La suite n’est pas une nouvelle refonte visuelle :

1. valider les règles produit, financières et de conformité ;
2. implémenter les contrats backend documentés ;
3. remplacer les repositories de démonstration sans modifier la hiérarchie UX ;
4. connecter persistance, identité, recommandations et analytics ;
5. conserver les scénarios Vitest et navigateur dans la CI ;
6. réaliser une validation finale sur données autorisées avant mise en production.
