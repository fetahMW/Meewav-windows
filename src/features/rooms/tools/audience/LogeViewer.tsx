import { useState, type ReactNode, type FormEvent } from "react";
import {
  Headphones,
  House,
  MessageCircle,
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
  hostAvatarUrl?: string;
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
  hostAvatarUrl,
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
          { id: "moment", label: "Accueil", icon: <House aria-hidden="true" /> },
          { id: "questions", label: "Questions", icon: <MessageCircleQuestion aria-hidden="true" /> },
          { id: "personal", label: "Pour moi", icon: <Gift aria-hidden="true" />, badge: moments.length },
        ]}
        onSelect={setPanel}
      /> : null}
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
          {error ? (
            <p className="loge-viewer__error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="loge-viewer__content" role="tabpanel" aria-labelledby={`loge-viewer-tab-${panel === "requests" ? "personal" : panel}`}>
            <div className="loge-viewer__moment" hidden={panel !== "moment"}>
              <header className="loge-viewer__home-welcome">
                <span className="loge-viewer__host-portrait" aria-hidden="true">
                  {hostAvatarUrl ? <img src={hostAvatarUrl} alt="" /> : <House />}
                </span>
                <div>
                  <small>LA LOGE DE {hostName}</small>
                  <h2>Bienvenue, les fans.</h2>
                  <p>Échangez avec {hostName}, posez vos questions et créez des souvenirs.</p>
                </div>
              </header>
              {onOpenChat ? <button type="button" className="loge-viewer__join-chat" onClick={onOpenChat}>
                <MessageCircle aria-hidden="true" />
                <span><strong>Rejoindre le chat</strong><small>Un mot pour l’artiste, un échange entre fans.</small></span>
                <ArrowRight aria-hidden="true" />
              </button> : null}
              <nav className="loge-viewer__home-actions" aria-label="Participer à la Loge">
                <button type="button" onClick={() => setPanel("questions")}>
                  <MessageCircleQuestion aria-hidden="true" />
                  <strong>{loge.questionsOpen ? "Poser une question" : "Voir les questions"}</strong>
                  <small>{loge.questionsOpen ? "L’artiste choisit les questions auxquelles répondre." : "Les envois sont en pause. Retrouvez vos questions."}</small>
                  <ArrowRight aria-hidden="true" />
                </button>
                <button type="button" onClick={() => setPanel("requests")}>
                  <Gift aria-hidden="true" />
                  <strong>Dédicaces & rencontres</strong>
                  <small>Découvrez les demandes ouvertes par l’artiste.</small>
                  <ArrowRight aria-hidden="true" />
                </button>
              </nav>
              <p className="loge-viewer__personal-hint">Retrouvez vos invitations et vos dédicaces reçues dans <button type="button" onClick={() => setPanel("personal")}>Pour moi <ArrowRight aria-hidden="true" /></button></p>
              {selected ? (
                <section className="loge-viewer__card loge-viewer__selected">
                  <small>LA QUESTION CHOISIE PAR {hostName}</small>
                  <blockquote>« {selected.text} »</blockquote>
                  <span>Une question de {selected.author.name}</span>
                </section>
              ) : null}
              {preview ? <section className="loge-viewer__card loge-viewer__preview">
                <div className="loge-viewer__section-label">
                  <Headphones aria-hidden="true" />
                  <span>PARTAGÉ PAR L’ARTISTE</span>
                  <small>
                    {loge.preview.transportStatus === "paused" ? "En pause" : "En diffusion"}
                  </small>
                </div>
                <h3>
                  {loge.preview.title || `L’avant-première de ${hostName}`}
                </h3>
                {loge.preview.description ? (
                  <p>{loge.preview.description}</p>
                ) : null}
                {preview}
              </section> : <p className="loge-viewer__sharing-hint"><Headphones aria-hidden="true" />Les contenus partagés pendant le direct apparaîtront ici.</p>}
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
                <button type="button" className="loge-viewer__question-cta" onClick={() => setPanel("requests")}><Gift aria-hidden="true" /><span><strong>Faire une demande</strong><small>Cadeaux, dédicaces et rencontres</small></span><ArrowRight aria-hidden="true" /></button>
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
