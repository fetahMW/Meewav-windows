# LOT 0 — inventaire et protection

État de départ constaté le 24 septembre 2026 : `Meewav-Web` sur `main` à `fc058e0a4`, `Meewav-Android` sur `main` à `6e75df6`. Les deux arbres avaient déjà des changements locaux. Cette livraison est limitée aux nouveaux fichiers Studio et aux ajouts ciblés de `package.json` et `src/App.tsx` côté Web. Electron et son lockfile sont isolés dans `apps/meewav-studio`, pour ne pas ajouter ses types Node au projet Web. Elle ne restaure ni n'écrase les modifications préexistantes.

## Dépendances Web → Android

| Élément | Source et relation | Protection LOT 0–1 |
| --- | --- | --- |
| Rooms Web | `src/features/rooms` dans Meewav-Web contient le host, le viewer, le Mixeur et les outils dont le séquenceur Wave. | Code conservé. Studio importe les contrats et les styles, sans déplacer ce dossier. |
| Bundle Android Rooms | `Meewav-Android/scripts/build-feature.mjs` construit les assets à partir de `app/src/main/rooms-source`. L'option explicite `--import-web` peut substituer la source Web au snapshot Android. | Aucun script de build/synchronisation Android exécuté ; assets embarqués et snapshots préservés. |
| Bundle Android viewer | L'option explicite `--import-viewer` importe le viewer Web dans la source Android. | Non exécutée. |
| Bundle Android messagerie | `scripts/build-messaging.mjs` construit le bundle de messagerie Android depuis sa source dédiée. | Non exécuté. |
| Assets et médias communs | `--sync-assets` / `--sync-media` sont des opérations explicites. | Non exécutées. |
| Build Web standard | `vite build` construit le site Web ; il ne synchronise pas les bundles Android. | La route Studio est conditionnée par `DEV` et `VITE_MEEWAV_STUDIO_DESKTOP=true` ; elle est absente du build public de production. |

## Réutilisation et frontières

| Besoin LOT 1 | Existant réutilisé |
| --- | --- |
| Authentification | `AuthProvider`, `useAuth`, client Supabase Web commun. |
| Vérification privée | `GreenHouse` et `roomDevicePreferences` existants. |
| Direction artistique | Styles canoniques `place-studio-chassis.css`, `place-studio-black-lacquer.css`, `place-mixer-reference.css` et leurs variables de finition. |
| Autorisation média | `requestPlaceLiveKitAccess` et noms de pistes/programme du service Rooms existant. |
| Séquenceur | Outils Wave actuels conservés dans Rooms ; aucun fork ni seconde source du séquenceur. Le raccordement au parcours Studio est prévu au lot suivant. |
| Publication | Une classe `StudioMediaEngine` propre au prototype détient la capture locale et la session LiveKit. Aucun média n'est publié pendant l'aperçu ; le bouton explicite déclenche le transport. |

Le backend existant ne définit pas de transition générique d'une Room brouillon vers une Room LIVE. Pour le test LOT 1, la Room QA est créée LIVE par les API existantes ; la préparation **média** reste privée jusqu'à la publication explicite. Cette limite ne vaut pas validation du futur parcours complet de création.

Il n'existait pas d'application Electron/Tauri Meewav Studio exploitable dans Meewav-Web à cet emplacement. `apps/meewav-audio-engine` est un prototype C++ audio distinct ; il n'a pas été remplacé. L'enveloppe Electron ajoutée ici utilise le même code React que le Web et garde les décisions de permissions et de packaging macOS pour un lot ultérieur.

## Retour arrière ciblé

Depuis `Meewav-Web`, retirer `apps/meewav-studio/` et `src/features/studio/`, puis retirer uniquement l'ajout `studio:dev` de `package.json` et la route conditionnelle `/studio` de `src/App.tsx`. Vérifier les diffs avant toute restauration Git : les autres modifications locales préexistantes doivent rester intactes. Aucun retour arrière Android ou Supabase n'est requis pour le code du prototype. Les Rooms QA temporaires sont terminées via leur UUID exact et le helper API existant.
