# Messagerie — cartes, audio et composition

Fusion autorisée par l’utilisateur le 9 septembre 2026. Branche codex/messaging-premium-cards, issue de d8739b079.
Aperçu stable après fusion : http://127.0.0.1:5182/messages.

- Navbar avec indicateur fin partagé, glow atténué et titre lavande sans rognage des descendantes.
- Contacts sur fond violet sombre, sélection froide translucide, textes secondaires lavande et action Voir plus discrète.
- Fil et saisie centrés sur une largeur maximale commune de 1100 px, marge haute accrue, identité du contact dans le header.
- Capsules audio uniformes de 490 px maximum, sans portrait ni note décorative, bouton Play à bordure douce et waveform plus lisible.
- Track Pack fermé et ouvert assorti au mixeur des Rooms : anthracite, façades de stems bombées, reflets métalliques et accents violets.
- Demandes Collab en verre fumé sombre, accès au profil, audio joué dans la carte avec progression et URL privée résolue au clic. Accepter s’éclaire au survol et à l’appui ; Refuser rougit légèrement au survol.
- Menu des messages en verre fumé compact, bouton vers le mur d’émoticônes MeeWav et rendu des réactions du catalogue.
- Migration préparée : supabase/migrations/20260909093000_messaging_meewav_reactions.sql. Elle autorise les tokens MeeWav par le chemin existant de réaction protégé par appartenance à la conversation. Elle n’a pas été appliquée à une base distante pendant cette tâche.

La première phase visuelle a été validée par l’utilisateur sans tests automatisés à sa demande. Il a ensuite demandé un audit complet du câblage : 231 tests ciblés réussis et compilation réussie. Voir MESSAGING-WIRING-AUDIT.md pour les corrections, les limites des essais et le schéma Supabase distant manquant. Les appels directs ne sont pas connectés.
