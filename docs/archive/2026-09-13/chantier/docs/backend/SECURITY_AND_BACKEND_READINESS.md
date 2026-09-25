# Audit backend et sécurité — Web Profil

Date : 16 juillet 2026
Branche : `task/profile-supabase-integration`
Base exacte : `codex/auth-page@0d8f1319e0bebf536ccaec61014f6014edbcdf5c`

## Décision de déploiement

La branche Git Web peut être validée et poussée. Les migrations Supabase ne
doivent pas être appliquées au projet partagé pour le moment.

La migration `20260716203000` révoque le `SELECT *` authentifié historique sur
`profiles`, qui permet à un compte connecté de lire les champs privés des
profils publics. L'iOS actuel dépend encore de ce même `SELECT *` pour le stream
du profil propriétaire et écrit directement l'identité/localisation privée.
Fermer la fuite sans adapter l'iOS casserait ce flux; conserver le droit
laisserait la fuite ouverte. Le passage par des RPC owner étroites doit donc être
coordonné avant tout `supabase db push` partagé.

Les tables et RPC Rooms v2 n'ont pas été modifiés.

## Prêt côté Web

| Domaine | Contrat prêt |
| --- | --- |
| Auth/session | Session partagée, routes privées, onboarding et cache sensible nettoyé à la déconnexion. |
| Profil public | Vues sans e-mail, téléphone, date de naissance, adresse ni coordonnées exactes. |
| Profil propriétaire | Lecture privée par RPC; édition limitée aux colonnes owner autorisées. |
| Localisation | Coordonnée exacte séparée; marqueur public kilométrique. |
| Rôles/avatars | 28 rôles professionnels + visiteur, 32 styles, rôle primaire synchronisé atomiquement. |
| Social Globe | Follow, Golden Like et demande de collaboration persistants et idempotents. |
| Médias | Métadonnées owner, objet Storage privé, publication contrôlée, projection publique nettoyée. |
| Grades | Référentiel 1–6 et ledger serveur immuable. |
| Analytics | Événements allowlistés, propriétés PII rejetées, limites anti-abus et rollup quotidien O(1). |
| Espace privé | Lecture owner uniquement; transactions, contrats, badges et autres écritures d'autorité réservés au serveur. |

## Bloqueurs avant application des migrations

1. Adapter le repository iOS Profil : remplacer le stream `select('*')` par un
   événement Realtime suivi d'un refetch RPC owner, et déplacer les écritures
   privées vers des RPC dédiées.
2. Faire pointer les lectures Rooms de profils vers `public_profiles`
   (`id, username, avatar_url` suffit déjà au code actuel).
3. Tester les migrations et les trois suites pgTAP sur un projet Supabase isolé.
   Le parseur PostgreSQL et le dry-run CLI ne remplacent pas une exécution réelle.
4. Tester avec deux comptes temporaires l'isolation owner/tiers, les profils
   fantômes, les limites sociales, Storage et les rollups.
5. Retirer le journal de mot de passe actuellement présent dans le changement
   iOS `auth_screen.dart` avant toute build distribuée.

## Fonctions volontairement non simulées comme backend

| Fonction | Décision |
| --- | --- |
| Cadeaux | UI locale de préparation, isolée par compte; envoi réel différé à Messagerie/Rooms. |
| Setlists | Brouillon local isolé par compte; publication dans le mixeur différée au contrat Rooms. |
| Cage | Configuration locale isolée par compte; aucun lancement de Room n'est persisté par cette branche. |
| Solde/retrait | Aucune valeur financière client ne fait autorité. Prestataire + webhooks + ledger requis. |
| Contrats/signature | Lecture uniquement jusqu'au fournisseur de signature et à la preuve d'identité. |
| Badges/grade | Attribution uniquement par service role et événements métier vérifiés. |

## Architecture des prochains piliers

1. **Messagerie** : conversations, memberships, messages, pièces jointes,
   blocage/modération et notifications. Le bouton Contacter ne doit être activé
   qu'avec ce contrat.
2. **Shorts** : réutiliser `media_files`, publication, modération et analytics;
   ne pas créer un second stockage média.
3. **Marketplace** : catalogue et commandes séparés du ledger de paiement;
   toute écriture financière vient de webhooks idempotents.
4. **Tremplin** : candidatures et workflow auditable, puis scoring serveur.
5. **Rooms** : intégrer le Web aux contrats v2 après la revue iOS commune;
   Cage et Setlist référencent alors des identifiants Rooms réels.

## Dettes transversales hors branche Profil

- Le serveur MVT historique possède encore des routes de debug/legacy et un
  endpoint musiciens à auditer avant exposition Internet; le nouveau chemin Web
  utilise uniquement les marqueurs publics grossiers.
- Les politiques Rooms historiques doivent faire l'objet d'une revue coordonnée
  iOS/Web avant le pilier Rooms. Elles ne sont pas modifiées ici.
- Le bundle Web principal reste volumineux; prévoir du code splitting par pilier
  avant les pages Shorts/Marketplace/Tremplin.

## Validation exigée

- `git diff --check`
- typecheck normal et CI
- tests unitaires Web
- lint sans erreur
- build production
- tests MVT et audits npm
- parsing PostgreSQL des migrations et tests
- dry-run Supabase ne listant que `203000`, `204000`, `205000`, `210000`, `211000`
- exécution pgTAP réelle sur projet isolé avant tout déploiement partagé
