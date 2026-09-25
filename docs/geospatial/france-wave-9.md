# Vague 9 — clôture nationale multi‑IRIS

Audit final : **PASS**, sans oubli, doublon ni incohérence détectée.

La vague 9 clôt les **1 140 communes multi‑IRIS restantes** : **4 078 IRIS officiels** donnent **4 069 plaques visibles** après 1 849 renommages déterministes et 8 fusions exactes (réduction totale de 9 cellules). Le catalogue conserve les **1 849 preuves d’inclusion stricte** des renommages et les **8 preuves topologiques connectées** des fusions, à l’identique des audits. Les quatre lots sont disjoints : 280, 724, 131 et 5 communes.

Chaque commune a été contrôlée jusqu’au GeoJSON : existence du fichier, nombre de plaques, identité des IRIS sources, opérations de curation, IDs, libellés et métadonnées. L’union des quatre lots est strictement égale aux 1 140 entrées `standalone_split` de l’inventaire national.

Après intégration :

- 1 544 villes autonomes sont présentes au catalogue et au runtime ;
- le registre d’ownership contient 1 978 communes, dont 1 976 appartiennent à l’index national courant ;
- les 1 565 datasets représentent 13 740 zones ;
- le corpus canonique contient 13 740 zones administratives et 13 740 zones musicales, avec 13 740 mappings, et passe le validateur avec zéro erreur et zéro avertissement.

Le périmètre national se réconcilie exactement : **1 976 communes du registre découpé + 32 762 communes mono‑plaque + 8 villes gérées par leurs datasets directs = 34 746 communes indexées**. Les deux entrées supplémentaires du registre, Hellemmes‑Lille et Lomme, sont des communes associées de Lille absentes de l’index communal national courant.

Le détail reproductible, les contrôles et les empreintes SHA‑256 sont consignés dans [`geo/work/france-wave-9-completeness-audit.json`](../../geo/work/france-wave-9-completeness-audit.json).
