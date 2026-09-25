# Checkpoint de l'Architecture Globe Web & Serveur MVT (15 Juin 2026)

Ce document acte l'état verrouillé et validé de la transition vers l'architecture de tuiles vectorielles (MVT) pour le Globe Meewav-Web, avant la mise en service sur le VPS.

---

## 🟢 1. État Validé du Front-End

* **Build Vite Production :** Réussi et opérationnel (`npm run build` compilé sans erreur).
* **Robustesse TS :** Le fichier `avatarLayers.ts` ne remonte pas d'erreur TypeScript.
* **Typage hors-périmètre :** Des erreurs TypeScript hors périmètre existent encore dans d'autres fichiers (comme `GlobeMapV2.tsx`) et devront être traitées dans une phase séparée.
* **Isolation :** Le stress-test de 50 000 points reste strictement exclu du flux de production normal.
* **Avatars V4 Premium :** Les 33 avatars PNG du dossier public `/images/V4/` sont confirmés à des résolutions haute définition supérieures à `1024×1024 px` (au-dessus du minimum de `512×512 px`). Ils sont chargés séparément par le navigateur pour garantir une netteté absolue sur écran Retina/4K.

---

## ⚙️ 2. Double Mode d'Architecture Configurable

L'architecture est entièrement pilotable depuis les variables d'environnement Vite :

```env
# Configuration dans .env et .env.local
VITE_USE_VECTOR_TILE_SERVER=false
VITE_MVT_TILE_URL=http://localhost:5000/musicians_clustered/{z}/{x}/{y}
```

### Mode Fallback GeoJSON Local (`VITE_USE_VECTOR_TILE_SERVER=false`)
* **Fonctionnement :** MapLibre charge le jeu de données local propre et nettoyé de **25 points sur Paris** depuis `/map/meewav-users.geojson`.
* **Utilité :** Sert de démonstration et de secours stable si le serveur de tuiles ou le VPS distant est inaccessible.

### Mode MVT Local (`VITE_USE_VECTOR_TILE_SERVER=true`)
* **Fonctionnement :** MapLibre s'abonne à la source vectorielle dynamique pointant vers le serveur de tuiles et gère le clustering à l'écran.
* **Requêtes :** Le navigateur émet des requêtes réseau visibles dans DevTools vers `http://localhost:5000/musicians_clustered/{z}/{x}/{y}`.

---

## 🖥️ 3. Serveur MVT Local Prêt à Déployer (`server/mvt-tile-server/`)

Un répertoire autonome et packagé a été constitué dans `server/mvt-tile-server/` pour être copié sur le VPS.

### Routes Disponibles :
* `GET /health` : Diagnostic général et état de santé de la connexion SQL.
* `GET /api/musicians_api` : API JSON parallèle renvoyant la liste des musiciens.
* `GET /musicians_clustered/:z/:x/:y` : Rendu des tuiles vectorielles binaires compressées.

### Preuve d'Intégrité Binaire (Décodage MVT de 118 octets) :
L'exécution de `debug-mvt.js` prouve l'exactitude de la structure de notre tuile `16/33193/22545` :
* **Layer trouvé :** `musicians` (strictement identique au contrat d'affichage).
* **Géométrie :** `Point`.
* **Propriétés de Feature présentes :**
  ```json
  {
    "id": "fa303bd9-fd3d-41fa-b78f-0b704ca7ba08",
    "musician_id": "fa303bd9-fd3d-41fa-b78f-0b704ca7ba08",
    "instrument": "pianiste"
  }
  ```

---

## ☁️ 4. Statut Actuel du VPS (`72.62.29.123`)

* **Port 22 (SSH) :** Ouvert, mais connexion root refusée par authentification par clé/mot de passe.
* **Port 5000 (MVT Server) :** Ouvert, mais la route distante est en panne ou instable (`curl: (56) Recv failure: Connection was reset`), retournant un fichier vide et aucun en-tête. Le serveur distant actuel n'est donc pas fonctionnel.

---

## ⏭️ 5. Prochaine Étape de Déploiement

1. **Accès SSH :** Récupérer l'accès SSH `root` ou d'administration auprès du propriétaire du VPS `72.62.29.123`.
2. **Copie des sources :** Transférer le répertoire `server/mvt-tile-server/` vers `/opt/meewav-mvt-server/` du VPS.
3. **Exécution des requêtes d'initialisation :** Lancer le script d'initialisation SQL `init.sql` pour configurer l'extension PostGIS, la table `musicians` et les index spatiaux.
4. **Supervision :** Lancer et superviser l'application sur le port `5000` via PM2.
