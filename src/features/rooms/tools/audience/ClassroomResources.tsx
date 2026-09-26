import { useEffect, useRef, useState } from "react";
import { Download, FileAudio, FileText, Image, LoaderCircle, Video } from "lucide-react";
import type { ClassResource } from "../roomTools.types";
import { downloadClassroomResource } from "../classroom/classroomResourceMedia.service";
import "./classroom-resources.css";

const labels = { image: "Image", audio: "Fichier audio", video: "Fichier vidéo", link: "Document" };
const icons = { image: Image, audio: FileAudio, video: Video, link: FileText };

function Resource({ resource, roomId, source }: { resource: ClassResource; roomId: string; source: "demo" | "live" }) {
  const Icon = icons[resource.kind];
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  const locked = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const download = async () => {
    if (locked.current) return;
    locked.current = true; setPending(true); setError("");
    try { await downloadClassroomResource(resource, roomId, source); }
    catch { if (mounted.current) setError("Téléchargement indisponible. Réessayez."); }
    finally { locked.current = false; if (mounted.current) setPending(false); }
  };
  const size = resource.size > 0 ? resource.size >= 1_048_576 ? `${(resource.size / 1_048_576).toFixed(1)} Mo` : `${Math.max(1, Math.round(resource.size / 1024))} Ko` : null;
  return <article className="classe-resource">
    <span className="classe-resource__icon"><Icon aria-hidden="true" /></span>
    <div className="classe-resource__copy"><small>{labels[resource.kind]}{size ? ` · ${size}` : ""}</small><h3>{resource.name}</h3>{resource.description ? <p>{resource.description}</p> : null}</div>
    <div className="classe-resource__actions"><button type="button" disabled={pending} aria-busy={pending} aria-label={`Télécharger ${resource.name}`} onClick={() => void download()}>{pending ? <LoaderCircle aria-hidden="true" /> : <Download aria-hidden="true" />}<span>{pending ? "Préparation…" : "Télécharger"}</span></button></div>
    {error ? <p className="classe-resource__error" role="alert">{error}</p> : null}
  </article>;
}

export default function ClassroomResources({ resources, roomId, source }: { resources: ClassResource[]; roomId: string; source: "demo" | "live" }) {
  if (!resources.length) return <p className="room-audience-notice">Le professeur n’a pas encore partagé de ressource.</p>;
  return <section className="classe-resources" aria-label="Ressources du cours"><header><div><h2>Ressources du cours</h2><p>Vos supports à télécharger pour après le live.</p></div><span>{resources.length}</span></header>
    {source === "demo" ? <small className="classe-resources__demo">Exemples de démonstration</small> : null}
    {resources.map(resource => <Resource key={resource.id} resource={resource} source={source} roomId={roomId} />)}
  </section>;
}
