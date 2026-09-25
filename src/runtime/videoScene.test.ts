import { describe, expect, it } from 'vitest';
import { constrainFrame, copyScene, sceneFrames, type VideoScene } from './videoScene';

describe('video scene geometry', () => {
  it('clamps frame size and position so the frame stays inside the canvas', () => {
    expect(constrainFrame({ x: 0.9, y: -0.2, width: 0.4, height: 0.2 })).toEqual({
      x: 0.6, y: 0, width: 0.4, height: 0.2,
    });
    expect(constrainFrame({ x: 4, y: 0.4, width: 3, height: 0 })).toEqual({
      x: 0, y: 0.4, width: 1, height: 0.1,
    });
    expect(constrainFrame({ x: Number.NaN, y: Number.POSITIVE_INFINITY, width: Number.NaN, height: 0.5 })).toEqual({
      x: 0, y: 0, width: 0.1, height: 0.5,
    });
  });

  it('keeps split and picture-in-picture geometry within supported bounds', () => {
    const split = sceneFrames({ layout: 'split', sourceIds: ['a', 'b'], splitRatio: 0.95 });
    expect(split).toEqual([
      { x: 0, y: 0, width: 0.8, height: 1 },
      { x: 0.8, y: 0, width: 0.19999999999999996, height: 1 },
    ]);

    const pip = sceneFrames({ layout: 'pip', sourceIds: ['a', 'b'], pipPosition: { x: 2, y: -1 }, pipScale: 0.9 });
    expect(pip).toEqual([
      { x: 0, y: 0, width: 1, height: 1 },
      { x: 0.25, y: 0, width: 0.75, height: 0.75 },
    ]);
  });

  it('constrains custom frames and uses grid slots for missing free-layout frames', () => {
    const frames = sceneFrames({
      layout: 'free', sourceIds: ['a', 'b', 'c'],
      frames: [{ x: 0.8, y: 0.9, width: 0.4, height: 0.3 }],
    });
    expect(frames).toEqual([
      { x: 0.6, y: 0.7, width: 0.4, height: 0.3 },
      { x: 0.5, y: 0, width: 0.5, height: 0.5 },
      { x: 0, y: 0.5, width: 0.5, height: 0.5 },
    ]);
  });

  it('copies all nested scene data so edits cannot mutate the original scene', () => {
    const original: VideoScene = {
      layout: 'free', sourceIds: ['camera', 'screen'],
      pipPosition: { x: 0.2, y: 0.3 }, pipScale: 0.4, splitRatio: 0.6,
      frames: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.4 }], fits: ['cover', 'contain'],
    };
    const copied = copyScene(original);
    copied.sourceIds[0] = 'changed';
    copied.pipPosition!.x = 0.9;
    copied.frames![0].width = 0.8;
    copied.fits![0] = 'contain';

    expect(original).toMatchObject({
      sourceIds: ['camera', 'screen'], pipPosition: { x: 0.2, y: 0.3 },
      frames: [{ width: 0.3 }], fits: ['cover', 'contain'],
    });
    expect(copied).not.toBe(original);
    expect(copied.frames).not.toBe(original.frames);
  });
});
