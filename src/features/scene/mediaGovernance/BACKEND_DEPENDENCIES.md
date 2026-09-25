# La Scène — droits, crédits et replay de Room

Ce dossier fournit des contrats TypeScript et des validations pures pour les
trois usages de média suivants :

- publication VOD dans La Scène (`sceneVod`) ;
- diffusion linéaire dans MeeWav TV (`tvLinear`) ;
- génération d'extraits (`clipGeneration`).

Un `MediaRightsGrant` ne couvre qu'un seul usage. Une autorisation VOD ne vaut
donc jamais autorisation TV ou autorisation de créer un extrait. Les crédits
musicaux restent eux aussi distincts des droits : citer une personne ne prouve
pas son consentement, et un contrat de diffusion ne crée pas automatiquement
un crédit public.

## Ce qui est réellement implémenté ici

- modèles typés des autorisations, crédits et contrats de replay ;
- vérification de l'usage, du territoire, de la période, de la révocation et de
  la présence d'une référence de preuve ;
- validation des crédits attachés au bon asset ;
- preflight de publication d'un replay après la fin d'une Room ;
- consentement explicite de chaque participant capturé pour chaque usage ;
- tests démontrant que VOD, TV et clips ne s'autorisent pas mutuellement.

Le preflight est sans effet de bord : il ne publie rien, ne programme rien et
ne modifie aucun droit.

## Dépendances backend encore nécessaires

Avant une production réelle, le serveur doit rester l'unique source de vérité
et fournir :

1. l'identité, les rôles et l'autorisation d'agir du signataire ;
2. une persistence versionnée et immuable des grants et contrats ;
3. une signature électronique et un coffre de preuves auditable ;
4. la vérification juridique des ayants droit et des mandats ;
5. des territoires normalisés et la décision de géorestriction côté serveur ;
6. la liste fiable des personnes effectivement capturées dans une Room ;
7. l'état serveur de la Room, de l'enregistrement et du transcodage ;
8. une révocation/takedown propagée vers la VOD, la TV, les clips, le cache et
   les CDN ;
9. une barrière de programmation TV qui revalide les droits au moment de la
   mise à l'antenne ;
10. un job de génération de clip qui revalide son grant avant traitement ;
11. un journal d'audit, des opérations idempotentes et une transaction évitant
    la publication pendant une révocation concurrente ;
12. la persistence des crédits et, si le produit le retient, les identifiants
    professionnels normalisés ;
13. les notifications, demandes de correction, retraits et recours.

Aucune table Supabase, migration, route API, signature ou décision juridique
n'est inventée dans ce socle. Les fonctions doivent être réutilisées comme
prévalidation frontend et portées côté serveur au moment où ces dépendances
sont effectivement définies.
