# Meewav MVT Server - VPS Deployment Guide

Ce dossier contient un serveur de tuiles vectorielles (MVT) léger et ultra-performant, écrit en **Node.js (Express)** et s'appuyant directement sur **PostgreSQL / PostGIS** via les fonctions natives `ST_AsMVT` et `ST_AsMVTGeom`.

---

## Architecture de la Stack

* **Port d'écoute :** `5000` (exposé publiquement ou derrière un reverse-proxy Nginx/Caddy)
* **Routes exposées :**
  1. `GET /health` : Diagnostic de santé (vérification du serveur et de sa liaison SQL).
  2. `GET /api/musicians_api` : API JSON parallèle renvoyant la liste à plat des musiciens.
  3. `GET /musicians_clustered/:z/:x/:y` : Flux MVT (Mapbox Vector Tile) renvoyant des tuiles binaires compressées contenant la couche géométrique `musicians`.
* **Couche de données :** PostgreSQL avec extensions `postgis` et `pgcrypto`. Les requêtes spatiales sont optimisées pour utiliser l'index spatial GiST (WGS84 SRID 4326).

---

## 🚀 Guide de Déploiement VPS (Pas-à-Pas)

Dès que l'accès root ou SSH est rétabli sur le VPS (`72.62.29.123`), suivez ces instructions pour déployer proprement la stack.

### Étape 1 : Connexion au VPS
Connectez-vous via SSH en tant que root :
```bash
ssh root@72.62.29.123
```

### Étape 2 : Installation des Dépendances Système (Node.js & Postgres)
Si Node.js n'est pas encore installé sur la machine :
```bash
# Mise à jour système et installation de curl/git/build-essential
apt update && apt upgrade -y
apt install -y curl git build-essential lsof

# Installation de Node.js v20 (LTS recommandée)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
```

### Étape 3 : Copier le projet sur le VPS
Vous pouvez copier ce dossier directement depuis votre machine locale vers le VPS en utilisant `scp` ou `rsync` :
```bash
# Exécuter depuis votre machine locale (Meewav-Web/server) :
scp -r ./mvt-tile-server root@72.62.29.123:/opt/meewav-mvt-server
```
Ou cloner le dépôt git directement sur le VPS si le dépôt est synchronisé.

### Étape 4 : Configuration de la Base de Données
Si vous utilisez l'instance PostgreSQL locale du VPS :
```bash
# Installer Postgres + PostGIS
apt install -y postgresql postgresql-contrib postgis

# Se connecter à Postgres pour créer la base et le mot de passe
su - postgres -c "psql"
```
Dans l'interface PostgreSQL, exécutez le script d'initialisation :
```sql
CREATE DATABASE meewav;
CREATE USER meewav_user WITH ENCRYPTED PASSWORD 'VOTRE_MOT_DE_PASSE_SECURISE';
GRANT ALL PRIVILEGES ON DATABASE meewav TO meewav_user;
\c meewav;
-- Exécuter ensuite le contenu du fichier init.sql
```
*(Alternative : si le serveur se connecte directement à l'instance distante Supabase `dqabekaqpznjsagoxzwc`, assurez-vous de charger `init.sql` dans l'éditeur de requêtes SQL Supabase).*

### Étape 5 : Installer les packages Node.js et configurer l'environnement
Sur le VPS, dans le dossier `/opt/meewav-mvt-server` :
```bash
cd /opt/meewav-mvt-server
npm install --omit=dev
```
Créez un fichier `.env` :
```bash
nano .env
```
Ajoutez les variables suivantes en remplaçant par vos identifiants réels :
```env
PORT=5000
DATABASE_URL=postgresql://postgres.dqabekaqpznjsagoxzwc:[PASSWORD]@aws-1-eu-west-1.pooler.supabase.com:5432/postgres
```

---

## 🛠️ Gestion du Service sur le VPS

Pour garantir que le serveur tourne en arrière-plan, redémarre automatiquement en cas de crash ou après un reboot de la machine, deux méthodes sont disponibles.

### Option A : Déploiement via PM2 (Recommandé - Simple & Robuste)
```bash
# Installer PM2 globalement
npm install -g pm2

# Lancer l'application sous PM2
pm2 start index.js --name "meewav-mvt-server"

# Configurer PM2 pour redémarrer au boot du VPS
pm2 startup
# (Copier-coller la ligne générée par la commande précédente pour valider le service systemd)

# Sauvegarder la configuration actuelle
pm2 save
```

### Option B : Déploiement via Systemd Service (Standard Linux)
Créez le fichier de service :
```bash
nano /etc/systemd/system/meewav-mvt-server.service
```
Collez la configuration suivante :
```ini
[Unit]
Description=Meewav MVT Express Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/meewav-mvt-server
ExecStart=/usr/bin/node index.js
Restart=on-failure
Environment=PORT=5000
Environment=DATABASE_URL=postgresql://postgres.dqabekaqpznjsagoxzwc:[PASSWORD]@aws-1-eu-west-1.pooler.supabase.com:5432/postgres

[Install]
WantedBy=multi-user.target
```
Enregistrez et activez le service :
```bash
systemctl daemon-reload
systemctl enable meewav-mvt-server
systemctl start meewav-mvt-server
```

---

## 🔍 Commandes Utiles de Diagnostic VPS

Une fois connecté en SSH, voici les commandes clés pour inspecter le serveur :

### 1. Vérification des processus système
```bash
# Voir si le port 5000 est en écoute active
ss -tulpn | grep :5000

# Trouver quel processus précis occupe le port 5000
lsof -i :5000

# Voir les conteneurs Docker actifs si la stack utilise Docker
docker ps -a
```

### 2. Monitoring via PM2 (si Option A choisie)
```bash
# Lister le statut des applications supervisées
pm2 ls

# Afficher les logs PM2 en temps réel
pm2 logs meewav-mvt-server

# Redémarrer l'application
pm2 restart meewav-mvt-server
```

### 3. Monitoring via Systemd (si Option B choisie)
```bash
# Vérifier si le service tourne et n'a pas crashé
systemctl status meewav-mvt-server

# Lire les 100 dernières lignes de logs système sans pagination
journalctl -u meewav-mvt-server -n 100 --no-pager

# Suivre les logs en direct
journalctl -u meewav-mvt-server -f
```

---

## 🧪 Scripts de Test Intégrés

Une fois déployé, exécutez le script de diagnostic local pour valider le fonctionnement :
* **Sur Linux / VPS :** `./test-local.sh`
* **Sur Windows (Local) :** `.\test-local.ps1`
