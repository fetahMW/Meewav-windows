import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PlaceRoomState } from "../../place/place.types";
import { decodeAudioWaveform, type WaveformPeak } from "./previewWaveform";
import { cageProductionFilename, confirmCageProductionReady, getCageProduction, loadCageProduction, type CageProduction } from "./cageProduction.service";

export type CageProductionAsset = { production: CageProduction; src: string; file: File; durationSeconds: number; peaks: readonly WaveformPeak[] };
type Value = {
  production: CageProduction | null; asset: CageProductionAsset | null; loading: boolean; error: string | null;
  participant: boolean; onstage: boolean; mixerReady: boolean;
  retry: () => void; markMixerLoaded: (reference: string) => void;
  registerMixerPreview: (pause: () => void) => () => void; pauseMixerPreview: () => void;
};
const Context = createContext<Value | null>(null);
export const useCageProduction = () => useContext(Context);

export default function CageProductionProvider({ room, children }: { room: PlaceRoomState; children: ReactNode }) {
  const [production, setProduction] = useState<CageProduction | null>(null);
  const [asset, setAsset] = useState<CageProductionAsset | null>(null);
  const [lookupLoading, setLookupLoading] = useState(true);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [readyError, setReadyError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [mediaAttempt, setMediaAttempt] = useState(0);
  const [mixerReference, setMixerReference] = useState<string | null>(null);
  const mixerPause = useRef<(() => void) | null>(null);
  const own = [...room.participants, ...room.queue].find(item => item.profile.id === room.currentUserProfile?.id);
  const participant = Boolean(own && ["accepted", "ready", "backstage", "onstage"].includes(own.status));
  const onstage = own?.status === "onstage";
  const holding = useRef(false);
  holding.current = onstage;
  const roomKey = `${room.source}:${room.id}:${room.host.id}`;
  const scope = useMemo(() => ({ id: room.id, source: room.source, host: room.host }), [roomKey]);

  useEffect(() => {
    let disposed = false;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const next = await getCageProduction(scope);
        if (disposed) return;
        setLookupError(null);
        // A new publication belongs to the next passage; preserve the active artist's audio.
        setProduction(current => holding.current && current ? current
          : current?.reference === next?.reference && current?.title === next?.title && current?.bpm === next?.bpm ? current : next);
      } catch (reason) {
        if (!disposed) setLookupError(reason instanceof Error ? reason.message : "Prod indisponible.");
      } finally { pending = false; if (!disposed) setLookupLoading(false); }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => { disposed = true; clearInterval(timer); };
  }, [scope, attempt, onstage]);

  useEffect(() => {
    let disposed = false;
    let url: string | undefined;
    setAsset(null);
    setMixerReference(null);
    setMediaError(null);
    setReadyError(null);
    setMediaLoading(false);
    if (!production) return;
    setMediaLoading(true);
    void (async () => {
      try {
        const blob = await loadCageProduction(scope, production);
        if (disposed) return;
        const analysis = await decodeAudioWaveform(await blob.arrayBuffer(), 100);
        if (disposed) return;
        if (!Number.isFinite(analysis.durationSeconds) || analysis.durationSeconds <= 0) throw new Error("Ce fichier audio ne peut pas être lu.");
        url = URL.createObjectURL(blob);
        setAsset({ production, src: url, file: new File([blob], cageProductionFilename(production), { type: blob.type }), durationSeconds: analysis.durationSeconds, peaks: analysis.peaks });
      } catch (reason) {
        if (!disposed) setMediaError(reason instanceof Error ? reason.message : "Le chargement de la prod a échoué.");
      } finally { if (!disposed) setMediaLoading(false); }
    })();
    return () => { disposed = true; if (url) URL.revokeObjectURL(url); };
  }, [scope, production?.reference, mediaAttempt]);

  useEffect(() => {
    if (!participant || !asset || mixerReference !== asset.production.reference) return;
    let disposed = false;
    void confirmCageProductionReady(scope, mixerReference).then(() => { if (!disposed) setReadyError(null); }).catch(reason => {
      if (!disposed) setReadyError(reason instanceof Error ? reason.message : "Confirmation de la prod impossible.");
    });
    return () => { disposed = true; };
  }, [participant, asset, mixerReference, scope, attempt]);

  const retry = useCallback(() => {
    setAttempt(current => current + 1);
    if (!holding.current) setMediaAttempt(current => current + 1);
  }, []);
  const markMixerLoaded = useCallback((reference: string) => setMixerReference(reference), []);
  const registerMixerPreview = useCallback((pause: () => void) => {
    mixerPause.current = pause;
    return () => { if (mixerPause.current === pause) mixerPause.current = null; };
  }, []);
  const pauseMixerPreview = useCallback(() => mixerPause.current?.(), []);
  return <Context.Provider value={{ production, asset, loading: lookupLoading || mediaLoading, error: lookupError ?? mediaError ?? readyError, participant, onstage,
    mixerReady: Boolean(asset && asset.production.reference === mixerReference), retry, markMixerLoaded, registerMixerPreview, pauseMixerPreview }}>{children}</Context.Provider>;
}
