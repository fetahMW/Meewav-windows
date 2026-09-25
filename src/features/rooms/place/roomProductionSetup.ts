import { clamp, constrainFrame, type VideoLayout, type VideoPosition, type VideoFrame } from '../../../runtime/videoScene';

export type RoomProductionSetup = {
  cameraId: string;
  microphoneId: string;
  musicInputId?: string;
  cameraIds: string[];
  layout: VideoLayout;
  pipPosition?: VideoPosition;
  pipScale?: number;
  splitRatio?: number;
  frames?: VideoFrame[];
  fits?: Array<'contain' | 'cover'>;
  sourceKeys?: string[];
};

const storageKey = (roomId: string) => `meewav:room-production-setup:v1:${roomId}`;

export function saveRoomProductionSetup(roomId: string, setup: RoomProductionSetup) {
  try { sessionStorage.setItem(storageKey(roomId), JSON.stringify(setup)); }
  catch { /* A private session may disable storage. */ }
}

export function readRoomProductionSetup(roomId: string): RoomProductionSetup | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey(roomId)) ?? 'null');
    if (!value || !['full', 'split', 'pip', 'grid', 'free'].includes(value.layout)) return null;
    return {
      cameraId: typeof value.cameraId === 'string' ? value.cameraId : '',
      microphoneId: typeof value.microphoneId === 'string' ? value.microphoneId : '',
      musicInputId: typeof value.musicInputId === 'string' ? value.musicInputId : '',
      cameraIds: Array.isArray(value.cameraIds) ? value.cameraIds.filter((id: unknown) => typeof id === 'string').slice(0, 9) : [],
      layout: value.layout,
      pipScale: typeof value.pipScale === 'number' ? clamp(value.pipScale, .15, .75) : undefined,
      splitRatio: typeof value.splitRatio === 'number' ? clamp(value.splitRatio, .2, .8) : undefined,
      sourceKeys: Array.isArray(value.sourceKeys) ? value.sourceKeys.slice(0, 9).map((key: unknown) => typeof key === 'string' ? key : '') : undefined,
      fits: Array.isArray(value.fits) ? value.fits.slice(0, 9).map((fit: unknown) => fit === 'cover' ? 'cover' : 'contain') : undefined,
      frames: Array.isArray(value.frames) ? value.frames.slice(0, 9).map((frame: Partial<VideoFrame> | null) => constrainFrame({ x: frame?.x ?? 0, y: frame?.y ?? 0, width: frame?.width ?? .5, height: frame?.height ?? .5 })) : undefined,
      pipPosition: value.pipPosition && Number.isFinite(value.pipPosition.x) && Number.isFinite(value.pipPosition.y)
        ? { x: Math.min(1, Math.max(0, value.pipPosition.x)), y: Math.min(1, Math.max(0, value.pipPosition.y)) }
        : undefined,
    };
  } catch { return null; }
}
