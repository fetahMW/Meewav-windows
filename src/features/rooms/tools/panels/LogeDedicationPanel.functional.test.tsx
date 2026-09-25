import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RoomPerson, RoomToolsCommand } from "../roomTools.types";
import LogeDedicationPanel from "./LogeDedicationPanel";

const mocks = vi.hoisted(() => ({
  getOrCreateDirectConversation: vi.fn(),
  prepareUpload: vi.fn(),
  uploadPrepared: vi.fn(),
  finalizeUpload: vi.fn(),
  sendMessage: vi.fn(),
  discardUpload: vi.fn(),
  liveCall: null as null | Record<string, unknown>,
}));

vi.mock("../../../messaging/messaging.service", () => ({
  createMessagingClientMessageId: () => "client-message-id",
  messagingRepository: { getOrCreateDirectConversation: mocks.getOrCreateDirectConversation },
}));
vi.mock("../../../messaging/messaging.attachments.service", () => ({
  createMessagingAttachmentClientUploadId: () => "client-upload-id",
  messagingAttachmentsRepository: {
    prepareUpload: mocks.prepareUpload,
    uploadPrepared: mocks.uploadPrepared,
    finalizeUpload: mocks.finalizeUpload,
    sendMessage: mocks.sendMessage,
    discardUpload: mocks.discardUpload,
  },
}));
vi.mock("../../live-call/RoomLiveCallProvider", () => ({ useOptionalRoomLiveCall: () => mocks.liveCall }));

const getUserMedia = vi.fn();
const createObjectURL = vi.fn(() => `blob:moment-${createObjectURL.mock.calls.length}`);
const revokeObjectURL = vi.fn();
let lastRecorder: FakeMediaRecorder | null = null;

class FakeMediaRecorder {
  static isTypeSupported = () => true;
  state: RecordingState = "inactive";
  mimeType: string;
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
    this.mimeType = options?.mimeType || "audio/webm";
    // The test needs the browser-created recorder instance to drive its stop event.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    lastRecorder = this;
  }

  start() { this.state = "recording"; }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["moment-vip"], { type: this.mimeType }) } as BlobEvent);
    this.onstop?.();
  }
}

const WAITING_GUESTS: RoomPerson[] = [
  { id: "waiting-lou", name: "Lou V.", role: "Chanteuse", avatarUrl: "/lou.jpg", microphone: "ready", camera: "ready" },
  { id: "waiting-yanis", name: "Yanis Flow", role: "Rappeur", avatarUrl: "/yanis.jpg", microphone: "ready", camera: "off" },
];
const VIP_UUID_GUESTS: RoomPerson[] = [
  { id: "51000000-0000-4000-8000-000000000009", name: "Mariam Delta", role: "Productrice Gqom", avatarUrl: "/images/tremplin/artists/generated/mariam-delta-productrice-gqom-roubaix-v1.webp", microphone: "ready", camera: "ready" },
  { id: "51000000-0000-4000-8000-000000000010", name: "Imani Kader", role: "Saxophoniste", avatarUrl: "/images/tremplin/artists/generated/imani-kader-saxophonist-montpellier-v1.webp", microphone: "ready", camera: "ready" },
];
const DEMO_ROOM_ID = "52000000-0000-4000-8000-000000000001";

function createExecute() {
  return vi.fn(async (_command: RoomToolsCommand): Promise<unknown> => undefined);
}

function renderPanel(
  waitingGuests = WAITING_GUESTS,
  execute = createExecute(),
  initialFanIds: readonly string[] = waitingGuests[0] ? [waitingGuests[0].id] : [],
  onOpenGuestQueue = vi.fn(),
  runtime: { roomId?: string; source?: "demo" | "live" } = {},
) {
  return { execute, onOpenGuestQueue, ...render(<LogeDedicationPanel waitingGuests={waitingGuests} disabled={false} execute={execute} initialFanIds={initialFanIds} onOpenGuestQueue={onOpenGuestQueue} roomId={runtime.roomId ?? DEMO_ROOM_ID} source={runtime.source ?? "live"} />) };
}

const ACTION_NAMES = [/Dédicace audio pour/i, /Dédicace vidéo pour/i, /Monter avec moi pour/i] as const;

function chooseAction(index: number) {
  fireEvent.click(screen.getByRole("button", { name: ACTION_NAMES[index] }));
}

async function recordReady() {
  fireEvent.click(screen.getByRole("button", { name: /Enregistrer/i }));
  await waitFor(() => expect(lastRecorder?.state).toBe("recording"));
  fireEvent.click(screen.getByRole("button", { name: /Arrêter/i }));
  await screen.findByRole("button", { name: /Envoyer \(/i });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.liveCall = null;
  lastRecorder = null;
  const stream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
  getUserMedia.mockResolvedValue(stream);
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  Object.defineProperty(globalThis, "MediaRecorder", { configurable: true, value: FakeMediaRecorder });
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  mocks.getOrCreateDirectConversation.mockResolvedValue({ conversation_id: "conversation-1" });
  mocks.prepareUpload.mockResolvedValue({ uploadId: "upload-1" });
  mocks.uploadPrepared.mockResolvedValue(undefined);
  mocks.finalizeUpload.mockResolvedValue(undefined);
  mocks.sendMessage.mockResolvedValue(undefined);
  mocks.discardUpload.mockResolvedValue(undefined);
  window.history.replaceState({}, "", "/rooms/loge?room=52000000-0000-4000-8000-000000000001");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Moment VIP functional flows", () => {
  it("opens the real guest queue instead of rendering a duplicated directory", () => {
    const onOpenGuestQueue = vi.fn();
    renderPanel(WAITING_GUESTS, createExecute(), [], onOpenGuestQueue);

    expect(screen.queryByPlaceholderText(/Rechercher une personne/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: ACTION_NAMES[0] })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Ajouter/i }));
    expect(onOpenGuestQueue).toHaveBeenCalledTimes(1);
  });

  it("shows a truthful empty state without inventing a fan", () => {
    renderPanel([], createExecute(), []);

    expect(screen.getByText("La file d’attente est vide.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ajouter/i })).toBeDisabled();
    expect(screen.queryByText(/Sofia|Maya|Léo/i)).not.toBeInTheDocument();
  });

  it("rejects an initial person who is not in the guest queue", () => {
    renderPanel(WAITING_GUESTS, createExecute(), ["question-author-outside-queue"]);

    expect(screen.getByRole("button", { name: /Ajouter/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: ACTION_NAMES[0] })).not.toBeInTheDocument();
  });

  it("records, previews, resets and sends an audio dedication", async () => {
    const { execute } = renderPanel();
    chooseAction(0);
    await recordReady();

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
    fireEvent.click(screen.getByRole("button", { name: "Réécouter" }));
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Refaire" }));
    expect(screen.getByRole("button", { name: /Enregistrer/i })).toBeInTheDocument();
    expect(revokeObjectURL).toHaveBeenCalled();

    await recordReady();
    fireEvent.click(screen.getByRole("button", { name: /Envoyer \(/i }));
    await screen.findByText(/Dédicace audio envoyée/i);
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      type: "loge.moment.add",
      moment: expect.objectContaining({ kind: "dedication", status: "completed", format: "audio" }),
    }));
  });

  it("records and sends a video dedication with camera and microphone", async () => {
    const { execute } = renderPanel();
    chooseAction(1);
    await recordReady();

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: true });
    fireEvent.click(screen.getByRole("button", { name: /Envoyer \(/i }));
    await screen.findByText(/Dédicace vidéo envoyée/i);
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      type: "loge.moment.add", moment: expect.objectContaining({ format: "video" }),
    }));
  });

  it("sends one captured dedication to every selected guest", async () => {
    const execute = createExecute();
    renderPanel(WAITING_GUESTS, execute, WAITING_GUESTS.map((guest) => guest.id));

    expect(screen.getByRole("region", { name: "2 sélectionnés" })).toBeInTheDocument();
    chooseAction(0);
    await recordReady();
    fireEvent.click(screen.getByRole("button", { name: "Envoyer (2)" }));
    await screen.findByText("Dédicace audio envoyée à 2 invités");

    const beneficiaries = execute.mock.calls
      .map(([command]) => command)
      .filter((command): command is Extract<RoomToolsCommand, { type: "loge.moment.add" }> => command.type === "loge.moment.add")
      .map((command) => command.moment.beneficiary.id);
    expect(beneficiaries).toEqual(WAITING_GUESTS.map((guest) => guest.id));
  });

  it("shows permission and preview playback failures and remains retryable", async () => {
    renderPanel();
    chooseAction(0);
    getUserMedia.mockRejectedValueOnce(new Error("denied"));
    fireEvent.click(screen.getByRole("button", { name: /Enregistrer/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Autorise le micro/i);
    expect(screen.getByRole("button", { name: /Enregistrer/i })).toBeEnabled();

    await recordReady();
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error("decode"));
    fireEvent.click(screen.getByRole("button", { name: "Réécouter" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/ne peut pas être lue/i);
    expect(screen.getByRole("button", { name: /Envoyer \(/i })).toBeEnabled();
  });

  it("does not send the same private media twice when state synchronization is retried", async () => {
    const recipientId = "12345678-1234-4123-8123-123456789abc";
    const waitingGuests = [{ ...WAITING_GUESTS[0], id: recipientId }];
    const execute = vi.fn().mockRejectedValueOnce(new Error("Synchronisation indisponible")).mockResolvedValue(undefined);
    renderPanel(waitingGuests, execute);
    chooseAction(0);
    await recordReady();

    fireEvent.click(screen.getByRole("button", { name: /Envoyer \(/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Synchronisation indisponible");
    fireEvent.click(screen.getByRole("button", { name: /Envoyer \(/i }));
    await screen.findByText(/Dédicace audio envoyée/i);

    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("persists a demo invitation once, then updates that exact moment on cancellation", async () => {
    const execute = createExecute();
    renderPanel(WAITING_GUESTS, execute, undefined, vi.fn(), { source: "demo" });
    chooseAction(2);
    fireEvent.click(screen.getByRole("button", { name: "10 min" }));
    fireEvent.click(screen.getByRole("button", { name: /Inviter le groupe/i }));
    await screen.findByText(/Invitation envoyée à/i);
    fireEvent.click(screen.getByRole("button", { name: /Annuler les invitations/i }));
    await screen.findByText("Moment VIP terminé");

    const firstCommand = execute.mock.calls[0]?.[0];
    expect(firstCommand).toEqual(expect.objectContaining({
      type: "loge.moment.add", moment: expect.objectContaining({ title: "Moment VIP · 10 min", status: "scheduled" }),
    }));
    if (!firstCommand || firstCommand.type !== "loge.moment.add") throw new Error("Moment VIP creation command missing");
    expect(execute.mock.calls[1]?.[0]).toEqual({
      type: "loge.moment.status", momentId: firstCommand.moment.id, status: "cancelled",
    });
  });

  it("invites every selected real guest in one live-call batch", async () => {
    const liveCall = {
      outgoingInvitations: [], mediaSessions: [], onAirInvitationIds: new Set<string>(),
      requestLiveCall: vi.fn(async () => undefined),
      setCallRoute: vi.fn(async () => undefined), confirmCallOnAir: vi.fn(async () => undefined), endCall: vi.fn(async () => undefined),
    };
    mocks.liveCall = liveCall;
    const execute = createExecute();
    renderPanel(VIP_UUID_GUESTS, execute, VIP_UUID_GUESTS.map((guest) => guest.id), vi.fn(), { source: "live" });

    chooseAction(2);
    fireEvent.click(screen.getByRole("button", { name: "Inviter le groupe (2)" }));

    await waitFor(() => expect(liveCall.requestLiveCall).toHaveBeenCalledTimes(1));
    expect(liveCall.requestLiveCall).toHaveBeenCalledWith({
      roomId: DEMO_ROOM_ID,
      mode: "public",
      contacts: VIP_UUID_GUESTS.map((guest) => ({
        profileId: guest.id,
        conversationId: "",
        displayName: guest.name,
        username: null,
        avatarUrl: guest.avatarUrl,
        isVerified: false,
      })),
    });
    await waitFor(() => expect(execute.mock.calls.filter(([command]) => command.type === "loge.moment.add")).toHaveLength(2));
  });

  it("does not persist a live Moment VIP when the real invitation is rejected", async () => {
    const authenticationError = new Error("Reconnectez-vous pour utiliser les appels du live.");
    const liveCall = {
      outgoingInvitations: [], mediaSessions: [], onAirInvitationIds: new Set<string>(),
      requestLiveCall: vi.fn(async () => { throw authenticationError; }),
      setCallRoute: vi.fn(async () => undefined), confirmCallOnAir: vi.fn(async () => undefined), endCall: vi.fn(async () => undefined),
    };
    mocks.liveCall = liveCall;
    const execute = createExecute();
    renderPanel(VIP_UUID_GUESTS, execute, VIP_UUID_GUESTS.map((guest) => guest.id), vi.fn(), { source: "live" });

    chooseAction(2);
    const inviteButton = screen.getByRole("button", { name: "Inviter le groupe (2)" });
    fireEvent.click(inviteButton);

    expect(await screen.findByRole("alert")).toHaveTextContent(authenticationError.message);
    expect(liveCall.requestLiveCall).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
    expect(inviteButton).toBeEnabled();
    expect(screen.queryByText(/Invitation envoyée à/i)).not.toBeInTheDocument();
  });

  it("keeps UUID demo guests local and displays their small portraits", async () => {
    const authenticationError = new Error("Reconnectez-vous pour utiliser les appels du live.");
    const liveCall = {
      outgoingInvitations: [], mediaSessions: [], onAirInvitationIds: new Set<string>(),
      requestLiveCall: vi.fn(async () => { throw authenticationError; }),
      setCallRoute: vi.fn(async () => undefined), confirmCallOnAir: vi.fn(async () => undefined), endCall: vi.fn(async () => undefined),
    };
    mocks.liveCall = liveCall;
    const execute = createExecute();
    renderPanel(VIP_UUID_GUESTS, execute, VIP_UUID_GUESTS.map((guest) => guest.id), vi.fn(), { source: "demo" });

    chooseAction(2);
    for (const guest of VIP_UUID_GUESTS) {
      expect(screen.getByRole("img", { name: `Portrait de ${guest.name}` })).toHaveAttribute("src", guest.avatarUrl);
    }
    expect(screen.getByRole("list", { name: "Portraits des invités sélectionnés" }).children).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Inviter le groupe (2)" }));

    await screen.findByText("Invitation envoyée à Mariam Delta et Imani Kader");
    expect(liveCall.requestLiveCall).not.toHaveBeenCalled();
    expect(screen.queryByText(authenticationError.message)).not.toBeInTheDocument();
    const moments = execute.mock.calls
      .map(([command]) => command)
      .filter((command): command is Extract<RoomToolsCommand, { type: "loge.moment.add" }> => command.type === "loge.moment.add");
    expect(moments).toHaveLength(2);
    expect(moments.map((command) => command.moment.beneficiary.id)).toEqual(VIP_UUID_GUESTS.map((guest) => guest.id));
    expect(moments.every((command) => command.moment.status === "scheduled")).toBe(true);
  });

  it("keeps a failed demo invitation retryable instead of displaying a false pending state", async () => {
    const execute = vi.fn().mockRejectedValue(new Error("Service indisponible"));
    renderPanel(WAITING_GUESTS, execute, undefined, vi.fn(), { source: "demo" });
    chooseAction(2);
    fireEvent.click(screen.getByRole("button", { name: /Inviter le groupe/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Service indisponible");
    expect(screen.getByRole("button", { name: /Inviter le groupe/i })).toBeEnabled();
    expect(screen.queryByText(/Invitation envoyée à/i)).not.toBeInTheDocument();
  });

  it("keeps a failed cancellation pending and retryable", async () => {
    const execute = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Annulation indisponible"));
    renderPanel(WAITING_GUESTS, execute, undefined, vi.fn(), { source: "demo" });
    chooseAction(2);
    fireEvent.click(screen.getByRole("button", { name: /Inviter le groupe/i }));
    await screen.findByText(/Invitation envoyée à/i);
    fireEvent.click(screen.getByRole("button", { name: /Annuler les invitations/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Annulation indisponible");
    expect(screen.getByRole("button", { name: /Annuler les invitations/i })).toBeEnabled();
    expect(screen.queryByText("Moment VIP terminé")).not.toBeInTheDocument();
  });

  it("wires the complete real live-call lifecycle from invitation to end", async () => {
    const recipientId = "12345678-1234-4123-8123-123456789abc";
    const waitingGuests = [{ ...WAITING_GUESTS[0], id: recipientId }];
    const liveCall = {
      outgoingInvitations: [] as Array<Record<string, unknown>>,
      mediaSessions: [] as Array<Record<string, unknown>>,
      onAirInvitationIds: new Set<string>(),
      requestLiveCall: vi.fn(async () => undefined),
      setCallRoute: vi.fn(async () => undefined),
      confirmCallOnAir: vi.fn(async () => undefined),
      endCall: vi.fn(async () => undefined),
    };
    mocks.liveCall = liveCall;
    const execute = createExecute();
    const { rerender } = renderPanel(waitingGuests, execute);
    chooseAction(2);
    fireEvent.click(screen.getByRole("button", { name: "15 min" }));
    fireEvent.click(screen.getByRole("button", { name: /Inviter le groupe/i }));
    await waitFor(() => expect(liveCall.requestLiveCall).toHaveBeenCalledWith(expect.objectContaining({ mode: "public" })));
    await waitFor(() => expect(execute.mock.calls.some(([command]) => command.type === "loge.moment.add")).toBe(true));
    const firstCommand = execute.mock.calls[0]?.[0];
    if (!firstCommand || firstCommand.type !== "loge.moment.add") throw new Error("Moment VIP creation command missing");
    const momentId = firstCommand.moment.id;

    const invitation = {
      roomId: "52000000-0000-4000-8000-000000000001", contactProfileId: recipientId,
      callMode: "public", status: "accepted", invitationId: "invitation-1", routeMode: "preview", isOnAir: false,
    };
    liveCall.outgoingInvitations = [invitation];
    rerender(<LogeDedicationPanel waitingGuests={waitingGuests} disabled={false} execute={execute} initialFanIds={[recipientId]} roomId={DEMO_ROOM_ID} source="live" />);
    fireEvent.click(await screen.findByRole("button", { name: "Préparer le direct" }));
    await waitFor(() => expect(liveCall.setCallRoute).toHaveBeenCalledWith("invitation-1", "public"));
    expect(execute).toHaveBeenLastCalledWith({ type: "loge.moment.status", momentId, status: "accepted" });

    invitation.routeMode = "public";
    liveCall.mediaSessions = [{ invitationId: "invitation-1", peerPresent: true }];
    rerender(<LogeDedicationPanel waitingGuests={waitingGuests} disabled={false} execute={execute} initialFanIds={[recipientId]} roomId={DEMO_ROOM_ID} source="live" />);
    fireEvent.click(await screen.findByRole("button", { name: "Lancer dans la Loge" }));
    await waitFor(() => expect(liveCall.confirmCallOnAir).toHaveBeenCalledWith("invitation-1"));
    expect(execute).toHaveBeenLastCalledWith({ type: "loge.moment.status", momentId, status: "live" });

    invitation.isOnAir = true;
    liveCall.onAirInvitationIds.add("invitation-1");
    rerender(<LogeDedicationPanel waitingGuests={waitingGuests} disabled={false} execute={execute} initialFanIds={[recipientId]} roomId={DEMO_ROOM_ID} source="live" />);
    fireEvent.click(await screen.findByRole("button", { name: "Mettre fin au moment" }));
    await waitFor(() => expect(liveCall.endCall).toHaveBeenCalledWith("invitation-1"));
    expect(execute).toHaveBeenLastCalledWith({ type: "loge.moment.status", momentId, status: "completed" });
  });
});
