# Reprise Meewav après règlement de Supabase

Mis à jour le 26 septembre 2026. Ce document remplace les conclusions de l’audit initial conservé dans le dépôt Android. Il ne contient aucune clé ni aucun mot de passe.

## Bloc à transmettre au prochain Codex

```text
Reprends le chantier Android ↔ Meewav Windows, studio intégré « OBS Meewav », après mon règlement de Supabase. Le site web autonome et iOS restent hors périmètre. Je t’ai autorisé à auditer et corriger tout le câblage, y compris messagerie et globe. Nous utilisons BytePlus, et notre autotune propriétaire : ne demande pas une licence Superpowered.

Lis d’abord ce document complet :
C:\Users\linkw\Desktop\Meewav-Windows\REPRISE_APRES_SUPABASE_2026-09-26.md

Dépôts en place :
- C:\Users\linkw\Desktop\Meewav-Windows
- C:\Users\linkw\Desktop\Meewav-Android
Préserve les modifications locales et les travaux concurrents, notamment Cage/Loge/studio. Ne réinitialise ni ne remplace les sources. Ne réimporte pas automatiquement les copies vendor Android depuis Windows. Pour les commits Windows de ce chantier, utilise le dépôt fetahMW/Meewav-windows et la branche codex/desktop-studio-polish ; le remote upstream pointe sur le dépôt Web et n'est pas la destination de publication. La publication du code sur GitHub ne déploie pas le backend Supabase : aucun déploiement serveur de ce chantier n'a été effectué.

Ma règle confirmée : délègue exploration, audits factuels, recherches, vérifications et tout computer use à gpt-6-luna en effort low pour économiser les tokens ; fais toi-même l'analyse, les décisions et toutes les modifications du code. Les agents utilisent les mêmes dossiers et ne modifient pas le code.

Projet partagé vérifié : Meewav Dev, ref dqabekaqpznjsagoxzwc, région Supabase eu-west-1. Il était INACTIVE. Sa restauration via API a renvoyé HTTP 402 « This organization has unpaid invoices. Settle outstanding payments before trying to restore project. » L’erreur SQL « Tenant or user not found » ne venait PAS du sélecteur Démo/Application réelle. Le sélecteur est distinct et vérifié sur les deux plateformes.

L’authentification Supabase CLI locale fonctionne déjà. Ne me redemande pas des accès SQL par défaut. Utilise les accès existants sans imprimer les secrets. ATTENTION : le lien supabase/.temp/project-ref de Windows ne pointe pas sur le projet vérifié ; ne lance pas db push --linked. Toujours contrôler explicitement le projet ciblé.

Le code local a été profondément corrigé, compilé et testé ; le backend commun correspondant n’a PAS été déployé. L’ancienne fonction distante byteplus-token est incompatible avec le nouveau contrat des clients. Il faut réconcilier le schéma distant et les migrations, appliquer le backend puis tester réellement Android ↔ Windows avant de déclarer la parité complète ou de distribuer ces builds.

Supabase payé ne résout pas tout seul les autres prérequis : les identifiants IAM BytePlus pour les API de révocation sont absents de la configuration connue, et la console BytePlus affichait un écran de connexion. Les clés RTC APP_ID/APP_KEY existent déjà sur Supabase. Ne fabrique pas de clés IAM ni ne change le fournisseur.

Après reprise : vérifier le statut du projet ; rétablir le service si nécessaire ; lire le préflight et l’historique des migrations ; corriger les incompatibilités réelles ; déployer les migrations/fonctions/configurations manquantes ; tester authentification, rooms, prises de parole, autotune, studio/capture, appels et messages, profils/globe et retours arrière. Lire ci-dessous les limites exactes des validations et les travaux encore ouverts. Ne confonds pas build réussi, simulation et test sur appareils.
```

## Ce qui a changé localement

### Rooms, studio et audio

- Windows utilise `@byteplus/rtc` 4.69.2 au travers de `src/lib/byteplusRtc.ts`. Les services de Rooms et le moteur du studio utilisent cette couche. Les anciens noms de certains fichiers, RPC et workers contiennent encore « livekit » pour conserver leur identité ; leurs nouvelles opérations RTC passent par BytePlus. `livekit-client` a été retiré des dépendances Windows.
- Le contrat public `byteplus-token` utilise un `roomId`, l’identité authentifiée et une politique serveur : rôle, publication, membres et réception autorisée. La signature est BytePlus v001 ; les jetons publics sont courts (120 s). Les clients actualisent leurs autorisations et se ferment lors d’un refus. Les invités ne publient pas simplement parce que leur interface se prétend « guest ».
- La politique couvre les rooms généralistes, les invitations réellement sur scène, et la parole canonique Classe utilisée par Android. Un registre de jetons/générations et des outbox de révocation évitent qu’un ancien événement coupe un invité qui vient d’être réautorisé.
- Windows dispose d’un adaptateur vers les RPC canoniques de mains levées Classe : lire, demander avec consentement/micro, accorder, libérer, fermer les mains et retirer les demandes. L’interface n’assimile plus le siège premium ou l’appel privé à une autorisation de publier dans toute la room.
- Android distingue écoute et publication ; il gère l’autorisation micro, les promotions/rétrogradations, le partage écran Windows et le nettoyage des sessions. Quitter comme invité ne termine pas la room du host.
- L’autotune actif est propriétaire : DSP natif Android et AudioWorklet Windows, avec corrections de pitch, plages de ratio, bypass, erreurs/valeurs non finies. Aucune clé Superpowered n’est nécessaire pour ces chemins. Le prototype Windows natif WASAPI/VST3 reste un chantier séparé ; il ne faut pas annoncer qu’il remplace le moteur actif WebAudio/Electron.
- Le studio arrête immédiatement ses pistes micro/caméra avant d'attendre la déconnexion réseau. Les appels directs privés ne peuvent pas démarrer ou rester actifs sur `/studio`, comme sur les routes de Room.
- La création Windows est idempotente et atomique ; la Wave reste masquée pendant la préparation des assets et se publie après validation. La Cage conserve son parcours dédié. Les libellés LIVE couvrent désormais tous les types. Les accès « membres » / « sur invitation », dépourvus d’un contrat serveur de confidentialité, ne sont plus proposés comme choix LIVE ; ils restent dans la démonstration.
- `rooms_live_catalog_v1` fournit le même catalogue sûr aux deux clients : rooms réellement prêtes, non terminées, exclusion des bans, type d’expérience courant ou spécialisé. Les sources Android et Windows consomment ce nouveau RPC : son déploiement est indispensable.

### Messagerie

- Audits des deux clients : conversations/messages/RPC, envoi idempotent et nouvelles tentatives, pièces jointes avec préparation/upload/finalisation, lecture/non-lus, canaux privés Realtime qui invalident puis relisent les données. Les tests ciblés n’ont pas révélé de défaut nominal supplémentaire dans ces flux.
- Les boutons d’appel audio/vidéo Windows étaient désactivés. Ils commandent maintenant un contrôleur global sous l’authentification, indépendant de la page ouverte : appels entrants, acceptation/refus, micro/caméra, raccrochage, heartbeat, Realtime privé et transport BytePlus. Les permissions sont demandées après l’action explicite de l’utilisateur.
- Les appels directs de messagerie restent distincts des appels privés de Classe/Loge. Leur serveur est `messaging-call-token` + `messaging_video_call_v1`, jetons de 60 s. Le serveur décide des deux correspondants et du mode audio/vidéo. La publication vidéo n’est pas accordée dans un jeton audio seul.
- Le renouvellement valide les identités ; un raccrochage pendant une capture en attente libère les appareils ; une réponse de synchronisation ancienne ne réouvre pas un appel fermé localement. La reprise de lecture après blocage autoplay utilise `engine.play(...)`, correction faite aussi sur Android.
- Les appels successifs attendent la fin du nettoyage du moteur précédent sur les deux clients. `connect` et `dispose` sont idempotents ; tous les demandeurs de nettoyage attendent la même promesse. Windows revérifie l'absence de Room/studio après la demande d'autorisation et la réponse serveur, et ne présente pas un micro comme coupé avant que le transport soit effectivement prêt.
- Un appel accepté sur un autre appareil n’active pas automatiquement le micro de celui-ci : le consentement est local à chaque appel, dans les deux clients. Le polling passif utilise la nouvelle action RPC `peek`, sans prolonger artificiellement le heartbeat d’un autre appareil. Dans Windows, il faut quitter une Room avant de répondre à un appel direct privé, pour éviter une publication simultanée dans le mix public.
- Les conversations historiques Android et les conversations canoniques Windows n’ont pas nécessairement le même identifiant. La migration `20260926130000_messaging_calls_cross_client.sql` conserve le FK historique et ajoute un FK canonique exclusif. Le même RPC accepte les deux modèles en vérifiant les membres actifs et les blocages. Une révocation détectée pendant `media` est persistée, puis la fonction Edge refuse le jeton.
- **Limite produit constatée, non résolue :** sur Android, les appels directs actuels sont liés à la WebView visible et s’arrêtent à la suspension de l’activité. Il n’existe pas de push FCM ni de service natif propriétaire de l’appel pour recevoir/maintenir un appel comme un téléphone en arrière-plan. Une notification locale seule ne corrige pas ce point. Si le périmètre doit inclure les appels mobiles en arrière-plan, prévoir le transport/service natif et le signalement push, avec essais sur appareil ; ne pas masquer cette limite par un simple retrait du `onPause`.

### Globe et profils

- Le globe Windows réel était vide de profils, et sa popup était celle de la démonstration. L’hôte lit maintenant la vue publique `globe_public_markers_v1`, avec pagination et annulation ; il transmet seulement cette projection à l’iframe par un pont qui vérifie origine, source et canal. Aucun jeton de session ne passe dans une URL ou un message de ce pont.
- La population réelle, les recherches et les compteurs utilisent les profils chargés, avec un rafraîchissement périodique et au retour au premier plan. Une erreur ne remplace jamais les profils par des fixtures. Les coordonnées nulles/invalides sont écartées ; les communes corses et les URL d’images sont normalisées.
- Les marqueurs ouvrent le vrai pré-profil React de Windows : données publiques, follow, médias publiés, accès au profil et à la messagerie réelle par UUID. L’utilisateur ouvre son propre profil via la route dédiée. L’anneau d’artistes de démonstration n’est pas proposé dans ce mode réel.
- Android disposait déjà du chargement réel ; son normaliseur a reçu les corrections communes. La vue a été copiée dans les migrations Windows. Elle dépend de la fondation identité/projections publiques Windows : le dossier de migrations Android isolé ne suffit pas à reconstruire tout le backend. **Réconcilier les migrations communes au lieu de lancer deux historiques séparés.**

### Application Windows

- Choix explicite Démo / Application réelle, sans fallback silencieux du réel vers des fixtures.
- Liens `meewav://app/auth/callback` et `meewav://app/auth/update-password` traités par Electron, instance unique, validation des chemins/paramètres et bascule en réel au retour d’authentification. L’installateur enregistre le protocole.
- Builds isolés dans `dist-desktop`, staging temporaire, exports immuables sous `release/windows/build-*` et `release/windows/latest.json`. Cela évite d’écraser des DLL qu’une instance déjà lancée utilise.

## Comparaison demandée avec le site web

Le dossier `C:\Users\linkw\Desktop\Meewav-Web` a été comparé en lecture seule. Il fournit des briques communes, mais ne contient pas une version complètement câblée à recopier dans Windows :

| Élément | État constaté dans le site web |
| --- | --- |
| Appels directs | Les deux boutons de `src/features/messaging/MessageWorkspace.tsx:2901` sont désactivés et portent le libellé « Appels directs non connectés au service audio/vidéo ». |
| Globe réel | La migration `globe_public_markers_v1` et des API de profils publics existent. Le client `VinylGlobe.tsx` et son bridge vendor n'ont pas de chargement des marqueurs réels ni de messages `markers-request` / `profile-select`. |
| Catalogue et création | `roomsHome.live.ts` lit directement `rooms_v2`. `createLiveRoom.ts` crée seulement une Place par insert direct ; les autres types sont refusés par le dialogue de lancement réel. |
| Transport du studio/Rooms | `StudioMediaEngine.ts`, `placeLiveKit.service.ts` et `placeLiveCallMedia.service.ts` utilisent encore `livekit-client`, alors que Windows passe par l'adaptateur BytePlus. |
| Autotune | Le moteur YIN MeeWav est présent sous forme expérimentale, mais le choix desktop dans `PlaceRoomExperience.tsx` sélectionne encore Superpowered. Windows choisit désormais MeeWav. |

Nuance : le `package.json` Windows conserve encore une dépendance Superpowered historique. L'audit des imports ne trouve aucune chaîne active vers son adaptateur/worklet dans le produit ; ils restent liés à des sources et tests historiques. Le chemin audio actif utilise MeeWav et ne nécessite pas de licence Superpowered. Ne pas prétendre que toutes les traces historiques du SDK ont été supprimées. Le backend partagé et son état de pause sont un sujet distinct des branchements propres à chaque client.

## Backend : état vérifié, pas présumé

Projet : **Meewav Dev / dqabekaqpznjsagoxzwc**. Les configurations locales Android, Windows et le projet Web frère correspondent à ce projet. Le site Web n’a pas été modifié.

- La session CLI Supabase 2.118.0 fonctionne et voit le projet ; le jeton est dans le Credential Manager Windows, cible `Supabase CLI:supabase` (fallback ancien : `Supabase CLI:access-token`). Le helper lit cela en mémoire, sans l’imprimer ni le persister.
- Le projet était `INACTIVE`. Deux appels de restauration ont été rejetés en HTTP 402 pour factures impayées. Aucun règlement/upgrade n’a été tenté.
- Source distante de `byteplus-token` inspectée avant les changements : ancien corps `{channelName, identity, canPublish}`, réponse limitée, TTL quatre heures, contrôles d’invitation plus larges et absence du contrat de politique attendu par les clients corrigés. **La présence du nom de fonction ne prouve pas sa mise à jour.**
- `rooms-live-call-token`, `livekit-revocation-worker` et `rooms-live-call-revocation-worker` étaient absents de l’inventaire distant. `messaging-call-token` existe, mais son contenu final doit aussi être redéployé après la migration des appels.
- Noms de secrets RTC `BYTEPLUS_RTC_APP_ID` et `BYTEPLUS_RTC_APP_KEY` déjà présents.
- Le helper a créé et vérifié les noms des trois configurations absentes : `BYTEPLUS_RTC_REGION` (`ap-singapore-1`, région de signature BytePlus), `LIVEKIT_REVOCATION_WORKER_SECRET`, `LIVE_CALL_REVOCATION_WORKER_SECRET`. Aucune valeur existante n’a été remplacée.
- **Toujours absents :** `BYTEPLUS_ACCESS_KEY_ID` et `BYTEPLUS_SECRET_ACCESS_KEY`. La console officielle BytePlus redirigeait vers l’écran de connexion ; aucun accès authentifié n’a été trouvé. Il faut des identifiants IAM réels, autorisés pour les API RTC de gestion/révocation, pas des valeurs aléatoires. Vérifier aussi l’activation BytePlus des privilèges fins de publication/révocation et la portée de l’application.
- L’ajout des deux URI de retour desktop à la configuration Auth Supabase a échoué en HTTP 400. À réessayer une fois le service actif, en conservant toutes les URL déjà autorisées.
- Les secrets Edge des workers ne prouvent pas que le scheduler est configuré. Après restauration, installer la même valeur dans la configuration SQL/Vault des appels de workers ; au besoin régénérer les deux côtés ensemble en mémoire. Ne pas supposer qu’une API de liste de secrets permet de récupérer leur valeur originale.

## Ordre de reprise serveur

1. Vérifier la santé et l’identité du projet avec les accès existants. Attendre `ACTIVE_HEALTHY` après restauration ; un paiement annoncé n’est pas une preuve que le service a redémarré.
2. Depuis Windows : `npm run backend:check`. Ce contrôle est en lecture seule et ne montre que noms/présence. Il ne valide ni le contenu des fonctions ni les migrations.
3. Lire/exécuter `scripts/byteplus-deployment-preflight.sql` en lecture seule sur le projet vérifié. Récupérer l’historique distant et les signatures des RPC ; comparer les dépendances des deux dossiers de migrations. Préférer une API de gestion authentifiée existante pour ces opérations si elle est disponible ; ne pas réclamer automatiquement un nouveau mot de passe SQL.
4. Points à résoudre avant application : DDL canonique Classe et fonctions de consentement/événements ; initialisation de ses settings lors de la création Windows ; type de retour existant de `rooms_end_room_v1` avant son `CREATE OR REPLACE` ; fondations identité/messagerie publiques ; outbox/révocation/scheduler ; moteur Wave et préparation des assets. Les fixtures PGlite n’établissent pas ces prérequis distants.
5. Appliquer seulement les migrations effectivement manquantes et compatibles, dans l’ordre de dépendance. Ne pas faire `db push --linked` ni pousser aveuglément toutes les migrations historiques de Windows vers la base Android.
6. Configurer les véritables clés IAM BytePlus, les URI Auth et les workers/schedulers. Le script `scripts/configure-desktop-backend.ps1 -ProjectRef dqabekaqpznjsagoxzwc` est un diagnostic ; ajouter `-Apply` ajoute les URI et crée seulement les secrets absents. Il ne restaure, ne paie et ne déploie rien.
7. Déployer explicitement sur ce projet : `byteplus-token`, `rooms-live-call-token`, `livekit-revocation-worker`, `rooms-live-call-revocation-worker`, `messaging-call-token`, avec leurs fichiers `_shared` et les options `verify_jwt` du dépôt. Les handlers des jetons contrôlent l’utilisateur indépendamment.
8. Vérifier les fonctions et politiques avec deux comptes de test autorisés, puis les clients. Les fichiers locaux corrigés ne doivent pas être annoncés compatibles avec l’ancien backend.

Nouvelles migrations principales Windows :

- `20260923170000_globe_public_markers_v1.sql` (projection partagée avec Android ; potentiellement déjà appliquée sous cet identifiant).
- `20260926120000_rooms_byteplus_media_policy.sql`
- `20260926121000_rooms_byteplus_token_revocation.sql`
- `20260926121500_rooms_byteplus_revocation_triggers.sql`
- `20260926122000_rooms_atomic_desktop_launch.sql`
- `20260926123000_classe_host_floor_moderation.sql`
- `20260926130000_messaging_calls_cross_client.sql`
- `20260926131000_rooms_live_catalog.sql`

## Preuves locales et limites

- Android : bundles Rooms, messagerie et globe reconstruits sans réimport du vendor. `assembleDebug` réussi, C++ compilé pour les quatre ABI. Tests JVM réexécutés : **82/82**. Les tests natifs DSP ont été compilés, pas exécutés sur appareil.
- Windows : `npm run typecheck` réussi, zéro diagnostic, y compris après les derniers correctifs. Une série ciblée a passé **14 fichiers, 79 tests**, dont BytePlus RTC, création des rooms, droits Classe, appels privés, autotune, globe, appels de messagerie et choix Démo/réel. Après les dernières corrections de navigation/nettoyage, les trois fichiers concernés ont été revérifiés : **21 tests d'appels de messagerie et 3 tests du moteur studio, soit 24/24**. Ces séries se recouvrent : ne pas additionner leurs comptes. Rapports : `%TEMP%\windows-targeted-final-tests.json`, `%TEMP%\windows-targeted-final-typecheck.txt` et `%TEMP%\windows-final-prepackage-tests.txt`. Les deep links avaient également passé leurs trois tests ciblés.
- PostgreSQL via PGlite : **8/8** pour politiques BytePlus/Classe/création/catalogue ; **7/7** pour appels entre les deux schémas, droits, bans/blocages, fin et membres quittés. Installation de la migration des appels également vérifiée sur une base sans tables legacy. Certaines fonctions préexistantes, Auth et Realtime sont des fixtures : aucun test Supabase de bout en bout n’a été remplacé par ces résultats.
- Signatures de jetons : tests Deno v001/HMAC/privilèges. Fonctions token/worker vérifiées par Deno.
- Dernier contrôle Deno : **sept cibles sans diagnostic, quatre tests de signature réussis**. Le CORS commun accepte l’origine réelle de la WebView Android `https://appassets.androidplatform.net` ainsi que `meewav://app`.
- Le dernier résultat de la suite générale Windows est complété en fin de document. Ne pas transformer des attentes UI anciennes en preuve d’une régression de câblage ; ne pas considérer non plus la suite complète comme verte avant vérification.
- Le réseau RTC inter-appareils, la sortie audio réelle, les permissions OS, l’écran/caméra et la reconnexion restent à tester. L’émulateur Android accessible était offline ; aucun appareil n’a été installé/lancé pendant cette phase. Les outils CUA n’exposaient pas les applications Windows natives : la [skill computer-use](C:/Users/linkw/.codex/plugins/cache/openai-bundled/computer-use/26.924.20706/skills/computer-use/SKILL.md) impose « Use `cua_repl` (JavaScript) for all Computer Use actions ». Cette contrainte a empêché une inspection visuelle native ; aucun autre automate n’a servi à la contourner.
- Charge des appels privés de Room : le SDK BytePlus local documente plusieurs moteurs possibles mais recommande au plus deux simultanés. Le produit peut ouvrir un moteur public et plusieurs retours privés (jusqu'à huit). Cela ne prouve pas une panne, mais nécessite un vrai essai de charge CPU/audio/vidéo avant de certifier ce maximum ; le contrat produit n'a pas été réduit arbitrairement.

## Builds à utiliser pour la validation après backend

- APK **debug**, pas une publication signée de production : `C:\Users\linkw\Desktop\Meewav-Android\app\build\outputs\apk\debug\app-debug.apk`. Dernière reconstruction vérifiée : 26 septembre 2026 à 10:32:32 UTC ; SHA-256 `34FCC6E83DE1B43649100173F75524FB9AC0C99C4770EB52307240EE131665CB`. Le bundle messagerie a été rebâti après la correction des appels successifs ; `assembleDebug` réussit et les tests JVM sont alors `UP-TO-DATE` (les 82 tests avaient été forcés précédemment).
- Installateur Windows courant : `C:\Users\linkw\Desktop\Meewav-Windows\release\windows\build-20260926T103506429Z-913sJG\Meewav Studio Setup 0.0.0.exe`, **725 077 816 octets**, SHA-256 `22E9F5ABD39E205D362427A776A843571A3BF55FC99FFFC1BD8A1955CE5296EF`.
- Exécutable du même build : `C:\Users\linkw\Desktop\Meewav-Windows\release\windows\build-20260926T103506429Z-913sJG\win-unpacked\Meewav Studio.exe`, **246 032 896 octets**, SHA-256 `7DE408453FC37BCA3A115390494CE88AD2FE4030F97675356D5B9038BC381CBE`.
- Source de vérité si un rebuild survient : `C:\Users\linkw\Desktop\Meewav-Windows\release\windows\latest.json`.

Une version packagée antérieure a atteint `app-ready` et `did-finish-load` avec un profil QA isolé. Le dernier installateur a seulement été construit, sans ouverture visuelle. Ne pas fermer les instances utilisateur déjà ouvertes ni écraser leur profil.

L'APK debug pèse **1 481 165 915 octets**, principalement à cause des médias de démonstration copiés dans plusieurs bundles : Rooms ~372 Mo compressés, Scene ~208 Mo, Messaging ~155 Mo, Globe ~124 Mo, Tremplin ~123 Mo. L'inspection ZIP ne révèle pas un installateur ou un build imbriqué comme cause principale. Les quatre ABI natives n'expliquent qu'une petite part de ce volume. Ce build sert à la validation locale ; la déduplication/livraison des assets devra être traitée avant une distribution Android de production, sans casser le mode Démo existant.

## Validation réelle à réaliser

- Démo puis réel : absence de requêtes de production en démo, aucun faux profil/room/message en réel ; connexion, récupération du compte et retours `meewav://`.
- Rooms Android host → Windows viewer puis Windows host → Android viewer ; les six types ; création/fin/quitter ; rejet des spectateurs non autorisés ; invitation sur scène/retrait/ban/reconnexion ; disparition des sessions terminées et des préparations Wave du catalogue.
- Micro brut puis autotune, pitch/tone/bypass, écoute distante de l’audio traité ; caméra/écran/son système, changement de source, annulation d’autorisation et libération du micro après fermeture.
- Classe : main levée avec consentement, grant/release, siège vs parole vs appel privé, retrait de droits pendant publication. Loge : appel privé et fin ; absence de fuite vers le mix public.
- Messagerie : texte/réponse/lecture/non-lus, fichiers/image/audio/vidéo/stems, nouvelles tentatives sans doublon, conversation directe/collab/groupe/projet selon leurs permissions ; appels audio et vidéo entrants/sortants dans les deux sens, refus/occupé/expiration/blocage/raccrochage pendant une permission, renouvellement et lecture après autoplay. Tester les identifiants de conversations historiques et canoniques.
- Globe : profil visible/invisible/ghost, précision publique des coordonnées, recherche, clic, follow, pré-profil et message par vrai UUID ; changement de compte et erreurs réseau sans profils de démo.
- Workers : exécution réelle des outbox, erreurs/retry, absence de coupure d’une nouvelle génération autorisée, vérification côté BytePlus de la révocation. Ne pas se contenter du voyant « connecté » côté client.

## Dernière suite générale Windows

La dernière exécution complète, terminée le 26 septembre vers 12:16 heure locale, comptait **305 fichiers réussis et 31 en échec**, soit **2 582 tests réussis, 131 échecs et 2 ignorés** sur 336 fichiers. Elle a chevauché les dernières modifications des appels privés : ce résultat ne représente pas un instantané cohérent du code final. Les derniers changements ont ensuite passé les **24 tests ciblés appels/studio** et le typecheck sans diagnostic. Les journaux de la suite générale sont `%TEMP%\windows-unit-handoff-final.txt` et `%TEMP%\windows-unit-handoff-final.json`.

La suite générale reste donc en échec. Une partie des assertions porte sur les anciennes attentes UI et contrats Cage/LiveKit ; les autres échecs doivent être examinés avant d'annoncer une validation générale. Les résultats locaux ne prouvent pas le fonctionnement réel du backend ou du média entre appareils.

Le soupçon Cage a été vérifié jusqu'au service : l'UI active utilise `CageCompetitionWorkspace` et `cage.competition.command`, traduit vers les RPC canoniques. Les tests en échec appelaient encore `cage.match.select` / `cage.battle.round` et le modèle de votes historique. **Huit suites du parcours Cage actuel passent : 83/83**, journal `%TEMP%\windows-cage-runtime-targeted.txt`. Aucun changement hasardeux de l'adaptateur n'a été fait pour satisfaire les anciennes attentes.
