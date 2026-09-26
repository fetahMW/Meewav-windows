import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { VideoPreviewEditor, VideoSceneControls } from './VideoSceneEditor';
import type { VideoScene } from '../../../runtime/videoScene';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function Editor({ initial }: { initial: VideoScene }) {
  const [scene, setScene] = useState(initial);
  return <><VideoPreviewEditor scene={scene} onChange={setScene}><video /></VideoPreviewEditor>
    <VideoSceneControls scene={scene} onChange={setScene} sources={[{ id: 'cam', name: 'Caméra USB' }, { id: 'screen', name: 'Fenêtre musique' }]} />
    <output data-testid="scene">{JSON.stringify(scene)}</output></>;
}
const current = () => JSON.parse(screen.getByTestId('scene').textContent!) as VideoScene;
function choose(label: string, option: string) {
  fireEvent.click(screen.getByRole('combobox', { name: label }));
  fireEvent.click(screen.getByRole('option', { name: option }));
}

it('assigns a captured window to B without shifting it into the empty A slot', () => {
  render(<Editor initial={{ layout: 'split', sourceIds: [] }} />);
  choose('Source de la zone B', 'Fenêtre musique');
  expect(current().sourceIds).toEqual(['', 'screen']);
  choose('Source de la zone A', 'Caméra USB');
  expect(current().sourceIds).toEqual(['cam', 'screen']);
  fireEvent.change(screen.getByLabelText('Position du séparateur A B'), { target: { value: '65' } });
  expect(current().splitRatio).toBe(.65);
  choose('Cadrage de la zone B', 'Remplir la zone');
  expect(current().fits?.[1]).toBe('cover');
});

it('resizes and moves the miniature with controls and keyboard', () => {
  render(<Editor initial={{ layout: 'pip', sourceIds: ['screen', 'cam'], pipPosition: { x: .5, y: .5 } }} />);
  fireEvent.change(screen.getByLabelText('Taille de la miniature'), { target: { value: '60' } });
  expect(current().pipScale).toBe(.6);
  const miniature = screen.getByRole('group', { name: /^Zone B/ });
  fireEvent.keyDown(miniature, { key: 'ArrowRight' });
  expect(current().pipPosition!.x).toBeCloseTo(.55);
  fireEvent.keyDown(miniature, { key: 'ArrowRight', shiftKey: true });
  expect(current().pipScale).toBeCloseTo(.62);
});

it('moves and resizes a free zone by pointer, then retains geometry when bringing it forward', () => {
  vi.stubGlobal('PointerEvent', MouseEvent);
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200, toJSON: () => ({}) });
  render(<Editor initial={{ layout: 'free', sourceIds: ['cam', 'screen'], frames: [{ x: 0, y: 0, width: .4, height: .4 }, { x: .5, y: .5, width: .4, height: .4 }] }} />);
  const first = screen.getByRole('group', { name: /^Zone A/ });
  fireEvent.pointerDown(first, { clientX: 10, clientY: 10 });
  fireEvent.pointerMove(first, { clientX: 50, clientY: 30 });
  fireEvent.pointerUp(first);
  expect(current().frames?.[0]).toMatchObject({ x: .1, y: .1 });
  fireEvent.pointerDown(first.querySelector('[data-resize]')!, { clientX: 160, clientY: 80 });
  fireEvent.pointerMove(first, { clientX: 200, clientY: 100 });
  fireEvent.pointerUp(first);
  expect(current().frames?.[0]).toMatchObject({ width: .5, height: .5 });
  fireEvent.click(screen.getAllByRole('button', { name: 'Mettre au premier plan' })[0]);
  expect(current().sourceIds).toEqual(['screen', 'cam']);
  expect(current().frames?.[1]).toEqual({ x: .1, y: .1, width: .5, height: .5 });
});
