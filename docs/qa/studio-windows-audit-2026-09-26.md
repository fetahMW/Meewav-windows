# Audit du Studio Meewav Windows — 26 septembre 2026

## Périmètre

Studio utilisé pendant la création d’une Room et régie de diffusion : acquisition,
composition, transitions, voix, entrée musicale, arrêt et reprise. Le sélecteur
des six Rooms et le parcours de création de la Cage font également partie de la livraison.

## Défauts reproduits ou établis dans le code, puis corrigés

| Problème | Correction | Vérification |
| --- | --- | --- |
| Ouverture de caméra terminant après annulation ou fermeture | Invalidation de la génération et libération de la capture tardive | Tests de capture différée et de démontage |
| Double demande et changement d’entrée pendant une acquisition | Verrou immédiat et sélection désactivée pendant l’ouverture | Tests de démarrage et de sélection |
| Source déconnectée encore admissible dans la sortie | Contrôle du signal, retrait des sources terminées, invalidation du plan prêt | Tests de perte de signal et de débranchement |
| Erreur Web Audio laissant le micro ouvert | Nettoyage dès la création du contexte et sur chaque erreur | Échec du constructeur AudioContext simulé |
| Emplacements vides accumulés après des sélections successives | Réutilisation des zones libres, limite à neuf | 1 000 cycles de sélection |
| Fondu interrompu repartant d’un autre plan | Départ du fondu depuis une image de la sortie courante | 500 transitions, sortie persistante |
| Musique silencieuse après reconnexion | Réactivation explicite de sa piste au redémarrage | 30 cycles arrêt/reprise |
| Traitements de parole appliqués aux instruments | Capture stéréo souhaitée sans AGC, réduction de bruit ni annulation d’écho | Vérification des contraintes musicales |
| Arrêt du direct supprimant la composition | Conservation des caméras et du plan ; libération séparée des sources | Test arrêt sans destruction de caméra |
| Micro choisi sauvegardé après lancement | Sauvegarde avant l’ouverture du transport, libération de l’essai privé | Vérification dans le callback de lancement |

## UX

- Aperçu privé et Sortie explicitement distingués.
- Deux transitions compréhensibles : « Appliquer le plan » et « Fondu · 0,5 s ».
- Messages utiles pour permissions refusées, périphérique occupé et déconnexion.
- État vide de sortie avec prochaine action, activité d’acquisition visible.
- Niveaux micro et musique nommés pour les lecteurs d’écran.
- Sur une fenêtre étroite, les moniteurs précèdent le panneau des sources.
- Cartes de lancement sans PNG : surfaces satinées, icônes vectorielles,
  couleurs par Room, grille de trois, deux ou une colonne selon la largeur.

## Cage : provenance et adaptation iOS

Référence en lecture seule : Meewav-iOS, commit aea7251.

- `Meewav/Features/Rooms/Views/CreateRoomView.swift`
- `Meewav/Features/Rooms/Components/Create/CreateRoomReviewStep.swift`
- `Meewav/Features/Rooms/Services/SupabaseRoomsRepository.swift`

Parcours Windows : identité et visibilité → Studio → vérification → ouverture
sans combattants préchargés. Les invitations se font ensuite dans les Coulisses.
Le parcours de compétition préparée depuis le profil reste disponible.
La création publique emploie le contrat rooms_v2 puis l’inscription du host,
avec identifiant conservé pour reprendre une requête interrompue.
La préparation privée ne publie pas de Room.

Les valeurs réseau et microphone simulées par le prototype iOS ne sont pas
reprises. La vérification utilise le résultat des acquisitions du Studio ;
« réseau disponible » indique uniquement l’état réseau du navigateur, pas une
mesure de débit ni une connexion RTC confirmée.

## Résultats

- 72 tests réussis dans 12 fichiers ciblés, dont les parcours du lobby et de la Cage.
- 500 transitions, 20 réouvertures du moteur et 20 ajouts/retraits de caméra.
- 1 000 sélections, 30 reprises musicales, captures et erreurs asynchrones simulées.
- Compilation de production vérifiée avant commit.
- La vérification TypeScript globale rencontre des erreurs déjà présentes dans
  le dépôt (notamment les types Node des anciens tests et WaveState.maxSubmissionBars).
  Ce dernier diagnostic figure déjà dans le journal antérieur `.codex-wave-tsc.log`.

## Limites de la vérification

Tests exécutés avec flux, canvas et services simulés. Aucune caméra ni aucun micro
réel n’a été activé, aucune Room publique n’a été créée et aucune prise de contrôle
de l’ordinateur n’a été effectuée pendant cet audit. Il reste à valider sur matériel
réel les pilotes Windows, le débit et la latence, une diffusion prolongée avec
récepteur distant et le rendu Electron aux différentes tailles de fenêtre.
Ces tests ne prouvent pas une stabilité matérielle ou RTC parfaite.

