# Profil — noir laqué et verre fumé

Branche `codex/profile-smoked-glass`, issue du main `04f8ef4ec`.
Aperçu de travail : http://127.0.0.1:5194/profile.

La finition est isolée dans `profile-smoked-glass.css`, importée après le style du profil. Les surfaces passent au noir graphite, avec une réflexion argentée douce, des boutons laqués et des textes secondaires plus lisibles. Les couleurs des médias, des grades et des indicateurs métier sont conservées. Aucun handler, appel réseau ou modèle de données n'est modifié.

Parcours visuel demandé par l'utilisateur : captures avant des quatre onglets principaux, puis passes de captures et retouches sur Accueil, Statistique, Médiathèque, La Cage, Setlist, Cadeaux, Badges, Portefeuille, Transactions, Contrats, Matériel, Sécurité et Organisation. Captures finales des quatre onglets principaux à 390 px également. Le portefeuille mobile superposait ses colonnes ; elles sont maintenant empilées, avec un tableau défilant horizontalement.

Captures conservées sous `C:/Users/linkw/AppData/Local/Temp/profile-before-*.png`, `profile-after-*.png` et `profile-final-*.png`. Pendant le parcours final Chromium : aucune exception JavaScript de page remontée, largeur du document égale à 390 px sur les quatre entrées mobiles. Ce contrôle couvre l'affichage et la navigation entre onglets, pas les opérations de paiement, de signature, d'envoi ou de publication.

Pas de fusion ni de push sans demande de l'utilisateur.

Correction demandée : le poteau et sa barre de navigation conservent intégralement leur finition et leurs couleurs d'origine, sur ordinateur et mobile. Les surcharges de couleur et de filtre du chrome ont été retirées. Les captures précédentes montrant un poteau gris sont antérieures à cette correction.
