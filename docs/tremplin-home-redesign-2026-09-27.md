# Accueil Tremplin — refonte éditoriale

## Direction

Référence fournie par l’utilisateur : `Meewav_Tremplin.html`. Reprise de l’accroche « Les grands noms ont de petits débuts », du ton centré sur la rencontre et du rythme éditorial. La page conserve la palette graphite et violette de Meewav, sa navigation et ses parcours existants.

La composition comprend un accueil avec pochettes et vinyle construits en HTML/CSS, une sélection de talents avec recherche et filtres, trois étapes de découverte, les coulisses d’un projet, les six grades, une FAQ, l’entrée artiste et une invitation finale à découvrir le catalogue. Les images sont les ressources locales du produit ; les noms, extraits, projets et mises à jour proviennent du modèle Tremplin existant.

## Fonctionnement conservé et ajustements

- Les profils, l’écoute et les espaces de soutien utilisent les callbacks existants. Aucun achat n’est déclenché depuis la page ; les explications et conditions du jeton restent accessibles.
- Les artistes suivis restent accessibles lorsque le contexte utilisateur le permet.
- Les filtres ne proposent que les familles ayant des talents éligibles dans le modèle actuel. Aucun changement des règles d’éligibilité.
- La recherche conserve ses suggestions et sa navigation au clavier. Un survol ne valide plus un résultat ; le résultat choisi peut être refermé.
- Les six grades conservent leur modèle et leur état initial. Les cartes peuvent désormais être activées au clic, à Entrée et à Espace, avec leur état accessible `aria-pressed`.
- Les styles de l’accueil sont limités à `.tremplin-home`. La présentation des grades est ajustée uniquement dans cet accueil ; le modèle métier est partagé.
- Le portrait panoramique de Lunaé reçoit un cadrage adapté. Les visuels de la composition restent responsifs ; aucun grand PNG de la landing de référence n’est copié.
- Les styles respectent la réduction des animations et réservent de l’espace en bas sur petit écran pour la navigation existante.

## Vérifications

- Dix tests de l’accueil réussis : recherche, absence d’action au survol, sélection et fermeture, filtres, navigation catalogue, écoute, soutien volontaire, grades et explications.
- Dix-huit tests supplémentaires réussis dans six suites Tremplin : viewer, quoteService, persistence, myArtistsFixtures, homeTokenStatus et discoveryToken.
- TypeScript Windows et ESLint des fichiers touchés : aucune erreur.
- Build Windows réussi ; avertissements existants sur les chunks et imports dynamiques hors Tremplin.
- Contrôle initial dans Electron réel à 1 440 × 900 : sections, recherche et ouverture de profil. La revue des captures a permis de corriger le recadrage de Lunaé, la taille des SVG des grades et une collision avec l’ancienne peau des grades.
- Captures finales Windows Découverte et Grades relues : cadrages corrigés, six cartes de grades de 225 px de haut et badges de 82 px, sans ancien cadre décoratif ni rectangle sur le titre. Build final réussi après ces corrections CSS.
- Electron compact à 1 000 × 720 : accueil et découverte relus. L’annotation décorative a été abaissée pour dégager le nom sur la pochette.
- Dans Electron, le profil Lunaé s’ouvre puis revient à l’accueil sans fermeture de page ni erreur JavaScript. La commande d’aperçu de démonstration passe de lecture à pause, puis revient à l’arrêt ; ce scénario emploie la source Web Audio synthétique prévue par le mode démo. Il ne valide pas une écoute matérielle en direct.
- La navigation clavier vers l’explication des grades fonctionne. L’interaction avec les cartes de grades est couverte par les tests ; le scénario Electron n’a pas été poursuivi après cette navigation. L’ouverture de la FAQ a été vérifiée sur le Web, pas à nouveau dans Electron.

## Parité Web

Les quatre fichiers d’interface et de tests sont identiques entre Windows et le worktree Web viewer. Le routage, l’authentification et les flags propres aux plateformes ne sont pas copiés ni modifiés.

- Build Web de production réussi après la dernière synchronisation CSS.
- 28 tests Tremplin réussis et ESLint sans avertissement sur les trois fichiers TypeScript touchés.
- Le typecheck Web retrouve les 20 diagnostics préexistants dans les tests Rooms et Shorts, avec aucun diagnostic dans les fichiers Tremplin de ce lot. Ce contrôle global reste donc en échec et n’est pas présenté comme réussi.
- Parcours Web headless sur le serveur Vite de développement en mode `tremplin`, aux tailles 1 440 × 900 et 390 × 844 : aucune erreur JavaScript, aucune ressource locale échouée, aucun débordement horizontal. Filtre Production, recherche Lunaé, ouverture de son profil et FAQ vérifiés. Le build de production a été compilé séparément ; ces captures ne sont pas une validation de session connectée en production.
- Grille des grades : six colonnes sur desktop et trois sur mobile ; badges SVG de 82 px et 67 px respectivement. Aucun fond parasite sur la deuxième ligne du titre. Captures finales relues.
- Le preview utilisateur sur le port 5198 est conservé. Captures, profils de test et builds temporaires restent hors Git.

Les scénarios locaux utilisent les données de démonstration signalées par le produit. Cette refonte ne constitue pas une nouvelle validation de connexion au backend, d’achat ou de paiement.
