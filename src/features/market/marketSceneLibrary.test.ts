import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { marketProducts, marketProductViews, marketSellers } from './marketDemoData';
import { getMarketSceneImage } from './marketSceneLibrary';
import { buildMarketWallSequence } from './marketWallSequence';

describe('Marketplace demonstration library', () => {
  it('resolves every selected scene to a bundled photo', () => {
    const staged = marketProductViews.filter(product => product.imageUrl.includes('/scenes/'));
    expect(staged.length).toBeGreaterThan(0);
    for (const product of staged) expect(existsSync(resolve('public', product.imageUrl.slice(1))), product.id).toBe(true);
  });

  it('keeps seller identities consistent between catalogue records and detail views', () => {
    for (const product of marketProducts) {
      const view = marketProductViews.find(candidate => candidate.id === product.id)!;
      expect(view.seller).toBe(marketSellers[product.sellerId]);
      if (product.pillarId === 'new') expect(view.seller.kind).toBe('store');
      if (product.pillarId === 'used') expect(view.seller.kind).toBe('artist');
    }
  });

  it('does not assign a photo to an unrelated instrument', () => {
    expect(getMarketSceneImage({id:'unmatched',title:'Piano droit Yamaha',pillarId:'new'})).toBeUndefined();
    expect(getMarketSceneImage({id:'unmatched',title:'Fender Telecaster',pillarId:'used'})).toBeUndefined();
  });

  it('spaces reused photos without removing any listing', () => {
    const items = [{id:'a',imageUrl:'a.webp'},{id:'b',imageUrl:'a.webp'},{id:'c',imageUrl:'c.webp'}];
    expect(buildMarketWallSequence(items).map(item => item.id)).toEqual(['a','c','b']);
    expect(items.map(item => item.id)).toEqual(['a','b','c']);
  });
});
