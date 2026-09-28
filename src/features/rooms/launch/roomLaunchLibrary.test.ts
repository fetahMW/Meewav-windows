import { afterEach, expect, it } from 'vitest';
import { readLaunchSetlists } from './roomLaunchLibrary';
afterEach(() => localStorage.clear());
it('loads only the account setlists, safely filtering malformed tracks', () => {
  localStorage.setItem('meewav-profile-setlists-v3:host', JSON.stringify([{ id: 'list', title: 'Concert', tracks: [{ title: 'Intro', artist: 'Louna', duration: '1:30' }, { title: 'Solo', duration: 'invalid' }, null, { title: ' ' }] }, { id: 'empty', title: 'Vide', tracks: [] }]));
  expect(readLaunchSetlists('another-host')).toEqual([]);
  expect(readLaunchSetlists('host')).toEqual([{ id: 'list', title: 'Concert', tracks: [{ title: 'Intro', artist: 'Louna', durationSeconds: 90 }, { title: 'Solo', artist: '', durationSeconds: 0 }] }]);
  localStorage.setItem('meewav-profile-setlists-v3:host', 'broken');
  expect(readLaunchSetlists('host')).toEqual([]);
});
