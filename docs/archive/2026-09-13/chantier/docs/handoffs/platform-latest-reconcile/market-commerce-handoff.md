# Relais Market intégré — panier, annonces et Supabase Phase A

## Provenance

- branche source UI : `task/market` ;
- commit source exact : `4931b9de12b29e0f4b064676bc1f2e9dbc94844f` ;
- branche d’intégration : `task/platform-latest-reconcile` ;
- route protégée : `/market/*` ;
- migration locale :
  `supabase/migrations/20260719030000_marketplace_catalog_foundation_v1.sql`.

Le contenu de `4931b9de` a été réconcilié avec la navigation, l’authentification,
les profils publics, les médias et la Messagerie de la plateforme. Il ne faut
plus cherry-pick le commit source au-dessus de cette branche.

## Ce qui est réellement câblé

### Catalogue

- cinq univers : neuf, occasion, location, services et achat groupé ;
- projection publique limitée du vendeur, de son avatar et de son grade ;
- recherche serveur par annonce, vendeur et localisation publique ;
- filtres live limités aux données réellement disponibles ;
- médias privés signés par lot et mis en cache côté client ;
- une panne de signature Storage ne masque plus les brouillons : la liste reste
  consultable avec un placeholder, sans URL privée persistée ;
- aucune annonce n’est masquée ou dupliquée lorsque plusieurs offres partagent
  le même visuel.

### Panier

- favoris et quantités relus par `get_my_marketplace_state_v1()` et synchronisés
  par RPC idempotentes, dont `set_marketplace_cart_item_v1(uuid, integer, text)` ;
- mutations sérialisées : le dernier choix utilisateur gagne côté serveur ;
- hydratation exacte des annonces du panier, indépendante du filtre catalogue ;
- état de chargement ou d'annonce indisponible explicite ;
- frais de livraison issus du vendeur en mode live ;
- panier limité par le serveur à un vendeur et une devise ;
- retrait d’un favori ou d’un article déjà supprimé traité comme une opération
  idempotente, sans erreur de clé étrangère ni entrée de ledger orpheline ;
- checkout bloqué si les articles n’ont aucun mode de remise commun ;
- paiement volontairement désactivé tant que commandes et prestataire de
  paiement ne sont pas présents.

### Déposer une annonce

- parcours complet en cinq étapes pour les cinq univers ;
- les services, billets et Rooms possèdent toujours un mode d’exécution valide :
  les billets/Rooms sont « sur place », les autres services restent à distance
  tant que l’utilisateur ne change pas ce choix ;
- identité du compte verrouillée en mode Supabase ;
- upload dans la fondation média commune avec `source_pillar=marketplace` ;
- image de couverture obligatoire et envoyée en première position ;
- uploads et clé d'idempotence réutilisés après une erreur réseau ;
- seuls les nouveaux uploads encore suivis par la tentative courante peuvent
  faire l'objet d'un nettoyage best-effort à la fermeture ;
- enregistrement strict d'un brouillon privé, sans auto-publication.

### Brouillons propriétaire

- centre « Brouillons à reprendre » privé, avec contenu, prix, conditions et
  médias ordonnés ;
- signatures PostgreSQL exactes :
  `public.list_my_marketplace_listing_drafts_v1(integer)` et
  `public.update_marketplace_listing_draft_v1(uuid, bigint, jsonb, text)` ;
- la mise à jour verrouille la ligne, exige la version attendue, renormalise le
  payload puis remplace prix et liaisons média atomiquement ;
- une version périmée renvoie `marketplace_draft_version_conflict` / SQLSTATE
  `40001` ; le client recharge la version serveur au lieu de l'écraser ;
- le snapshot local conserve les champs et UUID média, mais aucune URL signée ;
  la restauration se réconcilie avec le brouillon serveur et une URL fraîche
  n'existe qu'en mémoire ;
- retirer un ancien média du brouillon détache sa liaison sans archiver son
  `media_files`. Son nettoyage est une tâche serveur future,
  **reference-aware**, qui devra vérifier toutes les références actives : ce ne
  sera pas un archivage aveugle des UUID retirés.

### Intentions non financières

- demande de location ;
- demande de service ou de place ;
- participation à un achat groupé ;
- les dates de location entièrement passées et les campagnes collectives
  expirées sont refusées côté interface **et** côté RPC ;
- ouverture de la conversation vendeur dans la Messagerie canonique.

## Frontières de sécurité

- aucun paiement, commande, remboursement, versement ou ledger n’est simulé
  comme réel ;
- aucun changement de grade ou de badge n’est accepté depuis le client ;
- aucun statut `published` n'est accordé au brouillon par le navigateur ;
- aucune URL signée de média privé n'est persistée dans `localStorage` ;
- aucune table ou RPC Rooms n'est modifiée ;
- les mocks investisseur ne sont disponibles qu’en preview locale explicite ;
- la migration n’a pas été déployée sur le Supabase partagé. Un `db push` exige
  la validation Web/iOS sur un environnement staging.

## Vérification

La validation finale doit inclure :

```bash
npm run typecheck
npm run lint
npm run test:unit
node --test tests/market/*.test.mjs
npm run build
git diff --check
```

Le test pgTAP se trouve dans
`supabase/tests/database/011_marketplace_catalog_foundation_v1.test.sql`.
Son plan contient exactement **107 assertions**. La migration est validée par
le parseur PostgreSQL `pglast`, mais le plan pgTAP ne peut pas être exécuté dans
cet environnement sans PostgreSQL/Supabase local.

## Étape suivante, volontairement séparée

La Phase B devra créer une transition serveur contrôlée
`draft → pending_review → published`, publier les médias associés, puis ajouter
les devis, commandes, paiements, remboursements et versements. Ces opérations
doivent rester côté serveur et faire l’objet d’un contrat Web/iOS commun avant
tout déploiement distant.
