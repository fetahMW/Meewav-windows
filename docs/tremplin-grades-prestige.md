# Grades du Tremplin — référence et comparaison

Référence fournie par l’utilisateur : `ChatGPT Image 8 sept. 2026, 14_50_39.png`.

Copie locale : `public/images/tremplin/tremplin-grade-art-reference-v1.png`.
Seules les zones décoratives de la plaque et des bordures sont affichées par cadrage CSS. Les titres, descriptions, boutons, badges, sélection et note de progression restent des éléments React.

Les six niveaux utilisent le composant canonique MeewavGradeBadge, sans variante : le niveau 6 porte son unique étoile légendaire et ses rayons d’origine. Les cartes sont des articles focusables, sans action de clic. Le survol met à jour le grade et la note ; le focus conserve l’accès au clavier.

Comparaisons effectuées avec captures dans un onglet Chrome dédié sur le port 5186 : proportions, taille du badge actif, centrage, cadrage de la plaque, typographie et reflets. À 1380 px de largeur de section, les six cartes mesurent 279 px de haut et les badges 134 px. À 390 px de largeur de viewport, les six cartes mesurent 270 px de haut sans débordement horizontal. La sélection du niveau 2 puis du niveau 4 met à jour la note et conserve ces dimensions.

La fidélité n’est pas une identité pixel par pixel : le dessin vectoriel des badges et le rendu typographique diffèrent encore de l’illustration.

Correction du 8 septembre : capture et passage du niveau 4 au niveau 6 au survol dans Chrome, sans clic.
