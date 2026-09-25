# Installer une copie de travail de Meewav

Référence : `f76bbf9c4db776c3131d2c7836374165cf6a8b93`, lecture statique du 13 septembre 2026. Ce guide décrit les commandes identifiées dans le dépôt. **Aucune installation, compilation, exécution du site ou connexion aux services n'a été réalisée pour le rédiger.**

> **Par où commencer ?**
>
> 1. Préparer la copie de travail et les outils selon l'étape 1, puis installer les dépendances Web et globe avec les deux commandes de l'étape 2 : `npm ci`, puis `npm run globe:install`.
> 2. Lire la [configuration](configuration.md) et choisir la cible autorisée selon l'étape 3 avant tout démarrage.
> 3. Pour un premier aperçu de l'interface dans une copie de travail, suivre `npm run dev` à l'étape 4 et utiliser l'URL annoncée. L'aperçu stable du dépôt canonique utilise `npm run dev:rooms:5182` selon les consignes actives ; ne pas remplacer son serveur pour un travail de feature. Les autres modes répondent à des besoins ciblés décrits dans cette même étape.
> 4. Pour essayer une connexion réelle, des données partagées ou le live, suivre les prérequis des étapes 3 et 5 et du guide des [services externes](services-externes.md). Voir l'interface ne prouve pas leur fonctionnement.
>
> **Un aperçu local peut encore contacter des services distants**, notamment via l'URL Supabase de secours même sans clé configurée. Il n'est pas automatiquement isolé ni hors connexion.

## 1. Préparer les outils et la copie du dépôt

Récupérer une copie du dépôt canonique Meewav-Web avec les accès fournis par son responsable, puis ouvrir un terminal à sa racine, là où se trouve [package.json](../package.json). Le laboratoire MeewavGlobe et les copies archivées ne sont pas la base de reprise. Lire les [consignes actives](../AGENTS.md) et [VERSION-VALIDEE.md](../VERSION-VALIDEE.md) avant de travailler dans la copie stable.

| Outil | Exigence établie par les fichiers |
|---|---|
| Git | Nécessaire pour obtenir le dépôt et retrouver le checkpoint. Aucune version minimale fixée par le projet. |
| Node.js | Aucun `engines` racine ni fichier de version Node suivi. Le [verrou npm](../package-lock.json) impose notamment `^20.19.0 \|\| >=22.12.0` pour Vite et `^20.19.0 \|\| ^22.13.0 \|\| >=24` pour ESLint. Une version Node 24 compatible avec ces contraintes est un choix de reprise, **pas une version de poste validée par cette mission**. |
| npm | Gestionnaire attesté par les scripts et les deux fichiers `package-lock.json` Web/globe, au format 3. Aucune version exacte de npm n'est imposée à la racine. |
| Navigateur | Le globe utilise WebGL/Three.js ; les outils audio/live utilisent les API média du navigateur. Le bundle globe cible `safari17` et `chrome110` dans [son préparateur](../scripts/vinyl-globe.mjs), ce qui ne constitue pas une matrice de compatibilité testée du site. |

CMake, un compilateur C++, le SDK VST3, Supabase CLI, Deno et un serveur PostgreSQL local ne sont pas nécessaires pour servir le frontend. Ils concernent des travaux supplémentaires distincts ; voir plus bas et le guide des [services externes](services-externes.md).

## 2. Installer les dépendances Web et celles du globe

Depuis la racine de la copie de travail :

```sh
npm ci
npm run globe:install
```

Sous PowerShell, `npm.cmd` peut être utilisé à la place de `npm` pour appeler directement l'exécutable Windows. Les commandes ci-dessus sont **documentées, non exécutées pendant cette mission**.

- `npm ci` installe à partir de [package-lock.json](../package-lock.json). Cet ordre de préparation est aussi décrit dans la [note d'intégration du globe](../GLOBE-VINYLE-INTEGRATION.md), confrontée ici aux scripts actuels.
- `globe:install`, défini dans [package.json](../package.json), exécute `npm ci --prefix vendor/globe-vinyle --ignore-scripts --no-audit --no-fund`. Le globe possède son propre [manifeste](../vendor/globe-vinyle/package.json) et [verrou](../vendor/globe-vinyle/package-lock.json).
- [scripts/vinyl-globe.mjs](../scripts/vinyl-globe.mjs) refuse la préparation si `vendor/globe-vinyle/node_modules/esbuild` manque. L'installation racine seule ne suffit donc pas, même pour ouvrir d'abord `/auth`.

Conserver les ressources versionnées dans `public/` et `vendor/globe-vinyle/`. Le globe utilise ses données locales préparées ; aucune importation géographique ou alimentation de base n'est prescrite pour ce démarrage.

## 3. Choisir la configuration avant le premier démarrage

Lire le guide de [configuration](configuration.md), en particulier le choix du dossier d'environnement et la séparation entre données réelles et aperçu.

Pour travailler avec l'authentification et les données réelles, obtenir les valeurs autorisées de **`VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`** pour l'environnement prévu. Les déclarer dans la configuration locale de la copie, sans les publier. La clé `service_role` appartient au serveur ; elle ne doit jamais remplacer la clé publique du navigateur.

Le [.env.example](../.env.example) est un modèle partiel : ses réglages cartographiques décrivent aussi des composants historiques. Il n'est pas une configuration complète du globe actif. Ne pas copier aveuglément une configuration personnelle ou celle de production.

Sans clé Supabase, [supabaseClient.ts](../src/lib/supabaseClient.ts) affiche un avertissement et utilise un marqueur invalide pour construire le client. Il contient aussi une URL distante de secours. Cela peut permettre de monter une interface, **sans créer de backend local, de session valide ou de mode hors connexion**. Les appels distants peuvent échouer ; un aperçu local n'annule pas automatiquement tous ces appels.

## 4. Démarrer le site selon le travail souhaité

Les commandes de ce tableau sont présentes dans [package.json](../package.json), sauf la variante d'entrée auth explicitement portée par [VERSION-VALIDEE.md](../VERSION-VALIDEE.md) et comprise par [start-development.mjs](../scripts/start-development.mjs). Elles n'ont pas été lancées pour cette rédaction.

| Besoin | Commande depuis la racine | Effet à connaître |
|---|---|---|
| Frontend sans lanceur d'aperçu Rooms | `npm run dev:web` | Lance directement Vite, sans les flags ajoutés par le lanceur. Ouvrir `/auth` sur l'URL annoncée par Vite. Les routes protégées restent soumises à la session/onboarding ; un aperçu local déjà activé dans l'onglet peut encore influer. |
| Aperçu de travail courant | `npm run dev` | Mode `audio-lab`, hôte `127.0.0.1`, port demandé `5178`, ouverture `/rooms/home`, aperçu d'accueil Rooms. Ce script n'a pas `--strictPort` : utiliser l'URL réellement annoncée. |
| Aperçu stable du dépôt canonique | `npm run dev:rooms:5182` | Même famille d'aperçu sur `5182`, avec `--strictPort`. Ne pas remplacer le serveur stable pour un travail de feature ; suivre les consignes du dépôt. |
| Aperçu Rooms élargi | `npm run dev:rooms` | Mode `audio-lab`, port demandé `5178`, flag `--rooms-workspace-preview`. |
| Aperçu Classe ciblé | `npm run dev:classe` | Mode `audio-lab`, port `5179` strict, frontière `--classe-workspace-preview`. |

Pour reproduire spécifiquement le retour à `/auth` à chaque actualisation de l'aperçu stable, la commande de référence est :

```sh
node scripts/start-development.mjs --rooms-home-workspace-preview --auth-entry-preview --mode audio-lab --host 127.0.0.1 --port 5182 --strictPort
```

Ce retour est conditionné au développement dans [main.tsx](../src/main.tsx) ; la navigation interne reste possible. Ne pas lancer une deuxième instance sur un port déjà utilisé. `--auth-entry-preview` n'est pas une règle d'authentification de production.

Les scripts `dev:audio-lab`, `dev:place-audio`, `dev:tremplin` et `dev:globe-integration` existent également. Ils ne sont pas interchangeables avec le parcours connecté : `tremplin` active un aperçu local dans [localAuthPreview.ts](../src/features/auth/localAuthPreview.ts), et son script écoute sur `0.0.0.0`. Les variantes et leurs réglages sont détaillés dans la configuration.

## 5. Reconnaître le résultat et ses limites

Lors d'un futur essai, distinguer les niveaux suivants :

1. **Serveur Web disponible** : Vite annonce une URL et reste actif sans erreur de dépendance du globe. C'est un indice de démarrage, pas une validation de l'application.
2. **Interface chargée** : `/auth` ou l'accueil d'aperçu demandé se monte ; les ressources du globe sont servies par le même Vite. Le middleware de [vinyl-globe.mjs](../scripts/vinyl-globe.mjs) transforme ses sources pour permettre les mises à jour de développement.
3. **Fonctionnalités raccordées** : une vraie connexion, une lecture de données ou une participation live exige ses services et ses droits. Leur succès devra être vérifié séparément, entre comptes lorsque nécessaire.

Un retour vers `/auth` peut être normal : [RequireAuth.tsx](../src/features/auth/RequireAuth.tsx) protège la session et l'onboarding, tandis que le flag d'entrée auth agit à chaque chargement de document. Une interface de démonstration visible n'atteste pas un accès Supabase réussi. Le mode Wave `local-explicit` refuse les commandes audio critiques au lieu de simuler une infrastructure opérationnelle.

Les UX Marketplace et Tremplin sont implémentées. Leur activation nationale est prévue respectivement en **phases 2 et 3**, par choix produit. Le fonctionnement des transactions et des services est à vérifier indépendamment de cette roadmap.

## 6. Composants supplémentaires et préparation d'un build

### Audio navigateur et laboratoire

Le mode `audio-lab` active le service des ressources openDAW/WASM, les en-têtes d'isolation navigateur et le middleware de moniteur natif dans [vite.config.js](../vite.config.js). Le fichier suivi [.env.audio-lab](../.env.audio-lab) active le laboratoire de correction vocale. Ces éléments ne sont pas tous inclus dans un build Web normal.

Si un travail spécifique sur ces ressources nécessite leur régénération après installation, `npm run opendaw:assets:sync` est défini dans [package.json](../package.json) et [sync-opendaw-wasm.mjs](../scripts/sync-opendaw-wasm.mjs). Ce script **écrit les ressources et leur manifeste**, puis appelle son vérificateur. Ce n'est pas une étape automatique de l'installation Web, et il n'a pas été exécuté ici. Son manifeste distingue l'usage de prototype interne de l'autorisation commerciale ; conserver les licences et exclusions.

### Moteur natif optionnel

[apps/meewav-audio-engine/CMakeLists.txt](../apps/meewav-audio-engine/CMakeLists.txt) exige **CMake 3.25 et C++20**. Le moteur et le scanner sont activés par défaut ; les tests, le POC de contrôle, JUCE et le SDK VST3 sont désactivés par défaut. Les POC de contrôle/VST3 actuels sont réservés à Windows. Le chemin JUCE s'arrête explicitement, car son adaptateur n'est pas implémenté.

Le démarrage Web ne compile ni n'installe ces exécutables. Le moniteur de laboratoire ne peut les utiliser que si le binaire attendu et les plugins locaux existent ; voir [audio-lab-native-monitor.mjs](../scripts/audio-lab-native-monitor.mjs). La procédure spécialisée [windows-live-poc.md](../apps/meewav-audio-engine/docs/windows-live-poc.md) contient des commandes CMake et des chemins de poste à réexaminer avant usage ; elle ne constitue pas l'installation générale du site. Le contrôle local, le traitement natif et l'envoi audio vers les Rooms restent des capacités distinctes.

### Ancien serveur cartographique

Le service `server/mvt-tile-server` est réservé à `--legacy-globe-tiles` dans [start-development.mjs](../scripts/start-development.mjs). Il n'est pas requis par le globe vinyle actif. Ne pas lancer ses importations ni restaurer l'ancien laboratoire pour compléter une installation Web.

### Build et aperçu statique

`npm run build` et `npm run preview` sont des scripts réels de [package.json](../package.json), respectivement `vite build` et `vite preview`. Le préparateur du globe génère alors des bundles et copie des ressources sous `public/globe-vinyle`. Ces commandes sont indiquées pour situer la chaîne locale ; elles n'ont pas été exécutées ici. Un build ou un aperçu statique ne déploie ni Supabase, ni les fonctions Edge, ni les services live. La procédure de mise en production reste à documenter séparément.

## État de vérification

Sources, scripts et contraintes de versions relus statiquement ; liens vérifiés lors de la livraison documentaire. Installation propre, disponibilité des paquets, démarrage, compilation, navigateurs, périphériques, comptes et services distants **non vérifiés pendant cette mission**.
