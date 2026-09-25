# Audit des noms de zones humaines

Date : 2026-07-14

## Problème

Le premier générateur national exposait directement `nom_iris`. Cette donnée est
officielle, mais certaines villes utilisent une même appellation suivie d'un numéro
pour distinguer leurs cellules statistiques. Ces cellules ne constituent pas des
quartiers humains comparables aux 80 quartiers administratifs de Paris.

La correction ne masque pas les numéros. Elle dissout les géométries des IRIS qui
partagent le même nom officiel et le même parent. Chaque zone produite conserve la
liste triée de ses identifiants IRIS sources.

## Corrections

| Ville | Avant | Après | Transformation |
| --- | ---: | ---: | --- |
| Bordeaux | 88 | 13 | 13 familles numérotées dissoutes en 13 zones nommées |
| Strasbourg | 116 | 113 | `Canardière 1` à `Canardière 4` dissoutes en `Canardière` |
| Lille | 84 | 61 | `Lille Centre`, `Vieux Lille` et `Concorde` regroupés |
| Reims | 85 | 84 | deux `Terres Agricoles` réunies en un MultiPolygon |
| Lyon | 185 | 185 | quatre `Mairie` désambiguïsées avec leur parent officiel |

Les autres villes centrales actuellement branchées ne contiennent ni famille de
cellules numérotées ni libellé visible dupliqué.

## Invariants

- aucune fusion ne traverse un parent officiel ;
- aucune géométrie n'est dessinée ou corrigée manuellement ;
- toute fusion est reproductible à partir des données officielles ;
- `sourceIrisIds` conserve la traçabilité de chaque cellule absorbée ;
- `labelLng` et `labelLat` sont recalculés dans la géométrie finale ;
- les IDs et couleurs de sortie sont déterministes ;
- une famille numérique restante ou un label dupliqué fait échouer les tests ;
- un nom officiel isolé se terminant réellement par un nombre reste autorisé.

## Résultat consolidé

- zones canoniques : 4 164 ;
- erreurs de validation : 0 ;
- avertissements de validation : 0 ;
- labels numérotés en série dans les villes centrales : 0 ;
- labels visibles dupliqués dans les villes centrales : 0.

La validation visuelle reste à la charge de l'utilisateur conformément à
l'interdiction d'ouvrir le navigateur.
