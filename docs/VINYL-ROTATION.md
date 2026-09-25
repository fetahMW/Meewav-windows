# Rotation du vinyle et répartition des portraits

Le vinyle et ses 96 portraits partagent une rotation horaire de 72 secondes par tour : une vitesse réduite de 50 % à la demande de l'utilisateur par rapport au cycle initial de 36 secondes. Le globe géographique conserve sa transformation.

Les portraits sont répartis à raison de 24 par bande, sur quatre bandes situées à 12 %, 34 %, 57 % et 82 % de la largeur utile du disque. Des décalages angulaires et radiaux déterministes évitent les alignements et les amas. Le nombre total, les photos, les tailles et le composant de pré-profil sont conservés. L'exploration démarre sur la bande intérieure et permet toujours de parcourir toute la surface.

Le disque et le maillage instancié des portraits appartiennent au même groupe tournant. Leurs positions relatives sont calculées une fois ; la rotation ne recharge ni l'atlas ni les matrices des instances. Les positions utilisées pour sélectionner les portraits suivent la transformation du groupe. La rotation est arrêtée pendant toute l'exploration des artistes, y compris les vols d'entrée et de retour, pour faciliter la sélection et la lecture des pré-profils. Elle reprend au même angle lorsque la vue globe est rétablie, à 72 secondes par tour.

Les sources lumineuses restent fixes : elles sont exprimées dans le repère local tournant du matériau. Les poussières et les détails du PVC tournent avec le disque ; les reflets et l'éclairage ambiant gardent leurs positions dans le studio.

La boucle de rendu existante anime le groupe sans invalider les données géographiques ni la disposition des labels. Le mouvement est suspendu lorsque l'anneau sort du champ, dans les vues locales, lorsque la page est masquée, avec la préférence de réduction des animations ou avec `orbitMotion=off`. Une reprise ne rattrape pas le temps passé hors écran.

Aucun test, capture ou contrôle visuel automatique n'a été lancé pour cette modification, conformément à la consigne utilisateur.
