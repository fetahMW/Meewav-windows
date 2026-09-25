# Meewav — le produit

Meewav rassemble dans une application Web plusieurs expériences musicales : découvrir des artistes, échanger avec eux, consulter leurs créations et participer à des espaces en direct. Le problème auquel répond cette organisation est le passage entre découverte, identité, discussion et création sans perdre le contexte de la personne ou du contenu consulté.

Cette description porte sur les parcours et interfaces présents au commit `c771f379647cc24584d83b6edf39716928443743`. Elle ne constitue ni une stratégie commerciale ni une promesse sur l'exploitation des services distants.

## À qui s'adresse l'application

- Aux artistes et créateurs musicaux qui présentent leur activité, publient des contenus et cherchent des échanges ou des collaborations.
- À leur public, qui découvre des artistes, suit leurs contenus et participe aux expériences proposées.
- Aux personnes qui proposent ou recherchent du matériel et des services liés à la musique dans le Marketplace.

Ces usages se retrouvent dans les parcours d'[inscription](../src/pages/AuthPage.tsx), de [profil](../src/features/profile/ProfilePage.tsx), de [messagerie](../src/features/messaging/MessagingPage.tsx) et de [Marketplace](../src/features/market/MarketPage.tsx).

## Les espaces fonctionnels

Les noms ci-dessous décrivent l'application visible. Ils ne définissent pas les « six piliers officiels », dont la terminologie reste à établir séparément.

| Espace | Expérience proposée par l'interface | Relation avec les autres espaces |
|---|---|---|
| **Globe** | Explorer un environnement géographique en 3D et découvrir des représentations d'artistes. | La découverte mène à l'identité d'un artiste et aux autres espaces de l'application. Les données affichées peuvent inclure des démonstrations. |
| **Messagerie** | Consulter des conversations, échanger et gérer des demandes de collaboration. | Une conversation peut être ouverte depuis le contexte d'un profil, d'une annonce ou d'une rencontre. |
| **Rooms** | Accéder à des espaces en direct avec des interfaces d'hôte, d'invité et de spectateur. | Elles associent présence, échanges, outils de participation et médias. Leur fonctionnement distant dépend des services live. |
| **La Scène** | Parcourir et regarder des créations vidéo, notamment horizontales et verticales, retrouver leurs auteurs et accéder aux interfaces de création et de lecture. | Les contenus sont reliés au profil de leur auteur ; les parcours incluent aussi une présentation TV. Cela ne prouve pas une chaîne diffusée en production. |
| **Marketplace** | UX implémentée : parcourir des annonces de matériel et de services, préparer une annonce et un panier, puis contacter les personnes concernées. | Le contexte d'une annonce peut accompagner les échanges. L'activation nationale est prévue en **phase 2**, par choix de roadmap. |
| **Tremplin** | UX implémentée : découvrir des talents, consulter leurs projets et retrouver les artistes suivis. | L'identité de l'artiste relie projet, profil et créations. L'activation nationale est prévue en **phase 3**, par choix de roadmap. |

Sources de ces parcours : [navigation commune](../src/features/globe/components/MeewavPrimaryNav.tsx), [routes](../src/App.tsx), [Rooms](../src/features/rooms/RoomsPage.tsx), [La Scène](../src/features/shorts/ShortsPage.tsx), [Tremplin](../src/features/tremplin/TremplinPage.tsx), [paramètres Tremplin](../src/features/tremplin/tremplinFeatureFlags.ts), [Marketplace](../src/features/market/MarketPage.tsx).

### Les Rooms et La Scène ne désignent pas toutes le même parcours

L'accueil des Rooms distribue **La Place, La Loge, La Wave, La Cage, La Classe et La Scène**. Ce sont des destinations internes aux Rooms, avec une présentation et des outils adaptés. La Room appelée « La Scène » est distincte de l'espace de consultation des créations accessible par `/scene`.

Source : [destinations des Rooms](../src/features/rooms/roomDestinationRoute.ts) et [présentations des Rooms](../src/features/rooms/RoomsPage.tsx).

## Le rôle du profil

Le profil rassemble l'identité de l'utilisateur, sa présentation et ses contenus. L'application distingue une vue propriétaire et une vue visiteur. Il sert de point de passage entre découverte, créations et échanges ; son rôle ne se limite donc pas à une page isolée de la navigation.

Cette description fonctionnelle ne lui attribue pas un statut de pilier officiel. La visibilité effective des données et des actions dépend du parcours, de l'identité et du mode utilisé. Sources : [vue propriétaire](../src/features/profile/ProfilePage.tsx), [vue visiteur](../src/features/profile/ProfileViewerPage.tsx) et [accès aux données du profil](../src/features/profile/profile.service.ts).

## Comment les expériences se rejoignent

Une découverte peut conduire au profil d'un artiste, puis à ses créations ou à une discussion. Une annonce peut ouvrir une conversation avec son contexte. Une Room peut relier un participant à son profil ou à un échange. L'application conserve ainsi plusieurs points de passage autour d'une même identité.

Ces liens sont matérialisés par la [navigation de profil](../src/features/profile/profileArtistDeepLink.ts), les [routes de messagerie](../src/features/messaging/messaging.route.ts) et leurs appels dans le [Marketplace](../src/features/market/MarketPage.tsx) et les [Rooms](../src/features/rooms/RoomsPage.tsx). Leur présence ne remplace pas une vérification de chaque parcours entre comptes réels.

## Limites à garder visibles

La version du site est considérée comme stabilisée, mais les interfaces ne suffisent pas à établir quels services sont disponibles en production. Des modes de démonstration et des données locales coexistent avec des appels serveur. Les opérations financières simulées ne doivent pas être présentées comme des transactions réelles.

L'[architecture](architecture.md) précise les raccordements identifiables et leurs limites. La disponibilité des services distants et la validation complète des Rooms/lives restent à vérifier séparément. La non-activation du Marketplace et du Tremplin au lancement national relève d'une décision produit confirmée pour ce socle : leurs UX sont développées, leur activation suit les phases 2 et 3. Aucune date calendaire n'est fixée ici.
