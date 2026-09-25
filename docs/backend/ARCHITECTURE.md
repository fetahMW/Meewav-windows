# Architecture backend Meewav Web

## Objectif

Le backend Web repose sur une identité unique Supabase et des domaines indépendants. Un pilier ne duplique jamais le profil, les médias ou les permissions d'un autre pilier.

## Sources de vérité

| Donnée | Source de vérité | Règle |
| --- | --- | --- |
| Identité de connexion | `auth.users` | Jamais lue directement depuis le navigateur hors session Supabase. |
| Profil privé du propriétaire | `public.profiles` | Accessible uniquement au propriétaire et au service role. |
| Profil visible par la communauté | projection `public.public_profiles` | Ne contient ni e-mail, ni téléphone, ni rue, ni coordonnées exactes. |
| Rôles et styles d'avatar | catalogues versionnés | Les interfaces stockent une clé stable, jamais un libellé traduit. |
| Grade | état et historique serveur | Niveaux canoniques 1 à 6. Le client ne peut ni attribuer ni modifier un grade. |
| Médias | `public.media_files` + Supabase Storage | La base contient les métadonnées; Storage contient l'objet. Le chemin commence par l'ID du propriétaire. |
| Relations | `public.follows` | Contrainte unique et interdiction de se suivre soi-même. |
| Notifications | `public.notifications` | Écriture par fonctions/triggers de domaine; lecture et acquittement par le destinataire. |
| Analytics | événements append-only + agrégats | Le navigateur émet des événements autorisés; les indicateurs affichés viennent d'agrégats. |
| Rooms | tables et RPC `*_v2` existants | Domaine protégé appartenant au chantier iOS/Rooms. Cette branche ne le modifie pas. |

## Frontières des sept espaces produit

### Globe

Le Globe consomme uniquement une projection publique et ses propres données cartographiques. Il ne doit jamais lire `profiles` pour obtenir des coordonnées privées.

### Messagerie

Le futur domaine utilisera l'identité `auth.users.id` et référencera les médias existants. Il devra séparer conversations, membres, messages, accusés de lecture et pièces jointes. La suppression logique, le blocage et la modération seront conçus avant le temps réel.

### Rooms

Les tables et RPC `rooms_*_v2` restent inchangés. Toute évolution nécessitera une revue de compatibilité iOS/Web et une migration dédiée, jamais une modification silencieuse dans une migration Profil.

### Shorts

Un Short référencera un média canonique. Publication, visibilité et modération seront des états serveur. Les vues et interactions alimenteront les événements analytics sans modifier directement les compteurs.

### Marketplace

Les annonces, commandes et événements de commande seront séparés. Les montants, paiements, remboursements et retraits seront exclusivement pilotés par le serveur et par les webhooks du prestataire de paiement.

### Tremplin

Programmes, candidatures, étapes, jurys et résultats seront séparés. Les scores officiels et changements d'étape seront des opérations serveur auditables.

### Profil

Le Profil agrège les données autorisées des autres domaines mais ne devient pas leur base métier. Il peut afficher une vente ou une Room; il ne crée pas une seconde table de commandes ou de Rooms.

## Contrats d'identité

- `user_id` désigne toujours `auth.users.id`.
- L'identifiant du profil propriétaire est le même UUID que l'utilisateur.
- Les ressources métier utilisent leur propre UUID et un `owner_user_id` ou `user_id` explicite.
- Les libellés visibles sont modifiables; les clés de catalogue sont stables.
- Les données publiques sont lues via une vue ou une RPC explicitement limitée.

## Autorisation

1. RLS est activé sur toute table exposée à PostgREST.
2. Une politique owner ne remplace jamais une projection publique sûre.
3. Les fonctions `security definer` fixent leur `search_path`, valident `auth.uid()` et exposent le minimum de données.
4. Le rôle `anon` ne reçoit aucun droit d'écriture métier.
5. Les opérations financières, la signature, les grades, la modération et les résultats officiels restent serveur-only.
6. Le service role n'est jamais inclus dans le bundle Vite.

## Évolution du schéma

- L'historique distant est conservé dans `supabase/migrations`.
- Une migration déjà appliquée n'est jamais réécrite.
- Les migrations Web non appliquées et devenues dangereuses sont archivées hors du chemin de push.
- Chaque migration nouvelle est additive, rejouable lorsque cela est pertinent et accompagnée de tests RLS.
- Un `db push` n'est exécuté qu'après comparaison de l'historique, dry-run, revue SQL et plan de retour arrière.

## Qualité attendue

- Typecheck de non-régression et erreurs historiques visibles.
- ESLint, tests unitaires, build production et E2E en CI.
- Tests contractuels des politiques anonymes, owner et utilisateur tiers.
- Aucun PII, token ou session dans les logs.
- Aucun mode démo silencieux en production.

