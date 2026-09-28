import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff, X } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { supabase } from "../../lib/supabaseClient";
import { resolveMessagingRuntimeMode } from "./messaging.flags";
import { directCallAction, DirectCallTransport, isActiveDirectCall, type DirectCall } from "./messaging.calls";
import "./messaging-calls.css";

const CALL_EVENT = "meewav:direct-call";
export function requestDirectCall(conversationId: string, kind: DirectCall["kind"]) {
  window.dispatchEvent(new CustomEvent(CALL_EVENT, { detail: { conversationId, kind } }));
}

async function permission(kind: DirectCall["kind"]) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Le micro n’est pas disponible dans cette application.");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: kind === "video" });
  stream.getTracks().forEach(track => track.stop());
}

/** Global to the signed-in desktop session, including when MessagingPage is unmounted. */
export default function MessagingCalls() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const inStudio = /^\/studio(?:\/|$)/.test(location.pathname);
  const activeRoomRoute = inStudio || (/^\/rooms?(?:\/|$)/.test(location.pathname)
    && location.pathname !== "/rooms/home"
    && (location.pathname !== "/rooms" || new URLSearchParams(location.search).has("room")));
  const inRoom = useRef(activeRoomRoute); inRoom.current = activeRoomRoute;
  const enabled = Boolean(user?.id) && resolveMessagingRuntimeMode() === "supabase";
  const [call, setCall] = useState<DirectCall | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [connected, setConnected] = useState(false);
  const [microphone, setMicrophone] = useState(true);
  const [camera, setCamera] = useState(true);
  const [resume, setResume] = useState<(() => Promise<unknown>) | null>(null);
  const callRef = useRef(call); callRef.current = call;
  const busy = useRef(false);
  const lifetime = useRef(0);
  const operation = useRef(0);
  const endedLocally = useRef(new Set<string>());
  const consented = useRef(new Set<string>());
  const lastSync = useRef(Date.now());
  const local = useRef<HTMLDivElement>(null);
  const remote = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const transport = useRef<DirectCallTransport | null>(null);
  const mediaCleanup = useRef<Promise<unknown>>(Promise.resolve());
  const showError = (failure: unknown) => setError(failure instanceof Error
    ? failure.name === "NotAllowedError" ? "Autorise le micro et, pour un appel vidéo, la caméra dans les paramètres Windows." : failure.message
    : "L’appel n’a pas pu aboutir.");
  const updateCall = useCallback((next: DirectCall | null) => {
    // A call accepted or started on another device must never open capture on
    // this device, nor be kept alive by its passive inbox polling.
    if (next && !consented.current.has(next.id) && (next.status === "accepted" || !next.incoming)) {
      callRef.current = null; setCall(null); return;
    }
    callRef.current = isActiveDirectCall(next) ? next : null;
    setCall(callRef.current);
    if (next && !isActiveDirectCall(next)) setError(next.status === "declined" ? "Appel refusé." : next.status === "missed" ? "Appel sans réponse ou connexion perdue." : "Appel terminé.");
  }, []);

  useEffect(() => {
    const epoch = ++lifetime.current;
    busy.current = false; setPending(false); setError(null); updateCall(null);
    if (!enabled || !user?.id) return;
    let stopped = false;
    let polling = false;
    lastSync.current = Date.now(); endedLocally.current.clear(); consented.current.clear();
    const sync = async () => {
      if (stopped || polling || busy.current) return;
      polling = true;
      const revision = operation.current;
      try {
        const current = callRef.current;
        const next = await directCallAction(current && consented.current.has(current.id) ? "sync" : "peek", current?.id);
        if (stopped || revision !== operation.current || busy.current) return;
        lastSync.current = Date.now();
        if (next && endedLocally.current.has(next.id)) {
          if (isActiveDirectCall(next)) await directCallAction("end", next.id);
          return;
        }
        updateCall(next);
      } catch {
        if (!stopped && callRef.current && Date.now() - lastSync.current > 30_000) {
          endedLocally.current.add(callRef.current.id);
          updateCall(null); setError("La connexion au service d’appel a été perdue.");
        }
      } finally { polling = false; }
    };
    const start = async (event: Event) => {
      if (inRoom.current) { setError("Quitte le studio ou la Room avant de démarrer un appel privé."); return; }
      if (busy.current || callRef.current) { setError("Termine l’appel en cours avant d’en démarrer un autre."); return; }
      const detail = (event as CustomEvent).detail;
      if (typeof detail?.conversationId !== "string" || !["audio", "video"].includes(detail?.kind)) return;
      busy.current = true; setPending(true); setError(null);
      operation.current++;
      try {
        await permission(detail.kind);
        if (stopped) return;
        if (inRoom.current) throw new Error("Quitte le studio ou la Room avant de démarrer un appel privé.");
        const next = await directCallAction(detail.kind === "audio" ? "start_audio" : "start", undefined, detail.conversationId);
        if (!stopped && !inRoom.current) { if (next) consented.current.add(next.id); lastSync.current = Date.now(); updateCall(next); }
        else if (next) void directCallAction("end", next.id).catch(() => undefined);
      } catch (failure) { if (!stopped) showError(failure); }
      finally { if (lifetime.current === epoch) { busy.current = false; setPending(false); } }
    };
    window.addEventListener(CALL_EVENT, start);
    const channel = supabase.channel(`messaging:calls:${user.id}`, { config: { private: true } })
      .on("broadcast", { event: "call_changed" }, () => { void sync(); });
    void supabase.realtime.setAuth().then(() => {
      if (!stopped) channel.subscribe(status => { if (status === "SUBSCRIBED") void sync(); });
    }).catch(() => { /* The bounded authenticated heartbeat still synchronizes calls. */ });
    void sync();
    const timer = window.setInterval(() => { void sync(); }, 2500);
    return () => {
      stopped = true; lifetime.current++; clearInterval(timer);
      window.removeEventListener(CALL_EVENT, start); void supabase.removeChannel(channel);
      const current = callRef.current; callRef.current = null;
      if (current) void directCallAction("end", current.id).catch(() => undefined);
    };
  }, [enabled, user?.id, updateCall]);

  const callId = call?.id; const status = call?.status;
  useEffect(() => {
    setConnected(false); setMicrophone(true); setCamera(true); setResume(null);
    const active = callRef.current;
    if (activeRoomRoute && active?.status === "accepted") {
      endedLocally.current.add(active.id); updateCall(null); setError("L’appel privé a été arrêté avant l’ouverture du studio ou de la Room.");
      void directCallAction("end", active.id).catch(() => undefined); return;
    }
    if (!enabled || !user?.id || active?.status !== "accepted" || !local.current || !remote.current) return;
    if (!consented.current.has(active.id)) return;
    let stopped = false;
    const failed = (message: string) => {
      if (stopped) return;
      endedLocally.current.add(active.id); operation.current++;
      setError(message); updateCall(null);
      void directCallAction("end", active.id).catch(() => undefined);
    };
    const media = new DirectCallTransport(active, user.id, local.current, remote.current, {
      ready: () => { if (!stopped) setConnected(true); }, failed,
      autoplay: action => { if (!stopped) setResume(() => action); },
    });
    transport.current = media;
    const previousCleanup = mediaCleanup.current;
    void (async () => {
      await previousCleanup;
      if (!stopped) await media.connect();
    })().catch(failure => { failed(failure?.name === "NotAllowedError" ? "L’accès au micro ou à la caméra a été refusé." : "Impossible de connecter cet appel."); });
    return () => {
      stopped = true; transport.current = null;
      mediaCleanup.current = Promise.allSettled([previousCleanup, media.dispose()]);
    };
  }, [enabled, user?.id, callId, status, activeRoomRoute, updateCall]);

  useEffect(() => {
    if (!call && !error && !pending) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, [callId, Boolean(error), pending]);

  const act = async (action: "accept" | "decline" | "end") => {
    const current = callRef.current;
    if (!current || busy.current) return;
    if (action === "accept" && inRoom.current) { setError("Quitte le studio ou la Room avant de répondre pour garder cet appel privé."); return; }
    const epoch = lifetime.current;
    busy.current = true; setPending(true); setError(null);
    operation.current++;
    // A failed network hang-up must still release this machine's devices.
    if (action !== "accept") { endedLocally.current.add(current.id); updateCall(null); void transport.current?.dispose(); }
    try {
      if (action === "accept") await permission(current.kind);
      if (lifetime.current !== epoch) return;
      if (action === "accept" && inRoom.current) throw new Error("Quitte le studio ou la Room avant de répondre pour garder cet appel privé.");
      if (action === "accept") consented.current.add(current.id);
      const next = await directCallAction(action, current.id);
      if (action === "accept" && (lifetime.current !== epoch || inRoom.current)) {
        consented.current.delete(current.id); endedLocally.current.add(current.id);
        if (lifetime.current === epoch) updateCall(null);
        void directCallAction("end", current.id).catch(() => undefined);
      } else if (lifetime.current === epoch) { lastSync.current = Date.now(); updateCall(next); }
    } catch (failure) { if (action === "accept") consented.current.delete(current.id); if (lifetime.current === epoch) showError(failure); }
    finally { if (lifetime.current === epoch) { busy.current = false; setPending(false); } }
  };
  const toggle = async (kind: "microphone" | "camera") => {
    if (busy.current || !connected || !transport.current) return;
    busy.current = true; setPending(true);
    try {
      if (kind === "microphone") { await transport.current?.microphone(!microphone); setMicrophone(!microphone); }
      else { await transport.current?.camera(!camera); setCamera(!camera); }
    } catch (failure) { showError(failure); }
    finally { busy.current = false; setPending(false); }
  };
  if (!enabled || (!call && !error && !pending)) return null;
  const accepted = call?.status === "accepted";
  const incoming = call?.incoming && call.status === "ringing";
  return <div className="messaging-call-backdrop">
    <section className="messaging-call" role="dialog" aria-modal="true" aria-labelledby="messaging-call-title" tabIndex={-1} ref={panel}
      onKeyDown={event => {
        if (event.key === "Escape" && !pending) { if (call) void act(incoming ? "decline" : "end"); else setError(null); }
        if (event.key === "Tab") {
          const buttons = panel.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
          if (!buttons?.length) { event.preventDefault(); return; }
          const first = buttons[0], last = buttons[buttons.length - 1];
          if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
      }}>
      <header><div><p>{call?.kind === "video" ? "APPEL VIDÉO" : "APPEL AUDIO"}</p><h2 id="messaging-call-title">{call?.peerName || "Appel Meewav"}</h2></div>
        {!call && !pending && <button type="button" aria-label="Fermer" onClick={() => setError(null)}><X /></button>}</header>
      <p className="messaging-call-status" role="status">{error || (pending && !call ? "Autorisation du micro…" : incoming ? "Appel entrant" : accepted ? connected ? "En communication" : "Connexion…" : "Appel en cours…")}</p>
      <div className={`messaging-call-media${accepted && call.kind === "video" ? " is-video" : ""}`}>
        <div ref={remote} className="messaging-call-remote" />
        <div ref={local} className="messaging-call-local" />
      </div>
      {resume && <button type="button" onClick={() => { void resume().then(() => setResume(null)).catch(showError); }}>Activer le son de l’appel</button>}
      <footer>
        {incoming && activeRoomRoute && <button type="button" disabled={pending} onClick={() => navigate("/messages")}>{inStudio ? "Quitter le studio pour répondre" : "Quitter la Room pour répondre"}</button>}
        {incoming && <button type="button" className="messaging-call-accept" disabled={pending || activeRoomRoute} onClick={() => { void act("accept"); }}><Phone /> Accepter</button>}
        {accepted && <>
          <button type="button" aria-label={microphone ? "Couper le micro" : "Activer le micro"} aria-pressed={!microphone} disabled={pending || !connected} onClick={() => { void toggle("microphone"); }}>{microphone ? <Mic /> : <MicOff />}</button>
          {call.kind === "video" && <button type="button" aria-label={camera ? "Couper la caméra" : "Activer la caméra"} aria-pressed={!camera} disabled={pending || !connected} onClick={() => { void toggle("camera"); }}>{camera ? <Video /> : <VideoOff />}</button>}
        </>}
        {call && <button type="button" className="messaging-call-end" disabled={pending} onClick={() => { void act(incoming ? "decline" : "end"); }}><PhoneOff /> {incoming ? "Refuser" : "Raccrocher"}</button>}
      </footer>
    </section>
  </div>;
}
