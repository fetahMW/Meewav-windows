# Meewav Windows

Application de bureau Windows de Meewav. Le shell Electron est dans [`apps/meewav-studio`](apps/meewav-studio/) et charge l'application React partagée dans [`src`](src/). Les écrans Globe, Messagerie, Rooms, La Scène, Profil, Marketplace et Tremplin font partie du même frontend ; copier seulement le dossier Electron ne suffit pas à lancer l'application.

## Démarrer sur Windows

Prévoir Node.js et npm, puis exécuter depuis la racine du dépôt :

```powershell
npm ci
npm ci --prefix apps/meewav-studio
npm ci --prefix vendor/globe-vinyle
npm run desktop:dev
```

Le serveur local écoute par défaut sur `127.0.0.1:5197` et ouvre Electron. `MEEWAV_DESKTOP_DEV_PORT` permet de choisir un autre port. Le profil Electron de développement reste `Meewav Studio Dev` pour conserver la session locale existante. Les variables d'environnement nécessaires aux services distants doivent être configurées localement ; les fichiers `.env*` ne sont pas publiés.

Vérifications de base :

```powershell
npm run build
npm run typecheck
npm run test:unit
```

Le build Vite vérifie le frontend. `desktop:dev` est un mode de développement et ne produit pas encore d'installateur Windows. Voir le [guide desktop](apps/meewav-studio/README.md) et le [parcours de validation](apps/meewav-studio/DESKTOP-VALIDATION.md).

## Provenance et dépôts

Ce dépôt a été initialisé à partir de `fetahMW/Meewav-Web` au commit `8592d00c8326ccf9591b0c2b09ede760930b8ae7`, puis complété avec les sources locales en cours pour le bureau Windows. Le détail est dans [SOURCE-PROVENANCE.md](SOURCE-PROVENANCE.md). `origin` pointe vers `fetahMW/Meewav-windows` et `upstream` vers `fetahMW/Meewav-Web` pour comparer les évolutions communes.

Les dépôts Android, iOS et Globe gardent leur propre cycle. Les ressources communes déjà présentes dans ce frontend restent ici ; leurs projets natifs, leurs caches, leurs captures, leurs fichiers locaux et leurs secrets ne sont pas copiés dans Windows.
