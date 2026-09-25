import { CheckCircle2, CircleHelp, Clock3, MessageCircle, Mic, MonitorUp, Radio, ThumbsUp, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { ClassQuestion, ClasseState, RoomToolsCommand } from "../roomTools.types";
import { EmptyState } from "./RoomToolPanelPrimitives";

type QuestionTab = "popular" | "recent" | "answered";
type QuestionFocusRequest = {
  questionId: string;
  destination: "featured" | "feed" | "tab";
  message: string;
};

export type ClassQuestionsPanelProps = {
  classe: ClasseState;
  disabled: boolean;
  execute: (command: RoomToolsCommand) => Promise<unknown>;
  onDisplayQuestion?: (question: ClassQuestion) => void | Promise<void>;
  onClearQuestion?: (question: ClassQuestion) => void | Promise<void>;
  onGiveFloor: (personId: string) => void;
};

const TAB_LABEL: Record<QuestionTab, string> = {
  popular: "Populaires",
  recent: "Récentes",
  answered: "Répondues",
};
const QUESTION_TABS = Object.keys(TAB_LABEL) as QuestionTab[];

const STATUS_LABEL: Record<ClassQuestion["status"], string> = {
  pending: "À traiter",
  displayed: "Dans la classe",
  answered: "Répondue",
};

function sentLabel(sentAt: string) {
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - new Date(sentAt).getTime()) / 60_000));
  if (elapsedMinutes < 1) return "à l’instant";
  if (elapsedMinutes < 60) return `il y a ${elapsedMinutes} min`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  return elapsedHours < 24 ? `il y a ${elapsedHours} h` : `il y a ${Math.floor(elapsedHours / 24)} j`;
}

function byRecent(a: ClassQuestion, b: ClassQuestion) {
  return new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime();
}

export default function ClassQuestionsPanel({
  classe,
  disabled,
  execute,
  onDisplayQuestion,
  onClearQuestion,
  onGiveFloor,
}: ClassQuestionsPanelProps) {
  const [activeTab, setActiveTab] = useState<QuestionTab>("popular");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState("");
  const featuredRemoveRef = useRef<HTMLButtonElement | null>(null);
  const displayButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const tabRefs = useRef(new Map<QuestionTab, HTMLButtonElement>());
  const focusRequestRef = useRef<QuestionFocusRequest | null>(null);
  const questions = useMemo(() => classe.questions ?? [], [classe.questions]);
  const openQuestions = useMemo(
    () => questions.filter((question) => question.status !== "answered"),
    [questions],
  );
  const answeredQuestions = useMemo(
    () => questions.filter((question) => question.status === "answered"),
    [questions],
  );
  const visibleQuestions = useMemo(() => {
    if (activeTab === "answered") return [...answeredQuestions].sort(byRecent);
    if (activeTab === "recent") return [...openQuestions].sort(byRecent);
    return [...openQuestions].sort((a, b) => b.supports - a.supports || byRecent(a, b));
  }, [activeTab, answeredQuestions, openQuestions]);
  const featuredQuestion = questions.find((question) => question.id === classe.featuredQuestionId);
  const feedQuestions = useMemo(
    () => visibleQuestions.filter((question) => question.id !== featuredQuestion?.id),
    [featuredQuestion?.id, visibleQuestions],
  );
  const featuredAuthorSeat = featuredQuestion
    ? classe.seats.find((seat) => seat.person?.id === featuredQuestion.author.id)
    : undefined;
  const featuredAuthor = featuredQuestion ? featuredAuthorSeat?.person ?? featuredQuestion.author : undefined;
  const featuredAuthorCanSpeak = Boolean(
    featuredAuthorSeat
    && !["absent", "disconnected", "suspended"].includes(featuredAuthorSeat.status)
    && featuredAuthorSeat.person?.microphone === "ready",
  );
  const featuredBusy = Boolean(featuredQuestion && pendingAction?.endsWith(featuredQuestion.id));
  const openFeedCount = openQuestions.length - (featuredQuestion && featuredQuestion.status !== "answered" ? 1 : 0);

  useEffect(() => {
    const request = focusRequestRef.current;
    if (!request) return;

    let target: HTMLButtonElement | null = null;
    if (request.destination === "featured" && featuredQuestion?.id === request.questionId) {
      target = featuredRemoveRef.current;
    } else if (request.destination === "feed") {
      if (feedQuestions.some((question) => question.id === request.questionId)) {
        target = displayButtonRefs.current.get(request.questionId) ?? null;
      } else if (featuredQuestion?.id !== request.questionId && !pendingAction) {
        target = tabRefs.current.get(activeTab) ?? null;
      }
    } else if (
      request.destination === "tab"
      && questions.find((question) => question.id === request.questionId)?.status === "answered"
    ) {
      target = tabRefs.current.get(activeTab) ?? null;
    }

    if (!target || target.disabled) return;
    focusRequestRef.current = null;
    setActionStatus(request.message);
    const focusFrame = window.requestAnimationFrame(() => target?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(focusFrame);
  }, [activeTab, feedQuestions, featuredQuestion?.id, pendingAction, questions]);

  const perform = async (key: string, action: () => Promise<void>) => {
    setPendingAction(key);
    setActionError(null);
    setActionStatus("");
    try {
      await action();
    } catch (error) {
      focusRequestRef.current = null;
      setActionError(error instanceof Error ? error.message : "Cette action n’a pas pu être appliquée.");
    } finally {
      setPendingAction(null);
    }
  };

  const toggleDisplay = (question: ClassQuestion) => {
    const featured = classe.featuredQuestionId === question.id;
    focusRequestRef.current = {
      questionId: question.id,
      destination: featured ? "feed" : "featured",
      message: featured ? "Question retirée de la classe." : "Question affichée dans la classe.",
    };
    return perform(`display-${question.id}`, async () => {
      if (featured) {
        if (!onClearQuestion) throw new Error("Le retrait de la classe n’est pas disponible.");
        await onClearQuestion(question);
        await execute({ type: "classe.question.feature", questionId: null });
        if (question.status === "displayed") await execute({ type: "classe.question.status", questionId: question.id, status: "pending" });
        return;
      }

      if (!onDisplayQuestion) throw new Error("L’affichage dans la classe n’est pas disponible.");
      await onDisplayQuestion(question);
      const previousQuestion = questions.find((candidate) => candidate.id === classe.featuredQuestionId);
      if (previousQuestion?.status === "displayed") {
        await execute({ type: "classe.question.status", questionId: previousQuestion.id, status: "pending" });
      }
      await execute({ type: "classe.question.feature", questionId: question.id });
      if (question.status !== "displayed") await execute({ type: "classe.question.status", questionId: question.id, status: "displayed" });
    });
  };

  const markAnswered = (question: ClassQuestion) => {
    focusRequestRef.current = {
      questionId: question.id,
      destination: "tab",
      message: "Question classée comme répondue.",
    };
    return perform(`answer-${question.id}`, async () => {
      if (classe.featuredQuestionId === question.id) {
        if (!onClearQuestion) throw new Error("Retirez d’abord la question de la classe.");
        await onClearQuestion(question);
        await execute({ type: "classe.question.feature", questionId: null });
      }
      await execute({ type: "classe.question.status", questionId: question.id, status: "answered" });
    });
  };

  const toggleQuestionsOpen = () => perform("questions-open", async () => {
    await execute({ type: "classe.questions.open", open: !classe.questionsOpen });
    setActionStatus(classe.questionsOpen ? "Les nouvelles questions sont fermées." : "Les nouvelles questions sont ouvertes.");
  });

  const moveTabFocus = (event: KeyboardEvent<HTMLButtonElement>, currentTab: QuestionTab) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = QUESTION_TABS.indexOf(currentTab);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? QUESTION_TABS.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + QUESTION_TABS.length) % QUESTION_TABS.length;
    const nextTab = QUESTION_TABS[nextIndex];
    setActiveTab(nextTab);
    window.requestAnimationFrame(() => tabRefs.current.get(nextTab)?.focus());
  };

  return <div className="room-tool-panel is-class-questions">
    <span className="sr-only" role="status" aria-live="polite">{actionStatus}</span>
    <header className="class-questions__masthead">
      <span className="class-questions__title">
        <i aria-hidden="true"><CircleHelp /></i>
        <span>
          <small>CLASSE / DIRECT</small>
          <strong>Questions du public</strong>
        </span>
      </span>
      <button
        type="button"
        className={`class-questions__live-toggle ${classe.questionsOpen ? "is-open" : "is-closed"}`}
        role="switch"
        aria-checked={classe.questionsOpen}
        aria-label="Autoriser les questions des élèves"
        aria-busy={pendingAction === "questions-open"}
        title={classe.questionsOpen ? "Fermer les questions" : "Ouvrir les questions"}
        disabled={disabled || pendingAction === "questions-open"}
        onClick={() => void toggleQuestionsOpen()}
      >
        <span aria-hidden="true"><i />{classe.questionsOpen ? "Ouvert" : "Fermé"}</span>
        <b aria-hidden="true"><i /></b>
      </button>
    </header>

    <div className="class-questions__tabs" role="tablist" aria-label="Trier les questions">
      {QUESTION_TABS.map((tab) => {
        const count = tab === "answered" ? answeredQuestions.length : openFeedCount;
        return <button
          ref={(node) => {
            if (node) tabRefs.current.set(tab, node);
            else tabRefs.current.delete(tab);
          }}
          type="button"
          key={tab}
          id={`class-question-tab-${tab}`}
          role="tab"
          aria-label={`${TAB_LABEL[tab]} ${count}`}
          aria-controls="class-question-list-panel"
          aria-selected={activeTab === tab}
          tabIndex={activeTab === tab ? 0 : -1}
          className={activeTab === tab ? "is-active" : ""}
          onClick={() => setActiveTab(tab)}
          onKeyDown={(event) => moveTabFocus(event, tab)}
        >
          {tab === "popular" ? <ThumbsUp /> : tab === "recent" ? <Clock3 /> : <CheckCircle2 />}
          <span>{TAB_LABEL[tab]}</span><b>{count}</b>
        </button>;
      })}
    </div>

    <div className="class-questions__viewport">
      {actionError ? <p className="class-questions__error" role="alert">{actionError}</p> : null}

      {featuredQuestion && featuredAuthor ? <section className="class-question-featured" aria-label="Question affichée dans la classe">
        <header className="class-questions__section-heading">
          <span><Radio /> À L’ÉCRAN</span>
          <small>Question diffusée maintenant</small>
        </header>
        <article className="class-question-card is-featured">
          <header className="class-question-card__header">
            <span className="class-question__author">
              <img src={featuredAuthor.avatarUrl} alt="" />
              <span>
                <strong>{featuredAuthor.name}</strong>
                <small>
                  Place {featuredAuthor.place ?? featuredAuthorSeat?.number ?? "—"}
                  <button
                    ref={featuredRemoveRef}
                    type="button"
                    className="class-question__live-chip"
                    aria-label="Retirer"
                    disabled={disabled || featuredBusy || !onClearQuestion}
                    onClick={() => void toggleDisplay(featuredQuestion)}
                  ><Radio />À L’ÉCRAN<X /></button>
                </small>
              </span>
            </span>
            <span className="class-question__meta">
              <small><Clock3 />{sentLabel(featuredQuestion.sentAt)}</small>
              <b><ThumbsUp />{featuredQuestion.supports}</b>
            </span>
          </header>
          <blockquote>{featuredQuestion.text}</blockquote>
          <footer className="class-question__actions">
            {featuredQuestion.status !== "answered" ? <button
              type="button"
              className="is-answer-action"
              disabled={disabled || featuredBusy || !onClearQuestion}
              onClick={() => void markAnswered(featuredQuestion)}
            ><CheckCircle2 /><span>Répondue</span></button> : null}
            <button
              type="button"
              className="is-floor-action"
              aria-label="Donner la parole"
              disabled={disabled || featuredBusy || !featuredAuthorCanSpeak}
              title={!featuredAuthorCanSpeak ? "Cet élève n’est pas disponible au micro" : undefined}
              onClick={() => onGiveFloor(featuredAuthor.id)}
            ><Mic /><span>Parole</span></button>
          </footer>
        </article>
      </section> : null}

      <section className="class-questions__feed" aria-label="File des questions">
        <header className="class-questions__section-heading">
          <span><MessageCircle /> {activeTab === "answered" ? "RÉPONDUES" : "FILE DU PUBLIC"}</span>
          <small>{feedQuestions.length} {feedQuestions.length > 1 ? "questions" : "question"}</small>
        </header>
        <div id="class-question-list-panel" role="tabpanel" aria-labelledby={`class-question-tab-${activeTab}`}>
          <div className="class-questions__list" role="list" aria-live="polite">
        {feedQuestions.map((question) => {
        const authorSeat = classe.seats.find((seat) => seat.person?.id === question.author.id);
        const author = authorSeat?.person ?? question.author;
        const authorCanSpeak = Boolean(
          authorSeat
          && !["absent", "disconnected", "suspended"].includes(authorSeat.status)
          && authorSeat.person?.microphone === "ready",
        );
        const cardBusy = pendingAction?.endsWith(question.id) ?? false;
        const displayUnavailable = !onDisplayQuestion;
        return <article key={question.id} role="listitem" className={`class-question-card is-${question.status}`}>
            <header className="class-question-card__header">
              <span className="class-question__author">
                <img src={author.avatarUrl} alt="" loading="lazy" />
                <span><strong>{author.name}</strong><small>Place {author.place ?? authorSeat?.number ?? "—"}</small></span>
              </span>
              <span className="class-question__meta">
                <small><Clock3 />{sentLabel(question.sentAt)}</small>
                <b><ThumbsUp />{question.supports}</b>
              </span>
            </header>
            <blockquote>{question.text}</blockquote>
            <footer className="class-question__actions">
                <span className={`class-question__status is-${question.status}`}>{question.status === "answered" ? <CheckCircle2 /> : <MessageCircle />}{STATUS_LABEL[question.status]}</span>
                <button
                  ref={(node) => {
                    if (node) displayButtonRefs.current.set(question.id, node);
                    else displayButtonRefs.current.delete(question.id);
                  }}
                  type="button"
                  className="is-display-action"
                  aria-label="Afficher dans la classe"
                  disabled={disabled || cardBusy || displayUnavailable}
                  title={displayUnavailable ? "Affichage dans la classe indisponible" : undefined}
                  onClick={() => void toggleDisplay(question)}
                >
                  <MonitorUp /><span>À l’écran</span>
                </button>
                {question.status !== "answered" ? <button
                  type="button"
                  className="is-answer-action"
                  disabled={disabled || cardBusy}
                  onClick={() => void markAnswered(question)}
                >
                  <CheckCircle2 /><span>Répondue</span>
                </button> : null}
                <button
                  type="button"
                  className="is-floor-action"
                  aria-label="Donner la parole"
                  disabled={disabled || cardBusy || !authorCanSpeak}
                  title={!authorCanSpeak ? "Cet élève n’est pas disponible au micro" : undefined}
                  onClick={() => onGiveFloor(author.id)}
                >
                  <Mic /><span>Parole</span>
                </button>
            </footer>
        </article>;
        })}
        {!feedQuestions.length ? <EmptyState title={activeTab === "answered" ? "Aucune question répondue" : "Aucune autre question ouverte"}>Les questions de la classe apparaîtront ici.</EmptyState> : null}
          </div>
        </div>
      </section>
      </div>
  </div>;
}
