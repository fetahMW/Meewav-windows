import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MessageWorkspace, { type MessagingWorkspaceLiveController } from "./MessageWorkspace";
import type { DemoConversation, DemoMessage } from "./messagingDemoData";
import type { MessagingAttachmentViewModel } from "./messaging.attachments.types";
import type { MessagingAttachmentQueueItem } from "./useMessagingAttachmentsLive";

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

class FakeMediaRecorder {
  static isTypeSupported() { return true; }

  state: RecordingState = "inactive";
  mimeType = "audio/webm";
  private listeners = new Map<string, Array<(event: unknown) => void>>();

  addEventListener(type: string, listener: (event: unknown) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.listeners.get("dataavailable")?.forEach((listener) => listener({
      data: new Blob(["voice"], { type: this.mimeType }),
    }));
    this.listeners.get("stop")?.forEach((listener) => listener(new Event("stop")));
  }
}

class FakeAudioTransport {
  static instances: FakeAudioTransport[] = [];

  currentTime = 0;
  duration = 180;
  paused = true;
  preload = "";
  readyState = 1;
  private source = "";
  private listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

  constructor(source = "") {
    this.source = source;
    FakeAudioTransport.instances.push(this);
  }

  get src() {
    return this.source;
  }

  set src(value: string) {
    this.source = value;
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const listeners = this.listeners.get(type) ?? new Set<EventListenerOrEventListenerObject>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    this.listeners.get(type)?.delete(listener);
  }

  getAttribute(name: string) {
    return name === "src" && this.source ? this.source : null;
  }

  removeAttribute(name: string) {
    if (name === "src") this.source = "";
  }

  load() {}

  async play() {
    this.paused = false;
    this.emit("play");
  }

  pause() {
    const wasPlaying = !this.paused;
    this.paused = true;
    if (wasPlaying) this.emit("pause");
  }

  private emit(type: string) {
    const event = new Event(type);
    this.listeners.get(type)?.forEach((listener) => {
      if (typeof listener === "function") listener(event);
      else listener.handleEvent(event);
    });
  }
}

function serverAttachment(): MessagingAttachmentViewModel {
  return {
    id: "attachment-1", mediaFileId: "media-1", available: true, order: 0,
    role: "primary", purpose: "image", mediaType: "image", displayName: "photo.webp",
    mimeType: "image/webp", sizeBytes: 10, durationMs: null, bpm: null,
    musicalKey: null, label: null, metadata: {},
    privateObject: { bucket: "messaging-private", path: "conversation/photo.webp" },
  };
}

function conversation(messages: DemoMessage[] = []): DemoConversation {
  return {
    id: "20000000-0000-4000-8000-000000000001",
    name: "Nadir", handle: "@nadir", role: "Artiste", avatar: "/avatars/utilisateur.png",
    status: "En ligne", online: true, unread: 0, preview: "", time: "", messages,
  };
}

function controller(messages: DemoMessage[] = []) {
  const selected = conversation(messages);
  type AttachmentsController = NonNullable<MessagingWorkspaceLiveController["attachments"]>;
  const enqueue = vi.fn<AttachmentsController["enqueue"]>(() => "30000000-0000-4000-8000-000000000001");
  const resolveUrl = vi.fn(async () => "blob:https://meewav.test/private-image");
  const sendReadyMessage = vi.fn<AttachmentsController["sendReadyMessage"]>(async () => null);
  const value: MessagingWorkspaceLiveController = {
    conversations: [selected], selectedConversationId: selected.id, selectedConversation: selected,
    messages, inboxStatus: "ready", messagesStatus: "ready",
    selectConversation: vi.fn(), retryInbox: vi.fn(), retryMessages: vi.fn(), sendText: vi.fn(),
    retryMessage: vi.fn(), setReaction: vi.fn(), togglePinned: vi.fn(), toggleMuted: vi.fn(), archiveConversation: vi.fn(),
    attachments: {
      queue: [], enqueue, retry: vi.fn(), discard: vi.fn(), sendReadyMessage, resolveUrl,
    },
  };
  return { value, enqueue, resolveUrl, sendReadyMessage };
}

describe("MessageWorkspace live attachments", () => {
  it("queues a real selected image instead of disabling live attachments", async () => {
    const live = controller();
    const user = userEvent.setup();
    const { container } = render(<MessageWorkspace newConversationSignal={0} liveController={live.value} />);
    await user.click(screen.getByRole("button", { name: "Ajouter une pièce jointe" }));
    await user.click(screen.getByRole("button", { name: "Photo" }));
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["image"], "portrait.webp", { type: "image/webp" });
    await user.upload(input, file);
    expect(live.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: live.value.selectedConversationId,
      file,
      purpose: "image",
    }));
  });

  it("requests a signed URL only after the user opens a server attachment", async () => {
    const attachment = serverAttachment();
    const message: DemoMessage = { id: "message-1", author: "them", kind: "image", body: "Photo", time: "12:00", attachments: [attachment] };
    const live = controller([message]);
    const user = userEvent.setup();
    render(<MessageWorkspace newConversationSignal={0} liveController={live.value} />);
    expect(live.resolveUrl).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Ouvrir" }));
    await waitFor(() => expect(live.resolveUrl).toHaveBeenCalledWith(attachment));
    expect(await screen.findByRole("img", { name: "photo.webp" })).toHaveAttribute("src", "blob:https://meewav.test/private-image");
  });

  it("confirme le blocage et transmet un signalement privé depuis les options live", async () => {
    const live = controller();
    const blockCounterpart = vi.fn(async () => true);
    const reportConversation = vi.fn(async () => true);
    live.value.canModerateCounterpart = true;
    live.value.blockCounterpart = blockCounterpart;
    live.value.reportConversation = reportConversation;
    const user = userEvent.setup();
    render(<MessageWorkspace newConversationSignal={0} liveController={live.value} />);

    await user.click(screen.getByRole("button", { name: "Options de la conversation" }));
    await user.click(screen.getByRole("button", { name: /Signaler la conversation/ }));
    await user.selectOptions(screen.getByLabelText("Motif"), "harassment");
    await user.type(screen.getByPlaceholderText("Décris brièvement le problème"), "Messages agressifs répétés");
    const reportSubmit = screen.getAllByRole("button", { name: "Envoyer" })
      .find((button) => button.textContent === "Envoyer");
    expect(reportSubmit).toBeDefined();
    await user.click(reportSubmit!);
    await waitFor(() => expect(reportConversation).toHaveBeenCalledWith(
      "harassment",
      "Messages agressifs répétés",
    ));
    expect(await screen.findByRole("status")).toHaveTextContent("Signalement envoyé");

    await user.click(screen.getByRole("button", { name: "Options de la conversation" }));
    await user.click(screen.getByRole("button", { name: /Bloquer cet artiste/ }));
    await user.click(screen.getByRole("button", { name: "Bloquer" }));
    await waitFor(() => expect(blockCounterpart).toHaveBeenCalledTimes(1));
  });

  it("réessaie un brief avec le même identifiant et le schéma serveur v1", async () => {
    const live = controller();
    const user = userEvent.setup();
    render(<MessageWorkspace newConversationSignal={0} liveController={live.value} />);

    await user.click(screen.getByRole("button", { name: "Ajouter une pièce jointe" }));
    await user.click(screen.getByRole("button", { name: /Envoyer un brief/ }));
    await user.click(screen.getByRole("button", { name: "Trap" }));
    const composerSend = () => screen.getAllByRole("button", { name: "Envoyer" })
      .find((button) => button.classList.contains("is-primary"))!;
    await user.click(composerSend());
    await waitFor(() => expect(live.sendReadyMessage).toHaveBeenCalledTimes(1));

    await user.click(composerSend());
    await waitFor(() => expect(live.sendReadyMessage).toHaveBeenCalledTimes(2));

    const first = live.sendReadyMessage.mock.calls[0]![0];
    const second = live.sendReadyMessage.mock.calls[1]![0];
    expect(first.clientMessageId).toBe(second.clientMessageId);
    expect(first).toMatchObject({
      kind: "brief",
      payload: { schema_version: 1, style_key: "Trap" },
      attachmentItemIds: [],
    });
  });

  it("bloque le double-clic de création de groupe et garde la même clé au retry", async () => {
    const live = controller();
    let resolveFirst!: (value: string | null) => void;
    const createGroupConversation = vi.fn<NonNullable<MessagingWorkspaceLiveController["createGroupConversation"]>>()
      .mockImplementationOnce(() => new Promise<string | null>((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce(null);
    live.value.contactsStatus = "ready";
    live.value.contacts = [
      { id: "40000000-0000-4000-8000-000000000001", username: "maya", displayName: "Maya Sol", avatar: "/avatars/utilisatrice.png", online: true, role: "DJ" },
      { id: "40000000-0000-4000-8000-000000000002", username: "nadir", displayName: "Nadir Keys", avatar: "/avatars/utilisateur.png", online: true, role: "Pianiste" },
    ];
    live.value.createGroupConversation = createGroupConversation;
    const user = userEvent.setup();
    render(<MessageWorkspace newConversationSignal={0} liveController={live.value} />);

    await user.click(screen.getByRole("button", { name: "Filtres de la liste" }));
    await user.click(screen.getByRole("button", { name: /Nouvelle conversation/ }));
    const friendSearch = screen.getByRole("textbox", { name: "Rechercher un ami sur Meewav" });
    await user.type(friendSearch, "ma");
    await user.click(screen.getByRole("button", { name: /Maya Sol/ }));
    await user.clear(friendSearch);
    await user.type(friendSearch, "na");
    await user.click(screen.getByRole("button", { name: /Nadir Keys/ }));
    const createButton = screen.getByRole("button", { name: "Créer groupe" });
    fireEvent.click(createButton);
    fireEvent.click(createButton);
    expect(createGroupConversation).toHaveBeenCalledTimes(1);

    resolveFirst(null);
    await waitFor(() => expect(screen.getByRole("button", { name: "Créer groupe" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Créer groupe" }));
    await waitFor(() => expect(createGroupConversation).toHaveBeenCalledTimes(2));
    expect(createGroupConversation.mock.calls[0][2]).toBe(createGroupConversation.mock.calls[1][2]);
  });

  it("n’envoie une note vocale automatiquement qu’une fois puis garde son identifiant au retry manuel", async () => {
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:https://meewav.test/voice");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [{ stop: vi.fn() }],
        } as unknown as MediaStream)),
      },
    });

    const live = controller();
    const user = userEvent.setup();
    const { rerender } = render(<MessageWorkspace newConversationSignal={0} liveController={live.value} />);
    await user.click(screen.getByRole("button", { name: "Enregistrer une note vocale" }));
    await user.click(await screen.findByRole("button", { name: /Arrêter/ }));
    const recordingSend = await waitFor(() => screen.getAllByRole("button", { name: "Envoyer" })
      .find((button) => button.closest(".mw-recording-composer"))!);
    await user.click(recordingSend);

    const queuedInput = live.enqueue.mock.calls[0]![0];
    const readyItem: MessagingAttachmentQueueItem = {
      id: "30000000-0000-4000-8000-000000000001",
      file: queuedInput.file,
      purpose: "voice_note",
      displayName: queuedInput.file.name,
      mimeType: queuedInput.file.type,
      sizeBytes: queuedInput.file.size,
      durationMs: queuedInput.durationMs ?? null,
      status: "ready",
      progress: 1,
      prepared: null,
      finalized: null,
      storageUploaded: true,
      error: null,
      conversationId: live.value.selectedConversationId,
      collaborationRecipientProfileId: null,
    };
    live.value.attachments = { ...live.value.attachments!, queue: [readyItem] };
    rerender(<MessageWorkspace newConversationSignal={0} liveController={live.value} />);
    await waitFor(() => expect(live.sendReadyMessage).toHaveBeenCalledTimes(1));

    rerender(<MessageWorkspace newConversationSignal={0} liveController={live.value} />);
    await new Promise((resolve) => window.setTimeout(resolve, 25));
    expect(live.sendReadyMessage).toHaveBeenCalledTimes(1);

    fireEvent.click(document.querySelector(".mw-attachment-queue__send")!);
    await waitFor(() => expect(live.sendReadyMessage).toHaveBeenCalledTimes(2));
    expect(live.sendReadyMessage.mock.calls[0]![0].clientMessageId)
      .toBe(live.sendReadyMessage.mock.calls[1]![0].clientMessageId);
  });

  it("coordonne les transports du Track Pack sans recréer les audios lors des changements MUTE", async () => {
    FakeAudioTransport.instances = [];
    vi.stubGlobal("Audio", FakeAudioTransport);
    const message: DemoMessage = {
      id: "track-pack-1",
      author: "them",
      kind: "track-pack",
      body: "Demo Pack",
      tracks: ["drums.wav", "bass.wav"],
      trackDurations: ["1:30", "1:20"],
      trackMediaUrls: ["https://media.test/drums.wav", "https://media.test/bass.wav"],
      duration: "1:30",
      time: "12:00",
    };
    const live = controller([message]);
    const user = userEvent.setup();
    render(<MessageWorkspace newConversationSignal={0} liveController={live.value} />);

    await user.click(screen.getByRole("button", { name: "Ouvrir" }));
    expect(await screen.findByRole("dialog", { name: /Track Pack/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Lire Batterie" }));
    expect(screen.getByRole("button", { name: "Mettre Batterie en pause" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Lire toutes les pistes ensemble" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Lire Batterie" })).toBeInTheDocument());

    const audioCountBeforeMixChange = FakeAudioTransport.instances.length;
    for (const muteButton of screen.getAllByRole("button", { name: "MUTE" })) {
      await user.click(muteButton);
    }

    const masterButton = screen.getByRole("button", { name: "Lire toutes les pistes ensemble" });
    expect(masterButton).toBeDisabled();
    expect(FakeAudioTransport.instances).toHaveLength(audioCountBeforeMixChange);
  });
});


describe("Audio message wiring", () => {
  it("plays a private recording from the first click and pauses it when leaving", async () => {
    FakeAudioTransport.instances = [];
    vi.stubGlobal("Audio", FakeAudioTransport);
    const attachment = { ...serverAttachment(), purpose: "audio" as const, mediaType: "audio" as const, mimeType: "audio/webm", displayName: "vocal.webm", durationMs: 5000 };
    const live = controller([{ id: "private-voice", author: "them", kind: "audio", body: "vocal.webm", time: "12:00", duration: "0:05", attachments: [attachment] }]);
    const user = userEvent.setup();
    const view = render(<MessageWorkspace newConversationSignal={0} liveController={live.value} />);
    expect(live.resolveUrl).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Ouvrir" }));
    await waitFor(() => expect(FakeAudioTransport.instances.some((audio) => !audio.paused)).toBe(true));
    const playing = FakeAudioTransport.instances.find((audio) => !audio.paused)!;
    expect(playing.src).toBe("blob:https://meewav.test/private-image");
    expect(live.resolveUrl).toHaveBeenCalledWith(attachment);
    view.unmount();
    expect(playing.paused).toBe(true);
    expect(playing.src).toBe("");
  });

  it("does not fabricate silent playback for a message without an audio source", async () => {
    FakeAudioTransport.instances = [];
    vi.stubGlobal("Audio", FakeAudioTransport);
    const live = controller([{ id: "missing-audio", author: "them", kind: "audio", body: "missing.webm", time: "12:00", duration: "0:05" }]);
    const user = userEvent.setup();
    render(<MessageWorkspace newConversationSignal={0} liveController={live.value} />);
    await user.click(screen.getByRole("button", { name: "Lire l'audio" }));
    expect(screen.getByRole("status")).toHaveTextContent("Aucun fichier audio");
    expect(FakeAudioTransport.instances.every((audio) => audio.paused)).toBe(true);
  });
});
