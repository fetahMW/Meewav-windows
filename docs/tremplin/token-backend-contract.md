# Tremplin — contrat backend avant mise en production

L’interface Tremplin actuelle est une maquette fonctionnelle alimentée par des données fictives. Les helpers de `tremplinTokenData.ts` produisent uniquement des estimations d’affichage (`quoteOnly: true`). Ils ne doivent jamais devenir la source d’autorité d’une transaction réelle.

## Frontière de confiance

Le client peut transmettre uniquement :

- l’identifiant stable de l’artiste ;
- le type d’opération (`purchase` ou `resale`) ;
- le montant en euros pour un achat, ou la quantité de jetons pour une revente ;
- la version de quote affichée ;
- une clé d’idempotence unique.

Le client ne doit jamais imposer le prix final, la quantité exécutée, les frais, la répartition, le montant net, le statut KYC, la sortie rapide ou la part détenue.

## API minimale

### `POST /api/tremplin/quotes`

Crée une estimation courte durée après contrôle de l’identité, de la courbe active, du solde et de la limite de détention.

### `POST /api/tremplin/orders`

Exécute une quote encore valide. Requiert un en-tête `Idempotency-Key`. Une même clé avec le même corps doit retourner le même résultat ; avec un corps différent, elle doit être rejetée.

### `GET /api/tremplin/orders/:id`

Retourne l’état autoritaire : `pending`, `confirmed`, `failed`, `cancelled`, `refunded` ou `blocked-for-verification`.

### `GET /api/tremplin/positions`

Retourne les quantités détenues, montants initiaux, valeurs estimées et parts calculées depuis le registre serveur.

## Transaction atomique obligatoire

Dans une même transaction de base de données :

1. verrouiller la courbe et la position concernées ;
2. relire KYC, suspension, solde et quantité détenue ;
3. recalculer prix, frais et répartition avec une arithmétique décimale ;
4. vérifier la limite finale de 5 % et l’absence de vente à découvert ;
5. enregistrer ordre, mouvements du registre, frais et nouvelle offre en circulation ;
6. produire un reçu et un événement d’audit ;
7. valider une seule fois la transaction.

Les écritures monétaires utilisent des entiers en centimes ou un type décimal explicite. Les quantités de jetons utilisent une précision fixe documentée. Les nombres flottants JavaScript sont interdits dans le registre financier.

## Contrôles requis

- KYC vérifié côté serveur avant achat et revente ;
- limite de 5 % recalculée sur la position finale ;
- sortie rapide déterminée avec l’horodatage serveur ;
- contrôle de fréquence et anti-automatisation ;
- détection de comptes liés et d’achats coordonnés ;
- protection contre doubles paiements et rejeu ;
- paramètres de frais et de courbe versionnés ;
- suspension globale, par artiste et par compte ;
- journal d’audit immuable ;
- reprise contrôlée des opérations en attente ;
- alertes sur fraude, anomalies, remboursements et incidents.

## Administration et reporting

Les frais d’achat, de revente, de sortie rapide, techniques, la part artiste et la réserve doivent venir d’une configuration administrable, datée et versionnée. Le reporting interne doit distinguer volume, commissions, artistes et utilisateurs actifs, opérations bloquées, anomalies, remboursements et incidents.

## Intégration frontend

`TremplinTokenFlow` doit recevoir le KYC depuis la session serveur, demander une quote, afficher le récapitulatif, puis envoyer l’ordre avec une clé d’idempotence. L’étape de confirmation ne doit s’afficher qu’après acceptation de l’ordre par l’API. `Mes artistes`, l’historique et le tableau de bord doivent ensuite être invalidés et rechargés depuis les endpoints autoritaires.

Avant ouverture au public, ce contrat et le vocabulaire commercial doivent être validés par écrit sur les plans juridique, réglementaire, paiement, conservation et KYC.
