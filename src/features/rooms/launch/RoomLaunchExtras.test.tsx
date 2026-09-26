import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import RoomLaunchExtras from './RoomLaunchExtras';
import { defaultRoomLaunch, type RoomLaunchType } from './roomLaunch';
const mocks = vi.hoisted(() => ({ contacts: vi.fn(), search: vi.fn() }));
vi.mock('../../messaging/messaging.service', () => ({ messagingRepository: { listConversations: mocks.contacts, searchMessageableProfiles: mocks.search } }));
afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });
function Form({ type }: { type: RoomLaunchType }) {
  const [config, setConfig] = useState(defaultRoomLaunch(type));
  return <><RoomLaunchExtras config={config} scope="host" onChange={setConfig} /><output data-testid="config">{JSON.stringify(config)}</output></>;
}
it('selects, removes and preserves contacts while changing seat access without sending invitations', async () => {
  mocks.contacts.mockResolvedValue([{ counterpart_profile_id: 'louna', counterpart_display_name: 'Louna' }, { counterpart_profile_id: 'louna', counterpart_display_name: 'Louna' }, { counterpart_profile_id: 'host', counterpart_display_name: 'Host' }]);
  render(<Form type="classe" />);
  expect(mocks.contacts).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Attribution des places'), { target: { value: 'mixed' } });
  const contact = await screen.findByRole('checkbox', { name: 'Louna' });
  fireEvent.click(contact);
  expect(contact).toBeChecked();
  expect(screen.getByText('1 / 24 réservées')).toBeVisible();
  fireEvent.change(screen.getByLabelText('Tarif du cours'), { target: { value: 'paid' } });
  fireEvent.change(screen.getByLabelText('Prix par place (€)'), { target: { value: '12.50' } });
  expect(JSON.parse(screen.getByTestId('config').textContent!).classroom).toMatchObject({ priceCents: 1250, pricing: 'paid', students: [{ id: 'louna' }] });
  fireEvent.click(screen.getByRole('button', { name: 'Retirer Louna' }));
  expect(contact).not.toBeChecked();
});
it('recovers from contact lookup failure', async () => {
  mocks.contacts.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([]);
  render(<Form type="classe" />);
  fireEvent.change(screen.getByLabelText('Attribution des places'), { target: { value: 'contacts' } });
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  await screen.findByText(/Aucun contact trouvé/);
});
it('imports a saved setlist into the editable program', () => {
  localStorage.setItem('meewav-profile-setlists-v3:host', JSON.stringify([{ id: 'my-set', title: 'Mon set', tracks: [{ title: 'Intro', artist: 'Louna', duration: '1:30' }, { title: 'Final', artist: 'Kenza', duration: '3:00' }] }]));
  render(<Form type="scene" />);
  fireEvent.change(screen.getByLabelText('Importer une setlist'), { target: { value: 'my-set' } });
  expect(JSON.parse(screen.getByTestId('config').textContent!)).toMatchObject({ values: { program: 'Intro\nFinal' }, setlist: { id: 'my-set', tracks: [{ durationSeconds: 90 }, { durationSeconds: 180 }] } });
});
