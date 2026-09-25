import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { RuntimeProvider } from './RuntimeProvider';
import DesktopTitleBar from './DesktopTitleBar';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function LocationProbe() {
  return <output data-testid="route">{useLocation().pathname}</output>;
}

it('keeps Windows menus separate from the Meewav branding and page title', async () => {
  const windowControl = vi.fn(async (_action: string) => true);
  const windowMenu = vi.fn(async (_action: string) => true);
  vi.stubGlobal('meewavDesktop', {
    version: 1,
    getCapabilities: async () => ({ runtime: 'desktop-windows', screenCapture: true, windowCapture: true, systemAudioCapture: false, professionalAudioDriver: false }),
    windowControl,
    windowMenu,
  });
  render(<RuntimeProvider><MemoryRouter initialEntries={['/rooms/home']}><DesktopTitleBar /><LocationProbe /></MemoryRouter></RuntimeProvider>);
  const bar = await screen.findByRole('banner', { name: 'Barre de fenêtre Meewav' });
  expect(within(bar).queryByAltText('Meewav')).not.toBeInTheDocument();
  expect(within(bar).queryByText('Rooms')).not.toBeInTheDocument();
  expect(within(bar).getByRole('navigation', { name: 'Menus Meewav' })).toBeInTheDocument();
  fireEvent.click(within(bar).getByRole('button', { name: 'Affichage' }));
  fireEvent.click(within(bar).getByRole('menuitem', { name: 'Recharger' }));
  expect(windowMenu).toHaveBeenCalledWith('reload');
  const field = document.createElement('input');
  document.body.append(field);
  field.focus();
  fireEvent.click(within(bar).getByRole('button', { name: 'Modifier' }));
  const copy = within(bar).getByRole('menuitem', { name: 'Copier' });
  copy.focus();
  fireEvent.click(copy);
  expect(document.activeElement).toBe(field);
  expect(windowMenu).toHaveBeenCalledWith('copy');
  field.remove();
  expect(screen.getByTestId('route')).toHaveTextContent('/rooms/home');
  fireEvent.click(within(bar).getByRole('button', { name: 'Fichier' }));
  fireEvent.click(within(bar).getByRole('menuitem', { name: 'Accueil Meewav' }));
  expect(screen.getByTestId('route')).toHaveTextContent('/globe');
  fireEvent.click(within(bar).getByRole('button', { name: 'Réduire la fenêtre' }));
  fireEvent.click(within(bar).getByRole('button', { name: 'Agrandir ou restaurer la fenêtre' }));
  fireEvent.click(within(bar).getByRole('button', { name: 'Fermer la fenêtre' }));
  expect(windowControl.mock.calls.map(([action]) => action)).toEqual(['minimize', 'toggle-maximize', 'close']);
});

it('does not add window chrome to the Web runtime', () => {
  render(<RuntimeProvider><MemoryRouter><DesktopTitleBar /></MemoryRouter></RuntimeProvider>);
  expect(screen.queryByRole('banner', { name: 'Barre de fenêtre Meewav' })).not.toBeInTheDocument();
});
