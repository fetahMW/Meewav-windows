# Conversion des territoires existants

Date : 2026-07-13

## Résultat global

Le convertisseur générique traite 20 fichiers GeoJSON legacy regroupés en sept scopes. Le même code a produit et validé 3 440 zones administratives et 3 440 `MusicZone`.

| Scope | Zones converties | Validation |
| --- | ---: | --- |
| Paris, Grand Paris et Saint-Denis legacy | 1 115 | Valide |
| Nice et métropole | 288 | Valide |
| Lyon et métropole | 569 | Valide |
| Nantes et métropole | 255 | Valide |
| Marseille et métropole | 588 | Valide |
| Lille et métropole | 613 | Valide |
| Trappes | 12 | Valide |
| **Total** | **3 440** | **0 erreur bloquante** |

## Transformations autorisées

- normalisation des positions GeoJSON encodées sous forme de chaînes ;
- calcul de `bbox`, `center` et `labelPoint` lorsque ces propriétés manquent ;
- retrait d'un composant MultiPolygon nantais dégénéré dont l'aire est exactement nulle ;
- génération d'un UUID stable opaque pour chaque ancien ID ;
- résolution du parent lorsque sa feature existe réellement dans le corpus ;
- conservation du parent legacy dans la table de mapping lorsqu'il s'agit seulement d'un groupe de présentation sans géométrie.

Les polygones non dégénérés ne sont ni redessinés ni simplifiés dans cette étape.

## Points encore bloquants avant publication

- provenance, licence et millésime du GeoJSON historique de Paris à confirmer ;
- millésime exact des communes et zones produit Grand Paris à consolider ;
- double représentation Saint-Denis à arbitrer ;
- 12 communes demandées par les définitions Grand Paris mais absentes du fichier généré ;
- groupes de présentation ville/arrondissement non matérialisés comme `MusicZone` ;
- comparaison visuelle et caméra encore à réaliser dans les PR 5 à 7.

Ces points n'empêchent pas l'usage interne du dataset draft en mode `comparison`. Ils empêchent sa publication nationale définitive.

## Reproduction

```bash
npm run geo:migrate-existing -- --city paris
npm run geo:migrate-existing -- --city trappes
npm run geo:migrate-existing -- --city marseille
npm run geo:migrate-existing -- --scope all
npm run geo:validate -- geo/output/all.canonical.json
```

Les datasets canoniques volumineux sont générés dans `geo/output/` et ne sont pas commités. Les mappings d'identifiants et les rapports sont versionnés.
