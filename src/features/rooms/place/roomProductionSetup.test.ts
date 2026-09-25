import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readRoomProductionSetup, saveRoomProductionSetup, type RoomProductionSetup } from './roomProductionSetup';

const key = (roomId: string) => `meewav:room-production-setup:v1:${roomId}`;

beforeEach(() => sessionStorage.clear());
afterEach(() => sessionStorage.clear());

describe('room production setup persistence', () => {
  it('round trips the complete free composition and keeps it scoped to its room', () => {
    const setup: RoomProductionSetup = {
      cameraId: 'camera-device', microphoneId: 'microphone-device', musicInputId: 'music-device',
      cameraIds: ['camera-device'], layout: 'free', pipPosition: { x: 0.4, y: 0.7 },
      pipScale: 0.45, splitRatio: 0.62,
      frames: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.4 }], fits: ['cover'],
      sourceKeys: ['camera:camera-device'],
    };

    saveRoomProductionSetup('room-one', setup);

    expect(readRoomProductionSetup('room-one')).toEqual(setup);
    expect(readRoomProductionSetup('room-two')).toBeNull();
  });

  it('accepts the previous setup schema and leaves newer composition fields unset', () => {
    sessionStorage.setItem(key('legacy'), JSON.stringify({
      cameraId: 'cam', microphoneId: 'mic', cameraIds: ['cam'], layout: 'pip',
      pipPosition: { x: 0.25, y: 0.75 },
    }));

    expect(readRoomProductionSetup('legacy')).toEqual({
      cameraId: 'cam', microphoneId: 'mic', musicInputId: '', cameraIds: ['cam'], layout: 'pip',
      pipPosition: { x: 0.25, y: 0.75 }, pipScale: undefined, splitRatio: undefined,
      frames: undefined, fits: undefined, sourceKeys: undefined,
    });
  });

  it('rejects invalid layouts and malformed stored JSON', () => {
    sessionStorage.setItem(key('bad-layout'), JSON.stringify({ layout: 'panorama' }));
    sessionStorage.setItem(key('bad-json'), '{');

    expect(readRoomProductionSetup('bad-layout')).toBeNull();
    expect(readRoomProductionSetup('bad-json')).toBeNull();
  });

  it('normalizes invalid and out-of-range composition values when reading storage', () => {
    sessionStorage.setItem(key('normalized'), JSON.stringify({
      cameraId: 42, microphoneId: null, musicInputId: false,
      cameraIds: ['one', 2, 'two', ...Array.from({ length: 10 }, (_, index) => `camera-${index}`)],
      layout: 'free', pipScale: 2, splitRatio: -1,
      pipPosition: { x: 3, y: -2 },
      frames: [
        { x: 0.9, y: 0.8, width: 0.4, height: 0.5 },
        null,
        { x: Number.NaN, y: Number.POSITIVE_INFINITY, width: -2, height: 2 },
      ],
      fits: ['cover', 'stretch', null],
      sourceKeys: ['camera-one', 9, 'screen-two'],
    }));

    const setup = readRoomProductionSetup('normalized');
    expect(setup).toMatchObject({
      cameraId: '', microphoneId: '', musicInputId: '', layout: 'free',
      cameraIds: ['one', 'two', 'camera-0', 'camera-1', 'camera-2', 'camera-3', 'camera-4', 'camera-5', 'camera-6'],
      pipScale: 0.75, splitRatio: 0.2, pipPosition: { x: 1, y: 0 },
      frames: [
        { x: 0.6, y: 0.5, width: 0.4, height: 0.5 },
        { x: 0, y: 0, width: 0.5, height: 0.5 },
        { x: 0, y: 0, width: 0.1, height: 1 },
      ],
      fits: ['cover', 'contain', 'contain'], sourceKeys: ['camera-one', '', 'screen-two'],
    });
  });
});
