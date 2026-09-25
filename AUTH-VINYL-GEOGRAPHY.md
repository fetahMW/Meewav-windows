# Choix du quartier à l’inscription — globe vinyle

Le sélecteur Auth utilisait les registres de subdivisions, identifiants IRIS et services de résolution de l’ancien globe MapLibre. Cela pouvait exclure des communes, proposer un autre découpage et sélectionner un quartier par sa seule boîte englobante. Le composant MonGlobe ne transmettait pas non plus la destination du profil au globe intégré.

Le sélecteur utilise maintenant les fichiers réellement déployés sous `globe-vinyle/data/` :

- `cities.json` : toutes les **34 969** communes du globe, sans filtre issu de l’ancien registre.
- `quarters/index.json` et ses fichiers : **1 800** villes subdivisées, **13 658** quartiers hors Paris.
- `sectors.geojson` : les **80 quartiers administratifs parisiens**, soit **13 738 quartiers** au total.
- `communes/index.json` et les contours départementaux : les communes sans subdivision gardent leur plaque réelle et son identifiant `fr-commune-*`.

Les codes postaux et alias du répertoire national existant enrichissent uniquement la recherche ; ils ne définissent plus les villes autorisées, les noms canoniques, les coordonnées ou les limites. La recherche garde les accents normalisés, les noms, codes INSEE, codes postaux et départements.

La géolocalisation recherche d’abord une commune contenant réellement le point, puis le quartier contenant ce point, trous et multipolygones compris. Un point hors couverture ou dans une lacune renvoie au choix manuel ; aucun quartier voisin n’est attribué arbitrairement. Les centres d’arrivée restent à l’intérieur des polygones.

Avant la persistance du profil et la finalisation OAuth, le choix est résolu dans le catalogue actuel. Les anciens choix peuvent être retrouvés par identifiant, code source historique, point intérieur ou nom non ambigu. Si aucune correspondance fiable n’existe, une nouvelle sélection est nécessaire. Les identifiants, noms et centres canoniques sont ensuite enregistrés par les mécanismes existants ; aucune écriture de compte réel n’a été exécutée pendant les vérifications.

L’arrivée sur le quartier après authentification est transmise au globe après son premier rendu, via le pont de même origine. Les messages d’autres origines et les identifiants incompatibles avec la commune sont refusés. Le navigateur ne transmet que le centre du quartier et ses identifiants, pas une adresse ou des coordonnées GPS personnelles.

## Vérifications demandées et exécutées

- 14 tests géographiques sur les données livrées : couverture de toutes les communes, cohérence de tous les fichiers de subdivisions, centres intérieurs sur dix villes/communes représentatives, Paris, outre-mer, Corse, petite commune, alias, migration et cas de géométrie.
- 7 tests de persistance du profil : contrats existants, conversion de quartier et absence d’écriture si la scène est introuvable. Appels Supabase simulés.
- 2 tests du pont React/iframe : livraison après disponibilité, absence de répétition et filtrage origine/commune.
- Comparaison SHA-256 des trois index géographiques servis par l’aperçu 5194 avec les fichiers du worktree : identiques.

Les 23 tests ciblés passent. Aucun compte créé, aucun parcours OAuth réel exécuté, aucune fusion dans main. L’aperçu de la tâche reste sur le port 5194.
