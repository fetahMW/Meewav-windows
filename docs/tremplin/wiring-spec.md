# Tremplin — spécification de câblage frontend

Date : 6 août 2026
Branche : `task/tremplin`

## Principe

Le frontend branche les services existants lorsqu’ils sont autoritatifs et garde une frontière explicite autour des données financières de démonstration. Une fixture ne doit jamais être envoyée au serveur ni présentée comme une transaction réelle.

## Matrice de câblage

| Domaine | Source de vérité | Câblage | Repli sûr |
| --- | --- | --- | --- |
| Authentification | `AuthProvider` / Supabase Auth | Le Tremplin lit la session, le nom, l’avatar et les métadonnées de parcours | identité locale de prévisualisation, puis visiteur |
| État de l’espace artiste | métadonnées Auth (`grade`, demande, statut du jeton) | Le CTA final devient conditions, demande, suivi de demande ou tableau de bord | membre/visiteur sans inventer de statut |
| Suivi d’un profil réel | table Supabase `follows` | lecture groupée et mutation optimiste lorsque `profileId` est un UUID canonique | stockage local isolé pour les fixtures |
| Suivi de fixtures | navigateur | persistance isolée par compte/preview/visiteur | aucune écriture distante |
| Recherche | URL + état React | `q` est partageable, restauré au retour navigateur et transmis depuis la landing | requête vide |
| Filtres du mur | URL | région, ville, métier, style, grade, état et tri sont partageables | pertinence sans filtre financier |
| Profil artiste | React Router | route stable `/tremplin/artistes/:id`, ancres projet/grade/jeton/statistiques | écran profil introuvable |
| Audio | média navigateur | lecture/pause, progression, fin, erreur, une seule lecture simultanée | message non bloquant si le média échoue |
| Rooms | route `/rooms` | contexte artiste, titre, date et état de retour conservés | retour au Tremplin |
| Rappels de Rooms | navigateur | ajout/retrait persistant et isolé par utilisateur | pas de notification système ni serveur |
| Actualités lues | navigateur | état lu/non lu persistant et isolé par utilisateur | non lu par défaut |
| Analytics produit | événement interne `meewav:tremplin-analytics` | recherche, profil, audio, Room, statut et accès jeton instrumentés | désactivation par feature flag |
| Achat/revente | aucun backend disponible | simulation strictement balisée et repository API qui échoue fermé | aucune transaction réelle |

## Contrats de navigation

- `/tremplin` : landing publique.
- `/tremplin/decouvrir` : sélections et recherche.
- `/tremplin/decouvrir?collection=…&q=…` : mur partageable avec filtres URL.
- `/tremplin/artistes/:artistId` : profil Tremplin.
- `#profile-project`, `#profile-grade`, `#profile-support`, `#profile-token-statistics` : sections profondes du profil.
- `/tremplin/mes-artistes?tab=…` : tableau de bord personnel.
- `/rooms` : ouverture d’une Room avec snapshot de retour.
- `/tremplin/comprendre` : pédagogie, vidéo et règles.
- `/tremplin/demande` et `/tremplin/mon-jeton` : espaces artiste de démonstration.
- `/tremplin/soutien-mw/:artistId/achat|revente` : simulation, jamais une opération réelle tant que `apiTransactions` reste désactivé.

## Persistance et confidentialité

Les clés locales sont versionnées et cloisonnées :

`meewav:tremplin:v2:<scope>:<donnée>`

Le scope vaut `user:<uuid>`, `preview:<id>` ou `guest`. Les suivis, actualités lues et rappels d’un compte ne contaminent donc pas un autre compte utilisant le même navigateur.

## Données volontairement non câblées

Les éléments suivants nécessitent des contrats backend dédiés et ne doivent pas être déduits côté client :

- statut officiel et éligibilité du jeton ;
- valeur courante et variation sur 24 h ;
- historique de valeur ;
- quantité détenue et coût d’acquisition ;
- frais, part artiste, plafonds et contrôles KYC ;
- création/signature d’un ordre ;
- règlement, conservation, reçu et remboursement ;
- revente, liquidité et délai d’exécution ;
- notifications serveur de Rooms et d’activité ;
- rapprochement entre les fixtures Tremplin et les UUID des profils publics.

Le repository `tremplinApiQuoteRepository` échoue volontairement tant que l’API d’estimation/ordre n’existe pas. Le mode de démonstration reste donc impossible à confondre avec une opération réelle.

## Critères de validation

- une recherche lancée depuis la landing reste visible dans l’URL et dans Découvrir ;
- retour/avance du navigateur restaure la requête ;
- un profil possédant un `profileId` canonique utilise le service social réel ;
- les fixtures ne provoquent aucune requête Supabase invalide ;
- les suivis, lectures et rappels sont cloisonnés par identité ;
- l’audio signale proprement un média indisponible ;
- les Rooms conservent le contexte et le retour ;
- aucun appel d’achat/revente réel n’est possible avec `apiTransactions: false`.
