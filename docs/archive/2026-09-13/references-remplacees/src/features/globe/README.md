# MEEWAV Globe

Le globe web utilise MapLibre GL avec une source vectorielle OpenFreeMap.

## Moteur

- Composant actif : `components/GlobeMapV2.tsx`
- Route active : `/globe`
- Style : `maplibre/meewavMapLibreStyle.ts`
- Source vectorielle : `https://tiles.openfreemap.org/planet`
- Glyphs : `https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf`

## Intentions produit

- Globe sombre.
- Eau bleu nuit.
- Batiments 3D violets.
- Routes pastel, sans POI ni signaletique routiere commerciale.
- Pays visibles seulement au zoom pays.
- UI React conservee au-dessus du moteur de carte.

## Navigation

- Clic gauche : deplacement natif de la carte via `dragPan`.
- Clic droit ou `Ctrl` + clic gauche : rotation et inclinaison 3D natives via `dragRotate`.
- Molette : zoom natif MapLibre via `scrollZoom`, cible vers le curseur.
- Raccourcis clavier : `N` nord, `U` vue du dessus, `R` reset camera, espace stop.

## Surface canonique

- `GlobeMapV2` est la seule carte exposée par l'application.
- Les anciennes routes de prototype (`/cartoon-globe-test`, `/task-globe`, `/globe-v2`, etc.) redirigent vers `/globe`.
- Les anciens composants d'expérience cartographique ont été supprimés de cette branche.

## Guide Alpha

Pour reproduire la mécanique complète de Paris dans une nouvelle ville intra-muros, lire d'abord [`guide-alpha/README.md`](./guide-alpha/README.md), puis ses contrats de données et sa checklist.

La consigne « applique le Guide Alpha à Toulouse » signifie que cette procédure doit être suivie avant toute modification. Les communes périphériques restent une phase séparée.
