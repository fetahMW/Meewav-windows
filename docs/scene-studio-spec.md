# Studio La Scène — spécification livrée

## Positionnement

Studio La Scène est l’atelier privé du créateur. Il ne fait pas partie de la navigation publique `Accueil · Explorer · Suivis · TV`.

- CTA primaire desktop : `+ Publier`
- CTA secondaire desktop : `Mon Studio`
- signature : `Publie, pilote et comprends tes contenus.`
- visibilité : comptes autorisés à publier uniquement

## Routes

- `/scene/studio` : vue d’ensemble
- `/scene/studio/content` : bibliothèque
- `/scene/studio/content/:contentId` : gestion d’un contenu
- `/scene/studio/analytics`
- `/scene/studio/comments`
- `/scene/studio/playlists`
- `/scene/studio/rights`
- `/scene/studio/tv`
- `/scene/upload` : publication

## Surfaces

La vue d’ensemble contient quatre KPI, la création qui progresse, les actions à traiter, l’activité récente et un inventaire. La bibliothèque contient une recherche, des filtres de statut, un tri, des lignes média compactes et un menu contextuel. La fiche contenu regroupe détails, analyses, commentaires, sous-titres, droits et TV.

Les autres espaces couvrent : rétention, origine des vues, circulation dans MeeWav, inbox de commentaires, playlists, crédits et confirmations, droits séparés, demandes et historique MeeWav TV.

## Fixture investisseurs

La fixture Naya K. est cohérente sur toutes les surfaces :

- 14 publiés, dont 1 replay de Room et 2 formats verticaux ;
- 2 programmés ;
- 3 brouillons ;
- 1 traitement ;
- 184,2 k vues, 8 420 h, +1 284 suivis, 68 % de complétion ;
- 418 commentaires sans réponse, 3 signalés ;
- 2 collaborations en attente ;
- 5 playlists ;
- 1 programmation TV future et 2 diffusions passées.

## Câblage disponible

- la bibliothèque Studio charge `media_files` du propriétaire lorsqu’un compte réel est connecté ;
- l’upload utilise le bucket média et persiste `source_pillar = shorts` ;
- titre, description, format, ville, langue et visibilité d’un média propriétaire sont persistés ;
- le catalogue public charge `published_media_files` puis `public_profiles` ;
- les UUID canoniques alimentent Profil, Messagerie, Collab, Suivi et Golden Like ;
- les likes ordinaires des médias réels utilisent `media_reactions` et deux RPC dédiées ;
- les impressions canoniques utilisent `track_analytics_event` avec `short_impression` ;
- la provenance d’une collaboration est conservée entre Profil, La Scène, Market, Tremplin, Globe, Messagerie et Rooms ;
- les liens de médias Profil utilisent une URL profonde unique et rouvrent le média ciblé.

## Simulé faute de backend autoritatif

- commentaires La Scène et leur modération ;
- playlists et historique multi-appareils ;
- confirmations de crédits et droits territoriaux ;
- sous-titres, transcription et outils IA ;
- traitement/encodage adaptatif ;
- EPG, invitations et statistiques MeeWav TV ;
- transformation serveur Room → replay.

Ces surfaces sont explicitement des données de démonstration. Elles ne doivent pas produire de promesse de réussite serveur avant l’ajout de leurs tables, policies, workers et projections publiques.

## Règles de sécurité

- le serveur reste source de vérité pour publication, suppression, droits, collaboration et réaction ;
- les uploads utilisent l’identité authentifiée et le stockage Supabase ;
- les demandes de collaboration restent idempotentes, limitées et soumises à la disponibilité publique du destinataire ;
- une autorisation VOD n’accorde jamais implicitement une autorisation TV ;
- aucun prix de jeton n’entre dans le classement La Scène ou les analyses Studio.
