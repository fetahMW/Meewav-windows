# Script investisseurs — MeeWav TV

Durée cible : 7 à 9 minutes. L’environnement utilise des profils, une programmation et des médias de démonstration. Le simulcast Room est une simulation d’interface utilisant un média local : aucun direct réel, aucune notification push et aucune transaction réelle ne sont exécutés.

## Préparation

1. Ouvrir `/scene/tv` sur un écran 1440p ou 1080p.
2. Vérifier que les médias de `public/media/shorts-demo` sont servis.
3. Pour une démonstration déterministe, utiliser l’horloge `7 août 2026, 20:12, Europe/Paris` dans les tests ou l’outil interne ; l’interface de production suit l’horloge du navigateur.
4. Autoriser le son uniquement après l’ouverture : l’antenne tente d’abord une lecture automatique silencieuse.
5. Présenter les noms et horaires comme des fixtures produit, jamais comme une programmation réelle.

## 1. Allumer la chaîne — 60 secondes

**Action** : cliquer sur l’onglet TV.

**À dire** :

> La Scène laisse l’utilisateur choisir une vidéo. MeeWav TV lui donne rendez-vous. Il n’existe ici qu’une seule chaîne officielle : pas de mosaïque, pas de liste de chaînes et pas de deuxième catalogue vidéo.

**À montrer** :

- le player est déjà présent et constitue la surface dominante ;
- le badge « À l’antenne » ;
- la lecture silencieuse automatique ou, si le navigateur la bloque, le bouton « Regarder MeeWav TV » ;
- un seul élément `<video>` dans toute l’expérience TV.

## 2. La diffusion linéaire — 75 secondes

**Action** : activer le son, puis présenter le programme en cours.

**À dire** :

> L’utilisateur rejoint le programme au moment correspondant à l’horaire. La démo calcule le temps écoulé depuis le début du créneau et place le média au bon offset. Elle ne redémarre pas automatiquement le programme à zéro.

**À montrer** :

- horaire de début et de fin ;
- temps restant ;
- barre de progression du programme, indépendante de la durée du fichier de démonstration ;
- programme suivant toujours visible ;
- lower third discret, grade et bug MeeWav TV.

Précision honnête : les courts MP4 locaux bouclent pour simuler un playout. Une diffusion réelle nécessitera un stream linéaire ou des masters complets servis par le backend média.

## 3. Les contrôles — 45 secondes

**Action** : montrer mute, volume, pause, image dans l’image, mode cinéma et plein écran.

**À dire** :

> La télévision reste contrôlable et accessible. Le son n’est jamais imposé, les cibles sont utilisables au clavier et le mode cinéma agrandit l’antenne sans transformer la page en catalogue.

Les sous-titres sont signalés comme indisponibles sur les fixtures actuelles ; ils devront être fournis programme par programme en production.

## 4. Maintenant, Ce soir, Demain — 75 secondes

**Action** : parcourir les onglets du guide.

**À dire** :

> L’EPG contient quatorze jours et plus de 150 créneaux. Une seule journée est rendue à la fois. Le guide alterne La Relève, MeeWav Sessions, Focus style, Carte blanche, Connexions, Une ville une scène, MeeWav Info, premières, replays sélectionnés et documentaires.

**À montrer** :

- le programme courant ;
- le prochain rendez-vous ;
- la grille du soir ;
- les quatorze dates du programme complet ;
- l’absence de sélecteur de chaîne.

## 5. Rappels — 45 secondes

**Action** : ouvrir « Demain », puis activer « Me rappeler ».

**À dire** :

> Le prototype enregistre le rappel localement uniquement après une action explicite. Il ne demande pas la permission navigateur au chargement. En production, le compte, le service de notifications et les préférences utilisateur prendront le relais.

## 6. Continuité et sécurité — 45 secondes

**À dire** :

> L’antenne ne doit jamais devenir un écran noir. En l’absence de créneau éditorial, une playlist de continuité prend le relais. Si une source échoue, le player bascule vers un autre média local ; une erreur persistante conserve une surface claire avec une action de nouvelle tentative.

**À montrer** : le test ou la fixture sans programmes, qui affiche « La Scène en continu ».

## 7. Frontières avec Rooms et La Scène — 60 secondes

**À dire** :

> Rooms possède le direct. La Scène possède la vidéo publiée. MeeWav TV possède la programmation. Un replay de Room n’arrive ici qu’après publication. Un programme passé peut renvoyer vers sa vidéo dans La Scène, mais TV ne présente jamais une grille VOD ni un catalogue des Rooms.

**À montrer** :

- un programme « Replay sélectionné » ;
- le créneau « MeeWav Sessions en direct », son label « EN DIRECT » et son lien explicite vers Rooms ;
- l’action explicite « Revoir dans La Scène » ;
- l’absence de « Top Rooms », « Rooms populaires » et du rayon « À voir sur MeeWav TV ».

## 8. Indépendance éditoriale — 45 secondes

Présenter `docs/tv-editorial-policy.md` : qualité artistique, droits, diversité, rotation, conflits d’intérêts et identification du sponsoring. Prix, achats, volumes et variations de jetons sont exclus de la programmation.

## 9. Ce qui est déjà fonctionnel

- route canonique `/scene/tv` ;
- chaîne publique unique `meewav-main` ;
- player inline, autoplay silencieux et reprise à l’offset horaire ;
- programme courant, suivant et progression temporelle ;
- 14 jours, 154 programmes, 11 formats éditoriaux ;
- 150 sources de catalogue et 60 artistes fictifs ;
- une source de simulcast Room identifiée, sans duplication du catalogue Rooms ;
- rappels locaux ;
- fallback de continuité et repli média ;
- retour explicite vers une publication La Scène ;
- responsive, clavier, reduced motion et tests automatisés.

## 10. Dépendances de production

- EPG et horloge serveur comme sources de vérité ;
- régie éditoriale et journal d’audit ;
- stream HLS/DASH, CDN, adaptive bitrate et géorestrictions ;
- masters complets, captions, transcription et pistes alternatives ;
- validation des droits de tous les médias ;
- service worker, push et synchronisation des rappels ;
- intégration du flux Rooms pour un simulcast réellement live ;
- analytics et supervision du fallback.

## Conclusion

> MeeWav TV ne cherche pas à offrir davantage de choix. Elle transforme le catalogue autorisé de La Scène en rendez-vous commun, éditorial et continu. Une chaîne, une antenne, un programme.
