# Room LIVE Desktop → viewer — QA du 25 septembre 2026

**Résultat : BLOCKED par le contrat `livekit-token` actuellement déployé.** Aucun PASS média ou viewer n'est attribué.

- Quatre Rooms Place QA distinctes ont été créées par le contrat `rooms_v2` + participation host ; chaque UUID exact a été confirmé `status=live`, puis `status=ended` dans le nettoyage. Dernier run : `5da0f3e9-4009-4d5c-ab47-6d680e369ba3`.
- Le Desktop, connecté comme QA A, est entré dans cette Room. La caméra Windows physique `Web Camera (4a54:5233)` a fourni une piste active en 640×480 et des images en Preview. TAKE a préparé Program. Le bouton « Passer en direct » a été activé.
- La demande de jeton RTC a reçu HTTP 400. Une sonde authentifiée sur une Room déjà terminée a confirmé la réponse du serveur LIVE : `roomName et identity requis`, pour les corps `{roomId}` et `{roomName}`. Le client partagé actuel utilise le contrat Room ID où l'identité et les droits de publication sont dérivés côté serveur.
- Le transport n'a pas été connecté ; aucune trame sortante ni réception viewer n'a été confirmée. La diffusion a été arrêtée, la Room terminée et la fenêtre QA isolée fermée. Les processus Desktop déjà ouverts par l'utilisateur n'ont pas été arrêtés.
- Les deux premiers essais ont révélé des erreurs de navigation et d'attente d'option dans le harnais ; elles ont été corrigées avant le run média. Tous les rapports détaillés sont dans `.tmp/desktop-live-camera-*.json` et restent hors Git.

Le client ne réessaie pas avec `roomName` + `identity` : ce serait laisser le navigateur choisir une identité RTC et ses droits de publication. Il faut aligner la fonction LIVE déployée sur le contrat Room ID existant avant de conclure le test caméra → viewer. Aucun changement Supabase, RLS ou déploiement n'a été fait dans ce run.
