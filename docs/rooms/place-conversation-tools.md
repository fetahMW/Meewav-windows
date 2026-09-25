# Outils de conversation de La Place

La Place propose exactement trois outils : **Tour de parole**, **Clash**, **Défis**.
Le chat, les sondages, le lecteur, les vidéos et le mixeur restent dans leur infrastructure commune.

## Parcours

- **Tour de parole** : demandes ouvertes ou fermées, ajout et retrait de participants, attribution du tour, pause, reprise, passage suivant et fin. Question de départ et durée configurables hors passage actif.
- **Clash** : deux personnes distinctes, intitulé libre, 1/3/5 manches, durée identique par personne. Chaque participant accepte ou refuse personnellement. Le host lance seulement après les deux accords, alterne les prises de parole et peut interrompre le clash.
- **Défis** : proposition ouverte à chaque participant connecté, destinataire individuel ou collectif, acceptation volontaire, lancement par le host, déclaration de fin par le participant et validation par le host. Les défis terminés restent consultables.

Ces outils organisent la conversation : ils ne forcent jamais l’activation d’un micro, d’une caméra ou l’admission d’une personne sur scène. Les rôles et l’audio restent pilotés par les contrats existants. Un participant public non présent dans la projection des invités apparaît sous le libellé « Participant » tant que son profil n’est pas disponible dans cette projection.

## Interface

`PlaceConversationTools.tsx` utilise le sélecteur commun `PlaceToolsSwitch` et les emplacements du `StudioToolsLayoutProvider`. Les trois entrées occupent la largeur de la barre ; le lecteur commun reste monté. Styles limités à `.place-conversation` : noir laqué, verre fumé, métal argenté, portraits cerclés, sans animation permanente de l’arrière-plan. Les chronos actualisent uniquement leur petit composant, une fois par seconde, lorsque le panneau est visible.

## Stockage et déploiement

- En **aperçu local**, les actions utilisent le réducteur TypeScript et un stockage `sessionStorage` explicitement réservé aux fixtures de démonstration. L’état survit à un rechargement du même onglet ; il n’est pas partagé entre appareils.
- En **live**, le client utilise `rooms_get_place_tools_v1` et `rooms_apply_place_tools_v1`, avec signal Realtime sur `room_place_tools_v1`. Le serveur contrôle l’appartenance à la Room, les exclusions, les rôles, les accords personnels, les transitions et l’horloge. Chaque écriture est verrouillée et vérifie la révision attendue. Le client ne réessaie pas automatiquement une action conflictuelle.
- La migration `supabase/migrations/20260905150000_rooms_place_conversation_tools_v1.sql` est préparée et vérifiée dans une base Postgres locale isolée. **Elle n’a pas été appliquée à un service distant dans cette tâche.** Le live affiche une indisponibilité explicite si le contrat n’est pas déployé, sans charger de données de démonstration.

## Vérification

```powershell
node node_modules/vitest/vitest.mjs run src/features/rooms/place/placeConversationTools.domain.test.ts src/features/rooms/place/placeConversationTools.store.test.ts src/features/rooms/place/PlaceConversationTools.test.tsx src/features/rooms/place/PlaceStudioPanel.specializedTools.test.tsx --maxWorkers=2
```

Le script `scripts/test-place-conversation-sql.mjs` exécute la migration dans PGlite, compare les transitions avec le réducteur TypeScript et contrôle les refus d’accès, les révisions, les accords et les politiques de lecture. Installer `@electric-sql/pglite` dans un dossier temporaire puis indiquer son fichier `dist/index.js` dans `PGLITE_MODULE_PATH` permet de l’exécuter sans installer de dépendance dans le projet et sans accéder à une base distante.
