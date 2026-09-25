# Environnements et releases Supabase Meewav

## Règle simple pour l'équipe

- **Local** : je peux casser et réinitialiser.
- **Staging** : Web et iOS vérifient ensemble.
- **Production** : personne ne teste ni ne pousse à la main.

Web et iOS partagent le même backend de production à terme. Ils ne partagent
pas la base locale de chaque développeur et ne développent pas directement sur
la production.

## Variables attendues

Chaque client possède des valeurs différentes par environnement, jamais
commitées avec de vrais secrets :

| Variable logique | Web | iOS |
| --- | --- | --- |
| URL Supabase | `VITE_SUPABASE_URL` | configuration `.xcconfig` |
| clé publique | `VITE_SUPABASE_ANON_KEY` | configuration `.xcconfig` |
| environnement | `VITE_MEEWAV_ENV` | `MEEWAV_ENV` |
| contrat attendu | `VITE_MEEWAV_CONTRACT_VERSION` | `MEEWAV_CONTRACT_VERSION` |

Une clé `service_role` est réservée aux environnements serveur/CI secrets. Elle
n'est jamais présente dans un `.env` de frontend ou une application mobile.

## Workflow quotidien

1. Le développeur synchronise sa branche Git.
2. Il lance Supabase localement.
3. Il applique les migrations depuis zéro et charge des fixtures.
4. Il exécute les tests SQL et applicatifs.
5. Il ouvre une PR sans pousser la base partagée.
6. La CI crée ou cible un preview/staging et rejoue les migrations.
7. Web et iOS valident la même version de contrat.
8. Seul le pipeline de promotion applique en production.

## Garde-fous obligatoires

- comparer `supabase migration list --linked` avant toute promotion ;
- exécuter `supabase db push --dry-run` et conserver la sortie dans la release ;
- refuser une cible production sans approbation explicite ;
- interdire `supabase db reset --linked` sur staging partagé et production ;
- sauvegarder/valider les plans de migration de données ;
- appliquer les migrations additives avant de retirer un ancien contrat ;
- garder au moins une release de compatibilité client ;
- mesurer les erreurs Auth/RPC/RLS après déploiement.

## Stratégie expand/contract

Une modification cross-client se fait en deux temps.

### Expand

- ajouter table, colonne, vue ou RPC v1 ;
- maintenir temporairement l'ancien chemin ;
- migrer Web et iOS ;
- mesurer l'utilisation résiduelle legacy.

### Contract

- bloquer les nouveaux appels legacy ;
- retirer les grants/policies risqués ;
- supprimer l'ancien code après preuve d'absence d'utilisation ;
- ne supprimer physiquement une colonne qu'au cours d'une release ultérieure.

Cette stratégie empêche qu'une nouvelle version Web casse l'iOS encore installé
sur les appareils.

## Matrice de promotion

| Vérification | Local | Staging | Production |
| --- | ---: | ---: | ---: |
| migrations depuis zéro | oui | oui | non destructif |
| pgTAP RLS | oui | oui | smoke tests |
| Web build/tests | oui | oui | artefact signé |
| iOS tests | oui | oui | build signé |
| deux comptes concurrents | conseillé | obligatoire | smoke limité |
| données synthétiques | oui | oui | interdit |
| service role dans un client | interdit | interdit | interdit |

## État actuel

- Le projet distant connu est **Meewav Dev**.
- Son historique distant s'arrête avant les migrations fondation locales de
  juillet 2026.
- Les migrations fondation locales ne sont donc pas encore un contrat déployé.
- Un `db push` global est bloqué jusqu'à adaptation coordonnée du client iOS et
  résolution des accès legacy du Globe.
- Aucune action distante destructive ou de migration n'est autorisée dans ce
  chantier de préparation.
