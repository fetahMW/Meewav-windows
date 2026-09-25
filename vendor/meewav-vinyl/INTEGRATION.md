# Vinyle signature fourni le 12 septembre 2026

Source : `C:/Users/linkw/Downloads/meewav-react-vite.zip`, dossier `meewav-vinyl`.
Les composants Vinyl et BrandMark, les styles du disque et `record-utils.js`
proviennent de cette archive. Le README fourni est conservé comme provenance ;
ses résultats de tests ne constituent pas une validation de cette intégration.
Le lecteur, sa page de présentation et son runtime de démonstration ne sont pas importés.

Le composant Vinyl accepte en plus `interactive={false}` : le vinyle de chargement
est décoratif, sans faux bouton ni interaction avec la souris. Sa rotation reste
celle de l'archive (Web Animations, 33⅓ tours/minute, reflets et axe fixes).
GlobeLoading applique la préférence de mouvement réduit et le composant fourni
suspend déjà son animation dans un onglet masqué. Il est démonté à la fin du
chargement ou quand on quitte la route.

Le chargement couvre l'attente de l'authentification puis celle du globe intégré.
Le signal de fin est envoyé après le premier rendu du moteur, sans délai simulé.
Le document embarqué ne dessine pas de deuxième animation sous celle du parent.

## Adaptation au globe

`src/record-finish.js` transpose les couleurs et les positions des dégradés de
`vinyl.css` ainsi que les 220 cercles de `record-utils.js`. Le matériau Three.js
utilise ces profils pour reproduire la superposition du PVC, de la gravure, des
reflets blancs en mode écran et des micro-sillons. Les cinq séparations restent
celles du SVG fourni. Le profil lumineux garde les opacités du CSS, avec une
réponse discrète au point de vue et un éclairage propre au bord physique.

Retouche après comparaison des captures par l'utilisateur : les deux principaux
profils blancs du CSS sont maintenant orientés par le demi-vecteur de deux
éclairages fixes et de la caméra, dans le plan radial des sillons. Cela replace
les reflets sur les deux côtés visibles de la vue inclinée, avec des reflets
secondaires plus discrets à l'arrière. Leur direction évolue avec la caméra.
La gravure module aussi la réflexion ; les cinq séparations réduisent le reflet
pour rester lisibles. Le contraste local des sillons utilise une moyenne filtrée,
sans accentuer les détails sous la taille d'un pixel. Les mêmes éclairages
révèlent le biseau réel et un fin reflet souligne le rebord extérieur.

L'étiquette est remplacée par l'ouverture du globe. Toute la zone gravée est
redistribuée dans cette ouverture ; la géométrie conserve le rayon extérieur
existant (1,72 fois le rayon du globe), sa face plane, son épaisseur et son
biseau. L'ouverture pénètre de 0,08 unité dans le globe pour couvrir la jonction.
Les portraits, le rail intérieur et les vols gardent leurs positions et contrats.

Les motifs sont calculés une fois dans quatre textures 1D filtrées avec mipmaps.
Ils n'ajoutent ni vidéo, ni bloom, ni animation permanente, ni passe WebGL.
Les textures sont libérées avec le matériau. Le shader de l'ancien ZIP Vinyl V2
n'est plus importé. Cette adaptation en 3D n'est pas une capture du composant 2D.

Aucun test, contrôle visuel ou profilage automatique n'a été lancé pour cette
modification ; la comparaison dans l'aperçu revient à l'utilisateur.
