# Rooms Windows — validation du 26 septembre 2026

## Modifications

- Cage viewer : En direct / Audio / Affichage, projection du runtime du tournoi et de l’Open Mic, tableau agrandi, portraits verticaux et miniature host déplaçable localement. La prod et la candidature existantes restent séparées.
- Golden Likes : accès des viewers connectés, quota partagé host/artistes, revalidation serveur avant envoi, actualisation au retour dans la fenêtre et par événements Supabase. Aucun paiement réel effectué.
- Mixeur : ouverture de FX voix pour préparer son passage sans être déjà sur scène. Le moteur audio existant est conservé.
- Classe : vignettes viewer avec portraits, commandes limitées au rôle, ressources de démonstration audio/vidéo/lien dans le modèle commun et aperçu exclusif. Aucune ressource fictive injectée dans une room live. Numérotation et distinction sélection/prise de parole côté host. Correction d’une ancienne règle de hauteur du deck qui s’appliquait encore au lecteur replié.
- Scène, Place, Wave et Loge : surfaces et espacements rapprochés du mixeur, cartes plus compactes, épinglage et cadeaux sans grand panneau opaque, chronomètre réduit, commandes VIP stables.
- Beat : correction d’un hook conditionnel qui pouvait casser le rendu quand une boucle de base apparaissait ou disparaissait.

## Contrôles exécutés

- Electron réel, main et preload de l’application, profil QA distinct et fenêtre masquée : les six rooms en viewer et en host, navigation outils/mixeur/chat/invités selon le rôle, ouverture de FX voix et retour Volumes. 12 parcours sans erreur JavaScript, 36 captures aux tailles 1440×900, 1280×720 et 900×650. Données de démonstration, pas de validation serveur implicite.
- `npm run typecheck:ci` : aucun diagnostic.
- `npm run test:desktop-shell` : 3 tests réussis.
- `npm run build` : réussi.
- Vérification finale ciblée : 41 tests réussis dans 7 fichiers (Cage viewer, ressources Classe, Golden Likes, FX listener, miniature, résultats, Beat).
- Lecteur Classe : les 2 tests de conservation de la piste et du comportement repli/dépli passent. Pour mesurer le layout final de la fenêtre Electron masquée, les transitions sont neutralisées dans le harness QA uniquement, car Chromium suspend leur progression lorsque la fenêtre reste masquée.
- Contrôle final Classe à 900×650 : 24 portraits viewer visibles sur 6 colonnes et 4 rangées, deux actions avec libellés, fond transparent. Chez le host, le lecteur passe de 162 à 48 px et la grille remonte de 115 px ; marge de 9 px, aucun chevauchement. Le dépliage restaure le lecteur.
- Suite complète exécutée avant les derniers correctifs ciblés : 2 639 réussis, 126 échecs, 2 ignorés. Elle n’est pas verte. Sur six fichiers concernés exécutés également depuis une archive du commit de départ e6f4109, 28 échecs communs sont reproduits. Cela ne démontre pas que les 126 échecs sont tous préexistants. Les nouvelles attentes liées aux libellés et à l’onglet Affichage ont ensuite été corrigées et retestées.
- Lint global exécuté : erreurs restantes hors des modifications, notamment worklet, expressions régulières audio et adaptateur BytePlus. Le lint des fichiers modifiés ne remonte aucune erreur ; des avertissements existants restent présents.

## Limites et suivi d’intégration

- La migration `20260926190000_golden_like_profile_invalidation.sql` est préparée, pas déployée. La vérification de la publication Realtime distante reste à faire ; le rafraîchissement périodique et au focus est conservé.
- Le tableau agrandi est couvert par les tests de composants. Le scénario Electron initial ne contenait aucun tableau publié.
- Ces contrôles ne prouvent pas une session host/viewer réelle croisée avec le Web, ni le téléchargement live de la prod Cage.
- Aucun installateur n’a été publié par cette mission. Aucun lien public de release Windows n’était disponible lors de la vérification.

Les journaux et captures QA restent dans `.tmp/rooms-viewer-qa`, exclus de Git.
