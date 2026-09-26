import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoomToolsFixture } from "../roomTools.fixtures";
import type { LogeState, RoomPerson } from "../roomTools.types";
import LogeViewer from "./LogeViewer";

afterEach(cleanup);

const viewer: RoomPerson = {
  id: "member",
  name: "Camille",
  avatarUrl: "",
  role: "Fan",
  microphone: "off",
  camera: "off",
};
function setup(
  overrides: Partial<LogeState> = {},
  execute = vi.fn(async () => undefined),
) {
  const loge = {
    ...createRoomToolsFixture("loge").loge!,
    questions: [],
    moments: [],
    ...overrides,
  };
  const props = {
    loge,
    accountId: viewer.id,
    viewer,
    hostName: "Naya",
    eligible: true,
    canEngage: true,
    busy: false,
    preview: <audio data-testid="preview" />,
    execute,
  };
  return { ...render(<LogeViewer {...props} />), props, execute };
}

describe("Loge viewer experience", () => {
  it("keeps the preview mounted while reading questions and private attentions", () => {
    setup();
    const media = screen.getByTestId("preview");
    fireEvent.click(
      screen.getByRole("tab", { name: "Questions" }),
    );
    expect(screen.getByTestId("preview")).toBe(media);
    expect(media).not.toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Pour moi" }));
    fireEvent.click(screen.getByRole("tab", { name: "Le moment" }));
    expect(screen.getByTestId("preview")).toBe(media);
    expect(media).toBeVisible();
  });

  it("preserves a failed question and shows the confirmed question with its status", async () => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(undefined);
    const { props, rerender } = setup({ questionsOpen: true }, execute);
    fireEvent.click(
      screen.getByRole("tab", { name: "Questions" }),
    );
    const input = screen.getByLabelText(/Votre question/);
    fireEvent.change(input, {
      target: { value: "Comment as-tu composé ce titre ?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "votre texte est conservé",
    );
    expect(input).toHaveValue("Comment as-tu composé ce titre ?");
    fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(input).toHaveValue(""));
    const command = execute.mock.calls[1][0];
    expect(command.question.author.id).toBe(viewer.id);
    rerender(
      <LogeViewer
        {...props}
        loge={{ ...props.loge, questions: [command.question] }}
      />,
    );
    expect(screen.getByText("Comment as-tu composé ce titre ?")).toBeVisible();
    expect(screen.getByText("Envoyée")).toBeVisible();
  });

  it("requires an explicit answer to the member's invitation", () => {
    const { execute } = setup({
      moments: [
        {
          id: "invite",
          title: "Un échange",
          kind: "face-to-face",
          status: "scheduled",
          beneficiary: viewer,
        },
      ],
    });
    expect(execute).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Accepter" }));
    expect(execute).toHaveBeenCalledWith({
      type: "loge.moment.respond",
      momentId: "invite",
      accountId: viewer.id,
      accept: true,
    });
  });

  it("only exposes this member's dedications and links to the existing private conversation", () => {
    setup({
      moments: [
        {
          id: "mine",
          title: "Pour Camille",
          kind: "dedication",
          status: "completed",
          beneficiary: viewer,
          privateContent: "conversation:11111111-1111-4111-8111-111111111111",
        },
        {
          id: "other",
          title: "Un secret pour quelqu’un d’autre",
          kind: "dedication",
          status: "completed",
          beneficiary: { ...viewer, id: "other-member" },
          privateContent: "conversation:22222222-2222-4222-8222-222222222222",
        },
      ],
    });
    fireEvent.click(screen.getByRole("tab", { name: /Pour moi/ }));
    expect(
      screen
        .getByRole("link", { name: "Ouvrir ma dédicace" })
        .getAttribute("href"),
    ).toContain("11111111-1111-4111-8111-111111111111");
    expect(
      screen.queryByText("Un secret pour quelqu’un d’autre"),
    ).not.toBeInTheDocument();
  });
});
