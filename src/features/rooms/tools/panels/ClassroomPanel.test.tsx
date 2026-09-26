import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoomToolsFixture, refreshClassroomDemoPortraits } from "../roomTools.fixtures";
import type { RoomToolsCommand } from "../roomTools.types";
import ClassroomPanel, { ClassroomRoster, type ClassroomAudioBridge } from "./ClassroomPanel";

function audioBridge(patch: Partial<ClassroomAudioBridge> = {}): ClassroomAudioBridge {
  return {
    mode: null,
    studentId: null,
    phase: "idle",
    error: null,
    startPrivate: vi.fn(async () => undefined),
    startPublic: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    ...patch,
  };
}

afterEach(cleanup);

describe("ClassroomPanel audio ownership", () => {
  it("catches a rejected Hands command and labels it as a class-control error", async () => {
    const classe = createRoomToolsFixture("classe", "room-classe-demo").classe!;
    const execute = vi.fn(async (_command: RoomToolsCommand) => { throw new Error("revision_conflict"); });
    const clearError = vi.fn();
    render(<ClassroomPanel
      classe={classe}
      disabled={false}
      execute={execute}
      selectedStudentId={null}
      onSelectStudent={vi.fn()}
      audioBridge={audioBridge()}
      roomId="room-classe-demo"
      source="demo"
      commandError="class_hands_revision_conflict"
      onClearCommandError={clearError}
    />);

    expect(screen.getByRole("alert")).toHaveTextContent(/demandes de prise de parole/i);
    expect(screen.getByRole("alert")).not.toHaveTextContent(/micro/i);
    fireEvent.click(screen.getByRole("button", { name: "Fermer les demandes de prise de parole" }));
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(clearError).toHaveBeenCalledTimes(1);
  });

  it("lets the bridge own the single stop commit for a published audio session", async () => {
    const classe = createRoomToolsFixture("classe", "room-classe-demo").classe!;
    const execute = vi.fn(async (_command: RoomToolsCommand) => undefined);
    const bridge = audioBridge({ mode: "public", studentId: "class-01", phase: "active" });
    render(<ClassroomPanel
      classe={classe}
      disabled={false}
      execute={execute}
      selectedStudentId="class-02"
      onSelectStudent={vi.fn()}
      audioBridge={bridge}
      roomId="room-classe-demo"
      source="demo"
    />);

    fireEvent.click(screen.getByRole("button", { name: "Terminer la prise de parole et remettre toute la classe en écoute" }));

    expect(bridge.stop).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
  });

  it("clears a projected fixture speaker directly when no audio session is attached", async () => {
    const classe = createRoomToolsFixture("classe", "room-classe-demo").classe!;
    const execute = vi.fn(async (_command: RoomToolsCommand) => undefined);
    const bridge = audioBridge();
    render(<ClassroomPanel
      classe={classe}
      disabled={false}
      execute={execute}
      selectedStudentId="class-02"
      onSelectStudent={vi.fn()}
      audioBridge={bridge}
      roomId="room-classe-demo"
      source="demo"
    />);

    fireEvent.click(screen.getByRole("button", { name: "Terminer la prise de parole et remettre toute la classe en écoute" }));

    expect(bridge.stop).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith({ type: "classe.speaker", personId: null });
  });
});

it("allows a migrated student with an off microphone to receive a speaking invitation",async()=>{
 const classe=createRoomToolsFixture("classe","migration").classe!;
 classe.activeSpeakerId=null;classe.publicCallStudentId=null;classe.privateTalkStudentId=null;classe.raisedHands=[];
 const seat=classe.seats[0];seat.person!.microphone="off";seat.status="reserved";seat.handRaised=false;
 const bridge=audioBridge();
 render(<ClassroomPanel classe={classe} disabled={false} execute={vi.fn()} selectedStudentId={seat.person!.id} onSelectStudent={vi.fn()} audioBridge={bridge} roomId="migration" source="demo"/>);
 const button=screen.getByRole("button",{name:`Donner la parole à ${seat.person!.name}`});expect(button).toBeEnabled();fireEvent.click(button);
 await waitFor(()=>expect(bridge.startPublic).toHaveBeenCalledWith(seat.person));
 expect(seat.person!.microphone).toBe("off");
});


it("keeps the raised hand beside an outstanding question and clears only the answered indicator", () => {
  const classe = createRoomToolsFixture("classe", "room-classe-demo").classe!;
  const question = classe.questions![0];
  const props = { classe, audioBridge: audioBridge(), selectedStudentId: null, onSelectStudent: vi.fn() };
  const ui = render(<ClassroomRoster {...props} showQuestionIndicators />);
  const student = () => screen.getByRole("button", { name: new RegExp(question.author.name) });
  expect(student().querySelector(".classroom-seat__signal.is-hand-raised")).not.toBeNull();
  expect(student().querySelector(".classroom-seat__question.has-primary")).not.toBeNull();
  ui.rerender(<ClassroomRoster {...props} showQuestionIndicators classe={{ ...classe, questions: classe.questions!.map(item => item.id === question.id ? { ...item, status: "answered" } : item) }} />);
  expect(student().querySelector(".classroom-seat__signal.is-hand-raised")).not.toBeNull();
  expect(student().querySelector(".classroom-seat__question")).toBeNull();
  ui.rerender(<ClassroomRoster {...props} />);
  expect(student().querySelector(".classroom-seat__question")).toBeNull();
});


it("refreshes saved demo portraits without changing student data or custom photos", () => {
  const classe = createRoomToolsFixture("classe", "room-classe-demo").classe!;
  const student = classe.people.find(person => person.id === "class-11")!;
  const expectedPhoto = student.avatarUrl;
  student.avatarUrl = "/images/preprofile/portraits/profile-21.webp";
  const saved = structuredClone(classe);
  const custom = saved.people.find(person => person.id === "class-12")!;
  custom.avatarUrl = "/my-photo.webp";
  const questions = saved.questions!.map(question => question.text);
  refreshClassroomDemoPortraits(saved);
  expect(saved.people.find(person => person.id === "class-11")!.avatarUrl).toBe(expectedPhoto);
  expect(saved.seats.find(seat => seat.person?.id === "class-11")!.person!.avatarUrl).toBe(expectedPhoto);
  expect(custom.avatarUrl).toBe("/my-photo.webp");
  expect(saved.questions!.map(question => question.text)).toEqual(questions);
  expect(saved.raisedHands).toEqual(classe.raisedHands);
});
