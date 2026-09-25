# Corrections d’affichage Loge et Cage

Base : main, de75b5ac6. Travail : codex/loge-question-layout-fix.

La capture Loge montrait le haut de la première carte seulement. Le skin historique imposait encore trois lignes (58 px, 36 px, espace restant), alors que le panneau actuel contient une barre puis son flux. La classe is-feed-layout isole la disposition actuelle : barre à hauteur naturelle, flux flexible et défilant, prise en compte du lecteur replié ou déplié et des éventuels messages/formulaires.

Les résultats Cage restent des boutons désactivés lorsque le vote n’est pas disponible. Leur règle d’opacité 1 avait la même priorité que la règle générique chargée ensuite. La règle est désormais explicitement limitée au panneau de vote Cage et prioritaire ; les permissions et les handlers sont conservés.

Aucun test, build ou contrôle visuel lancé conformément à la consigne utilisateur. Intégration dans main et publication GitHub autorisées par l’utilisateur le 8 septembre 2026. Après intégration, la référence est le dossier stable sur le port 5182 ; l’aperçu temporaire 5184 est arrêté.

Le même travail intègre la nouvelle demande de palette Invités : bleu électrique #4B6FFF, distinct du Chat #86BDFF, barre bleue du sous-menu, bordures fines et légers reflets bleus sur les cartes des contacts. Cette palette remplace la proposition graphite refusée par l’utilisateur.

Révision texture : les cartes utilisent un grain diagonal fin, un reflet large de verre satiné, un fond bleu nuit et un contour biseauté fin. Les cartes sélectionnées et survolées conservent la texture. Le survol jaune de l’onglet Invités venait encore des variables de place-social-tabs-chrome.css ; celles-ci passent au bleu électrique, y compris lorsque Chat ou un autre onglet est ouvert. Aucun test ni contrôle visuel relancé.

La règle générale de place-studio-black-lacquer.css écrasait aussi le fond et les reflets des cartes Invités avec studio-black-fill. Cette surcharge est retirée pour que la texture définie dans le module soit effectivement utilisée.

Survol des boutons File d’attente, Jury et Sur scène : fond conservé, contour bleu électrique animé sur 160 ms avec un trait intérieur supplémentaire de 1 px, sans déplacement ni agrandissement du bouton. Le sélecteur prime sur les anciens survols gris des actions up/down. Les boutons désactivés ne sont pas animés et la préférence de mouvement réduit est respectée.

Palette Loge Cadeau / lecteur replié : la règle bleue de classe-chat-finish était appliquée à tout composant place-chat-workspace, y compris au formulaire réutilisé dans les outils Loge. Elle est limitée à la surface Chat. Le formulaire retrouve ainsi son accent violet natif pour le pictogramme, le titre secondaire, les étapes et les contrôles. Le résumé du lecteur Loge reprend le violet du lecteur déplié au lieu du bleu hérité de la Classe.

Dernière révision Invités : seule la file d’attente est compactée (base 72 px, portrait 44 px, espaces et textes resserrés ; hauteur extensible si nécessaire). Coulisses et Scène conservent leurs hauteurs. Portraits, identités et commande de profil utilisent la pré-fiche coulissante existante dans toutes les rooms, auparavant réservée à la Cage. Le survol des actions garde un trait de 1 px avec un reflet intérieur de 0,25 px au lieu de doubler le contour.

Barre Invités : suppression du style historique propre à Attente (boutons agrandis et orange), ainsi que des dimensions spécifiques Cage et du fond orange Ajouter. Filtrer, Tout sélectionner et Ajouter reprennent le gabarit partagé avec Coulisses (28 px, même typographie et icônes 14 px), avec texte, icônes et contour blancs. Le Jury et les cartes gardent leur accent bleu. Aucun test, build ou contrôle visuel lancé.

Actions des cartes : File d’attente, Jury / Retirer du jury et Sur scène partagent désormais les variables des boutons caméra/message : hauteur 29 px, rayon 8 px, noir bombé, reflet supérieur, biseau et ombres identiques. La surcharge de fond noir générique est retirée ; le survol bleu fin conserve les reflets du bouton. Aucun test, build ou contrôle visuel lancé.

Alignement Attente / Coulisses : retrait des 10 px de marge intérieure supérieure hérités de la barre Attente et alignement horizontal sur les mêmes 6 px que Coulisses. Les contrôles commencent au même niveau sous les onglets.

Survol File d’attente : contour relié à la même variable de couleur que les boutons caméra/message, sans reflet bleu additionnel. Matière et hauteur conservées. Aucun test ni contrôle visuel lancé.
