# Monuments de Paris — modèles de référence

Les fichiers `hero-landmarks/la_tour_eiffel_violet_light.glb` et `hero-landmarks/tour_montparnasse_violet_light.glb` sont copiés depuis les mêmes chemins sous `C:/Users/linkw/Desktop/Meewav-Web/public/models/`. Leur géométrie est conservée. L'ancienne tour Eiffel procédurale du laboratoire est retirée.

Les coordonnées, les orientations, les hauteurs de présentation et les matériaux reprennent `eiffelTowerLayer.ts` et `montparnasseTowerLayer.ts` de Meewav-Web. Les hauteurs sont normalisées au chargement, avec la base du modèle posée sur la plaque du quartier. Le décodeur Draco local dans `draco/` provient de `Meewav-Web/public/vendor/draco/` ; un seul worker est partagé entre les deux modèles.

Le build partagé copie ces ressources dans le globe web. Les modèles se chargent uniquement lorsque leur emplacement devient visible au zoom local. La recherche propose les deux tours ; `?view=eiffel` ouvre également la tour Eiffel. Voir `Docs/PARIS-LANDMARKS.md` pour les paramètres et la référence des futurs GLB.

Les vérifications de cette livraison sont laissées à l’utilisateur, conformément à sa demande.
