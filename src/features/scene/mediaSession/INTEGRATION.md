# Coordinateur média global MeeWav

`meewavMediaSession` arbitre un seul propriétaire de lecture parmi :

- `scene_video` ;
- `scene_audio` ;
- `scene_tv` ;
- `room` ;
- `global_audio`.

Le module est pur : il n'accède ni à `window`, ni à `navigator`, ni aux classes
HTML. Il peut donc être importé pendant un rendu serveur. Chaque player reste
responsable de son élément média et transmet seulement une fonction de pause.

```ts
import { meewavMediaSession } from "../scene/mediaSession";

const lease = meewavMediaSession.claim({
  source: "scene_video",
  id: `watch-player:${videoId}`, // identifie l'instance du player
  mediaId: videoId,
  label: title,
  pause: () => videoElement.pause(),
});

await videoElement.play();

// Après un événement ended : aucune deuxième pause n'est nécessaire.
lease.release({ pause: false });
```

Une instance différente affichant le même média doit utiliser un autre `id`.
Cela permet au passage miniature → lecteur plein écran de réellement mettre en
pause l'ancien élément.

## Branchement recommandé

1. Réclamer le slot juste avant chaque `play()` déclenché par l'utilisateur.
2. Conserver le lease dans une ref du composant.
3. Appeler `lease.release()` au démontage ou au changement de source.
4. Appeler `lease.release({ pause: false })` après `ended`.
5. Utiliser `meewavMediaSession.pause("route_change")` pour une pause globale.
6. Utiliser `subscribe` + `getSnapshot` avec `useSyncExternalStore` si l'UI doit
   afficher la source propriétaire.

L'API Media Session du navigateur reste une responsabilité du player actif
(métadonnées, raccourcis et position). Ce coordinateur règle uniquement
l'exclusion mutuelle entre les lecteurs MeeWav.

## Points backend restants

Aucun backend n'est requis pour l'arbitrage dans un seul onglet. La continuité
multi-appareils, une éventuelle télécommande de Room et la reprise de lecture
synchronisée nécessiteront en revanche des événements serveur distincts. Ils ne
doivent pas être ajoutés à ce coordinateur local.
