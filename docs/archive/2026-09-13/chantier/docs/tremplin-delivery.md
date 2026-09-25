# Tremplin MeeWav — état de livraison

Date : 4 août 2026
Branche : `task/tremplin`
Mode livré : démonstration explicite, sans transaction réelle ni backend financier connecté.

## Résultat actuel

Le Tremplin présente désormais l’artiste avant le mécanisme MW :

`écouter → ouvrir le profil → suivre gratuitement → comprendre le projet et le parcours → ouvrir volontairement Soutien MW`

- L’accueil et Découvrir permettent de lancer un extrait immédiatement.
- Les cartes artistiques n’exposent plus de prix, variation, graphique ou bloc MW.
- Les cartes projets utilisent un CTA audio, un cœur de suivi compact et une ouverture naturelle du profil.
- Les badges des six grades et leurs intitulés ont été agrandis et clarifiés.
- Le profil sépare la lecture artistique de l’espace Soutien MW.
- Mes artistes reste relationnel ; les détentions et opérations sont rangées dans Soutiens MW.
- Achat et revente sont des parcours plein écran en quatre étapes, marqués comme simulations.
- Les retours in-app conservent le contexte utile de la page d’origine.

## Audio partagé

Un seul moteur audio vit dans le shell Tremplin :

- il est chargé à la demande ;
- il persiste entre accueil, Découvrir, profil et Mes artistes ;
- une barre partagée reflète l’extrait actif ;
- il s’arrête volontairement à l’entrée des écrans pédagogiques, de l’espace artiste et des tunnels MW ;
- il ne constitue pas un lecteur global persistant hors du Tremplin.

## Navigation contextuelle

- Routes artiste canoniques, sans fiche rapide intermédiaire.
- Retour mémorisé depuis l’accueil, Découvrir et Mes artistes.
- Collection Découvrir encodée dans `?collection=…`.
- Vues Mes artistes encodées dans la query string.
- Restauration côté client des filtres, états de lecture et positions de défilement utiles.
- Retour contextuel depuis une Room vers le profil Tremplin, sans modification du métier Rooms.
- Routes dédiées et retour explicite pour achat et revente.

La restauration est limitée à l’état client et à la session de navigation ; aucune persistance serveur n’est revendiquée.

## Routes concernées

- `/tremplin`
- `/tremplin/decouvrir`
- `/tremplin/comprendre`
- `/tremplin/mes-artistes`
- `/tremplin/artistes/:artistId`
- `/tremplin/soutien-mw/:artistId/achat`
- `/tremplin/soutien-mw/:artistId/revente`
- `/tremplin/demande`
- `/tremplin/mon-jeton`
- `/rooms`, uniquement pour transporter le contexte de retour Tremplin.

## Composants et services ajoutés ou centralisés

- `TremplinDemoBanner` : avertissement persistant de simulation.
- `tremplinCopy` : textes publics et transactionnels centralisés.
- `tremplinFeatureFlags` : capacités actives et fonctions non branchées.
- `tremplinStateContracts` : statuts canoniques des jetons, opérations, suivis et demandes.
- `tremplinQuoteService` : interface commune, repository de démonstration et extension API non connectée.
- `tremplinAnalytics` : hooks d’événements frontend ; aucun collecteur de production n’est déclaré connecté.

## Composants consolidés

- `TremplinPublicHome`
- `TremplinHomeExperience`
- `TremplinPage`
- `TremplinTokenEducation`
- `TremplinGradeSystem`
- `TremplinTokenFlow`
- `TremplinTokenWorkspace`
- `TremplinArtistAnalytics`
- `RoomsPage`, uniquement pour le retour contextuel.

Les anciens blocs financiers des cartes, les trois CTA concurrents, la courbe d’« impact » et les libellés ambigus ont quitté le parcours principal. Aucun composant Rooms ou moteur audio parallèle n’a été ajouté.

## Démonstration et séparation MW

- `demoMode` est actif et `apiTransactions` est désactivé.
- Les écrans transactionnels emploient des verbes de simulation.
- Le repository de démonstration produit les estimations visibles ; il ne contacte pas un service de paiement.
- Le repository API lève explicitement une erreur tant qu’aucun contrat réel n’est connecté.
- Prix, frais, répartitions, historiques, reçus et identités affichés sont des fixtures.
- Le prix et l’historique d’un artiste ne sont accessibles que dans son espace MW volontaire et seulement pour un état de jeton actif.
- Aucune valeur des fixtures ne doit être interprétée comme règle économique définitive.

## Textes centralisés

`tremplinCopy.ts` regroupe notamment :

- la gratuité de l’écoute et du suivi ;
- la définition fonctionnelle du jeton ;
- le caractère payant et facultatif de l’achat ;
- les risques de variation et de revente ;
- l’absence de droits sur l’artiste et ses œuvres ;
- le mode démonstration ;
- les étapes et CTA transactionnels ;
- les termes de répartition et de recalcul.

Ces textes restent modifiables et soumis à validation produit et conformité.

## Feature flags livrés

- `demoMode: true`
- `apiTransactions: false`
- `reciprocalArtistDiscovery: false`
- `reciprocalSupportIdentityConsent: false`
- `sponsoredEditorialModules: false`
- `productAnalytics: true`
- `tokenSuspensionState: false`

Ils sont actuellement définis dans le frontend et ne constituent pas une configuration distante.

## Captures desktop et mobile

Les dossiers suivants contiennent chacun dix écrans :

- `docs/tremplin/screenshots/desktop/`
- `docs/tremplin/screenshots/mobile/`

Écrans couverts : accueil, Découvrir, profil, Comment ça marche, présentation du jeton MW, grades, Mes artistes, achat, revente et demande artiste. Le corpus contient donc **20 captures**.

Le scénario de génération des captures a été réexécuté le 4 août 2026 avec le Chrome local configuré : **1/1 réussi**.

## État exact des tests au 4 août 2026

- `npm run test:tremplin` : **48/48 contrats statiques réussis**.
- `npm run test:unit` : **522/522 tests réussis** sur l’ensemble du projet.
- Vitest ciblé accueil + service d’estimation : **7/7 réussis**.
- Validation TypeScript et build de production : **réussis**.
- Playwright cartes projets : **6/6 réussis** aujourd’hui pour 320, 375, 768, 1024, 1440 et 1832 px.
- Playwright navigation artiste : **5/5 réussis** aujourd’hui pour retours profil, Mes artistes, Soutien MW, Room et profil inconnu.
- Playwright captures : **1/1 réussi** aujourd’hui.
- Playwright présentation du jeton et sélecteur de grades : **5/5 réussis** aujourd’hui, en mobile et sur les principaux grands écrans.
- Playwright tunnels MW : **2/2 réussis** aujourd’hui, achat et revente jusqu’à leur confirmation de simulation.
- Passe navigateur combinée navigation + cartes + tunnels : **13/13 réussis** sur l’état final.

## Dépendances backend non livrées

- identité et vérification autoritaires ;
- estimation serveur identifiée, expirante et recalculée ;
- confirmation idempotente ;
- prix, quantité finale, frais, répartition et limite de détention ;
- états du jeton et suspensions ;
- détentions, opérations, reçus, remboursements et documents ;
- persistance des suivis, lectures et préférences ;
- demandes artistes, preuves, réévaluations et modération ;
- recommandations personnalisées avec diversité et exclusion des signaux financiers ;
- consentement de confidentialité entre artistes ;
- pipeline analytics de production.

Le contrat attendu est documenté dans `docs/tremplin/token-backend-contract.md`. Il n’est pas présenté comme connecté.

## Règles financières et produit encore à valider

- qualification juridique et formulation finale du jeton ;
- formule de valeur ;
- commissions, frais, réserve et part artiste ;
- plafond de détention et base de calcul ;
- délais, fenêtres et coût de revente ;
- suspension et traitement des opérations en cours ;
- procédure de grade et reconnaissance du parcours antérieur ;
- sponsorisation éditoriale ;
- confidentialité de l’entraide entre artistes ;
- validation finale des textes de risque.

Ces règles ne sont pas déduites des montants de démonstration.

## Limite de mise en production

La surface frontend artiste-first, sa navigation, sa pédagogie et son mode démonstration sont livrés. Le Tremplin ne doit pas être considéré comme transactionnel en production avant la validation des règles ci-dessus, le branchement des services backend, la vérification sur données autorisées et la réussite complète de la suite de tests maintenue en CI.
