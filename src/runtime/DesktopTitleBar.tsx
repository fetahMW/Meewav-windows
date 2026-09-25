import { resetDesktopApplicationMode } from "./applicationMode";
import { Minus, Square, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRuntime, type DesktopBridge } from './RuntimeProvider';
import './desktop-titlebar.css';

type MenuAction = NonNullable<DesktopBridge['windowMenu']> extends (action: infer Action) => Promise<boolean> ? Action : never;
type MenuItem = { label: string; action: MenuAction | 'home' | 'mode' | 'minimize' | 'toggle-maximize' | 'close'; shortcut?: string };
const menus: Array<{ id: string; label: string; items: MenuItem[] }> = [
  { id: 'file', label: 'Fichier', items: [{ label: 'Accueil Meewav', action: 'home' }, { label: 'Changer de mode', action: 'mode' }, { label: 'Fermer la fenêtre', action: 'close', shortcut: 'Alt+F4' }] },
  { id: 'edit', label: 'Modifier', items: [
    { label: 'Annuler', action: 'undo', shortcut: 'Ctrl+Z' }, { label: 'Rétablir', action: 'redo', shortcut: 'Ctrl+Y' },
    { label: 'Couper', action: 'cut', shortcut: 'Ctrl+X' }, { label: 'Copier', action: 'copy', shortcut: 'Ctrl+C' },
    { label: 'Coller', action: 'paste', shortcut: 'Ctrl+V' }, { label: 'Tout sélectionner', action: 'select-all', shortcut: 'Ctrl+A' },
  ] },
  { id: 'view', label: 'Affichage', items: [
    { label: 'Recharger', action: 'reload', shortcut: 'Ctrl+R' }, { label: 'Zoom avant', action: 'zoom-in', shortcut: 'Ctrl++' },
    { label: 'Zoom arrière', action: 'zoom-out', shortcut: 'Ctrl+−' }, { label: 'Taille réelle', action: 'zoom-reset', shortcut: 'Ctrl+0' },
    { label: 'Plein écran', action: 'fullscreen', shortcut: 'F11' },
  ] },
  { id: 'window', label: 'Fenêtre', items: [
    { label: 'Réduire', action: 'minimize' }, { label: 'Agrandir / restaurer', action: 'toggle-maximize' }, { label: 'Fermer', action: 'close', shortcut: 'Alt+F4' },
  ] },
];

export default function DesktopTitleBar() {
  const runtime = useRuntime();
  const navigate = useNavigate();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLElement>(null);
  const lastContentFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    const rememberContentFocus = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement && !event.target.closest('.meewav-desktop-titlebar')) {
        lastContentFocus.current = event.target;
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('focusin', rememberContentFocus);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('focusin', rememberContentFocus);
    };
  }, []);
  const windowsShell = runtime.runtime === 'desktop-windows'
    || (!runtime.ready && window.meewavDesktop?.version === 1);
  if (!windowsShell) return null;

  const control = (action: 'minimize' | 'toggle-maximize' | 'close') => {
    void window.meewavDesktop?.windowControl?.(action);
  };
  const runMenu = (action: MenuItem['action']) => {
    setOpenMenu(null);
    if (action === 'mode') resetDesktopApplicationMode();
    else if (action === 'home') navigate('/globe');
    else if (action === 'minimize' || action === 'toggle-maximize' || action === 'close') control(action);
    else {
      if (['undo', 'redo', 'cut', 'copy', 'paste', 'select-all'].includes(action)) {
        lastContentFocus.current?.focus({ preventScroll: true });
      }
      void window.meewavDesktop?.windowMenu?.(action);
    }
  };

  return <header className="meewav-desktop-titlebar" aria-label="Barre de fenêtre Meewav">
    <nav className="meewav-desktop-titlebar__menu" aria-label="Menus Meewav" ref={menuRef} onKeyDown={(event) => { if (event.key === 'Escape') setOpenMenu(null); }}>
      {menus.map((menu) => <div className="meewav-desktop-titlebar__menu-group" key={menu.id}>
        <button type="button" aria-haspopup="menu" aria-expanded={openMenu === menu.id} onClick={() => setOpenMenu((current) => current === menu.id ? null : menu.id)}>{menu.label}</button>
        {openMenu === menu.id ? <div className="meewav-desktop-titlebar__dropdown" role="menu" aria-label={menu.label}>{menu.items.map((item) => <button key={item.action} type="button" role="menuitem" aria-label={item.label} onClick={() => runMenu(item.action)}><span>{item.label}</span>{item.shortcut ? <kbd>{item.shortcut}</kbd> : null}</button>)}</div> : null}
      </div>)}
    </nav>
    <div className="meewav-desktop-titlebar__controls" aria-label="Commandes de la fenêtre">
      <button type="button" aria-label="Réduire la fenêtre" onClick={() => control('minimize')}><Minus size={17} aria-hidden="true" /></button>
      <button type="button" aria-label="Agrandir ou restaurer la fenêtre" onClick={() => control('toggle-maximize')}><Square size={13} aria-hidden="true" /></button>
      <button type="button" className="meewav-desktop-titlebar__close" aria-label="Fermer la fenêtre" onClick={() => control('close')}><X size={18} aria-hidden="true" /></button>
    </div>
  </header>;
}
