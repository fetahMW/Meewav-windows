import * as T from "three";
import { territoryReveal, territoryStyle, METRES_TO_WORLD, localGroundBlend, FRANCE_LOCAL_GROUND } from "./territory-style.mjs";
import { contains, lonlat, RADIUS } from "./geo.mjs";
import { createQuarterHoverOutline } from './quarter-hover-outline.mjs';

export function createTerritoryPlates(scene, packets, features, groundColor = FRANCE_LOCAL_GROUND, focus = null, toGeo = lonlat) {
  let selected = null, hovered = null;
  const hoverOutline = createQuarterHoverOutline(scene, features);
  const items = packets.map(packet => {
    const quarterCities = packet.kind === 'quartier' ? packet.features.map(feature =>
      feature.properties.cityCode || (feature.id?.startsWith('fr-paris-') ? '75056' : null)) : [];
    const cityTerritoryId = quarterCities[0] && quarterCities.every(code => code === quarterCities[0])
      ? `fr-commune-${quarterCities[0]}` : null;
    const uniforms = { reveal: { value: 0 }, paletteBlend: { value: 0 }, coverage: { value: 1 }, focusProgress: { value: 1 },
      dimColor: { value: new T.Color(packet.kind === 'quartier' ? '#211146' : '#1B1234').multiplyScalar(0.66) },
      hoverColor: { value: new T.Color('#B99AFF') },
      localGround: { value: new T.Color(groundColor) }, selectedId: { value: -1 }, hoverId: { value: -1 },
      flightId: { value: -1 }, flightWholePacket: { value: 0 }, flightHighlight: { value: 0 } };
    function geometry(attributes) {
      const g = new T.BufferGeometry();
      for (const [name, array] of Object.entries(attributes)) g.setAttribute(name,
        new T.BufferAttribute(array, ["lift", "territoryId"].includes(name) ? 1 : 3));
      const count = g.getAttribute('position').count;
      g.setAttribute('focusFrom', new T.BufferAttribute(new Float32Array(count).fill(1), 1));
      g.setAttribute('focusTo', new T.BufferAttribute(new Float32Array(count).fill(1), 1));
      g.computeBoundingSphere();
      // Shader displacement must be included in CPU frustum culling.
      g.boundingSphere.radius += 20000 * METRES_TO_WORLD;
      return g;
    }
    function decorate(material) {
      material.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = `
          attribute float focusFrom; attribute float focusTo; uniform float focusProgress; varying float territoryBrightness;
          attribute vec3 surfaceNormal; attribute float lift; attribute float territoryId; attribute vec3 nearColor;
          uniform float reveal; uniform float paletteBlend; uniform float coverage; uniform vec3 localGround; uniform float selectedId; uniform float hoverId;
          uniform float flightId; uniform float flightWholePacket; uniform float flightHighlight;
          varying float territorySelected; varying float territoryHovered; varying float pointerHovered;\n` + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `
          territorySelected = float(abs(territoryId - selectedId) < 0.1);
          float flightDestination = max(float(abs(territoryId - flightId) < 0.1), flightWholePacket);
          territoryBrightness = max(mix(focusFrom, focusTo, focusProgress), flightDestination);
          pointerHovered = float(abs(territoryId - hoverId) < 0.1);
          territoryHovered = ${packet.kind === 'quartier' ? 'flightDestination * flightHighlight' : 'max(pointerHovered, flightDestination * flightHighlight)'};
          vec3 transformed = position + surfaceNormal * (lift * reveal ${packet.kind === 'quartier' ? '+ 0.000003' : ''});`);
        shader.vertexShader = shader.vertexShader.replace("#include <color_vertex>", `#include <color_vertex>
          vColor.xyz = mix(localGround, mix(color, nearColor, paletteBlend), coverage);`);
        shader.fragmentShader = `uniform vec3 dimColor; uniform vec3 hoverColor; varying float territoryBrightness; varying float territorySelected; varying float territoryHovered; varying float pointerHovered;\n` + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.18, territoryHovered);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.3, territorySelected);
          vec3 illuminatedColor = diffuseColor.rgb;
          diffuseColor.rgb = mix(dimColor, diffuseColor.rgb, territoryBrightness);
          ${packet.kind === 'quartier' || packet.kind === 'commune'
            ? 'diffuseColor.rgb = mix(diffuseColor.rgb, mix(illuminatedColor, hoverColor, 0.65), territoryHovered);'
            : ''}
          ${packet.kind === 'quartier' ? 'diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.06 + vec3(0.006), pointerHovered * (1.0 - territoryHovered));' : ''}`);
      };
      material.customProgramCacheKey = () => `territory-${packet.kind}-surface`;
      return material;
    }
    // Regional caps and walls form solid volumes: hidden walls must never paint
    // over a nearer cap, including when the neighbouring region is drawn later.
    // Flat local mosaics retain their cartographic ordering above the regions.
    const solidRegion = packet.kind === "region";
    const material = decorate(new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false, depthTest: solidRegion, depthWrite: solidRegion,
      polygonOffset: true, polygonOffsetFactor: packet.kind === "quartier" ? -3 : packet.kind === "commune" ? -2 : -1, polygonOffsetUnits: packet.kind === "quartier" ? -3 : packet.kind === "commune" ? -2 : -1 }));
    const mesh = new T.Mesh(geometry(packet.top), material);
    mesh.position.fromArray(packet.origin);
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    mesh.renderOrder = packet.kind === 'quartier' ? 3 : packet.kind === 'commune' ? 2.5 : 2;
    mesh.visible = false;
    scene.add(mesh);
    const featureIndices = new Map(packet.features.map((feature, index) => [feature.id, index]));
    return { packet, cityTerritoryId, uniforms, mesh, featureIndices, focusRevision: -1 };
  });
  return {
    setSelected(id) { selected = id; },
    update(view, hoveredId, enabled = true) {
      hovered = hoveredId;
      const reveal = territoryReveal(view.height);
      // Hover is suppressed by the engine from pointer press through the fly.
      // Destination focus never drives this temporary selection contour.
      hoverOutline?.update(enabled ? hoveredId : null, reveal.quartier);
      for (const item of items) {
        if (focus) {
          if (item.focusRevision !== focus.revision) {
            const previous = focus.previousProgress ** 2 * (3 - 2 * focus.previousProgress);
            const brightness = item.packet.features.map(f => focus.brightness(f));
            {
              const object = item.mesh;
              const from = object.geometry.getAttribute('focusFrom'), to = object.geometry.getAttribute('focusTo');
              const ids = object.geometry.getAttribute('territoryId');
              for (let i = 0; i < from.count; i++) {
                const featureIndex = Math.round(ids.getX(i));
                // Carry the displayed flight lighting into the arrival, so a
                // new gesture during the fade cannot make the landed territory dim.
                from.setX(i, item.focusRevision < 0 || featureIndex === item.uniforms.flightId.value || item.uniforms.flightWholePacket.value === 1
                  ? 1 : from.getX(i) + (to.getX(i) - from.getX(i)) * previous);
                to.setX(i, brightness[featureIndex] ?? 1);
              }
              from.needsUpdate = to.needsUpdate = true;
            }
            item.focusRevision = focus.revision;
          }
          item.uniforms.focusProgress.value = focus.progress ** 2 * (3 - 2 * focus.progress);
        }
        const amount = reveal[item.packet.kind];
        item.uniforms.reveal.value = amount;
        item.uniforms.paletteBlend.value = item.packet.kind === "region" ? 1 - reveal.region : localGroundBlend(view.height);
        item.uniforms.coverage.value = item.packet.kind === "commune" || item.packet.kind === "quartier" ? amount : 1;
        item.uniforms.selectedId.value = item.featureIndices.get(selected) ?? -1;
        item.uniforms.hoverId.value = item.featureIndices.get(hovered) ?? -1;
        // Hold the destination above the dimming transition without changing
        // the source focus or baking a temporary highlight into streamed meshes.
        item.uniforms.flightId.value = focus?.flightTerritoryId
          ? item.featureIndices.get(focus.flightTerritoryId) ?? -1 : -1;
        // A commune destination also lights its existing municipal quarter batch.
        item.uniforms.flightWholePacket.value = item.cityTerritoryId && item.cityTerritoryId === focus?.flightTerritoryId ? 1 : 0;
        item.uniforms.flightHighlight.value = focus?.flightHighlight ?? 0;
        item.mesh.visible = enabled && (item.packet.kind === "region" || amount > 0.01);
      }
    },
    pick(ray, view) {
      const reveal = territoryReveal(view.height), sphere = new T.Sphere(), point = new T.Vector3();
      let best = null, distance = Infinity;
      for (const feature of features) {
        const amount = reveal[feature.properties.kind];
        if (amount <= 0.01) continue;
        sphere.radius = RADIUS + territoryStyle(feature).height * METRES_TO_WORLD * amount
          + (feature.properties.kind === 'quartier' ? 0.000003 : 0);
        if (!ray.intersectSphere(sphere, point)) continue;
        const d = ray.origin.distanceToSquared(point);
        if (d < distance && contains(feature, toGeo(point.x, point.y, point.z))) { best = feature; distance = d; }
      }
      return best;
    },
    objects() {
      return items.map(item => item.mesh);
    },
    dispose() {
      hoverOutline?.dispose();
      for (const { mesh } of items) {
        mesh.removeFromParent();
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
    },
  };
}
