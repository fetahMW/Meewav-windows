# Wave viewer — audit du 6 septembre 2026

Branche : `codex/wave-viewer-soumission`, issue de `origin/main` à `4ebb9081a`.
Aperçu : http://127.0.0.1:5183/rooms/home, servi depuis le worktree d271. Le 5182 reste stable.

## Résultat

- CTA Wave viewer blanc ; titre La Wave bleu conservé.
- Atelier existant : import, préécoute, soumission et suivi conservés. Bouton « Soumettre ma boucle ».
- Consentement obligatoire étendu au téléchargement et à l’utilisation par les autres utilisateurs, également dans le formulaire audience existant. Nouvelle version de consentement annoncée par le snapshot serveur : `wave-viewer-sharing-v2`.
- Téléchargement de la base et des couches actives du Beat. La référence de travail du Beat reste un téléchargement distinct. Un seul helper télécharge les fichiers préparés.
- Le gateway existant accepte une identité de piste publiée, jamais un chemin Storage choisi par le navigateur. Il vérifie l’appartenance à la Wave, la révision active du programme, le fichier préparé et sa conservation. Les originaux et les propositions privées ne sont pas exposés. Les permissions de soumission et de vote restent celles du serveur.
- En démo, l’envoi utilise les validations de durée existantes du host : grille 4/8/16, maximum de la famille et exception acapella 16. La préécoute synchronisée reste stricte. Un fichier hors grille affiche une erreur de durée, pas une fausse erreur de connexion.

## Vérifications

- 20 tests viewer passent : consentement, remplacement du fichier, durée incompatible, téléchargement publié, absence de téléchargement privé, reprise réseau et vote.
- 25 autres tests ciblés (domaine, grille, Sas) passent ; 2 tests des commandes du Sas passent.
- 16 tests du cycle Wave passent : soumission, validation publique, intégration, votes et permissions.
- Navigateur : miniature de l’accueil vers le viewer ; CTA calculé blanc (#fff), titre visuellement bleu ; import du WAV de démonstration Afro 100 BPM / 8 mesures, soumission bloquée sans consentement puis reçue par le host avec consentement.
- Le clic de téléchargement ne produit pas d’erreur affichée, mais l’événement de téléchargement du navigateur intégré n’a pas été confirmé. Le helper et le choix du fichier sont testés automatiquement.
- Build Vite réussi. Les trois tests WaveSequencerPanel et onze tests Cage en échec se reproduisent aussi sur main. Le contrôle TypeScript global rencontre les erreurs déjà présentes dans le dépôt ; comparer au main avant d’en attribuer de nouvelles à cette tâche.

## Limites et intégration

La migration `20260906190000_wave_viewer_downloads.sql` et la fonction Edge `rooms-wave-viewer-media` doivent être déployées ensemble. La migration n’a pas été appliquée ici et le parcours serveur réel multi-utilisateur n’a pas été exécuté. L’aperçu est une démonstration locale ; ses médias blob ne constituent pas un stockage persistant de production.

La publication retenue est l’activation dans le Beat audible existant. Une validation en attente d’activation n’ouvre pas le téléchargement. L’accès serveur reste réservé aux membres authentifiés de la Wave selon le parcours existant.

Le fichier historique `bass-deep-movement` (~2,39 s) ne correspond pas à une boucle de 4/8/16 mesures au tempo de la démonstration. Le fichier `public/audio/rooms/wave-test-pack/Afro_100BPM_A_minor/Loops_8bars/Afro_Melody_B_100BPM_8bars.wav` permet un essai compatible à 100 BPM.

Aucun merge ni push de main effectué. Attendre la validation explicite de l’utilisateur.
