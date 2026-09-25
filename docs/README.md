# Documentation officielle de Meewav

Cet index est le point d'entrée canonique de la documentation reconstruite depuis le code. Le socle validé sur le plan documentaire comprend le [README du dépôt](../README.md), la [présentation produit](produit.md) et la [cartographie d'architecture](architecture.md). Les trois guides de reprise technique ci-dessous ont fait l'objet d'une relecture documentaire. Ces validations portent sur la cohérence des textes ; elles ne constituent ni une vérification indépendante du code ni une validation du fonctionnement de l'application.

Références de lecture, le 13 septembre 2026 : `c771f379647cc24584d83b6edf39716928443743` pour le socle, enregistré dans le checkpoint `f76bbf9c4db776c3131d2c7836374165cf6a8b93` ; ce checkpoint sert de référence aux trois guides de reprise technique. Les contrôles de cette rédaction sont documentaires ; ils ne constituent pas une recette fonctionnelle ni une inspection de l'infrastructure distante.

## Parcours de lecture

- **Découvrir Meewav** : README du dépôt, puis produit.
- **Développer** : architecture, puis [installation](installation.md), [configuration](configuration.md) et [services externes](services-externes.md).
- **Auditer techniquement** : architecture et limites de preuve, puis futurs guides backend, sécurité et état de version.
- **Comprendre une décision passée** : registre de préservation et archives, en tenant compte de leur date et de leur statut historique.

## Structure officielle

Les chemins marqués **À rédiger** sont des destinations proposées, pas des liens ni des documents déjà livrés. Un ancien fichier portant un titre voisin ne devient pas automatiquement le nouveau guide officiel.

| Sujet | Document ou emplacement | État |
|---|---|---|
| Présentation générale | [README du dépôt](../README.md) | Validé sur le plan documentaire — checkpoint `f76bbf9c4` |
| Produit | [produit.md](produit.md) | Validé sur le plan documentaire — checkpoint `f76bbf9c4` |
| Architecture | [architecture.md](architecture.md) | Validé sur le plan documentaire — checkpoint `f76bbf9c4` |
| Installation | [installation.md](installation.md) | Relecture documentaire effectuée — essais de fonctionnement à réaliser |
| Configuration et variables | [configuration.md](configuration.md) | Relecture documentaire effectuée — essais de fonctionnement à réaliser |
| Services externes | [services-externes.md](services-externes.md) | Relecture documentaire effectuée — essais de fonctionnement à réaliser |
| Déploiement et retour arrière | `docs/deploiement.md` | À rédiger |
| État de version et preuves de déploiement | `docs/etat-version.md` | À rédiger |
| Authentification et sécurité | `docs/securite/` | À rédiger |
| Base, migrations, API et fonctions serveur | `docs/backend/` | Nouveaux guides à rédiger ; documents antérieurs encore conservés |
| Espaces fonctionnels et profil | `docs/fonctionnalites/` | À rédiger |
| Stockage, audio et live | `docs/medias/` | À rédiger |
| Décisions techniques et leurs raisons | `docs/decisions/` | À rédiger à partir du code et des décisions préservées |
| Licences et provenance | `docs/references/licences-et-provenances.md` | Index à rédiger ; originaux protégés conservés sur place |
| Roadmap | `docs/roadmap.md` | À rédiger ; UX Marketplace et Tremplin implémentées, activation nationale prévue respectivement en phases 2 et 3 par choix produit |
| Archives | [Archive du 13 septembre 2026](archive/2026-09-13/README.md) | Sauvegarde réalisée |

Le dossier prévu est **`docs/fonctionnalites/`**. Cette organisation ne fixe ni le nombre ni l'identité des piliers officiels de Meewav. Le terme utilisé dans ce socle est **espaces fonctionnels**.

## Lire les états sans les confondre

| État | Ce qu'il signifie |
|---|---|
| Présent dans le code | Un fichier, composant, contrat ou une migration existe dans la révision examinée. |
| Implémenté / raccordé | Un comportement ou un chemin d'appel concret est identifiable. Cela ne prouve pas que le service appelé est disponible. |
| Vérifié | Une méthode et un résultat datés attestent un périmètre précis. Une lecture du code ne vaut pas un essai multi-utilisateurs. |
| Déployé | Une preuve relie une version à un environnement identifié. Un commit ou un push ne suffit pas. |
| Prévu pour plus tard | Une intention ou un contrat cible, ou une fonctionnalité déjà implémentée dont l'activation publique est différée. Les UX Marketplace et Tremplin sont implémentées, avec une activation nationale prévue respectivement en phase 2 et en phase 3. Ce calendrier ne prouve ni la disponibilité actuelle ni le fonctionnement réel des transactions et services. |

Lorsque seul le dépôt apporte une preuve : **« Présence dans le dépôt confirmée — état de déploiement à vérifier. »** Les guides doivent préciser ce qui manque, plutôt que transformer une inconnue en affirmation de disponibilité ou d'absence.

## Documents antérieurs et fichiers protégés

L'[inventaire de sauvegarde](archive/2026-09-13/inventaire.csv) indique les originaux, les copies, les déplacements et leurs empreintes. Le [registre des informations à préserver](archive/2026-09-13/informations-a-preserver.md) conserve les décisions, règles métier, contraintes juridiques et contradictions utiles à la reconstruction.

Les anciennes références encore sur place, notamment `GEMINI.md`, `docs/MON_GLOBE_CANONICAL.md`, `docs/PLATFORM_STATUS.md` et `docs/backend/WIRING_MATRIX.md`, ne doivent pas être utilisées comme description actuelle sans confrontation au code. Leur remplacement est une mission ultérieure. Les archives ne sont pas des consignes opérationnelles à exécuter.

Les SQL, migrations, schémas, configurations, licences, crédits et fichiers de provenance gardent leur emplacement. La reconstruction documentaire ne les réécrit pas. Les [consignes actives des agents](../AGENTS.md) restent applicables ; [VERSION-VALIDEE.md](../VERSION-VALIDEE.md) conserve les repères de livraison et leurs limites de validation.

## Suivi de rédaction

Mission 5, référence `f76bbf9c4db776c3131d2c7836374165cf6a8b93`, 13 septembre 2026. Rédaction initiale limitée à trois guides et cet index, réalisée sans commit ni push.

- **Installation rédigée** : outils, dépendances Web/globe, commandes existantes, choix d'aperçu, prérequis distants et composants audio optionnels. Sources : manifestes/verrous, lanceur, Vite, client Supabase, garde d'authentification et CMake.
- **Configuration rédigée** : consommateurs Web, Edge et natifs, options CMake, réglages Supabase/Vault, paramètres historiques et outils distingués. Les anciennes mentions ne sont pas comptées comme des variables actives sans lecteur. Aucun fichier local de secrets ouvert.
- **Services externes rédigés** : Supabase et ses 14 fonctions Edge, Auth/OAuth/email, LiveKit, Mux, traitement Wave, composants audio, ressources distantes et dépendances cartographiques historiques. Présence, raccordement et disponibilité distante distingués.
- **Contrôles documentaires réalisés** : 247 liens locaux résolvent ; les références à des fichiers sources sont versionnées. Recherche statique des noms de configuration Web/Edge confrontée au guide, comptages des 14 fonctions Edge et 88 migrations confirmés. Contrôle des espaces de fin de ligne et `git diff --check` sans erreur ; aucun marqueur de credential réel détecté dans les quatre documents. Ces recherches ne constituent pas un audit de sécurité exhaustif.
- **Relecture initialement attendue, désormais effectuée** : cohérence documentaire validée par l'utilisateur ; statuts et parcours de démarrage ajustés lors de la finalisation du lot. Cette relecture ne valide pas le fonctionnement de Meewav.
- **Reste à faire** : cibles et redirections Auth, déploiement des migrations/fonctions, workers, comptes/services, installation propre et comportement réel restent à vérifier séparément. Les guides suivants restent hors de ce lot.
- **Non réalisé** : aucune installation, exécution de script applicatif, compilation, recette, migration, importation, interrogation distante ou mise en production. Les commandes décrites sont identifiées dans les sources, pas testées pendant cette rédaction.
