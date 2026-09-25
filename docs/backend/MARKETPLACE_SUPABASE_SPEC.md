# Marketplace Meewav — spécification de câblage Supabase

Statut : contrat cible et fondation catalogue Phase A implémentés localement.
La migration n'est pas déployée sur l'environnement Supabase distant et ce
document n'autorise aucun `db push` sans validation Web/iOS sur staging.

Audience : développeur Marketplace Web/iOS, orchestrateur backend, sécurité,
paiement et QA.

### État d'implémentation au 19 juillet 2026

La Phase A présente dans le dépôt couvre les cinq parcours visibles de la
maquette (`new`, `used`, `rental`, `services`, `collective`) : catalogue public
projeté, création, liste et reprise des brouillons vendeur, médias canoniques,
favoris, panier mono-vendeur, et intentions non financières de location,
service et achat groupé. Elle réconcilie l'interface du commit Market
`4931b9de12b29e0f4b064676bc1f2e9dbc94844f` avec l'authentification et les
fondations partagées de la plateforme.

- migration locale :
  `supabase/migrations/20260719030000_marketplace_catalog_foundation_v1.sql` ;
- contrat Web : `src/features/market/market.types.ts` ;
- accès Supabase : `src/features/market/market.service.ts` ;
- validation/projection UI : `src/features/market/market.adapters.ts` ;
- orchestration React : `src/features/market/useMarketLive.ts` ;
- tests SQL :
  `supabase/tests/database/011_marketplace_catalog_foundation_v1.test.sql`.

Cette phase ne crée volontairement ni commande, ni paiement, ni payout, ni
ledger. Le bouton de paiement reste donc désactivé en mode Supabase. Les mocks
investisseur restent disponibles uniquement dans la preview locale explicite ;
une erreur live ne retombe jamais silencieusement sur de fausses données.

Les invariants Phase A sont appliqués des deux côtés du contrat : un service ou
une billetterie conserve toujours un mode d’exécution, une location ne peut pas
être demandée entièrement dans le passé, une campagne collective expirée ne
peut plus être rejointe, et retirer un favori ou un article déjà disparu reste
idempotent. Un échec de signature Storage n’efface pas la liste des brouillons :
le client affiche un placeholder et ne persiste jamais l’URL signée.

## 1. Résultat attendu

Le Marketplace doit permettre à un profil Meewav de publier une offre, à un
autre profil de la commander et aux deux parties de suivre son exécution sans
dupliquer l'identité, les médias, la Messagerie, les grades ou les soldes.

La première version de production couvre :

1. les profils vendeurs ;
2. les annonces de services et de produits ;
3. les variantes, prix, disponibilité et médias ;
4. le panier lorsque l'expérience l'exige ;
5. les devis figés et les commandes ;
6. les paiements, remboursements et versements pilotés par le serveur ;
7. un journal financier en partie double ;
8. la livraison d'un service ou d'un produit numérique ;
9. les avis issus d'un achat vérifié ;
10. les litiges, preuves et remboursements ;
11. les signaux Marketplace vérifiés vers les grades et reconnaissances.

L'interface peut évoluer indépendamment. Les règles ci-dessous constituent le
contrat métier partagé par le Web et l'iOS.

## 2. Garde-fous non négociables

- L'identité canonique est `auth.users.id`, identique à `profiles.id`.
- Une annonce référence un vendeur par ce UUID canonique. Elle ne stocke jamais
  un second utilisateur Marketplace.
- Le profil vendeur enrichit le profil existant ; il ne remplace ni ne copie
  `profiles`.
- Les fichiers réutilisent `media_files` et la fondation Storage existante. Le
  Marketplace ne crée pas un second catalogue de blobs.
- Le client ne fixe jamais un montant final, un statut de paiement, une
  commission, une taxe, un solde, un remboursement ou un grade.
- Aucun numéro de carte, cryptogramme, secret de paiement ou clé `service_role`
  n'est stocké dans Supabase ni livré au Web/iOS.
- Une commande payée n'est pas automatiquement une commande terminée.
- Les transitions importantes passent par des RPC versionnées ou des fonctions
  serveur étroites ; les `update` libres depuis le client sont interdits.
- Le cycle de commande, de paiement, de remboursement, de litige et de versement
  est append-only. Une correction ajoute un événement compensatoire.
- Les montants utilisent des entiers en unité monétaire minimale. Aucun
  `float`, aucun montant formaté et aucun symbole monétaire ne font autorité.
- Les webhooks sont signés, idempotents, auditables et rejouables.
- Les grades, points et reconnaissances sont attribués uniquement à partir d'un
  événement serveur final vérifié. Une vue, un clic ou une valeur envoyée par le
  navigateur n'accorde rien.
- Le code Marketplace ne modifie pas les tables ou RPC `rooms_*_v2`.
- Le code Marketplace ne crée pas son propre chat. Il ouvre la Messagerie
  canonique avec un contexte Marketplace.
- Aucune migration n'est poussée sur le projet partagé tant que les fondations
  cross-client n'ont pas été validées sur staging par le Web et l'iOS.

## 3. Sources de vérité et frontières

| Donnée | Source de vérité | Règle Marketplace |
| --- | --- | --- |
| Session | `auth.users` | Le serveur dérive l'acteur de `auth.uid()`. |
| Identité publique | projection publique de `profiles` | Jamais de lecture publique de la ligne privée complète. |
| Grade | `grade_levels` + `profile_grade_state` | Lecture seulement ; écriture service-only. |
| Reconnaissances | définitions et état canonique | Progression service-only. |
| Médias | `media_files` + Storage | Référence par UUID ; aucun blob dupliqué. |
| Offre commerciale | domaine Marketplace | L'annonce et sa version publiée font autorité. |
| Commande | domaine Marketplace | Snapshot immuable du prix et des conditions. |
| Paiement | prestataire + journal Marketplace | Le webhook signé confirme la réalité financière. |
| Solde | somme du ledger | Aucun champ `wallet.balance` modifiable ne fait autorité. |
| Conversation | domaine Messagerie | Le Marketplace ne conserve que l'ID de contexte nécessaire. |
| Notification | `notifications` durcie | Créée par le serveur, jamais forgée par le client. |
| Analytics | événements autorisés | Séparés des transitions et récompenses métier. |

### 3.1 Ce que le Marketplace ne possède pas

- mot de passe, e-mail ou téléphone du profil ;
- avatar, nom public, rôles artistiques ou position exacte ;
- fichiers binaires ;
- messages entre acheteur et vendeur ;
- logique des Rooms ;
- barème de grade ;
- reconnaissance visuelle des badges ;
- coordonnées bancaires complètes.

Les cartes Marketplace consomment une projection sûre du profil. Les commandes
gardent seulement les snapshots légalement nécessaires, par exemple le nom de
facturation ou l'adresse de livraison, dans une surface privée séparée.

## 4. Vocabulaire stable

- **vendeur** : profil autorisé à publier et recevoir un versement ;
- **acheteur** : profil qui initie le panier ou la commande ;
- **annonce** : enveloppe publique commune à une offre ;
- **service** : prestation réalisée après la commande ;
- **produit numérique** : fichier, licence ou contenu livré après paiement ;
- **produit physique** : objet nécessitant stock et éventuellement livraison ;
- **variante** : option achetable d'une annonce ;
- **devis de checkout** : calcul serveur temporaire et signé des montants ;
- **commande** : engagement commercial, toujours limité à un vendeur et une
  devise ;
- **fulfillment** : exécution ou livraison de la commande ;
- **ledger** : journal financier immuable en partie double ;
- **versement** : transfert du solde disponible vers le compte du vendeur.

Les clés techniques restent en anglais et stables. Les libellés français sont
des traductions d'interface, jamais des clés de jointure.

## 5. Modèle de données cible

Les noms ci-dessous sont le contrat proposé. Chaque table exposée à PostgREST
active RLS. Les colonnes `created_at`, `updated_at`, `version` et `deleted_at`
sont ajoutées lorsque leur sens est pertinent. Les UUID sont générés côté base,
sauf les identifiants d'idempotence générés par le client.

### 5.1 Vendeur

#### `marketplace_seller_profiles`

Extension publique et commerciale d'un profil :

- `profile_id`, clé primaire et FK vers `profiles.id` ;
- `slug` canonique unique ;
- `status` : `draft`, `pending_verification`, `active`, `restricted`,
  `suspended`, `closed` ;
- `headline`, `description`, `public_country_code` facultatifs ;
- `response_time_bucket`, valeur agrégée et non une trace privée ;
- `completed_orders_count`, `rating_average_basis_points` et
  `rating_count`, calculés par le serveur ;
- `terms_accepted_version`, `terms_accepted_at` ;
- `activated_at`, `restricted_at`, `suspended_at` ;
- `version`, timestamps.

Le nom, l'avatar, le grade et les badges ne sont pas copiés. La lecture publique
joint la carte de profil canonique au moment de la requête.

#### `marketplace_seller_private_settings`

Surface strictement privée :

- `profile_id` ;
- pays d'établissement et paramètres fiscaux minimaux ;
- type de vendeur : particulier, professionnel ou organisation ;
- références du prestataire de paiement, jamais ses secrets ;
- état KYC/KYB normalisé ;
- préférence de versement ;
- paramètres de facturation ;
- timestamps de vérification.

Le vendeur peut consulter une projection sûre de ses réglages. Seul le serveur
modifie les résultats KYC, les restrictions et les identifiants fournisseur.

#### `marketplace_seller_status_events`

Journal append-only de l'activation, des restrictions, des vérifications et des
suspensions. Il contient l'acteur serveur ou support, le motif codé et une
référence externe nettoyée. Il n'est jamais public.

### 5.2 Taxonomie

#### `marketplace_categories`

- `code`, clé stable ;
- `parent_code` facultatif ;
- `label_key`, `icon_key`, `sort_order` ;
- types d'annonces autorisés ;
- `is_active`, `contract_version`.

#### `marketplace_tags`

Catalogue modéré. Une annonce n'invente pas une catégorie libre. Les tags libres
éventuels passent par normalisation et modération avant d'entrer dans la
recherche publique.

### 5.3 Annonces

#### `marketplace_listings`

Enveloppe commune :

- `id` ;
- `seller_profile_id` ;
- `kind` : `service`, `digital_product`, `physical_product` ;
- `category_code` ;
- `slug`, unique dans le périmètre du vendeur ;
- `title`, `short_description`, `description` nettoyés et bornés ;
- `status` : `draft`, `pending_review`, `published`, `paused`, `sold_out`,
  `rejected`, `archived` ;
- `visibility` : `public` ou `unlisted` ;
- `moderation_status` et `moderation_reason_code` ;
- `published_version_id` ;
- `published_at`, `archived_at`, `version`, timestamps.

Le vendeur peut préparer un brouillon, mais seule la transition de publication
serveur rend l'annonce visible. La publication vérifie identité vendeur,
catégorie, média, prix, disponibilité, contenu et politique de modération.

La Phase A livre le parcours « Déposer une annonce » en cinq étapes pour les
cinq univers. En mode Supabase, l'identité affichée vient du compte connecté,
les fichiers sont uploadés dans la fondation média commune, la première
référence est obligatoirement une image de couverture, et l'action finale ne
crée qu'un `draft` privé. L'espace vendeur relit ensuite ses propres brouillons
normalisés et peut rouvrir le même `listing_id` avec son contenu, ses prix, ses
conditions, ses métadonnées média et sa `version`. Aucune de ces actions
n'accorde le statut `published`.

#### `marketplace_listing_versions`

Snapshot append-only du contenu publié :

- `listing_id`, `version_number` ;
- titre, description, catégorie et conditions rendues au public ;
- configuration de service ou produit ;
- références des médias et variantes publiées ;
- empreinte du snapshot ;
- `published_at`, `superseded_at`.

Une commande référence la version achetée. Modifier une annonce ne réécrit donc
pas le contrat d'une commande existante.

#### `marketplace_service_offers`

Sous-type 1:1 de l'annonce :

- mode : `remote`, `in_person`, `hybrid` ;
- durée indicative ;
- délai de livraison ;
- nombre de révisions incluses ;
- besoin de planification ;
- taille maximale du brief ;
- type de livrable attendu ;
- zone publique grossière si la présence physique est requise.

Une adresse exacte n'apparaît jamais sur l'annonce. Elle n'est échangée qu'après
commande, si le service l'exige et si les deux parties y sont autorisées.

#### `marketplace_product_offers`

Sous-type 1:1 :

- mode de livraison : `digital`, `physical` ;
- politique de licence et `license_template_version` ;
- SKU vendeur facultatif ;
- poids/dimensions uniquement pour le physique ;
- politique de retour ;
- nécessité d'un stock.

Un fichier numérique à vendre reste privé. Seuls sa prévisualisation et ses
métadonnées autorisées sont publiques.

### 5.4 Variantes, prix et stock

#### `marketplace_listing_variants`

- `id`, `listing_id` ;
- `code` stable dans l'annonce ;
- `title`, options JSON strictement bornées et validées ;
- `status` : `active`, `paused`, `archived` ;
- `requires_shipping`, `inventory_tracked` ;
- `version`.

#### `marketplace_listing_prices`

- `variant_id` ;
- `currency_code` ISO 4217 en majuscules ;
- `unit_amount_minor` entier positif ou nul uniquement si le produit autorise
  explicitement le gratuit ;
- type de prix : `fixed`, `starting_at`, `quote_required` ;
- dates d'effet ;
- version de taxe et de commission ;
- `active`.

Une devise possède une précision issue d'un catalogue serveur. L'UI ne déduit
jamais que toutes les devises ont deux décimales.

#### `marketplace_inventory`

- `variant_id` ;
- `available_quantity`, `reserved_quantity` ;
- `version` pour verrouillage optimiste ;
- politique de vente sans stock.

#### `marketplace_inventory_reservations`

- `variant_id`, `buyer_profile_id`, `cart_id` ou `checkout_quote_id` ;
- quantité ;
- `expires_at`, `consumed_at`, `released_at` ;
- clé d'idempotence.

Les réservations expirées sont libérées par tâche serveur. La quantité est
réservée sous verrou transactionnel ; deux acheteurs ne peuvent pas acheter la
dernière unité.

### 5.5 Médias

#### `marketplace_listing_media`

Table de liaison, sans blob :

- `listing_id` ;
- `media_file_id` vers `media_files.id` ;
- rôle : `cover`, `gallery`, `preview_audio`, `preview_video`, `sample` ;
- `sort_order`, texte alternatif ;
- clé primaire ou unicité empêchant les doublons.

Règles :

- le média appartient au vendeur ou provient d'une bibliothèque explicitement
  licenciée ;
- il est dans un état prêt/published compatible ;
- une prévisualisation publique ne révèle jamais l'original privé vendu ;
- `source_pillar = marketplace` est utilisé pour les nouveaux médias créés dans
  cette feature ;
- un média déjà présent dans la Médiathèque peut être réutilisé, sans copie ;
- suppression ou archivage d'un média vérifie d'abord ses références actives ;
- les droits et licences sont validés avant publication.

La mise à jour Phase A remplace atomiquement les lignes de liaison du brouillon,
mais retirer un UUID du payload ne supprime ni n'archive la ligne `media_files`
correspondante. Le nettoyage des anciens médias ainsi détachés est une tâche
serveur future et **reference-aware** : elle devra vérifier toutes les
références actives avant toute action. Ce ne sera pas un archivage aveugle des
UUID absents du dernier payload.

Les livrables, originaux numériques et preuves de litige utilisent eux aussi
`media_files`, avec visibilité privée et autorisations métier dédiées.

### 5.6 Panier et devis de checkout

Le panier est nécessaire uniquement si l'interface permet de préparer plusieurs
articles. Un bouton « Acheter maintenant » peut créer directement un devis de
checkout sans panier persistant.

**Phase A livrée.** La fondation actuelle stocke directement les lignes
`marketplace_cart_items(profile_id, listing_id, quantity)`. L'état authentifié
est relu par `get_my_marketplace_state_v1()` et une quantité est fixée par
`set_marketplace_cart_item_v1(uuid, integer, text)` ; la quantité `0` retire la
ligne. La RPC verrouille le panier logique de l'acheteur, valide l'annonce
publiée et la quantité, applique l'idempotence, puis refuse le mélange de
vendeurs ou de devises. Le Web sérialise les changements rapides, revient au
dernier état confirmé en cas d'échec, et hydrate les IDs exacts du panier sans
dépendre du filtre du catalogue. Une suppression rejouée sur une annonce déjà
absente reste une réussite idempotente ; le ledger ne conserve pas de référence
orpheline. L’interface exige aussi au moins un mode de remise commun à tous les
articles avant de proposer la suite. Aucun devis, commande ou paiement n'est
créé par cette surface ; le checkout live reste désactivé. Le modèle cible de
la Phase 2 introduit ensuite les structures suivantes.

#### `marketplace_carts`

- `id`, `buyer_profile_id` ;
- `status` : `active`, `converted`, `abandoned`, `expired` ;
- `currency_code` ;
- `expires_at`, `version`.

#### `marketplace_cart_items`

- `cart_id`, `listing_id`, `listing_version_id`, `variant_id` ;
- `seller_profile_id` ;
- quantité ;
- options/brief préliminaires bornés ;
- prix indicatif, jamais montant de commande faisant autorité.

V1 recommande un panier par vendeur et par devise. Si l'UI affiche un panier
global, le checkout le découpe en commandes indépendantes par vendeur/devise et
les relie avec un `checkout_group_id`. Un vendeur ne voit jamais les articles
des autres vendeurs.

#### `marketplace_checkout_quotes`

Snapshot serveur court :

- acheteur, vendeur, devise ;
- items et versions d'annonces ;
- sous-total, réduction, livraison, taxe, commission et total en unités
  minimales ;
- moteur fiscal et versions de règles ;
- empreinte ;
- `expires_at`, `consumed_at` ;
- clé d'idempotence.

Le serveur recalcule tout. Un devis expiré ou modifié produit une erreur métier
explicite et un nouveau devis ; il n'est jamais ajusté silencieusement.

### 5.7 Commandes

#### `marketplace_orders`

- `id`, numéro public non séquentiel devinable ;
- `buyer_profile_id`, `seller_profile_id` ;
- `checkout_group_id` facultatif ;
- devise ;
- `order_status`, `payment_status`, `fulfillment_status`, `dispute_status` ;
- totaux figés : sous-total, remise, livraison, taxe, commission, total payé,
  net vendeur ;
- version du contrat, du calcul fiscal et de la commission ;
- référence du devis consommé ;
- `placed_at`, `completed_at`, `cancelled_at`, `version`.

Une commande ne mélange jamais plusieurs vendeurs ou devises.

#### `marketplace_order_items`

Snapshot immuable :

- commande, annonce, version publiée et variante ;
- titre, option, SKU et type au moment de l'achat ;
- quantité ;
- prix unitaire, taxe, remise, commission et total ;
- politique de licence, livraison, révision et retour applicable ;
- empreinte du snapshot.

#### `marketplace_order_private_details`

Surface RLS séparée pour les informations strictement nécessaires à l'exécution
ou à la facture : nom légal, adresse, coordonnées de livraison, référence
fiscale. Elle est minimisée, chiffrée lorsque nécessaire, journalisée à la
lecture sensible et conservée selon l'obligation légale.

#### `marketplace_order_events`

Journal append-only :

- `id`, `order_id`, numéro de séquence strictement croissant ;
- `event_type`, `from_state`, `to_state` ;
- `actor_type` : `buyer`, `seller`, `support`, `system`, `payment_provider` ;
- `actor_profile_id` facultatif et dérivé, jamais accepté librement du client ;
- `source`, `source_event_id`, clé d'idempotence ;
- payload borné et sans secret ;
- `occurred_at`, `created_at`.

Un index unique sur `(source, source_event_id)` empêche le rejeu. La ligne de
commande est une projection actuelle ; le journal explique toujours comment on
y est arrivé.

### 5.8 Fulfillment et livrables

#### `marketplace_fulfillments`

- commande ou item concerné ;
- type : `service`, `digital_delivery`, `shipment` ;
- état : `pending`, `in_progress`, `delivered`, `accepted`, `rejected`,
  `cancelled` ;
- date promise, date de livraison, fenêtre d'acceptation ;
- transporteur et référence opaque si produit physique ;
- version.

#### `marketplace_deliverables`

- fulfillment ;
- `media_file_id` privé ;
- rôle, version, message borné ;
- auteur dérivé de la session ;
- `submitted_at`, `superseded_at`.

Un acheteur obtient une URL signée courte après contrôle de la commande. Il ne
reçoit jamais un chemin permanent partageable. Une nouvelle version ne supprime
pas l'ancienne tant que la politique de conservation l'exige.

### 5.9 Paiements et webhooks

Le prestataire n'est pas figé par ce document. L'intégration doit rester derrière
une interface serveur afin de pouvoir changer de fournisseur sans réécrire les
clients.

#### `marketplace_payment_intents`

- commande ;
- fournisseur et identifiant externe opaque ;
- montant/devise attendus ;
- état normalisé ;
- clé d'idempotence ;
- dates d'autorisation, capture, échec et expiration ;
- métadonnées fournisseur autorisées et bornées.

#### `marketplace_payment_events`

Journal normalisé des événements reçus. Il ne remplace pas la copie brute
sécurisée nécessaire à l'audit.

#### `marketplace_webhook_events`

- fournisseur, environnement, `provider_event_id` unique ;
- type, version d'API, empreinte du corps ;
- état : `received`, `processing`, `applied`, `ignored`, `retrying`, `failed` ;
- nombre de tentatives, erreur nettoyée, timestamps ;
- référence de la transaction métier produite.

Traitement obligatoire :

1. lire le corps brut ;
2. vérifier signature, horodatage et environnement ;
3. enregistrer l'événement avec unicité fournisseur + ID ;
4. répondre rapidement au fournisseur ;
5. traiter de manière asynchrone et idempotente ;
6. verrouiller la commande ;
7. vérifier montant, devise et identité externe ;
8. ajouter événements de commande et écritures ledger atomiquement ;
9. marquer l'événement appliqué ;
10. réessayer avec backoff ou envoyer en file d'échec.

Un événement ancien ou hors ordre ne rétrograde pas un état final. Si la suite
est incohérente, le serveur interroge le fournisseur et lance une réconciliation.

### 5.10 Ledger et versements

#### `marketplace_ledger_accounts`

Comptes techniques : espèces fournisseur, créance acheteur, fonds vendeur en
attente, fonds vendeur disponibles, commission plateforme, taxe due,
remboursements, litiges et chargebacks. Un compte vendeur est lié à son UUID
canonique mais n'est pas public.

#### `marketplace_ledger_transactions`

- `id`, type, devise ;
- référence métier et fournisseur ;
- clé d'idempotence ;
- date comptable ;
- statut : `pending`, `posted`, `reversed` ;
- lien vers la transaction compensatoire.

#### `marketplace_ledger_entries`

- transaction, compte, sens débit/crédit ;
- montant positif en unité minimale ;
- ordre stable.

Pour chaque transaction postée, la somme des débits égale la somme des crédits
dans la même devise. Une transaction postée n'est jamais modifiée ni supprimée.
Une erreur produit une transaction de reversal.

#### `marketplace_payouts`

- vendeur, devise, montant ;
- période et écritures ledger incluses ;
- fournisseur et identifiant externe ;
- état : `requested`, `scheduled`, `submitted`, `paid`, `failed`, `reversed` ;
- clé d'idempotence, motif d'échec nettoyé, timestamps.

Le montant disponible est calculé à partir du ledger après délai de réserve,
litiges, remboursements et minimum de versement. Le client ne peut demander que
le retrait d'un montant actuellement disponible ; le serveur revérifie sous
verrou.

### 5.11 Avis

#### `marketplace_reviews`

- `id`, `order_item_id`, `listing_id` ;
- `reviewer_profile_id`, `seller_profile_id` ;
- note bornée, titre et commentaire nettoyés ;
- `status` : `draft`, `published`, `hidden`, `removed` ;
- `verified_purchase = true`, fixé par le serveur ;
- `published_at`, `edited_at`, version.

Règles :

- un avis par acheteur et item terminé ;
- impossible avant le statut métier éligible ;
- le vendeur ne peut ni créer ni modifier l'avis de l'acheteur ;
- l'acheteur dispose d'une fenêtre d'édition définie ;
- une modération masque sans effacer l'historique ;
- moyenne et compteurs sont recalculés côté serveur ;
- le tri public utilise une pagination stable, jamais un score fourni par le
  client.

`marketplace_review_events` conserve publication, édition et modération. Les
votes d'utilité éventuels utilisent une table unique par profil/avis et ne sont
pas un signal direct de grade.

### 5.12 Litiges et remboursements

#### `marketplace_disputes`

- commande, initiateur dérivé, motif codé ;
- état : `open`, `awaiting_buyer`, `awaiting_seller`, `under_review`,
  `resolved_buyer`, `resolved_seller`, `closed` ;
- montant contesté en unité minimale ;
- échéances de réponse ;
- résolution et acteur support ;
- timestamps.

#### `marketplace_dispute_events`

Journal append-only de chaque message métier, preuve, relance, décision et
changement d'état.

#### `marketplace_dispute_evidence`

Référence un `media_files.id` privé. Seuls les participants autorisés et le
support reçoivent des URL signées. Une preuve n'est jamais exposée dans la
Médiathèque publique.

#### `marketplace_refunds`

- commande et paiement ;
- montant/devise ;
- raison codée ;
- état : `requested`, `approved`, `submitted`, `succeeded`, `failed`,
  `cancelled` ;
- fournisseur, identifiant externe, clé d'idempotence ;
- auteur et approbateur dérivés ;
- références ledger.

Les remboursements partiels sont autorisés si le produit le permet. Le total
remboursé ne dépasse jamais le montant capturé. Un chargeback est un événement
fournisseur distinct et peut rouvrir la réserve vendeur.

### 5.13 Risque, modération et audit

#### `marketplace_risk_decisions`

Surface service-only : signal vérifié, score interne, décision, règle/version,
référence de commande et expiration. Le détail des règles n'est pas livré au
client.

#### `marketplace_idempotency_keys`

Registre serveur : acteur, opération, clé, empreinte de requête, état, référence
de résultat et expiration. Réutiliser la même clé avec un payload différent
retourne une erreur de conflit.

Contrôles minimum :

- fréquence de création/publication d'annonces ;
- vélocité de checkout, moyens de paiement et échecs ;
- auto-achat, comptes liés, vendeurs/acheteurs bloqués ;
- variation de prix anormale avant checkout ;
- stock ou calendrier sur-alloué ;
- incohérence pays/devise/fiscalité ;
- risque et résultat du prestataire ;
- multiplication de litiges, remboursements ou avis coordonnés ;
- fichiers interdits, malware, droits d'auteur et contenu signalé.

Une décision manuelle est auditée. Une suspension vendeur ne supprime pas les
commandes ou obligations déjà ouvertes.

## 6. Machines d'état

Les états sont orthogonaux. Ne pas créer un unique statut qui mélange paiement,
livraison et litige.

### 6.1 Annonce

```text
draft -> pending_review -> published <-> paused
                   |          |             |
                rejected   sold_out      archived
                   |          |             ^
                   +-> draft  +-> published-+
```

Chaque transition vérifie le rôle, la complétude et la version attendue.

### 6.2 Commande

```text
pending_payment -> confirmed -> in_fulfillment -> delivered -> completed
       |              |              |               |
    cancelled      cancelled      cancelled*       disputed
```

`cancelled*` dépend de la politique et peut imposer un remboursement. Le paiement
capturé, le fulfillment et le litige ont leurs propres états.

### 6.3 Paiement

```text
unpaid -> requires_action -> authorized -> captured
   |            |               |             |
 failed       failed          cancelled   partially_refunded -> refunded
                                                  |
                                              chargeback
```

Le fournisseur peut omettre certains états selon le mode de paiement. Le moteur
normalise sans inventer une capture.

### 6.4 Fulfillment

```text
pending -> in_progress -> delivered -> accepted
   |            |             |
cancelled    cancelled     revision_requested
                               -> delivered
```

L'acceptation automatique après délai est une règle serveur versionnée et
annoncée dans le snapshot de commande.

## 7. Contrat financier

### 7.1 Montants

Chaque montant comporte :

- `amount_minor` entier ;
- `currency_code` ISO 4217 ;
- la précision de devise issue du catalogue serveur ;
- la nature du montant ;
- la version de calcul.

Pour une commande :

```text
subtotal
- discount
+ shipping
+ tax
= buyer_total

subtotal
- seller_discount_share
- platform_fee
- seller_tax_withheld
- refund_reserve
= seller_net_pending
```

La formule exacte dépend du statut fiscal et du modèle légal, mais ses composants
sont toujours figés et auditables.

### 7.2 Taxes

Avant paiement réel, Meewav doit décider avec conseil comptable :

- qui est marchand officiel, Meewav ou le vendeur ;
- pays de lancement ;
- B2C/B2B ;
- TVA sur service, produit numérique et produit physique ;
- facturation, autoliquidation et seuils ;
- gestion des avoirs et remboursements ;
- responsabilité des vendeurs.

Le moteur fiscal s'exécute côté serveur avec les preuves minimales de localisation
et une version de règle. Le client peut afficher une estimation, jamais certifier
la taxe. Une modification fiscale future ne réécrit pas les commandes passées.

### 7.3 Devise et conversion

V1 recommande une devise de règlement unique par vendeur, puis l'ajout de devises
après réconciliation. Si une conversion est affichée :

- le prix contractuel garde sa devise source ;
- le taux, sa source et son horodatage sont figés ;
- les frais de conversion sont explicites ;
- le ledger ne mélange jamais les devises dans une écriture équilibrée.

## 8. RPC versionnées et Edge Functions

### 8.1 Convention

- suffixe obligatoire `_v1` ;
- entrée bornée, typée et validée ;
- acteur déduit de `auth.uid()` ;
- `security definer` uniquement si nécessaire, avec `search_path` fixé ;
- retour contenant `contract_version`, `request_id`, résultat et prochaine
  pagination ;
- erreurs métier stables, non localisées ;
- aucune stack, requête SQL, secret ou détail anti-fraude dans l'erreur client.

### 8.2 Lectures publiques

- `list_marketplace_listings_v1(filters, cursor, limit)` ;
- `get_marketplace_listing_v1(listing_id_or_slug)` ;
- `get_marketplace_seller_card_v1(profile_id_or_slug)` ;
- `list_marketplace_reviews_v1(listing_id, cursor, limit)` ;
- `get_marketplace_filter_catalog_v1()`.

Ces lectures retournent uniquement des annonces publiées, une carte profil sûre,
les médias publiés et des agrégats serveur. La recherche utilise curseur stable,
FTS/trigram au départ, puis un index externe si le volume l'exige.

### 8.3 Vendeur

RPC vendeur réellement exposées par la Phase A, avec leurs signatures
PostgreSQL exactes :

- `public.create_marketplace_listing_draft_v1(jsonb, text)` ;
- `public.list_my_marketplace_listing_drafts_v1(integer)` ;
- `public.update_marketplace_listing_draft_v1(uuid, bigint, jsonb, text)`.

`list_my_marketplace_listing_drafts_v1(integer)` accepte une limite de 1 à 100
(50 par défaut) et retourne seulement les `draft` du propriétaire connecté,
avec payload normalisé, médias ordonnés, version et timestamps.
`update_marketplace_listing_draft_v1(uuid, bigint, jsonb, text)` reçoit, dans
cet ordre, l'ID du brouillon, sa version attendue, le payload complet et la clé
d'idempotence. Elle verrouille la cible `FOR UPDATE`, réutilise la RPC de
création comme validateur/normaliseur au moyen d'un brouillon transitoire, puis
remplace annonce, prix et liaisons média dans la même transaction. Les grants
sont limités à `authenticated` et `service_role` ; `anon` et `public` n'ont pas
le droit d'exécution.

Les RPC suivantes restent le contrat cible des phases ultérieures :

- `get_my_marketplace_seller_v1()` ;
- `save_my_marketplace_seller_draft_v1(patch, expected_version)` ;
- `set_marketplace_listing_media_v1(id, media_ids, expected_version)` ;
- `submit_marketplace_listing_v1(id, expected_version)` ;
- `pause_marketplace_listing_v1(id, expected_version)` ;
- `archive_marketplace_listing_v1(id, expected_version)` ;
- `list_my_marketplace_orders_v1(filters, cursor, limit)` ;
- `accept_marketplace_order_v1(order_id, expected_version, request_id)` ;
- `start_marketplace_fulfillment_v1(...)` ;
- `submit_marketplace_deliverable_v1(...)` ;
- `respond_marketplace_dispute_v1(...)` ;
- `request_marketplace_payout_v1(amount, currency, request_id)`.

### 8.4 Acheteur

La Phase A expose `get_my_marketplace_state_v1()` et
`set_marketplace_cart_item_v1(uuid, integer, text)` pour le panier et les
favoris authentifiés. Les opérations suivantes appartiennent au contrat cible
de checkout :

- `upsert_marketplace_cart_item_v1(...)` ;
- `remove_marketplace_cart_item_v1(...)` ;
- `quote_marketplace_checkout_v1(cart_or_item, request_id)` ;
- `list_my_marketplace_orders_v1(...)` ;
- `get_my_marketplace_order_v1(order_id)` ;
- `cancel_marketplace_order_v1(...)` ;
- `accept_marketplace_delivery_v1(...)` ;
- `request_marketplace_revision_v1(...)` ;
- `create_marketplace_review_v1(...)` ;
- `open_marketplace_dispute_v1(...)` ;
- `request_marketplace_refund_v1(...)`.

Un même profil peut être acheteur et vendeur. Les permissions sont calculées par
relation avec la ressource, pas par un rôle global figé dans le client.

### 8.5 Edge Functions

À réserver aux frontières externes et secrets :

- `marketplace-create-checkout-v1` : recalcule le devis, crée la commande et
  l'intention chez le fournisseur avec idempotence ;
- `marketplace-payment-webhook-v1` : vérifie et enregistre le webhook ;
- `marketplace-connect-seller-v1` : onboarding/KYC du compte de versement ;
- `marketplace-signed-download-v1` : autorise puis signe un livrable privé ;
- `marketplace-tax-quote-v1` : fournisseur fiscal éventuel ;
- `marketplace-reconcile-payments-v1` : comparaison périodique ;
- `marketplace-risk-evaluate-v1` : orchestration des signaux privés.

L'Edge Function appelle des opérations SQL transactionnelles service-only. Elle
ne reconstruit pas à la main un état que la base doit verrouiller.

### 8.6 Codes d'erreur minimum

- `marketplace_auth_required` ;
- `marketplace_forbidden` ;
- `marketplace_not_found` ;
- `marketplace_version_conflict` ;
- `marketplace_idempotency_conflict` ;
- `marketplace_listing_not_purchasable` ;
- `marketplace_quote_expired` ;
- `marketplace_price_changed` ;
- `marketplace_inventory_unavailable` ;
- `marketplace_seller_not_payable` ;
- `marketplace_payment_requires_action` ;
- `marketplace_transition_invalid` ;
- `marketplace_refund_limit_exceeded` ;
- `marketplace_review_not_eligible` ;
- `marketplace_rate_limited` ;
- `marketplace_content_rejected`.

## 9. RLS et droits

Les grants directs d'écriture sur les tables sensibles sont révoqués. Les
écritures passent par les RPC de domaine.

| Ressource | Anon | Authentifié sans relation | Acheteur concerné | Vendeur concerné | Service/support |
| --- | --- | --- | --- | --- | --- |
| vendeur public actif | lecture sûre | lecture sûre | lecture sûre | lecture + propre privé via RPC | complet contrôlé |
| annonce publiée | lecture | lecture | lecture | lecture | complet |
| brouillon d'annonce | non | non | non | propre via RPC | complet |
| média de preview | projection publique | projection publique | projection publique | propriétaire | complet |
| original/livrable | non | non | URL signée si éligible | si éligible | contrôlé |
| panier | non | non | propre | non | support limité |
| commande | non | non | propre | vente propre | complet audit |
| événement de commande | non | non | projection autorisée | projection autorisée | complet |
| paiement/ledger | non | non | résumé de propre commande | résumé/solde propre | service-only brut |
| avis publié | lecture | lecture | lecture + propre mutation RPC | lecture | modération |
| litige/preuve | non | non | litige propre | litige propre | complet audit |
| risque/webhook | non | non | non | non | service-only |

Règles supplémentaires :

- une policy « owner » vérifie l'UUID canonique, mais ne donne pas le droit de
  modifier les colonnes serveur ;
- une commande est visible si `buyer_profile_id = auth.uid()` ou
  `seller_profile_id = auth.uid()` ;
- les détails privés sont projetés différemment pour acheteur et vendeur ;
- un profil bloqué ne peut pas ouvrir une nouvelle transaction avec l'autre ;
- support/admin utilise des claims ou rôles serveur vérifiés, jamais un booléen
  fourni par l'application ;
- `anon` ne reçoit aucune écriture métier ;
- les vues publiques utilisent `security_invoker` ou une RPC explicitement
  bornée, sans fuite de colonnes privées.

## 10. Storage

### 10.1 Réutilisation

- Les previews et médias d'annonce référencent `media_files`.
- Les nouveaux objets ont `source_pillar = marketplace`.
- Le chemin commence par l'UUID propriétaire.
- Le flux canonique upload -> scan -> processing -> ready -> publication reste
  commun à la Médiathèque.

### 10.2 Classes d'accès

1. **preview publique** : média publié via la projection canonique ;
2. **original produit numérique** : privé, accessible après droit de commande ;
3. **livrable de service** : privé aux participants ;
4. **preuve de litige** : privée aux participants autorisés et support ;
5. **document fiscal** : privé, durée de conservation dédiée.

Si des buckets dédiés sont nécessaires, ils restent privés. Les policies Storage
ne se contentent pas du premier segment du chemin : une RPC/Edge Function vérifie
la relation métier avant de signer une URL de courte durée.

### 10.3 Sécurité fichier

- taille, MIME et extension autorisés par rôle ;
- checksum et déduplication maîtrisée ;
- antivirus/malware avant disponibilité ;
- traitement média asynchrone ;
- métadonnées EXIF sensibles supprimées des previews ;
- noms de fichiers clients non exposés ;
- pas d'URL signée stockée en base ;
- journaux d'accès aux livrables sensibles ;
- quarantaine et suppression logique avant purge.

Pour la reprise locale d'un brouillon propriétaire, l'URL signée éventuellement
résolue pour l'affichage reste éphémère et n'est jamais écrite dans
`localStorage`. Le snapshot local conserve l'UUID média stable avec une URL vide
et se réconcilie, à la restauration, avec le brouillon serveur courant qui
fournit la métadonnée autorisée et une URL fraîche en mémoire. Les URLs `blob:`
et fichiers locaux ne sont pas persistés ; ils doivent être réimportés.

## 11. Realtime et notifications

Realtime accélère l'interface ; Postgres reste la vérité.

À diffuser aux participants autorisés :

- nouvelle transition de commande ;
- paiement confirmé/échoué après webhook ;
- nouveau livrable ou demande de révision ;
- litige mis à jour ;
- versement mis à jour.

À ne pas diffuser en Postgres Changes global :

- tout le catalogue public ;
- le ledger brut ;
- les décisions de risque ;
- les payloads de webhook ;
- les coordonnées privées.

Chaque abonnement utilise un canal privé et une vérification d'appartenance. À la
reconnexion, le client relit la commande par RPC avec son `version` et ne suppose
pas avoir reçu tous les événements.

Les notifications persistantes sont produites par les transitions serveur. Un
client ne peut jamais insérer « paiement reçu », « commande terminée » ou
« litige gagné ».

## 12. Idempotence, concurrence et cohérence

### 12.1 Requêtes client

Toute action créant une conséquence financière ou un événement durable reçoit
un `client_request_id` UUID stable. Le client réutilise cet ID lors d'un timeout
ou retry ; il n'en génère pas un nouveau avant de connaître le résultat.

Le serveur conserve :

- acteur ;
- opération ;
- clé ;
- hash du payload canonique ;
- référence de résultat ;
- réponse minimale rejouable.

Même clé + même payload retourne le résultat initial. Même clé + payload
différent retourne `marketplace_idempotency_conflict`.

### 12.2 Verrouillage

- `expected_version` pour les brouillons et préférences ;
- verrou de ligne pour stock, devis consommé, commande, remboursement et retrait ;
- contrainte unique pour webhook, paiement externe et événement source ;
- isolation/ordre de verrous documenté pour éviter les deadlocks ;
- jobs avec `FOR UPDATE SKIP LOCKED` pour files internes ;
- retry borné des erreurs de sérialisation.

Dans la Phase A, la mise à jour d'un brouillon exige la `version` lue par le
propriétaire. Une version périmée produit
`marketplace_draft_version_conflict` avec le SQLSTATE `40001` et n'écrase rien.
Le Web normalise cette erreur en `conflict`, refuse la mutation, recharge la
liste serveur la plus récente et conserve le snapshot local des champs pour
permettre leur récupération. Un retry du même payload réutilise la même clé
d'idempotence ; la même clé avec un payload divergent est refusée.

### 12.3 Réconciliation

Une tâche périodique compare :

- paiements fournisseur et payment intents ;
- captures/remboursements et ledger ;
- ledger disponible et versements ;
- commandes terminées et reconnaissances ;
- réservations expirées et stock.

Une différence crée une alerte et un dossier de réparation ; elle ne modifie pas
silencieusement l'historique.

## 13. Anti-fraude et sécurité applicative

- validation serveur de tous les champs, tailles, URLs, MIME et états ;
- HTML interdit ou nettoyé avec une politique unique ;
- rate limits par profil, IP hachée et opération ;
- quotas de publication, checkout, avis, litige et upload ;
- Content Security Policy et aucune URL arbitraire injectée ;
- protection CSRF adaptée aux fonctions HTTP ;
- secrets fournisseur dans le coffre de l'environnement serveur ;
- rotation des secrets et plusieurs secrets webhook pendant une transition ;
- logs sans token, PII, payload fiscal complet ou secret ;
- blocage et signalement partagés avec la plateforme ;
- règles de modération avant publication ;
- KYC/KYB et sanctions selon le pays et le fournisseur ;
- limitation des auto-achats et conflits d'intérêts ;
- aucun détail de score de fraude dans la réponse client.

Les opérations support sensibles exigent authentification forte, motif,
justification, journal d'audit et séparation des rôles lorsque l'argent est
concerné.

## 14. Grades et reconnaissances

Le Globe Web possède déjà les bons grades canoniques. Le Marketplace les
consomme ; il ne crée aucun ancien barème ni aucun visuel parallèle.

Règles :

- le client affiche `grade_levels`, `profile_grade_state` et les cartes
  cross-client autorisées ;
- il ne calcule ni ne persiste un niveau à partir du chiffre d'affaires ;
- un événement analytics `marketplace_listing_view` reste une mesure et
  n'accorde pas de point ;
- seul le service appelle `apply_verified_grade_signal_v1` avec une règle active
  et une source métier idempotente ;
- seul le service appelle `apply_profile_recognition_event_v1` ;
- le `source_entity_id` référence un événement serveur final, pas l'ID fourni
  librement par le navigateur ;
- remboursement, chargeback, fraude ou annulation déclenchent la politique de
  compensation/révocation définie, jamais un `update` arbitraire.

La reconnaissance canonique existante est :

```text
marketplace_validated_seller_5
Marchand validé
5 commandes Marketplace terminées et non remboursées
```

Le compteur progresse au plus une fois par commande éligible. Une commande est
éligible seulement après `completed`, capture confirmée, absence de fraude et
expiration de la fenêtre choisie pour les remboursements immédiats. La règle
exacte est versionnée. Une future reconnaissance utilise un nouveau code stable,
pas un renommage silencieux.

## 15. Intégrations avec les autres piliers

### 15.1 Profil et Globe

- afficher le vendeur via la carte de profil publique canonique ;
- utiliser les grades/badges du Globe Web sans duplication ;
- ne jamais exposer la position exacte ;
- un CTA Profil ouvre l'UUID canonique ;
- les compteurs Marketplace publics sont des agrégats serveur.

### 15.2 Messagerie

« Contacter le vendeur » ouvre ou crée une conversation canonique avec :

- `profileId = seller_profile_id` ;
- `source = marketplace` ;
- `listingId` facultatif ;
- un contexte d'affichage signé ou relu depuis la base.

Le texte d'un message n'est pas stocké dans la commande. Une demande de service
structurée peut référencer commande/annonce, sans donner à la Messagerie le droit
de changer son état.

### 15.3 Rooms

Une offre peut proposer une session live, mais le Marketplace ne crée ni ne
modifie une Room directement. Après commande, une orchestration serveur peut
émettre une invitation Rooms via son contrat versionné. L'ID de Room est une
référence, jamais une copie de ses participants.

### 15.4 Médiathèque, Shorts et Tremplin

- la Médiathèque fournit les `media_files` autorisés ;
- un Short peut lier une annonce publiée, sans intégrer son prix comme vérité ;
- une sélection Tremplin peut lier un service, sans contourner la commande ;
- chaque pilier relit l'annonce publiée par RPC et respecte son statut.

### 15.5 Analytics

Événements autorisés et nettoyés : impression d'annonce, vue, clic CTA, ajout au
panier, début checkout, achat confirmé. L'achat confirmé vient du serveur. Aucun
montant brut sensible, texte libre, e-mail ou donnée de paiement n'entre dans
les propriétés analytics.

## 16. Contrat de lecture client

### 16.1 DTO public d'annonce

Le client reçoit au minimum :

- IDs et version de contrat ;
- type, catégorie, titre et description publique ;
- carte vendeur publique avec grade/reconnaissances autorisées ;
- médias preview ;
- variantes achetables et prix formatables ;
- disponibilité publique ;
- agrégats d'avis ;
- politiques résumées ;
- statut d'action pour le profil courant : achetable, propre annonce, bloqué,
  indisponible ou authentification requise.

Il ne reçoit ni KYC, net vendeur, commission privée, coordonnées, score de
risque, stock interne exact si non nécessaire, ni identifiant fournisseur.

### 16.2 Pagination

- curseur opaque basé sur ordre stable et ID ;
- limite maximum imposée par le serveur ;
- filtres allowlistés ;
- aucune pagination offset à grande échelle ;
- réponse : `items`, `next_cursor`, `has_more`, `contract_version`.

### 16.3 Cache

- catalogue public cacheable avec ETag/version courte ;
- brouillons, commandes et soldes `no-store` ;
- invalidation après publication ou changement de disponibilité ;
- une donnée financière affichée comme fraîche inclut son `as_of`.

## 17. Environnements et releases

### 17.1 Régime commun

| Environnement | Usage | Paiement | Données |
| --- | --- | --- | --- |
| Local | développement destructible | fake provider ou sandbox | fixtures synthétiques |
| Preview | validation CI de branche | fake provider | éphémères |
| Staging | recette Web+iOS partagée | sandbox fournisseur | synthétiques uniquement |
| Production | vrais utilisateurs | compte live | aucune expérimentation manuelle |

Chaque environnement a URL, clé publique, secrets fournisseur, endpoints
webhook et comptes connectés distincts. Aucun ID externe de staging n'est accepté
en production.

### 17.2 Feature flags

Flags serveur proposés :

- `marketplace_catalog_read_enabled` ;
- `marketplace_seller_onboarding_enabled` ;
- `marketplace_listing_publish_enabled` ;
- `marketplace_checkout_enabled` ;
- `marketplace_live_payments_enabled` ;
- `marketplace_reviews_enabled` ;
- `marketplace_disputes_enabled` ;
- `marketplace_grade_signals_enabled`.

Un flag client ne sécurise rien. Le serveur refuse l'opération si le flag serveur
est désactivé.

### 17.3 Expand/contract

1. ajouter tables/RPC `_v1` sans retirer les contrats existants ;
2. générer les types Web/iOS ;
3. brancher les deux clients sur staging ;
4. mesurer erreurs et anciens appels ;
5. activer progressivement lecture puis écriture ;
6. activer paiement sandbox ;
7. auditer et réconcilier ;
8. activer production derrière flag ;
9. retirer un contrat legacy lors d'une release ultérieure seulement.

Le codeur Marketplace ne lance pas `supabase db push` sur le projet partagé. Il
livre migrations proposées et tests dans une PR pour revue de l'orchestrateur.

## 18. Observabilité et exploitation

### 18.1 Traces et métriques

Chaque mutation porte `request_id`, `actor_profile_id` pseudonymisé dans les
outils appropriés, `order_id`, `provider_event_id` et version de contrat.

Métriques P0 :

- taux et latence des lectures catalogue ;
- publication acceptée/rejetée ;
- devis expirés et conflits de prix ;
- checkout initié/réussi/abandonné ;
- autorisations, captures et échecs par fournisseur ;
- âge du plus ancien webhook non appliqué ;
- doublons webhook bloqués ;
- déséquilibre ledger, qui doit rester exactement zéro ;
- écart de réconciliation fournisseur ;
- stock négatif, qui doit rester zéro ;
- remboursements, chargebacks et litiges ;
- téléchargements de livrables refusés ;
- progression/reconnaissance Marketplace appliquée deux fois, qui doit rester
  zéro.

### 18.2 Alertes P0

- signature webhook invalide au-delà d'un seuil ;
- webhook non traité ou file en retard ;
- double capture ou double remboursement ;
- transaction ledger non équilibrée ;
- différence de devise/montant ;
- versement sans écritures disponibles ;
- fuite RLS détectée ;
- hausse anormale des erreurs checkout ;
- environnement fournisseur incohérent ;
- grade/reconnaissance déclenché depuis un rôle client.

### 18.3 Runbooks

Préparer avant production : webhook en panne, fournisseur indisponible,
réconciliation divergente, remboursement manuel, chargeback, vendeur suspendu,
stock incohérent, média infecté, litige urgent, rotation de secret et rollback de
feature flag.

## 19. Confidentialité, conservation et conformité

- minimiser les PII dans chaque table ;
- séparer projection publique et détails privés ;
- définir une durée par catégorie : panier, webhook, commande, facture, preuve,
  risque, log ;
- une demande d'effacement anonymise ce qui peut l'être mais ne détruit pas les
  pièces légalement obligatoires ;
- journaliser l'accès support aux données sensibles ;
- exporter les données personnelles sans exposer celles de l'autre partie ;
- choisir les régions, sous-traitants et clauses du fournisseur avant production ;
- documenter conditions vendeur, politique de retour, litiges, propriété
  intellectuelle et contenu interdit ;
- réaliser une revue juridique/fiscale avant d'accepter le premier paiement live.

## 20. Phases d'implémentation

### Phase 0 — contrat et maquette

- figer DTO, erreurs, deep links et machines d'état ;
- conserver l'UI actuelle ;
- remplacer les mocks par repositories/interfaces, pas encore par la production ;
- définir fixtures réalistes et sans PII.

Critère : tous les boutons ont un résultat cohérent et aucun faux paiement n'est
présenté comme réel.

### Phase 1 — catalogue

- vendeur public/privé ;
- catégories ;
- annonces, variantes, prix et versions ;
- liaison `media_files` ;
- recherche/pagination ;
- RLS et modération de publication.

Critère : un tiers ne voit aucun brouillon ni champ privé ; Web et iOS lisent le
même DTO.

### Phase 2 — panier, devis et commande sans argent live

- panier optionnel ;
- devis serveur ;
- stock/réservations ;
- commande et événements append-only ;
- fulfillment et livrables privés ;
- notifications serveur.

Critère : tests concurrents, état rejouable et aucune modification directe de
montant/statut.

### Phase 3 — paiements sandbox et ledger

- comptes vendeur sandbox/KYC ;
- checkout Edge Function ;
- webhooks ;
- ledger en partie double ;
- remboursements et versements sandbox ;
- réconciliation et alertes.

Critère : chaque scénario financier se réconcilie à zéro, y compris retry,
webhook en désordre, remboursement partiel et échec de versement.

### Phase 4 — avis, litiges et anti-fraude

- avis vérifiés ;
- litiges/preuves ;
- modération ;
- règles de risque ;
- outils support et audit.

Critère : aucune preuve privée ne fuit et toutes les décisions sensibles sont
auditables.

### Phase 5 — grades, reconnaissances et activation progressive

- événements serveur finaux ;
- progression `marketplace_validated_seller_5` ;
- règles de compensation ;
- analytics ;
- rollout par cohortes et flags.

Critère : aucun client ne peut augmenter un point ou une reconnaissance ; une
commande ne compte jamais deux fois.

### Phase 6 — production financière

- revue sécurité, juridique et fiscale ;
- sauvegarde et rollback ;
- tests de charge et chaos ;
- support et runbooks ;
- comptes fournisseur live séparés ;
- activation limitée, monitoring rapproché et réconciliation quotidienne.

## 21. Plan de tests obligatoire

### 21.1 SQL / pgTAP

- `anon` lit seulement annonces/reviews publiées ;
- profil tiers ne lit ni brouillon, panier, commande, détail privé, preuve,
  webhook, risque ou ledger ;
- acheteur et vendeur ne voient que leurs commandes ;
- utilisateur bloqué ne peut créer de checkout ;
- client ne modifie aucun montant/statut/grade ;
- contraintes uniques d'idempotence ;
- transitions invalides refusées ;
- stock jamais négatif ;
- remboursements cumulés bornés ;
- ledger équilibré ;
- fonctions `security definer` avec `search_path` sûr.

### 21.2 Tests métier

- publication avec contenu incomplet, média d'un tiers ou prix expiré ;
- achat concurrent de dernière unité ;
- changement de prix entre panier et devis ;
- double clic checkout et retry réseau ;
- paiement nécessite action, échoue, est capturé puis remboursé ;
- webhooks dupliqués, retardés et hors ordre ;
- livraison, révision, acceptation automatique ;
- annulation avant/après capture ;
- remboursement partiel et total ;
- chargeback après versement ;
- avis avant/après éligibilité ;
- litige avec preuve autorisée/non autorisée ;
- reconnaissance à la cinquième commande, retry et compensation.

### 21.3 E2E Web/iOS

- même compte et même vendeur sur les deux clients ;
- annonce créée Web visible iOS et inversement ;
- reprise d'un checkout après reconnexion ;
- deep link annonce/commande/conversation ;
- notification ouvrant la bonne ressource ;
- mise à jour Realtime puis rattrapage après coupure ;
- téléchargement signé expiré puis renouvelé ;
- rendu des devises sans hypothèse de deux décimales.

### 21.4 Charge et résilience

- recherche et pagination sous volume réaliste ;
- pic de publication et checkout ;
- jobs concurrents sans double traitement ;
- fournisseur lent ou indisponible ;
- redémarrage pendant application webhook ;
- file d'échec puis rejeu ;
- restauration de sauvegarde et réconciliation.

## 22. Critères de sortie production

La production reste bloquée tant qu'un seul point manque :

- RLS et Storage testés avec anon, acheteur, vendeur, tiers et service ;
- aucune clé secrète dans Web/iOS ;
- migrations additives rejouées depuis zéro sur staging ;
- types et versions de contrat identiques Web/iOS ;
- idempotence checkout/webhook/remboursement/versement prouvée ;
- ledger toujours équilibré et réconciliation sans écart ;
- politique fiscale et marchand officiel décidés ;
- KYC/KYB et conditions vendeur validés ;
- remboursements, litiges et support opérationnels ;
- métriques, alertes et runbooks en place ;
- sauvegarde/rollback testés ;
- grades et reconnaissances service-only testés ;
- aucune dépendance à un mock silencieux en build production ;
- approbation sécurité, paiement, produit, Web et iOS.

## 23. Directives immédiates au codeur Marketplace

Tu peux commencer dès maintenant sans attendre le paiement réel :

1. introduis une couche repository et des DTO versionnés ;
2. utilise uniquement les UUID de profils canoniques ;
3. sépare annonce, service/produit, variante et prix ;
4. référence les `media_files` existants ;
5. sépare clairement données publiques et espace vendeur ;
6. modélise l'UI sur les machines d'état ci-dessus ;
7. génère un `client_request_id` stable pour toute mutation ;
8. prévois les états loading, vide, retry, conflit de version et indisponibilité ;
9. ouvre la Messagerie par deep link, sans créer de chat local ;
10. affiche les grades canoniques du Globe Web, en lecture seulement ;
11. n'écris jamais directement montant, statut, compteur, solde ou badge ;
12. livre les propositions de migration et tests en PR, sans `db push` partagé.

Ne bloque pas le catalogue sur les décisions fiscales. En revanche, n'active
aucun paiement live tant que marchand officiel, pays, taxes, fournisseur,
commission, remboursement et versement ne sont pas formellement décidés.

## 24. Décisions produit à figer avant la phase paiement

Ces décisions deviennent de la configuration versionnée, pas des constantes
dispersées dans l'interface :

- pays et devises de lancement ;
- marchand officiel et responsabilité fiscale ;
- types exacts de services/produits autorisés ;
- produit physique en V1 ou phase ultérieure ;
- commission et assiette ;
- délai de réserve vendeur ;
- minimum et calendrier de versement ;
- annulation, révision, acceptation automatique et remboursement ;
- durée de la fenêtre de litige ;
- règles de licences numériques ;
- KYC/KYB et seuils ;
- taxes et factures ;
- modération et contenus interdits ;
- critères précis des signaux de grade et reconnaissances.

Ces choix n'autorisent jamais le client à calculer l'état final. Ils configurent
le moteur serveur, dont les décisions restent versionnées, idempotentes et
auditables.
