import { useEffect, useId, useRef, useState } from 'react';
import { AppWindow, Check, Monitor, RefreshCw, X } from 'lucide-react';
import type { CaptureSource } from '../../../runtime/RuntimeProvider';

type Props = {
  sources: CaptureSource[];
  selectedId: string;
  addedIds: string[];
  busy: boolean;
  error: string;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  onConfirm: () => void;
  onClose: () => void;
};

/** Native modal keeps keyboard focus inside the private source chooser. */
export default function StudioCapturePicker({ sources, selectedId, addedIds, busy, error, onSelect, onRefresh, onConfirm, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const [filter, setFilter] = useState<'all' | 'screen' | 'window'>('all');
  const selected = sources.find(source => source.id === selectedId);
  const alreadyAdded = addedIds.includes(selectedId);
  const visible = sources.filter(source => filter === 'all' || source.id.startsWith(`${filter}:`));
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return <dialog ref={dialog} className="studio-capture-picker" aria-labelledby={headingId}
    onKeyDown={event => { if (event.key === 'Escape' || event.key === 'Tab') event.stopPropagation(); }}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header><div><small>PARTAGE VIDÉO</small><h3 id={headingId}>Choisir un écran ou une fenêtre</h3><p>Prépare ta capture dans l’aperçu, avant de la passer à l’antenne.</p></div>
      <button type="button" aria-label="Fermer le choix de capture" disabled={busy} onClick={onClose}><X size={19} /></button>
    </header>
    <div className="studio-capture-picker__toolbar">
      <div role="group" aria-label="Type de capture">{([['all', 'Tout'], ['screen', 'Écrans'], ['window', 'Fenêtres']] as const).map(([value, label]) =>
        <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
      <button type="button" disabled={busy} onClick={onRefresh}><RefreshCw size={14} /> Actualiser</button>
    </div>
    <div className="studio-capture-picker__grid" aria-busy={busy}>
      {visible.map(source => <button type="button" className="studio-capture-picker__source" key={source.id}
        aria-label={source.name} aria-pressed={selectedId === source.id} disabled={busy} onClick={() => onSelect(source.id)}>
        <span className="studio-capture-picker__thumbnail">{source.thumbnail ? <img src={source.thumbnail} alt="" /> : <Monitor size={32} />}
          {selectedId === source.id ? <i><Check size={16} /></i> : null}</span>
        <span className="studio-capture-picker__name">{source.id.startsWith('screen:') ? <Monitor size={15} /> : <AppWindow size={15} />}<strong>{source.name}</strong></span>
        <small>{addedIds.includes(source.id) ? 'Déjà dans tes sources' : source.id.startsWith('screen:') ? 'Écran entier' : 'Cette fenêtre uniquement'}</small>
      </button>)}
      {!visible.length ? <p role="status">{busy ? 'Recherche des écrans et fenêtres…' : 'Aucune source disponible ici. Ouvre la fenêtre souhaitée, puis actualise.'}</p> : null}
    </div>
    {error ? <p className="studio-capture-picker__error" role="alert">{error}</p> : null}
    <footer><div><strong>{selected?.name || 'Sélectionne la source à partager'}</strong><small>Vidéo seule · aucun partage avant « Appliquer le plan »{!selected?.id.startsWith('screen:') ? '' : ' · tout cet écran sera visible'}</small></div>
      <button type="button" className="is-primary" disabled={busy || !selected || alreadyAdded} onClick={onConfirm}>{busy ? 'Préparation…' : alreadyAdded ? 'Source déjà ajoutée' : 'Ajouter à l’aperçu'}</button>
    </footer>
  </dialog>;
}
