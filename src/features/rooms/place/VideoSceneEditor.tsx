import { useRef, useState, type ReactNode } from 'react';
import { clamp, constrainFrame, sceneFrames, type VideoScene, type VideoFrame } from '../../../runtime/videoScene';

type Props = { scene: VideoScene; onChange: (scene: VideoScene) => void };
function changeFrame(scene: VideoScene, index: number, frame: VideoFrame): VideoScene {
  const next = constrainFrame(frame);
  if (scene.layout === 'pip') {
    const size = clamp(next.width, .15, .75);
    return { ...scene, pipScale: size, pipPosition: { x: clamp(next.x / (1 - size), 0, 1), y: clamp(next.y / (1 - size), 0, 1) } };
  }
  const frames = sceneFrames(scene); frames[index] = next;
  return { ...scene, frames };
}

export function VideoPreviewEditor({ scene, onChange, children }: Props & { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ index: number; resize: boolean; x: number; y: number; frame: VideoFrame } | null>(null);
  const [selected, setSelected] = useState(0);
  const frames = sceneFrames(scene);
  return <div className="room-production__monitor-frame" ref={ref}>
    {children}
    {frames.map((frame, index) => {
      if (scene.layout !== 'free' && !(scene.layout === 'pip' && index === 1)) return null;
      return <div key={index} className={`room-production__edit-frame${selected === index ? ' is-selected' : ''}`} style={{ left: `${frame.x * 100}%`, top: `${frame.y * 100}%`, width: `${frame.width * 100}%`, height: `${frame.height * 100}%` }}
        tabIndex={0} role="group" aria-label={`Zone ${String.fromCharCode(65 + index)} · déplacer avec les flèches, Maj pour redimensionner`}
        onPointerDown={(event) => {
          event.preventDefault(); setSelected(index); event.currentTarget.focus();
          drag.current = { index, resize: (event.target as HTMLElement).dataset.resize === 'true', x: event.clientX, y: event.clientY, frame };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const start = drag.current, bounds = ref.current?.getBoundingClientRect();
          if (!start || !bounds?.width || !bounds.height) return;
          const dx = (event.clientX - start.x) / bounds.width, dy = (event.clientY - start.y) / bounds.height;
          const size = clamp(start.frame.width + dx, .15, Math.min(.75, 1 - start.frame.x, 1 - start.frame.y));
          const next = start.resize
            ? { ...start.frame, width: scene.layout === 'pip' ? size : clamp(start.frame.width + dx, .1, 1 - start.frame.x), height: scene.layout === 'pip' ? size : clamp(start.frame.height + dy, .1, 1 - start.frame.y) }
            : { ...start.frame, x: start.frame.x + dx, y: start.frame.y + dy };
          onChange(changeFrame(scene, start.index, next));
        }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
        onKeyDown={(event) => {
          const delta = .02, next = { ...frame };
          const key = event.shiftKey ? { ArrowLeft: 'width', ArrowRight: 'width', ArrowUp: 'height', ArrowDown: 'height' } : { ArrowLeft: 'x', ArrowRight: 'x', ArrowUp: 'y', ArrowDown: 'y' };
          const property = key[event.key as keyof typeof key] as keyof VideoFrame | undefined;
          if (!property) return;
          event.preventDefault(); next[property] += ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -delta : delta;
          if (scene.layout === 'pip' && event.shiftKey && property === 'height') next.width = next.height;
          onChange(changeFrame(scene, index, next));
        }}>
        <span>Zone {String.fromCharCode(65 + index)}</span><i data-resize="true" aria-hidden="true" />
      </div>;
    })}
  </div>;
}

export function VideoSceneControls({ scene, onChange, sources }: Props & { sources: Array<{ id: string; name: string }> }) {
  const frames = sceneFrames(scene);
  return <div className="room-production__scene-controls">
    <p>Choisis le contenu de chaque zone parmi les caméras et les captures ajoutées dans Sources.</p>
    <div className="room-production__zone-grid">{frames.map((frame, index) => <div className="room-production__zone" key={index}>
      <label className="room-production__field"><span>Zone {String.fromCharCode(65 + index)}{scene.layout === 'pip' ? index === 0 ? ' · fond' : ' · miniature' : ''}</span>
        <select aria-label={`Source de la zone ${String.fromCharCode(65 + index)}`} value={scene.sourceIds[index] || ''} onChange={(event) => {
          const sourceIds = [...scene.sourceIds]; while (sourceIds.length <= index) sourceIds.push(''); sourceIds[index] = event.target.value; onChange({ ...scene, sourceIds });
        }}><option value="">Choisir une source…</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select>
      </label>
      <label className="room-production__field"><span>Cadrage</span><select aria-label={`Cadrage de la zone ${String.fromCharCode(65 + index)}`} value={scene.fits?.[index] ?? 'contain'} onChange={(event) => {
        const fits = [...(scene.fits ?? [])]; fits[index] = event.target.value as 'contain' | 'cover'; onChange({ ...scene, fits });
      }}><option value="contain">Image entière</option><option value="cover">Remplir la zone</option></select></label>
      {scene.layout === 'free' ? <>
        <div className="room-production__coordinates">{(['x', 'y', 'width', 'height'] as const).map((key) => <label key={key}>{({ x: 'X', y: 'Y', width: 'Largeur', height: 'Hauteur' })[key]}<input aria-label={`${key} zone ${String.fromCharCode(65 + index)}`} type="number" min={key === 'x' || key === 'y' ? 0 : 10} max={100} value={Math.round(frame[key] * 100)} onChange={(event) => onChange(changeFrame(scene, index, { ...frame, [key]: Number(event.target.value) / 100 }))} /></label>)}</div>
        <button type="button" disabled={index === frames.length - 1} onClick={() => {
          const sourceIds = [...scene.sourceIds], orderedFrames = [...frames], fits = [...(scene.fits ?? [])];
          const target = frames.length - 1;
          [sourceIds[index], sourceIds[target]] = [sourceIds[target] ?? '', sourceIds[index] ?? ''];
          [orderedFrames[index], orderedFrames[target]] = [orderedFrames[target], orderedFrames[index]];
          [fits[index], fits[target]] = [fits[target] ?? 'contain', fits[index] ?? 'contain'];
          onChange({ ...scene, sourceIds, frames: orderedFrames, fits });
        }}>Mettre au premier plan</button>
      </> : null}
    </div>)}</div>
    {scene.layout === 'pip' ? <label className="room-production__field">Taille de la miniature · {Math.round((scene.pipScale ?? .3) * 100)} %<input aria-label="Taille de la miniature" type="range" min={15} max={75} value={(scene.pipScale ?? .3) * 100} onChange={(event) => onChange({ ...scene, pipScale: Number(event.target.value) / 100 })} /></label> : null}
    {scene.layout === 'split' ? <label className="room-production__field">Séparation A / B · {Math.round((scene.splitRatio ?? .5) * 100)} %<input aria-label="Position du séparateur A B" type="range" min={20} max={80} value={(scene.splitRatio ?? .5) * 100} onChange={(event) => onChange({ ...scene, splitRatio: Number(event.target.value) / 100 })} /></label> : null}
    {scene.layout === 'free' || scene.layout === 'pip' ? <p>Déplace les zones dans Preview. Tire leur coin inférieur droit pour les redimensionner. Au clavier : flèches pour déplacer, Maj + flèches pour redimensionner.</p> : null}
  </div>;
}
