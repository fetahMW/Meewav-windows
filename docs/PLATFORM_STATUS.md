# État canonique de Meewav Web

Dernière consolidation : 1er août 2026.

`main` est la seule source de vérité pour la plateforme intégrée. Les branches de travail sont réservées aux trois chantiers encore ouverts :

- `task/tremplin` : finitions du Tremplin ;
- `task/shorts` : finitions des Shorts et raccordement des données réelles ;
- `task/rooms` : construction du produit Rooms à partir du support visuel existant.

Toute nouvelle branche doit partir de `main`. Une branche fusionnée doit être supprimée du dépôt distant.

## Fonctionnalités intégrées

### Authentification

- parcours d'inscription et de connexion ;
- reprise OAuth et récupération de compte ;
- onboarding de la scène musicale relié au Globe et au Profil ;
- aperçu local explicite en développement, y compris depuis un appareil du réseau privé.

### Globe

- navigation cartographique France, régions, métropoles, villes et subdivisions prises en charge ;
- recherche géographique et arrivée depuis l'onboarding ;
- avatars, pré-profils, filtres métiers et navigation vers le profil public ;
- services d'avatars et tuiles vectorielles compatibles avec un serveur local ou une machine du réseau.

### Profil

- profil propriétaire/public relié à Supabase, médias, visibilité, grades et statistiques ;
- espaces cadeaux, activité et signaux de progression ;
- classement territorial par ville, département, région et France ;
- panneau de classement sur l'accueil et dans les statistiques, avec périodes et évolution.

### Marketplace

- univers Neuf, Occasion, Location, Services et Achat groupé ;
- recherche, filtres, favoris, panier et parcours de publication ;
- fiches détaillées et retour vers l'annonce d'origine ;
- prise de contact avec le vendeur directement dans la Messagerie.

### Messagerie

- conversations, collaborations, groupes d'artistes et projets musicaux ;
- pièces jointes, audio, Track Packs, briefs, membres, planning, votes, stems et tâches ;
- contrôleurs Supabase et isolation des conversations ;
- conservation de l'onglet actif lors du passage à un autre groupe ou projet ;
- demandes issues du Globe, du Market et des Shorts.

### Golden Like

- état quotidien et attribution via RPC Supabase ;
- quota global fondé sur la journée de Paris ;
- confirmation et retour utilisateur dans les Shorts ;
- migrations et tests de contrat présents dans le dépôt.

### Shorts

- page vidéo, catalogue, recherche, filtres et murs de découverte ;
- réactions, commentaires, partage et suivi ;
- Golden Like et demande de collaboration vers la Messagerie ;
- comportement de démonstration local lorsque les contenus statiques ne portent pas encore d'identifiant de profil Supabase.

### Tremplin

- accueil éditorial, rails de découverte et Top 10 hebdomadaire ;
- profils immersifs, périodes, tendances et parcours pédagogique ;
- présentation du jeton MW, garde-fous, achat/revente simulés et historique ;
- catalogue de talents et navigation complète ;
- finitions produit encore prévues dans `task/tremplin`.

### Rooms

- route, navigation et support visuel intégrés ;
- produit fonctionnel volontairement non simulé : le développement continue dans `task/rooms`.

## Backend et déploiement

Les migrations Supabase versionnent notamment la Messagerie, les réactions Shorts, le Golden Like et les classements géographiques du Profil. Leur présence dans Git ne signifie pas qu'elles ont déjà été appliquées à l'environnement distant.

Avant une mise en production :

1. appliquer les migrations Supabase dans l'ordre ;
2. exécuter les tests pgTAP lorsque Supabase CLI et Docker sont disponibles ;
3. renseigner les variables Vite/Supabase à partir de `.env.example` ;
4. vérifier les contenus Shorts réels avec des UUID de profil canoniques.

## Validation de la branche principale

```bash
npm run typecheck
npm run test:unit
node --test tests/messaging/*.test.mjs tests/market/*.test.mjs tests/tremplin/*.test.mjs tests/navigation/*.test.mjs
npm run build
```

État de la consolidation : 518 tests unitaires et 141 tests structurels réussis, typage TypeScript et build de production réussis. Les tests SQL pgTAP sont versionnés mais nécessitent un environnement Supabase local pour être exécutés.
