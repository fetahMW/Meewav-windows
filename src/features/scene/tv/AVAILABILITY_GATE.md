# Gate de disponibilité MeeWav TV

Le gate répond à une seule question : **la chaîne peut-elle être déclarée
disponible pour la fenêtre demandée ?** Il est pur et ne programme, ne publie,
n'accorde ni ne persiste aucun droit.

La décision est positive uniquement si toutes les conditions suivantes sont
réunies :

1. la chaîne demandée existe ;
2. la fenêtre couvre au moins sept jours locaux consécutifs ;
3. chaque jour contient une programmation éditoriale réelle ;
4. la chronologie matérialisée couvre chaque journée sans trou ni
   chevauchement ;
5. la source de secours existe, possède une durée de bloc valide et peut
   couvrir toute la fenêtre ;
6. chaque programme référence une source existante ;
7. chaque source, y compris la source de secours, possède un grant
   `tvLinear` actif pour le territoire et toute la durée de diffusion ;
8. la programmation atteint le seuil de diversité de formats configuré
   (six formats distincts par défaut).

Un grant VOD La Scène ou un consentement à générer des extraits ne satisfait
jamais la condition TV. Le contrôle est effectué au début et à la fin de chaque
intervalle afin de détecter un droit qui expire pendant un programme.

Les grants exportés par `sceneTvAvailabilityGate.fixtures.ts` sont des preuves
fictives réservées à la démonstration investisseurs. Le manifeste média du
dépôt reste la référence : ces assets ne sont pas juridiquement autorisés pour
la production tant que le service droits n'a pas enregistré de vraies preuves.

En production, le serveur doit recalculer ce gate immédiatement avant
l'ouverture de l'antenne et lors de toute modification, expiration ou
révocation. Une décision frontend ne peut jamais ouvrir la diffusion seule.
