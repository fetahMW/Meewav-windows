# MeeWav — contexte de direction artistique

Ce document est la référence à joindre à une mission de design ou d’interface MeeWav. Il formalise les choix validés dans le produit. Il complète les consignes techniques du dépôt.

## Bloc de contexte à réutiliser

> Tu travailles sur **MeeWav**, une plateforme musicale destinée aux artistes, aux créateurs et à leur public. Conçois une interface premium inspirée d’une console audio : graphite, verre noir, métal discret et lumière violette maîtrisée. La référence concrète est le **mixeur des Rooms**, notamment ses touches Chat / Mixeur, son lecteur et ses faders. Pour les vues spectateur, prends la **Wave viewer** comme référence de dosage des accents. Préserve les composants réussis et améliore les autres avec la même qualité.
>
> Le violet de marque est **#8B5CF6**, celui du poteau. Le violet des petits contrôles du mixeur et de la Wave viewer est **#B68AFA**. Ils ont des rôles différents : violet de marque pour les actions principales, violet clair pour les icônes, valeurs et états sélectionnés. Les titres principaux restent majoritairement blancs. Ne colore pas tous les textes en violet. Aucun rose généralisé, cyan décoratif ou grand fond prune.
>
> Les surfaces utiles sont sombres et lisibles, avec un dégradé graphite, un reflet supérieur léger et une profondeur mesurée. Les boutons évoquent les touches légèrement bombées de la console ; ils ne ressemblent ni à des coussins ni à de gros blocs noirs. Les grandes enveloppes de modules laissent apparaître le décor. La transparence ne doit jamais rendre un texte ou une commande difficile à lire.
>
> Construis une hiérarchie compacte : une action principale claire, des actions secondaires discrètes et des informations immédiatement compréhensibles. Préserve les dimensions des boutons entre leurs états. Au clic, une petite pression puis un état actif immédiat ; aucun délai décoratif. Utilise les vrais composants, les vrais états et les vrais fichiers du produit. Respecte le clavier, le focus visible et la réduction des animations. Valide le résultat dans la plateforme concernée, aux largeurs utiles.

## 1. Palette et rôles

| Usage | Référence | Règle |
| --- | --- | --- |
| Violet de marque / poteau | `#8B5CF6` | CTA principal, identité et accents structurants. |
| Lumière du poteau | `#9D78F0` | Reflets fins ; pas un fond uniforme pour tous les modules. |
| Accent des contrôles | `#B68AFA` / `--room-key-accent` | Icône sélectionnée, valeur de fader, petits repères. Dosage de la Wave viewer. |
| Texte de touche | `#E4DEEB` / `--room-key-text` | Libellés clairs et lisibles sur graphite. |
| Titre principal | Blanc légèrement adouci, par exemple `#EFF0F4` | Préserver la hiérarchie ; le violet reste un accent. |
| Texte secondaire | Gris lisible, par exemple `#A0A3AE` | Ne pas baisser l’opacité au point de perdre le texte sur le décor. |
| Surfaces de touches | `#303034` → `#1A191E` → `#121116` | Employer le dégradé partagé, ses couches et ses reflets. |
| Corps du bouton Play | `#1B1D20` → `#020203` | Rond véritable, anneau chrome fin, triangle perle. |
| Fond de page | Décor existant d’authentification, base proche de `#070511` | Réutiliser l’asset et les styles existants lorsque cette continuité est demandée. |

Les couleurs fonctionnelles conservent leur sens : Golden Like et récompenses dorés, erreur distincte, états audio lisibles. Les **six grades gardent leurs SVG et leurs accents argent, or, vert, rose, bleu et violet**. Leur palette n’autorise pas une recoloration pastel du reste de l’application. Le bleu demandé pour une bulle de question est une exception locale, pas une nouvelle couleur principale.

## 2. Matières et profondeur

- **Touches** : graphite en dégradé, reflet supérieur doux, ombre courte, volume faible. Utiliser `--room-key-face`, `--room-key-hover`, `--room-key-shadow` et `--room-key-pressed`.
- **Touche active** : référence exacte du bouton **Mixeur** sélectionné : verre violet bombé, reflet clair en haut, profondeur interne et lumière douce sur le bord inférieur. Reprendre les quatre couches de dégradés et les ombres de `place-desktop-android-parity.css`, avec l’icône `#C27AFF`. Un simple contour violet autour d’une surface noire ne reproduit pas cette finition.
- **Pads** : conserver leurs identités distinctes — Battement rose, DJ Horn ambre, Applause violet, Huées du public indigo, Roulement de tambour cyan et Compte à rebours vert. Ils reprennent la matière vitrée du Mixeur, teintée avec leur propre couleur pendant la lecture. Au repos, le corps reste graphite avec l’icône et un liseré discret de cette couleur. La cohérence de finition ne signifie pas uniformiser ces repères fonctionnels en violet. Les emplacements libres restent neutres.
- **Verre** : noir translucide maîtrisé, flou d’arrière-plan seulement s’il améliore la lecture. Le mot « verre » décrit la matière ; il ne signifie pas recolorer l’interface en vert.
- **Cadres** : fins, intégrés à la matière. Pas de stroke blanc épais ni de rectangle décoratif autour d’un sous-menu.
- **Glow** : lueur douce autour de l’élément, sans halo flou qui masque son contenu ni éclairage qui semble venir uniquement du dessous.
- **Conteneurs** : conserver une surface sombre derrière un contenu qui en a besoin. Retirer les grandes plaques noires ou bleues redondantes qui cachent le fond de la console.
- **Contraste** : une recherche, un label ou un état important doit rester visible sur le décor. Ajouter localement une surface ou du contraste plutôt que noircir toute la page.

## 3. Boutons, faders et interactions

- Réutiliser les composants communs ; corriger toutes les occurrences réellement partagées.
- Un bouton ne change ni de largeur ni de hauteur quand son libellé passe de « Suivre » à « Suivi », ou lorsqu’il devient actif.
- Les touches inactives restent discernables. L’état actif arrive immédiatement après la pression ; le survol reste léger.
- Les faders s’inspirent du mixeur : rail sombre, curseur métallique, valeur claire, libellé lisible, course utile et action de bypass explicite si nécessaire.
- Le bouton Play partagé est **circulaire**, jamais ovale, avec le triangle centré optiquement.
- Les listes déroulantes reprennent les sélecteurs premium existants. Chevron espacé du bord, menu lisible, sélection visible et navigation clavier.
- Une animation doit suivre l’état réel : un vinyle tourne pendant la lecture et s’arrête à la pause. Préserver les exceptions décoratives explicitement validées, comme la séquence des grades.
- Aucun contrôle essentiel uniquement au survol. Les éléments décoratifs n’interceptent pas les clics. Respecter `prefers-reduced-motion`.

## 4. Composition et cohérence

- Une page doit pouvoir se comprendre sans lire tous ses paragraphes. Commencer par l’action et l’information utiles à cet endroit.
- Éviter les répétitions de titres, les grands espaces vides, les cartes d’information plus imposantes que leur contenu principal et les panneaux imbriqués sans fonction.
- Les sous-menus communs restent à la même hauteur. Les lecteurs communs gardent leur position entre onglets.
- Une barre basse garde sa hauteur lors d’une sélection. Une barre flottante laisse le contenu défiler derrière elle, avec un espace final suffisant pour atteindre le dernier élément.
- Les portraits de Classe et d’Invités utilisent les photos et formats carrés approuvés, avec des recadrages propres. Distinguer clairement sélection, parole et cumul des deux états.
- Adapter la composition aux largeurs disponibles ; ne pas cacher un débordement pour donner l’illusion qu’il a été résolu.
- Les surfaces des ressources et cartes viewer reprennent les touches graphite validées, sans ajouter de gros rectangles noirs opaques.

## 5. Rôles et plateformes

- **Windows** propose la création et la conduite des Rooms ainsi que les parcours viewer.
- **Le site Web est en mode viewer** : découverte, participation et interactions autorisées. Il ne doit pas exposer la console host ou permettre d’administrer une Room.
- Les modules partagés gardent leur qualité sur les deux plateformes ; leurs actions dépendent des permissions réelles.
- Ne pas ajouter le lecteur ni la navigation host à la **Classe viewer**. Préserver ses actions utiles.
- Le téléchargement de l’application doit conduire à un **véritable installateur disponible**. Ne jamais présenter une plateforme future comme téléchargeable.

## 6. Sources à consulter avant de coder

Chemins relatifs à la racine du dépôt Windows ; utiliser leurs équivalents partagés dans le dépôt Web.

- `src/features/rooms/place/room-console-material.css` : matière des touches et tokens communs.
- `src/features/rooms/wave-viewer/wave-viewer.css` : dosage des accents dans la référence viewer. Le nom historique `--wave-cyan` contient du violet ; il ne constitue pas une consigne d’utiliser du cyan.
- `src/features/rooms/place/place-mixer-hifi-lacquer.css` et `place-mixer-depth.css` : console, faders, profondeur.
- `src/components/shared/mixer-play-button.css` : finition Play partagée.
- `src/features/rooms/place/place-mixer-pro.css` : panneaux Correction, Effets et Plugins approuvés.
- `src/styles/auth.css` : décor et violet du poteau.
- `docs/viewer-ux-refinements-2026-09-27.md` : provenance des dernières corrections viewer.

## 7. Vérification avant livraison

1. Comparer le résultat au mixeur et à la Wave viewer, avec leur véritable contexte de page.
2. Vérifier repos, survol, focus, pression, actif, désactivé, attente et erreur.
3. Contrôler les petites largeurs, les textes longs, les dépliages et l’absence de saut de dimensions.
4. Tester les actions et leur raccordement réel, les permissions et la lecture/téléchargement des fichiers concernés.
5. Distinguer ce qui a été testé automatiquement, vu dans l’application et vérifié en conditions réelles. Ne pas annoncer comme validée une capture ou une interaction non exécutée.

Une nouvelle instruction explicite de l’utilisateur prime sur ce document. En cas de correction de direction, mettre à jour la référence pour ne pas réintroduire un choix abandonné.
