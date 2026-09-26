import { createRef } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CageLaunchDialog from './CageLaunchDialog';
import { RuntimeProvider } from '../../../runtime/RuntimeProvider';
import { readCageDemoSession, readCageLaunchTemplates } from './cageLaunch';

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), live: vi.fn(), mode: 'demo' }));
vi.mock('../../auth', () => ({ useAuth: () => ({ user: { id: 'qa-host' } }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('../../../runtime/applicationMode', () => ({ getDesktopApplicationMode: () => mocks.mode }));
vi.mock('./cageLaunch.service', () => ({ launchCageLive: mocks.live }));
vi.mock('../place/RoomProductionPreparation', () => ({ default: ({ onSetupChange, onReadinessChange }: any) => <section aria-label="Studio Meewav · préparation de la Room"><button onClick={() => { onSetupChange({ cameraId: 'camera-qa', microphoneId: 'micro-qa', cameraIds: ['camera-qa'], layout: 'split' }); onReadinessChange({ video: true, microphone: true, music: false, pending: false }); }}>Préparer les sources QA</button></section> }));
vi.mock('../place/GreenHouse', () => ({ default: () => <div>Green Room</div> }));

beforeEach(() => {
  mocks.mode = 'demo'; vi.clearAllMocks();
  mocks.live.mockResolvedValue({ roomId: 'live-cage', sessionId: 'live-session' });
  vi.stubGlobal('meewavDesktop', { version: 1, getCapabilities: async () => ({ runtime: 'desktop-windows', screenCapture: true, windowCapture: true, systemAudioCapture: false, professionalAudioDriver: false }) });
});
afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function prepare() {
  render(<RuntimeProvider><CageLaunchDialog closeRef={createRef()} onClose={() => undefined} /></RuntimeProvider>);
  await screen.findByText('Studio Meewav');
}
const next = () => fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
function choose(label: string, option: string) {
  fireEvent.click(screen.getByRole('combobox', { name: label }));
  fireEvent.click(screen.getByRole('option', { name: option }));
}

it('shows format and rules immediately, preserves them on return, and launches the configured championship', async () => {
  await prepare();
  expect(screen.getByLabelText('Durée d’un passage')).toBeVisible();
  choose('Format', 'Championnat · classement');
  choose('Participants', '8 participants');
  fireEvent.change(screen.getByLabelText('Nombre de jours'), { target: { value: '3' } });
  choose('Qui vote ?', 'Public et jury · 50 / 50');
  choose('Régie', 'Avec un régisseur');
  next();
  expect(screen.getByRole('region', { name: 'Studio Meewav · préparation de la Room' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retour' }));
  expect(screen.getByLabelText('Participants')).toHaveValue('8');
  expect(screen.getByLabelText('Nombre de jours')).toHaveValue(3);
  expect(screen.getByLabelText('Qui vote ?')).toHaveValue('mixed');
  next(); fireEvent.click(screen.getByRole('button', { name: 'Préparer les sources QA' })); next();
  expect(screen.getByRole('region', { name: 'Lancement de la Room' })).toBeVisible();
  expect(screen.queryByText('Green Room')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Ouvrir La Cage' }));
  await waitFor(() => expect(mocks.navigate).toHaveBeenCalledOnce());
  const sessionId = new URL(mocks.navigate.mock.calls[0][0], 'https://local.test').searchParams.get('cageSession');
  expect(readCageDemoSession(sessionId)?.configuration).toMatchObject({ format: 'championship', participantCount: 8, championshipDays: 3, productionTeam: 'regisseur', rules: { votingMode: 'mixed' } });
  expect(sessionStorage.getItem(`meewav:room-production-setup:v1:${sessionId}`)).toContain('micro-qa');
});
it.each(['tournament', 'open-mic-battle', 'open-mic'])('prepares %s without a 16-person requirement', async format => {
  await prepare();
  choose('Format', { tournament: 'Tournoi à élimination', 'open-mic-battle': 'Open Mic Battle · le gagnant reste', 'open-mic': 'Open Mic libre · passages individuels' }[format]!);
  choose('Participants', format === 'open-mic' ? '1 participant' : '4 participants');
  if (format === 'open-mic') {
    next(); expect(screen.getByRole('alert')).toHaveTextContent('retour du public');
    choose('Après chaque passage', 'Sans vote ni classement');
  }
  next(); expect(screen.getByRole('region', { name: 'Studio Meewav · préparation de la Room' })).toBeVisible();
});
it('checks sources for LIVE, then submits the full configuration', async () => {
  mocks.mode = 'live'; await prepare(); next(); next();
  expect(screen.getByRole('button', { name: 'Ouvrir La Cage' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Retour' }));
  fireEvent.click(screen.getByRole('button', { name: 'Préparer les sources QA' })); next();
  fireEvent.click(screen.getByRole('button', { name: 'Ouvrir La Cage' }));
  await waitFor(() => expect(mocks.live).toHaveBeenCalledWith(expect.objectContaining({ format: 'tournament', participantCount: 16 }), expect.any(String)));
  expect(mocks.navigate).toHaveBeenCalledWith('/rooms/cage?room=live-cage');
});
it('keeps private preparations retrievable as templates without publishing', async () => {
  await prepare(); choose('Ouverture', 'Conserver ma préparation en privé'); next();
  fireEvent.click(screen.getByRole('button', { name: 'Préparer les sources QA' })); next();
  fireEvent.click(screen.getByRole('button', { name: 'Valider mon Studio' }));
  expect(await screen.findByRole('heading', { name: 'Ton Studio est prêt' })).toBeVisible();
  expect(readCageLaunchTemplates('qa-host')).toHaveLength(1);
  expect(sessionStorage.getItem(`meewav:room-production-setup:v1:${readCageLaunchTemplates('qa-host')[0].id}`)).toContain('micro-qa');
  expect(mocks.live).not.toHaveBeenCalled(); expect(mocks.navigate).not.toHaveBeenCalled();
});
it('keeps private settings open when storage fails', async () => {
  await prepare(); choose('Ouverture', 'Conserver ma préparation en privé'); next(); next();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError'); });
  fireEvent.click(screen.getByRole('button', { name: 'Valider mon Studio' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('n’a pas pu être enregistrée');
  expect(mocks.navigate).not.toHaveBeenCalled();
});
