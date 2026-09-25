import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoomToolsFixture } from "../roomTools.fixtures";
import ClassQuestionsPanel from "./ClassQuestionsPanel";

afterEach(cleanup);

describe("ClassQuestionsPanel", () => {
  it("controls question intake and supports keyboard navigation between filters", async () => {
    const classe = createRoomToolsFixture("classe", "class-question-controls").classe!;
    const execute = vi.fn(async () => undefined);

    render(
      <ClassQuestionsPanel
        classe={{ ...classe, featuredQuestionId: null }}
        disabled={false}
        execute={execute}
        onGiveFloor={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("switch", { name: "Autoriser les questions des élèves" }));
    expect(execute).toHaveBeenCalledWith({ type: "classe.questions.open", open: false });

    const popular = screen.getByRole("tab", { name: /Populaires/i });
    expect(popular).toHaveAccessibleName("Populaires 4");
    popular.focus();
    fireEvent.keyDown(popular, { key: "ArrowRight" });
    const recent = screen.getByRole("tab", { name: /Récentes/i });
    await waitFor(() => expect(recent).toHaveFocus());
    expect(recent).toHaveAttribute("aria-selected", "true");
  });

  it("uses the live seat microphone state when giving the floor to a question author", () => {
    const fixture = createRoomToolsFixture("classe", "class-question-live-seat");
    const classe = fixture.classe!;
    const authorSeat = classe.seats.find((seat) => seat.person?.microphone === "ready");
    if (!authorSeat?.person) throw new Error("The Class fixture needs a microphone-ready student.");

    const question = {
      id: "question-from-live-rpc",
      author: { ...authorSeat.person, microphone: "off" as const },
      text: "Puis-je montrer mon exemple au tableau ?",
      status: "pending" as const,
      sentAt: new Date().toISOString(),
      supports: 3,
      supporterIds: [],
    };
    const onGiveFloor = vi.fn();

    render(
      <ClassQuestionsPanel
        classe={{ ...classe, questions: [question], featuredQuestionId: null }}
        disabled={false}
        execute={vi.fn(async () => undefined)}
        onGiveFloor={onGiveFloor}
      />,
    );

    const card = screen.getByText(question.text).closest("article");
    expect(card).not.toBeNull();
    const giveFloor = within(card!).getByRole("button", { name: "Donner la parole" });
    expect(giveFloor).toBeEnabled();
    fireEvent.click(giveFloor);
    expect(onGiveFloor).toHaveBeenCalledWith(authorSeat.person.id);
  });

  it("keeps keyboard focus with a question when it moves in and out of the featured surface", async () => {
    const fixture = createRoomToolsFixture("classe", "class-question-focus");
    const classe = fixture.classe!;
    const sourceQuestion = classe.questions?.find((question) => question.status !== "answered");
    if (!sourceQuestion) throw new Error("The Class fixture needs an open question.");

    const pendingQuestion = { ...sourceQuestion, status: "pending" as const };
    const displayedQuestion = { ...sourceQuestion, status: "displayed" as const };
    const execute = vi.fn(async () => undefined);
    const onDisplayQuestion = vi.fn(async () => undefined);
    const onClearQuestion = vi.fn(async () => undefined);
    const props = {
      disabled: false,
      execute,
      onDisplayQuestion,
      onClearQuestion,
      onGiveFloor: vi.fn(),
    };
    const { rerender } = render(
      <ClassQuestionsPanel {...props} classe={{ ...classe, questions: [pendingQuestion], featuredQuestionId: null }} />,
    );

    const display = screen.getByRole("button", { name: "Afficher dans la classe" });
    display.focus();
    fireEvent.click(display);
    await waitFor(() => expect(onDisplayQuestion).toHaveBeenCalledWith(pendingQuestion));
    rerender(<ClassQuestionsPanel {...props} classe={{ ...classe, questions: [displayedQuestion], featuredQuestionId: displayedQuestion.id }} />);

    const remove = screen.getByRole("button", { name: "Retirer" });
    await waitFor(() => expect(remove).toHaveFocus());
    expect(screen.getByText("Question affichée dans la classe.")).toHaveClass("sr-only");

    fireEvent.click(remove);
    await waitFor(() => expect(onClearQuestion).toHaveBeenCalledWith(displayedQuestion));
    rerender(<ClassQuestionsPanel {...props} classe={{ ...classe, questions: [pendingQuestion], featuredQuestionId: null }} />);

    const restoredDisplay = screen.getByRole("button", { name: "Afficher dans la classe" });
    await waitFor(() => expect(restoredDisplay).toHaveFocus());
    expect(screen.getByText("Question retirée de la classe.")).toHaveClass("sr-only");

    fireEvent.click(restoredDisplay);
    await waitFor(() => expect(onDisplayQuestion).toHaveBeenCalledTimes(2));
    rerender(<ClassQuestionsPanel {...props} classe={{ ...classe, questions: [displayedQuestion], featuredQuestionId: displayedQuestion.id }} />);
    const removeFromAnsweredTab = screen.getByRole("button", { name: "Retirer" });
    await waitFor(() => expect(removeFromAnsweredTab).toHaveFocus());
    fireEvent.click(screen.getByRole("tab", { name: /Répondues/i }));
    removeFromAnsweredTab.focus();
    fireEvent.click(removeFromAnsweredTab);
    await waitFor(() => expect(onClearQuestion).toHaveBeenCalledTimes(2));
    rerender(<ClassQuestionsPanel {...props} classe={{ ...classe, questions: [pendingQuestion], featuredQuestionId: null }} />);

    const answeredTab = screen.getByRole("tab", { name: /Répondues/i });
    await waitFor(() => expect(answeredTab).toHaveFocus());
    expect(screen.getByText("Question retirée de la classe.")).toHaveClass("sr-only");
  });
});
