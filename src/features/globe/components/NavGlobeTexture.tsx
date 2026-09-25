import { memo, useEffect, useRef } from "react";

/** Rasterise the map once; animate only two subpixel canvas draws per frame. */
export default memo(function NavGlobeTexture() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    let disposed = false;
    let frame = 0;
    let start: number | null = null;
    let texture: HTMLCanvasElement | null = null;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const map = new Image();
    const draw = (now: number) => {
      if (disposed || !texture) return;
      if (start === null) start = now;
      const offset = reduced.matches ? 0 : ((now - start) / 36000 % 1) * 72;
      context.clearRect(0, 0, 38, 38);
      context.drawImage(texture, -offset, 0, 72, 38);
      context.drawImage(texture, 72 - offset, 0, 72, 38);
      if (!reduced.matches && !document.hidden) frame = requestAnimationFrame(draw);
    };
    const resume = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden && texture) frame = requestAnimationFrame(draw);
    };
    map.onload = () => {
      if (disposed) return;
      // Bake the land mask into alpha. No live CSS filter or blend layer.
      texture = document.createElement("canvas");
      texture.width = map.naturalWidth;
      texture.height = map.naturalHeight;
      const bake = texture.getContext("2d");
      if (!bake) return;
      bake.drawImage(map, 0, 0);
      const pixels = bake.getImageData(0, 0, texture.width, texture.height);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const luminance = (pixels.data[i] + pixels.data[i + 1] + pixels.data[i + 2]) / 3;
        const land = Math.max(0, Math.min(1, ((1 - luminance / 255) - .5) * 1.3 + .5));
        // Same opaque piano-black land as the finalized vinyl globe.
        pixels.data[i] = 8;
        pixels.data[i + 1] = 9;
        pixels.data[i + 2] = 11;
        pixels.data[i + 3] = Math.round(land * 255);
      }
      bake.putImageData(pixels, 0, 0);
      const scale = Math.max(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(38 * scale);
      canvas.height = Math.round(38 * scale);
      context.setTransform(scale, 0, 0, scale, 0, 0);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      resume();
    };
    map.src = "/images/earth_specular.jpg";
    document.addEventListener("visibilitychange", resume);
    reduced.addEventListener("change", resume);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      map.onload = null;
      document.removeEventListener("visibilitychange", resume);
      reduced.removeEventListener("change", resume);
    };
  }, []);
  return <canvas ref={canvasRef} className="meewav-primary-nav__globe-map" aria-hidden="true" />;
});
