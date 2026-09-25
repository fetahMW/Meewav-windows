# Dégagement des avatars autour de la tour Eiffel

Le placement des profils réserve un cercle invisible de 180 mètres de rayon
centré sur les coordonnées partagées avec le modèle Eiffel. Cette marge couvre
les pieds de la tour et laisse de l'espace autour des portraits.

Les candidats à l'intérieur du cercle sont refusés avant la vérification
d'espacement, y compris dans la génération de secours et dans les polygones
voisins qui touchent la zone. Les remplaçants sont répartis dans leur quartier,
sans rabattement sur la circonférence. Les positions sont calculées une fois
dans le worker, sans contrôle supplémentaire à chaque image.

La population de Gros-Caillou est réduite de 30 % après l'application du facteur
de densité existant. Les quotas, compteurs et profils générés utilisent la même
règle. Les coordonnées de la tour restent centralisées dans eiffel-location.mjs.

Le mécanisme est également appliqué à Montparnasse (rayon de 110 mètres) et au
Negresco de Nice (75 mètres). Ces deux dégagements redistribuent les positions
sans modifier le quota des quartiers concernés.

## Occlusion de la structure

Les sprites utilisent désormais la profondeur projetée de leur position dans
le tampon de profondeur déjà rempli par la scène. La tour masque les pixels
des avatars situés derrière ses surfaces ; les parties ajourées restent ouvertes.
Les sprites ne réécrivent pas la profondeur et conservent leur rendu groupé,
leurs couleurs et leur transparence. Aucune passe de rendu n'est ajoutée.

Le survol et le clic consultent aussi la profondeur des monuments au pointeur
pour ne pas sélectionner un avatar caché derrière la tour. Cette intersection
est calculée seulement lorsqu'une zone de clic d'avatar est atteinte, avec un
rejet préalable par la sphère du monument ; pas de raycast par avatar à chaque
image. L'aperçu agrandi du profil sélectionné reste une interface au premier plan.

Aucun test, inspection visuelle ni contrôle automatique lancé ; revue réservée
à l'utilisateur.
