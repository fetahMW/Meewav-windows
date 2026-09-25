# La Wave — architecture de production V2

Ce document cartographie l’implémentation du dépôt sur la règle produit :

> Le maître de la Wave dirige. Le public valide. Le système exécute.

La Wave n’est pas un DAW. La V1 repose sur un cycle musical commun et sur des révisions rendues côté infrastructure. Aucun navigateur de viewer ne reconstruit le Beat à partir des stems.

L’implémentation Viewer, l’atelier privé, les raccordements V6 et leurs limites de déploiement sont décrits dans [WAVE_VIEWER_V6.md](WAVE_VIEWER_V6.md).

## Frontières audio

- **Music Program Bus** : une seule source musicale officielle, `SERVER_RENDER` (Beat collectif rendu) ou `HOST_DAW`.
- **Voice Bus** : microphone du host, traité séparément de la musique et mixé dans le master public.
- **Private Cue Bus** : préécoute host-only du Beat courant avec une candidate. Il ne rejoint jamais le master public.
- **Program Egress Adapter** : frontière transport-agnostic. WebRTC/SFU est le transport déjà présent ; LL-HLS ou une edge managée pourront être ajoutés derrière le même contrat après benchmark.

Le rendu V1 attendu est un `RevisionRenderEngine` : manifest immuable → rendu stéréo → validation → activation quantifiée. Le futur moteur temps réel devra respecter la même frontière.

## Source de vérité

La base durable porte les sessions, règles versionnées, références de production, soumissions, versions, assets, analyses, votes, révisions, pistes, horloge, activations, leases, crédits, consentements, modération et événements. Realtime est un accélérateur d’interface ; la reconnexion passe par un snapshot serveur et un curseur contigu.

Les migrations sont additives :

1. `20260822193000_wave_tools_lifecycle_v2.sql` : compatibilité de l’ancien agrégat Wave et machine de transition.
2. `20260822220000_wave_production_core_v3.sql` : domaine normalisé, votes, BeatRevision, programme audio, événements, RLS et RPC autoritaires.
3. `20260822224500_wave_asset_pipeline_v4.sql` : stockage privé, upload tickets, outbox worker et registre de dérivés.
4. `20260822232000_rooms_wave_livekit_host_v1.sql` : publication LiveKit du host Wave et révocation à la fermeture.
5. `20260822233000_wave_production_runtime_v5.sql` : horloge musicale, audition privée, activation différée, règles/références versionnées, slots/ledger, leases/outbox, confidentialité et finalisation.

## Assets

- `ORIGINAL` : immuable et privé.
- `PLAYBACK_DERIVATIVE` : dérivé technique canonique destiné au moteur.
- `PREVIEW_DERIVATIVE` : audition/vote, nivelée pour une comparaison équitable sans modifier l’original.
- `WAVEFORM` : peaks réels calculés par worker.
- `RENDER` : programme stéréo d’une BeatRevision.

Une `ProductionReference` rattache une référence studio sans perte (WAV/FLAC), une écoute légère, la BeatRevision, la RulesRevision et le cycle. Chaque contribution indique les révisions sur lesquelles elle a été composée.

## Vote et temps musical

Le host choisit humainement ce qui devient `READY_FOR_VOTE`. L’analyse technique n’effectue jamais ce choix.

Une manche verrouille candidate, version, BeatRevision de référence et preview entendu. Les ballots sont uniques par compte et manche, les résultats restent cachés et le quorum vient d’un snapshot d’électeurs éligibles. Un entrant tardif n’est éligible qu’après réception complète du preview.

Une victoire ne signifie pas que le son est déjà actif :

`VOTE_WON → PENDING_RENDER → READY_FOR_ACTIVATION → PENDING_ACTIVATION → ACTIVE`

L’activation tombe à une boundary sûre (mesure ou cycle). En cas de rendu, droit ou sécurité défaillant, l’ancien Beat continue. Il n’existe aucun veto artistique après une victoire ; seulement des blocages techniques/légaux audités.

## Sessions longues et clôture

Le cycle de vie distingue préparation, live actif, intermission, pause, vote de clôture, finalisation, fermeture et annulation. Une intermission n’est pas traitée comme une panne réseau. Le host choisit si les soumissions restent ouvertes.

Une clôture gagnée passe par `CLOSING/FINALIZING` avant `CLOSED` : nouvelles autorisations arrêtées, uploads déjà autorisés traités selon leur ticket, révision finale figée, rendu/contrôle/crédits/exports terminés, puis archivage immuable.

## Déploiement

Ordre obligatoire : migrations V2→V5, bucket privé et policies, quatre Edge Functions d’asset, fonction d’audition privée, worker audio isolé, coordinator/outbox worker, moteur de rendu, publisher média, puis frontend normalisé. Le healthcheck doit rester rouge tant que worker, moteur ou diffusion programme ne sont pas réellement configurés.

Variables client :

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_WAVE_INFRA_MODE=production`

Secrets serveur/Edge (jamais préfixés `VITE_`) : Supabase service role, stockage, URL/signature worker audio, LiveKit/SFU/TURN et configuration coordinator/region. Voir aussi `docs/backend/WAVE_ASSET_PIPELINE_V4.md`.

## Limites honnêtes du dépôt

Le dépôt fournit le domaine, les contrats, migrations, RLS, Edge gateways, publication host et UI des quatre outils. Il ne contient pas encore un binaire FFmpeg/AV isolé, un moteur de rendu collectif déployé, un coordinator 24/7, un publisher infrastructure ou une edge de diffusion mondiale. Les adapters refusent ces capacités en production lorsqu’elles sont absentes ; aucun Beat, upload traité ou basculement audio n’est déclaré réussi fictivement.

Avant ouverture réelle, exécuter migrations sur base vide et upgrade, tests RLS multi-rôles, votes concurrents, upload malformé/expiré, endurance 72 h, horloge/activation sample-accurate, cue privé non audible, bascule DAW/Beat sans double lecture, autoplay multi-navigateurs et charge media réelle.
