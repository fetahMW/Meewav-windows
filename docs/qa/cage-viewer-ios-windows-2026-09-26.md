# Cage : viewer iOS adapté à Windows

## Référence

Dépôt `sipiyou39/Meewav`, commit `4e24d32b2c8e49a458548a52c6d651df0959351e` (remote main vérifié). Lecture des objets Git, sans modification du checkout iOS.

- `Meewav/Features/Rooms/Views/CageViewerRoomView.swift:42–66` : présentation automatique du choix de vote.
- `Components/Cage/CageViewerRoomShell.swift:87–155, 593–799, 880–930` sous le même répertoire Rooms : vidéo, commentaire du host, chat, accès au mixeur après admission.
- `Components/Cage/CageStageComponents.swift:112–205, 825–1069` : deux artistes, VS, identité, caméra du host et distinction rose/violet.
- `Components/Cage/CageLiveComponents.swift:172–194` : vote A/B/abstention, état d’envoi et erreur. Les composants de résonance déclarés dans ce fichier ne sont pas montés dans le viewer iOS.

## Adaptation Windows

- Le host reste présent ; le duel ajoute deux emplacements identifiés avec VS, et le commentaire du host est conservé en vignette. Les flux restent appariés par identité, avec leur fallback vidéo propre lorsque RTC reconnecte.
- Le chat reste la surface initiale. La candidature est accessible à côté du chat et possède une seule instance de préparation, conservée pendant les changements d’onglet.
- La préparation Windows porte le nom **OBS MeeWav**. Le mixeur personnel devient accessible après acceptation ; caméra et son demandent une action explicite. Le bus audio existant est conservé.
- Le vote est attaché au stage permanent et fonctionne même avec la console repliée. Le délai réel du scrutin est utilisé, sans durée mobile de 15 secondes imposée. Une commande est liée au match et à la révision affichés.
- Le panneau Cage ne montre plus de faux compte à rebours ni de tableau de tournoi permanent. Les diffusions explicites de programme et de résultat par le host restent disponibles. La simulation démo existante reste explicitement séparée du live.

## Différence de contrat explicite

La RPC Windows `rooms_apply_cage_command_v1` accepte uniquement A/B. L’abstention ne soumet donc aucun bulletin : elle est mémorisée localement par room, compte et tour de vote, y compris après rechargement. Elle n’est pas synchronisée entre appareils et n’est jamais annoncée comme un vote enregistré sur le serveur. Aucun score ou compteur de résonance fictif n’est introduit.

## Vérification

Tests DOM/domaine : ouverture et expiration de vote, exclusion des concurrents, droits, vote unique, erreurs/réessai, nouveau tour pendant une requête, abstention après rechargement, confidentialité des scores, identités vidéo, fallback média, stabilité du host, candidature et instance unique de préparation OBS.

La validation visuelle Electron et le test de live distant n’ont pas été réalisés : l’utilisateur fournit les captures et a demandé de ne pas piloter son ordinateur. Le typecheck global comporte déjà des erreurs hors périmètre (notamment types Node de tests anciens et `WaveState.maxSubmissionBars`).
