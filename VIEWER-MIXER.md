# Mixeur personnel viewer — routage Web

Branche de travail : `codex/viewer-mixer-routing`, base `b740ab2`. Aperçu séparé : http://127.0.0.1:5184/rooms/place?demoRole=viewer. Ce document décrit la tâche avant validation et fusion.

## Routage

`Ma voix` reprend la piste traitée par la chaîne vocale existante. `Musique` correspond au lecteur interne. `Son du PC` correspond à une capture d’onglet distincte, disponible uniquement dans les navigateurs de bureau compatibles. Chaque source traverse son gain et son mute, puis le Master commun, un analyseur et le limiteur. La piste résultante sert aux invitations du host et à la publication autorisée sur scène.

Le Master ne se connecte jamais aux haut-parleurs, au volume Windows ou au retour du live. Le retour et le monitoring vocal restent séparés. Le niveau du retour s’applique aussi à l’élément audio de l’appel reçu. Une invitation explicite prépare et clone le Master existant, sans ouvrir un deuxième micro brut. Le host règle le niveau global du participant dans son programme.

La préparation locale ne publie pas le son. Les permissions serveur et l’acceptation des invitations existantes restent nécessaires. Un appel accepté exclut la publication parallèle du même Master dans la room. Les réglages persistés ne comprennent aucune autorisation ou piste média.

## Wave

Aucune modification des horloges, de `currentTime`, des points de reprise, du scheduler ou du transport des boucles Wave. Les auditions privées restent dans leur chemin existant. Ce travail ajoute un bus de niveau en aval des sources personnelles et ne remplace pas le moteur de boucles.

## Capture Web

Le sélecteur demande un autre onglet avec son audio. L’onglet courant, les écrans, les fenêtres et le son global du système sont exclus ; les captures MeeWav identifiées sont refusées. La fin de capture retire uniquement cette source. La vidéo nécessaire au sélecteur n’entre jamais dans le Master et n’est pas publiée.

Les options utilisées sont documentées par Chrome : https://developer.chrome.com/docs/web-platform/screen-sharing-controls. Elles ne constituent pas une capture native du mix système Windows. Le publisher natif externe préexistant ne traverse pas ce nouveau bus Web ; son intégration et sa validation nécessitent le moteur natif et restent hors de cette validation Web.

## Vérifications effectuées

- Build de production réussi.
- 45 tests ciblés réussis : graphes audio, gains/mutes, capture, persistance par compte, invitations et retour des appels, UI et intégration de la room.
- 65 tests Wave réussis : transport, intégration du transport et auditions viewer.
- 9 mesures dans un véritable AudioContext, sans sortie haut-parleur : somme des sources, gains indépendants, Master, mutes, perte du micro sans perte de musique et détection de saturation. Page reproductible : `/tests/manual/viewer-send-audio.html`.
- Autres tests de cycle de vie/publication : suite de 12 tests réussie (incluant les 2 tests de persistance déjà comptés ci-dessus).
- Contrôle TypeScript : aucune erreur rapportée dans les fichiers modifiés ou ajoutés ; le dépôt conserve des erreurs globales préexistantes.
- Un test UI Wave échoue aussi sur main : attente ancienne du libellé du lecteur global. Un test de contrat serveur attend encore une restriction à `place` ; les deux fichiers concernés sont identiques à main. Les 9 autres tests de contrat serveur passent.

La publication entre deux comptes réels, les périphériques matériels et le publisher natif n’ont pas été validés de bout en bout dans cette session. Aucun merge dans main n’a été effectué pour cette tâche.

## Vérification Green House

Le parcours viewer de `PlaceAudienceJourney` vérifiait auparavant un micro brut indépendant. Il prépare maintenant le micro traité du mixeur et ne capture que la caméra pour son aperçu. Le vumètre de voix après effets et celui du Master utilisent les mesures du bus personnel existant. La validation explicite des réglages est invalidée lors d’un changement de niveaux/piste ou de la perte du micro ; les mutes intentionnels restent conservés et signalés. Le bouton Micro agit sur le même mute de voix.

La sortie de la Green House arrête uniquement sa caméra d’aperçu et conserve le Master. L’état « prêt » ne modifie pas les permissions serveur ni l’acceptation de l’appel privé. Le contrôle GreenHouse utilisé pour le lancement du host reste inchangé. La capture ne démarre pas à l’affichage ; les réponses tardives à une demande de caméra quittée sont arrêtées.

Validation supplémentaire : 20 tests passent (Green House, persistance du mixeur, permissions des appels, mise à l’antenne et mix du host), build réussi. Les tests comprennent la capture vidéo seule, l’absence de capture automatique, la confirmation des niveaux et la conservation de la piste Master à la fermeture. Ces tests ne remplacent pas une écoute entre deux comptes réels avec périphériques matériels.
