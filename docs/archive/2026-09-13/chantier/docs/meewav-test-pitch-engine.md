# Moteur test MeeWav — correction de hauteur monophonique

- Statut : **expérimental, local, opt-in**
- Date : **10 août 2026**
- Usage actuel : **comparaison au casque dans FX voix**
- Usage non encore raccordé : **publication réseau de la piste traitée**

## Ce qui est réellement implémenté

Le bouton « Choisir le moteur test » insère un `AudioWorkletProcessor` entre l’EQ d’entrée et la compression de la chaîne locale :

```text
micro mono
→ filtre/EQ
→ estimation YIN de la fondamentale
→ note la plus proche dans la tonalité et la gamme
→ lissage vitesse/humanisation
→ pitch shifter à deux délais variables croisés
→ compression/reverb/delay
→ limiteur
→ casque + MediaStreamDestination
```

La boucle audio préalloue ses anneaux, fenêtres d’analyse et différences YIN dans le constructeur. `process()` ne fait ni réseau, ni JSON, ni accès disque, ni allocation volontaire. Les paramètres venant de React sont transmis par le port du Worklet seulement lorsqu’un réglage change.

## Estimation de hauteur

La première version utilise YIN sur une fenêtre de 2 048 échantillons d’entrée, décimée par deux pour l’analyse. La recherche couvre approximativement 70 à 900 Hz, avec :

- différence quadratique par décalage ;
- fonction de différence moyenne cumulée normalisée ;
- seuil de périodicité ;
- choix du meilleur minimum en repli ;
- interpolation parabolique du décalage ;
- porte RMS pour éviter de corriger le silence.

YIN a été retenu parce que l’article original vise explicitement à réduire les erreurs courantes de fréquence fondamentale avec une méthode simple et efficace : [de Cheveigné & Kawahara, 2002](https://pubmed.ncbi.nlm.nih.gov/12002874/).

## Quantification musicale

La fréquence détectée est convertie en note MIDI continue. Le moteur cherche ensuite la note la plus proche parmi :

- majeure ;
- mineure naturelle ;
- chromatique.

`Correction` règle la distance réellement parcourue. `Vitesse` règle la convergence vers le nouveau ratio. `Humanisation` agrandit la zone morte autour d’une note juste et réduit légèrement la force de correction. Les changements sont lissés : aucune fréquence détectée n’entraîne un saut binaire immédiat.

## Pitch shifting V1

Deux têtes de lecture parcourent un anneau de délai avec un déphasage de 180°. Des fenêtres de Hann complémentaires croisent les têtes au moment où leur délai boucle. La pente du délai réalise le ratio de hauteur demandé. Le signal traité revient progressivement au signal direct lorsque :

- aucune voix périodique fiable n’est détectée ;
- la correction est coupée ;
- la note est déjà dans la zone morte.

Cette approche est suffisamment petite pour un POC Web Audio et évite le changement brutal d’un délai unique. La littérature DSP décrit précisément le crossfade entre plusieurs lignes comme moyen de masquer les discontinuités lors de grands changements de délai : [Physical Audio Signal Processing — Large Delay Changes](https://www.dsprelated.com/freebooks/pasp/Large_Delay_Changes.html).

## Contraintes temps réel Web

Le traitement vit dans `AudioWorklet`, pas dans le thread principal. La recommandation de conception est cohérente avec les contraintes de rendu décrites par Chrome : le callback possède un budget de quelques millisecondes et doit éviter allocations, messages excessifs et travail non audio : [Audio Worklet design pattern](https://developer.chrome.com/blog/audio-worklet-design-pattern) et [spécification Web Audio](https://www.w3.org/TR/webaudio-1.0/).

## Ce que les retours d’expérience ont changé

Les discussions Reddit n’ont pas été utilisées comme vérité scientifique, mais comme catalogue de pièges pratiques :

- un prototype YIN/PSOLA peut cliquer même avec du fenêtrage si les transitions ne sont pas traitées proprement ([r/DSP](https://www.reddit.com/r/DSP/comments/6do5d8/help_improving_my_autotune_program/)) ;
- déplacer brutalement des bins FFT sans gérer la phase produit des artefacts, d’où l’abandon d’un simple remappage spectral pour cette V1 ([r/DSP](https://www.reddit.com/r/DSP/comments/k6t24c/pitch_shifting_using_fft/)) ;
- une correction naturelle nécessite une transition graduelle et des réglages adaptés à l’interprète, pas un snap permanent ([r/audioengineering](https://www.reddit.com/r/audioengineering/comments/199y9pq/how_to_make_autotune_sound_more_natural/)).

Ces observations expliquent le lissage, la zone morte d’humanisation, le seuil de confiance et le retour au signal direct.

## Limites honnêtes

Ce moteur n’est pas présenté comme équivalent à Voloco :

- voix monophonique uniquement ;
- pas de préservation de formants ;
- risque d’erreur d’octave sur des attaques bruitées ou une voix très soufflée ;
- pas de protection spécialisée des consonnes/transitoires ;
- pas encore de PSOLA/phase vocoder haute qualité ;
- pas de mesure de latence matérielle ;
- pas d’écoute ni de test exécuté durant cette intervention ;
- le `MediaStreamDestination` traité n’est pas encore publié dans la Room Web.

Voloco Producer reste le chemin commercial comparatif. Son site officiel annonce les formats desktop et un essai de 14 jours, puis une offre payante ; le téléchargement passe par le compte et l’abonnement de l’utilisateur : [Voloco Producer](https://voloco.com/plugin.html), [procédure officielle de téléchargement](https://help.voloco.com/hc/en-us/articles/26657918440087-How-do-I-download-Voloco-Producer).

## Étapes nécessaires avant une version « production »

1. Écoutes ABX sur plusieurs voix, tessitures et micros.
2. Mesure de latence entrée → casque et stabilité CPU sur les navigateurs cibles.
3. Détection de voisement plus robuste et hystérésis anti-erreur d’octave.
4. Séparation transitoires/consonnes et préservation de formants.
5. Comparaison PSOLA, WSOLA et phase vocoder avec verrouillage de phase.
6. Passage éventuel du cœur DSP en WASM SIMD après profilage, pas avant.
7. Publication exclusive de la piste traitée dans LiveKit, sans micro brut simultané.
8. Tests de crash, changement de périphérique et retour contrôlé vers le micro brut.
