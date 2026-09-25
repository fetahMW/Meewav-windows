# Audit de câblage transversal MeeWav

Date : 8 août 2026
Périmètre : Auth, Globe, Profil, Messagerie, Marketplace, Tremplin et La Scène. Rooms est limité à ses contrats de redirection/replay, sa conception restant le chantier suivant.

## Corrigé dans ce lot

| Flux | Résultat |
| --- | --- |
| La Scène → Profil | Le catalogue serveur transmet le véritable UUID. Les profils démo sérialisent leur identité minimale dans l’URL pour survivre au refresh et au partage. |
| La Scène → Messagerie | Un média canonique ouvre la conversation réelle du profil au lieu du fallback démo. |
| La Scène / Profil → Collab | La même RPC idempotente est utilisée et la source visible est conservée. |
| Marketplace → Messagerie | Nom, rôle, portrait et grade du vendeur sont transmis en mode démo ; l’UUID est utilisé lorsqu’il existe. |
| Marketplace → Profil | Un accès profil explicite est présent dans la fiche vendeur. |
| Profil → Tremplin | Les CTA jeton/statistiques ciblent les ancres Tremplin correspondantes et non les statistiques générales du profil. |
| Profil → média partagé | Les liens convergent vers `/profile/creations/library?media=…` et rouvrent le média ciblé. |
| Profil → retour | Le libellé annonce La Scène, Marketplace, Tremplin ou Globe selon l’origine réelle. |
| Collaboration → Messagerie | Les sources Globe, Profil, Messagerie, Rooms, La Scène, Marketplace et Tremplin sont conservées par les adaptateurs et affichées correctement. |
| Navigation Marketplace | La marque publique devient Marketplace ; `/marketplace/*` redirige vers la route canonique `/market/*`. |
| La Scène → suivi | `getFollowStates` hydrate le feed Suivis des profils canoniques. |
| La Scène → likes | Les médias canoniques utilisent `media_reactions`; les fixtures gardent un fallback local. |
| La Scène → Golden Likes | Le service et la limite journalière existants sont utilisés dès qu’un UUID canonique est présent. |
| La Scène → analytics | Les impressions canoniques sont ingérées par `track_analytics_event`; les autres événements restent dans le bridge jusqu’à extension de l’allow-list serveur. |
| Studio → médiathèque | Le propriétaire charge, publie et édite ses médias via `media_files` et le bucket existant. |

## Restant volontairement simulé

| Domaine | Motif | Backend attendu |
| --- | --- | --- |
| Commentaires La Scène | Aucun registre serveur média/commentaire n’existe. | Threads, réponses, modération, rate limit, recours, compteurs. |
| Playlists et historique | Repository navigateur seulement. | Tables utilisateur, ordre, confidentialité, synchronisation multi-appareils. |
| Droits et crédits | Les attestations actuelles sont des précontrôles client. | Registre signé, consentements collaborateurs, territoires, expiration et audit. |
| Sous-titres / IA | Pas de worker média. | Jobs asynchrones, versions, validation humaine. |
| Encodage | Upload direct uniquement, limite actuelle 250 Mo. | Multipart/resumable, scan, HLS, thumbnails, CDN, reprise. |
| TV | EPG, rappels et droits sont des fixtures. | Régie, source signée, droits autoritatifs, failover, rappels persistants. |
| Room → replay | Contrat client uniquement. | Finalisation de l’asset, droits invités, publication et révocation. |
| Recommandation | Scoring local. | Service distant paginé, observabilité, fairness et anti-fraude. |

## Garde-fous

- Aucun CTA ne doit annoncer une réussite serveur lorsqu’il utilise seulement une fixture.
- Les UUID de profil et média sont les identités canoniques ; les slugs servent uniquement aux démonstrations et URLs lisibles.
- Les sources économiques du Tremplin n’entrent jamais dans le ranking La Scène.
- La dernière action média explicite garde la priorité audio.
- Rooms possède le direct, La Scène la vidéo publiée, MeeWav TV la programmation.
