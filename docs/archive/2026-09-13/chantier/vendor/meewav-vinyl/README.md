# Meewav — Le vinyle signature

Une recréation du vinyle noir de la référence en **React + Vite**, avec une signature **MW vectorielle**, des sillons, des reflets et une étiquette mate. Le disque n'est pas une photo insérée dans la page : sa surface est construite en CSS et SVG.

## Démarrer

Avec **Node.js 22.12 ou une version supérieure** :

```bash
cd meewav-vinyl
npm install
npm run dev
```

Ouvrir l'adresse affichée dans le terminal, normalement `http://localhost:5173`.

```bash
npm test          # 5 tests unitaires, sans dépendance supplémentaire
npm run build     # génère le dossier dist/
npm run preview   # sert localement le build
```

Les dépendances doivent être téléchargées lors du premier `npm install`. Aucun service externe, compte ou clé d'API n'est nécessaire. Aucune police distante ni image bitmap n'est chargée par le projet.

## Interaction

Cliquer sur le vinyle ou sur **Lancer la rotation** pour démarrer et mettre en pause. Le sélecteur **33⅓ / 45** modifie la vitesse sans repartir de zéro. Le bouton circulaire de réinitialisation ramène le disque à sa position initiale, à l'arrêt et à 33⅓ tours/minute.

**Vue épurée** masque les annotations. Le même bouton ou la touche **Échap** rétablit la présentation. Un léger effet d'inclinaison suit le pointeur sur ordinateur. Les commandes fonctionnent également au clavier.

Il n'y a **pas de piste audio**. L'animation s'arrête lorsque l'onglet est masqué ; la préférence système de réduction des animations désactive la rotation et l'inclinaison.

## Fichiers utiles

```text
src/
  App.jsx                    Présentation et commandes
  main.jsx                   Entrée de l'application React
  styles.css                 Mise en page, couleurs et adaptations mobiles
  record-utils.js            Vitesses, inclinaison et géométrie des sillons
  components/
    Vinyl.jsx                Composant du disque
    vinyl.css                Styles autonomes du disque
    BrandMark.jsx            Tracé SVG de la signature MW
    Icons.jsx                Icônes SVG des commandes
public/
  meewav-mark.svg             Signature exportée en SVG
  favicon.svg                Icône du navigateur
```

La petite référence du logo a été **redessinée à la main en courbes vectorielles** : ce n'est ni le PNG agrandi, ni un fichier vectoriel officiel fourni par la marque. Le tracé reste entièrement modifiable dans `BrandMark.jsx`. Son export SVG se trouve dans `public/meewav-mark.svg`.

Pour modifier le violet, changer `--accent` au début de `src/styles.css`. Le texte de l'étiquette est la prop `label` du composant `Vinyl`.

## Réutiliser uniquement le disque

Copier `Vinyl.jsx`, `vinyl.css`, `BrandMark.jsx` et `record-utils.js` en conservant leurs imports relatifs. Les styles de la page ne sont pas nécessaires. `Vinyl.jsx` importe lui-même sa feuille de style.

```jsx
import React, { useEffect, useState } from 'react';
import Vinyl from './components/Vinyl.jsx';

export default function MonVinyle() {
  const [playing, setPlaying] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      setReducedMotion(query.matches);
      if (query.matches) setPlaying(false);
    };
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return (
    <Vinyl
      label="Meewav"
      playing={playing}
      rpm={100 / 3}
      reducedMotion={reducedMotion}
      onToggle={() => setPlaying(value => !value)}
      style={{ width: 'min(80vw, 640px)', '--accent': '#a675f5' }}
    />
  );
}
```

`resetKey` permet de réinitialiser l'angle : incrémenter sa valeur pour revenir à la position initiale. Les props `className` et `style` permettent d'adapter la taille à une autre interface.

## Aperçu et validation

`demo/apercu.html` est un **aperçu autonome hors ligne** : ouvrir ce fichier dans un navigateur pour essayer la maquette sans installer npm. Les composants JSX et les styles sont les mêmes que ceux du projet. Cet aperçu utilise un runtime local React 18.2 pour la vérification ; **ce n'est pas un build Vite**, et il ne remplace pas les sources React 19.3 du projet.

Les cinq tests unitaires ont passé. L'aperçu a été contrôlé dans Chromium sur dix formats de 320 à 1920 pixels, avec vérification du démarrage, de la pause, de la reprise, de la vitesse, de la réinitialisation, du clavier et des préférences de mouvement réduit.

**Limite de validation :** l'environnement de création ne pouvait pas joindre le registre npm. L'installation des dépendances, le build Vite et l'exécution avec les dépendances React 19.3 déclarées n'ont donc pas été vérifiés ici. Exécuter `npm install && npm run build` pour cette dernière validation. Aucun fichier n'a été modifié dans le dossier local connecté, dont le pont de connexion était indisponible.

Documentation de l'outil de développement : https://vite.dev/guide/
