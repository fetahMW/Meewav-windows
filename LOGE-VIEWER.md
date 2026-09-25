# Loge viewer — listes de demandes

Aperçu : http://127.0.0.1:5183/rooms/loge?demoRole=viewer

Le CTA « Cadeaux, dédicaces et rencontres » ouvre trois listes. Le fan peut rejoindre une liste ouverte, consulter son état et annuler une demande encore en attente. Les invitations existantes restent soumises à son acceptation explicite. Le lecteur d’avant-première reste monté pendant la navigation.

Le host ouvre et ferme les listes depuis Moment VIP (et Face-à-face pour sa liste). Les demandes entrent dans les moments existants, avec une identité de bénéficiaire et un indicateur `requested`. Le host peut inviter, décliner ou marquer une demande traitée. Une demande de cadeau ne crée ni transaction, ni débit, ni droit à un cadeau. Les fichiers personnels et dédicaces continuent d’utiliser les outils de livraison existants.

La RPC `rooms_apply_loge_request_v1` contrôle l’utilisateur connecté, l’accès Loge existant, les bannissements, le live actif, l’ouverture de la liste et la propriété de l’annulation. Elle déduit le profil côté serveur, verrouille l’état, empêche les doublons actifs et publie le signal de révision déjà consommé par les outils host/viewer. En cas de RPC absente, la demande échoue explicitement sans succès de démonstration de substitution.

Migration à appliquer : `supabase/migrations/20260908001000_loge_viewer_requests_v1.sql`. Non appliquée à Supabase distant dans cette session ; livraison Realtime entre comptes réels non vérifiée.

Validation : 32 tests ciblés réussis (UI, identité, accès, doublons, annulation, reprise après échec, persistance, routage RPC, actions host existantes), build de production réussi, aucune erreur TypeScript dans les fichiers de cette tâche. La suite générale historique comprend des tests Cage incompatibles avec son moteur actuel ; elle n’est pas annoncée verte. Main et l’aperçu stable 5182 sont conservés.

## Golden Like — correction du bouton vidéo partagé

Le clic ouvre une confirmation noire laquée. Annuler ne déclenche aucun envoi ; confirmer utilise le handler existant, puis l’animation `LiveActionBurst` uniquement après succès. La modale est rendue hors du châssis de la navbar (dans la surface plein écran si active), pour éviter les styles de boutons ronds et le masquage du panneau vidéo. Les erreurs restent dans la confirmation, les doubles clics sont bloqués et le quota existant est conservé.

Validation : 9 tests ciblés réussis, dont ouverture dans les six présentations de rooms, build réussi. Test visuel dans la Loge : confirmation, fermeture et étoiles dorées avec compteur 214 → 215. Les tests historiques de composition vidéo ne sont pas tous verts (anciennes attentes de grille malgré le démarrage solo) ; ils ne sont pas inclus dans les 9 contrôles annoncés.
