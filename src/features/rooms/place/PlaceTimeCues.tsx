import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Library, Megaphone, Pause, Play, RefreshCw, RotateCcw, Square, Timer, Upload, X } from "lucide-react";
import { profileMediaRepository, type OwnerMediaItem } from "../../profile/profile.media.service";
import { placeTransportCues, usePlaceTransportCues, type CueSide } from "./placeTransportCues";

function CueLibrary({ side, ownerId, onClose }: { side: CueSide; ownerId?: string | null; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<OwnerMediaItem[]>([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current!;
    element.showModal();
    return () => { element.close(); previous?.focus(); };
  }, []);
  useEffect(() => {
    let active = true;
    if (!ownerId) { setStatus("signed-out"); return; }
    setStatus("loading");
    void profileMediaRepository.listOwnerMedia(ownerId).then(media => {
      if (!active) return;
      setItems(media.filter(item => item.kind === "audio" && item.sourceUrl));
      setStatus("ready");
    }).catch(() => { if (active) setStatus("error"); });
    return () => { active = false; };
  }, [ownerId, attempt]);
  return <dialog ref={dialog} className="place-cue-library" aria-label={`Choisir le son de ${side === "start" ? "début" : "fin"}`}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onKeyDown={event => {
      if (event.key === "Escape") { event.stopPropagation(); return; }
      if (event.key !== "Tab") return;
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not([type="file"]):not(:disabled)')];
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
    <header><div><small>SON DU PAD</small><h3>{side === "start" ? "Avant de commencer" : "Pour terminer"}</h3></div><button type="button" aria-label="Fermer le choix du son" onClick={onClose}><X /></button></header>
    <input ref={file} type="file" accept="audio/*" hidden onChange={event => {
      const selected = event.currentTarget.files?.[0];
      if (!selected) return;
      if (!selected.type.startsWith("audio/") && !/\.(wav|mp3|m4a|aac|ogg|flac|opus|aiff?|webm)$/i.test(selected.name)) { setError("Choisis un fichier audio."); return; }
      if (!selected.size || selected.size > 250 * 1024 * 1024) { setError("Choisis un son non vide de moins de 250 Mo."); return; }
      placeTransportCues.replace(side, { title: selected.name.replace(/\.[^.]+$/, ""), source: URL.createObjectURL(selected), local: true });
      onClose();
    }} />
    <button type="button" className="place-cue-library__upload" onClick={() => file.current?.click()}><Upload /><span><strong>Importer un fichier audio</strong><small>Depuis cet appareil ou un appareil connecté</small></span></button>
    {error ? <p role="alert">{error}</p> : null}
    <h4><Library /> Mon profil et ma médiathèque</h4>
    <div className="place-cue-library__list" aria-busy={status === "loading"}>
      {status === "loading" ? <p role="status">Chargement de tes sons…</p> : null}
      {status === "signed-out" ? <p>Connecte-toi pour retrouver tes fichiers audio.</p> : null}
      {status === "error" ? <><p role="alert">Impossible de charger tes sons.</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Réessayer</button></> : null}
      {status === "ready" && !items.length ? <p>Aucun fichier audio dans ta médiathèque. Tu peux en importer depuis cet appareil.</p> : null}
      {status === "ready" ? items.map(item => <button type="button" key={item.id} onClick={() => {
        placeTransportCues.replace(side, { title: item.title, source: item.sourceUrl! });
        onClose();
      }}><Library /><span>{item.title}</span><small>Choisir</small></button>) : null}
    </div>
  </dialog>;
}

export default function PlaceTimeCues({ ownerId }: { ownerId?: string | null }) {
  const cues = usePlaceTransportCues();
  const [choosing, setChoosing] = useState<CueSide | null>(null);
  return <section className="place-time-cues" aria-label="Sons automatiques">
    <header><h3>Sons automatiques</h3><p>Active Chrono, Lecteur ou les deux.</p></header>
    <div className="place-time-cues__grid">
      {(["start", "end"] as const).map(side => {
        const cue = cues[side];
        const title = side === "start" ? "Début" : "Fin";
        const Icon = side === "start" ? Timer : Megaphone;
        const playing = cues.playing === side;
        return <article key={side} className={`place-time-cue${playing ? " is-playing" : ""}`} style={{ "--twist-accent": side === "start" ? "#64d98b" : "#ffc34a" } as CSSProperties}>
          <header><span><Icon />{title}</span><div className="place-time-cue__tools"><small>{cue.chrono || cue.player ? "Activé" : "Désactivé"}</small><button type="button" aria-label={`Remplacer le son de ${title.toLowerCase()}`} title="Remplacer le son" onClick={() => setChoosing(side)}><RefreshCw /></button>{!cue.sound.builtin ? <button type="button" aria-label={`Rétablir le son de ${title.toLowerCase()} par défaut`} title="Son d’origine" onClick={() => placeTransportCues.restore(side)}><RotateCcw /></button> : null}</div></header>
          <button type="button" className="place-time-cue__sound" aria-label={`${playing ? "Arrêter" : "Écouter"} le son de ${title.toLowerCase()}`} onClick={() => placeTransportCues.preview(side)}>
            <span className="place-time-cue__play">{playing ? <Square /> : <Play />}</span>
            <span><strong>{cue.sound.title}</strong><small>{playing ? cues.waiting ? "Avant le démarrage…" : "Écoute du son…" : "Écouter le son"}</small></span>
          </button>
          <div className="place-time-cue__targets" role="group" aria-label={`Déclencher le pad ${title}`}>
            <button type="button" aria-label={`${title} avec le chrono`} aria-pressed={cue.chrono} onClick={() => placeTransportCues.setTarget(side, "chrono", !cue.chrono)}><Timer />Chrono</button>
            <button type="button" aria-label={`${title} avec le lecteur`} aria-pressed={cue.player} onClick={() => placeTransportCues.setTarget(side, "player", !cue.player)}>{side === "start" ? <Play /> : <Pause />}Lecteur</button>
          </div>
          <p>{side === "start" ? "Le son précède le démarrage." : "Chrono à zéro ou lecteur en pause."}</p>
        </article>;
      })}
    </div>
    {cues.error ? <p role="alert" className="place-time-cues__error">{cues.error}</p> : null}
    {choosing ? <CueLibrary side={choosing} ownerId={ownerId} onClose={() => setChoosing(null)} /> : null}
  </section>;
}
