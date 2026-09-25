import { MemoryRouter } from "react-router-dom";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import CollabsWorkspace, { type CollabsWorkspaceLiveController } from "./CollabsWorkspace";
import type { DemoCollab } from "./messagingDemoData";
import type { MessagingAttachmentViewModel } from "./messaging.attachments.types";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const renderCollabs = (ui: Parameters<typeof render>[0]) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe("CollabsWorkspace live attachments", () => {
  it("keeps the server projection and resolves its URL only when opened", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) { fireEvent.play(this); return Promise.resolve(); });
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
    const serverAttachment: MessagingAttachmentViewModel = {
      id: "attachment-live", mediaFileId: "media-live", available: true, order: 0,
      role: "primary", purpose: "audio", mediaType: "audio", displayName: "demo-live.mp3",
      mimeType: "audio/mpeg", sizeBytes: 2_048, durationMs: 12_000, bpm: 126,
      musicalKey: "Am", label: "Démo", metadata: {},
      privateObject: { bucket: "messaging-private", path: "collab/demo-live.mp3" },
    };
    const collab: DemoCollab = {
      id: "request-live", userId: "profile-other", name: "Nadir", role: "Beatmaker",
      avatar: "/avatars/utilisateur.png", verified: true, message: "On travaille ensemble ?",
      meta: "2 h", rank: 3, status: "pending", isReceived: true, requestStatus: "pending",
      attachments: [{ id: "attachment-live", type: "audio", url: "", fileName: "demo-live.mp3", fileSize: 2_048, durationSeconds: 12, bpm: 126, musicalKey: "Am", serverAttachment }],
    };
    Object.assign(collab, { server: { canDecline: true, relationshipBlocked: false } });
    const resolveAttachmentUrl = vi.fn(async () => "blob:https://meewav.test/demo-live");
    const liveController: CollabsWorkspaceLiveController = {
      markViewed: vi.fn(), acceptRequest: vi.fn(), declineRequest: vi.fn(), cancelRequest: vi.fn(),
      isMutating: () => false, status: "ready", resolveAttachmentUrl,
    };
    const user = userEvent.setup();
    renderCollabs(<CollabsWorkspace collabs={[collab]} liveController={liveController} onAcceptedCollab={vi.fn()} />);
    expect(resolveAttachmentUrl).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Lire demo-live.mp3" }));
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    expect(resolveAttachmentUrl).toHaveBeenCalledWith(serverAttachment);
    expect(liveController.markViewed).not.toHaveBeenCalled();
    expect(screen.getByRole("article", { name: "Demande de collab de Nadir" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Refuser" }));
    expect(liveController.declineRequest).toHaveBeenCalledWith("request-live");
    expect(liveController.markViewed).not.toHaveBeenCalled();

  });

  it("shows both verification and Shorts provenance on a verified request", async () => {
    const collab: DemoCollab = {
      id: "request-shorts",
      userId: "shorts-maya",
      name: "Maya Nova",
      role: "Beatmaker",
      avatar: "/images/shorts/maya.webp",
      verified: true,
      message: "On crée une session live ensemble ?",
      meta: "À l’instant",
      rank: 5,
      gradeLevel: 5,
      status: "sent",
      isReceived: false,
      requestStatus: "pending",
      sentState: "unread",
      attachments: [],
      origin: "globe",
      requestSource: "shorts",
    };
    const user = userEvent.setup();

    renderCollabs(
      <CollabsWorkspace
        collabs={[collab]}
        onAcceptedCollab={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Envoyées1" }));

    expect(screen.getByText("Vérifié par l'équipe")).toBeVisible();
    expect(screen.getByText("Demande envoyée — via La Scène")).toBeVisible();
  });
});
