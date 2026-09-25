import { LogeQueueControls } from "../audience/LogeRequests";
import { CalendarPlus, Check, HeartHandshake, Radio, Sparkles } from "lucide-react";
import { useMemo } from "react";
import type { LogeState, RoomPerson, RoomToolsCommand, VipMoment } from "../roomTools.types";

const STATUS: Record<VipMoment["status"], string> = {
  pending: "À organiser",
  scheduled: "Invitation envoyée",
  accepted: "Accepté",
  declined: "Refusé",
  live: "En direct",
  completed: "Réalisé",
  cancelled: "Annulé",
};

function nextAction(moment: VipMoment) {
  if (moment.status === "pending") return { label: "Programmer", status: "scheduled" as const, Icon: CalendarPlus };
  if (moment.status === "accepted") return { label: "Démarrer", status: "live" as const, Icon: Radio };
  if (moment.status === "live") return { label: "Terminer", status: "completed" as const, Icon: Check };
  return null;
}

function createMomentId() {
  return `moment-face-to-face-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function PersonButton({ person, disabled, onInvite }: { person: RoomPerson; disabled: boolean; onInvite: () => void }) {
  return <button type="button" disabled={disabled} aria-label={`Inviter ${person.name}`} onClick={onInvite}>
    <img src={person.avatarUrl} alt="" /><span><strong>{person.name}</strong><small>{person.role}</small></span><em>Inviter</em>
  </button>;
}

export default function LogeFaceToFacePanel({
  loge,
  disabled,
  execute,
}: {
  loge: LogeState;
  disabled: boolean;
  execute: (command: RoomToolsCommand) => Promise<unknown>;
}) {
  const faceMoments = loge.moments.filter((moment) => moment.kind === "face-to-face");
  const activeCount = faceMoments.filter((moment) => !["completed", "cancelled", "declined"].includes(moment.status)).length;
  const people = useMemo(() => [
    ...loge.moments.map((moment) => moment.beneficiary),
    ...loge.questions.map((question) => question.author),
  ].filter((person, index, all) => all.findIndex((candidate) => candidate.id === person.id) === index), [loge.moments, loge.questions]);

  const setStatus = (moment: VipMoment, status: VipMoment["status"]) => execute({ type: "loge.moment.status", momentId: moment.id, status });
  const invite = (beneficiary: RoomPerson) => execute({
    type: "loge.moment.add",
    moment: {
      id: createMomentId(),
      kind: "face-to-face",
      title: "Face-à-face 5 minutes",
      beneficiary,
      status: "pending",
    },
  });

  return <div className="room-loge-moments has-workspace is-standalone-tool">
    <header className="room-loge-moments__hero">
      <span><span className="room-loge-moments__title"><strong>Face-à-face</strong><Sparkles aria-hidden="true" /></span><small>Invitations, direct et historique privé</small></span>
      <b><i aria-hidden="true" />{activeCount} À TRAITER</b>
    </header>
    <LogeQueueControls loge={loge} disabled={disabled} execute={execute} kinds={["face-to-face"]} />
    <div className="room-loge-moments__workspace">
      <section className="room-loge-moments__manager is-face" aria-label="Gestion des face-à-face">
        <div className="room-loge-moments__manager-main">
          <header><span><HeartHandshake /><span><strong>Salon face-à-face</strong><small>Préparez chaque rencontre avant le direct.</small></span></span><b>{activeCount} actif{activeCount > 1 ? "s" : ""}</b></header>
          <div className="room-loge-moments__manager-list">
            {faceMoments.length ? faceMoments.map((moment) => {
              const action = nextAction(moment);
              return <article key={moment.id}>
                <img src={moment.beneficiary.avatarUrl} alt="" />
                <span><strong>{moment.beneficiary.name}</strong><small>{moment.title}</small></span>
                <em className={`is-${moment.status}`}>{STATUS[moment.status]}</em>
                {action ? <button type="button" disabled={disabled} onClick={() => void setStatus(moment, action.status)}><action.Icon />{action.label}</button> : null}
              </article>;
            }) : <p className="room-loge-moments__empty"><HeartHandshake /><strong>Aucun face-à-face planifié</strong><small>Invitez un membre de la file privée.</small></p>}
          </div>
        </div>
        <aside className="room-loge-moments__recipients">
          <header><strong>Inviter un membre VIP</strong><small>Depuis la file privée</small></header>
          {people.map((person) => <PersonButton key={person.id} person={person} disabled={disabled} onInvite={() => void invite(person)} />)}
        </aside>
      </section>
    </div>
  </div>;
}
