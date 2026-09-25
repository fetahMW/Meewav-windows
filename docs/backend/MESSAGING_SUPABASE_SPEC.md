# Messagerie Meewav — spécification de câblage Supabase

Statut au 18 juillet 2026 : implémentation Web préparée sur la branche de travail,
non déployée sur Supabase.

Les migrations SQL, repositories, hooks, adaptateurs et surfaces UI de la
Messagerie sont présents dans le dépôt. Les tests TypeScript ciblés et le
typecheck ont été exécutés pendant le développement. En revanche, les migrations
n'ont pas été appliquées au projet Supabase partagé et les suites pgTAP n'ont pas
été exécutées contre PostgreSQL, faute d'instance locale ou de staging disponible.
Leur présence dans le dépôt ne constitue donc pas une validation de déploiement.

### État d'implémentation actuel

| Domaine | État dans le dépôt | Validation restante |
| --- | --- | --- |
| Conversations, messages, réactions, préférences, blocage et signalement | Migration, service, hook et UI câblés | Exécuter la migration et les tests RLS/pgTAP sur une base isolée |
| Collaborations Globe/Messagerie | Workflow persistant, transitions, acceptation vers conversation et UI câblés | Tester les transitions concurrentes et l'isolation à trois comptes |
| Pièces jointes | Bucket privé, réservation/finalisation, messages et collaborations avec fichiers, file d'upload et UI préparés | Exécuter les policies Storage et tester les URL signées sur staging |
| Projets créatifs | Projet, membres, invitations, tâches, activité, conversation et workspace UI câblés | Stems, takes, mixes et feedback restent différés |
| Groupes d'artistes | Groupe, membres, invitations, rôles, préférences, activité et workspace UI câblés | Sessions, votes et liaisons de projets restent différés |
| Temps réel | Broadcast privé par utilisateur, payload minimal et rechargement des projections RPC préparés | Vérifier la compilation SQL et l'absence de fuite avec trois comptes |
| Appels audio/vidéo | Non implémentés | Différés au pilier Rooms/WebRTC |

Les migrations préparées, dans l'ordre, sont :

1. `20260718191000_meewav_messaging_foundation_v1.sql` ;
2. `20260718192000_messaging_collaboration_workflow_v1.sql` ;
3. `20260718193000_messaging_projects_core_v1.sql` ;
4. `20260718194000_messaging_attachments_v1.sql` ;
5. `20260718195000_messaging_artist_groups_core_v1.sql` ;
6. `20260718200000_messaging_realtime_broadcast_v1.sql`.

Les fichiers `005` à `010` de `supabase/tests/database` couvrent les contrats
pgTAP correspondants. Ils sont écrits mais non exécutés contre une base réelle.

## 1. Résultat attendu

La Messagerie Web doit conserver l'interface actuelle tout en remplaçant les
données de démonstration, les états React éphémères, les URL blob et le pont
localStorage par une source de vérité Supabase sécurisée.

Le domaine couvre quatre espaces :

1. Messages directs et conversations à plusieurs.
2. Demandes de collaboration.
3. Projets créatifs.
4. Groupes d'artistes.

Le Globe et le Profil peuvent ouvrir une conversation ou une demande précise par
lien profond, sans dupliquer la donnée. Les futurs piliers réutiliseront ce même
contrat lorsqu'ils seront intégrés.

## 2. Garde-fous non négociables

- L'identité canonique est auth.users.id et correspond à profiles.id.
- Ne pas modifier les tables ou RPC rooms_*_v2. Le chat d'une Room reste un
  domaine distinct de la Messagerie.
- Ne pas casser les lectures iOS existantes de profiles.
- `public.collaboration_requests` est désormais **RPC-only en lecture** pour les
  clients : aucun client iOS supporté ne doit encore exécuter de `SELECT` direct
  sur cette table. Toute occurrence est un blocage de release, pas un motif pour
  réouvrir la table.
- Les migrations Messagerie suppriment d'anciens overloads RPC. Avant de les
  appliquer, inventorier les signatures appelées par chaque binaire iOS encore
  supporté ou publié. Si l'une d'elles est encore utilisée, conserver une couche
  de compatibilité additive ou migrer le client avant le retrait.
- Un staging isolé peut servir à la validation croisée, mais aucune promotion des
  migrations Messagerie vers le projet partagé ou la production n'est autorisée
  sans validation iOS explicite et documentée de ces deux contrats.
- Ne pas exécuter supabase db push sur le projet partagé tant que la migration
  d'identité 20260716203000 n'a pas été coordonnée avec la release iOS.
- Le projet Supabase partagé s'arrête actuellement à la migration
  20260715033000. Aucune des cinq fondations datées du 16 juillet n'y est
  appliquée. Le développement doit donc utiliser un Supabase local ou un projet
  de staging isolé.
- Le projet partagé possède encore une policy notifications autorisant un INSERT
  public avec une condition toujours vraie. Aucun temps réel Messagerie ne part
  en production avant son durcissement coordonné et testé avec l'iOS.
- Les transitions d'autorité ne sont jamais confiées à un simple update client :
  acceptation d'une collaboration, rôles, invitations, suppression, validation
  et permissions passent par des RPC étroites.
- Le client ne choisit jamais sender_id, actor_id ou author_id. Ces valeurs
  viennent toujours de auth.uid().
- Les fichiers restent privés. Une URL signée, courte et contrôlée est fournie
  seulement aux membres autorisés.
- Aucune promesse de chiffrement de bout en bout dans la première version. Les
  données sont protégées par TLS, Storage privé, RLS et chiffrement au repos.
- Les appels audio et vidéo sont différés vers le domaine Rooms/WebRTC. Les
  boutons ne doivent pas simuler un appel backend inexistant.

## 3. Audit de l'interface actuelle

| Surface | État de l'interface | Source live préparée | Limite actuelle |
| --- | --- | --- | --- |
| Liste des conversations | Recherche, filtres, non lus, sélection et préférences câblés | `messaging.service.ts` + `useMessagingLive.ts` | Validation SQL et E2E multi-comptes en attente |
| Conversation | Texte, pagination, lecture et réactions câblés | RPC Messagerie v1/v2 | Temps réel non validé contre Supabase déployé |
| Fichiers | Image, vidéo, PDF, audio, vocal et Track Pack intégrés à la file d'upload | Storage privé + `useMessagingAttachmentsLive.ts` | Scanner asynchrone et reprise multipart différés |
| Collaboration | Reçue, envoyée, acceptée, refusée, annulée et pièces jointes câblées | `collaboration_requests` + RPC d'état | Tests de concurrence sur base réelle en attente |
| Projets | Membres, invitations, tâches, activité et chat projet câblés | `messaging.projects.service.ts` + hook live | Stems, takes, mixes et feedback différés |
| Groupes | Membres, invitations, rôles, préférences, activité et chat groupe câblés | `messaging.groups.service.ts` + hook live | Sessions, votes et projets liés différés |
| Blocage et signalement | Actions live câblées sans succès simulé | RPC étroites fondation v1 | Workflow de modération opérationnelle différé |
| Appels | Boutons sans faux appel backend | Aucun | Différé vers Rooms/WebRTC |

Tout déplacement visuel, ouverture de panneau, onglet actif, lecture audio locale,
volume, solo/mute de préécoute et brouillon non envoyé restent des états du client.
Ils ne doivent pas provoquer d'écriture en base.

Points historiques désormais traités par le câblage préparé :

- Les liens `/messages` issus du Globe sont interprétés et orientent vers le bon
  espace, la bonne conversation ou la bonne collaboration.
- Le commit de référence db75e14a garde maintenant le chat d'un groupe dans son
  espace Groupe. Ce comportement visuel doit rester ainsi. En base, ce chat
  réutilise néanmoins le moteur messaging_messages grâce à la liaison groupe /
  conversation.
- Les pièces jointes et Track Packs utilisent les identifiants serveur, l'ordre
  et les métadonnées validées plutôt que des blobs durables ou des remplacements
  de démonstration.
- Les capacités encore absentes côté serveur sont annoncées comme indisponibles
  en mode live ; aucune présence, aucun vote et aucun succès ne sont simulés.

## 4. Réutilisation des fondations existantes

### 4.1 À réutiliser

- public.profiles pour l'identité et le profil affiché.
- public.notifications pour les alertes persistantes et leur lecture.
- public.media_files pour toutes les métadonnées de fichiers.
- public.media_files reste le catalogue canonique. La migration Pièces jointes
  prépare le bucket privé `messaging-attachments`, ses policies de membership et
  les réservations d'upload ; ces objets ne sont pas encore déployés.
- public.collaboration_requests pour les demandes créées depuis le Globe.
- public.analytics_events pour les événements métier validés côté serveur.

### 4.2 À ne pas dupliquer

- Aucun second catalogue de médias.
- Aucun second système de notifications.
- Aucun profil privé copié dans une conversation.
- Aucun message de Room copié dans messaging_messages.
- Aucun grade calculé depuis la Messagerie.

## 5. Modèle de données cible

Cette section décrit la cible produit complète. Le noyau réellement préparé est
celui résumé au début du document. En particulier, les stems, mixes, takes et
feedback de projet ainsi que les sessions, décisions, votes et liaisons de
projets de groupe ne sont pas dans les migrations actuelles.

Toutes les tables métier utilisent UUID, created_at, updated_at lorsque pertinent
et une suppression logique quand une restauration ou un audit est nécessaire.

### 5.1 Sécurité transversale

#### user_blocks

- blocker_profile_id
- blocked_profile_id
- reason_code facultatif
- created_at
- contrainte interdisant le blocage de soi-même
- unicité blocker_profile_id + blocked_profile_id

Effet : empêche une nouvelle conversation directe, un nouveau message direct et
une nouvelle demande de collaboration dans les deux sens. Les contenus antérieurs
restent accessibles selon la politique produit, mais aucun temps réel nouveau
n'est livré.

#### content_reports

- reporter_profile_id
- subject_type : message, conversation, collaboration, project, group, profile
- subject_id
- category
- comment nettoyé et limité
- status : open, reviewing, resolved, dismissed
- created_at, resolved_at

Seul le déclarant voit son signalement. Seul le service de modération voit et
modifie l'ensemble.

### 5.2 Conversations et messages

#### messaging_conversations

- id
- kind : direct, group, project
- created_by_profile_id
- title facultatif pour les conversations non directes
- avatar_media_id facultatif
- last_message_id facultatif
- last_message_at
- metadata JSON borné et versionné
- created_at, updated_at, deleted_at

Une conversation group ou project référence son objet métier via une table de
liaison dédiée afin de ne pas mélanger les règles RLS.

#### messaging_direct_pairs

- conversation_id, clé primaire
- profile_low_id
- profile_high_id
- contrainte profile_low_id < profile_high_id
- unicité profile_low_id + profile_high_id

Cette table garantit qu'une paire de profils ne crée pas plusieurs conversations
directes lors de doubles clics ou de requêtes concurrentes.

#### messaging_conversation_members

- conversation_id
- profile_id
- role : owner, admin, member
- joined_at, left_at
- last_read_sequence, last_read_at
- pinned_at
- muted_until
- archived_at
- hidden_before_sequence facultatif pour supprimer uniquement chez soi
- notifications_enabled
- clé primaire conversation_id + profile_id

Les préférences sont propres au membre. Épingler ou archiver une conversation ne
modifie jamais l'affichage des autres membres.

#### messaging_messages

- id
- conversation_id
- sender_profile_id
- client_message_id
- sequence bigint croissant dans la conversation
- kind : text, audio, image, video, file, track_pack, brief, system
- body nettoyé et borné
- payload JSON versionné et borné
- reply_to_message_id facultatif
- collaboration_request_id facultatif
- edited_at, deleted_at
- moderation_status : visible, hidden, quarantined
- created_at
- unicité sender_profile_id + client_message_id
- unicité conversation_id + sequence

client_message_id rend l'envoi idempotent : une reprise réseau ne crée pas un
deuxième message.

#### messaging_message_reactions

- message_id
- profile_id
- emoji issue d'une liste autorisée
- created_at
- unicité message_id + profile_id + emoji

#### messaging_message_attachments

- id
- message_id
- media_file_id
- sort_order
- attachment_role : primary, stem, cover, preview, document
- label facultatif
- duration_ms, bpm, musical_key facultatifs
- metadata JSON borné
- created_at
- unicité message_id + media_file_id

Le fichier canonique reste media_files. Cette table ne stocke que sa fonction dans
le message.

### 5.3 Demandes de collaboration

public.collaboration_requests reste la source canonique.

Ajouts :

#### collaboration_request_attachments

- request_id
- media_file_id
- sort_order
- label facultatif
- created_at

#### collaboration_request_participant_state

- request_id
- profile_id
- viewed_at
- archived_at
- clé primaire request_id + profile_id

Le mapping interface est :

- pending = en attente
- accepted = acceptée
- declined = refusée
- cancelled = annulée par l'expéditeur
- expired = expirée

L'acceptation doit être atomique : vérifier le destinataire, changer l'état,
créer ou retrouver la conversation directe, y écrire un message système lié à la
demande, puis notifier les participants.

### 5.4 Projets créatifs

#### creative_projects

- id, owner_profile_id, name, description
- status : in_progress, completed, archived
- genre, bpm, musical_key, objective, delivery_at, milestone
- cover_media_id
- current_take_id facultatif
- created_at, updated_at, archived_at, deleted_at

#### creative_project_members

- project_id, profile_id
- role : owner, admin, contributor, viewer
- can_edit, can_invite, can_manage_members, can_manage_stems,
  can_create_tasks
- invited_by, invited_at, joined_at, left_at

#### creative_project_invitations

- id, project_id
- inviter_profile_id, invited_profile_id
- proposed_role et permissions proposées
- status : pending, accepted, declined, cancelled, expired
- idempotency_key, created_at, responded_at

Une invitation n'ajoute jamais immédiatement un membre actif.

#### creative_project_stems

- id, project_id, media_file_id
- label, sort_order, bpm, musical_key, duration_ms
- added_by_profile_id, created_at, deleted_at

Mute, solo, volume et position de lecture sont locaux. Ils ne sont pas des champs
de la stem partagée.

#### creative_project_mixes

- id, project_id, media_file_id
- name, version_number, created_by_profile_id, created_at

#### creative_project_takes

- id, project_id, name, version_number, description
- created_by_profile_id, created_at
- is_current

#### creative_project_take_stems

- take_id, stem_id
- stem_snapshot JSON borné
- sort_order

Cette table fige la composition d'une take sans réécrire l'historique.

#### creative_project_tasks

- id, project_id, title, description
- assigned_profile_id
- status : todo, in_progress, done
- due_at, created_by_profile_id, completed_at

#### creative_project_feedback

- id, project_id
- target_type : take, stem, timeline
- target_id facultatif
- timeline_ms facultatif
- type : technical, creative, validation, question
- status : open, in_progress, resolved
- author_profile_id, body, created_at, resolved_at
- parent_feedback_id facultatif pour les réponses

#### creative_project_conversations

- project_id, conversation_id
- unicité des deux côtés

Le chat projet utilise messaging_messages. Il n'existe pas de deuxième table de
messages projet.

#### creative_project_activity

Journal append-only : membre invité, rôle changé, stem ajoutée, take créée, tâche
terminée, projet archivé. Les entrées d'autorité sont écrites côté serveur.

### 5.5 Groupes d'artistes

#### artist_groups

- id, owner_profile_id, name, description, style facultatif
- cover_media_id
- visibility : private, unlisted
- status : active, archived
- created_at, updated_at, deleted_at

#### artist_group_members

- group_id, profile_id
- role : owner, admin, member
- status : invited, active, away, left
- invited_by, invited_at, joined_at, left_at
- notifications_enabled

#### artist_group_invitations

- id, group_id
- inviter_profile_id, invited_profile_id
- proposed_role
- status : pending, accepted, declined, cancelled, expired
- idempotency_key, created_at, responded_at

Le propriétaire est toujours présent dans artist_group_members ; il n'est pas
seulement compté par l'interface.

#### artist_group_sessions

- id, group_id, title, description, starts_at, ends_at
- location_type : online, physical
- room_id facultatif, créé uniquement lorsque le domaine Rooms est prêt
- created_by_profile_id, cancelled_at

#### artist_group_session_attendance

- session_id, profile_id
- response : pending, confirmed, declined
- responded_at

#### artist_group_decisions

- id, group_id, title, description
- status : open, closed, cancelled
- closes_at, created_by_profile_id, closed_at

#### artist_group_decision_options

- id, decision_id, label, sort_order

#### artist_group_votes

- decision_id, option_id, profile_id, created_at, updated_at
- unicité decision_id + profile_id

#### artist_group_projects

- group_id, project_id, linked_by_profile_id, created_at

#### artist_group_conversations

- group_id, conversation_id
- unicité des deux côtés

#### artist_group_activity

Journal append-only des invitations, rôles, sessions, votes fermés, projets liés
et actions sensibles.

## 6. Contrats RPC

Les lectures simples peuvent utiliser des vues privées sous RLS. Les écritures
suivantes passent par des fonctions :

### 6.1 Messages

- get_or_create_direct_conversation(other_profile_id, idempotency_key)
- create_group_conversation(title, member_ids, idempotency_key)
- list_my_conversations(cursor, limit, kind, unread_only, search)
- get_conversation_messages(conversation_id, before_sequence, limit)
- send_message(conversation_id, client_message_id, kind, body, payload,
  media_file_ids)
- edit_message(message_id, body, expected_updated_at)
- delete_message_for_everyone(message_id)
- hide_conversation_for_me(conversation_id, through_sequence)
- mark_conversation_read(conversation_id, through_sequence)
- set_conversation_preferences(conversation_id, pinned, muted_until, archived)
- toggle_message_reaction(message_id, emoji)
- search_messageable_profiles(query, cursor, limit)

send_message vérifie l'adhésion, le blocage, le type de payload, les médias, le
quota et l'idempotence dans une seule transaction.

### 6.2 Collaborations

- list_my_collaboration_requests(direction, status, cursor, limit)
- request_messaging_collaboration(recipient_id, message, media_file_ids,
  idempotency_key)
- mark_collaboration_request_viewed(request_id)
- respond_to_collaboration_request(request_id, decision, idempotency_key)
- cancel_collaboration_request(request_id, idempotency_key)

La fonction existante request_profile_collaboration reste dédiée au Globe. Il ne
faut pas autoriser librement le client à falsifier source = messaging.

### 6.3 Projets

- create_creative_project
- update_creative_project
- invite_project_member
- respond_to_project_invite
- update_project_member_permissions
- remove_or_leave_project
- add_project_stem_from_media
- delete_project_stem
- create_project_take
- set_current_project_take
- create_or_update_project_task
- create_project_feedback
- resolve_project_feedback
- archive_or_complete_project
- delete_project

### 6.4 Groupes

- create_artist_group
- invite_group_member
- respond_to_group_invite
- update_group_member_role
- remove_or_leave_group
- create_group_session
- respond_to_group_session
- create_group_decision
- cast_group_vote
- close_group_decision
- link_group_project
- archive_or_delete_group

Chaque RPC renvoie une erreur métier stable, par exemple authentication_required,
not_a_member, blocked_relationship, permission_denied, invalid_transition,
idempotency_conflict ou rate_limit. L'interface traduit ces codes sans analyser
le texte SQL.

## 7. RLS et droits

| Ressource | Lecture | Création | Modification | Suppression |
| --- | --- | --- | --- | --- |
| Conversation | membres actifs | RPC | préférences propres ou RPC admin | logique via RPC |
| Message | membres actifs | send_message | auteur dans délai produit | logique via RPC |
| Réaction | membres actifs | membre sur son identité | son identité | son identité |
| Pièce jointe | membres actifs | via finalisation RPC | aucune mutation arbitraire | avec message |
| Collaboration | expéditeur/destinataire | RPC | transition autorisée par rôle | archivage personnel |
| Projet | membres actifs | RPC | permission explicite | owner via RPC |
| Groupe | membres actifs | RPC | admin/owner selon action | owner via RPC |
| Report | déclarant pour le sien | utilisateur authentifié | service de modération | service |

Fonctions helper nécessaires :

- is_conversation_member(conversation_id, profile_id)
- has_project_permission(project_id, profile_id, permission)
- is_group_member(group_id, profile_id)
- is_group_admin(group_id, profile_id)
- profiles_are_blocked(profile_a, profile_b)

Elles sont SECURITY DEFINER, ont un search_path fixe, ne sont pas exécutables
directement par anon et évitent les récursions RLS.

Tests obligatoires : un troisième utilisateur ne doit jamais lire un message, un
fichier signé, un projet, un groupe ou un événement temps réel auquel il
n'appartient pas.

## 8. Storage

Le remote ne possède aujourd'hui que des buckets publics historiques et des
buckets Rooms. Aucun ne convient à une pièce jointe privée. La migration
`20260718194000_messaging_attachments_v1.sql` prépare donc le bucket privé dédié
`messaging-attachments`, ses policies RLS, les réservations d'upload et les
liaisons à `public.media_files`. Rien de ce bloc n'est actif sur le projet partagé
avant un déploiement contrôlé et la validation de compatibilité iOS.

### 8.1 Chemin canonique

Le chemin commence toujours par l'identité du propriétaire :

profile_id/conversation_id/upload_id/original

Les variantes générées utilisent des suffixes contrôlés par le serveur. Le nom de
fichier local n'est jamais exposé comme métadonnée publique.

### 8.2 Flux d'envoi

1. `prepare_messaging_upload_v1` réserve un upload et son objet canonique.
2. Le navigateur envoie l'objet dans le bucket privé.
3. `finalize_messaging_upload_v1` vérifie propriétaire, chemin, taille, MIME et
   checksum.
4. Un scanner ou worker marque ready ou failed.
5. `send_message_v2` accepte uniquement un média prêt appartenant à l'expéditeur
   et non déjà attaché ailleurs de manière interdite.

La migration limite chaque objet à 50 Mio au maximum, avec des seuils plus bas
pour les images, documents et notes vocales. Un Track Pack accepte au plus huit
pièces et 200 Mio au total. Ces quotas doivent encore être éprouvés sur staging
et suivis par un budget de bande passante par utilisateur.

### 8.3 Types initiaux

- audio : audio/webm, audio/ogg, audio/mpeg, audio/wav
- image : image/jpeg, image/png, image/webp
- vidéo : video/mp4, video/webm
- document : application/pdf et types explicitement autorisés

L'extension du nom ne suffit jamais à valider le type.

## 9. Temps réel

- La migration `20260718200000_messaging_realtime_broadcast_v1.sql` prépare un
  canal Broadcast privé par utilisateur : `messaging:user:<auth.uid()>`.
- Les triggers émettent uniquement une enveloppe de changement minimale
  (domaine, entité, opération, table source et horodatage), sans texte de message,
  PII ni URL de fichier. Le client recharge ensuite la projection RPC autorisée.
- `useMessagingRealtime.ts` authentifie le canal privé, déduplique les rafales et
  conserve le polling des hooks métier comme filet de sécurité.
- La frappe et la présence ne sont pas encore persistées ni présentées comme une
  vérité serveur. Leur ajout éventuel utilisera Presence/Broadcast avec TTL.
- Aucun update de profiles.is_online à chaque frappe ou mouvement de souris.
- Le client recharge par curseur après reconnexion avant de reprendre le flux.
- Le flux est dédupliqué par message.id et client_message_id.
- Les événements ne contiennent pas de PII privée ou d'URL Storage durable.
- L'abonnement est détruit au changement de conversation et à la déconnexion.

Avant activation, la migration doit compiler sur PostgreSQL et un test à trois
utilisateurs doit démontrer qu'un non-membre ne reçoit ni payload, ni compteur,
ni signal d'une conversation privée. Ce test n'a pas encore été exécuté.

## 10. Notifications

La table public.notifications est réutilisée. Les notifications sont créées par
triggers ou fonctions serveur avec source_event_id idempotent.

Événements :

- nouveau message quand le destinataire n'est pas actif dans la conversation ;
- demande de collaboration reçue, acceptée ou refusée ;
- invitation ou changement important de projet ;
- tâche assignée et échéance ;
- invitation de groupe, session et décision à voter.

Le temps réel met à jour l'interface. La notification persistante alimente la
cloche. Le push mobile et l'e-mail sont une phase séparée via worker/Edge
Function, jamais depuis le navigateur.

Précondition distante : supprimer l'INSERT public sur notifications uniquement
après avoir vérifié si l'iOS l'utilise encore. La cible est une écriture par
fonctions/triggers serveur et une lecture/acquittement par le seul destinataire.
Ce durcissement doit être une migration dédiée et compatible ; il ne justifie pas
de pousser en bloc la migration d'identité actuellement bloquée.

## 11. Câblage front-end

L'interface ne doit pas connaître directement la forme SQL.

### 11.1 Couches

- `messaging.types.ts`, `messaging.adapters.ts` et `messaging.service.ts` :
  conversations, messages, lecture, réactions, blocage et signalement.
- `messaging.collaboration.*` et `useMessagingCollaborationsLive.ts` : liste et
  transitions de collaboration.
- `messaging.attachments.*` et `useMessagingAttachmentsLive.ts` : préparation,
  upload, finalisation, retry et projection des pièces jointes.
- `messaging.projects.*` et `useMessagingProjectsLive.ts` : projets, membres,
  invitations, tâches, activité et conversation liée.
- `messaging.groups.*` et `useMessagingGroupsLive.ts` : groupes, membres,
  invitations, rôles, préférences et activité.
- `useMessagingRealtime.ts` : invalidation privée par Broadcast et rechargement
  des projections autorisées.
- `MessagingPage.tsx`, `MessageWorkspace.tsx`, `CollabsWorkspace.tsx`,
  `ProjectsWorkspace.tsx` et `ArtistGroupsWorkspace.tsx` : intégration UI live.

Le SupabaseClient est injecté aux repositories pour permettre les tests. Le
provider Demo reste disponible uniquement comme fallback explicite de
développement ; il ne doit jamais s'activer silencieusement en production ni
être présenté comme une mutation réussie.

### 11.2 État optimiste

Un message local passe par :

draft -> uploading -> pending -> sent

et peut devenir failed. Retry réutilise le même client_message_id. L'interface
affiche l'erreur et ne supprime pas le brouillon.

### 11.3 Liens profonds

- /messages?space=messages&conversation=UUID
- /messages?space=collabs&request=UUID
- /messages?space=projects&project=UUID
- /messages?space=groups&group=UUID

Le bouton Message d'une popup Globe appelle get_or_create_direct_conversation
puis navigue vers la conversation. Le bouton Collaboration crée la demande puis
ouvre son identifiant. Aucun objet complet n'est transporté dans l'URL.

## 12. Plan de migrations

Les six migrations suivantes sont écrites, ordonnées et accompagnées de tests
pgTAP statiques. Elles n'ont été ni déployées ni exécutées sur une base :

1. `20260718191000_meewav_messaging_foundation_v1.sql`
   - sécurité, conversations, paires directes, membres, messages, réactions,
     blocage, signalement, préférences et RLS ;
2. `20260718192000_messaging_collaboration_workflow_v1.sql`
   - état participant, transitions, blocage relationnel et acceptation atomique
     vers une conversation ;
3. `20260718193000_messaging_projects_core_v1.sql`
   - projets, membres, invitations, conversation, tâches et activité ;
4. `20260718194000_messaging_attachments_v1.sql`
   - bucket privé, réservation/finalisation, pièces jointes de message et de
     collaboration, RPC de lecture v2 ;
5. `20260718195000_messaging_artist_groups_core_v1.sql`
   - groupes, membres, invitations, rôles, préférences et activité ;
6. `20260718200000_messaging_realtime_broadcast_v1.sql`
   - policy Broadcast privée, payload minimal et triggers d'invalidation.

Ces migrations ne modifient ni profiles ni rooms_*_v2. Si une dépendance aux
fondations du 16 juillet est nécessaire, elle doit être déclarée et appliquée
d'abord sur staging, jamais implicitement sur le projet partagé.

## 13. Ordre de livraison

### Étape 1 — terminée dans le dépôt

- Fondations conversations, collaborations, pièces jointes, projets et groupes.
- Repositories, hooks live, adaptateurs et workspaces UI.
- Broadcast privé préparé et polling de secours conservé.
- Tests TypeScript ciblés et fichiers pgTAP ajoutés.

### Étape 2 — prochaine validation, sans production

- Rejouer l'historique sur un Supabase local ou un projet de staging isolé.
- Exécuter `005` à `010` avec pgTAP et corriger toute erreur de compilation SQL.
- Tester RLS et Storage avec deux membres, un tiers et une relation bloquée.
- Vérifier les liens Globe/Profil, le refresh, les uploads et le temps réel dans
  plusieurs navigateurs.
- Exécuter build, suite Web complète et tests de charge minimaux.

### Étape 3 — promotion coordonnée

- Revue de compatibilité iOS et de l'historique de migrations.
- Déploiement contrôlé vers staging, observation, puis décision explicite avant
  toute promotion vers le projet partagé.

### Différé volontairement

- Projets : stems, takes, mixes, feedback et édition collaborative avancée.
- Groupes : sessions, présences aux sessions, décisions, votes et projets liés.
- Push mobile/e-mail, présence, typing, recherche avancée, modération
  opérationnelle, observabilité et tests de charge de production.
- Appels audio/vidéo : ils appartiennent à Rooms/WebRTC et ne sont pas simulés par
  la Messagerie.

## 14. Tests d'acceptation

Les scénarios ci-dessous restent le seuil de promotion. Les tests TypeScript
ciblés existent, mais les scénarios dépendant d'une base, de Storage ou de
Realtime n'ont pas encore été exécutés.

### Base et sécurité

- Schéma neuf et migration incrémentale réussissent.
- RLS couvre anon, utilisateur A, utilisateur B, non-membre C, utilisateur
  bloqué et service_role.
- Aucune modification de profiles ou rooms_*_v2.
- Une clé idempotente répétée renvoie le même objet.
- Toutes les transitions invalides sont refusées.
- Les limites de fréquence sont testées.

### Fichiers

- Un non-membre ne peut ni lire la ligne media_files privée, ni signer l'objet.
- MIME, taille, chemin et propriétaire sont validés.
- Un upload interrompu peut reprendre ou échouer proprement.
- Les URL signées expirent.

### Front-end

- Deux navigateurs voient un message en temps réel.
- Un troisième navigateur non membre ne reçoit rien.
- Refresh conserve messages, non lus, demandes, projets et groupes.
- Hors ligne puis retour réseau n'envoie pas de doublon.
- Les liens Globe, Profil et Messagerie ouvrent la bonne conversation.
- Les états loading, empty, failed, retry et forbidden sont visibles.

### Charge minimale

- 100 conversations par utilisateur.
- 10 000 messages dans une conversation sans chargement intégral.
- pagination par curseur stable pendant l'arrivée de nouveaux messages.
- index vérifiés avec EXPLAIN sur listes et historiques.
- aucun abonnement Realtime orphelin après navigation répétée.

## 15. Critères de fin

La Messagerie ne sera considérée câblée en environnement partagé que lorsque :

1. aucune action métier principale ne dépend de messagingDemoData,
   localStorage ou d'un snapshot de module ;
2. les quatre espaces survivent à un refresh ;
3. tous les fichiers utilisent media_files et Storage privé ;
4. les droits sont prouvés par des tests RLS négatifs ;
5. Globe, Profil et Messagerie partagent les mêmes identifiants ;
6. le temps réel ne fuit aucune donnée à un non-membre ;
7. les migrations sont validées sur staging sans toucher iOS ou Rooms ;
8. les tests TypeScript, unitaires, E2E, SQL et build passent.

À ce jour, le câblage applicatif est préparé mais ces critères ne sont pas tous
remplis, car aucun déploiement staging et aucune exécution pgTAP n'ont eu lieu.

## 16. Décisions à valider avant la première migration

- Durée autorisée pour modifier ou supprimer un message pour tous.
- Conservation de l'historique après blocage.
- Taille maximale par fichier et quota total par utilisateur.
- Formats document autorisés.
- Nombre maximal de membres d'une conversation, d'un projet et d'un groupe.
- Règles de transfert de propriété d'un projet ou d'un groupe.
- Durée de rétention des fichiers supprimés et des signalements.
- Activation ou non des accusés de lecture individuels dans les groupes.

Ces décisions sont des paramètres produit. Elles ne bloquent pas la création des
types, repositories, migrations locales et tests de sécurité de la Phase A.

## 17. État du projet partagé observé pendant l'audit

Lecture seule au 18 juillet 2026 :

- migrations appliquées jusqu'à 20260715033000 ;
- cinq fondations identité/social, grades/analytics, média, Golden Like et
  collaboration du 16 juillet absentes du remote ;
- notifications autorise encore un INSERT public trop large ;
- follows a encore une lecture publique large ;
- RLS est désactivée sur mock_artists, musicians et spatial_ref_sys.

Ces trois dernières tables ne doivent pas être corrigées automatiquement au nom
de la Messagerie : activer RLS sans connaître leurs consommateurs et sans policy
de remplacement casserait leurs lectures. Elles font l'objet d'un chantier de
sécurité séparé. Pour la Messagerie, le seul blocage immédiat est de disposer des
fondations nécessaires sur staging et d'un contrat notifications sûr.
