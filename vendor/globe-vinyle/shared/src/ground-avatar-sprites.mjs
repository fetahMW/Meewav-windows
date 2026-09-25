import * as T from 'three';

const ICON_SIZE = 256;

// One GPU batch in the globe's existing context. Each icon has its own texture
// array layer, so distant mip levels cannot blend with a neighbouring avatar.
export function createGroundAvatarSprites() {
  const scene = new T.Scene(), camera = new T.Camera();
  const geometry = new T.InstancedBufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0], 3));
  geometry.setIndex([0, 1, 2, 2, 1, 3]);
  geometry.instanceCount = 0;
  const slots = new Map();
  let texture = null, capacity = 0, rectangles, layers, depths, count = 0;
  const material = new T.ShaderMaterial({
    glslVersion: T.GLSL3,
    uniforms: { icons: { value: null }, viewport: { value: new T.Vector2(1, 1) } },
    // Reuse the main scene's depth buffer. Icons remain unlit billboards but
    // must not paint through the Eiffel tower or other opaque geometry.
    transparent: true, depthTest: true, depthWrite: false,
    premultipliedAlpha: true, toneMapped: false,
    vertexShader: `
      in vec4 avatarRect;
      in float iconLayer;
      in float avatarDepth;
      uniform vec2 viewport;
      out vec2 iconUv;
      flat out float layer, opacity, spriteSize;
      void main() {
        spriteSize = avatarRect.z;
        float padding = spriteSize * 0.12 + 2.0;
        vec2 pixel = vec2((position.x - 0.5) * spriteSize,
          position.y * (spriteSize + padding) - padding);
        iconUv = vec2(position.x, pixel.y / spriteSize);
        layer = iconLayer; opacity = avatarRect.w;
        vec2 screen = avatarRect.xy + vec2(pixel.x, -pixel.y);
        gl_Position = vec4(screen.x / viewport.x * 2.0 - 1.0,
          1.0 - screen.y / viewport.y * 2.0, avatarDepth, 1.0);
      }`,
    fragmentShader: `
      uniform highp sampler2DArray icons;
      in vec2 iconUv;
      flat in float layer, opacity, spriteSize;
      out vec4 outputColor;
      void main() {
        vec4 photo = texture(icons, vec3(clamp(vec2(iconUv.x, 1.0 - iconUv.y), 0.0, 1.0), layer));
        photo *= opacity * step(0.0, iconUv.y) * step(iconUv.y, 1.0);
        vec2 ellipse = vec2((iconUv.x - 0.5) / 0.34, (iconUv.y + 2.0 / spriteSize) / 0.1);
        float r = length(ellipse), feather = max(fwidth(r) * 0.5, 0.0001);
        float shadow = (1.0 - smoothstep(1.0 - feather, 1.0 + feather, r)) * 0.1984;
        // These are unlit sprites: keep the source images' display sRGB
        // colours and premultiplied alpha, just like their HTML enlarged image.
        outputColor = vec4(photo.rgb, photo.a + shadow * (1.0 - photo.a));
      }`,
  });
  const mesh = new T.Mesh(geometry, material);
  mesh.name = 'Ground avatar sprite batch';
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.visible = false;
  scene.add(mesh);

  function reserve(size) {
    if (size <= capacity) return;
    if (capacity) geometry.dispose();
    capacity = T.MathUtils.ceilPowerOfTwo(Math.max(1024, size));
    rectangles = new T.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(T.DynamicDrawUsage);
    layers = new T.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(T.DynamicDrawUsage);
    depths = new T.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(T.DynamicDrawUsage);
    geometry.setAttribute('avatarRect', rectangles);
    geometry.setAttribute('iconLayer', layers);
    geometry.setAttribute('avatarDepth', depths);
  }
  return {
    setImages(images) {
      if (!images.size) return;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = ICON_SIZE;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      const bytesPerLayer = ICON_SIZE * ICON_SIZE * 4;
      const pixels = new Uint8Array(bytesPerLayer * images.size);
      slots.clear();
      for (const [key, image] of images) {
        context.clearRect(0, 0, ICON_SIZE, ICON_SIZE);
        context.drawImage(image, 0, 0, ICON_SIZE, ICON_SIZE);
        const rgba = context.getImageData(0, 0, ICON_SIZE, ICON_SIZE).data;
        // Premultiply once before mipmap filtering to avoid dark sparkling
        // outlines around transparent pixels when the icon becomes very small.
        for (let i = 0; i < rgba.length; i += 4) {
          const alpha = rgba[i + 3] / 255;
          rgba[i] *= alpha; rgba[i + 1] *= alpha; rgba[i + 2] *= alpha;
        }
        const slot = slots.size;
        slots.set(key, slot);
        pixels.set(rgba, slot * bytesPerLayer);
      }
      texture?.dispose();
      texture = new T.DataArrayTexture(pixels, ICON_SIZE, ICON_SIZE, images.size);
      texture.name = 'Ground avatar icons with isolated mipmaps';
      texture.minFilter = T.LinearMipmapLinearFilter;
      texture.magFilter = T.LinearFilter;
      texture.generateMipmaps = true;
      texture.needsUpdate = true;
      material.uniforms.icons.value = texture;
      canvas.width = canvas.height = 1;
    },
    begin(width, height, maximum) {
      reserve(maximum);
      material.uniforms.viewport.value.set(width, height);
      count = 0;
    },
    add(item, size = item.size, opacity = 1) {
      const slot = slots.get(item.avatar.icon) ?? slots.get('avatar_4');
      if (slot === undefined || size <= 0) return;
      rectangles.setXYZW(count, item.x, item.y, size, opacity);
      layers.setX(count, slot);
      depths.setX(count, item.depth);
      count++;
    },
    finish() {
      geometry.instanceCount = count;
      mesh.visible = count > 0 && texture !== null;
      if (!count) return;
      rectangles.clearUpdateRanges(); rectangles.addUpdateRange(0, count * 4); rectangles.needsUpdate = true;
      layers.clearUpdateRanges(); layers.addUpdateRange(0, count); layers.needsUpdate = true;
      depths.clearUpdateRanges(); depths.addUpdateRange(0, count); depths.needsUpdate = true;
    },
    hide() { mesh.visible = false; geometry.instanceCount = 0; },
    render(renderer) {
      if (!mesh.visible) return;
      const autoClear = renderer.autoClear;
      renderer.autoClear = false;
      try { renderer.render(scene, camera); }
      finally { renderer.autoClear = autoClear; }
    },
    dispose() {
      scene.remove(mesh);
      geometry.dispose(); material.dispose(); texture?.dispose(); slots.clear();
    },
  };
}
