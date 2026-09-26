# Prod du battle — transposition iOS vers Windows

Référence confirmée par l'utilisateur : `sipiyou39/Meewav`, branche `rooms-goal`, commit `cd2d40d75c6521f193be2f3c35c62ceef5233e21` (26 septembre 2026). Cette version est plus récente que `origin/main` consultée pour la précédente transposition.

Sources iOS : `CageLoopCard.swift`, `CageViewerRoomShell.swift`, `CageViewerRoomView.swift`, `CageLoopMediaPolicy.swift` et `SupabaseRoomsRepository.swift` sous `Meewav/Features/Rooms`.

## Comportement Windows

- Carte Prod du battle accessible dans Compétition et Direct, et dans la simulation viewer.
- Titre, BPM lorsqu'il est fourni, durée décodée et forme d'onde PCM réelle.
- Écoute privée, pause, répétition, déplacement dans la piste et téléchargement avec titre nettoyé.
- Arrêt de l'écoute de la carte lorsqu'on quitte ce panneau ; préécoute du mixeur interrompue avant l'écoute depuis la carte.
- Préparation automatique du fichier commun dans la file du mixeur des artistes acceptés, prêts, en coulisses ou sur scène. Le fichier reste en écoute privée jusqu'au routage explicite du mixeur.
- Confirmation de disponibilité au serveur après chargement dans le lecteur ; aucune confirmation pour le simple spectateur.
- La nouvelle publication du host attend le retour en coulisses avant de remplacer la prod d'un artiste déjà sur scène.
- La piste commune est conservée dans la file du lecteur et ne peut pas être supprimée par mégarde.
- Chargement, erreur et réessai explicites ; aucune substitution d'un fichier démo en live.

## Contrats et limites de validation

Le frontend lit `rooms_cage_session_v1(p_room_id, p_include_draft=false)` et privilégie la boucle du tournoi actif. Si ce RPC manque, il utilise le contrat iOS antérieur `rooms_cage_public_loop_v1`. Le fichier est téléchargé depuis le bucket privé `room-cage-loops`, après vérification du préfixe host/room, du format et de la limite de 25 Mo. La disponibilité artiste est confirmée via `rooms_cage_set_production_ready_v1` avec la référence exacte.

Ces RPC et leurs politiques Storage proviennent du backend iOS. Cette tâche ne déploie aucune migration et ne remplace pas le moteur de tournoi Windows (`rooms_get_cage_state_v1`/`rooms_apply_cage_command_v1`). Elle ne porte pas l'ordonnanceur iOS de diffusion automatique du combattant : le routage de l'OBS Windows reste explicite. Le parcours validé avec l'utilisateur porte sur la carte publique et la disponibilité de la prod commune dans le mixeur.

Validation automatisée : 49 tests ciblés réussis (contrat média, cycle de vie, lecteur réel, scène viewer et chat), build réussi. Les tests vérifient notamment le rejet des références étrangères, les formats/tailles, l'absence de fallback démo en live, le remplacement différé sur scène, la libération des URL et les réponses tardives après fermeture. Le TypeScript global conserve des erreurs préexistantes hors de cette fonctionnalité. Les anciennes assertions Host « Désépingler » restent en échec avec leur fixture sans message épinglé.

Pas de validation visuelle Electron ni de session live inter-appareils : l'utilisateur a demandé de ne pas piloter son ordinateur.
