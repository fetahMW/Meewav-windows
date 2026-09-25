# Outil léger de curation

Date : 2026-07-13

## Objectif

La curation des noms produit et regroupements ne modifie plus le frontend. La CLI travaille uniquement sur un dataset canonique et un override JSON versionné.

Fonctions disponibles :

- filtrer une commune ;
- exporter ses zones dans un template ;
- renommer une zone ;
- ajouter ou remplacer ses alias ;
- déplacer son `labelPoint` ;
- définir une caméra ;
- modifier son statut de validation ;
- fusionner plusieurs zones d'une même commune ;
- produire un nouveau dataset canonique ;
- valider automatiquement la géométrie et les relations.

## Exporter un template communal

```bash
npm run geo:curate -- \
  --input geo/output/trappes.canonical.json \
  --commune 78621 \
  --template geo/output/curation/trappes.template.json
```

Résultat vérifié : 12 décisions `update`, une par zone de Trappes. L'opérateur supprime les décisions inchangées puis édite les autres.

## Appliquer un override

```bash
npm run geo:curate -- \
  --input geo/output/trappes.canonical.json \
  --override geo/overrides/trappes.json \
  --out geo/output/trappes.curated.json \
  --version 2026.1-trappes-curated
```

Exemple de renommage :

```json
{
  "operation": "update",
  "zoneId": "f4989928-836e-5763-b942-296f927e4fe7",
  "displayName": "Centre Ouest",
  "aliases": ["Centre-Ouest"],
  "labelPoint": [1.999, 48.775],
  "cameraOverride": { "pitch": 58, "bearing": -12 },
  "status": "validated"
}
```

Exemple de fusion :

```json
{
  "operation": "merge",
  "decisionId": "trappes-centre-reuni-v1",
  "zoneIds": [
    "f4989928-836e-5763-b942-296f927e4fe7",
    "5cd292cc-04d6-5887-a2cc-73c33b3d2402"
  ],
  "displayName": "Centre réuni",
  "aliases": ["Centre Ouest", "Centre Est et Village"],
  "status": "validated"
}
```

Si aucun `zoneId` n'est fourni au merge, l'outil le dérive de manière déterministe à partir de `scope + decisionId`. Les géométries sont unies, les sources administratives sont conservées, la bbox et un point intérieur sont recalculés, et les éventuels enfants sont rattachés à la zone fusionnée.

## Garde-fous

L'application échoue si :

- le scope de l'override ne correspond pas au dataset ;
- une zone ciblée est absente ;
- une fusion traverse deux communes ;
- le nouvel ID n'est pas un UUID ;
- un label sort de sa géométrie ;
- un parent ou une source devient orphelin ;
- la géométrie produite est invalide.

Le test réel Trappes a produit puis validé `2026.1-trappes-curated` avec 12 zones. Un test automatisé supplémentaire fusionne deux zones, renomme une troisième, conserve deux sources administratives et vérifie la stabilité du nouvel ID.

## Aucun diff frontend

Une décision de curation modifie uniquement :

```text
geo/overrides/<scope>.json
```

Puis les artefacts générés. Elle n'ajoute ni condition de ville, ni layer, ni preset de caméra, ni commande propre au territoire.
