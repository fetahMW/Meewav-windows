# Récupération sémantique des villes Guide Alpha

Date de la revue : 14 juillet 2026

## Résultat

Les onze villes temporairement mises en quarantaine pendant les vagues 3 à 5 sont réintégrées. Aucune ville n'a été remplacée par une candidate plus simple. Les 285 géométries sources officielles produisent 256 plaques visibles, avec une décision versionnée pour chaque libellé ambigu.

| Vague | Ville | Sources | Plaques | Résolution principale |
| --- | --- | ---: | ---: | --- |
| 3 | Orléans | 45 | 45 | `452341801` : `2002` → `Les 2002 de La Source` |
| 3 | Annecy | 51 | 51 | `740100301` : `SNR` → `Site NTN-SNR` |
| 4 | Hyères | 29 | 28 | fusion exacte `830690108` + `830690109` → `Paradis-Ritorte` |
| 5 | Colmar | 26 | 9 | dissolution des familles IRIS dans neuf noms de quartiers officiels |
| 5 | Cagnes-sur-Mer | 17 | 16 | Bréguières fusionné; Nord-Est → La Maure; Nord-Ouest → Les Caucours; `RN7` conservé comme secteur officiel revu |
| 5 | Les Sables-d'Olonne | 15 | 13 | Chaume et Mitterrand fusionnés; Sud → Les Chirons; Est-Ouest → L'Allerie |
| 5 | Blois | 20 | 13 | familles numérotées dissoutes; Est 01/02 et Interquartiers contextualisés |
| 5 | Brive-la-Gaillarde | 23 | 23 | IRIS officiels conservés; `Poste`, `Sports`, `Caserne` et `Hôpital` explicitement acceptés comme secteurs locaux |
| 5 | Carcassonne | 21 | 20 | Centre-ville fusionné; Zone Artisanale → Salvaza; Saint-Jacques 2 et 3 → Saint-Jacques |
| 5 | Istres | 17 | 17 | Prépaou 2 → Le Clos de Flore; Zone d'Activités → Éco-Pôle du Tubé Ouest |
| 5 | Thionville | 21 | 21 | Linkling I II III → Linkling |

## Décisions sensibles

### Cagnes-sur-Mer : aucune fausse attribution à La Pinède

L'IRIS `060270117`, officiellement nommé `RN7`, ne correspond pas à un quartier municipal La Pinède. Les entités IGN portant ce nom sont situées dans l'IRIS voisin `060270108`. `RN7` reste donc le libellé officiel de la plaque et porte une acceptation sémantique explicite. Cette exception documentée est préférable à l'invention d'un quartier.

### Brive-la-Gaillarde : source légale et géométrie exacte

Le SIG de l'Agglo de Brive expose en session dix-sept quartiers municipaux dans la couche interne `z_brive_quartier.quartier`. Dix des vingt-trois IRIS recoupent plusieurs de ces quartiers : une table de renommage IRIS vers quartier municipal serait donc fausse.

La couche municipale n'annonce toutefois ni WFS public ni licence ouverte autorisant la redistribution de ses géométries. Elle n'est pas copiée dans le projet. La version intégrée utilise les vingt-trois polygones IGN/INSEE sous Licence Ouverte, sans prétendre qu'ils sont les dix-sept quartiers municipaux. Les quatre noms courts qui avaient déclenché la quarantaine sont des libellés IRIS officiels et sont enregistrés comme acceptations revues.

### Istres : distinction entre Le Tubé et le secteur occidental

`Le Tubé` se trouve dans l'IRIS `130470113`. La plaque `130470117` ne prend donc pas ce nom. Elle utilise l'entité d'activité officielle située dans sa propre géométrie : `Éco-Pôle du Tubé Ouest`.

### Comptages Carcassonne et Thionville

Le WFS IGN/INSEE renvoie bien vingt-et-une entités uniques dans chacune des deux communes. Carcassonne passe à vingt plaques après une fusion; Thionville reste à vingt-et-une après un simple renommage. Les anciens comptes manuels inférieurs étaient erronés.

## Provenance

- Géométries, identifiants et libellés sources : IGN/INSEE, Contours IRIS 2026, WFS Géoplateforme, Licence Ouverte 2.0.
- Toponymes, voies, activités et adresses de contrôle : IGN Géoplateforme, Licence Ouverte 2.0.
- Orléans : quartiers officiels d'Orléans Métropole et périmètre QPV La Source.
- Annecy : Annuaire des Entreprises, établissement NTN Europe et site historique SNR.
- Colmar : découpage officiel des quartiers de Colmar Agglomération. Les fusions suivent les familles IRIS homonymes; elles ne sont pas présentées comme une équivalence polygonale municipale parfaite.
- Cagnes-sur-Mer, Les Sables-d'Olonne et Blois : nomenclatures municipales, complétées par les toponymes IGN pour les cellules ambiguës.
- Brive-la-Gaillarde : couche municipale auditée uniquement comme référence; aucune géométrie sans licence ouverte n'est redistribuée.

Toutes les opérations, leurs identifiants sources exacts, les libellés attendus, les preuves et les justifications sont enregistrés dans `geo/catalog/france-city-curation.json`.

## Artefacts consolidés

- Corpus canonique : 6 716 zones, validation `VALID`, zéro erreur et zéro avertissement.
- PMTiles `2026.8-semantic-recovery` : 10 354 tuiles, 44 186 535 octets, SHA-256 `da1ffbc90f146944810c89eee9d65ab255534f84bce049a613d9619723943c7e`.
- Index de recherche `2026.8-semantic-recovery` : 6 716 zones, 2 695 280 octets, SHA-256 `54492bc3e333ba4362b2f35fd25c67e423fd554199e92de8ba5c7d4b6580ab71`.

## Audit des flys

Trois audits indépendants ont contrôlé les onze villes par lots. Ils ont détecté puis fait corriger deux classes de défauts :

- Hyères ne peut pas utiliser le milieu de sa bbox globale, qui englobe les îles d'Or et place la caméra en mer. Son preset explicite vise désormais le noyau urbain `[6.1286, 43.1205]`, zoom `12.45`, dans une plaque visible.
- Cagnes-sur-Mer et Istres possédaient deux corpus selon le chemin d'entrée. Les plaques Nice Métropole et Marseille Métropole dérivent maintenant vers les mêmes collections curatées que la recherche et les hubs, au lieu de recharger les anciennes sous-zones.

Le contrat automatisé vérifie maintenant qu'un centre de caméra récupé tombe dans une subdivision et que tout parcours métropolitain réutilise la source autonome canonique lorsqu'elle existe.

## Nouvelle règle Guide Alpha

Un numéro, un acronyme, une direction nue ou un nom d'activité ambigu déclenche désormais une curation temporaire obligatoire. Il ne provoque jamais l'abandon ou le remplacement de la ville. La sortie n'est réintégrée qu'après une opération exacte `rename`, `merge` ou `accept`, liée aux identifiants sources et à des preuves traçables. Si une source officielle n'autorise pas la redistribution, ses géométries ne sont pas importées.
