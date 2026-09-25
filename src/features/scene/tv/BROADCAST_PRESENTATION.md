# Présentation d’antenne MeeWav TV

MeeWav TV reste une chaîne unique et linéaire. Son habillage ne crée ni une
seconde bibliothèque vidéo ni une liste de chaînes.

## Identité

- le masthead est volontairement limité à `MEEWAV TV` et
  `La chaîne officielle de MeeWav.` ;
- le watermark et les station IDs réutilisent la signature MW canonique du
  dépôt ;
- un station ID court apparaît à l’ouverture puis à chaque passage d’un
  programme au suivant ;
- le lower-third annonce le format, le titre et l’artiste sans masquer le
  média ;
- les accents colorés distinguent discrètement les familles éditoriales
  (Sessions, La Relève, Replay, MeeWav Info, Carte blanche, etc.).

## Chronologie

- l’EPG est une liste verticale ordonnée ;
- le programme en cours expose une progression temporelle ;
- les jours utilisent `Aujourd’hui` et `Demain` relativement à l’horloge et au
  fuseau de la chaîne ;
- `getBroadcastTimeline` matérialise tout trou avec la playlist de continuité ;
- le panneau expose `data-continuity="continuous"` lorsque la chronologie
  visible ne contient ni trou ni chevauchement.

## Mesure

Les événements `tv_program_25`, `tv_program_50`, `tv_program_75` et
`tv_program_completed` sont dédupliqués par identifiant de programme pendant
la session du composant. Ils décrivent la progression de l’émission linéaire,
pas la durée totale de présence de l’utilisateur sur MeeWav.

