import * as T from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { ORBIT_APPEARANCE } from './orbit-rings-config.mjs';

// Selective HDR source in the existing renderer. The normal globe render keeps
// its established materials, antialiasing, tone mapping and portrait colours.
export function createOrbitBloom(renderer, ring, earth, enabled = ORBIT_APPEARANCE.bloom.enabled, portraits = null) {
  if (ring.bloomEnabled === false || !enabled || !renderer.extensions.has('EXT_color_buffer_float')) {
    return { resize() {}, render() {}, dispose() {} };
  }
  const settings = ORBIT_APPEARANCE.bloom;
  const source = new T.Scene();
  source.add(ring.bloomRoot);
  // The visible globe writes a protected alpha mask; the nearer ring writes
  // alpha zero. Black RGB prevents the planet from becoming a bloom source.
  const occluderMaterial = new T.MeshBasicMaterial({ color: 0x000000, opacity: 1,
    colorWrite: true, depthTest: true, depthWrite: true, toneMapped: false });
  const occluder = new T.Mesh(earth.geometry, occluderMaterial);
  occluder.matrixAutoUpdate = false;
  occluder.renderOrder = -1;
  source.add(occluder);
  // Match the exact photo billboards, including hover scale and visit fades.
  // Their depth blocks emission, and their alpha protects faces from the blur.
  const portraitOccluder = portraits?.createBloomOccluder();
  if (portraitOccluder) source.add(portraitOccluder.mesh);
  const target = new T.WebGLRenderTarget(1, 1, {
    type: T.HalfFloatType, minFilter: T.LinearFilter, magFilter: T.LinearFilter,
    depthBuffer: true, stencilBuffer: false,
  });
  target.texture.name = 'Orbit selective linear HDR source';
  const bloom = new UnrealBloomPass(new T.Vector2(64, 64), settings.strength, settings.radius, settings.threshold);
  // We consume the separate blurred texture. Keep the source alpha mask intact
  // instead of writing the pass's additive copy back over it.
  bloom.blendMaterial.colorWrite = false;
  // Saturated blue can be HDR without having the luminance of white. Select
  // the strongest channel, so the bloom does not require whitening the neon.
  bloom.materialHighPassFilter.fragmentShader = `
    uniform sampler2D tDiffuse;
    uniform float luminosityThreshold, smoothWidth;
    varying vec2 vUv;
    void main() {
      vec4 source = texture2D(tDiffuse, vUv);
      float peak = max(source.r, max(source.g, source.b));
      float coverage = smoothstep(luminosityThreshold, luminosityThreshold + smoothWidth, peak);
      gl_FragColor = vec4(source.rgb * coverage, 0.0);
    }
  `;
  const compositeMaterial = new T.ShaderMaterial({
    uniforms: { baseFrame: { value: null }, glowFrame: { value: bloom.renderTargetsHorizontal[0].texture },
      protectedSurface: { value: target.texture }, glowExposure: { value: settings.displayExposure } },
    depthTest: false, depthWrite: false, toneMapped: false, blending: T.NoBlending,
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: `
      uniform sampler2D baseFrame, glowFrame, protectedSurface;
      uniform float glowExposure;
      varying vec2 vUv;
      void main() {
        // Leave the original planet and portrait pixels untouched by the halo.
        if (texture2D(protectedSurface, vUv).a > 0.001) discard;
        vec3 hdrGlow = max(texture2D(glowFrame, vUv).rgb, vec3(0.0));
        float glowPeak = max(hdrGlow.r, max(hdrGlow.g, hdrGlow.b));
        if (glowPeak < 0.0001) discard;
        // FramebufferTexture stores the screen's sRGB bytes without conversion.
        // Decode once, add the selective glow in linear display light, encode once.
        vec4 original = texture2D(baseFrame, vUv);
        vec3 base = sRGBTransferEOTF(original).rgb;
        vec3 glow = hdrGlow * ((1.0 - exp(-glowPeak * glowExposure)) / max(glowPeak, 0.00001));
        vec3 combined = base + glow;
        float combinedPeak = max(combined.r, max(combined.g, combined.b));
        // Rescale over-range highlights as a whole; per-channel clipping or
        // screen blending would turn violet and electric blue back into white.
        gl_FragColor = vec4(combined / max(1.0, combinedPeak), original.a);
        #include <colorspace_fragment>
        // Preserve the transparent cosmic background outside the halo; RGB is
        // already premultiplied from the original framebuffer and additive glow.
        gl_FragColor.a = max(original.a, max(gl_FragColor.r, max(gl_FragColor.g, gl_FragColor.b)));
      }
    `,
  });
  const quad = new FullScreenQuad(compositeMaterial);
  const drawingSize = new T.Vector2(), savedClear = new T.Color();
  let frameTexture = null, frameWidth = 0, frameHeight = 0;

  function resize() {
    renderer.getDrawingBufferSize(drawingSize);
    if (frameWidth === drawingSize.x && frameHeight === drawingSize.y) return;
    frameWidth = drawingSize.x; frameHeight = drawingSize.y;
    frameTexture?.dispose();
    frameTexture = new T.FramebufferTexture(frameWidth, frameHeight);
    frameTexture.name = 'Existing globe colour before orbit glow';
    compositeMaterial.uniforms.baseFrame.value = frameTexture;
    // Explicit quality preset, with a bounded HDR budget even on very large displays.
    const scale = Math.min(ring.layout.bloomScale, 1536 / Math.max(frameWidth, frameHeight));
    const width = Math.max(64, Math.round(frameWidth * scale));
    const height = Math.max(64, Math.round(frameHeight * scale));
    target.setSize(width, height); bloom.setSize(width, height);
  }

  return {
    resize,
    render(camera, dt) {
      if (!ring.visible || document.hidden) return;
      resize();
      const savedTarget = renderer.getRenderTarget();
      const savedAlpha = renderer.getClearAlpha(), savedAutoClear = renderer.autoClear;
      renderer.getClearColor(savedClear);
      try {
        renderer.setRenderTarget(null);
        renderer.copyFramebufferToTexture(frameTexture);
        earth.updateWorldMatrix(true, false);
        occluder.matrix.copy(earth.matrixWorld);
        ring.bloomRoot.matrix.copy(ring.root.matrixWorld);
        portraitOccluder?.update();
        renderer.setRenderTarget(target);
        renderer.setClearColor(0x000000, 0);
        renderer.autoClear = true;
        renderer.render(source, camera);
        bloom.render(renderer, target, target, dt, false);
        renderer.setRenderTarget(null);
        renderer.autoClear = false;
        quad.render(renderer);
      } finally {
        renderer.setRenderTarget(savedTarget);
        renderer.setClearColor(savedClear, savedAlpha);
        renderer.autoClear = savedAutoClear;
      }
    },
    dispose() {
      source.remove(ring.bloomRoot, occluder);
      portraitOccluder?.dispose();
      occluderMaterial.dispose(); target.dispose(); bloom.dispose();
      frameTexture?.dispose(); compositeMaterial.dispose(); quad.dispose();
    },
  };
}
