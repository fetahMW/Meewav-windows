import { useEffect, useRef, useState } from 'react';
import { Circle, Download, Square, X } from 'lucide-react';

/** Local rehearsal only. Owns its recorder/output tracks, never the input captures. */
export default function StudioSoundcheck({ video, voice, music, onAir }: {
  video: MediaStream | null; voice: MediaStreamTrack | null; music: MediaStreamTrack | null; onAir: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [result, setResult] = useState('');
  const [resultHasVideo, setResultHasVideo] = useState(false);
  const [error, setError] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const dispose = useRef<(() => void) | null>(null);
  const mounted = useRef(true);
  const epoch = useRef(0);
  const working = useRef(false);
  const activeInputs = [voice, music].filter((track): track is MediaStreamTrack => Boolean(track && track.readyState === 'live'));
  const sourceKey = activeInputs.map(track => track.id).join(':') + (video?.id ?? '');
  useEffect(() => {
    if (onAir) { ++epoch.current; dispose.current?.(); dispose.current = null; recorder.current = null; working.current = false; setRecording(false); setPreparing(false); setResult(''); }
  }, [onAir]);
  useEffect(() => { if (recorder.current?.state === 'recording') recorder.current.stop(); }, [sourceKey]);
  useEffect(() => {
    mounted.current = true; ++epoch.current;
    return () => { mounted.current = false; dispose.current?.(); };
  }, []);
  useEffect(() => () => { if (result) URL.revokeObjectURL(result); }, [result]);

  const start = async () => {
    if (working.current || onAir || !activeInputs.length) return;
    if (typeof MediaRecorder === 'undefined') { setError('L’enregistrement local n’est pas disponible sur ce système.'); return; }
    working.current = true; setPreparing(true); setError('');
    const generation = ++epoch.current;
    let context: AudioContext | null = null;
    let timer: number | null = null;
    let output: MediaStreamAudioDestinationNode | null = null;
    const nodes: AudioNode[] = [];
    let local: MediaRecorder | null = null;
    let released = false;
    const trackEnded = () => { if (local?.state === 'recording') local.stop(); };
    const release = () => {
      if (released) return;
      released = true;
      if (timer !== null) window.clearInterval(timer);
      activeInputs.forEach(track => track.removeEventListener('ended', trackEnded));
      if (local) { local.ondataavailable = null; local.onstop = null; local.onerror = null; if (local.state !== 'inactive') local.stop(); }
      nodes.forEach(node => node.disconnect());
      output?.stream.getTracks().forEach(track => track.stop());
      if (context?.state !== 'closed') void context?.close().catch(() => undefined);
    };
    dispose.current = release;
    try {
      context = new AudioContext({ latencyHint: 'interactive' });
      await context.resume();
      if (!mounted.current || generation !== epoch.current) { release(); return; }
      output = context.createMediaStreamDestination();
      // The rehearsal sums the existing post-fader outputs; it never feeds the live transport.
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -1; limiter.knee.value = 0; limiter.ratio.value = 20;
      limiter.attack.value = .003; limiter.release.value = .1;
      limiter.connect(output); nodes.push(limiter);
      activeInputs.forEach(track => {
        const input = context!.createMediaStreamSource(new MediaStream([track]));
        input.connect(limiter); nodes.push(input); track.addEventListener('ended', trackEnded);
      });
      const videoTracks = video?.getVideoTracks().filter(track => track.readyState === 'live') ?? [];
      const stream = new MediaStream([...videoTracks, ...output.stream.getAudioTracks()]);
      const mimeType = (videoTracks.length ? ['video/webm;codecs=vp8,opus', 'video/webm'] : ['audio/webm;codecs=opus', 'audio/webm']).find(type => MediaRecorder.isTypeSupported(type));
      local = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.current = local;
      const chunks: Blob[] = [];
      local.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      local.onstop = () => {
        if (mounted.current && generation === epoch.current) {
          if (chunks.length) { setResultHasVideo(videoTracks.length > 0); setResult(URL.createObjectURL(new Blob(chunks, { type: local?.mimeType || 'video/webm' }))); }
          else setError('L’essai ne contient pas de données. Reconnecte les sources puis réessaie.');
          setRecording(false); setPreparing(false); working.current = false;
        }
        recorder.current = null; release(); dispose.current = null;
      };
      local.onerror = () => { if (mounted.current) setError('L’enregistrement a été interrompu. Réessaie après avoir vérifié les sources.'); trackEnded(); };
      local.start(200); setSeconds(0); setResult(''); setPreparing(false); setRecording(true);
      const started = performance.now();
      timer = window.setInterval(() => {
        const elapsed = Math.floor((performance.now() - started) / 1000);
        setSeconds(Math.min(30, elapsed));
        if (elapsed >= 30 && local?.state === 'recording') local.stop();
      }, 200);
    } catch (reason) {
      release(); dispose.current = null; recorder.current = null; working.current = false;
      if (mounted.current) { setPreparing(false); setRecording(false); setError(reason instanceof Error ? reason.message : 'Enregistrement indisponible.'); }
    }
  };
  return <section className="studio-soundcheck" aria-label="Essai avant le direct">
    <div className="studio-soundcheck__bar"><div><strong>Vérifie ton passage</strong><small>Essai privé de 30 s · image, voix et musique</small></div>
      {recording ? <button type="button" className="is-recording" onClick={() => recorder.current?.stop()}><Square size={14} /> Arrêter · {seconds} s</button> : <button type="button" disabled={onAir || preparing || !activeInputs.length} onClick={() => void start()}><Circle size={14} />{preparing ? 'Préparation…' : 'Enregistrer un essai'}</button>}
    </div>
    {!activeInputs.length && !onAir ? <p>Connecte la voix ou la musique pour faire un essai.</p> : null}
    {onAir ? <p>Les essais sont disponibles hors antenne.</p> : null}
    {result && !onAir ? <div className="studio-soundcheck__result">{resultHasVideo ? <video src={result} controls playsInline preload="metadata" aria-label="Revoir mon essai" /> : <audio src={result} controls preload="metadata" aria-label="Écouter mon essai" />}<div><a href={result} download="meewav-essai.webm"><Download size={14} /> Télécharger l’essai</a><button type="button" onClick={() => setResult('')}><X size={14} /> Effacer</button></div><small>Fichier local · mix d’essai protégé contre les crêtes · aucun envoi au public</small></div> : null}
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}
