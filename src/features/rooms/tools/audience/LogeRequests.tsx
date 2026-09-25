import { useRef, useState } from "react";
import { Gift, HeartHandshake, PenLine, Check, ArrowRight } from "lucide-react";
import type { LogeState, RoomPerson, RoomToolsCommand, VipMoment } from "../roomTools.types";
import "./loge-requests.css";
export const LOGE_REQUESTS = [
  { kind: "gift-redemption", title: "Un cadeau", action: "Demander mon cadeau", description: "L’artiste examine votre demande selon les cadeaux disponibles.", Icon: Gift },
  { kind: "dedication", title: "Une dédicace", action: "Rejoindre la file des dédicaces", description: "Un souvenir personnalisé, préparé par l’artiste.", Icon: PenLine },
  { kind: "face-to-face", title: "Un face-à-face", action: "Rejoindre la file des face-à-face", description: "Demandez un moment pour échanger avec l’artiste.", Icon: HeartHandshake },
] as const;
const active = (m: VipMoment) => ["pending", "scheduled", "accepted", "live"].includes(m.status);
type Common = { loge: LogeState; disabled: boolean; execute: (command: RoomToolsCommand) => Promise<unknown> };
export function LogeRequestLists({ loge, disabled, execute, viewer }: Common & { viewer: RoomPerson }) {
  const [pending, setPending] = useState(false), [feedback, setFeedback] = useState("");
  const lock = useRef(false);
  const run = async (command: RoomToolsCommand) => {
    if (lock.current || disabled) return;
    lock.current = true; setPending(true); setFeedback("");
    try { await execute(command); setFeedback(command.type === "loge.request.cancel" ? "Vous avez quitté cette liste." : "Votre demande est enregistrée. L’artiste vous préviendra lorsque ce sera votre tour."); }
    catch { setFeedback("La demande n’a pas pu être enregistrée. Vérifiez que la liste est ouverte et réessayez."); }
    finally { lock.current = false; setPending(false); }
  };
  return <section className="loge-requests" aria-label="Les listes de la Loge">
    <header><h3>Votre moment avec l’artiste</h3><p>Choisissez une liste ouverte. L’inscription reste soumise à la disponibilité de l’artiste.</p></header>
    {feedback ? <p role="status">{feedback}</p> : null}
    {LOGE_REQUESTS.map(({ kind, title, action, description, Icon }) => {
      const own = loge.moments.find((m) => m.beneficiary.id === viewer.id && m.kind === kind && active(m));
      const open = loge.requestQueues?.[kind] === true;
      return <article key={kind}><Icon aria-hidden="true" /><div><strong>{title}</strong><p>{description}</p>
        <small>{own ? own.status === "pending" ? "Vous êtes sur la liste · En attente du host" : own.status === "live" ? "Votre moment est en cours" : "Votre demande est prise en charge" : open ? "Inscriptions ouvertes" : "Inscriptions fermées par l’artiste"}</small>
        {own ? own.requested && own.status === "pending" ? <button disabled={disabled || pending} onClick={() => void run({ type: "loge.request.cancel", momentId: own.id, accountId: viewer.id })}>Quitter cette liste</button> : <span className="loge-requests__confirmed"><Check /> Inscrit</span> : <button disabled={disabled || pending || !open} onClick={() => void run({ type: "loge.request.join", kind, person: viewer })}>{action}<ArrowRight /></button>}
      </div></article>;
    })}
  </section>;
}
export function LogeQueueControls({ loge, disabled, execute, kinds = LOGE_REQUESTS.map((q) => q.kind) }: Common & { kinds?: VipMoment["kind"][] }) {
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const run = async (command: RoomToolsCommand) => {
    if (pending || disabled) return;
    setPending(true); setError("");
    try { await execute(command); } catch { setError("La liste n’a pas été mise à jour. Réessayez."); } finally { setPending(false); }
  };
  return <section className="loge-requests loge-requests--host" aria-label="Inscriptions des fans"><h3>Listes de demandes</h3>{error ? <p role="alert">{error}</p> : null}
    {LOGE_REQUESTS.filter((q) => kinds.includes(q.kind)).map(({kind, title, Icon}) => {
      const requests = loge.moments.filter((m) => m.kind === kind && m.requested && active(m));
      const open = loge.requestQueues?.[kind] === true;
      return <div key={kind}><header><Icon /><strong>{title} · {requests.length}</strong><button disabled={disabled || pending} aria-pressed={open} onClick={() => void run({type:"loge.queue.setOpen",kind,open:!open})}>{open ? "Fermer" : "Ouvrir"} les inscriptions · {title}</button></header>
        {requests.map((m) => <article key={m.id}><img src={m.beneficiary.avatarUrl} alt="" /><div><strong>{m.beneficiary.name}</strong><small>{m.status === "pending" ? "En attente" : "Pris en charge"}</small></div>{m.status === "pending" ? <><button disabled={disabled || pending} onClick={() => void run({type:"loge.moment.status",momentId:m.id,status:kind === "face-to-face" ? "scheduled" : "completed"})}>{kind === "face-to-face" ? "Inviter" : "Marquer traitée"}</button><button disabled={disabled || pending} onClick={() => void run({type:"loge.moment.status",momentId:m.id,status:"declined"})}>Décliner</button></> : null}</article>)}
      </div>;
    })}
  </section>;
}
