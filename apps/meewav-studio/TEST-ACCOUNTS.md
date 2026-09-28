# Comptes de test locaux — Windows

Le pont Electron peut connecter les comptes dédiés `windows` / `redmi` avec leur
nom court. Il lit exclusivement `qa-test-accounts.json` dans son dossier userData.
Ce fichier est provisionné séparément, ne fait pas partie du dépôt ni du paquet
distribué. Sans fichier valide, la connexion classique reste inchangée.

Le provisioner commun se trouve dans le dépôt Android :
`scripts/test-accounts/provision.mjs`, puis `scripts/test-accounts/install-local.mjs`.
Il crée de vrais comptes Supabase, complète leurs profils et contrôle leur
recherche mutuelle avant de produire une configuration activable. Le compte
personnel `puf` du S22 est conservé. Les secrets générés restent dans son dossier
`app/build/test-accounts/`, ignoré par Git.

En mode test local, l’application démarre sur l’authentification réelle, en mode
Live. Saisir `windows`, puis **Se connecter**. Le mot de passe reste dans le
processus principal ; React reçoit seulement une session Supabase authentifiée.
Le projet et l’identité retournée doivent correspondre à la configuration locale.
Une erreur réseau n’ouvre jamais de session simulée. Les permissions et la logique
backend restent celles du compte. Le navigateur Web ne dispose pas de ce pont.

Supprimer le fichier local puis relancer désactive ce raccourci. Ne jamais publier
ce fichier, le copier dans des assets Web ou le distribuer avec un installateur.

À la préparation du 28 septembre 2026, le backend est inaccessible : les deux
profils, les connexions réelles et les communications à trois appareils restent
à valider. Les tests du module Electron utilisent un transport simulé et ne
constituent pas une validation du backend.
