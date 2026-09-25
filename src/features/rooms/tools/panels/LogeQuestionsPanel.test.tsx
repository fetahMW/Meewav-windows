import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoomToolsFixture } from "../roomTools.fixtures";
import type { LogeState, RoomActorRole, RoomToolsCommand } from "../roomTools.types";
import LogeQuestionsPanel from "./LogeQuestionsPanel";

afterEach(cleanup);

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});

function createLoge(): LogeState {
  return createRoomToolsFixture("loge", "loge-questions-panel").loge!;
}

function renderQuestions({
  loge = createLoge(),
  role = "host",
  accountId = "loge-host",
  disabled = false,
  execute = vi.fn(async (_command: RoomToolsCommand) => undefined),
  onOpenMomentVip = vi.fn(),
  onDisplayQuestion = vi.fn(async () => undefined),
  onClearQuestion = vi.fn(async () => undefined),
}: {
  loge?: LogeState;
  role?: RoomActorRole;
  accountId?: string;
  disabled?: boolean;
  execute?: (command: RoomToolsCommand) => Promise<unknown>;
  onOpenMomentVip?: (personId: string) => void;
  onDisplayQuestion?: (question: LogeState["questions"][number]) => Promise<void>;
  onClearQuestion?: (question: LogeState["questions"][number]) => Promise<void>;
} = {}) {
  const view = render(<LogeQuestionsPanel
    loge={loge}
    role={role}
    accountId={accountId}
    disabled={disabled}
    execute={execute}
    onOpenMomentVip={onOpenMomentVip}
    onDisplayQuestion={onDisplayQuestion}
    onClearQuestion={onClearQuestion}
  />);
  return { ...view, loge, execute, onOpenMomentVip, onDisplayQuestion, onClearQuestion };
}

function questionArticle(text: string) {
  const article = screen.getByText(text).closest("article");
  expect(article).not.toBeNull();
  return article!;
}

describe("LogeQuestionsPanel", () => {
  it("renders one compact question feed without a second navigation and lets the Host close intake", () => {
    const { container, execute } = renderQuestions();

    expect(container.querySelector(".room-loge-questions__commandbar")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Questions de la Loge" })).toBeInTheDocument();
    expect(container.querySelector(".room-loge-questions__feed")).toBeInTheDocument();
    expect(container.querySelector(".room-loge-questions__hero")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Trier les questions" })).not.toBeInTheDocument();
    expect(screen.queryByText("Populaires")).not.toBeInTheDocument();
    expect(screen.queryByText("Récentes")).not.toBeInTheDocument();
    expect(screen.queryByText("Répondues")).not.toBeInTheDocument();

    const intake = screen.getByRole("switch", { name: "Fermer les questions" });
    expect(intake).toHaveAttribute("aria-checked", "true");
    fireEvent.click(intake);

    expect(execute).toHaveBeenCalledWith({ type: "loge.questions.open", open: false });
  });

  it("keeps pending and answered questions in the same feed and restores an answered question", () => {
    const { loge, execute } = renderQuestions();
    const answered = loge.questions.find((question) => question.status === "answered")!;
    const pending = loge.questions.find((question) => question.status === "pending")!;

    expect(screen.getByText(answered.text)).toBeInTheDocument();
    expect(screen.getByText(pending.text)).toBeInTheDocument();
    expect(screen.getByText("À l’écran")).toBeInTheDocument();

    fireEvent.click(within(questionArticle(answered.text)).getByRole("button", { name: "Remettre dans la file" }));
    expect(execute).toHaveBeenCalledWith({
      type: "loge.question.status",
      questionId: answered.id,
      status: "pending",
    });
  });

  it("selects a queued question, completes the live question and hands its author to Moment VIP", async () => {
    const onOpenMomentVip = vi.fn();
    const onDisplayQuestion = vi.fn(async () => undefined);
    const onClearQuestion = vi.fn(async () => undefined);
    const { loge, execute } = renderQuestions({ onOpenMomentVip, onDisplayQuestion, onClearQuestion });
    const pending = loge.questions.find((question) => question.status === "pending")!;
    const selected = loge.questions.find((question) => question.status === "selected")!;

    fireEvent.click(within(questionArticle(pending.text)).getByRole("button", { name: "Afficher dans le live" }));
    await waitFor(() => expect(execute).toHaveBeenCalledWith({
      type: "loge.question.status",
      questionId: pending.id,
      status: "selected",
    }));
    expect(onDisplayQuestion).toHaveBeenCalledWith(pending);

    const liveQuestion = questionArticle(selected.text);
    fireEvent.click(within(liveQuestion).getByRole("button", { name: "Marquer comme répondue" }));
    await waitFor(() => expect(execute).toHaveBeenCalledWith({
      type: "loge.question.status",
      questionId: selected.id,
      status: "answered",
    }));
    expect(onClearQuestion).toHaveBeenCalledWith(selected);

    fireEvent.click(within(liveQuestion).getByRole("button", { name: "Moment VIP" }));
    expect(onOpenMomentVip).toHaveBeenCalledWith(selected.author.id);
  });

  it("offers private reply, live display and ignore as three distinct Host actions", async () => {
    const { loge, execute } = renderQuestions();
    const pending = loge.questions.find((question) => question.status === "pending")!;
    const card = questionArticle(pending.text);

    expect(within(card).getAllByRole("button")).toHaveLength(3);
    expect(within(card).getByRole("button", { name: "Répondre en privé" })).toBeEnabled();
    expect(within(card).getByRole("button", { name: "Afficher dans le live" })).toBeEnabled();
    expect(within(card).getByRole("button", { name: `Ignorer la question de ${pending.author.name}` })).toBeEnabled();

    fireEvent.click(within(card).getByRole("button", { name: "Répondre en privé" }));
    expect(screen.getByRole("dialog", { name: `Message privé à ${pending.author.name}` })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Réponse privée" }), { target: { value: "Merci, je te réponds juste après le live." } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Réponse privée simulée");
    expect(execute).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));

    fireEvent.click(within(card).getByRole("button", { name: `Ignorer la question de ${pending.author.name}` }));
    expect(execute).toHaveBeenCalledWith({
      type: "loge.question.status",
      questionId: pending.id,
      status: "rejected",
    });
  });

  it("locks a live-display action and restores the prior selection if the stage update fails", async () => {
    const loge = createLoge();
    const execute = vi.fn(async (_command: RoomToolsCommand) => undefined);
    const onDisplayQuestion = vi.fn(async () => { throw new Error("highlight_failed"); });
    renderQuestions({ loge, execute, onDisplayQuestion });
    const pending = loge.questions.find((question) => question.status === "pending")!;
    const selected = loge.questions.find((question) => question.status === "selected")!;
    const display = within(questionArticle(pending.text)).getByRole("button", { name: "Afficher dans le live" });

    fireEvent.click(display);
    fireEvent.click(display);

    await screen.findByRole("alert");
    expect(onDisplayQuestion).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith({ type: "loge.question.status", questionId: pending.id, status: "selected" });
    expect(execute).toHaveBeenCalledWith({ type: "loge.question.status", questionId: pending.id, status: "pending" });
    expect(execute).toHaveBeenCalledWith({ type: "loge.question.status", questionId: selected.id, status: "selected" });
  });

  it("does not expose moderation actions to a Viewer", () => {
    const { loge } = renderQuestions({ role: "viewer", accountId: "viewer" });
    const pending = loge.questions.find((question) => question.status === "pending")!;
    const card = questionArticle(pending.text);

    expect(within(card).queryByRole("button", { name: "Répondre en privé" })).not.toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "Afficher dans le live" })).not.toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: /Ignorer la question/i })).not.toBeInTheDocument();
  });

  it("submits a participant question but keeps the composer inert when controls are disabled", async () => {
    const loge = createLoge();
    const execute = vi.fn(async (_command: RoomToolsCommand) => undefined);
    const props = {
      loge,
      role: "viewer" as const,
      accountId: loge.questions[0].author.id,
      execute,
      onOpenMomentVip: vi.fn(),
    };
    const { rerender } = render(<LogeQuestionsPanel {...props} disabled={false} />);
    const composer = screen.getByPlaceholderText("Écrivez votre question pour l’artiste…");
    const submit = screen.getByRole("button", { name: "Envoyer la question" });

    fireEvent.change(composer, { target: { value: "Peux-tu expliquer la naissance du refrain ?" } });
    fireEvent.click(submit);

    await waitFor(() => expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      type: "loge.question.add",
      question: expect.objectContaining({
        author: expect.objectContaining({ id: props.accountId, name: "Vous" }),
        text: "Peux-tu expliquer la naissance du refrain ?",
        status: "pending",
      }),
    })));

    rerender(<LogeQuestionsPanel {...props} disabled />);
    fireEvent.change(screen.getByPlaceholderText("Écrivez votre question pour l’artiste…"), { target: { value: "Cette action doit rester bloquée." } });

    expect(screen.getByRole("button", { name: "Envoyer la question" })).toBeDisabled();
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
