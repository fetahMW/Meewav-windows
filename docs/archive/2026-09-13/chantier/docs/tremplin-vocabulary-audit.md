# Audit du vocabulaire du Tremplin

Date : 5 août 2026

## Périmètre relu

- Accueil
- Découvrir
- Comment ça marche
- Mes artistes
- Profil public d’un artiste
- Achat et revente
- Demande et tableau de bord artiste

## Problème constaté

L’interface mélangeait trois notions sous un même nom : « Soutien MW » désignait tour à tour une intention humaine, un espace produit et une opération financière. Des actions telles que « Ouvre Soutien MW » ou « Simuler un soutien » n’indiquaient ni ce que l’utilisateur allait consulter ni ce qu’il allait acheter.

Le terme « MW » reste utile dans la marque, les symboles, les identifiants et les routes techniques. Employé seul dans un CTA grand public, il demande cependant à l’utilisateur de connaître le vocabulaire interne de MeeWav.

## Dictionnaire retenu

| Niveau | Vocabulaire public | Usage |
| --- | --- | --- |
| Intention humaine | Donner de la force à son projet | Titre éditorial, introduction, message relationnel |
| Objet | Jeton de talent / jetons de talent | Navigation, statut, profil, explication, espace de détention |
| Transaction | Acheter / revendre des jetons | Montant, récapitulatif, confirmation, historique, reçu |
| Relation gratuite | Suivre gratuitement | Suivi d’un artiste et accès à son actualité |

## Règles d’écriture

1. « Donner de la force » ne doit jamais être le seul libellé d’un bouton financier.
2. « Soutenir » ne doit pas masquer un achat. Le verbe réel est alors « acheter ».
3. Le bouton final nomme la quantité et le montant de l’opération.
4. Un statut non actif ne montre ni prix ni CTA d’achat.
5. « Jeton de talent » désigne l’objet ; le mot « artiste » continue de désigner la personne.
6. Les termes internes comme `support`, `mw` et la route `/tremplin/soutien-mw` peuvent rester dans le code tant qu’ils ne sont pas exposés dans l’interface.

## Corrections par parcours

### Accueil

- « Ouvre Soutien MW » devient « Consulte son jeton de talent ».
- Le CTA actif devient « Voir son jeton de talent ».
- La recherche demande le nom de l’artiste ou le symbole de son jeton.
- La promesse émotionnelle « donner de la force » est accompagnée de la mention payante et facultative.

### Découvrir

- Le filtre public devient « Jeton de talent » avec les états « Avec un jeton actif » et « Sans jeton actif ».
- Les cartes artistiques restent centrées sur le projet ; la donnée financière n’est pas utilisée comme libellé éditorial.

### Comment ça marche

- « Le jeton MW » devient « Le jeton de talent ».
- « Simuler un soutien » devient « Simuler un achat ».
- « Montant du soutien » devient « Montant de l’achat ».
- Les détails parlent d’achat, de revente, de frais et de risques sans jargon de marque.

### Mes artistes

- « Soutiens MW » devient « Jetons de talent ».
- L’espace financier devient « Mes jetons de talent ».
- Le point d’entrée devient « Voir mes jetons ».
- Le fil artistique reste séparé des opérations.

### Profil artiste

- L’onglet « Soutien MW » devient « Jeton de talent ».
- Le titre émotionnel est « Donner de la force au projet de [artiste] ».
- Le sous-texte et les CTA précisent immédiatement qu’il s’agit d’acheter des jetons.

### Achat et revente

- « Effet estimé sur le prix » devient « Variation estimée du prix ».
- Le montant est choisi « dans les limites affichées », sans promettre une liberté incompatible avec un minimum ou un maximum.
- Les libellés finaux restent transactionnels et précis.

### Espace artiste

- « Demander mon jeton MW » devient « Demander mon jeton de talent ».
- Les mentions techniques « côté serveur » sont remplacées par une explication compréhensible du contrôle sécurisé.

## Termes à ne plus exposer

- Ouvre Soutien MW
- Soutiens MW
- Simuler un soutien
- Montant du soutien
- Soutenir davantage
- Gérer ma sortie
- Confirmer mon soutien
- Position, lorsqu’il s’agit des jetons détenus
- KYC vérifié côté serveur

## Invariants à tester

- Aucun CTA public ne contient « Soutien MW ».
- « Donner de la force » n’est jamais un bouton de confirmation financière.
- Les actions d’achat et de revente emploient leur verbe réel.
- « Suivre gratuitement » reste distinct d’« acheter des jetons ».
- Le prix apparaît uniquement pour un jeton actif.
