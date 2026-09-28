# Cage Windows — préparation et réalisation host

## Parcours livré

- Une liste visible permet de cocher les artistes puis de changer leur ordre. Elle sert au tournoi, au championnat, à l’Open Mic Battle et au programme Open Mic.
- Le bouton principal ouvre les Invités si des artistes manquent, crée les rencontres lorsque la sélection suffit, puis valide le placement. Les variantes de format, exemptions et tirage aléatoire restent des choix explicites.
- Après la génération, la sélection se replie pour montrer les rencontres. Elle peut être rouverte avant validation.
- Le parcours Invités propose un retour direct au placement. Une invitation en démo rend l’artiste sélectionnable, sans valider ses réglages audio/vidéo ni le monter sur scène.
- L’Open Mic ajoute uniquement les artistes cochés, permet leur retrait et protège les passages commencés contre le déplacement ou la désélection.
- Les fonds externes et contours du sous-menu Cage sont transparents pour laisser apparaître la texture de la console. Les cartes et contrôles conservent leur propre relief.
- Le grand affichage du bandeau est retiré. Switch Room est près du téléphone. Les identités et portraits sont dans les vidéos, le VS au centre, et le chrono local activé depuis le mixeur apparaît en petit sous le VS. Sans VS, il reste au-dessus des commandes vidéo.
- Les libellés du parcours utilisent OBS MeeWav. Les clés internes historiques restent compatibles avec les contrats serveur.

## Vérification

- 60 tests host ciblés passent : préparation, battle complet avec chaque côté gagnant, cycle tournoi/championnat/Open Mic, invitations de démo, vidéo, chrono du mixeur, bandeau et retour Invités → placement.
- 3 tests d’intégration du shell Cage passent.
- Le build Vite de production passe.
- Le contrôle TypeScript global garde des erreurs préexistantes, notamment bibliothèques ES2020/Node de tests et anciens types du parcours Invités. Le test global `RoomToolsShell.test.tsx` comporte aussi six attentes obsolètes hors Cage (Wave, Loge, Classe) ; les trois cas Cage passent.
- Aucun navigateur ni application de l’utilisateur n’a été piloté. La validation visuelle Electron et une session réelle entre plusieurs appareils n’ont pas été réalisées. Les changements serveur n’ont pas été déployés par cette intervention.

La provenance et les limites du portage viewer sont décrites dans `cage-viewer-ios-windows-2026-09-26.md`.

## Retouches de la même session

- Lecteur Cage remonté de 15 px, position du chip Mode conservée.
- Sélection rapide : 8 premiers, 16 premiers ou tout, en une commande ; respecte la recherche, les places disponibles et les choix déjà cochés.
- Switch Room est placé à gauche du téléphone, hors de la grille à quatre cellules des indicateurs pour préserver la bourse, l’étoile et le cœur.
- Dans le dépôt de simulation uniquement, les artistes appelés terminent automatiquement leurs vérifications. Une préparation enregistrée et bloquée est récupérée à la lecture. La mise sur scène reste une action du host ; le réducteur et le serveur live continuent à exiger les vérifications réelles.
- 23 tests ciblés passent, dont les sélections groupées, la protection de la capacité, l’ordre des contrôles du bandeau et la reprise d’une ancienne simulation ; build de production réussi.
