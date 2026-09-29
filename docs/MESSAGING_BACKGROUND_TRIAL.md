# Essai du fond de messagerie — 29 septembre 2026

Image choisie par l’utilisateur : `ChatGPT Image 8 juin 2026, 10_05_44 1.png`.
Copie à l’identique sous le nom `chat-acoustic-panels-20260929.png`.
L’image est affichée en `cover`, centrée et fixe sous les messages qui défilent.
Sur Android, à la demande de l’utilisateur, la feuille d’essai la désature et
réduit sa luminosité à 78 %. Ce filtre porte uniquement sur l’image isolée,
jamais sur les bulles, cartes, bandeaux ou boutons. Web/Windows gardent l’image
sans ce filtre supplémentaire.

## Emplacements

- Android : `app/src/main/assets/messaging/images/messaging/` pour l’image;
  `app/src/main/messaging-source/messaging-wallpaper-preview.css` pour le style.
  `scripts/build-messaging.mjs` copie la feuille et la lie après les styles existants.
- Windows et Web viewer parity : `public/images/messaging/` pour l’image;
  `src/features/messaging/messaging-wallpaper-preview.css` pour le style.
  `MessagingPage.tsx` importe cette feuille après `messaging-hub-polish.css`.

## Si l’utilisateur dit « annule »

Les anciens fichiers image et les anciennes règles CSS n’ont pas été modifiés.
Le retour arrière doit concerner uniquement cet essai, sans restaurer le dépôt
ni annuler les travaux précédents.

1. Windows et Web viewer parity : retirer uniquement l’import
   `./messaging-wallpaper-preview.css` dans `MessagingPage.tsx`.
2. Android : retirer le lien `/messaging/messaging-wallpaper-preview.css`
   du HTML généré par `scripts/build-messaging.mjs`.
3. Reconstruire les bundles concernés et l’APK; réinstaller sur les téléphones.

Ces seules désactivations rendent à nouveau actives les anciennes images et
leurs anciens voiles. Les fichiers de l’essai peuvent rester présents sans être
chargés. Aucun contrôle visuel automatisé : l’utilisateur choisit le rendu.
