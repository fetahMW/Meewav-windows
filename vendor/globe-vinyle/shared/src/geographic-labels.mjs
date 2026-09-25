import * as T from "three";
import { xyz, contains, RADIUS } from "./geo.mjs";
import { layoutGeographicLabels } from "./geographic-label-layout.mjs";
import { quartierHeight, territoryStyle, METRES_TO_WORLD, territoryReveal } from "./territory-style.mjs";
import { cityMarkersVisible } from "./city-markers.mjs";

// Reference: Meewav-Web country and city labels, pale text with a dark violet halo.
// All text is rasterized once into one atlas; the visible quads use one GPU draw.
export function createGeographicLabels(data, regions = [], focus = null, occludesLabel = null, align = null) {
  // The complete city catalogue is drawn by the bounded interactive marker
  // layer, never rasterized into the country/quartier atlas.
  data = data.filter(label => label.kind !== "city");
  const atlas = document.createElement("canvas");
  atlas.width = 2048;
  const context = atlas.getContext("2d");
  if (!context) throw Error("Les labels géographiques ne peuvent pas être préparés.");
  const scale = 2;
  const font = label => `700 ${(label.kind === "country" ? 13.2 : label.kind === "quartier" ? 12.5 : 14) * scale}px Arial, sans-serif`;
  let x = 0, y = 0, rowHeight = 0;
  const labels = data.map(label => {
    context.font = font(label);
    const width = Math.ceil(context.measureText(label.name).width) + 20;
    const height = 50;
    if (x + width > atlas.width) { x = 0; y += rowHeight; rowHeight = 0; }
    const item = { ...label, width: width / scale, height: height / scale,
      atlasX: x, atlasY: y, atlasWidth: width, atlasHeight: height,
      position: new T.Vector3(...xyz(...label.center)) };
    x += width;
    rowHeight = Math.max(rowHeight, height);
    return item;
  });
  atlas.height = T.MathUtils.ceilPowerOfTwo(y + rowHeight);
  if (atlas.height > 2048) throw Error("Le catalogue de labels dépasse le budget de texture.");
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineJoin = "round";
  for (const label of labels) {
    context.font = font(label);
    context.strokeStyle = "rgba(9, 3, 26, 0.96)";
    context.lineWidth = 1.35 * scale * 2;
    context.fillStyle = label.kind === "quartier" ? "#e2c9ff" : label.kind === "country" ? "#f8f4ff" : "#f9f6ff";
    const cx = label.atlasX + label.atlasWidth / 2;
    const cy = label.atlasY + label.atlasHeight / 2;
    context.strokeText(label.name, cx, cy);
    context.fillText(label.name, cx, cy);
  }
  const texture = new T.CanvasTexture(atlas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = T.LinearFilter;
  // All geographic names share the same CSS-pixel layout, including cities and
  // quartiers. Only their geographic anchor is projected, never a world-sized
  // text surface. This prevents perspective magnification and terrain clipping.
  for (const label of labels) {
    label.plate = regions.find(region => contains(region, label.center));
  }
  const corners = [[0, 0], [0, 1], [1, 0], [1, 0], [0, 1], [1, 1]];
  const capacity = labels.length * 6;
  const geometry = new T.BufferGeometry();
  const positions = new T.BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(T.DynamicDrawUsage);
  const uvs = new T.BufferAttribute(new Float32Array(capacity * 2), 2).setUsage(T.DynamicDrawUsage);
  const opacities = new T.BufferAttribute(new Float32Array(capacity), 1).setUsage(T.DynamicDrawUsage);
  geometry.setAttribute("position", positions);
  geometry.setAttribute("uv", uvs);
  geometry.setAttribute("labelOpacity", opacities);
  geometry.setDrawRange(0, 0);
  const material = new T.ShaderMaterial({
    uniforms: { atlas: { value: texture } },
    vertexShader: `attribute float labelOpacity;
      varying vec2 labelUv; varying float alpha;
      void main() { labelUv = uv; alpha = labelOpacity;
        gl_Position = vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D atlas; varying vec2 labelUv; varying float alpha;
      void main() { gl_FragColor = texture2D(atlas, labelUv); gl_FragColor.a *= alpha;
        #include <colorspace_fragment>
      }`,
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
  });
  const mesh = new T.Mesh(geometry, material);
  mesh.name = "Geographic label overlay";
  mesh.frustumCulled = false;
  mesh.renderOrder = 100;
  mesh.matrixAutoUpdate = false;
  mesh.visible = false;
  const projected = new T.Vector3(), direction = new T.Vector3(), anchor = new T.Vector3();
  let previous = new Set();
  return {
    mesh,
    update(camera, height, width, viewportHeight) {
      const reveal = territoryReveal(height);
      const visible = layoutGeographicLabels(labels, label => {
        if (label.kind === "city" && cityMarkersVisible(height)) return null;
        let altitude = label.kind === "quartier"
          ? quartierHeight(label.id) * METRES_TO_WORLD * reveal.quartier
          : label.plate ? territoryStyle(label.plate).height * METRES_TO_WORLD * reveal.region : 0;
        if (label.id === "country-FRA") altitude = Math.max(altitude, 17200 * METRES_TO_WORLD * reveal.region);
        anchor.copy(label.position).setLength(RADIUS + altitude);
        if (align) anchor.applyQuaternion(align);
        direction.copy(camera.position).sub(anchor);
        const facing = anchor.dot(direction) / (anchor.length() * direction.length());
        projected.copy(anchor).project(camera);
        if (facing > 0 && projected.z >= -1 && projected.z <= 1
          && occludesLabel?.(camera, anchor, label.width, label.height, viewportHeight)) return null;
        return { x: projected.x, y: projected.y, z: projected.z, facing };
      }, height, width, viewportHeight, previous);
      previous = new Set(visible.map(item => item.label.id));
      let vertex = 0;
      for (const { label, x, y, opacity } of visible) {
        const emphasis = focus ? 1 - 0.7 * focus.strength * (1 - focus.brightness({ id: label.id,
          properties: { kind: label.kind, cityCode: label.cityCode } })) : 1;
        for (const [cx, cy] of corners) {
          positions.setXYZ(vertex, (x + (cx - 0.5) * label.width) / width * 2 - 1,
            1 - (y + (cy - 0.5) * label.height) / viewportHeight * 2, 0);
          uvs.setXY(vertex, (label.atlasX + cx * label.atlasWidth) / atlas.width,
            1 - (label.atlasY + cy * label.atlasHeight) / atlas.height);
          opacities.setX(vertex++, opacity * emphasis);
        }
      }
      geometry.setDrawRange(0, vertex);
      mesh.visible = vertex > 0;
      positions.needsUpdate = uvs.needsUpdate = opacities.needsUpdate = true;
      return visible.length;
    },
    dispose() { texture.dispose(); geometry.dispose(); material.dispose(); },
  };
}
