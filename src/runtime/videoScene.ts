export type VideoLayout = 'full' | 'split' | 'pip' | 'grid' | 'free';
export type VideoPosition = { x: number; y: number };
export type VideoFrame = VideoPosition & { width: number; height: number };
export type VideoScene = {
  layout: VideoLayout; sourceIds: string[]; pipPosition?: VideoPosition;
  pipScale?: number; splitRatio?: number; frames?: VideoFrame[];
  fits?: Array<'contain' | 'cover'>;
};
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
export function constrainFrame(frame: VideoFrame): VideoFrame {
  const width = clamp(frame.width, .1, 1), height = clamp(frame.height, .1, 1);
  return { width, height, x: clamp(frame.x, 0, 1 - width), y: clamp(frame.y, 0, 1 - height) };
}
export function sceneFrames(scene: VideoScene): VideoFrame[] {
  if (scene.layout === 'full') return [{ x: 0, y: 0, width: 1, height: 1 }];
  if (scene.layout === 'pip') {
    const size = clamp(scene.pipScale ?? .3, .15, .75);
    return [{ x: 0, y: 0, width: 1, height: 1 }, { x: (1 - size) * clamp(scene.pipPosition?.x ?? .973, 0, 1), y: (1 - size) * clamp(scene.pipPosition?.y ?? .952, 0, 1), width: size, height: size }];
  }
  if (scene.layout === 'split') {
    const ratio = clamp(scene.splitRatio ?? .5, .2, .8);
    return [{ x: 0, y: 0, width: ratio, height: 1 }, { x: ratio, y: 0, width: 1 - ratio, height: 1 }];
  }
  const count = Math.min(9, Math.max(scene.layout === 'grid' ? 4 : 2, scene.sourceIds.length));
  const columns = Math.ceil(Math.sqrt(count)), rows = Math.ceil(count / columns);
  return Array.from({ length: count }, (_, i) => scene.layout === 'free' && scene.frames?.[i]
    ? constrainFrame(scene.frames[i])
    : { x: i % columns / columns, y: Math.floor(i / columns) / rows, width: 1 / columns, height: 1 / rows });
}
export function copyScene(scene: VideoScene): VideoScene {
  return { ...scene, sourceIds: [...scene.sourceIds], pipPosition: scene.pipPosition && { ...scene.pipPosition }, frames: scene.frames?.map((frame) => ({ ...frame })), fits: scene.fits && [...scene.fits] };
}

/** Keep slot identity stable while reusing empty zones, capped at nine sources. */
export function selectSceneSource(ids: string[], id: string, enabled: boolean): string[] {
  const next = ids.slice(0, 9);
  if (!enabled) return next.map((value) => value === id ? '' : value);
  if (next.includes(id)) return next;
  const empty = next.findIndex((value) => !value);
  if (empty >= 0) next[empty] = id;
  else if (next.length < 9) next.push(id);
  return next;
}
