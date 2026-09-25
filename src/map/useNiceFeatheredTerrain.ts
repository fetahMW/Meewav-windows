import { useEffect } from 'react';
import type maplibregl from 'maplibre-gl';

export function useNiceFeatheredTerrain(map: maplibregl.Map | null) {
  useEffect(() => {
    const currentMap = map as NonNullable<typeof map>;
    if (!currentMap) return;

    const TERRAIN_SOURCE_ID = 'meewav-terrain-nice-feathered';
    const HILLSHADE_LAYER_ID = 'meewav-hillshade-nice-feathered';

    function setupTerrain() {
      if (!currentMap.getSource(TERRAIN_SOURCE_ID)) {
        currentMap.addSource(TERRAIN_SOURCE_ID, {
          type: 'raster-dem',
          tiles: [
            `${window.location.origin}/terrain/nice/{z}/{x}/{y}.png`,
          ],
          tileSize: 256,
          minzoom: 10,
          maxzoom: 14,
          encoding: 'mapbox',
        } as any);
      }

      // Important :
      // setTerrain une fois.
      // Ne jamais rappeler ça pendant wheel / move / rotate.
      currentMap.setTerrain({
        source: TERRAIN_SOURCE_ID,
        exaggeration: 0.85,
      });

      if (!currentMap.getLayer(HILLSHADE_LAYER_ID)) {
        currentMap.addLayer(
          {
            id: HILLSHADE_LAYER_ID,
            type: 'hillshade',
            source: TERRAIN_SOURCE_ID,
            paint: {
              'hillshade-exaggeration': 0.25,
              'hillshade-shadow-color': 'rgba(35, 20, 70, 0.35)',
              'hillshade-highlight-color': 'rgba(180, 150, 255, 0.18)',
              'hillshade-accent-color': 'rgba(80, 50, 140, 0.20)',
            },
          },
          // À adapter : placer avant les labels selon votre style.
          undefined
        );
      }
    }

    if (currentMap.loaded()) {
      setupTerrain();
    } else {
      currentMap.once('load', setupTerrain);
    }

    return () => {
      // Ne pas supprimer automatiquement le terrain au cleanup si la map reste montée.
      // Les suppressions/recréations peuvent créer du flicker.
    };
  }, [map]);
}
