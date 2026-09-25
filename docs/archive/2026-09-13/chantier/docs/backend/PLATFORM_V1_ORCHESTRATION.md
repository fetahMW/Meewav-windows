# Meewav Platform v1 — contrat d'orchestration Web, iOS et Supabase

## Décision d'architecture

Meewav possède **un seul modèle métier partagé** par le Web et iOS, mais pas une
seule base utilisée pour tout faire sans protection. Le régime cible est :

| Environnement | Usage | Données | Droit de migration |
| --- | --- | --- | --- |
| Local développeur | développement quotidien et tests destructifs | fixtures uniquement | chaque développeur, sur sa machine |
| Preview/branche | validation automatique d'une branche | données synthétiques | CI uniquement |
| Staging | intégration Web + iOS + Supabase avant livraison | comptes de test dédiés | orchestrateur backend |
| Production | utilisateurs réels | données réelles | pipeline protégé après validation |

Le projet Supabase actuellement référencé par le Web,
`dqabekaqpznjsagoxzwc`, est nommé **Meewav Dev**. Il ne doit pas être considéré
comme la production ni recevoir un `db push` global tant que les migrations
locales et les clients iOS/Web n'ont pas passé le protocole de compatibilité.

## Les sept domaines produit

L'identité est commune, les responsabilités métier restent séparées.

| Domaine | Responsabilité | Ne possède jamais |
| --- | --- | --- |
| Profil | identité publique/privée, préférences, agrégation autorisée | messages, commandes, Rooms |
| Globe | découverte géographique publique et grossière | coordonnées exactes, grade calculé localement |
| Messagerie | conversations, collaborations, projets et groupes | profil dupliqué, solde financier |
| Rooms | sessions live, participants, outils live | badges arbitraires, messagerie privée générale |
| Shorts | publications courtes et engagement vérifié | compteur de grade modifiable par le client |
| Marketplace | catalogue, commandes, paiements et litiges | solde calculé dans l'interface |
| Tremplin | programmes, candidatures, jury et résultats | attribution locale de récompenses |

Toutes les références d'utilisateur emploient `auth.users.id`. Le profil host a
le même UUID. Les clients n'inventent jamais un deuxième identifiant de compte.

## Contrat de version

Chaque application envoie et journalise les informations suivantes :

- `platform_contract`: `meewav-platform`
- `contract_version`: `1`
- `client`: `web`, `ios` ou `backend`
- `client_build`: numéro de build/commit fourni par le client

Une application peut afficher un mode de maintenance si sa version est plus
ancienne que `minimum_supported_version`. Elle ne doit jamais contourner ce
contrôle en retombant silencieusement sur un `select('*')`.

## Identité et onboarding

### Source de vérité

- Session : `auth.users`.
- Identité publique : projection explicitement limitée.
- Données privées : RPC owner-only, jamais la table `profiles` brute.
- Coordonnée exacte : `profile_locations_private`.
- Marqueur Globe : `profile_public_markers`, volontairement grossier.

### Chemin autorisé

1. Supabase Auth crée ou restaure la session.
2. Le client appelle `complete_onboarding(...)` de manière idempotente.
3. Le client ajoute le contexte de découverte via
   `update_my_public_discovery_profile(...)` si nécessaire.
4. Le client charge `get_meewav_bootstrap_v1()`.
5. Les écrans publics consomment une projection publique ; les écrans owner
   consomment des RPC owner.

### Interdictions

- aucun `profiles.select('*')` dans Web, Flutter ou Swift ;
- aucune écriture directe de `profiles.grade`, `profile_grade_state`,
  `profile_badges` ou des coordonnées privées ;
- aucune service key dans Vite, Swift ou Flutter ;
- aucune donnée privée dans les tuiles MVT, logs ou payloads Realtime.

## Grades canoniques

Le grade est piloté par le serveur :

- catalogue : `grade_levels` ;
- état : `profile_grade_state` ;
- ledger immuable : `profile_grade_events` ;
- miroir temporaire de compatibilité : `profiles.grade`.

Le manifeste partageable se trouve dans
`docs/backend/contracts/grade-levels.v1.json`. Les six niveaux sont :

1. `beginner` — Débutant ;
2. `emerging` — Émergent ;
3. `confirmed` — Confirmé ;
4. `elite` — Élite ;
5. `master` — Maître ;
6. `legendary` — Légendaire.

« Étoile légendaire » est un objectif éditorial lié au niveau 6, pas un septième
niveau. `rookie`, `rising`, `premium` et `grade_stars` sont des champs legacy à
retirer des nouveaux DTO.

### Attribution

Un client ne choisit jamais un nombre de points. Une action métier confirmée
émet un signal serveur idempotent, par exemple :

`rooms:room_completed:<room-id>:rule-v1`

Le barème est versionné côté serveur. Les analytics du navigateur sont des
signaux faibles et ne donnent jamais directement des points. Le niveau est
monotone ; une correction négative exige une opération administrative auditée.

### Confidentialité

Le détail des points et de la progression est owner-only. Le niveau public est
retourné uniquement si le profil est public, non fantôme et si la préférence
`show_grade` n'est pas désactivée.

## Reconnaissances métier

Une reconnaissance n'est pas un niveau de grade. Le catalogue v1 contient :

| Clé | Condition serveur | Pilier |
| --- | --- | --- |
| `creator_regular_14d` | 14 jours distincts d'activité vérifiée | profil/system |
| `golden_pulse_25` | 25 Golden Likes valides reçus | Globe |
| `live_magnet_10` | 10 Rooms réellement terminées | Rooms |
| `collaboration_master_25` | 25 collaborations uniques terminées | messagerie |
| `tremplin_talent_spotted` | sélection officielle | Tremplin |
| `marketplace_validated_seller_5` | 5 commandes terminées, non remboursées | Marketplace |

Le catalogue, la progression et le ledger sont serveur-owned. Un tiers ne voit
que les reconnaissances gagnées et publiques ; il ne voit jamais la progression
privée.

## Adaptateur Rooms sans réécriture des Rooms

Les tables et RPC `*_v2` existants restent intacts. L'adaptation v1 ajoute une
lecture étroite `get_room_participant_cards_v1(room_id, profile_ids)` :

- l'appelant doit être le host ou un participant actif ;
- seuls le host et les participants actifs de cette Room peuvent être demandés ;
- le DTO contient l'identité visuelle sûre, le rôle Room et le grade canonique ;
- aucun e-mail, téléphone, adresse ou coordonnée n'est retourné ;
- l'iOS ne calcule pas le badge et n'écrit pas le grade à la fin d'une Room.

Quand une Room est réellement clôturée côté serveur, le workflow backend peut
émettre les signaux de grade/reconnaissance. Le bouton iOS ne les attribue pas.

## Dataset synthétique Paris pour démonstrations investisseurs

Le grand catalogue synthétique parisien reste un actif partagé de démonstration
et de charge. Il ne devient ni un second système de comptes, ni une copie locale
différente par client.

L'audit en lecture seule du 18 juillet 2026 confirme exactement **200 000**
lignes dans `mock_artists` sur Meewav Dev, auxquelles s'ajoutent 79 anciennes
lignes `musicians`. Ce volume est une propriété du dataset, pas une constante de
l'application.

- Le backend conserve les lignes et leurs identifiants stables.
- Le serveur MVT fournit les artistes du viewport ; Web et iOS ne téléchargent
  jamais le catalogue complet.
- Les projections publiques excluent coordonnées privées et adresses sources.
- Chaque ligne synthétique est distinguable d’un vrai profil Auth côté serveur.
- Le rôle, le style d’avatar et le grade utilisent les catalogues Platform v1.
- Les valeurs de démonstration sont déterministes ; aucun client ne tire un
  grade au hasard.
- `mock_artists`, `musicians` et `spatial_ref_sys` sont en lecture/écriture
  serveur uniquement à terme. Les applications ne les interrogent pas
  directement.
- Local et Staging peuvent afficher les mocks investisseurs. Leur activation en
  Production réelle passe par un choix produit explicite et un flag serveur.

Les tests cross-client utilisent un petit ensemble d’identifiants de référence,
plus des tests de tuiles à haute densité. Le volume total n’est jamais codé en
dur dans Swift ou TypeScript.

## Messagerie

La spécification détaillée est dans `MESSAGING_SUPABASE_SPEC.md`. L'ordre de
construction est non négociable :

1. conversations, membres et blocages ;
2. messages idempotents, reçus et préférences ;
3. collaboration acceptée créant atomiquement une conversation ;
4. Storage privé et pièces jointes ;
5. Realtime privé ;
6. projets ;
7. groupes ;
8. appels audio/vidéo dans une phase séparée.

Les conversations de Rooms ne remplacent pas les messages directs. Les projets
et groupes référencent une conversation canonique au lieu de recréer un chat.

## Marketplace

Le chantier Marketplace peut commencer dès maintenant à condition de respecter
les frontières suivantes :

- `marketplace_listings` décrit l'offre ;
- `marketplace_orders` décrit la commande ;
- `marketplace_order_events` est append-only ;
- argent, remboursements et retraits passent par un ledger et des webhooks
  idempotents ;
- une commande payée ne devient pas automatiquement « terminée » ;
- seul l'état serveur final émet une reconnaissance ou un signal de grade ;
- les médias référencent `media_files`, sans dupliquer les blobs ;
- les coordonnées et informations de paiement ne sont jamais publiques.

Le développeur Marketplace peut travailler sur l'UI et les contrats locaux,
mais il ne crée pas de tables concurrentes `profiles`, `badges`, `wallets` ou
`messages` sans revue de l'orchestrateur backend.

## Realtime

- Postgres reste la source de vérité durable.
- Les flux sensibles sont privés et protégés par RLS.
- Broadcast est privilégié pour les événements fréquents et la montée en
  charge ; Postgres Changes convient aux premières lectures simples.
- Presence sert uniquement à l'éphémère (en ligne, typing, présence dans une
  Room), jamais à un état métier durable.
- Le client rattrape toujours les données manquées après reconnexion.

## Sécurité P0 avant promotion

Le projet Dev distant possède encore des accès legacy dangereux :

- lecture de PII sur `profiles` via les anciennes policies ;
- écritures navigateur sur `mock_artists`, `musicians` et `spatial_ref_sys` ;
- insertion de notifications historiquement trop permissive.

La migration identité locale ferme la fuite `profiles`, mais ne doit être
promue qu'après migration coordonnée des clients. Les tables cartographiques ne
doivent pas recevoir un `enable row level security` improvisé : on révoque
d'abord les écritures inutiles, on mesure les lectures Globe/MVT, puis on crée
les projections et policies testées.

## Definition of done d'un contrat backend

Un domaine n'est « câblé » que si :

1. sa migration part d'une base vide et d'un upgrade réaliste ;
2. RLS est testée avec anon, owner, tiers et service ;
3. les RPC sont idempotentes et valident `auth.uid()` ;
4. aucune PII ne traverse une projection publique ;
5. les types Web et Swift sont générés depuis le même schéma ;
6. le client gère loading, vide, erreur, retry et reconnexion ;
7. les événements métier sont auditables ;
8. le staging Web+iOS passe avant la production ;
9. le rollback applicatif est connu ;
10. la version du contrat apparaît dans les diagnostics.

## Ordre d'exécution coordonné

1. Créer/valider un environnement staging distinct.
2. Rejouer toutes les migrations sur Supabase local et exécuter pgTAP.
3. Appliquer le contrat cross-client v1 sur staging.
4. Donner `IOS_CODER_MASTER_PROMPT.md` au codeur iOS et récupérer le chemin de
   sa vraie branche Swift.
5. Migrer Auth/Rooms iOS vers les RPC v1 sans réécrire leur UI.
6. Migrer Web vers les mêmes DTO et supprimer les fallbacks legacy.
7. Brancher Messagerie phase A, puis Marketplace catalogue/commande.
8. Effectuer les tests croisés avec deux comptes et deux appareils.
9. Corriger les accès P0 legacy après preuve que le Globe ne les utilise plus.
10. Promouvoir par lot, avec vérification post-déploiement et possibilité de
    désactiver chaque nouvelle feature.

## Autorité de changement

- Les migrations sont écrites une fois, versionnées et revues.
- Aucun développeur de feature ne lance `supabase db push` sur le projet partagé.
- L'orchestrateur backend publie les contrats ; Web/iOS les consomment.
- Les changements de mise en page n'impliquent aucun changement de schéma.
- Une incompatibilité stoppe la promotion, pas le développement local.
