# Matière de la messagerie — 29 septembre 2026

La feuille `messaging-console-material.css` est identique sur Android, Windows
et Web viewer parity. Android la charge après les feuilles mobiles et le fond
d’essai; Windows/Web l’importent en dernier dans `MessagingPage.tsx`.

## Règles

- Track Pack : châssis graphite avec bord biseauté, affichage audio en retrait,
  touches d’instruments en verre poli. La console ouverte conserve les pistes,
  Solo, Mute, téléchargement, lecture synchronisée et navigation existants.
- Play : les mêmes `--mw-primary-face` et `--mw-primary-shadow` que le bouton
  Envoyer, y compris dans la console ouverte en portail hors du root React.
- Bulles : reflets légers sur une couche de fond entièrement opaque, pour les
  messages reçus comme envoyés. Aucune dépendance au flou du papier peint.
- Réception : graphite gris-noir du Track Pack; envoi : verre violet conservé.
- Champ de saisie : matière approuvée sur Android, reprise sur Web/Windows
  sans changer sa géométrie ni le bouton Envoyer.
- Réactions : pilules graphite opaques de 36 px minimum, emoji de 26 px et
  compteur clair; bord visible et focus clavier explicite.
- Audio envoyé : largeur plafonnée à 380 px, lecteur de 52 px de haut hors
  éventuel message d’erreur, titre tronqué, durée et menu conservés.
- Contacts : seul le grand rail reçoit un dégradé gris-noir opaque. Les règles
  de sélection des contacts restent celles du verre violet partagé.

La couche CSS dédiée ne modifie ni le papier peint choisi par l’utilisateur,
ni les événements de lecture, d’envoi ou de sélection. Les contrôles mobiles
restent rangés sur des lignes séparées; l’en-tête du Track Pack utilise une grille
fluide pour éviter le chevauchement des commandes et du transport.

## Sources

- Android : `app/src/main/messaging-source/messaging-console-material.css`.
- Windows/Web : `src/features/messaging/messaging-console-material.css`.
- Distribution Android : `scripts/build-messaging.mjs` copie la feuille dans
  les assets et l’enregistre dans le manifeste régénéré.

Le rendu est à valider par l’utilisateur. Les builds ne constituent pas une
validation visuelle ni un nouveau test du transport audio.

## Complément Android

`mobile-chat-polish.css` neutralise les plaques de fond et les en-têtes; le
WebView et les barres système de la messagerie utilisent aussi un gris neutre.
L’image seule reçoit `grayscale(1) brightness(.78)` dans la feuille d’essai
du wallpaper. Les CTA et la sélection violette ne reçoivent aucun filtre.

`useChatHeaderScroll.ts` masque l’en-tête après 24 px de défilement volontaire
vers le bas et le révèle après 12 px en sens inverse. Le haut de l’historique,
le focus d’écriture et les redimensionnements le révèlent. Le bandeau flotte
au-dessus d’une timeline de taille constante pour ne pas provoquer de saut.
La même logique couvre DM/collab, chat projet et chat groupe; les attributs
sont retirés en quittant le chat. L’animation respecte reduced-motion et les
commandes masquées sont inertes. Les tests ciblés sont dans
`scripts/tests/messaging/chat-header-scroll.test.tsx`.
