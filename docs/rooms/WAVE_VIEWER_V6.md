# La Wave — Viewer et atelier privé

État du chantier au 6 septembre 2026. Implémentation dans la branche `codex/wave-viewer-workshop`.

## Audit de l’existant

Le Viewer utilisait `RoomAudienceInteractions` : formulaire de dépôt en démonstration, deux lecteurs HTML indépendants pour l’audition et écran d’indisponibilité en live. Les téléchargements via `signedWaveAudienceUrl` sont volontairement bloqués pour les anciens chemins Storage. Le transport du host reconstruit son audition à partir de ses fichiers privés : il ne convient pas comme fournisseur des références du public.

Les contrats normalisés V3–V5 fournissent déjà : `WaveProductionRepository`, `SupabaseWaveInfraAdapter`, upload signé d’un objet, confirmation et traitement asynchrone, versions immuables, crédits/slots, votes, clôture et reprise Realtime. L’état actif est `wave_program_audio_state_v3.source_revision_id`, confirmé par `activation_status = ACTIVE`. `current_beat_revision_id` ou un résultat favorable ne prouvent pas qu’une boucle est audible.

Les règles révisées contiennent séparément `cycle_bars` et `accepted_loop_bars`, la signature et la politique de répétition. La référence est un mix préparé et versionné dans `wave_production_references_v5`, avec contrôle d’accès contributeur et exactitude temporelle. L’audition officielle exige un aperçu verrouillé. Les reçus d’écoute et l’éligibilité restent sous autorité serveur.

`PlaceStage` centralise déjà les sorties LiveKit et le repli HLS. La voix n’est indépendante que lorsque le retour RTC complet et la piste host `voice` existent. Le parcours scène passe par invitation, préparation privée et scène ; il est indépendant des contributions audio.

## Fonctionnement livré dans le code

- Quitter seul en haut à droite côté Wave Viewer ; audience en surimpression sur la vidéo. Les autres Rooms et la régie host conservent leurs commandes.
- Navbar Viewer commune à la Cage rétablie ; onglets Chat, Mixeur et Wave ; bandeau d’invitation compact et libellé « Quitter la file scène ».
- Mixeur personnel commun à toutes les Rooms Viewer : un volume local sans tranche invité. Ce volume agit sur la Room, pas sur Windows. La barre d’écoute inférieure apparaît seulement pendant une audition privée ou une erreur.
- Le sélecteur de simulation est exclusivement Host ; le Viewer observe la production sélectionnée.
- Référence visuelle reprise du checkout `classe-latest-preview-08048e3` servi sur 5182 : composant `LiveActionBar`, icône de soutien et matériaux de verre noir de la console. L’intégration Wave est servie sur 5197. Vérifications navigateur : six mixeurs Viewer, gain réel des vidéos (y compris Cage), simulation réservée au Host, défilement desktop/mobile et retour au live après écoute privée.
- Afficheur connecté à l’état officiel, BPM lisibles, règles détaillées, besoins réellement publiés, activation distincte de la validation et couches publiques en lecture seule.
- Atelier local avec import sans upload ni lecture automatique, fichier original conservé, solo, audition avec référence, pause, reprise, reprise du cycle, deux volumes et retrait local.
- Moteur Web Audio à destination locale uniquement. Aucun `MediaStreamDestination`, microphone, piste publiée, accès au mixeur host ou reconstruction publique par stems.
- Avant le démarrage privé, coupure locale des sorties RTC/HLS. Les niveaux du live restent inchangés ; le retour restaure leur valeur. La vidéo continue. Conservation optionnelle de la seule voix host lorsque le routage RTC le permet.
- Brouillon et référence restent montés en passant dans Chat. Barre d’écoute persistante. Mise en veille/onglet masqué : pause ; changement de périphérique : retour au live ; préparation scène : arrêt privé et brouillon conservé.
- Référence épinglée pendant l’essai, chargée à la demande, avec proposition explicite de mise à jour. Aucun time-stretch ou changement de tonalité. Placement non pris en charge expliqué.
- Envoi explicite de l’original, contrôle serveur V5, contexte de création V6, même clé et même requête en cas de reprise, distinction transfert/traitement/réception. Le brouillon ne réserve aucun slot.
- Suivi des seules contributions du compte, motifs, versions et intégration confirmée. Aucun remplacement ou retrait officiel n’est inventé lorsqu’aucune API Viewer ne l’autorise.
- Auditions officielles via une seule sortie locale, votes et clôture via les RPC existantes, échéances serveur et aucun compteur local. Un nouveau vote ne coupe pas l’atelier.
- Les duels demandent deux aperçus officiels. A doit être enregistré par le renderer avant l’audition via `rooms_wave_register_comparison_a_v6` et correspondre au contexte, à la durée et au standard de B déjà verrouillé. Un rendu brut du Beat n’est pas présenté comme un aperçu A comparable. Sans cette paire, le vote du Viewer reste indisponible avec explication.

## Déploiement et dépendances restantes

La migration `20260906120000_wave_viewer_v6.sql`, la fonction Edge `rooms-wave-viewer-media` et l’évolution de `rooms-wave-asset-upload-ticket` sont préparées dans le dépôt. Elles **n’ont pas été déployées sur un projet Supabase distant pendant ce chantier**.

L’expérience live requiert leur déploiement, ainsi que les services existants de traitement audio, rendu, publication et activation. La nouvelle passerelle ne sert que les références autorisées et les aperçus officiels ; les fichiers originaux restent refusés. Les anciennes références restent consultables uniquement tant que les droits sont valides.

La délivrance des reçus d’écoute est une dépendance du média-plane existant : le navigateur ne transforme pas le chargement d’un fichier ou un timer local en preuve serveur. Le vote n’est disponible qu’après éligibilité confirmée par ce service. L’enregistrement du nouvel aperçu A doit être raccordé au worker de comparaison ; aucune paire artificielle n’est créée dans le Viewer.

En `HOST_DAW`, une référence de travail explicitement préparée peut être proposée ; la production longue diffusée ne devient pas automatiquement une boucle. L’infrastructure actuelle ne fournit pas d’identité/version distincte exploitable pour une production DAW longue : le Viewer affiche « Production du host en direct ».

La démonstration est explicitement identifiée. Elle utilise les commandes et fixtures locales existantes ; sa base initiale n’est jamais présentée comme un rendu serveur du Beat actif. L’envoi démo ne prouve pas un upload de production. Les fichiers locaux ne survivent pas au rechargement ; aucun message ne promet le contraire.

## Vérifications

- Tests unitaires : moteur (destination locale, origine commune, pause/reprise, annulation, arrêt, refus de lecture), règles musicales, validation versus activation, imports, soumission originale, double clic/reprise, fermeture des soumissions, nouvelle référence, Chat, vote pendant l’essai, fichier corrompu, confirmation d’upload et réponse PUT perdue.
- Suites existantes ciblées : scène, barre Viewer, interactions publiques, infrastructure et repository Wave.
- Chrome headless : disposition desktop 1440 × 1000 et mobile 390 × 844 ; aucun débordement horizontal, uniquement Chat/Wave, compteur vidéo visible et bouton Quitter effectivement cliquable.
- Véritable rendu `OfflineAudioContext` dans Chrome : deux sources à 0,04 s, silence avant le départ, somme PCM attendue 0,25, même somme après répétition, gains reliés uniquement à la destination locale.
- Parcours navigateur avec WAV personnel : import local, solo, toutes les vidéos du live muettes, passage dans Chat, retour au live. Le niveau effectif 0,3182 avant l’essai est restauré exactement après ; le brouillon reste présent.
- Migration exécutée avec PGlite et schéma représentatif : état actif, validation en attente, activation, absence des propositions privées d’autrui, longueurs autorisées, références autorisées, refus des originaux et des droits révoqués. Cette vérification ne remplace pas un déploiement de toutes les migrations sur Supabase et des essais multi-comptes avec le média-plane réel.
- Build Vite réussi. Le contrôle TypeScript global rencontre des erreurs préexistantes hors de ce chantier ; les fichiers Viewer sont vérifiés séparément dans sa sortie. Une suite élargie rencontre également un test V4 sensible aux fins de ligne CRLF et une erreur WebSocket/jsdom dans le test Chat host. Ces problèmes ne sont pas masqués ni présentés comme des validations réussies.

Les captures sont dans `artifacts/wave-viewer/`. Les scripts de preuve locaux et journaux de cette passe sont dans `.tmp/wave-viewer-*` et `.tmp/verify-wave-viewer-sql.mjs`.
