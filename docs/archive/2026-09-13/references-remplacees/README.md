# Meewav Mock Data Pack

Ce pack crée la source de vérité Supabase pour les artistes mock.

## Fichiers

- `meewav_mock_artists_schema.sql` : table Supabase + indexes + views.
- `seed_meewav_mock_artists.js` : seed 50 000 artistes mock Paris / IDF.

## Règle produit

```txt
Paris 50K = 50 000 vraies lignes Supabase.
Un chiffre affiché doit venir d’un count réel.
Un leaf cluster N doit donner N avatars.
```

## Agents internes

Quand l'utilisateur demande `agent master`, `utilise l'agent master` ou `on travaille avec l'agent master`, charger et appliquer `agents/master.md`.
Cet agent sert de contrôleur qualité visuel : référence → screenshot actuel → analyse → corrections → nouvelle capture, jusqu'à validation.

## Usage

1. Lancer le SQL dans Supabase.
2. Installer le client JS :

```bash
npm i @supabase/supabase-js
```

3. Lancer le seed :

```bash
SUPABASE_URL="..." SUPABASE_SERVICE_ROLE_KEY="..." node seed_meewav_mock_artists.js
```

## Consigne Gemini

Le serveur MVT doit agréger `mock_artists`.
Il ne doit plus inventer de `display_count` décoratif.
