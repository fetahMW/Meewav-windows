# La Scène — parcours vidéo, version V3

Travail du 8 septembre 2026, branche `codex/scene-watch-experience`, base `95f07b4a7`.
Aperçu de tâche : http://127.0.0.1:5188/scene. La version stable 5182 reste sur main.
Référence : MASTER_PROMPT_UX_VIDEO_MUSICALE_V3.md fourni par l’utilisateur, qui remplace les deux prompts antérieurs. L’identité MeeWav, le poteau, la navigation supérieure et MeeWav TV sont conservés.

## Ajustement demandé sur captures : accueil et proportions du lecteur

L’accueil reprend désormais une grille de trois vidéos sur desktop, une rangée de Shorts et la suite du catalogue chargée progressivement (24 vidéos initiales). La colonne vidéo repliable contient Accueil, Shorts, Abonnements, les artistes suivis et l’espace Vous : chaîne, historique, playlists, À regarder plus tard et vidéos aimées. Les chips de formats, styles et récence utilisent les filtres et les URL existants. Les abonnements réutilisent la source de suivi de La Scène, y compris ses fixtures en aperçu ; aucune nouvelle donnée de compte fictive n’est créée par ce menu.

Le bandeau secondaire est noir-violet translucide avec flou, placé sous le châssis pour respecter son angle. Son ancien dégradé vert est supprimé. La largeur du lecteur horizontal dépend aussi de la hauteur disponible : commandes visibles dès l’ouverture, format cinéma borné et plein écran libéré de cette limite. La navbar principale, le poteau et la TV restent les composants existants.

Validation : 49 tests réussis (ShortsPage, ShortsVideoPlayer, sceneWatchExperience), build Vite réussi. Captures Chrome à 1440 × 900 et 390 × 844 ; ouverture du lecteur aussi contrôlée dans une fenêtre très large et courte (2294 × 735). Chips Clip, bibliothèque À regarder plus tard, état vide des vidéos aimées et menu mobile vérifiés. Mode cinéma au clavier : scroll conservé à zéro, lecteur de y=154 à y=816 dans une fenêtre de 900 px. L’aperçu signale honnêtement l’indisponibilité du catalogue distant et conserve les contenus déjà disponibles.

## Studio : largeur et surfaces graphite

Le Studio utilise son propre menu sans cumuler le menu du catalogue et les chips vidéo. La limite centrée de 1580 px et le second padding ont été supprimés : un seul espace de 24 px de chaque côté sur desktop, 16 px sur mobile. Les surfaces partagées du Studio sont noires et graphite, avec un reflet diagonal discret, des arêtes éclairées et des accents violets. Le bouton Publier utilise un dégradé laqué sans texture à pois.

Contrôles Chrome : tableau de bord, contenus et analyses à 1440 × 900 ; bibliothèque à 1100 × 850 ; tableau de bord mobile à 390 × 844. Aucun débordement horizontal du document ; la bibliothèque intermédiaire masque correctement les colonnes secondaires. Les menus défilants mobiles restent dans leur conteneur. Build Vite réussi. Tests : 35 réussis au total (ShortsPage, modèle Studio, interface Studio), après correction du contexte d’authentification manquant et d’une ancienne attente de libellé dans les tests Studio. Les données et actions existantes ne sont pas modifiées.

## Trait de progression violet

La navigation instantanée ne saute plus à 100 % dès la première frame : le trait parcourt environ 78 % en 1,4 s, termine en 650 ms puis reste plein 250 ms avant son fondu. Cette temporisation concerne uniquement l’indicateur et ne bloque pas la page. Une requête encore en cours conserve une progression indéterminée sous 92 % ; sa résolution poursuit le même trait sans retour en arrière. Une nouvelle route ou une nouvelle requête relance proprement l’indicateur. Le violet est uni, sans halo, pour une ligne nette. Quatre tests à horloge contrôlée vérifient ces transitions et les changements rapides de route ; build Vite validé.

## Publicité commune et commandes du lecteur

Chaque ouverture de vidéo La Scène (horizontale, Short ou replay) présente le même spot interne MeeWav, issu du média existant `/media/tremplin/ecosysteme-meewav.mp4`. L’extrait dure au maximum 15 secondes ; « Ignorer la publicité » se débloque après 5 secondes du média, pas après un simple délai mural. Pause et arrière-plan arrêtent le décompte. Fin du spot et bouton Ignorer montent ensuite le lecteur normal ; le spot n’alimente pas l’historique ou les statistiques de la création. Les réglages de son sont partagés. Une erreur du média permet de poursuivre. Aucun réseau publicitaire ni campagne payante n’est connecté.

Le lecteur Watch est aligné à gauche dans sa grille, à 20 px du poteau, y compris sur grand écran. La hauteur reste bornée pour garder les commandes visibles. Les icônes de lecture, la progression vidéo et les barres de défilement sont violettes. Le volume desktop propose une piste visible de 108 px ; sur mobile, les commandes se répartissent sur deux lignes. Le démarrage du contenu est déclenché à la frame suivante pour éviter que le nettoyage des effets de montage interrompe l’autoplay après la publicité.

Validation : 58 tests réussis au total (publicité, page, lecteur, parcours Watch, progression), build Vite réussi. Vérifications Chrome du spot, pause à 1,42 s conservant le bouton désactivé, bouton Ignorer puis vidéo en lecture à 0,60 s, fin automatique, marges sur fenêtre 2294 × 735 et commandes sur 390 × 844. Le typecheck global conserve des erreurs préexistantes hors des fichiers modifiés ; aucune erreur dans les composants concernés.

## Diagnostic confirmé

| Parcours | Observé avant | Attendu et cause | Fichiers / validation |
|---|---|---|---|
| Catalogue large | Contenu limité à 1560 px, centré ; plus de 300 px de marge sur un écran large | Occuper la largeur utile avec une petite respiration près du poteau | scene-watch.css ; navigateur : 20 px desktop, 12 px mobile |
| Vidéo puis commentaires | Lecteur modal, verrouillage du body et inert sur les voisins | Vidéo horizontale dans le flux principal ; garder la modale pour les formats verticaux | ShortsVideoPlayer.tsx, ShortsPage.tsx ; DOM, navigation et tests du lecteur |
| Quitter une vidéo | Le lecteur était démonté | Garder la même vidéo en mini-lecteur entre les pages VOD | DOM média identique et temps conservé : test et navigateur |
| Première ouverture de miniature | L’icône superposée interceptait le clic | Une surface de lien, décorations non interactives | CSS pointer-events et liens HTML ; navigateur |
| Fin de vidéo / saisie | Premier enchaînement sans protection contextuelle | Annuler pendant saisie, brouillon, modale, mini-lecteur ou consultation sous le lecteur | scenePlaybackPolicy.ts ; test unitaire et vidéo terminée pendant rédaction dans Chrome |
| Retour dans Explorer | Réinitialisation du nombre d’éléments affichés | Fenêtre de résultats conservée par URL et ancrage de carte | useSceneListWindow, useSceneDocumentScroll ; navigateur après chargement de 48 puis 72 éléments |
| Compte différent | Playlists et historique locaux partagés sans espace de compte | Cloisonnement sans fusion implicite des visiteurs | scenePrivateStorage.ts ; test deux comptes ; ancien stockage conservé, non importé silencieusement |
| URL inconnue | Absence de contenu ou maintien possible de l’ancienne vidéo | État indisponible et réessai, aucune ancienne vidéo sous une nouvelle URL | ShortsPage.tsx |

## Ce qui est livré

Page Watch avec lecteur, titre, artiste, actions, description et commentaires dans le document ; recommandations latérales sur grand écran. Sur une seule colonne, accès persistants Commentaires / À suivre, pagination manuelle des commentaires pour ne pas bloquer l’autre destination. Les panneaux existants gardent leurs verrous temporaires : aucune suppression globale des overflow du projet.

Recherche VOD commune avec suggestions, validation explicite, navigation clavier et URL canonique. Les miniatures et les liens artiste des cartes horizontales permettent l’ouverture native dans un autre onglet. Les menus restent des actions séparées. Le retour conserve la recherche, les paramètres URL, la fenêtre déjà chargée et un ancrage visible. Le lecteur peut être réduit, développé ou fermé sans créer un second contenu audible.

Le trait violet sous le bandeau accompagne navigation et chargement ; il ne constitue pas une mesure de débit. Les publications distantes ont un délai borné, un état d’erreur et un réessai qui ne supprime pas le catalogue disponible. Une réponse tardive d’une tentative abandonnée est ignorée.

## Contrat des transitions

| Déclencheur | Média / suite | URL et données | Focus / échec |
|---|---|---|---|
| Clic normal sur vidéo | Remplace le média choisi | Route Watch partageable, contexte précédent conservé | Haut de la nouvelle page ; erreur média avec réessai |
| Clic modifié / nouvel onglet | Comportement natif du lien | Même URL canonique | Le navigateur gère l’onglet |
| Accueil, Explorer, Bibliothèque pendant VOD | Même élément média réduit | Nouvelle route, progression continue | Recherche reste accessible |
| Réduire / développer | Même élément et progression | Accueil / route du média | Les commandes du mini-lecteur restent utilisables |
| Fermer le mini-lecteur | Arrêt et libération du lecteur | Reste dans la page consultée | Pas de navigation parasite |
| Ouvrir MeeWav TV | Ferme le lecteur VOD ; antenne existante seule | Route TV inchangée | Contrôles et programme TV existants |
| Retour | Restitue l’entrée d’historique | Requête, filtres, liste et ancrage | Focus utile sur un lien enregistré lorsqu’il est encore présent |
| Saisie ou descente sous lecteur | Annule l’enchaînement en cours | Brouillon par compte / vidéo / fil | Aucune navigation automatique après rédaction ; Suivant reste volontaire |
| Changement de compte | Ancien espace démonté avant changement du stockage | Aucune fusion des données anonymes, ni d’un autre compte | Les mutations privées distantes restent soumises aux API existantes |

### Règle unique de suite de lecture

Sélection explicite > répétition du titre à la fin naturelle > file > playlist active > recommandations si autorisées. Le bouton Suivant ignore la répétition du titre. La file appartient à l’onglet via sessionStorage ; elle n’est pas une playlist sauvegardée. La liste active possède son ordre, un mélange de la suite stabilisé au clic et une répétition facultative. Les médias absents restent indiqués et sont ignorés lors de la résolution suivante.

L’interrupteur « Recommandations automatiques » ne désactive pas une file ou une playlist choisie. Un compte à rebours de cinq secondes est annulable et revérifie les protections. L’origine de la suite est indiquée. La réécoute d’une chanson courte ou d’un contenu terminé repart à zéro ; les sessions inachevées d’au moins dix minutes reprennent leur progression. Ce seuil est un choix produit testable, pas une règle de YouTube. Un paramètre `t` explicite prévaut.

Les recommandations locales sont contextuelles, dédupliquées et diversifiées. Les contenus terminés restent accessibles. Masquer un contenu ou un artiste est persistant et annulable ; le classement local ne prétend pas reproduire un algorithme YouTube. Historique désactivé : pas de nouvelle progression enregistrée et pas d’utilisation de l’historique dans la colonne À suivre.

## Livré, démontré, désactivé et dépendances

- **Fonctionnel côté navigateur :** navigation VOD, lecteur existant et autorité média existante, recherche, playlists locales, file, historique local cloisonné, mini-lecteur dans La Scène, recommandations contextuelles, règles de suite, restauration et contrôles.
- **Démonstration locale explicite :** conversations de fixtures (compte Max local), likes/édition/suppression, réponses, timestamps, brouillons et erreur de stockage. Leur texte indique qu’elles sont enregistrées sur cet appareil. Le lien `?comment=…` cible le fil disponible ou explique son absence. Elles ne sont jamais présentées comme une intégration serveur.
- **Commentaires réels désactivés :** aucune API de conversation publiée n’existe dans le dépôt inspecté. Une vidéo canonique affiche leur indisponibilité. Publier des commentaires réels nécessite schéma, API, pagination, permissions, idempotence, modération et tests réseau. Aucune écriture distante fictive ni migration improvisée.
- **Bibliothèque locale :** les listes ne sont ni synchronisées ni publiquement partageables ; aucun contrôle public/privé factice n’est ajouté. La séparation locale par compte ne remplace pas des ACL serveur.
- **Préservé, hors refonte :** TV linéaire, formats verticaux, studio et publication existants, Rooms, Market, Tremplin, achats et jetons. Le merge Market a été réalisé avant cette tâche.
- **Non livré / non attesté :** continuité d’un mini-lecteur hors de La Scène, qualités HLS/DASH supplémentaires, sous-titres/transcription sans source, casting, téléchargement, notifications système, parité YouTube, certification WCAG ou validation juridique. Ces capacités ne sont pas inventées.
- **Analytics :** pont existant conservé, pas de collecte ajoutée des brouillons. Les jalons historiques du lecteur représentent la progression atteinte, pas une mesure validée du temps réellement regardé. Une instrumentation de durée/consentement complète reste à traiter avant exploitation analytique.

## Validation effectuée

Chrome desktop contrôlé via navigateur, fenêtres 1440×1000 et 390×844. Le second est une émulation de largeur, pas un test Safari iOS ou Chrome Android matériel. Captures et lectures DOM réalisées dans la tâche. Source du serveur vérifiée : worktree scene-watch-experience, Vite port 5188 ; stable 5182 inchangé.

Tests : 57 tests ciblés dans sept fichiers (lecteur, commentaires, historique, playlists, découverte, conservation du média et politique V3). Les 29 tests de ShortsPage ont été exécutés : 24 sont passés dans la passe complète ; les cinq anciennes attentes ont été corrigées et repassées avec succès, puis les trois parcours affectés par les dernières corrections ont repassé. Il ne s’agit pas d’un dernier lancement intégral des 29 après chaque changement. Les tests jsdom signalent l’absence de canvas, sans prétendre tester le rendu vidéo réel.

Build `npx vite build --mode tremplin` réussi. TypeScript global conserve des erreurs préexistantes dans Rooms et des tests Market ; aucun diagnostic dans les fichiers Scene/Shorts modifiés lors du dernier contrôle. Les logs de vérification sont locaux au worktree (`scene-tests.log`, `scene-page-v3.log`, `scene-page-recheck.log`, `scene-final-navigation.log`, `scene-build.log`, `scene-types-v3.log`).

### Matrice V3 des 30 scénarios

| ID | Statut et preuve / limite |
|---|---|
| T01 | Vérifié Chrome desktop : scroll document jusqu’aux commentaires, pas de boîte interne. |
| T02 | Partiel : menus clavier et lecteur vérifiés ; toutes les modales de l’infrastructure non retestées. |
| T03 | Vérifié à 390 px : liens persistants entre les deux sections, commentaires non auto-infinis sur une colonne. |
| T04 | Vérifié Chrome : Explorer 24 → 48, ouverture en bas, retour avec 72 éléments après chargement automatique, ancrage conservé. |
| T05 | Partiel : recherche Alya → vidéo → Retour restaurée ; filtres et URL en tests ; combinaison Retour/Avancer filtrée complète non exécutée. |
| T06 | Partiel : timestamps unitaires et reprise explicite ; cible commentaire implémentée, parcours navigateur non exécuté. |
| T07 | Vérifié : vidéo de 12 s terminée, brouillon intact, aucun compte à rebours ni remplacement. |
| T08 | Non exécuté serveur : API absente ; conservation locale et erreur de stockage uniquement. |
| T09 | Partiel : sélection par ID et annulation logique des réponses catalogue ; réseau ralenti A/B non exécuté. |
| T10 | Vérifié : même nœud vidéo et progression en test ; mini-lecteur, recherche et Retour dans Chrome. |
| T11 | Politique unitaire vérifiée ; file et Suivant vérifiés dans Chrome ; combinaison entière playlist/répétition non exécutée sur appareil. |
| T12 | Partiel : plein écran tests existants, redimensionnement navigateur ; rotation matérielle et qualité adaptative non exécutées. |
| T13 | Raccourcis limités au lecteur et hors saisie ; tests lecteur. |
| T14 | Partiel : recherche, focus et Esc menus vérifiés ; audit clavier exhaustif non exécuté. |
| T15 | Non exécuté : clavier virtuel matériel indisponible. |
| T16 | Partiel : reflow à 390 px vérifié, zoom OS/lecteur d’écran non exécuté. |
| T17 | Non exécuté : expiration réelle de session et reprise d’action distante. |
| T18 | Test unitaire deux espaces de compte réussi ; changement de comptes réels non exécuté. |
| T19 | Placeholders et résolution qui ignore les absents testés ; retrait réel serveur non exécuté. |
| T20 | Non exécuté serveur ; indisponibilité honnête en production, conversation locale explicitement simulée. |
| T21 | Partiel : catalogue conserve ses données en erreur et propose Réessayer ; API de pages commentaires absente. |
| T22 | Vérifié dans Chrome : commande Lire présente après refus de démarrage ; pas de faux état en lecture. |
| T23 | Session média existante réutilisée ; casque matériel non exécuté. |
| T24 | Règle chanson/session/fin/horodatage testée. |
| T25 | Liens HTML natifs contrôlés dans le DOM ; confidentialité distante non attestée. |
| T26 | Pas de progression nouvelle si historique désactivé, À suivre contextuel ; test humain non exécuté. |
| T27 | Navigation profil existante testée ; parcours boutique/jeton complet non exécuté, aucune mutation financière ajoutée. |
| T28 | Hors refonte : publication existante, réseau instable non exécuté. |
| T29 | Hors refonte : traitement opérationnel des signalements non attesté. |
| T30 | Chrome desktop seulement ; Safari iOS / Chrome Android réels non exécutés. |

Aucun panel utilisateur extérieur n’a été réalisé. Cette livraison constitue une refonte frontend vérifiée des parcours principaux, pas la validation complète d’une plateforme de contributions publiques.

## Retour arrière et intégration

Aucune migration ni nouvelle dépendance. Travail isolé sur branche, sans modification du stable ; revenir à main rétablit l’expérience précédente. Ne pas effacer le stockage existant. Ne pas fusionner La Scène tant que cette tâche n’a pas reçu son accord d’intégration explicite.
