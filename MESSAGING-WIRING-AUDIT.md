# Audit du câblage de la messagerie — 9 septembre 2026

Audit demandé explicitement par l’utilisateur, avec correction puis fusion et publication. Les essais sont locaux avec services simulés ; aucune demande de collab ni aucun message n’a été envoyé à un tiers.

## Corrections

- Une collab de démonstration acceptée crée une conversation qui reste visible dans la liste des contacts, même lorsque « Voir plus » est fermé. Le filtre des contacts de référence la masquait auparavant. Le contact nouvellement créé passe avant les contacts de démonstration.
- Le champ de saisie du compositeur Collab partagé ne déclenche plus le bouton d’émoticônes lorsqu’on clique pour écrire. L’ouverture du dialogue place le focus dans le champ éditable.
- Les audios privés démarrent au premier clic après résolution de leur URL. Les durées viennent des métadonnées quand elles sont disponibles ; les lecteurs sont arrêtés et libérés à la sortie. Les lecteurs de messages et de collab partagent leur signal de mise en pause.
- Un audio sans source affiche une erreur explicite ; aucun WAV silencieux n’est fabriqué pour simuler une lecture. Certaines fixtures de démonstration sont dans ce cas.
- Le Track Pack compact joue ses stems ensemble et les boutons de piste commandent réellement leur état muet. Ouvrir le pack arrête son aperçu. Une piste qui refuse la lecture interrompt la lecture groupée ; un pack sans source ne simule plus une progression.
- Les boutons téléphone et vidéo, auparavant reliés seulement à des notifications fictives, sont désactivés avec une indication explicite. Le service d’appel Rooms existant nécessite une room et un rôle host : il ne constitue pas un service d’appel direct de messagerie.

## Vérifications locales

231 tests réussis (77 suites déclarées par Vitest) : messagerie, API/pré-profils Globe, dialogue Collab La Scène, profil, Cage et appels Rooms. Le test Track Pack a ensuite été enrichi pour contrôler le son muet de chaque stem depuis la carte et son arrêt à l’ouverture ; le fichier de tests concerné repasse intégralement. Compilation Vite en mode tremplin réussie (avertissements de découpage des imports déjà présents).

Les tests couvrent les contrôleurs d’envoi et de réception, idempotence/retry, réactions, pièces jointes et URL privées, enregistrement avec MediaRecorder simulé, cycle d’envoi du vocal, acceptation puis rafraîchissement/ouverture de conversation, et soumission Collab via les composants partagés. Ils ne prouvent pas une capture micro physique, un appel entre deux personnes ni un échange Realtime sur la base distante.

## Entrées Collab

- Globe et pré-profils des participants Rooms : HoverPreProfileContent et le compositeur partagé.
- La Scène, profil et expérience Rooms : ShortsCollaborationDialog, identité canonique du destinataire, service de création et d’attachement commun.
- Réception et acceptation : CollabsWorkspace → contrôleur collaboration → respond_to_collaboration_request_v1 → conversation directe → rafraîchissement de la liste.
- La carte permet aussi d’ouvrir le profil et de lire son audio sur place.

## Blocage Supabase confirmé en lecture seule

Le projet de la connexion PostgreSQL correspond à celui de VITE_SUPABASE_URL et SUPABASE_URL. Le schéma public distant contient profiles, media_files et seulement les anciennes tables messaging_conversation_participants_v1, messaging_direct_conversations_v1 et messaging_messages_v1 pour cette fonctionnalité. Il ne contient pas les nouvelles tables messaging_conversations ni collaboration_requests. Les RPC list_my_conversations_v1 et list_my_collaboration_requests_v2 renvoient PGRST202 (fonction absente). Les fonctions d’envoi/réaction du nouveau contrat sont également absentes du catalogue consulté.

La fusion du frontend ne suffit donc pas pour les comptes réels. Aucun changement n’a été appliqué à la base distante pendant cet audit.

## Déploiement serveur restant

Préparer une migration contrôlée depuis l’ancien schéma, sans rejouer aveuglément tout l’historique. Vérifier les dépendances profiles, media_files, auth et Storage ainsi que l’historique réel des migrations et la conservation des anciens messages. Les fichiers de référence du nouveau contrat, dans leur ordre de dépendance, sont :

1. 20260716211000_globe_collaboration_requests.sql
2. 20260718191000_meewav_messaging_foundation_v1.sql
3. 20260718192000_messaging_collaboration_workflow_v1.sql
4. 20260718193000_messaging_projects_core_v1.sql
5. 20260718194000_messaging_attachments_v1.sql
6. 20260718195000_messaging_artist_groups_core_v1.sql
7. 20260718200000_messaging_realtime_broadcast_v1.sql
8. 20260731120000_shorts_client_collaboration_source.sql
9. 20260808090000_cross_feature_collaboration_sources.sql
10. 20260812130000_messaging_message_actions_v1.sql
11. 20260909093000_messaging_meewav_reactions.sql
12. 20260909100000_messaging_collaboration_chats.sql

Les échanges préalables à une collaboration utilisent désormais un fil distinct par demande, marqué `collaboration_request_id`. La demande originale initialise ce fil une seule fois. Le client conserve l’onglet et le rail Collab et exclut ces fils de Messages, y compris après actualisation. Accepter crée toujours la conversation entre amis séparément, sans y copier le message de demande ni ses réponses. Le RPC de lecture `list_my_conversations_v2` ajoute cette provenance au contrat existant. Cette migration est préparée dans le dépôt mais n’a pas été appliquée ni exécutée sur la base distante, dont le schéma ancien reste à migrer comme indiqué ci-dessus.

La messagerie privée propre aux Rooms possède en plus 20260904123000_rooms_classe_private_messaging_v1.sql, à rapprocher de son schéma Rooms ; ce fichier ne remplace pas le nouveau contrat de messagerie générale.

Après déploiement contrôlé : vérifier les RLS et les URL signées, puis les parcours authentifiés avec deux comptes de test (texte/photo/fichier/vocal, demande et acceptation Collab, réception Realtime, reconnexion). Les appels directs restent une fonctionnalité serveur/client à réaliser, avec signalisation et session média dédiée.
