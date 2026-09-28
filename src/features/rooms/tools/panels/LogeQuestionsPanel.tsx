import {
  X,
  Check,
  Clock3,
  Heart,
  MessageCircle,
  MessageCircleQuestion,
  Radio,
  RotateCcw,
  UserRoundPlus,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { createPlaceClientId } from "../../place/placeClientId";
import RoomQuickPrivateMessage from "../../place/RoomQuickPrivateMessage";
import type { PlaceRuntimeSource } from "../../place/place.types";
import type { LogeState, RoomActorRole, RoomToolsCommand, VipQuestion } from "../roomTools.types";
import { EmptyState, ToolNotice, ToolSection } from "./RoomToolPanelPrimitives";

function questionAge(question: VipQuestion) {
  const sentAt = question.sentAt ? new Date(question.sentAt).getTime() : Number.NaN;
  if (!Number.isFinite(sentAt)) return "À l’instant";
  const elapsed = Math.max(0, Math.round((Date.now() - sentAt) / 60_000));
  if (elapsed < 1) return "À l’instant";
  if (elapsed < 60) return `Il y a ${elapsed} min`;
  return `Il y a ${Math.floor(elapsed / 60)} h`;
}

function QuestionIdentity({ question, onAir = false }: { question: VipQuestion; onAir?: boolean }) {
  return <span className="room-loge-questions__identity">
    <span className="room-loge-questions__avatar"><img src={question.author.avatarUrl} alt="" loading="lazy" /></span>
    <span className="room-loge-questions__identity-copy">
      <strong>{question.author.name}</strong>
      <small>{question.author.role}</small>
      {onAir ? <span className="room-loge-questions__on-air"><i />À l’écran</span> : null}
    </span>
  </span>;
}

function QuestionMeta({ question }: { question: VipQuestion }) {
  return <span className="room-loge-questions__meta"><time><Clock3 aria-hidden="true" />{questionAge(question)}</time>{question.supports ? <b><Heart aria-hidden="true" />{question.supports}</b> : null}</span>;
}

export default function LogeQuestionsPanel({
  loge,
  role,
  accountId,
  disabled,
  execute,
  onOpenMomentVip,
  onDisplayQuestion,
  onClearQuestion,
  source = "demo",
  authenticated = false,
}: {
  loge: LogeState;
  role: RoomActorRole;
  accountId: string;
  disabled: boolean;
  execute: (command: RoomToolsCommand) => Promise<unknown>;
  onOpenMomentVip?: (personId: string) => void;
  onDisplayQuestion?: (question: VipQuestion) => Promise<void>;
  onClearQuestion?: (question: VipQuestion) => Promise<void>;
  source?: PlaceRuntimeSource;
  authenticated?: boolean;
}) {
  const [questionText, setQuestionText] = useState("");
  const [replyTarget, setReplyTarget] = useState<VipQuestion | null>(null);
  const [workingQuestionId, setWorkingQuestionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const replyTriggerRef = useRef<HTMLButtonElement | null>(null);
  const questionActionLock = useRef(false);
  const canModerate = role === "host" || role === "regisseur";
  const canAsk = role !== "visitor" && !canModerate && loge.questionsOpen;
  const selectedQuestion = loge.questions.find((question) => question.status === "selected") ?? null;
  const pendingQuestions = useMemo(() => {
    const questions = loge.questions.filter((question) => question.status === "pending");
    return questions.sort((left, right) => (right.supports ?? 0) - (left.supports ?? 0));
  }, [loge.questions]);
  const answeredQuestions = useMemo(() => loge.questions
    .filter((question) => question.status === "answered")
    .sort((left, right) => new Date(right.sentAt ?? 0).getTime() - new Date(left.sentAt ?? 0).getTime()), [loge.questions]);

  const submitQuestion = async () => {
    if (!questionText.trim()) return;
    const template = loge.questions.find((question) => question.author.id === accountId)?.author ?? loge.questions[0]?.author;
    if (!template) return;
    await execute({
      type: "loge.question.add",
      question: {
        id: createPlaceClientId(),
        author: { ...template, id: accountId, name: "Vous" },
        text: questionText.trim(),
        status: "pending",
        invited: false,
        sentAt: new Date().toISOString(),
      },
    });
    setQuestionText("");
  };

  const updateQuestion = (question: VipQuestion, status: VipQuestion["status"]) => execute({
    type: "loge.question.status",
    questionId: question.id,
    status,
  });

  const runQuestionAction = async (question: VipQuestion, action: () => Promise<unknown>) => {
    if (disabled || questionActionLock.current) return;
    questionActionLock.current = true;
    setWorkingQuestionId(question.id);
    setActionError("");
    try {
      await action();
    } catch {
      setActionError("L’action n’a pas pu aboutir. Réessaie dans un instant.");
    } finally {
      questionActionLock.current = false;
      setWorkingQuestionId(null);
    }
  };

  const displayQuestion = async (question: VipQuestion) => {
    await updateQuestion(question, "selected");
    try {
      await onDisplayQuestion?.(question);
    } catch (cause) {
      await updateQuestion(question, "pending").catch(() => undefined);
      if (selectedQuestion && selectedQuestion.id !== question.id) {
        await updateQuestion(selectedQuestion, "selected").catch(() => undefined);
      }
      throw cause;
    }
  };

  const completeQuestion = async (question: VipQuestion) => {
    await updateQuestion(question, "answered");
    try {
      await onClearQuestion?.(question);
    } catch (cause) {
      await updateQuestion(question, "selected").catch(() => undefined);
      throw cause;
    }
  };

  const visibleQuestions = useMemo(() => [
    ...(selectedQuestion ? [selectedQuestion] : []),
    ...pendingQuestions,
    ...answeredQuestions,
  ], [answeredQuestions, pendingQuestions, selectedQuestion]);

  const renderQuestion = (question: VipQuestion) => {
    const isSelected = question.status === "selected";
    const isAnswered = question.status === "answered";
    const actionPending = workingQuestionId !== null;
    return <article key={question.id} data-question-state={question.status} aria-busy={workingQuestionId === question.id || undefined} className={`${isSelected ? "is-selected" : ""}${isAnswered ? " is-answered" : ""}`}>
      <header><QuestionIdentity question={question} onAir={isSelected} /><QuestionMeta question={question} /></header>
      <blockquote>{question.text}</blockquote>
      {canModerate ? <footer>
        <button
          type="button"
          className="is-secondary is-private"
          aria-label="Répondre en privé"
          title="Répondre en privé"
          disabled={disabled || actionPending}
          onClick={(event) => {
            replyTriggerRef.current = event.currentTarget;
            setReplyTarget(question);
          }}
        ><MessageCircle aria-hidden="true" /></button>
        {isSelected ? <><button type="button" className="is-secondary is-complete" aria-label="Marquer comme répondue" title="Marquer comme répondue" disabled={disabled || actionPending} onClick={() => void runQuestionAction(question, () => completeQuestion(question))}><Check aria-hidden="true" /></button><button type="button" className="is-primary" aria-label="Moment VIP" title="Moment VIP" disabled={disabled || actionPending || !onOpenMomentVip} onClick={() => onOpenMomentVip?.(question.author.id)}><UserRoundPlus aria-hidden="true" /></button></> : null}
        {question.status === "pending" ? <><button type="button" className="is-primary is-display" aria-label="Afficher dans le live" title="Afficher dans le live" disabled={disabled || actionPending} onClick={() => void runQuestionAction(question, () => displayQuestion(question))}><span>Live</span></button><button type="button" className="is-secondary is-ignore" title="Ignorer la question" disabled={disabled || actionPending} aria-label={`Ignorer la question de ${question.author.name}`} onClick={() => void runQuestionAction(question, () => updateQuestion(question, "rejected"))}><X aria-hidden="true" /></button></> : null}
        {isAnswered ? <button type="button" className="is-secondary is-restore" aria-label="Remettre dans la file" title="Remettre dans la file" disabled={disabled || actionPending} onClick={() => void runQuestionAction(question, () => updateQuestion(question, "pending"))}><RotateCcw aria-hidden="true" /></button> : null}
      </footer> : null}
    </article>;
  };

  return <div className={`room-loge-questions is-feed-layout${canAsk ? " has-composer" : ""}`}>
    <div className="room-loge-questions__commandbar" aria-label="Réception des questions">
      <span className="room-loge-questions__summary" aria-live="polite"><i aria-hidden="true" /><strong>{pendingQuestions.length} à traiter</strong>{selectedQuestion ? <small>1 à l’écran</small> : <small>Aucune à l’écran</small>}</span>
      {canModerate ? <button type="button" className="room-loge-questions__intake" role="switch" aria-checked={loge.questionsOpen} aria-label={loge.questionsOpen ? "Fermer les questions" : "Ouvrir les questions"} disabled={disabled} onClick={() => void execute({ type: "loge.questions.open", open: !loge.questionsOpen })}><Radio aria-hidden="true" /><span>Réception {loge.questionsOpen ? "ouverte" : "fermée"}</span></button> : <span className={`room-loge-questions__open-state ${loge.questionsOpen ? "is-open" : ""}`}>Réception {loge.questionsOpen ? "ouverte" : "fermée"}</span>}
    </div>

    {actionError ? <p className="room-loge-questions__action-error" role="alert">{actionError}</p> : null}

    <section className="room-loge-questions__feed" aria-label="Questions de la Loge">
      {visibleQuestions.map(renderQuestion)}
      {!visibleQuestions.length ? <EmptyState title="La file est vide">Les nouvelles questions apparaîtront ici en direct.</EmptyState> : null}
    </section>

    {replyTarget ? <RoomQuickPrivateMessage
      target={{
        id: replyTarget.author.id,
        name: replyTarget.author.name,
        role: replyTarget.author.role,
        avatarUrl: replyTarget.author.avatarUrl,
      }}
      source={source}
      authenticated={authenticated}
      disabled={disabled}
      open
      onClose={() => setReplyTarget(null)}
      returnFocusRef={replyTriggerRef}
      allowDemoSimulation
      tone="loge"
    /> : null}

    {canAsk ? <ToolSection title="Poser une question" className="room-loge-questions__composer"><label className="room-tool-field"><textarea rows={3} maxLength={280} value={questionText} onChange={(event) => setQuestionText(event.currentTarget.value)} placeholder="Écrivez votre question pour l’artiste…" /></label><button type="button" className="is-primary" disabled={disabled || !questionText.trim()} onClick={() => void submitQuestion()}><MessageCircleQuestion />Envoyer la question</button></ToolSection> : role === "visitor" ? <ToolNotice tone="warning">Connectez-vous avec un accès autorisé pour poser une question.</ToolNotice> : !loge.questionsOpen && !canModerate ? <ToolNotice tone="warning">Les nouvelles questions sont temporairement fermées.</ToolNotice> : null}
  </div>;
}
