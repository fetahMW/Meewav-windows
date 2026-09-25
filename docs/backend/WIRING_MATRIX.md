# Matrice de câblage Web

## Cible de la branche `task/profile-supabase-integration`

Cette branche part exactement de `codex/auth-page` au commit
`0d8f1319e0bebf536ccaec61014f6014edbcdf5c`. Elle intègre le Profil sans
modifier les tables ni les RPC Rooms v2 du chantier iOS.

> **NO-GO sur `supabase db push` vers le projet partagé.** La migration
> `20260716203000` ferme une fuite historique de PII en révoquant le
> `SELECT *` authentifié sur `profiles`. L'iOS actuel dépend encore de
> `ProfileRepository.streamProfile().select('*')` et d'écritures directes de
> champs privés. La branche Git Web peut être testée et poussée; les migrations
> ne doivent être appliquées qu'après migration coordonnée de ces appels iOS
> vers des RPC owner étroites. Les objets Rooms v2 ne sont pas modifiés.

> **Messagerie préparée, pas déployée.** Les six migrations Messaging du
> `20260718191000` au `20260718200000`, leurs services/hooks et les workspaces UI
> sont présents dans la branche. Elles n'ont pas été appliquées au projet
> Supabase partagé et les tests pgTAP `005` à `010` n'ont pas été exécutés contre
> PostgreSQL, faute d'instance locale ou de staging disponible.

| Fonction | Câblage de cette branche | Contrat après migration |
| --- | --- | --- |
| Session Supabase | Terminé | Provider unique, restauration de session et garde des routes privées. |
| Inscription et onboarding | Terminé | Inscription réelle puis écriture atomique de l'identité, du rôle, de l'avatar et de la visibilité. |
| Identité Auth | Terminé | 32 avatars proposés, 28 rôles professionnels + visiteur, clés stables et handle distinct du nom affiché. |
| Localisation | Terminé | Coordonnée exacte owner-only; projection kilométrique séparée pour les marqueurs publics du Globe. |
| Profil host | Terminé pour la lecture | Le dashboard et la pré-popup host lisent le contrat owner. Le bouton Modifier ouvre le dashboard au lieu de simuler une sauvegarde locale. |
| Profil public | Terminé | `public_profiles`, `public_profile_cards` et `profile_public_markers` excluent le PII et les coordonnées exactes. |
| Popup Globe visiteur | Terminé | Profil public, médias publiés, follow, Golden Like et demande de collaboration persistants. |
| Visibilité du host | Terminé | Le switch met à jour ensemble `show_on_public_profile` et `is_ghost_mode`, avec rollback visuel en cas d'échec. |
| Grade | Fondation terminée | Modèle canonique 1 à 6, badges officiels, ledger immuable et mutations serveur-only. |
| Notifications | Fondation terminée | Une demande de collaboration crée une notification idempotente; lecture limitée au destinataire. |
| Abonnements | Terminé | Follow/unfollow réel, anti-auto-follow, unicité et analytics serveur. |
| Golden Likes | Terminé | Limite quotidienne existante conservée, calcul sur la journée de Paris et compteur serveur. |
| Médiathèque | Terminé pour les contrats disponibles | Métadonnées `media_files`, bucket privé, publication publique contrôlée et archivage owner. |
| Statistiques | Terminé | Événements autorisés, agrégat quotidien immédiat et périodes réelles 7 jours, 30 jours et 12 mois. |
| Espace privé | Terminé en lecture | Transactions, contrats, matériel, invitations, session et MFA owner-only; aucune fausse mutation sensible. |
| MVT du Globe | Terminé | Le serveur de tuiles lit uniquement les marqueurs publics grossiers et retombe sans PII sur le catalogue local. |
| Messagerie | Câblage Web préparé | Conversations, messages, réactions, préférences, blocage, signalement, collaborations, pièces jointes privées, projets, groupes et invalidation Realtime privée disposent de migrations, services, hooks et UI. Validation SQL/RLS/Storage et déploiement restent à faire sur staging. |
| Setlists, Cadeaux, Cage | Différé explicitement | Restent locaux et cloisonnés par compte jusqu'aux contrats produit dédiés; aucune table Rooms v2 n'est détournée. |

## Volontairement différé

| Fonction | Pourquoi |
| --- | --- |
| Connexion par username | Doit passer par une Edge Function pour ne pas révéler l'e-mail lié au compte. |
| Profil viewer complet | C'est une feature distincte du profil host; les CTA correspondants restent désactivés plutôt que d'ouvrir une fausse page. |
| Compléments Messagerie | Stems/takes/mixes/feedback des projets, sessions/votes/projets liés des groupes, push, présence, typing, recherche avancée et modération opérationnelle restent différés. Les appels audio/vidéo appartiennent à Rooms/WebRTC. Voir [MESSAGING_SUPABASE_SPEC.md](./MESSAGING_SUPABASE_SPEC.md). |
| Paiement, retrait et solde réel | Nécessite un prestataire, des webhooks idempotents et un ledger serveur. |
| Signature de contrat | Nécessite identité, preuve, horodatage et fournisseur de signature. |
| Attribution de grade | Calcul serveur et audit métier requis. |
| Lancement réel d'une Cage/Room | Le domaine Rooms v2 est protégé; l'intégration viendra avec la feature Rooms. |
| Recommandations et classement | Nécessitent des signaux réels, des règles anti-abus et une observabilité dédiée. |

## Garde-fous de déploiement

1. Obtenir la validation explicite de la migration iOS du repository Profil
   (`select('*')`, identité/localisation privée et statut en ligne). Sans cette
   validation, s'arrêter au push Git de la branche Web.
2. Vérifier que l'historique local et distant concorde jusqu'à `20260715033000`.
3. Exécuter le dry-run et inventorier séparément les fondations Profil/Web puis
   les six migrations Messaging `20260718191000` à `20260718200000`. Aucun lot
   ne doit être poussé implicitement avec un autre.
4. Exécuter typecheck, tests unitaires, tests MVT, lint, build et audit npm.
5. Appliquer d'abord sur un projet Supabase isolé, jamais directement sur le
   projet partagé avec l'iOS.
6. Tester avec au moins trois utilisateurs temporaires : isolation owner/tiers,
   visibilité, follow, Golden Like, collaboration, notification, média, rollup
   analytics, messages, pièces jointes, projets, groupes et Broadcast privé.
7. Ne promouvoir vers un autre environnement qu'après suppression des comptes
   de test et validation de la matrice RLS.

## Ordre conseillé des prochains piliers

1. Messagerie : compiler et exécuter les migrations sur staging, lancer pgTAP et
   prouver RLS/Storage/Realtime à trois comptes avant toute promotion.
2. Shorts : publication et analytics réutilisables par Globe et Profil.
3. Marketplace : catalogue d'abord, paiement et ledger ensuite.
4. Tremplin : candidatures et workflow, puis scoring officiel.
5. Rooms Web : intégration finale avec les contrats v2 existants et revue iOS commune.

Cet ordre maximise la réutilisation et limite les migrations croisées.
