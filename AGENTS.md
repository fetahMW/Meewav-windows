# Meewav Windows — consignes du dépôt

- Le dépôt Windows est autonome : le shell Electron et le frontend React partagé sont versionnés ensemble. `origin` est le dépôt Windows ; `upstream` est le dépôt Web utilisé pour comparer ou intégrer sélectivement les changements communs.
- Travailler sur une branche `codex/<sujet>` et préserver l'état local. Ne pas modifier les dépôts Web, Android, iOS ou Globe pour une tâche Windows sans demande explicite.
- Ne pas importer en bloc des répertoires de travail d'autres plateformes. Intégrer les changements utiles par composants, avec leur provenance et leurs dépendances. Ne jamais versionner les fichiers `.env*`, les clés, les caches, les builds, les captures ou les profils Electron locaux.
- Lancer l'application avec `npm run desktop:dev` depuis cette racine. Le port par défaut est 5197. Vérifier le build et les tests touchés avant publication. La vérification visuelle du bureau doit porter sur le rendu Electron réel ; un build seul ne prouve pas l'alignement de l'interface.
- Garder les libellés, les états clavier, actif et désactivé, ainsi que les petites tailles de fenêtre utilisables lors des retouches d'interface.
