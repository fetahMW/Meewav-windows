import { fireEvent, render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import VinylGlobe from './VinylGlobe';
import { installHostBridge } from '../../../vendor/globe-vinyle/shared/src/host-bridge';
vi.mock('../../../vendor/meewav-vinyl/src/GlobeLoading', () => ({default: () => <div role="status">Chargement</div>}));

it('transmet le quartier après le premier rendu du globe et une seule fois',async()=>{
  const arrival:any={createdAt:1,profile:{profileId:'test-user'},city:{communeCode:'75056'},scene:{zoneId:'fr-paris-7510704',center:[2.294694,48.858093],source:'iris'}};
  const view=render(<MemoryRouter><VinylGlobe arrival={arrival}/></MemoryRouter>);
  const frame=screen.getByTitle('Globe MeeWav et artistes légendaires') as HTMLIFrameElement;
  const post=vi.spyOn(frame.contentWindow!,'postMessage');
  expect(post).not.toHaveBeenCalled();
  await act(async()=>fireEvent(window,new MessageEvent('message',{origin:window.location.origin,source:frame.contentWindow,data:{channel:'meewav:vinyl-globe:v1',type:'ready'}})));
  expect(post).toHaveBeenCalledWith(expect.objectContaining({type:'scene-arrival',scene:expect.objectContaining({zoneId:'fr-paris-7510704',cityCode:'75056'})}),window.location.origin);
  view.rerender(<MemoryRouter><VinylGlobe arrival={{...arrival}}/></MemoryRouter>);
  expect(post.mock.calls.filter(([message])=>message.type==='scene-arrival')).toHaveLength(1);
});

it('le pont refuse une autre origine ou un quartier qui ne correspond pas à la ville',()=>{
  const cleanup=installHostBridge(),onScene=vi.fn();document.addEventListener('globelab-scene-arrival',onScene);
  const message={channel:'meewav:vinyl-globe:v1',type:'scene-arrival',scene:{cityCode:'75056',zoneId:'fr-paris-7510704',center:[2.3,48.85]}};
  fireEvent(window,new MessageEvent('message',{origin:'https://example.org',source:window.parent,data:message}));
  fireEvent(window,new MessageEvent('message',{origin:window.location.origin,source:window.parent,data:{...message,scene:{...message.scene,cityCode:'06088'}}}));
  expect(onScene).not.toHaveBeenCalled();
  fireEvent(window,new MessageEvent('message',{origin:window.location.origin,source:window.parent,data:message}));
  expect(onScene).toHaveBeenCalledTimes(1);cleanup();document.removeEventListener('globelab-scene-arrival',onScene);
});
