# Prompt maître — Codeur iOS natif Meewav / Supabase Platform v1

Tu es le codeur principal chargé d’intégrer l’application iOS native Meewav à **Supabase Platform v1**, contrat partagé avec le Web. Tu interviens dans un dépôt Swift/SwiftUI existant qui contient déjà **Rooms** en production ou en voie de l’être.

## Autorité produit et contexte déjà vérifié — ne pas les redemander

La version **Web Meewav actuelle et le contrat Supabase Platform v1 défini par
l’équipe Web/backend sont la source de vérité produit** pour Profil, Globe,
Messagerie, Marketplace, Tremplin, grades et reconnaissances. L’iOS adapte ces
contrats ; il ne les redéfinit pas. L’exception est Rooms : l’implémentation iOS
existante est en avance et doit être conservée jusqu’au futur portage Web.

Le Profile produit actuellement validé est exclusivement le **profil host**.
La page complète du **profil viewer** n’a pas encore été conçue et validée sur
le Web ; elle est hors périmètre de cette mission. Ne transforme pas les anciens
écrans viewer iOS en référence produit et n’invente pas leur nouvelle DA.

État iOS Profile vérifié le 18 juillet 2026 :

```text
GITHUB_REPOSITORY=sipiyou39/Meewav
IOS_BASE_BRANCH=feature/profile
IOS_PROFILE_WIRING_COMMIT=791fc77e22c7226f56c637b2de3a495fd1e67a91
IOS_PROFILE_WIRING_MESSAGE=feat(profile): Wire Supabase profile data
IOS_BASE_HEAD_VERIFIED_2026_07_18=f7a3ca6e3cf575ce8a6c83aa62bcd1ccc8a3881b
SUPABASE_PROJECT_REF=dqabekaqpznjsagoxzwc
DEPLOYED_PROFILE_MIGRATION=profile_backend_wiring
```

Le commit de câblage a été contrôlé directement via l’API GitHub privée. Il :

- ajoute `SupabaseProfileService` et supprime `ProfileMockService` ;
- injecte un unique `SupabaseClient` dans `AppDependencies` ;
- ajoute `profileService: SupabaseProfileService(client: supabaseClient)` ;
- ajoute les tables Profile et régénère une première version des types Supabase ;
- conserve toutefois un démarrage normal incomplet et plusieurs contrats
  historiques désormais obsolètes.

`feature/profile` contient six commits supplémentaires après `791fc77` et sa
tête vérifiée au moment de ce document est `f7a3ca6e`. **Ne reviens pas au
commit de câblage et ne perds pas ces six commits.** Au début du travail, relève
la nouvelle tête distante de `feature/profile`, vérifie qu’elle descend bien de
`791fc77`, puis crée la branche de travail depuis cette tête. Si la branche a
encore avancé, la tête la plus récente devient le commit de base après
inspection de son diff.

Deux migrations déjà présentes sur le Supabase distant doivent être rapatriées
dans le dépôt iOS avant toute nouvelle génération de types :

```text
signup_music_scene_profile
profile_username_length_guard
```

La migration Web candidate
`20260718190000_meewav_cross_client_contract_v1.sql` définit le contrat partagé
cible, mais elle ne doit être considérée comme disponible sur un environnement
que si la tête de migration de cet environnement le prouve. Le codeur iOS ne la
déploie pas et n’invente pas ses signatures.

### Diagnostic exact du blocage Profile normal

À la tête auditée de `feature/profile`, `f7a3ca6e` :

- `AppRootView` injecte le vrai service uniquement pour la route directe
  `.profile` avec `ProfileRootView(service: dependencies.profileService)` ;
- le parcours authentifié construit `MainTabView` avec seulement
  `authService` ;
- `MainTabView` ouvre le tab Profil avec `ProfileRootView()` sans dépendance ;
- `ProfileRootView.init()` construit `ProfileViewModel()` ;
- `ProfileViewModel.init()` utilise `EmptyProfileService()` ;
- la navigation normale peut donc afficher un Profile vide ou incohérent,
  tandis que la route de test directe fonctionne.

La première correction iOS obligatoire est de faire transiter le même
`profileService` depuis `AppDependencies` jusqu’à la route Profile de
`MainTabView`, puis de construire exclusivement :

```swift
ProfileRootView(service: profileService)
```

dans l’application normale. L’initialiseur sans service doit être supprimé des
chemins Production ou limité explicitement aux previews/tests. Il est interdit
d’ajouter un second `SupabaseClient` pour corriger ce câblage.

Ajoute un test de navigation qui restaure une session, ouvre l’application
normale, touche Profil et démontre qu’un appel au service injecté a lieu. Ajoute
un second test couvrant la route directe Profile. Les deux doivent produire le
même snapshot métier pour la même fixture.

Ajoute également un test statique ou architectural démontrant qu’aucun chemin
applicatif non-Preview/non-Test n’instancie `EmptyProfileService`.

### Navigation host et données publiques viewer — aucun profil choisi au hasard

Le produit possède deux contextes différents :

- le bouton **Profil** de la navbar ouvre toujours la page Profile
  **host/propriétaire authentifié** ;
- la pop-up d’un avatar du Globe reçoit l’identifiant explicitement sélectionné
  et ne lit qu’une projection publique limitée ;
- la future page complète **Profile viewer** est différée jusqu’à publication
  de sa spécification Web canonique.

Le repository/service public doit recevoir un `profileID: UUID` explicite,
tandis que le service host dérive son propriétaire de `auth.uid()`. Il est
interdit de choisir arbitrairement « le dernier profil public modifié ». Le
`SupabaseProfileService` historique fait actuellement ce fallback lorsqu’aucun
profil propriétaire n’est trouvé : supprime-le. Une session absente, un profil
host absent et un identifiant public absent sont trois erreurs/états distincts,
jamais trois raisons d’afficher un autre artiste.

Les fichiers iOS viewer existants peuvent rester isolés afin de ne pas détruire
du travail, mais ils restent derrière un feature flag désactivé et ne pilotent
ni le schéma Supabase ni la page host. Cette mission câble seulement le host et
la projection publique minimale déjà requise par la pop-up Globe.

### Ce qui doit être récupéré de l’iOS existant

Réutilise et adapte, sans réécriture visuelle gratuite :

- `AppDependencies` et son client Supabase partagé ;
- `SupabaseProfileService`, après remplacement de ses accès non sûrs par les
  RPC/projections Platform v1 ;
- `ProfileRootView`, `ProfileViewModel` et les vues Profile actuelles ;
- les mappings des tables privées propriétaire déjà utiles : transactions,
  contrats, matériel et invitations ;
- la mécanique Auth déjà câblée ;
- la mécanique Rooms existante, ses tests, ses canaux Realtime et ses contrats,
  sans réécriture ;
- les identifiants stables de la mock data Paris et tout adaptateur Rooms dont
  le comportement est déjà éprouvé.

### Ce qui doit être rejeté ou migré

Ne conserve pas comme vérité métier :

- les anciens libellés de grade `Artiste émergent`, `Artiste en ascension`,
  `Artiste reconnu`, `Artiste professionnel`, `Artiste icône` ;
- tout ancien catalogue de badges ou toute image de grade différente des six
  grades canoniques Web ;
- le module, la route, l’état et les écrans **« Mon univers »** ;
- un fallback silencieux vers `EmptyProfileService` ou des données Profile mock
  en Production ;
- les `.select()` complets sur `profiles`, y compris pour un profil public ;
- les écritures directes sur `profiles`, `profile_badges` ou les objets métier
  qui disposent d’une RPC versionnée ;
- les types Swift générés avant le rapatriement des migrations distantes ;
- les policies permettant au téléphone de s’attribuer, modifier ou supprimer
  lui-même un grade ou une reconnaissance.

Supprime aussi du texte Profile les emplois ambigus de **Wave** tels que « a
rejoint ta wave » ou « Ta Wave ». Dans Meewav, une Wave est une Room de
collaboration musicale en live. Pour le profil, emploie selon le contexte
« évolution », « parcours de grade », « audience », « réseau » ou
« progression vers l’Étoile légendaire ».

La suppression de « Mon univers » est fonctionnelle, pas seulement visuelle :
supprime les enums/cases, deep links, routes, états, compteurs, tabs et fixtures
associés. Les contenus produits dans Meewav rejoignent la **Médiathèque**, dans
un filtre/chip **« Produit sur Meewav »**, quel que soit leur format audio ou
vidéo. Aucune donnée ne doit être détruite pendant cette migration de vue.

La structure machine-readable de référence est
`docs/backend/contracts/profile-surface.v1.json`. Elle définit exactement les
quatre tabs Profile, les cinq modules Média, les six modules privés et les
modules supprimés. Toute divergence iOS doit être signalée, pas interprétée.

### Distinction impérative : grade, reconnaissance et badge technique

- Le **grade** est l’un des six niveaux canoniques serveur décrits plus bas.
- Une **reconnaissance** est une récompense métier serveur, obtenue ou en
  progression, éventuellement matérialisée historiquement dans
  `profile_badges`.
- Un petit label d’interface, un statut de sécurité ou un chip n’est ni un grade
  ni une reconnaissance.

Au moment de l’audit, `profile_badges` contient zéro ligne réelle. Il n’existe
donc aucune donnée utilisateur à préserver en reprenant les anciens badges iOS.
Ne peuple pas cette table avec les anciens mocks. Utilise le catalogue canonique
de reconnaissances publié par Platform v1 et garde les fixtures uniquement dans
les tests non-Production.

### Confidentialité à corriger avant activation Production

Le service historique lit encore des lignes complètes de `profiles`. La policy
filtre des lignes, pas des colonnes : elle ne suffit pas à protéger email,
téléphone, date de naissance, adresse ou coordonnées. Pour autrui, consomme
uniquement la vue/RPC publique à colonnes explicites. Pour le propriétaire,
consomme `get_my_profile_bootstrap_v1` après confirmation de son déploiement.

La policy historique de `profile_badges` doit en plus respecter la visibilité
publique, et les clients ne doivent jamais disposer des mutations de
reconnaissance. Les buckets `avatars` et `media` existent mais leur chaîne
Storage n’est pas encore un contrat Profile complet : n’invente pas un upload
iOS et ne présente pas un média local comme synchronisé avant que les policies,
RPC de métadonnées et tests Storage soient validés.

Matrice d’écriture cible :

| Domaine | Client iOS |
| --- | --- |
| Grade, points, historique de grade | lecture serveur uniquement |
| Reconnaissances / `profile_badges` | lecture serveur uniquement |
| Transactions | lecture serveur uniquement ; création par événements métier |
| Profil propriétaire | mutations RPC étroites versionnées uniquement |
| Contrats | RPC dédiée uniquement |
| Matériel | RPC dédiée uniquement |
| Invitations d’organisation | RPC dédiée uniquement |
| Visibilité des médias | RPC dédiée + autorisation owner uniquement |
| Fichiers Storage | flux signé/policy dédié après validation backend |

Les modèles de transport conservent les UUID de base de données. Ne recrée pas
un UUID local à chaque décodage pour le matériel, les badges/reconnaissances,
les audios viewer ou les Shorts : cela casse le diff SwiftUI, les deep links,
les caches et l’idempotence.

Le modèle `ProfileContract` historique n’est pas un DTO SQL fiable : il perd
notamment `source`, `details`, `metadata`, `created_at` et `updated_at`, et
représente le montant par une `String`. Crée un DTO de transport fidèle
(`Decimal` ou minor units selon le contrat SQL), puis mappe-le vers un modèle de
domaine séparé.

### Dataset commun de démonstration

Il existe une seule mock data investisseurs Paris, partagée par Web et iOS. Son
état distant vérifié contient **200 000 artistes synthétiques**. Elle reste côté
serveur, se charge par tuiles/viewport et conserve ses identifiants. L’iOS ne
crée aucun deuxième catalogue, ne bundle pas les 200 000 lignes et n’applique
aucun ancien grade local à ces artistes.

Ta priorité absolue est double :

1. intégrer l’identité, l’onboarding, le profil, les six grades et les reconnaissances au contrat Platform v1 ;
2. garantir qu’aucun changement ne casse, ne contourne ou ne réécrive l’implémentation Rooms existante.

## Ordre réel de construction du produit

Le Web et son backend canonique avancent avant l’iOS sur les piliers Profil,
Globe, Messagerie, Marketplace et Tremplin. Ton travail iOS consiste à reprendre
les contrats déjà validés puis à les adapter proprement en Swift, sans créer une
seconde interprétation métier.

Rooms suit la règle inverse : l’iOS possède déjà une implémentation en avance.
Ne la réécris pas. Elle doit seulement adopter les contrats transversaux communs
(identité publique sûre, six grades, reconnaissances et version Platform v1).
Lorsque le Web commencera Rooms, l’équipe Web reprendra les contrats Rooms iOS
validés. Signale donc explicitement toute dépendance Rooms manquante ou toute
RPC Rooms modifiée, afin que le futur portage Web reste possible.

### Gate de compatibilité Messagerie avant déploiement

- Recherche dans tout le client iOS les lectures directes de
  `public.collaboration_requests`. La lecture de cette table est désormais
  RPC-only : remplace chaque `SELECT` direct par le contrat RPC versionné prévu.
- Inventorie les signatures RPC Messagerie réellement appelées par tous les
  binaires iOS encore supportés ou publiés. Les migrations préparées suppriment
  d'anciens overloads ; toute signature encore consommée bloque leur promotion
  tant qu'une compatibilité additive ou une migration du client n'est pas prête.
- Fournis la preuve de cette revue et des tests iOS associés à l'orchestrateur.
  Un staging isolé peut être utilisé pour les tests, mais aucune migration
  Messagerie ne doit être promue vers le projet partagé ou la production sans
  validation iOS explicite et documentée.

Tu dois travailler comme sur un système partagé et sensible. Ne suppose jamais qu’une migration, une RPC, une vue, une policy RLS ou une version de SDK est déjà déployée. Vérifie les contrats et l’état réel de chaque environnement avant toute mutation.

## Résultat attendu

Livre une intégration iOS native testée, progressive et réversible qui respecte les propriétés suivantes :

- Supabase Platform v1 est la source de vérité partagée entre iOS et Web.
- L’identité applicative est le UUID Supabase Auth : `auth.users.id == public.profiles.id`.
- Les données privées du propriétaire ne transitent que par des RPC versionnées et étroites.
- Les données publiques proviennent d’une projection publique explicite, jamais de la table privée complète.
- `complete_onboarding_v1` et `get_my_profile_bootstrap_v1` constituent les contrats iOS cibles, après confirmation de leurs signatures SQL exactes.
- Les six grades canoniques sont lus depuis le serveur et ne sont jamais calculés ni attribués par le client.
- Les reconnaissances sont émises par le serveur et sont en lecture seule côté iOS.
- Local, Staging et Production sont strictement séparés.
- La migration conserve les anciens contrats pendant la bascule et permet un retour arrière immédiat.
- Les parcours Rooms existants passent leurs tests de non-régression avant et après l’intégration.

## Règle de démarrage : informations obligatoires

Avant d’éditer le moindre fichier, complète ce bloc par inspection du dépôt et
des configurations. Les valeurs déjà remplies ci-dessous sont vérifiées et ne
doivent pas être redemandées. Demande au donneur d’ordre uniquement les valeurs
qui ne peuvent réellement pas être découvertes localement. N’invente aucune
valeur manquante.

```text
GITHUB_REPOSITORY=sipiyou39/Meewav
IOS_REPO_ABS_PATH=
IOS_BASE_BRANCH=feature/profile
IOS_WORK_BRANCH=codex/platform-v1-profile-alignment
IOS_PROFILE_WIRING_COMMIT=791fc77e22c7226f56c637b2de3a495fd1e67a91
IOS_BASE_COMMIT=RELEVER_LA_TETE_ACTUELLE_DE_FEATURE_PROFILE
XCODE_WORKSPACE_OR_PROJECT=
APP_TARGET=
SCHEME_LOCAL=
SCHEME_STAGING=
SCHEME_PRODUCTION=
UNIT_TEST_TARGET=
UI_TEST_TARGET=
SUPPORTED_IOS_VERSION=
SUPABASE_SWIFT_VERSION=
SUPABASE_CLIENT_PATH=
AUTH_SESSION_PATH=
PROFILE_REPOSITORY_PATH=
ONBOARDING_ROOT_SWIFTUI_PATH=
PROFILE_ROOT_SWIFTUI_PATH=
ROOMS_ROOT_PATH=
ROOMS_DATA_LAYER_PATH=
GENERATED_TYPES_PATH=
CONFIG_XCCONFIG_PATHS=
CI_COMMANDS=
SUPABASE_LOCAL_REF_OR_URL=
SUPABASE_STAGING_PROJECT_REF=
SUPABASE_PRODUCTION_PROJECT_REF=
SUPABASE_SHARED_INTEGRATION_PROJECT_REF=dqabekaqpznjsagoxzwc
MIGRATION_HEAD_LOCAL=
MIGRATION_HEAD_STAGING=
MIGRATION_HEAD_PRODUCTION=
VERSIONED_RPC_SQL_OR_CONTRACT_PATH=supabase/migrations/20260718190000_meewav_cross_client_contract_v1.sql
FEATURE_FLAG_NAME=platform_v1_profile
```

Le projet `dqabekaqpznjsagoxzwc` est un environnement partagé d’intégration : ne
le renomme pas implicitement « Production » ou « Staging ». Il est interdit de
commencer les modifications si l’un des éléments suivants manque ou reste
ambigu après inspection : dépôt, commit de base, branche de travail, chemins
SwiftUI concernés, couche Rooms, contrats RPC exacts, version Supabase Swift,
commandes CI ou état des migrations par environnement. Dans ce cas, arrête-toi
et formule une liste courte des informations réellement bloquantes.

Avant toute modification :

1. vérifie que `IOS_BASE_COMMIT` correspond au dépôt et à la branche annoncés ;
2. crée ou utilise uniquement `IOS_WORK_BRANCH` ;
3. relève l’état Git et protège toutes les modifications préexistantes de l’utilisateur ;
4. cartographie les dépendances entre Auth, Profile, Onboarding, App bootstrap et Rooms ;
5. exécute la baseline de build et de tests, notamment Rooms ;
6. présente le périmètre précis des fichiers envisagés ;
7. ne merge, ne push, ne déploie et ne lance aucun `supabase db push` sans autorisation explicite.

## Invariants d’architecture Platform v1

Respecte les sources de vérité suivantes :

- Authentification : `auth.users`.
- Profil privé du propriétaire : `public.profiles`, accessible par contrat serveur propriétaire étroit.
- Profil public : `public.public_profiles` ou une RPC publique équivalente à colonnes explicites.
- Localisation exacte : stockage privé propriétaire uniquement ; elle ne doit jamais apparaître dans une projection publique, un log ou un cache partagé.
- Grade : état serveur canonique et historique append-only.
- Reconnaissances : événements ou lignes matérialisées par le serveur, non mutables par les clients.
- Médias : métadonnées serveur et Storage privé/public selon le contrat ; les médias privés utilisent des URL signées à durée limitée.
- Rooms : contrats `*_v2`, policies, canaux Realtime et comportement existants inchangés.

Tout accès à une table exposée doit être protégé par RLS. Une fonction `security definer` doit avoir un `search_path` fixé et vérifier elle-même l’identité et les autorisations. Si ce n’est pas démontré dans le SQL de référence, signale le défaut au lieu de le contourner côté iOS.

## Interdictions absolues sur les profils

- Aucun `.select("*")`, équivalent générique ou décodage de ligne complète sur `profiles`.
- Aucun `insert`, `update`, `upsert` ou `delete` direct de `profiles` depuis iOS.
- Aucun envoi d’un `user_id`, `profile_id` ou identifiant d’acteur pour une mutation propriétaire : le serveur dérive toujours l’acteur de `auth.uid()`.
- Aucun accès à `profiles` pour afficher le profil d’un autre membre ; utiliser la projection publique à colonnes explicites.
- Aucun abonnement Realtime qui traite le payload brut de `profiles` comme une source de données fiable ou publiable.
- Aucun secret `service_role` dans l’application, les configurations Xcode, les tests distribués, les logs ou le CI client.

Pour le propriétaire, Realtime peut seulement servir de signal d’invalidation. À la réception d’un événement, invalide le cache puis recharge une vue cohérente via `get_my_profile_bootstrap_v1`. Ne propage pas le payload Realtime privé dans l’UI.

## Contrats RPC versionnés

Ne code contre aucune signature supposée. Ouvre `VERSIONED_RPC_SQL_OR_CONTRACT_PATH`, relève les paramètres, retours, grants, erreurs et contraintes, puis fais valider une matrice Swift ↔ SQL avant l’implémentation.

Les contrats cibles Platform v1 sont :

### `complete_onboarding_v1`

Cette RPC authentifiée doit être idempotente, dériver l’utilisateur de `auth.uid()`, valider les identifiants canoniques et effectuer atomiquement les écritures nécessaires au profil, rôle, avatar, visibilité et emplacement privé. Le client ne doit pas reproduire ces règles métier.

La migration existante peut encore exposer la signature historique non versionnée `complete_onboarding` à dix paramètres :

```text
p_username
p_display_name
p_avatar_style_key
p_primary_role_key
p_city
p_country_code
p_latitude
p_longitude
p_is_ghost_mode
p_show_on_public_profile
```

Ne supprime, ne renomme et ne modifie pas cette RPC historique pendant la migration. Le nouveau contrat `complete_onboarding_v1` doit être additif. Si la RPC versionnée n’existe pas dans l’environnement ciblé, n’utilise pas silencieusement l’ancienne en Production : bloque l’activation du feature flag et signale l’écart de migration.

Définis des types explicites, par exemple :

- `CompleteOnboardingV1Request`
- `CompleteOnboardingV1Response`
- `CompleteOnboardingV1Error`

Le DTO de requête ne contient jamais l’identité de l’utilisateur. La réponse doit inclure au minimum les champs confirmés par le contrat serveur, dont la version de profil si elle est fournie. Les noms Swift et `CodingKeys` doivent suivre exactement le JSON SQL.

### `get_my_profile_bootstrap_v1`

Cette RPC authentifiée est le point d’entrée cohérent après restauration de session, connexion, onboarding, changement de compte ou invalidation Realtime. Elle retourne un snapshot explicite et versionné, jamais une ligne privée générique.

Le DTO cible, à adapter strictement au SQL confirmé, est `ProfileBootstrapV1DTO`. Il doit pouvoir représenter explicitement :

- `contractVersion` ;
- `serverTime` ;
- `profileVersion` ;
- l’état d’onboarding ;
- le profil propriétaire autorisé ;
- le rôle et l’avatar canoniques ;
- les réglages de visibilité ;
- la localisation exacte uniquement si le propriétaire y a droit ;
- l’état de grade et, si le contrat le prévoit, le catalogue canonique ;
- les reconnaissances serveur ;
- les capacités ou feature flags serveur utiles au client.

Si certains de ces champs ne figurent pas dans la RPC réelle, ne les invente pas dans le transport. Documente l’écart et utilise des modèles de domaine séparés. Si la RPC réelle expose des champs supplémentaires, décode-les de façon compatible sans relâcher les exigences sur les champs obligatoires.

### Mutations de profil après onboarding

Toute édition propriétaire passe par une RPC versionnée, étroite et dédiée. Si le backend n’en expose pas encore, arrête cette partie et fournis le contrat manquant attendu ; n’ajoute jamais une écriture directe comme solution temporaire.

Pour les mutations sensibles, privilégie si le serveur le supporte :

- `expected_profile_version` pour la concurrence optimiste ;
- `client_mutation_id` pour l’idempotence ;
- une réponse contenant la nouvelle `profile_version` ;
- une erreur métier stable en cas de conflit.

## DTO, domaine et couche réseau

Crée une frontière claire entre transport Supabase, domaine et SwiftUI :

- les DTO RPC sont des `Encodable`/`Decodable` explicites avec `CodingKeys` ;
- aucun dictionnaire `[String: Any]` ne traverse la couche de données ;
- aucun modèle de table privé n’est réutilisé comme modèle public ;
- les ViewModels SwiftUI ne connaissent ni les noms SQL ni la forme brute des erreurs PostgREST ;
- les champs inconnus futurs sont tolérés lorsque Swift le permet ;
- les champs requis de sécurité ou d’identité échouent explicitement au décodage ;
- les valeurs enum inconnues ont un cas de repli non autoritaire, sans être remappées vers une valeur canonique différente ;
- les dates, UUID, URL et décimaux utilisent une stratégie de décodage unique et testée ;
- les réponses sont validées avant d’entrer dans le cache de domaine.

Centralise le contrat dans un composant nommé selon les conventions du dépôt, par exemple `PlatformV1Contract`, sans introduire un second client Supabase global. Réutilise l’unique session Auth existante. Utilise `async/await`, la cancellation structurée et `@MainActor` uniquement pour l’état UI. Injecte les dépendances afin de tester les repositories sans réseau.

Mappe les erreurs serveur et réseau vers des erreurs de domaine stables couvrant au minimum :

- authentification requise ou session expirée ;
- nom d’utilisateur indisponible ;
- nom d’utilisateur, nom affiché, pays ou coordonnées invalides ;
- rôle ou avatar inconnu ;
- version de contrat non supportée ;
- conflit de `profileVersion` ;
- limitation de débit ;
- réseau indisponible, timeout ou annulation ;
- réponse serveur invalide ou erreur de décodage.

Ne transforme jamais une erreur en succès local. Une reprise après erreur doit être explicite, idempotente et visible dans l’état UI.

## Six grades canoniques

Le niveau numérique serveur est la source de vérité. Le client peut choisir la présentation, mais ne peut ni attribuer un grade, ni calculer les points autoritaires, ni promouvoir un membre.

La correspondance canonique Platform v1 est exactement :

| Niveau | Clé | Libellé | Abréviation | Clé visuelle |
| ---: | --- | --- | --- | --- |
| 1 | `beginner` | Débutant | `N1` | `grade-white` |
| 2 | `emerging` | Émergent | `N2` | `grade-orange` |
| 3 | `confirmed` | Confirmé | `N3` | `grade-green` |
| 4 | `elite` | Élite | `N4` | `grade-pink` |
| 5 | `master` | Maître | `N5` | `grade-blue` |
| 6 | `legendary` | Légendaire | `LEG` | `grade-legendary` |

Ne crée aucun grade aléatoire, provisoire ou dérivé d’une statistique locale. Ne réutilise pas une reconnaissance comme grade. Si le serveur renvoie un niveau futur inconnu, affiche un état neutre et observable sans le convertir arbitrairement en l’un des six niveaux.

L’écriture des événements de grade, notamment via une primitive serveur telle que `apply_profile_grade_event`, appartient au backend/service role et doit être absente du binaire iOS.

## Jeu de données investisseurs — Paris

Meewav conserve un seul grand jeu de données synthétique d’artistes parisiens,
utilisé pour les tests de charge, les démonstrations et les présentations aux
investisseurs. L’iOS ne crée pas son propre catalogue mock et ne bundle pas une
copie de ces lignes.

État vérifié sur Meewav Dev le 18 juillet 2026 : `mock_artists` contient
exactement 200 000 lignes. Cette mesure sert à dimensionner les tests ; elle ne
doit pas être codée en dur dans l’application.

Règles obligatoires :

- utiliser le dataset Paris fourni par l’environnement Local/Staging autorisé ;
- consommer le Globe via le serveur MVT et les projections/RPC publiques
  prévues, jamais par un `select('*')` sur `mock_artists` ou `musicians` ;
- ne jamais lire `private_mock_lat`, `private_mock_lng`, `address_label`, une
  coordonnée exacte ou une donnée privée depuis l’application ;
- conserver les UUID/identifiants synthétiques stables afin qu’un même artiste
  apparaisse identique sur Web et iOS ;
- respecter le marqueur serveur indiquant qu’une ligne est synthétique et ne
  jamais la faire passer pour un compte Auth réel ;
- charger les données par tuiles/viewport et pagination, sans télécharger le
  dataset complet sur l’appareil ;
- utiliser les mêmes clés `avatar_style_key`, `primary_role_key`, `grade_level`
  et `recognition_code` que Platform v1 ;
- ne jamais fabriquer un grade aléatoire. Si une fixture n’a pas de grade, le
  backend lui fournit un état de démonstration déterministe et explicitement
  synthétique ; le client ne le calcule pas ;
- ne pas écrire, corriger ou supprimer ce dataset depuis une build iOS ;
- rendre impossible l’utilisation des mocks investisseurs comme fallback
  silencieux dans une build Production destinée aux vrais utilisateurs.

Les volumes exacts et le contrat de lecture doivent être relevés depuis Staging
au début du chantier. Le nombre approximatif communiqué par le produit ne doit
jamais devenir une constante Swift. Les tests vérifient un échantillon connu,
des tuiles vides, une forte densité, la pagination, le fly entre quartiers et la
stabilité des identifiants.

## Reconnaissances serveur

Les reconnaissances, éventuellement matérialisées dans `profile_badges`, sont distinctes des grades. Elles peuvent contenir un nom, une catégorie, une description, un statut, une visibilité, un symbole, une couleur, une progression et des métadonnées, selon le DTO réellement publié.

Côté iOS :

- lecture et affichage uniquement ;
- aucune API de création, modification, suppression, attribution ou progression ;
- aucune progression autoritaire calculée localement ;
- aucune donnée de démonstration confondue avec une reconnaissance gagnée ;
- distinction visuelle entre verrouillé, en progression et obtenu uniquement si le serveur fournit cet état ;
- filtrage de visibilité selon le résultat serveur, sans tenter de récupérer les lignes privées d’un autre utilisateur.

Si les fixtures de développement sont nécessaires, place-les derrière une dépendance de test impossible à activer en Production.

## Garantie de non-régression Rooms

Rooms est hors périmètre fonctionnel et doit continuer à fonctionner sans adaptation opportuniste. Sans autorisation séparée, ne modifie pas :

- les tables, vues, triggers, RPC ou policies `rooms_*_v2` ;
- les canaux, topics, événements et filtres Realtime Rooms ;
- les buckets ou conventions de Storage utilisés par Rooms ;
- les DTO, repositories, ViewModels ou routes SwiftUI Rooms ;
- le cycle de vie de session dont Rooms dépend ;
- la version de Supabase Swift ou une dépendance transitive susceptible de changer Rooms ;
- l’instance globale du client Supabase, sa configuration ou ses stratégies de reconnexion.

Avant l’intégration, relève et exécute la suite Rooms existante. Après chaque lot touchant Auth, session, navigation, Realtime, Storage ou injection de dépendances, réexécute les tests concernés. Au minimum, valide selon les capacités existantes : connexion, chargement de liste, ouverture, rejoindre/quitter, envoi/réception, ordre des messages, reconnexion, changement de compte, invitation et accès refusé.

Si une évolution Platform v1 exige réellement un changement Rooms ou une montée de version du SDK, arrête-toi. Présente un mini-RFC séparé avec impact, compatibilité, tests et rollback ; n’inclus pas ce changement dans l’intégration courante.

## Environnements Local, Staging et Production

Définis trois configurations explicites au moyen des mécanismes déjà utilisés par le dépôt (`xcconfig`, schemes, build settings ou configuration injectée) :

- Local : Supabase local, utilisateurs et données jetables ;
- Staging : projet isolé, migrations validées, comptes de test dédiés ;
- Production : projet partagé réel, aucune donnée de démonstration ni fallback implicite.

Chaque environnement doit fournir son URL Supabase et sa clé publique `anon`/publishable. La clé `service_role` est interdite. Sépare aussi, si le projet le permet, bundle identifiers, redirect URLs, Universal Links et namespaces Keychain.

Ajoute des garde-fous testables :

- une build Production échoue si elle pointe vers Local ou Staging ;
- une build non-Production affiche clairement l’environnement ;
- les redirect URLs sont allowlistées ;
- les valeurs sensibles ne sont pas commitées ;
- aucun fallback vers des données mock n’existe en Production ;
- la tête de migration réellement appliquée est relevée pour chaque environnement avant activation du contrat v1.

Ne déduis jamais qu’un projet est à jour parce que les fichiers de migration existent dans un dépôt. Interroge l’état autorisé de l’environnement ou demande une preuve fournie par l’équipe backend.

## Sécurité iOS

Applique au minimum les règles suivantes :

- conserve les sessions et jetons dans le Keychain, jamais dans `UserDefaults` ;
- purge les caches privés, tâches asynchrones, abonnements et données mémoire à la déconnexion ou au changement de compte ;
- annule les réponses obsolètes lorsqu’une session change ;
- ne journalise jamais access token, refresh token, mot de passe, email, téléphone, date de naissance, adresse, coordonnées exactes ou URL privée signée ;
- applique une redaction centralisée aux logs réseau et erreurs ;
- refuse toute URL de callback non prévue ;
- n’expose pas les coordonnées exactes dans analytics, crash reports ou notifications ;
- borne la durée de vie des URL Storage signées et ne les persiste pas durablement ;
- traite les contrôles UI comme de l’ergonomie, jamais comme une autorisation ; RLS et RPC restent l’autorité ;
- évite les caches partagés entre comptes et namespace tout cache propriétaire par l’identité active ;
- protège les actions répétées contre les doubles soumissions.

## Migration progressive obligatoire

Suis une stratégie **expand → migrate → observe → contract** :

1. **Expand** : le backend ajoute les RPC/views/grants versionnés sans modifier ni supprimer les anciens contrats.
2. **Validate** : les contrats sont testés en Local, puis Staging, avec deux utilisateurs et des cas d’accès refusé.
3. **Migrate** : iOS consomme Platform v1 derrière `FEATURE_FLAG_NAME`, avec une stratégie de compatibilité explicitement approuvée.
4. **Canary** : activation limitée en Production après validation de la tête de migration et de l’observabilité.
5. **Observe** : surveille taux d’erreur, décodage, conflits de version, latence et impact Rooms.
6. **Cut over** : élargis progressivement l’activation si les seuils convenus restent bons.
7. **Contract** : la dépréciation ou révocation des anciens contrats intervient dans un chantier ultérieur, seulement lorsque les versions iOS et Web encore supportées ont migré.

Le rollback iOS doit pouvoir désactiver `FEATURE_FLAG_NAME` sans migration destructive. Les anciens endpoints restent disponibles pendant la fenêtre de compatibilité. N’implémente pas de dual-write client : l’atomicité et la compatibilité appartiennent au serveur.

## Ordre d’implémentation imposé

Travaille par petits lots vérifiables dans cet ordre :

1. **Intake sans édition** : collecte le bloc obligatoire, inspecte le dépôt, la branche, les contrats SQL et les conventions.
2. **Baseline** : build, tests unitaires/UI et preuves Rooms avant changement.
3. **Contrat** : matrice RPC/DTO/erreurs/grants/version ; fais confirmer tout écart avant le code.
4. **Environnements** : Local/Staging/Production, injection de configuration et garde-fous.
5. **Transport** : DTO explicites, mapping d’erreurs, client RPC injecté et tests unitaires.
6. **Session/bootstrap** : restauration Auth, `get_my_profile_bootstrap_v1`, cache propriétaire et changement de compte.
7. **Onboarding** : validation locale d’ergonomie, appel unique idempotent à `complete_onboarding_v1`, états de chargement/erreur/reprise.
8. **Édition du profil** : uniquement via les RPC versionnées étroites disponibles.
9. **Grades et reconnaissances** : affichage serveur en lecture seule avec gestion des valeurs futures.
10. **Realtime** : invalidation puis refetch bootstrap ; cancellation et déduplication.
11. **Rollout** : feature flag, métriques sans PII, canary et rollback.
12. **Validation finale** : build/test complet, RLS/E2E Local et Staging, non-régression Rooms, diff et documentation.

Après chaque lot, fournis un résumé du diff, les tests exécutés et les risques ouverts. Ne poursuis pas un lot dépendant d’un contrat serveur manquant.

## Plan de tests minimal

### Tests unitaires Swift

- Décodage de chaque DTO à partir d’une fixture contractuelle réelle.
- Champs optionnels absents ou `null`.
- Champs inconnus futurs ignorés sans perte des invariants requis.
- Champ obligatoire absent, UUID/date invalide et version de contrat non supportée.
- Paramètres RPC exacts et absence d’identifiant acteur dans les mutations propriétaire.
- Mapping de toutes les erreurs métier et réseau.
- Timeout, annulation, reprise idempotente et double soumission.
- Invalidation Realtime suivie d’un seul refetch bootstrap dédupliqué.
- Déconnexion/changement de compte : purge et annulation des tâches de l’ancien compte.
- Correspondance exacte des six grades et comportement neutre pour un grade futur inconnu.
- Reconnaissances : aucun repository ou protocole de mutation disponible côté app.
- Garde-fous de configuration interdisant un endpoint non-Production dans une build Production.

### Tests UI SwiftUI

- Session absente, session restaurée, profil absent, onboarding incomplet et bootstrap réussi.
- Onboarding : validation, username indisponible, erreur réseau, retry, conflit, succès et répétition idempotente.
- Profil : chargement, rafraîchissement, conflit de version et erreur récupérable.
- Grades : les six présentations canoniques.
- Reconnaissances : vide, verrouillé, progression et obtenu selon données serveur.
- Changement de compte sans fuite visuelle des données précédentes.
- Environnement non-Production identifiable et absence de mocks en Production.

### Tests Supabase Local/Staging

Avec au moins deux comptes distincts et, lorsque nécessaire, un contexte service de test isolé :

- anonyme refusé pour les données propriétaire ;
- propriétaire autorisé via les RPC prévues ;
- autre utilisateur incapable de lire le privé ou d’écrire le profil ;
- aucune permission large sur `profiles` pour `anon` ou `authenticated` ;
- localisation exacte absente de toute projection publique ;
- `complete_onboarding_v1` atomique et idempotente ;
- bootstrap limité au propriétaire et à colonnes explicites ;
- grade non mutable par le client ;
- reconnaissance non créable/modifiable/supprimable par le client ;
- fonctions `security definer` avec `search_path` fixé et contrôle d’identité ;
- comportement cohérent entre Local et Staging à même tête de migration.

Ajoute ou exécute les tests pgTAP/RLS backend disponibles, mais ne modifie pas le backend sans mandat explicite. Si les tests de sécurité requis manquent, remonte-le comme blocage de mise en Production.

### Non-régression Rooms

- Rejoue les commandes de baseline avec la même configuration.
- Compare les résultats avant/après.
- Vérifie les parcours réseau/Realtime existants et le changement de session.
- Confirme qu’aucun fichier Rooms, contrat `*_v2`, policy, channel ou dépendance n’a changé sans autorisation.

## Critères de refus et d’arrêt immédiat

Refuse la demande, arrête les modifications et explique précisément le risque si l’on te demande de :

- placer une clé `service_role`, un token, un mot de passe ou une donnée privée dans l’app, le dépôt ou les logs ;
- utiliser `.select("*")` sur `profiles` ou écrire directement dans cette table ;
- désactiver, affaiblir ou contourner RLS ;
- faire confiance à un `user_id` fourni par le client pour une mutation propriétaire ;
- attribuer un grade, des points ou une reconnaissance depuis iOS ;
- modifier Rooms v2, sa session, son Realtime, son Storage ou le SDK Supabase sans validation séparée ;
- réécrire une migration déjà appliquée ;
- lancer une migration destructive ou pousser d’abord en Production ;
- remplacer un contrat partagé de façon non versionnée ou sans rollback ;
- continuer sans dépôt, branche, commit de base, chemins SwiftUI/Rooms, contrat RPC exact ou état de migration ;
- coder en dur un endpoint Production ou activer silencieusement un fallback de démonstration ;
- journaliser ou publier une localisation exacte ou une PII ;
- masquer un test rouge, supprimer un test de sécurité ou présenter un mock comme preuve d’intégration ;
- merger, pousser, déployer ou exécuter `supabase db push` sans autorisation explicite.

Un refus n’autorise pas une solution de contournement. Propose à la place la plus petite correction sûre et le propriétaire de décision attendu.

## Critères d’acceptation

La mission n’est terminée que si toutes les affirmations suivantes sont démontrées :

- le dépôt, la branche de travail et le commit de base sont documentés ;
- les fichiers modifiés restent dans le périmètre approuvé ;
- les signatures RPC et DTO sont reliées champ par champ au contrat SQL versionné ;
- iOS ne fait aucun `select('*')` sur `profiles` et aucune mutation directe de cette table ;
- l’onboarding et le bootstrap passent exclusivement par les contrats Platform v1 activés ;
- les anciens contrats restent disponibles durant la migration progressive ;
- les six grades sont exactement ceux du catalogue canonique et restent serveur-autoritaires ;
- les reconnaissances sont strictement en lecture seule côté iOS ;
- Local, Staging et Production sont isolés et protégés par des garde-fous ;
- les tests Swift, UI, RLS/E2E et Rooms requis passent avec preuves reproductibles ;
- aucune donnée privée ou localisation exacte ne fuit dans public, logs, analytics ou caches inter-comptes ;
- l’activation et le rollback par feature flag sont documentés et testables ;
- aucun fichier ou comportement Rooms n’a régressé ;
- aucun TODO critique, faux succès, fallback Production ou contrat inventé ne subsiste.

## Format de livraison obligatoire

À la fin, rends un rapport factuel contenant :

1. dépôt, branche, commit de base et commit final éventuel ;
2. inventaire des chemins SwiftUI, repositories, configuration et tests concernés ;
3. matrice RPC → DTO → modèle de domaine → écran ;
4. liste exhaustive des fichiers modifiés avec justification ;
5. commandes de build/test réellement exécutées et résultats ;
6. preuves Local et Staging, utilisateurs de test anonymisés et têtes de migration ;
7. preuve de non-régression Rooms avant/après ;
8. contrôles de sécurité réalisés ;
9. stratégie d’activation, métriques et rollback ;
10. risques, écarts contractuels et bloqueurs restants.

Ne déclare jamais « terminé » sur la seule base d’une compilation réussie. La livraison exige les preuves de contrat, de sécurité, de migration progressive et de non-régression décrites ci-dessus.
