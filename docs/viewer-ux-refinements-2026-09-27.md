# Complément UX viewer — 27 septembre 2026

## Modifications ciblées

- Loge : retrait du grand raccourci Chat ; trois actions d’accueil, Question, Dédicace et Rencontre. Les deux dernières ouvrent les listes existantes avec la liste correspondante en premier. Aucune demande n’est envoyée à l’ouverture. Les commandes d’inscription et d’annulation restent inchangées.
- Wave : finition graphite issue des tabs inactives pour les actions de soumission, référence, essai et sortie de la file. Hauteur minimale de 36 px, reflets discrets, sans effet de grossissement. La sortie de file est intégrée à une ligne compacte qui ne se comprime plus sur la carte suivante ; les sections conservent leur transparence.
- Cage : retrait du raccourci Chat et du simulateur dans le parcours viewer. Le programme et le tableau restent pilotés par l’état de la room. En attente, la démo reprend l’affiche existante `public/images/cage/rap-paris-marseille.png` sans recadrage. Cette affiche spécifique n’est pas présentée comme l’affiche d’une room réelle.
- Audio Cage : identité de l’instrumentale, forme d’onde réelle et position de lecture au-dessus de trois commandes compactes (écoute, boucle, téléchargement). Le fichier, le lecteur, les droits et le passage vers le mixeur existants sont conservés. Le téléchargement n’envoie aucune candidature.
- Classe viewer : noms remontés de 2 px ; bouton de téléchargement des ressources accordé aux tabs. Les cartes, ressources et questions validées sont conservées. Aucun déplacement des noms côté host.

Les matériaux des contrôles concernés sont centralisés dans `room-console-material.css`. La Place, les Questions, le bracket et la régie host ne font pas l’objet d’une refonte.

## Vérifications locales

- TypeScript : aucun diagnostic.
- Build Windows : succès, avertissements de chunks et imports dynamiques préexistants.
- ESLint des composants modifiés : aucune erreur ; avertissements préexistants dans `LogeRequests` et `RoomAudienceInteractions`.
- 60 tests passent dans sept fichiers : LogeViewer, LogeRequests, CageViewerCompanion, CageProductionProvider, RoomAudienceInteractions, ClassroomResources et WaveViewerPanel. Ils couvrent les commandes existantes, les restrictions, la lecture et les téléchargements, l’absence du simulateur et les accès d’accueil.

## Contrôle visuel Windows

Electron réel, profil isolé et données de démonstration. Captures relues à 1 440 × 900 et contrôles compacts Wave/Cage à 1 000 × 720 pixels CSS. L’accueil Loge, la préparation Cage, son onglet Audio et les Ressources de la Classe ont été vérifiés sur leurs états effectivement sélectionnés. Le contrôle a permis de corriger les anciennes règles CSS qui écrasaient les nouveaux boutons et de rétablir explicitement la police de la Cage. La file Wave et la carte suivante restent séparées de 8 px en fenêtre compacte. Aucune erreur de page observée. Artefacts locaux, hors Git : `.tmp/rooms-viewer-validation-5298/viewer-final-20260927`.

Cette validation utilise les scénarios locaux du produit ; elle ne constitue pas un test avec des comptes live ni une nouvelle validation de synchronisation backend.

## Limites de l’affiche

Le modèle transmis au viewer ne contient actuellement pas d’affiche d’événement dédiée pour les rooms réelles. Leur état de préparation reste visible sans leur attribuer l’affiche Paris–Marseille de la démo. Aucun faux événement ou contenu simulé supplémentaire n’est injecté.
