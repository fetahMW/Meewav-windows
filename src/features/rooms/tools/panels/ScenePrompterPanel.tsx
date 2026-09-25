import { ArrowDown, ArrowUp, Check, ChevronDown, FilePlus2, FlipHorizontal2, LockKeyhole, Monitor, Pause, Play, Rewind, ScrollText, SlidersHorizontal, Upload, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { RoomActorRole, RoomToolsCommand, SceneState } from "../roomTools.types";
import { ToolNotice, ToolPanelHeader } from "./RoomToolPanelPrimitives";

const PROMPTER_TEMPLATES = [
  { title: "Présentation", body: "Salutation\nPrésentation de la performance\nRemerciements au public\nLancement" },
  { title: "Chanson", body: "Intro\nCouplet 1\nRefrain\nCouplet 2\nRefrain\nOutro" },
  { title: "Stand-up", body: "Ouverture\nPrémisse\nDéveloppement\nRappel\nConclusion" },
  { title: "Repères libres", body: "Départ\nRepère 1\nRepère 2\nFinal" },
] as const;

export default function ScenePrompterPanel({ scene, role, disabled, execute }: { scene: SceneState; role: RoomActorRole; disabled: boolean; execute: (command: RoomToolsCommand) => Promise<unknown> }) {
  const activeText = scene.prompter.texts.find((text) => text.id === scene.prompter.activeTextId) ?? scene.prompter.texts[0];
  const lines = useMemo(() => activeText?.body.split("\n") ?? [], [activeText?.body]);
  const activeLine = Math.max(0, Math.min(scene.prompter.line, lines.length - 1));
  const canRead = role === "host" || role === "regisseur" || role === "artist";
  const canEdit = role === "host" || role === "regisseur";
  const hasText = Boolean(activeText?.body.trim());
  const [readerOpen, setReaderOpen] = useState(false);
  const [countdownLeft, setCountdownLeft] = useState<number | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState(activeText?.title ?? "");
  const [bodyDraft, setBodyDraft] = useState(activeText?.body ?? "");
  const [markerDraft, setMarkerDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [launchRequested, setLaunchRequested] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const launchRef = useRef<HTMLButtonElement>(null);
  const readerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const runCommand = useCallback(async (command: RoomToolsCommand) => {
    if (disabledRef.current) return false;
    try {
      await execute(command);
      setError(null);
      return true;
    } catch {
      setError("La modification n’a pas été enregistrée. Réessaie.");
      return false;
    }
  }, [execute]);
  const patch = useCallback((value: Partial<SceneState["prompter"]>) => runCommand({ type: "scene.prompter.patch", patch: value }), [runCommand]);

  useEffect(() => {
    setTitleDraft(activeText?.title ?? "");
    setBodyDraft(activeText?.body ?? "");
  }, [activeText?.id, activeText?.title, activeText?.body]);

  const closeReader = useCallback(() => {
    setCountdownLeft(null);
    setReaderOpen(false);
    setStopRequested(true);
  }, []);

  // The shell briefly disables controls during each save. Finish local intents
  // once that write settles instead of dropping a launch or a requested stop.
  useEffect(() => {
    if (disabled || !canRead) return;
    if (stopRequested) {
      setStopRequested(false);
      void patch({ playing: false });
      return;
    }
    if (!launchRequested || saving || !hasText) return;
    setLaunchRequested(false);
    setReaderOpen(true);
    setCountdownLeft(scene.prompter.countdown || null);
    void patch({ playing: scene.prompter.countdown === 0, line: activeLine >= lines.length - 1 ? 0 : activeLine });
  }, [activeLine, canRead, disabled, hasText, launchRequested, lines.length, patch, saving, scene.prompter.countdown, stopRequested]);

  const togglePlayback = useCallback(() => {
    if (disabled || !hasText) return;
    if (countdownLeft !== null) {
      setCountdownLeft(null);
      void patch({ playing: false });
    } else if (!scene.prompter.playing && activeLine >= lines.length - 1) {
      void patch({ line: 0, playing: true });
    } else void patch({ playing: !scene.prompter.playing });
  }, [activeLine, countdownLeft, disabled, hasText, lines.length, patch, scene.prompter.playing]);

  // Opening a reading surface belongs to this screen, never to shared room state.
  useEffect(() => {
    if (!readerOpen || !canRead) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : launchRef.current;
    const previousOverflow = document.body.style.overflow;
    const background = Array.from(document.body.children)
      .filter((child): child is HTMLElement => child instanceof HTMLElement && child !== readerRef.current)
      .map((element) => ({ element, inert: element.inert }));
    background.forEach(({ element }) => { element.inert = true; });
    document.body.style.overflow = "hidden";
    readerRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      background.forEach(({ element, inert }) => { element.inert = inert; });
      previousFocus?.focus();
    };
  }, [readerOpen, canRead]);

  useEffect(() => {
    if (!readerOpen || !canRead || disabled || countdownLeft === null) return;
    const timer = window.setTimeout(() => {
      if (countdownLeft <= 1) {
        setCountdownLeft(null);
        void patch({ playing: true });
      } else setCountdownLeft(countdownLeft - 1);
    }, 1_000);
    return () => window.clearTimeout(timer);
  }, [canRead, countdownLeft, disabled, patch, readerOpen]);

  useEffect(() => {
    if (!readerOpen || !canRead || disabled || countdownLeft !== null || !scene.prompter.playing || !hasText) return;
    const timer = window.setTimeout(() => {
      if (activeLine >= lines.length - 1) void patch({ playing: false });
      else void patch({ line: activeLine + 1 });
    }, Math.max(420, 2_900 - scene.prompter.speed * 24));
    return () => window.clearTimeout(timer);
  }, [activeLine, canRead, countdownLeft, disabled, hasText, lines.length, patch, readerOpen, scene.prompter.playing, scene.prompter.speed]);

  useEffect(() => {
    if (!readerOpen) return;
    const centerLine = () => {
      const reader = scrollRef.current;
      const line = lineRefs.current[activeLine];
      if (!reader || !line) return;
      const lineBounds = line.getBoundingClientRect();
      const readerBounds = reader.getBoundingClientRect();
      const top = Math.max(0, reader.scrollTop + lineBounds.top - readerBounds.top - (reader.clientHeight - lineBounds.height) / 2);
      if (typeof reader.scrollTo === "function") reader.scrollTo({ top, behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
      else reader.scrollTop = top;
    };
    centerLine();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(centerLine);
    if (scrollRef.current) observer?.observe(scrollRef.current);
    return () => observer?.disconnect();
  }, [activeLine, activeText?.body, readerOpen, scene.prompter.fontSize, scene.prompter.lineHeight]);

  useEffect(() => {
    if (!readerOpen || !canRead) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeReader();
        return;
      }
      if (event.key === "Tab") {
        const controls = Array.from(readerRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex='0']") ?? []);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === readerRef.current)) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === readerRef.current)) {
          event.preventDefault();
          first?.focus();
        }
        return;
      }
      if (disabled) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      if (event.code === "Space" || event.key === " ") {
        event.preventDefault();
        togglePlayback();
      } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        void patch({ line: Math.max(0, Math.min(lines.length - 1, activeLine + (event.key === "ArrowUp" ? -1 : 1))) });
      } else if (event.key === "Home") {
        event.preventDefault();
        setCountdownLeft(null);
        void patch({ line: 0, playing: false });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeLine, canRead, closeReader, disabled, lines.length, patch, readerOpen, togglePlayback]);

  const saveText = async () => {
    if (!activeText || !canEdit || disabled) return false;
    setSaving(true);
    const saved = await runCommand({ type: "scene.prompter.update", textId: activeText.id, patch: { title: titleDraft.trim() || activeText.title, body: bodyDraft } });
    setSaving(false);
    return saved;
  };
  const startReader = async () => {
    if (disabled || saving || !canRead || !bodyDraft.trim()) return;
    if (canEdit && activeText && (bodyDraft !== activeText.body || titleDraft !== activeText.title) && !await saveText()) return;
    setLaunchRequested(true);
  };
  const addText = async (title: string, body: string) => {
    if (!canEdit) return;
    const saved = await runCommand({ type: "scene.prompter.add", text: { id: crypto.randomUUID(), title, body, artistId: activeText?.artistId ?? scene.people[0]?.id ?? "", markers: [] } });
    if (saved) setEditorOpen(true);
  };
  const importText = async (file: File | undefined) => {
    if (!file || !canEdit || disabled) return;
    try { await addText(file.name.replace(/\.(txt|md)$/i, ""), await file.text()); }
    catch { setError("Ce fichier n’a pas pu être lu. Importe un texte .txt ou .md."); }
  };

  if (!canRead) return <ToolNotice tone="warning">Le Prompteur est privé. Seuls l’artiste assigné, le Host et la Régie peuvent lire ce texte.</ToolNotice>;
  const artist = scene.people.find((person) => person.id === activeText?.artistId);
  const dirty = titleDraft !== (activeText?.title ?? "") || bodyDraft !== (activeText?.body ?? "");
  const readingStatus = countdownLeft !== null ? "Prépare-toi" : scene.prompter.playing ? "Lecture en cours" : activeLine === lines.length - 1 ? "Fin du texte" : "En pause";

  return <div className="room-tool-panel is-prompter scene-prompter">
    <ToolPanelHeader eyebrow="TON ÉCRAN DE LECTURE" title="Prompteur" description="Prépare tes paroles. Entre dans ta performance." status="PRIVÉ" icon={<ScrollText />} />
    <div className="scene-prompter__selection">
      <label>Texte à lire<select value={activeText?.id ?? ""} disabled={disabled || !scene.prompter.texts.length} onChange={(event) => void runCommand({ type: "scene.prompter.select", textId: event.currentTarget.value })}>{!scene.prompter.texts.length && <option value="">Aucun texte</option>}{scene.prompter.texts.map((text) => <option key={text.id} value={text.id}>{text.title}</option>)}</select></label>
      <label>Pour l’artiste<select value={activeText?.artistId ?? ""} disabled={disabled || !canEdit || !activeText} onChange={(event) => activeText && void runCommand({ type: "scene.prompter.update", textId: activeText.id, patch: { artistId: event.currentTarget.value } })}><option value="">Choisir un artiste</option>{scene.people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
    </div>
    <section className="scene-prompter__launch" aria-label="Lancer la lecture privée">
      <div className="scene-prompter__launch-top"><span className="scene-prompter__monitor"><Monitor /></span><span><strong>La scène devant toi.<br />Tes paroles à l’écran.</strong><small>La lecture occupe tout ton écran.</small></span><LockKeyhole /></div>
      <div className="scene-prompter__excerpt"><span>PREMIÈRE LIGNE</span><p>{lines[0] || "Ajoute ou importe tes paroles pour commencer."}</p><small>{hasText ? `${lines.length} lignes${artist ? ` · ${artist.name}` : ""}` : "Fichiers .txt ou .md"}</small></div>
      <button ref={launchRef} className="scene-prompter__start" type="button" disabled={disabled || saving || !bodyDraft.trim()} onClick={() => void startReader()}><Play /><span>Démarrer sur mon écran</span><span className="scene-prompter__count-in">{scene.prompter.countdown ? `${scene.prompter.countdown} s` : "Direct"}</span></button>
      <p className="scene-prompter__privacy"><LockKeyhole />Visible uniquement ici. Le public garde la scène.</p>
    </section>
    <section className="scene-prompter__adjustments" aria-label="Réglages de lecture">
      <header><SlidersHorizontal /><strong>À ton rythme</strong></header>
      <div className="scene-prompter__sliders">
        <label><span>Vitesse <b>{scene.prompter.speed}</b></span><input aria-label="Vitesse" type="range" min="10" max="100" value={scene.prompter.speed} disabled={disabled} onChange={(event) => void patch({ speed: Number(event.currentTarget.value) })} /><span className="scene-prompter__range-captions"><small>Posé</small><small>Rapide</small></span></label>
        <label><span>Taille du texte <b>{Math.round(scene.prompter.fontSize * 1.8)} px</b></span><input aria-label="Taille du texte" type="range" min="20" max="54" value={scene.prompter.fontSize} disabled={disabled} onChange={(event) => void patch({ fontSize: Number(event.currentTarget.value) })} /><span className="scene-prompter__range-captions"><small>A</small><small>Aa</small></span></label>
      </div>
      <details className="scene-prompter__details"><summary>Affichage et décompte<ChevronDown /></summary><div className="scene-prompter__options">
        <label>Avant de commencer<select value={scene.prompter.countdown} disabled={disabled} onChange={(event) => void patch({ countdown: Number(event.currentTarget.value) as 0 | 3 | 5 | 10 })}><option value="0">Départ immédiat</option><option value="3">Décompte de 3 s</option><option value="5">Décompte de 5 s</option><option value="10">Décompte de 10 s</option></select></label>
        <label>Alignement<select value={scene.prompter.alignment} disabled={disabled} onChange={(event) => void patch({ alignment: event.currentTarget.value as SceneState["prompter"]["alignment"] })}><option value="left">Gauche</option><option value="center">Centre</option><option value="right">Droite</option></select></label>
        <label>Interligne<select value={scene.prompter.lineHeight} disabled={disabled} onChange={(event) => void patch({ lineHeight: Number(event.currentTarget.value) })}>{[1.1, 1.3, 1.5, 1.55, 1.7, 2].map((value) => <option key={value} value={value}>{value === 1.55 ? "Standard" : value}</option>)}</select></label>
        <label>Pilotage<select value={scene.prompter.controller} disabled={disabled} onChange={(event) => void patch({ controller: event.currentTarget.value as "artist" | "regie" })}><option value="regie">Régie</option><option value="artist">Artiste</option></select></label>
        <button type="button" disabled={disabled} className={scene.prompter.mirrored ? "is-active" : ""} aria-pressed={scene.prompter.mirrored} onClick={() => void patch({ mirrored: !scene.prompter.mirrored })}><FlipHorizontal2 />Mode miroir</button>
      </div></details>
    </section>
    <section className="scene-prompter__text-tools">
      <header><strong>Mes textes</strong><span><button type="button" disabled={disabled || !canEdit} onClick={() => void addText("Nouveau texte", "")}><FilePlus2 />Nouveau</button><button type="button" disabled={disabled || !canEdit} onClick={() => fileRef.current?.click()}><Upload />Importer</button></span></header>
      <input ref={fileRef} type="file" hidden disabled={disabled || !canEdit} accept=".txt,.md,text/plain,text/markdown" onChange={(event) => { void importText(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
      {activeText && <>
        <button type="button" className="scene-prompter__edit-toggle" disabled={disabled} aria-expanded={editorOpen} onClick={() => setEditorOpen(!editorOpen)}><ScrollText /><span>{canEdit ? "Modifier le texte et les repères" : "Voir le texte et les repères"}</span><ChevronDown /></button>
        {editorOpen && <div className="scene-prompter__editor">
          <label>Titre du texte<input value={titleDraft} disabled={disabled || !canEdit} onChange={(event) => setTitleDraft(event.currentTarget.value)} /></label>
          <label>Paroles et repères<textarea value={bodyDraft} rows={8} disabled={disabled || !canEdit} onChange={(event) => setBodyDraft(event.currentTarget.value)} placeholder="Colle tes paroles ici. Une phrase par ligne." /></label>
          <div className="scene-prompter__save"><small>{dirty ? "Modifications à enregistrer" : "Texte enregistré"}</small><button type="button" disabled={disabled || !canEdit || saving || !dirty} onClick={() => void saveText()}><Check />Enregistrer</button></div>
          <div className="scene-prompter__markers">{activeText.markers.map((marker) => <button type="button" key={marker.id} disabled={disabled} onClick={() => void runCommand({ type: "scene.prompter.marker", markerId: marker.id })}>{marker.label}<small>L. {marker.line + 1}</small></button>)}</div>
          {canEdit && <form className="scene-prompter__marker-form" onSubmit={(event) => { event.preventDefault(); if (!markerDraft.trim()) return; void runCommand({ type: "scene.prompter.update", textId: activeText.id, patch: { markers: [...activeText.markers, { id: crypto.randomUUID(), label: markerDraft.trim(), kind: "Repère", line: activeLine }] } }).then((saved) => { if (saved) setMarkerDraft(""); }); }}><label>Nouveau repère · ligne {activeLine + 1}<input value={markerDraft} disabled={disabled} placeholder="Ex. Refrain" onChange={(event) => setMarkerDraft(event.currentTarget.value)} /></label><button type="submit" disabled={disabled || !markerDraft.trim()}>Ajouter</button></form>}
        </div>}
      </>}
      {canEdit && <details className="scene-prompter__details"><summary>Partir d’un modèle<ChevronDown /></summary><div className="scene-prompter__templates">{PROMPTER_TEMPLATES.map((template) => <button type="button" key={template.title} disabled={disabled} onClick={() => void addText(template.title, template.body)}>{template.title}</button>)}</div></details>}
    </section>
    {error && <p className="scene-prompter__error" role="alert">{error}</p>}
    {readerOpen && createPortal(<div ref={readerRef} className="scene-prompter-screen" role="dialog" aria-modal="true" aria-label={`Prompteur privé — ${activeText?.title ?? "Lecture"}`} aria-describedby="scene-prompter-screen-help" tabIndex={-1}>
      <header className="scene-prompter-screen__header"><div><span><LockKeyhole />LECTURE PRIVÉE</span><strong>{activeText?.title}</strong><small>{artist?.name}</small></div><button type="button" onClick={closeReader} aria-label="Fermer le prompteur"><X /><span>Quitter</span><kbd>Échap</kbd></button></header>
      <div className={`scene-prompter-screen__stage${scene.prompter.mirrored ? " is-mirrored" : ""}`} style={{ "--prompter-screen-size": `${scene.prompter.fontSize * 1.8}px`, "--prompter-screen-leading": scene.prompter.lineHeight, textAlign: scene.prompter.alignment } as CSSProperties}>
        <div className="scene-prompter-screen__guide" aria-hidden="true"><i /></div>
        <div ref={scrollRef} className="scene-prompter-screen__scroll" aria-label="Paroles">{lines.map((line, index) => <p ref={(node) => { lineRefs.current[index] = node; }} key={`${activeText?.id}-${index}`} className={index === activeLine ? "is-focus" : index < activeLine ? "is-past" : ""} aria-current={index === activeLine ? "true" : undefined}>{line || " "}</p>)}</div>
        {countdownLeft !== null && <div className="scene-prompter-screen__countdown" role="status" aria-live="assertive"><small>À TOI DANS</small><strong>{countdownLeft}</strong><span>Respire. Tu es prêt.</span></div>}
      </div>
      <footer className="scene-prompter-screen__footer">
        <div className="scene-prompter-screen__progress"><span className={scene.prompter.playing && countdownLeft === null ? "is-playing" : ""}><i />{readingStatus}</span><small>Ligne {activeLine + 1} / {lines.length}</small><div><i style={{ width: `${lines.length ? ((activeLine + 1) / lines.length) * 100 : 0}%` }} /></div></div>
        <div className="scene-prompter-screen__controls"><button type="button" disabled={disabled} onClick={() => { setCountdownLeft(null); void patch({ line: 0, playing: false }); }} aria-label="Revenir au début"><Rewind /></button><button type="button" disabled={disabled || activeLine === 0} onClick={() => void patch({ line: Math.max(0, activeLine - 1) })} aria-label="Ligne précédente"><ArrowUp /></button><button type="button" className="scene-prompter-screen__play" disabled={disabled || !hasText} onClick={togglePlayback}>{scene.prompter.playing || countdownLeft !== null ? <Pause /> : <Play />}{countdownLeft !== null ? "Annuler le décompte" : scene.prompter.playing ? "Pause" : activeLine >= lines.length - 1 ? "Recommencer" : "Reprendre"}</button><button type="button" disabled={disabled || activeLine >= lines.length - 1} onClick={() => void patch({ line: Math.min(lines.length - 1, activeLine + 1) })} aria-label="Ligne suivante"><ArrowDown /></button><button type="button" disabled={disabled} onClick={() => void patch({ mirrored: !scene.prompter.mirrored })} aria-pressed={scene.prompter.mirrored} aria-label="Mode miroir"><FlipHorizontal2 /></button></div>
        <p id="scene-prompter-screen-help"><kbd>Espace</kbd> lecture / pause <span>·</span> <kbd>↑ ↓</kbd> changer de ligne <span>·</span> <kbd>Échap</kbd> revenir à la scène</p>
        {error && <p className="scene-prompter__error" role="alert">{error}</p>}
      </footer>
    </div>, document.body)}
  </div>;
}
