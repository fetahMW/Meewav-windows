# Portraits ronds → préprofil

## Règle produit

Un clic ou une activation au clavier sur le portrait rond d’une **personne** ouvre son préprofil : pop-up sur le site et Windows, bottom sheet sur Android. Seul le module **Volumes** est exempté. L’onglet Invités et les outils Wave, Cage, Classe et Place sont concernés.

Le reste d’une ligne conserve son action : ouvrir une conversation, sélectionner un contact, inviter, choisir une boucle. Les pochettes, couvertures de groupes/projets, illustrations, boutons de lecture et grandes cartes de sélection ne sont pas des portraits ronds personnels.

## Contrat partagé

- Windows/web : `src/components/shared/portraitPreProfile.ts`, `PortraitPreProfileHost.tsx`, `PortraitPreProfileDialog.tsx`.
- Android : mêmes fichiers dans `app/src/main/shared-ui`; les copies vendor réexportent le contrat. Les racines Messaging, Profile, Tremplin et MobileFeatureShell montent le host.
- `portraitProps({id, name, avatarUrl, role, gradeLevel})` s’applique au portrait seul. Clic, Entrée et Espace empêchent l’action de la ligne parente.
- `openPortraitPreProfile(person, trigger)` permet aux boutons existants d’ouvrir le même préprofil.
- Ne jamais fournir un ID de conversation, d’invitation, de candidature Cage ou de boucle à la place d’un ID de profil.
- DM live : `counterpart_profile_id` → `DemoConversation.profileId`. Collaboration : `userId`. Membre : `profile_id`. Artiste : `profileId` canonique, ID de fixture seulement pour les données de démonstration.
- Un compte supprimé ou une identité absente ne reçoit pas de lien inventé. Les couvertures de groupe/projet n’ouvrent pas de profil personnel.
- La garde `data-preprofile-exempt="volumes"` est posée sur le panneau Volumes.

## Présentation et navigation

Le contenu reprend `PreProfileFrame` et `HoverPreProfileContent`, avec la matière graphite et le verre poli existants. Les UUID réels sont hydratés par l’API du préprofil; les fixtures gardent leur identité de démonstration.

Le host ferme sur changement de route. Le dialogue gère Échap, clic extérieur, focus clavier et retour au déclencheur. Android conserve le bouton Retour système; le handle permet une fermeture par glissement vers le bas. Les portraits du Viewer et du Tremplin Android utilisent cette même sheet. Le préprofil Globe et les sheets Compose déjà fonctionnelles sont conservés. Les petits portraits d’invitation et d’actions invités Compose sont reliés au host natif existant.

« Voir profil » ouvre la fiche publique. « Contacter » transmet l’identité réelle à la messagerie. Le propriétaire garde ses actions de propriétaire. La sheet Rooms conserve aussi « Offrir ». Les médias de démonstration absents d’une feature Android sont servis depuis le manifeste local Rooms, dans le seul namespace `media/preprofile-demo/`, sans recopier les vidéos dans chaque bundle.

## Complément Supabase déployé

Migration : `supabase/migrations/20260929160000_public_endorser_preprofiles.sql`.

Elle ajoute `profile_id` aux émetteurs d’éloges déjà exposés par `get_profile_certif_summary_v1`. Les filtres de visibilité publique, mode fantôme, classement du dernier état et permissions restent identiques. Les avatars privés utilisent les IDs de contrepartie déjà disponibles.

**Migration déployée le 29 septembre 2026 à 16:07 UTC** sur le projet commun Android / Windows / Web (dqabekaqpznjsagoxzwc). Application ciblée dans une transaction PostgreSQL via TLS vérifié; version enregistrée dans l'historique Supabase. Le corps de la fonction a été contrôlé après commit, les droits, le propriétaire et les filtres existants sont conservés. L'appel RPC public a réussi; le profil public échantillonné ne contenait aucun éloge public, donc ce contrôle ne remplace pas un essai visuel sur une carte renseignée. Rapport local Android : app/build/reports/portrait-migration/deployment.json.

## Vérifications techniques

Tests dédiés : isolation du clic portrait / action de ligne, clavier, exception Volumes, identité absente, fermeture lors de navigation, conservation du véritable ID de l’interlocuteur, action de profil complet, DM réel, propriétaire et fermeture Échap.

Les compilations et tests ne constituent pas une validation visuelle ou un test de communication Supabase entre appareils. Le rendu reste à valider par l’utilisateur, conformément à sa demande.
