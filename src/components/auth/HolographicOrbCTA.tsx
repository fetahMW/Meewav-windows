import { useRef, useState, useEffect } from "react";
import * as THREE from "three";
import { NAVBAR_GLOBE_PALETTE } from "../../../vendor/globe-vinyle/shared/src/globe-palette.mjs";
import { vinylRecordLayout, createVinylRecordGeometry } from "../../../vendor/globe-vinyle/shared/src/vinyl-record-geometry.mjs";
import { createVinylRecordMaterial } from "../../../vendor/globe-vinyle/shared/src/vinyl-record-material.mjs";
import earthMaskUrl from "../../../vendor/globe-vinyle/assets/ui/images/earth_specular.jpg?inline";
import "./HolographicOrbCTA.css";

type HolographicOrbCTAProps = {
  active: boolean;
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
  label?: string;
  visible?: boolean;
  alert?: React.ReactNode;
};

// Bake the same ocean/land mask into an sRGB map once. A basic material keeps
// the miniature readable independently of the rotating record's optical shader.
function createGlobeMap(image: HTMLImageElement): THREE.CanvasTexture | null {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const rgb = (hex: string) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  const ocean = rgb(NAVBAR_GLOBE_PALETTE.ocean);
  const land = rgb(NAVBAR_GLOBE_PALETTE.land);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const color = pixels.data[i] >= 128 ? ocean : land;
    pixels.data[i] = color[0];
    pixels.data[i + 1] = color[1];
    pixels.data[i + 2] = color[2];
    pixels.data[i + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  return map;
}

function HolographicGlobeCanvas({ active, loading }: { active: boolean; loading: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active);
  const loadingRef = useRef(loading);

  useEffect(() => {
    activeRef.current = active;
    loadingRef.current = loading;
  }, [active, loading]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let frame = 0;
    let previousFrameAt = performance.now();
    let texture: THREE.Texture | null = null;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
      powerPreference: "high-performance",
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0, 9);

    const globeGeometry = new THREE.SphereGeometry(1.5, 96, 96);
    const globeMaterial = new THREE.MeshBasicMaterial({
      color: NAVBAR_GLOBE_PALETTE.ocean,
      toneMapped: false,
    });
    const globe = new THREE.Mesh(globeGeometry, globeMaterial);
    scene.add(globe);

    // The miniature uses the active globe's pressed geometry and optical material.
    const recordLayout = vinylRecordLayout("low");
    const recordGeometry = createVinylRecordGeometry(recordLayout);
    const recordMaterial = createVinylRecordMaterial(recordLayout);
    const record = new THREE.Mesh(recordGeometry, recordMaterial);
    record.scale.setScalar(1.5 / 100);
    const recordAxis = new THREE.Group();
    recordAxis.rotation.set(0.36, 0, 0.28);
    recordAxis.add(record);
    scene.add(recordAxis);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let recordRotation = 0;
    globe.rotation.set(0.35, -Math.PI / 2, 0);

    const rimGeometry = new THREE.SphereGeometry(1.5, 64, 64);
    const rimMaterial = new THREE.MeshBasicMaterial({
      color: "#8B5CF6",
      transparent: true,
      opacity: 0.16,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const rim = new THREE.Mesh(rimGeometry, rimMaterial);
    rim.scale.setScalar(1.025);
    scene.add(rim);


    const resize = () => {
      const width = Math.max(1, canvas.clientWidth);
      const height = Math.max(1, canvas.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();

    // Embedded with the component: no separate public URL can leave a black
    // fallback sphere behind after navigation or deployment.
    new THREE.ImageLoader().load(earthMaskUrl, (image) => {
      if (disposed) return;
      texture = createGlobeMap(image);
      if (!texture) return;
      globeMaterial.color.set(0xffffff);
      globeMaterial.map = texture;
      globeMaterial.needsUpdate = true;
    }, undefined, (error) => {
      console.warn("[auth globe] Carte de la miniature indisponible.", error);
    });

    const renderFrame = (now: number) => {
      if (disposed) return;
      const delta = Math.min((now - previousFrameAt) / 1000, 0.1);
      previousFrameAt = now;

      if (!reducedMotion.matches && !document.hidden && (activeRef.current || loadingRef.current)) {
        globe.rotation.y -= delta * (Math.PI * 2 / 36);
        recordRotation -= delta * (Math.PI * 2 / 72);
        record.rotation.y = recordRotation;
        // Keep the reflection pattern in record-local space so it turns with
        // the grooves, rather than remaining under fixed studio lights.
        recordMaterial.uniforms.uReflectionSurfaceRotation.value = recordRotation;
      }
      rim.rotation.copy(globe.rotation);

      renderer.render(scene, camera);
      frame = requestAnimationFrame(renderFrame);
    };
    frame = requestAnimationFrame(renderFrame);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      texture?.dispose();
      recordGeometry.dispose();
      recordMaterial.dispose();
      globeGeometry.dispose();
      globe.material.dispose();
      rimGeometry.dispose();
      rimMaterial.dispose();
      renderer.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" />;
}

export default function HolographicOrbCTA({
  active,
  loading = false,
  disabled = false,
  onClick,
  label = "Créer mon compte",
  visible = true,
  alert,
}: HolographicOrbCTAProps) {
  const isDisabled = disabled || loading || !active;

  const [localAlert, setLocalAlert] = useState<React.ReactNode | null>(null);
  const [isHiding, setIsHiding] = useState(false);

  useEffect(() => {
    if (alert) {
      setLocalAlert(alert);
      setIsHiding(false);
    } else if (localAlert) {
      setIsHiding(true);
      const timer = setTimeout(() => {
        setLocalAlert(null);
        setIsHiding(false);
      }, 400); // 400ms match transition time
      return () => clearTimeout(timer);
    }
  }, [alert]);

  return (
    <div
      className={[
        "holographic-orb-cta",
        active ? "is-active" : "is-idle",
        loading ? "is-loading" : "",
        visible ? "is-visible" : "is-hidden",
      ].join(" ")}
    >
      <div className="holographic-orb-cta__copy" aria-hidden={!active}>
        <div className="holographic-orb-cta__title">Ta scène est prête</div>
        <div className="holographic-orb-cta__subtitle">Entre sur le globe</div>
        <div className="holographic-orb-cta__arrows" aria-hidden="true">
          <span>↓</span>
          <span>↓</span>
        </div>
      </div>

      <button
        type="button"
        className="holographic-orb-cta__button"
        onClick={onClick}
        disabled={isDisabled}
        aria-label={label}
        aria-disabled={isDisabled}
        aria-busy={loading}
      >
        {visible && <HolographicGlobeCanvas active={active} loading={loading} />}
      </button>

      {/* Render the alert centered below the 3D globe button with premium entrance/exit animations */}
      {localAlert && (
        <div className={`holographic-orb-alert-container ${isHiding ? "is-hiding" : "is-showing"}`}>
          {localAlert}
        </div>
      )}
    </div>
  );
}
