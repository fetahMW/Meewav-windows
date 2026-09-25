# Rooms — audit de lancement et vérifications du 6 septembre 2026

## Parcours livré

Les catégories de `/rooms/home?type=…` filtrent maintenant le catalogue national. Le catalogue de présentation contient 288 rooms, soit 48 par univers, dont 24 vidéos horizontales et 24 verticales. Chaque univers propose quatre rails de dix cartes et des collections complètes via « Voir plus ». Recherche, filtres, formats et retour au mur restent disponibles. Les chiffres sont identifiés comme simulés.

Les cartes utilisent un fond noir laqué, une bordure fine, des portraits, la ville et le format. Les aperçus vidéo se chargent au survol ou au focus : le mur ne décode pas des dizaines de vidéos simultanément. Le mode Vertical dispose de cartes 9:16. Les médias et portraits proviennent des assets existants du dépôt.

Une carte ouvre une session avec son identité et `demoRole=viewer`. Les raccourcis de fabrication host ne sont plus les destinations de la navigation de découverte. Les sessions host explicites restent accessibles.

## Audit des six séquenceurs

| Room | Avant l’ouverture | Transmission aux outils | À préparer ensuite dans la régie |
| --- | --- | --- | --- |
| Place | Titre, présentation, accès, sujet, ouverture de la file | Identité et file de la session | Invités, conversation, sources audio/vidéo |
| Loge | Titre, accès, avant-première, présentation, questions, direct seul/replay | Options de l’avant-première et questions | Import privé du contenu, moments et invitations |
| Wave | Titre, accès, BPM, tonalité, ouverture des propositions | Tempo, tonalité, titre et réception des boucles | Import de la boucle de base, catégories, votes et pistes |
| Classe | Titre, accès, objectif, 4 à 24 places, mains, questions | Capacité, mains et questions | Ressources, outils pédagogiques, placements et prises de parole |
| Scène | Titre, accès, programme, durée, évaluation et prompteur | Passages nommés, durées, évaluation et texte | Distribution des artistes et médias du spectacle |
| Cage | Modèle ou création, discipline, tournoi/championnat/Open Mic, effectif, sélection, règlement | Snapshot Cage existant, bracket/calendrier/programme selon le format | Roster, Green House, verrouillage et progression manuelle |

La Cage conserve ses mécaniques distinctes : élimination en tournoi, calendrier/classement en championnat et passages individuels en Open Mic. Les paramètres de vote, manches, départages, BYE, remplacements et délais sont contrôlés par son séquenceur existant. Le jury/mixte reste bloqué si le jury n’est pas configuré. Aucun passage n’est démarré par ce chantier.

Les cinq nouveaux séquenceurs créent une **session locale de présentation en développement**. Leur configuration est conservée dans un snapshot local et appliquée à la régie correspondante. La publication en production n’est pas simulée : elle reste explicitement indisponible pour ces cinq types. Le raccordement futur devra créer la room et son snapshot atomiquement, avec autorisation host, idempotence et application serveur des règles d’accès. La Cage possède déjà l’appel `rooms_cage_launch_v1`, conservé sans déploiement de migration.

## Green House commune

Parcours : Attente → invitation acceptée → Green House → prêt → Coulisses → Scène. Les six rooms partagent le même module. Le spotlight Classe respecte désormais cette préparation, y compris en démo. Un retour en Attente ne retire pas l’inscription ni le classement dans le tournoi Cage.

L’invité dispose d’un aperçu privé, du choix caméra/micro, d’un vumètre, d’un son de contrôle casque et d’un contrôle de connexion. Il confirme son cadrage et son niveau sonore. Une nouvelle invitation ouvre son espace de préparation. Le host peut vérifier son propre équipement ; dans la démo uniquement, un bouton explicitement nommé « Simuler les tests réussis » permet de préparer les artistes fictifs.

Les pistes sont arrêtées à la fermeture du diagnostic ou au départ de la room. Un refus de permission, une piste terminée, une perte réseau ou un changement de périphérique empêche de valider. Les parcours live utilisent les opérations existantes d’invitation et de préparation ; le host ne valide pas les tests d’un invité réel.

**Limite du contrôle réseau :** il mesure la disponibilité et le temps de réponse HTTP du serveur. Il ne certifie pas un débit montant, une liaison TURN/WebRTC ou la stabilité d’un direct. Les appareils physiques et une session entre deux comptes réels restent à valider dans l’environnement de diffusion ; aucun média de diagnostic n’est publié.

## Vérifications et corrections visuelles

- Navigation des six catégories, entrée viewer de chaque type, absence des commandes host et chargement des vidéos vérifiés dans le navigateur sur le serveur 5182.
- Parcours host Wave : invitation de Kenza → Green House → simulation explicite → Coulisses → retour en Attente. Pas de montée automatique.
- Captures analysées à 1280 px, 390 px et 1920 px : murs, collection verticale, viewer, Green House et lancement.
- Corrections issues des captures : hauteur excessive de recherche sur mobile, superposition du lancement sous la navigation, scrollbar du séquenceur, libellés comprimés des quatre étapes, présentation réellement verticale et charge des aperçus vidéo.
- Compilation Vite réussie. Tests ciblés accueil/lancement/Green House/Invités/spotlight/Cage : 63 tests réussis, relancés après les corrections de finition avec deux workers.
- Suite Rooms élargie : 1396 tests réussis, 61 échecs, 2 ignorés. Une copie isolée du commit de départ `6c3f48a24` reproduit les défauts fonctionnels existants (contrats SQL, anciens états Cage, attentes de boutons et mocks de routeur). Les échecs supplémentaires sous forte concurrence ont été relancés avec deux workers : les tests concernés passent ; le défaut de mock de routeur Cage est également présent au départ.
- TypeScript global reste en échec sur les erreurs déjà présentes (types Node, bibliothèque ES2021/ES2022, anciens tests et types Cage). La comparaison des diagnostics ne relève pas de nouvelle erreur du chantier.

Les vérifications locales ne constituent pas un test de charge d’une infrastructure de diffusion, ni une validation du matériel de l’utilisateur. Aucun serveur ni schéma Supabase n’a été déployé.
