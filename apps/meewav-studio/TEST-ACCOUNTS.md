# Comptes de test locaux — Windows

Trois identités réelles : testeur1, testeur2, testeur3. La suite de tests commune
se trouve dans Meewav-Android/scripts/qa-three-users et utilise la connexion
classique par e-mail/mot de passe, dans un userData Electron isolé.

Le raccourci local est facultatif et réservé au développement :

- app.isPackaged doit être false ;
- MEEWAV_TEST_MODE doit valoir 1 ;
- qa-test-accounts.json doit être explicitement installé dans ce userData.

Une version empaquetée refuse toujours ces raccourcis, même avec la variable et
le fichier présents. Le navigateur Web ne dispose pas du pont. Sans activation
explicite, les identifiants et le formulaire normaux restent nécessaires.

Le provisionneur commun Meewav-Android/scripts/test-accounts/provision.mjs
réutilise les anciennes identités QA, les renomme et vérifie leurs identifiants.
Les mots de passe aléatoires restent dans .local/test-accounts du dépôt Android,
ignoré par Git. Le compte personnel puf n'est pas modifié.

En développement configuré, saisir testeur1, testeur2 ou testeur3 dans le champ
identifiant. Le main process effectue une vraie authentification Supabase et
vérifie l'identité ; React ne reçoit que les jetons de session. Ce mécanisme ne
fabrique ni accès hors ligne, ni permission. Retirer uniquement le fichier privé
puis relancer désactive le raccourci.

Ne jamais publier ces fichiers, les embarquer dans le Web ou les installateurs.
Les tests de la barrière de production sont dans test-accounts.test.cjs. Leur
réussite ne valide pas les appels, l'audio, la vidéo ou les Rooms entre appareils.
