import { createRef } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import CageLaunchDialog from './CageLaunchDialog';
import { RuntimeProvider } from '../../../runtime/RuntimeProvider';

vi.mock('../../auth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../place/RoomProductionPreparation', () => ({ default: () => <section aria-label="Studio Meewav · préparation de la Room" /> }));
vi.mock('../place/GreenHouse', () => ({ default: () => <div>Green Room</div> }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('keeps Cage format and rules in Configuration before Studio and direct launch', async () => {
  vi.stubGlobal('meewavDesktop', {
    version: 1,
    getCapabilities: async () => ({ runtime: 'desktop-windows', screenCapture: true, windowCapture: true, systemAudioCapture: false, professionalAudioDriver: false }),
  });
  render(<RuntimeProvider><CageLaunchDialog closeRef={createRef()} onClose={() => undefined} /></RuntimeProvider>);
  expect(await screen.findByText('Studio Meewav')).toBeInTheDocument();
  expect(screen.queryByLabelText('Format')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
  expect(screen.getByLabelText('Format')).toBeVisible();
  expect(screen.getByLabelText('Participants')).toBeVisible();
  expect(screen.getByLabelText('Durée d’un passage')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
  expect(screen.getByRole('region', { name: 'Studio Meewav · préparation de la Room' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
  expect(screen.getByRole('region', { name: 'Lancement de la Room' })).toBeVisible();
  expect(screen.queryByText('Résumé')).not.toBeInTheDocument();
  expect(screen.queryByText('Green Room')).not.toBeInTheDocument();
});
