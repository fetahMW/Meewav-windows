import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ShortsCollaborationDialog, {
  type ShortsCollaborationDialogItem,
} from "./ShortsCollaborationDialog";

const mocks = vi.hoisted(() => ({
  submitGlobeCollaborationRequest: vi.fn(),
  submitGlobeCollaborationWithAttachments: vi.fn(),
  requestProfileCollaboration: vi.fn(),
  createMessagingCollaborationIdempotencyKey: vi.fn(),
}));

vi.mock("../messaging/collaborationRequestBridge", () => ({
  submitGlobeCollaborationRequest: (...args: unknown[]) => (
    mocks.submitGlobeCollaborationRequest(...args)
  ),
}));
vi.mock("../messaging/messaging.collaboration-attachments.service", () => ({
  submitGlobeCollaborationWithAttachments: (...args: unknown[]) => (
    mocks.submitGlobeCollaborationWithAttachments(...args)
  ),
}));
vi.mock("../messaging/messaging.collaboration.service", () => ({
  createMessagingCollaborationIdempotencyKey: (...args: unknown[]) => (
    mocks.createMessagingCollaborationIdempotencyKey(...args)
  ),
}));
vi.mock("../globe/api/preProfile.api", () => ({
  requestProfileCollaboration: (...args: unknown[]) => mocks.requestProfileCollaboration(...args),
}));

const {
  submitGlobeCollaborationRequest,
  submitGlobeCollaborationWithAttachments,
  requestProfileCollaboration,
  createMessagingCollaborationIdempotencyKey,
} = mocks;

const ITEM: ShortsCollaborationDialogItem = {
  id: "short-azur-live",
  artistId: "mock-artist-azur",
  mockArtistId: "mock-artist-azur",
  title: "Du sample à la scène",
  artist: "AZUR",
  image: "/images/shorts/catalog-v2/creator-dj-club.webp",
  video: "/media/shorts-demo/landscape-dj.mp4",
  format: "landscape",
  alt: "AZUR sur scène",
  duration: "04:31",
  meta: "Live session",
  role: "Producteur · Live",
  city: "Lyon",
  views: "12 k",
  verified: true,
  gradeLevel: 4,
  likeCount: 1280,
  goldenLikeCount: 84,
};

describe("ShortsCollaborationDialog", () => {
  beforeEach(() => {
    submitGlobeCollaborationRequest.mockReset();
    submitGlobeCollaborationRequest.mockReturnValue({ id: "globe-collab-123" });
    createMessagingCollaborationIdempotencyKey.mockReset();
    createMessagingCollaborationIdempotencyKey.mockReturnValue(
      "shorts:11111111-1111-4111-8111-111111111111",
    );
    requestProfileCollaboration.mockReset();
    requestProfileCollaboration.mockResolvedValue({
      requestId: "33333333-3333-4333-8333-333333333333",
    });
    submitGlobeCollaborationWithAttachments.mockReset();
    submitGlobeCollaborationWithAttachments.mockImplementation(async (input: {
      createRequest: () => Promise<{ requestId: string }>;
    }) => ({
      ...(await input.createRequest()),
      attachmentResult: null,
    }));
  });

  afterEach(() => cleanup());

  it("soumet une proposition démo textuelle avec l’identité du talent", async () => {
    const user = userEvent.setup();
    const onSubmitted = vi.fn();

    render(
      <ShortsCollaborationDialog
        item={ITEM}
        onClose={vi.fn()}
        onSubmitted={onSubmitted}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Proposer un projet à AZUR" }))
      .toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("button", { name: "Joindre" })).toBeDisabled();

    await user.type(
      screen.getByRole("textbox", { name: /^Idée de collaboration/ }),
      "Je cherche un producteur live pour une session filmée en septembre.",
    );
    await user.click(screen.getByRole("button", { name: "Envoyer la demande" }));

    expect(submitGlobeCollaborationRequest).toHaveBeenCalledWith({
      senderProfileId: "shorts-current-user",
      recipientProfileId: "mock-artist-azur",
      recipientName: "AZUR",
      recipientRole: "Producteur · Live",
      recipientAvatar: "/images/shorts/catalog-v2/creator-dj-club.webp",
      recipientGradeLevel: 4,
      requestSource: "shorts",
      message: "Je cherche un producteur live pour une session filmée en septembre.",
      attachments: [],
    });
    expect(onSubmitted).toHaveBeenCalledWith("globe-collab-123");
  });

  it("se ferme par le fond ou avec Échap", async () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <ShortsCollaborationDialog
        item={ITEM}
        onClose={onClose}
        onSubmitted={vi.fn()}
      />,
    );

    fireEvent.pointerDown(screen.getByRole("dialog", { name: "Proposer un projet à AZUR" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    onClose.mockClear();
    rerender(
      <ShortsCollaborationDialog
        item={ITEM}
        onClose={onClose}
        onSubmitted={vi.fn()}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("envoie une collaboration UUID Shorts avec ses pièces jointes et le vrai requestId", async () => {
    const user = userEvent.setup();
    const onSubmitted = vi.fn();
    const realItem: ShortsCollaborationDialogItem = {
      ...ITEM,
      profileId: "22222222-2222-4222-8222-222222222222",
    };
    const { container } = render(
      <ShortsCollaborationDialog
        item={realItem}
        onClose={vi.fn()}
        onSubmitted={onSubmitted}
      />,
    );
    const file = new File(["audio"], "session.wav", { type: "audio/wav" });
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    await user.upload(fileInput as HTMLInputElement, file);
    await user.type(
      screen.getByRole("textbox", { name: /^Idée de collaboration/ }),
      "Une session live filmée.",
    );
    await user.click(screen.getByRole("button", { name: "Envoyer la demande" }));

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith(
      "33333333-3333-4333-8333-333333333333",
    ));
    expect(createMessagingCollaborationIdempotencyKey).toHaveBeenCalledWith("shorts");
    expect(submitGlobeCollaborationWithAttachments).toHaveBeenCalledWith(expect.objectContaining({
      recipientProfileId: realItem.profileId,
      files: [file],
      requestIdempotencyKey: "shorts:11111111-1111-4111-8111-111111111111",
      createRequest: expect.any(Function),
    }));
    expect(requestProfileCollaboration).toHaveBeenCalledWith({
      recipientProfileId: realItem.profileId,
      message: "Une session live filmée.",
      idempotencyKey: "shorts:11111111-1111-4111-8111-111111111111",
      source: "shorts",
    });
    expect(submitGlobeCollaborationRequest).not.toHaveBeenCalled();
  });

  it("reconnaît aussi un profil réel lorsque le backend porte l’UUID dans artistId", async () => {
    const user = userEvent.setup();
    const realArtistId = "44444444-4444-4444-8444-444444444444";
    const realItem: ShortsCollaborationDialogItem = {
      ...ITEM,
      artistId: realArtistId,
      mockArtistId: "mock-artist-azur",
      profileId: undefined,
    };

    render(
      <ShortsCollaborationDialog
        item={realItem}
        onClose={vi.fn()}
        onSubmitted={vi.fn()}
      />,
    );

    await user.type(
      screen.getByRole("textbox", { name: /^Idée de collaboration/ }),
      "Session filmée avec une direction artistique commune.",
    );
    await user.click(screen.getByRole("button", { name: "Envoyer la demande" }));

    expect(requestProfileCollaboration).toHaveBeenCalledWith(expect.objectContaining({
      recipientProfileId: realArtistId,
      source: "shorts",
    }));
    expect(submitGlobeCollaborationRequest).not.toHaveBeenCalled();
  });

  it("réutilise la même clé après erreur et interdit toute fermeture pendant l'envoi", async () => {
    const onClose = vi.fn();
    const onSubmitted = vi.fn();
    const realItem: ShortsCollaborationDialogItem = {
      ...ITEM,
      profileId: "22222222-2222-4222-8222-222222222222",
    };
    let rejectFirst!: (reason: Error) => void;
    let resolveRetry!: (value: { requestId: string; attachmentResult: null }) => void;
    submitGlobeCollaborationWithAttachments
      .mockReturnValueOnce(new Promise((_resolve, reject) => {
        rejectFirst = reject;
      }))
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveRetry = resolve;
      }));
    render(
      <ShortsCollaborationDialog
        item={realItem}
        onClose={onClose}
        onSubmitted={onSubmitted}
      />,
    );
    const form = screen.getByRole("form", {
      name: "Demande de collaboration à AZUR",
    });
    fireEvent.input(screen.getByRole("textbox", { name: /^Idée de collaboration/ }), { target: { textContent: "Même demande après erreur." } });
    fireEvent.submit(form);
    await waitFor(() => {
      expect(submitGlobeCollaborationWithAttachments).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("button", {
        name: "Fermer la proposition de collaboration",
      })).toBeDisabled();
    });
    await act(async () => {
      rejectFirst(new Error("network_down"));
    });
    await screen.findByRole("alert");
    fireEvent.submit(form);

    await waitFor(() => {
      expect(submitGlobeCollaborationWithAttachments).toHaveBeenCalledTimes(2);
      expect(screen.getByRole("button", {
        name: "Fermer la proposition de collaboration",
      })).toBeDisabled();
    });
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.pointerDown(screen.getByRole("dialog", { name: "Proposer un projet à AZUR" }));
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      resolveRetry({
        requestId: "44444444-4444-4444-8444-444444444444",
        attachmentResult: null,
      });
    });
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith(
      "44444444-4444-4444-8444-444444444444",
    ));
    expect(createMessagingCollaborationIdempotencyKey).toHaveBeenCalledTimes(1);
    expect(submitGlobeCollaborationWithAttachments).toHaveBeenCalledTimes(2);
    const firstKey = submitGlobeCollaborationWithAttachments.mock.calls[0][0]
      .requestIdempotencyKey;
    const retryKey = submitGlobeCollaborationWithAttachments.mock.calls[1][0]
      .requestIdempotencyKey;
    expect(retryKey).toBe(firstKey);
  });

  it("crée une nouvelle clé quand le payload change après une erreur", async () => {
    let rejectFirst!: (error: Error) => void;
    const realItem: ShortsCollaborationDialogItem = {
      ...ITEM,
      profileId: "22222222-2222-4222-8222-222222222222",
    };
    createMessagingCollaborationIdempotencyKey
       .mockReturnValueOnce("shorts:payload-one")
       .mockReturnValueOnce("shorts:payload-two");
    submitGlobeCollaborationWithAttachments
      .mockReturnValueOnce(new Promise((_resolve, reject) => {
        rejectFirst = reject;
      }))
      .mockResolvedValueOnce({
        requestId: "55555555-5555-4555-8555-555555555555",
        attachmentResult: null,
      });
    render(
      <ShortsCollaborationDialog
        item={realItem}
        onClose={vi.fn()}
        onSubmitted={vi.fn()}
      />,
    );
    const textbox = screen.getByRole("textbox", { name: /^Idée de collaboration/ });
    const form = screen.getByRole("form", {
      name: "Demande de collaboration à AZUR",
    });
    fireEvent.input(textbox, { target: { textContent: "Premier payload." } });
    fireEvent.submit(form);
    await waitFor(() => expect(submitGlobeCollaborationWithAttachments)
      .toHaveBeenCalledTimes(1));
    await waitFor(() => expect(
      screen.getByRole("button", {
        name: "Fermer la proposition de collaboration",
      }),
    ).toBeDisabled());
    await act(async () => {
      rejectFirst(new Error("network_down"));
    });
    await screen.findByRole("alert");
    fireEvent.input(textbox, { target: { textContent: "Payload modifié." } });
    fireEvent.submit(form);

    await waitFor(() => expect(submitGlobeCollaborationWithAttachments)
      .toHaveBeenCalledTimes(2));
    expect(submitGlobeCollaborationWithAttachments.mock.calls[0][0].requestIdempotencyKey)
      .toBe("shorts:payload-one");
    expect(submitGlobeCollaborationWithAttachments.mock.calls[1][0].requestIdempotencyKey)
      .toBe("shorts:payload-two");
    expect(createMessagingCollaborationIdempotencyKey).toHaveBeenCalledTimes(2);
  });
});
