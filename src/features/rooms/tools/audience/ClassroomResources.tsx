import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Download, FileAudio, Image, Link, Play, Video, X } from "lucide-react";
import type { ClassResource } from "../roomTools.types";
import { downloadClassroomResource, resolveClassroomResourceUrl } from "../classroom/classroomResourceMedia.service";
import "./classroom-resources.css";

const labels = { image: "Image", audio: "Audio", video: "Vidéo", link: "Lien" };
const icons = { image: Image, audio: FileAudio, video: Video, link: Link };

function Resource({ resource, roomId, source, active, onActivate }: { resource: ClassResource; roomId: string; source: "demo" | "live"; active: boolean; onActivate: () => void }) {
  const Icon = icons[resource.kind];
  const [url, setUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  const locked = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (!active) setUrl(null); }, [active]);
  const run = async (download: boolean) => {
    if (locked.current) return;
    locked.current = true; setPending(true); setError("");
    try {
      if (download) await downloadClassroomResource(resource, roomId, source);
      else {
        const address = await resolveClassroomResourceUrl(resource, roomId, source);
        if (mounted.current) { setUrl(address); onActivate(); }
      }
    } catch { if (mounted.current) setError("Cette ressource n’a pas pu être ouverte. Réessayez."); }
    finally { locked.current = false; if (mounted.current) setPending(false); }
  };
  const size = resource.size > 0 ? resource.size >= 1_048_576 ? `${(resource.size / 1_048_576).toFixed(1)} Mo` : `${Math.max(1, Math.round(resource.size / 1024))} Ko` : null;
  return <article className={`classe-resource${active && url ? " is-open" : ""}`}>
    <header><span className="classe-resource__icon"><Icon aria-hidden="true" /></span><div><small>{labels[resource.kind]}{size ? ` · ${size}` : ""}</small><h3>{resource.name}</h3></div></header>
    {resource.description ? <p>{resource.description}</p> : null}
    <div className="classe-resource__actions">
      {active && url ? <button type="button" onClick={() => setUrl(null)}><X />Fermer l’aperçu</button> : <button type="button" disabled={pending} onClick={() => void run(false)}>{resource.kind === "link" ? <Link /> : <Play />}{pending ? "Préparation…" : resource.kind === "audio" ? "Écouter" : resource.kind === "video" ? "Regarder" : "Ouvrir"}</button>}
      {resource.kind !== "link" ? <button type="button" disabled={pending} aria-label={`Télécharger ${resource.name}`} onClick={() => void run(true)}><Download />Télécharger</button> : null}
    </div>
    {active && url ? <div className="classe-resource__preview">
      {resource.kind === "audio" ? <audio key={url} src={url} controls preload="metadata" aria-label={resource.name} onError={() => setError("Lecture indisponible. Fermez l’aperçu et réessayez.")} /> : resource.kind === "video" ? <video key={url} src={url} controls playsInline preload="metadata" aria-label={resource.name} onError={() => setError("Lecture indisponible. Fermez l’aperçu et réessayez.")} /> : resource.kind === "image" ? <img src={url} alt={resource.name} /> : <a href={url} target="_blank" rel="noopener noreferrer">Consulter la ressource <ArrowUpRight aria-hidden="true" /></a>}
    </div> : null}
    {error ? <p role="alert">{error}</p> : null}
  </article>;
}

export default function ClassroomResources({ resources, roomId, source }: { resources: ClassResource[]; roomId: string; source: "demo" | "live" }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  if (!resources.length) return <p className="room-audience-notice">Le professeur n’a pas encore partagé de ressource.</p>;
  return <section className="classe-resources" aria-label="Ressources du cours"><header><div><h2>Ressources du cours</h2><p>Consultez, écoutez et gardez les supports du cours.</p></div><span>{resources.length}</span></header>
    {source === "demo" ? <small className="classe-resources__demo">Exemples de démonstration</small> : null}
    {resources.map(resource => <Resource key={resource.id} resource={resource} source={source} roomId={roomId} active={activeId === resource.id} onActivate={() => setActiveId(resource.id)} />)}
  </section>;
}
