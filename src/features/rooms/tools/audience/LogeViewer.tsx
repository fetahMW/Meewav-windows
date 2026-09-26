import { useState, type ReactNode, type FormEvent } from "react";
import {
  Headphones,
  MessageCircleQuestion,
  Gift,
  ArrowRight,
  LockKeyhole,
  UsersRound,
  Check,
  Send,
} from "lucide-react";
import {
  buildMessagingRoute,
  isMessagingUuid,
} from "../../../messaging/messaging.route";
import type {
  LogeState,
  RoomPerson,
  RoomToolsCommand,
} from "../roomTools.types";
import "./loge-viewer.css";
import { LogeRequestLists } from "./LogeRequests";
import { RoomViewerSubmenu } from "../../place/RoomViewerToolsLayout";
type Props = {
  loge: LogeState;
  accountId: string;
  viewer: RoomPerson;
  hostName: string;
  eligible: boolean;
  canEngage: boolean;
  busy: boolean;
  preview: ReactNode;
  onOpenChat?: () => void;
  execute: (command: RoomToolsCommand) => Promise<unknown>;
};
const statusLabel = {
  pending: "En attente",
  scheduled: "Prévu",
  accepted: "Accepté",
  declined: "Décliné",
  live: "En cours",
  completed: "Reçu",
  cancelled: "Annulé",
};
export default function LogeViewer({
  loge,
  accountId,
  viewer,
  hostName,
  eligible,
  canEngage,
  busy,
  preview,
  onOpenChat,
  execute,
}: Props) {
  const [panel, setPanel] = useState<"moment" | "questions" | "personal" | "requests">(
      "moment",
    ),
    [question, setQuestion] = useState(""),
    [error, setError] = useState(""),
    [sent, setSent] = useState(false);
  const ownQuestions = loge.questions.filter((q) => q.author.id === accountId);
  const selected = loge.questions.find((q) => q.status === "selected");
  const moments = loge.moments.filter((m) => m.beneficiary.id === accountId);
  const invitation = moments.find(
    (m) =>
      m.kind === "face-to-face" &&
      ["scheduled", "accepted", "live"].includes(m.status),
  );
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!question.trim() || busy || !canEngage || !loge.questionsOpen) return;
    setError("");
    setSent(false);
    try {
      await execute({
        type: "loge.question.add",
        question: {
          id: crypto.randomUUID(),
          author: { ...viewer, id: accountId },
          text: question.trim(),
          status: "pending",
          invited: false,
          sentAt: new Date().toISOString(),
        },
      });
      setQuestion("");
      setSent(true);
    } catch {
      setError(
        "Votre question n’a pas été envoyée. Réessayez, votre texte est conservé.",
      );
    }
  };
  const respond = async (accept: boolean) => {
    if (!invitation || busy || !canEngage) return;
    setError("");
    try {
      await execute({
        type: "loge.moment.respond",
        momentId: invitation.id,
        accountId,
        accept,
      });
    } catch {
      setError("La réponse n’a pas été enregistrée. Réessayez.");
    }
  };
  return (
    <div className={`loge-viewer${panel === "requests" ? " is-request-list" : ""}`}>
      {eligible ? <RoomViewerSubmenu
        activeTool={panel === "requests" ? "personal" : panel}
        ariaLabel="Explorer la Loge"
        idPrefix="loge-viewer-tab"
        items={[
          { id: "moment", label: "Le moment", icon: <Headphones aria-hidden="true" /> },
          { id: "questions", label: "Questions", icon: <MessageCircleQuestion aria-hidden="true" /> },
          { id: "personal", label: "Pour moi", icon: <Gift aria-hidden="true" />, badge: moments.length },
        ]}
        onSelect={setPanel}
      /> : null}
      <header className="loge-viewer__welcome" hidden={panel === "requests"}>
        <div className="loge-viewer__eyebrow">
          <span className="loge-viewer__live" />
          LA LOGE<span>{eligible ? "ACCÈS MEMBRE" : "ACCÈS PRIVÉ"}</span>
        </div>
        <h2>Un moment à part.</h2>
        <p>
          Avec <strong>{hostName}</strong>, au plus près de la création.
        </p>
      </header>
      {!eligible ? (
        <section className="loge-viewer__card loge-viewer__empty">
          <LockKeyhole />
          <h3>Cette Loge est réservée</h3>
          <p>
            Une invitation ou un accès VIP est nécessaire pour rejoindre les
            échanges et découvrir les contenus de l’artiste.
          </p>
        </section>
      ) : (
        <>
          {invitation ? (
            <section className="loge-viewer__invitation" role="status">
              <UsersRound />
              <div>
                <small>VOTRE INVITATION</small>
                <strong>
                  {invitation.status === "live"
                    ? "Votre face-à-face est en cours"
                    : invitation.status === "accepted"
                      ? "Invitation acceptée"
                      : "L’artiste vous invite à échanger"}
                </strong>
                <p>
                  {invitation.status === "accepted"
                    ? "Préparez votre micro et votre caméra à la prochaine étape."
                    : "Vous choisissez de participer. Votre micro reste éteint avant votre accord."}
                </p>
              </div>
              {invitation.status === "scheduled" ? (
                <div className="loge-viewer__actions">
                  <button
                    disabled={busy || !canEngage}
                    onClick={() => void respond(true)}
                  >
                    <Check />
                    Accepter
                  </button>
                  <button
                    disabled={busy || !canEngage}
                    onClick={() => void respond(false)}
                  >
                    Pas maintenant
                  </button>
                </div>
              ) : null}
            </section>
          ) : null}
          <button className="loge-viewer__question-cta" onClick={() => setPanel("requests")}><Gift /><span><strong>{panel === "requests" ? "Mes demandes" : "Cadeaux, dédicaces et rencontres"}</strong>{panel !== "requests" ? <small>Demander une attention · Rejoindre une liste</small> : null}</span><ArrowRight /></button>
          {error ? (
            <p className="loge-viewer__error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="loge-viewer__content" role="tabpanel" aria-labelledby={`loge-viewer-tab-${panel === "requests" ? "personal" : panel}`}>
            <div className="loge-viewer__moment" hidden={panel !== "moment"}>
              <section className="loge-viewer__card loge-viewer__preview">
                <div className="loge-viewer__section-label">
                  <Headphones />
                  <span>AVANT-PREMIÈRE</span>
                  <small>
                    {loge.preview.transportStatus === "playing"
                      ? "En diffusion"
                      : loge.preview.transportStatus === "paused"
                        ? "En pause"
                        : "À découvrir"}
                  </small>
                </div>
                <h3>
                  {loge.preview.title || "Dans les coulisses de la création"}
                </h3>
                {loge.preview.description ? (
                  <p>{loge.preview.description}</p>
                ) : null}
                {preview}
              </section>
              {selected ? (
                <section className="loge-viewer__card loge-viewer__selected">
                  <small>L’ARTISTE VOUS RÉPOND</small>
                  <blockquote>« {selected.text} »</blockquote>
                  <span>@{selected.author.name}</span>
                </section>
              ) : null}
              <button
                className="loge-viewer__question-cta"
                onClick={() => setPanel("questions")}
              >
                <MessageCircleQuestion />
                <span>
                  <strong>Une question pour l’artiste ?</strong>
                  <small>
                    {loge.questionsOpen
                      ? "Partagez ce que vous aimeriez savoir"
                      : "Découvrez les questions et vos envois"}
                  </small>
                </span>
                <ArrowRight />
              </button>
              {onOpenChat ? (
                <button className="loge-viewer__chat" onClick={onOpenChat}>
                  Retrouver les fans dans le chat
                  <ArrowRight />
                </button>
              ) : null}
            </div>
            {panel === "requests" ? <LogeRequestLists loge={loge} viewer={{...viewer, id: accountId}} disabled={busy || !canEngage} execute={execute} /> : panel === "questions" ? (
              <section className="loge-viewer__card">
                <div className="loge-viewer__section-label">
                  <MessageCircleQuestion />
                  <span>LA PAROLE AUX FANS</span>
                </div>
                <h3>
                  {loge.questionsOpen
                    ? "À vous de demander."
                    : "Les questions sont en pause."}
                </h3>
                {canEngage && loge.questionsOpen ? (
                  <form className="loge-viewer__question" onSubmit={submit}>
                    <label htmlFor="loge-viewer-question">
                      Votre question <small>{question.length}/280</small>
                    </label>
                    <textarea
                      id="loge-viewer-question"
                      disabled={busy}
                      value={question}
                      onChange={(e) => {
                        setQuestion(e.target.value);
                        setSent(false);
                      }}
                      maxLength={280}
                      rows={3}
                      placeholder="Un morceau, une inspiration, une anecdote…"
                    />
                    <button disabled={busy || !question.trim()}>
                      <Send />
                      Envoyer
                    </button>
                  </form>
                ) : (
                  <p>L’artiste choisit le moment d’ouvrir les questions.</p>
                )}
                {sent ? (
                  <p className="loge-viewer__success" role="status">
                    <Check />
                    Votre question est envoyée.
                  </p>
                ) : null}
                <div className="loge-viewer__history">
                  <h4>
                    Mes questions
                    {ownQuestions.length ? ` · ${ownQuestions.length}` : ""}
                  </h4>
                  {ownQuestions.length ? (
                    ownQuestions.map((q) => (
                      <article key={q.id}>
                        <p>{q.text}</p>
                        <small>
                          {q.status === "pending"
                            ? "Envoyée"
                            : q.status === "selected"
                              ? "Sélectionnée"
                              : q.status === "answered"
                                ? "Répondue"
                                : "Non retenue"}
                        </small>
                      </article>
                    ))
                  ) : (
                    <p>Vos questions et leur statut apparaîtront ici.</p>
                  )}
                </div>
              </section>
            ) : panel === "personal" ? (
              <section className="loge-viewer__card">
                <div className="loge-viewer__section-label">
                  <Gift />
                  <span>VOTRE ESPACE PRIVÉ</span>
                </div>
                <h3>Les attentions de l’artiste.</h3>
                <p>Vos invitations et vos dédicaces, réunies ici.</p>
                {moments.length ? (
                  <div className="loge-viewer__moments">
                    {moments.map((m) => {
                      const conversation = m.privateContent?.startsWith(
                        "conversation:",
                      )
                        ? m.privateContent.slice(13)
                        : null;
                      return (
                        <article key={m.id}>
                          <span className="loge-viewer__moment-icon">
                            {m.kind === "face-to-face" ? (
                              <UsersRound />
                            ) : (
                              <Gift />
                            )}
                          </span>
                          <div>
                            <strong>{m.title}</strong>
                            <small>{m.requested && m.status === "completed" ? "Demande traitée" : statusLabel[m.status]}</small>
                            {m.status === "completed" &&
                            conversation &&
                            isMessagingUuid(conversation) ? (
                              <a
                                href={buildMessagingRoute({
                                  conversationId: conversation,
                                })}
                              >
                                Ouvrir ma dédicace
                                <ArrowRight />
                              </a>
                            ) : null}
                            {m.status === "completed" &&
                            m.privateContent?.startsWith("blob:") ? (
                              m.format === "video" ? (
                                <video
                                  src={m.privateContent}
                                  controls
                                  playsInline
                                />
                              ) : m.format === "audio" ? (
                                <audio src={m.privateContent} controls />
                              ) : null
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="loge-viewer__empty">
                    <Gift />
                    <strong>Le meilleur reste à venir.</strong>
                    <p>
                      Lorsqu’une invitation ou une dédicace vous est adressée,
                      vous la retrouvez ici.
                    </p>
                  </div>
                )}
              </section>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
