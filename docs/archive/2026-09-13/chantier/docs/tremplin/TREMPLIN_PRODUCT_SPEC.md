# MeeWav Tremplin — spécification produit de référence

Version : 1.0
Statut : maquette investisseur, décisions produit à valider avant production
Principe directeur : **on découvre d’abord la personne, puis son talent, ensuite ses preuves, puis sa progression, puis sa communauté. Le prix vient toujours après.**

## 1. Vision

Le Tremplin est un univers MeeWav permettant :

- au public de découvrir des talents musicaux, de les suivre puis de les soutenir ;
- aux talents de rendre leur pratique et leur progression visibles ;
- à MeeWav de vérifier l’identité, les preuves, les droits et la maturité ;
- à une communauté de matérialiser un soutien durable avec un jeton MW lorsque celui-ci est autorisé.

Le jeton représente la confiance placée dans l’évolution générale d’un talent. Il ne représente ni un projet ponctuel, ni les droits d’auteur, ni les royalties, ni la valeur humaine ou artistique de la personne.

## 2. Principes non négociables

1. La découverte commence par le talent.
2. Les performances et les preuves précèdent le jeton.
3. Le prix est secondaire sur les surfaces de découverte.
4. Les grades mesurent la maturité et la progression, jamais la valeur financière.
5. Un grade ne peut être acheté.
6. Un changement de grade ne modifie jamais automatiquement le prix.
7. Le niveau 2 permet de déposer une demande, sans garantir de jeton.
8. Toute activation est soumise à une vérification humaine.
9. La détention est limitée à 5 % par personne et comptes liés.
10. La revente rapide est découragée et explicitement tarifée.
11. Les fenêtres de revente et pauses de sécurité sont visibles.
12. Aucun rendement, aucune hausse et aucune liquidité ne sont promis.
13. La verticale MeeWav change d’univers ; la top bar gère le Tremplin et le compte.
14. Les opérations financières ne deviennent jamais le motif visuel dominant.
15. Tous les blocages expliquent leur cause et l’action suivante.

## 3. Rôles et états

### Visiteur

- découvre les talents et les pages publiques ;
- comprend le Tremplin ;
- voit les performances, preuves, grades et statuts publics ;
- doit s’inscrire avant de suivre ou soutenir.

### Membre public

- suit des talents ;
- reçoit leurs actualités ;
- rejoint des Rooms ;
- soutient si son identité est vérifiée ;
- gère ses jetons et ses sorties.

### Talent niveau 1

- possède un profil public ;
- publie des contenus et preuves ;
- suit sa progression ;
- ne peut pas demander de jeton.

### Talent niveau 2 éligible

- voit pourquoi il est éligible ;
- peut ouvrir une candidature en sept étapes ;
- ne reçoit aucun jeton automatiquement.

### Talent en vérification

- suit un statut horodaté ;
- répond aux demandes de précisions ;
- ne peut pas relancer une candidature parallèle.

### Talent avec jeton actif

- gère les actualités et la communication ;
- voit les opérations et protections ;
- ne peut ni contourner les limites, ni manipuler la Talent Curve.

### Administrateur / conformité

- examine les identités, preuves, droits et comptes liés ;
- motive les décisions ;
- suspend les opérations en cas de risque ;
- consulte un journal d’audit non modifiable.

## 4. Architecture de navigation

### Barre verticale MeeWav

Elle change d’univers : Globe, Messages, Rooms, Profil, Marketplace, Tremplin. Aucune fonction indispensable du Tremplin ne dépend exclusivement de cette barre.

### Top bar unique

Gauche :

- MeeWav / Tremplin.

Centre :

- Découvrir ;
- Comment ça marche ;
- Mes artistes.

Droite :

- recherche globale ;
- notifications ;
- avatar ;
- action contextuelle éventuelle.

### Action contextuelle

| État | Action |
| --- | --- |
| Visiteur | Créer un compte |
| Membre public | Compléter mon profil |
| Talent niveau 1 | Voir ma progression |
| Talent niveau 2 | Demander mon jeton MW |
| Candidature en cours | Suivre ma demande |
| Jeton actif | Gérer mon jeton |
| Suspension | Consulter le statut |

Ne jamais afficher « Créer mon jeton » à une personne non éligible.

## 5. Accueil Tremplin

### Hero

Sur-label : `Sélection MeeWav`

Titre : `Repère le talent avant tout le monde.`

Promesse :

> Découvre les talents musicaux qui émergent aujourd’hui, soutiens ceux en qui tu crois avec leur jeton MW et suis leur évolution dans le temps.

Actions :

- Découvrir les talents ;
- Comprendre le Tremplin.

### Recherche dans le contenu

Placeholder : `Rechercher un talent, un artiste ou un style…`

Filtres :

- grande famille musicale ;
- localisation ;
- grade ;
- avec ou sans jeton ;
- nouveau ;
- vérifié.

### Familles publiques

- Artistes solo ;
- Groupes ;
- Interprètes ;
- DJs ;
- Beatmakers ;
- Producteurs ;
- Compositeurs ;
- Instrumentistes.

Les métiers techniques, métiers image, accompagnants, avatars IA et danseurs ne font pas partie de la découverte principale du Tremplin musical.

### Rails

1. Talent de la semaine
2. Talents à surveiller
3. Nouveaux talents émergents
4. Talents vérifiés récemment
5. Talents qui progressent
6. Les plus suivis
7. Près de chez vous
8. Sélection éditoriale MeeWav

Chaque rail possède un contexte éditorial, un bouton Voir plus, des contrôles explicites et un défilement tactile.

### Carte talent

Ordre :

1. photo cohérente ;
2. nom ;
3. profession, style et ville ;
4. raison de croire au talent ;
5. preuve ou évolution récente ;
6. nombre d’abonnés ;
7. grade ;
8. statut du jeton, en retrait ;
9. `Découvrir son talent`.

Interdit sur une carte de découverte :

- classement principal par hausse de prix ;
- graphe de trading ;
- bouton Acheter ;
- projet de financement comme identité principale.

## 6. Système de grades

| Niveau | Nom produit | Signification | Déblocage principal |
| --- | --- | --- | --- |
| 1 | En découverte | Profil réel, premiers contenus | Visibilité publique |
| 2 | Émergent vérifié | Activité minimale et preuves suffisantes | Dépôt d’une demande MW |
| 3 | Talent confirmé | Régularité et qualité vérifiables | Visibilité éditoriale accrue |
| 4 | Talent en expansion | Progression soutenue et communauté active | Accompagnement renforcé |
| 5 | Talent de référence | Parcours structuré et impact reconnu | Programmes premium |
| 6 | Signature MeeWav | Excellence durable et rôle moteur | Sélections stratégiques |

Chaque écran de grade montre :

- grade actuel ;
- définition ;
- date de dernière évaluation ;
- critères validés ;
- critères restants ;
- progression vers le niveau suivant ;
- fonctions débloquées.

La progression combine des signaux vérifiables et une évaluation humaine. Aucun volume acheté, position financière ou prix de jeton n’entre dans le calcul.

## 7. Page « Comment ça marche »

Deux entrées :

### Pour le public

1. Découvre
2. Soutiens
3. Suis son évolution

### Pour les artistes

1. Fais reconnaître ton talent
2. Atteins le niveau 2
3. Passe la vérification
4. Active ton jeton MW après approbation

La page contient :

- trois parcours concrets : chanteuse, beatmaker, pianiste ;
- une Talent Curve interactive et pédagogique ;
- le principe du jeton MW ;
- quinze réponses simples ;
- le centre de confiance ;
- les états bloquants et leur résolution.

## 8. Demande de jeton MW

### Étape 1 — Éligibilité

- niveau requis ;
- profil complété ;
- identité vérifiée ;
- activité minimale ;
- contenus disponibles ;
- absence de sanction.

### Étape 2 — Ton talent

- savoir-faire ;
- signature artistique ;
- meilleures performances ;
- niveau actuel ;
- étapes déjà franchies ;
- manière de suivre l’évolution ;
- axes de progression.

### Étape 3 — Tes preuves

- performances ;
- morceaux ;
- vidéos ;
- sets ;
- instrumentales ;
- crédits ;
- concours ;
- concerts ;
- collaborations ;
- recommandations ;
- distinctions.

### Étape 4 — Identité & droits

- identité et âge ;
- représentant légal si nécessaire ;
- droits sur les contenus ;
- déclarations obligatoires ;
- liens avec équipe ou label ;
- personnes susceptibles de contrôler le jeton.

### Étape 5 — Fonctionnement MW

- Talent Curve ;
- limite de 5 % ;
- frais ;
- durée minimale ;
- fenêtres de revente ;
- obligations de communication ;
- manipulation interdite ;
- risque de perte.

### Étape 6 — Récapitulatif

Le dossier complet est relu avant un envoi horodaté. Les informations privées sont visuellement séparées de la future page publique.

### Étape 7 — Suivi

- Brouillon ;
- Envoyée ;
- Vérification en cours ;
- Informations supplémentaires demandées ;
- Approuvée ;
- Refusée ;
- Nouvelle demande possible à partir d’une date.

Tout refus comporte des raisons compréhensibles et une voie d’amélioration.

## 9. Profil talent

Ordre :

1. identité ;
2. média ou performance principale ;
3. description du talent ;
4. contenus remarquables ;
5. preuves et étapes franchies ;
6. actualités ;
7. communauté ;
8. Room ;
9. grade MeeWav ;
10. jeton MW ;
11. valeur et historique ;
12. protections et actions.

Le hero ne contient pas de prix. La section jeton commence par `Le prix vient après le talent`.

## 10. Soutenir un talent

Parcours en quatre écrans :

1. Montant : choisir le montant engagé en euros.
2. Impact : voir quantité estimée, valeur avant/après, frais et part détenue.
3. Engagement : comprendre risque, durée, fenêtres, limite et quote temporaire.
4. Confirmation : retrouver le talent dans Mes artistes.

Vocabulaire :

- `Soutenir`, jamais `Trader` ;
- `Gérer ma sortie`, jamais incitation à vendre ;
- `Talent Curve`, jamais jargon affiché sans explication ;
- `personnes qui soutiennent`, pas un compteur spéculatif dominant.

## 11. Gérer sa sortie

Avant confirmation :

- quantité détenue ;
- quantité ou pourcentage revendu ;
- valeur estimée avant/après ;
- frais normaux et frais de sortie rapide ;
- montant net ;
- position restante ;
- prochaine fenêtre ;
- avertissement de perte possible.

Une sortie rapide, une limite atteinte, une fenêtre fermée ou une pause de sécurité ne doivent jamais apparaître comme une erreur générique.

## 12. Mes artistes

Ordre des onglets :

1. Actualités
2. Talents suivis
3. Talents soutenus
4. Rooms
5. Mes jetons MW
6. Documents

Les actualités artistiques, nouveaux contenus, scènes, collaborations, grades et Rooms précèdent les données financières. Les montants et positions vivent dans un volet secondaire dépliable.

## 13. Espace artiste

Modules :

- Mon profil ;
- Ma progression ;
- Mes preuves ;
- Mes contenus ;
- Ma communauté ;
- Mes actualités ;
- Ma candidature ;
- Mon jeton MW ;
- Mes documents ;
- Conformité et communication.

Le talent comprend pourquoi il possède son grade, comment progresser, comment communiquer sans manipuler et pourquoi une opération peut être suspendue.

## 14. Centre de confiance

### Protections

- KYC avant opération ;
- 5 % maximum ;
- agrégation des comptes liés ;
- interdiction de vente à découvert ;
- durée minimale de détention ;
- fenêtres de revente ;
- frais renforcés en sortie rapide ;
- seuils de transaction ;
- pause de sécurité ;
- journal d’audit ;
- restrictions artiste, équipe et mineurs.

### États explicites

- vérification nécessaire ;
- limite 5 % atteinte ;
- fenêtre fermée ;
- transaction suspendue ;
- frais de sortie élevés ;
- quote expirée ;
- service indisponible ;
- jeton bientôt disponible ;
- jeton actif ;
- jeton suspendu ;
- candidature incomplète ;
- preuves insuffisantes ;
- informations supplémentaires demandées.

Chaque état contient un titre, une cause en langage courant, l’effet immédiat, la prochaine action et une voie d’aide.

## 15. Talent Curve et configuration

La courbe affichée dans la maquette est pédagogique. Les paramètres réels doivent rester versionnés, configurables et contrôlés côté serveur :

- formule ;
- prix plancher ;
- pente ;
- offre en circulation ;
- frais de soutien ;
- frais de revente ;
- surcharge de sortie rapide ;
- durée minimale ;
- calendrier des fenêtres ;
- seuils de pause ;
- plafond individuel ;
- limites par opération ;
- règle de comptes liés.

Le client n’envoie jamais un prix final. Il demande une quote ; le serveur recalcule prix, quantité, frais, droits d’accès, KYC, détention et risque avant toute exécution.

## 16. Composants UI

- `TremplinTopbar`
- `ContextAction`
- `TalentSearch`
- `TalentFilterBar`
- `TalentRail`
- `TalentCard`
- `TalentProof`
- `GradeBadge`
- `GradeProgress`
- `ArtistHero`
- `PerformancePlayer`
- `CommunitySummary`
- `TokenSecondaryPanel`
- `TalentCurve`
- `QuoteSummary`
- `RiskNotice`
- `TrustState`
- `ApplicationStepper`
- `ApplicationStatusTimeline`
- `EmptyState`
- `ErrorState`
- `Skeleton`

Le monogramme MW est une pièce crypto propriétaire violette, jamais une icône dollar.

## 17. Responsive et accessibilité

### Desktop

- largeur de contenu maximale cohérente ;
- rails visibles dès la première vue ;
- aucune grande capsule décorative autour de la page ;
- top bar unique et stable.

### Tablette

- filtres en ligne défilante ;
- cartes entre 280 et 330 px ;
- aperçu candidature sous le formulaire si nécessaire.

### Mobile

- top bar compacte ;
- recherche et filtres dans le contenu ;
- cartes tactiles sans dépendre du survol ;
- stepper horizontal scrollable ;
- actions principales dans la zone du pouce ;
- aucun tableau financier large.

### Accessibilité

- navigation clavier complète ;
- focus visible ;
- libellés et états ARIA ;
- réduction des animations ;
- graphiques accompagnés d’une phrase de tendance ;
- contraste texte/fond conforme ;
- aucune information transmise uniquement par la couleur.

## 18. Données de démonstration

Les données investisseur doivent respecter les règles suivantes :

- chaque photo correspond au métier exact ;
- les instrumentistes sont montrés avec l’instrument annoncé ;
- aucun doublon de portrait visible dans un même rail ;
- chaque preuve correspond au talent ;
- une progression positive ne contient pas de graphe final incohérent ;
- le Top 1 n’est pas fabriqué à partir d’une baisse contradictoire ;
- les dates, villes, styles, compteurs et contenus restent cohérents ;
- les grades élevés ont davantage de preuves que les grades faibles ;
- le prix ne sert pas à justifier un grade ou une sélection éditoriale.

## 19. Mesure de réussite

### Public

- comprend la promesse sans connaître les jetons ;
- peut citer au moins une preuve d’un talent ;
- sait que la valeur peut baisser ;
- trouve un talent par famille ou lieu ;
- comprend pourquoi une opération est bloquée.

### Talent

- comprend que le niveau 2 ne garantit pas un jeton ;
- termine la candidature sans aide ;
- sait quelles preuves ajouter ;
- comprend les obligations de communication ;
- sait où suivre la décision.

### Produit

- taux d’ouverture d’un profil depuis les rails ;
- abonnement avant soutien ;
- consultation des preuves ;
- complétion de la page éducative ;
- taux de complétion de candidature par étape ;
- taux de quotes abandonnées après lecture du risque ;
- part de sorties rapides ;
- signalements et suspensions ;
- compréhension mesurée en test utilisateur.

## 20. Validation avant production

À faire valider explicitement :

- qualification juridique du jeton ;
- droits associés ou absence de droits ;
- protection des mineurs ;
- KYC et lutte anti-fraude ;
- conservation et exécution ;
- formule et paramètres économiques ;
- fiscalité ;
- frais et répartition ;
- liquidité et fenêtres ;
- politique de suspension et fermeture ;
- recours et conservation des preuves ;
- RGPD et durée de conservation ;
- accessibilité ;
- tests de charge et reprise sur incident.

## 21. Livrables du programme

1. Architecture de navigation
2. Matrice des rôles et états
3. Top bar contextuelle
4. Accueil Tremplin
5. Recherche et filtres
6. Rails éditoriaux
7. Cartes talent
8. Mur de découverte
9. Page Comment ça marche
10. Système de six grades
11. Parcours de demande
12. Profil talent
13. Parcours de soutien
14. Parcours de sortie
15. Mes artistes
16. Espace artiste
17. Candidature et suivi
18. Dashboard jeton
19. Centre d’aide et FAQ
20. Centre de confiance
21. États vides
22. États d’erreur
23. États bloqués
24. Responsive desktop
25. Responsive tablette
26. Responsive mobile
27. Design system
28. Contrat backend
29. Plan de test utilisateur
30. Check-list juridique, économique et technique

Cette spécification et le contrat backend constituent la référence. Toute nouvelle interface doit pouvoir expliquer où se trouvent la personne, le talent, les preuves et la progression avant d’afficher un prix.
