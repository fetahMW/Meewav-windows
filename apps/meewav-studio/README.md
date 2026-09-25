# Meewav Desktop — développement local

**Le parcours ci-dessous décrit le prototype historique, désormais isolé.** L’application démarre maintenant sur Meewav lui-même, avec le même `App.tsx`, les mêmes routes, services et backend. La route `/studio` a été retirée ; son code est conservé. Le profil local historique est gardé pour préserver la session.

Commande actuelle depuis `Meewav-Windows` : **`npm run desktop:dev`**. Le serveur local écoute sur `127.0.0.1:5197` par défaut. Le raccourci du bureau peut être recréé depuis ce dépôt avec `install-desktop-shortcut.ps1`; il utilise l’icône native Android. Les capacités de production apparaissent dans la Room host.

Voir [DESKTOP-VALIDATION.md](./DESKTOP-VALIDATION.md) pour le parcours actuel, les limites et les vérifications à effectuer.

## Archive : prototype séparé initial

Depuis la racine du dépôt :

```powershell
npm install
npm install --prefix apps/meewav-studio
npm run studio:dev
```

Ce lancement démarre Vite sur `127.0.0.1:5197` puis ouvre une fenêtre Electron dédiée. Le profil local est `Meewav Studio Dev` dans le répertoire de données des applications du système. Aucun paquet installable ni déploiement n’est produit par cette commande.

Le raccourci **Meewav Studio** du bureau ouvre ce même parcours sans console visible. Pour le recréer, exécuter `powershell -NoProfile -File apps/meewav-studio/install-desktop-shortcut.ps1` depuis la racine Web.

Le logo et l'icône sont les ressources natives Android `meewav_logo.xml` et `ic_launcher.xml`, exportées sans changer leurs tracés ni leurs couleurs. `sync-android-branding.mjs` permet de régénérer les SVG et l'ICO Windows depuis le dépôt Android voisin ; `assets/provenance.json` conserve les empreintes des sources. Aucune nouvelle identité graphique n'est introduite.

Le parcours du prototype utilise l’authentification Meewav existante, la Green Room existante pour les vérifications privées, puis une capture locale dans la régie. Le bouton **Publier le test** demande un jeton par le contrat `livekit-token` existant pour une Room QA `live` où le compte est host. La caméra et le micro ne sont pas connectés à LiveKit pendant l’aperçu privé. **Tout arrêter** déconnecte le transport et libère les deux pistes.

La Room QA est créée et terminée séparément au moyen des API existantes. Cette application ne crée ni ne termine de Room. Le séquenceur Web actuel et le code host restent dans `src/features/rooms` et ne sont pas copiés ici. Le raccordement de ce parcours à la régie complète et la validation Android/macOS appartiennent aux lots suivants.

Le shell Electron et l’interface React sont communs à Windows et macOS. Avant une livraison macOS, il faudra ajouter les déclarations de permissions caméra/micro à l’application signée, vérifier le dialogue système macOS, l’architecture de packaging et les périphériques audio réels.
