import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlaceDemoState, PLACE_DEMO_PROFILES } from "../../place/place.fixtures";
import type { PlaceRoomState } from "../../place/place.types";
import { createRoomToolsFixture } from "../roomTools.fixtures";
import { roomToolsRepository } from "../roomTools.service";
import type { LogeState, RoomPerson } from "../roomTools.types";
import RoomAudienceInteractions, { endClasseAudienceIntervention, LogePreviewPlayer, WaveAudience } from "./RoomAudienceInteractions";

const requestLogePreviewMediaUrl = vi.hoisted(() => vi.fn());
const downloadClassroomResource = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("../audio/logePreviewMedia.service", () => ({
  requestLogePreviewMediaUrl,
}));

vi.mock("../classroom/classroomResourceMedia.service", () => ({
  downloadClassroomResource,
}));

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.useRealTimers();
});

function room(id: string, profile = PLACE_DEMO_PROFILES.viewerA): PlaceRoomState {
  return { ...createPlaceDemoState(profile.id), id, currentUserProfile: profile, source: "demo" };
}

function preview(overrides: Partial<LogeState["preview"]> = {}): LogeState["preview"] {
  return {
    title: "Écoute privée — Éclipse",
    description: "Version privée",
    mediaName: "private-preview.wav",
    mediaPath: null,
    playing: true,
    replayIncluded: true,
    liveOnly: false,
    expiresAt: null,
    durationSeconds: 127,
    channels: 2,
    sampleRate: 44_100,
    waveformPeaks: [-12_000, 18_000, -22_000, 25_000],
    ...overrides,
  };
}

describe("RoomAudienceInteractions", () => {
  it("opens the student mockup with 24 seats and no teacher commands", async () => {
    const leave = vi.fn();
    render(<RoomAudienceInteractions roomType="classe" room={room("classe-student-default")} isHost={false} isGuest={false} canEngage onLeaveRoom={leave} />);
    expect(await screen.findByRole("button", {name: "Lever la main"})).toBeEnabled();
    expect(screen.getAllByRole("listitem")).toHaveLength(24);
    expect(screen.queryByRole("button", {name: "Fermer les demandes de prise de parole"})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Quitter la classe"}));
    expect(leave).toHaveBeenCalledOnce();
  });
  it.each(["classe", "cage", "loge"] as const)("keeps generic polls and gifts in Chat for the %s audience", async (roomType) => {
    const currentRoom = room(`audience-${roomType}-chat-actions`);
    currentRoom.poll = {
      id: "chat-poll",
      question: "Quel titre écouter ensuite ?",
      options: [{ label: "Premier titre", votes: 2 }, { label: "Deuxième titre", votes: 1 }],
      durationSeconds: null,
      endsAt: null,
      isActive: true,
      resultsVisible: true,
      currentUserVoteIndex: null,
    };
    render(<RoomAudienceInteractions roomType={roomType} room={currentRoom} isHost={false} isGuest={false} canEngage />);

    if (roomType === "cage") expect(await screen.findByRole("region", { name: "La Cage · participation" })).toBeVisible();
    else expect(await screen.findByText(roomType === "loge" ? "Bienvenue, les fans." : "Interactions")).toBeVisible();
    expect(screen.queryByText("Envoyer un cadeau")).not.toBeInTheDocument();
    expect(screen.queryByText(currentRoom.poll.question)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Premier titre|Deuxième titre/i })).not.toBeInTheDocument();
  });

  it("ends the student's real public transport before clearing the Classe speaker state", async () => {
    const disconnect = vi.fn(async () => undefined);
    const endCall = vi.fn(async () => undefined);
    const setContactPublicProgramActive = vi.fn();
    const execute = vi.fn(async () => undefined);
    await endClasseAudienceIntervention({
      source: "live",
      roomId: "room-classe-live",
      accountId: "student-live",
      liveCall: {
        invitations: [{
          invitationId: "invitation-public",
          roomId: "room-classe-live",
          contactProfileId: "student-live",
          partyRole: "contact",
          callMode: "public",
          status: "accepted",
          createdAt: "2026-08-21T18:00:00.000Z",
        } as never],
        mediaSessions: [{ invitationId: "invitation-public", disconnect } as never],
        endCall,
        setContactPublicProgramActive,
      },
      execute,
    });

    expect(setContactPublicProgramActive).toHaveBeenCalledWith("room-classe-live", false);
    expect(disconnect).toHaveBeenCalledOnce();
    expect(endCall).toHaveBeenCalledWith("invitation-public");
    expect(execute).toHaveBeenCalledWith({ type: "classe.speaker.end-own", accountId: "student-live" });
    expect(endCall.mock.invocationCallOrder[0]).toBeLessThan(execute.mock.invocationCallOrder[0]);
  });

  it("shows the public Scene program without ever mounting the Prompter", async () => {
    render(<RoomAudienceInteractions roomType="scene" room={room("audience-scene")} isHost={false} isGuest={false} canEngage />);
    expect(await screen.findByRole("heading", {name:"Le programme"})).toBeVisible();
    expect(screen.queryByText(/Les textes du Prompteur/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/La ville s'endort/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /démarrer le prompteur/i })).not.toBeInTheDocument();
    expect(screen.getByText("À l’affiche")).toBeVisible();
    expect(screen.queryByText("Envoyer un cadeau")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:/Voir Lumière noire,/}));
    expect(screen.getByRole("dialog",{name:"Détails du passage"})).toHaveTextContent("4 minutes");
    fireEvent.click(screen.getByRole("button",{name:"Fermer la fenêtre"}));
  });

  it("collects one Scene evaluation only after the show ends", async () => {
    const initial = await roomToolsRepository.load("scene", "audience-scene-evaluation");
    for (const entry of initial.scene!.program) await roomToolsRepository.execute("scene", "audience-scene-evaluation", "host", {type:"scene.program.patch",entryId:entry.id,patch:{status:"done"}});
    render(<RoomAudienceInteractions roomType="scene" room={room("audience-scene-evaluation")} isHost={false} isGuest={false} canEngage />);
    const fiveStars = await screen.findByRole("button", { name: "5 étoiles" });
    expect(fiveStars).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(fiveStars);
    expect(fiveStars).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Énergie" }));
    fireEvent.click(screen.getByRole("button", { name: "Envoyer mon évaluation" }));
    const confirmation = await screen.findByRole("status");
    expect(confirmation).toHaveTextContent(/évaluation a bien été enregistrée/i);
    expect(confirmation).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Envoyer mon évaluation" })).not.toBeInTheDocument();
  });

  it("announces the Host's reordered next passage and skips absent performers", async () => {
    const currentRoom = room(`scene-running-order-${crypto.randomUUID()}`);
    await roomToolsRepository.execute("scene", currentRoom.id, "host", { type: "scene.program.reorder", entryId: "perf-3", toIndex: 1 });
    render(<RoomAudienceInteractions roomType="scene" room={currentRoom} isHost={false} isGuest={false} canEngage />);
    await waitFor(() => expect(document.querySelector(".room-audience-next")).toHaveTextContent("Soul Transit"));
    await roomToolsRepository.execute("scene", currentRoom.id, "host", { type: "scene.program.patch", entryId: "perf-3", patch: { participantStatus: "absent" } });
    await waitFor(() => expect(document.querySelector(".room-audience-next")).toHaveTextContent("Nuit acoustique"));
  });

  it("lets an eligible Class participant end only their own intervention", async () => {
    render(<RoomAudienceInteractions roomType="classe" room={room("audience-classe", { ...PLACE_DEMO_PROFILES.viewerA, id: "class-01" })} isHost={false} isGuest canEngage />);
    const end = await screen.findByRole("button", { name: "Terminer mon intervention" });
    fireEvent.click(end);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Terminer mon intervention" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", {name: "Lever la main"})).toBeEnabled();
  });

  it("keeps a Classe question draft after failure and confirms the retry", async () => {
    render(<RoomAudienceInteractions roomType="classe" room={room("classe-question-retry")} isHost={false} isGuest canEngage />);
    fireEvent.click(await screen.findByRole("tab", {name:"Questions"}));
    const input = screen.getByLabelText(/Votre question/i);
    fireEvent.change(input, {target:{value:"Comment jouer cet accord ?"}});
    const execute = vi.spyOn(roomToolsRepository, "execute").mockRejectedValueOnce(new Error("network_lost"));
    fireEvent.click(screen.getByRole("button", {name:"Envoyer"}));
    expect(await screen.findByText(/Votre question n’a pas été envoyée/)).toBeVisible();
    expect(input).toHaveValue("Comment jouer cet accord ?");
    execute.mockRestore();
    fireEvent.click(screen.getByRole("button", {name:"Envoyer"}));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Question envoyée"));
    expect(document.querySelector(".room-audience-class-questions article:first-child")).toHaveTextContent("Comment jouer cet accord ?");
  });
  it("lets a Class place submit and support questions without exposing other votes", async () => {
    render(<RoomAudienceInteractions roomType="classe" room={room("audience-classe-questions")} isHost={false} isGuest canEngage />);
    fireEvent.click(await screen.findByRole("tab", {name: "Questions"}));
    const input = await screen.findByLabelText(/Votre question/i);
    fireEvent.change(input, { target: { value: "Peux-tu détailler le deuxième temps ?" } });
    fireEvent.click(screen.getByRole("button", { name: /Envoyer/i }));
    expect(await screen.findByText("Peux-tu détailler le deuxième temps ?")).toBeVisible();
    expect(document.querySelector(".room-audience-class-questions article:first-child")).toHaveTextContent("Peux-tu détailler le deuxième temps ?");
    expect(screen.getByRole("status")).toHaveTextContent("Question envoyée");
    expect(input).toHaveValue("");
    const support = screen.getByRole("button", { name: "Soutenir la question de Ana Sol · 8 soutiens" });
    fireEvent.click(support);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Question de Ana Sol déjà soutenue · 9 soutiens" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
  });

  it("lets an enrolled Class place download resources published by the teacher", async () => {
    const roomId = `audience-classe-resources-${crypto.randomUUID()}`;
    const resource = {
      id: crypto.randomUUID(),
      name: "fiche-rythmique.png",
      kind: "image" as const,
      mimeType: "image/png",
      size: 4_096,
      addedAt: new Date().toISOString(),
      mediaUrl: "blob:fiche-rythmique",
    };
    await roomToolsRepository.execute("classe", roomId, "teacher", { type: "classe.resource.add", resource });
    render(<RoomAudienceInteractions roomType="classe" room={room(roomId)} isHost={false} isGuest canEngage />);
    fireEvent.click(await screen.findByRole("tab", {name: "Ressources"}));
    expect(await screen.findByText("À garder après la classe")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Télécharger fiche-rythmique.png" }));
    await waitFor(() => expect(downloadClassroomResource).toHaveBeenCalledWith(expect.objectContaining({ id: resource.id }), roomId));
  });

  it("does not expose Class resources to a non-seated public Viewer", async () => {
    window.history.replaceState({}, "", "?classAccess=audience");
    const roomId = `audience-classe-public-resources-${crypto.randomUUID()}`;
    await roomToolsRepository.execute("classe", roomId, "teacher", {
      type: "classe.resource.add",
      resource: {
        id: crypto.randomUUID(),
        name: "cours.mp3",
        kind: "audio",
        mimeType: "audio/mpeg",
        size: 2_048,
        addedAt: new Date().toISOString(),
        mediaUrl: "blob:cours",
      },
    });
    render(<RoomAudienceInteractions roomType="classe" room={room(roomId)} isHost={false} isGuest={false} canEngage />);
    await screen.findByRole("list", {name: "Les 24 élèves de La Classe"});
    expect(screen.queryByRole("button", { name: "Télécharger cours.mp3" })).not.toBeInTheDocument();
  });

  it("shows the private Class notice only to the targeted place", async () => {
    const roomId = `audience-classe-private-${crypto.randomUUID()}`;
    const target = { ...PLACE_DEMO_PROFILES.viewerA, id: "class-06" };
    await roomToolsRepository.execute("classe", roomId, "teacher", { type: "classe.private", personId: target.id });
    const targetRender = render(<RoomAudienceInteractions roomType="classe" room={room(roomId, target)} isHost={false} isGuest canEngage />);
    expect(await screen.findByText("Le professeur vous parle en privé.")).toBeVisible();
    targetRender.unmount();
    render(<RoomAudienceInteractions roomType="classe" room={room(roomId, { ...target, id: "class-07" })} isHost={false} isGuest canEngage />);
    await screen.findByRole("list", {name: "Les 24 élèves de La Classe"});
    expect(screen.queryByText("Le professeur vous parle en privé.")).not.toBeInTheDocument();
  });

  it("records a Wave vote once and keeps the sequencer read-only", async () => {
    const roomId = `audience-wave-${crypto.randomUUID()}`;
    const state = await roomToolsRepository.load("wave", roomId);
    await roomToolsRepository.execute("wave", roomId, "host", {
      type: "wave.vote.open",
      submissionId: state.wave!.submissions[0].id,
      open: true,
    });
    render(<RoomAudienceInteractions roomType="wave" room={room(roomId)} isHost={false} isGuest={false} canEngage />);
    const vote = await screen.findByRole("button", { name: "Valider" });
    fireEvent.click(vote);
    await screen.findByText(/Vote enregistré/);
    expect(vote).toBeDisabled();
    expect(screen.getByText(/Lecture seule.*mute, solo, déplacement et suppression/i)).toBeVisible();
    expect(screen.queryByText(/à garder hors antenne/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Envoyer un cadeau")).not.toBeInTheDocument();
  });

  it("shows updated Wave rules but hides the contribution form when the host closes the gate", () => {
    const wave = createRoomToolsFixture("wave", "audience-wave-closed").wave!;
    wave.submissionsOpen = false;
    wave.baseLoop.bpm = 128;
    wave.baseLoop.key = "A mineur";
    const viewer: RoomPerson = {
      id: "wave-viewer-closed",
      name: PLACE_DEMO_PROFILES.viewerA.displayName,
      avatarUrl: PLACE_DEMO_PROFILES.viewerA.avatarUrl,
      role: PLACE_DEMO_PROFILES.viewerA.role,
      microphone: "off",
      camera: "off",
    };

    render(<WaveAudience wave={wave} source="demo" roomId="audience-wave-closed" accountId={viewer.id} viewer={viewer} canEngage busy={false} execute={vi.fn()} />);

    expect(screen.getByText("Soumissions fermées")).toBeVisible();
    expect(screen.getByText(/host rouvrira le Sas/i)).toBeVisible();
    expect(screen.getByText("128")).toBeVisible();
    expect(screen.getByText("A mineur")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Envoyer au Sas" })).not.toBeInTheDocument();
  });

  it("keeps a live Wave without an open ballot unavailable", () => {
    const execute = vi.fn(async () => undefined);
    const wave = createRoomToolsFixture("wave", "audience-wave-live").wave!;
    wave.submissions.forEach((submission) => {
      if (submission.vote) submission.vote.open = false;
    });
    const viewer = {
      id: "viewer-live",
      name: "Viewer live",
      avatarUrl: "",
      role: "Audience",
      microphone: "off" as const,
      camera: "off" as const,
    };
    const { container } = render(<WaveAudience wave={wave} source="live" roomId="audience-wave-live" accountId={viewer.id} viewer={viewer} canEngage busy={false} execute={execute} />);

    expect(screen.getByRole("alert")).toHaveTextContent(/interactions sont temporairement verrouillées/i);
    expect(screen.getByText("Envoi sécurisé en attente")).toBeVisible();
    expect(screen.getByText("Vote officiel en attente")).toBeVisible();
    expect(screen.getByText("Rendu officiel en attente")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Valider|Refuser|Envoyer au Sas/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Vote enregistré|envoyée au Sas/i)).not.toBeInTheDocument();
    expect(container.querySelector("audio")).not.toBeInTheDocument();
    expect(container.querySelector(".room-audience-waveform")).not.toBeInTheDocument();
    expect(execute).not.toHaveBeenCalled();
  });

  it("keeps Cage focused on the live, with votes handled by the persistent stage", async () => {
    render(<RoomAudienceInteractions roomType="cage" room={room("audience-cage")} isHost={false} isGuest={false} canEngage />);
    expect(await screen.findByRole("region", { name: "La Cage · participation" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Voter /i })).not.toBeInTheDocument();
    expect(screen.queryByText("RÉSULTAT RÉVÉLÉ")).not.toBeInTheDocument();
    expect(screen.queryByText("Bracket public")).not.toBeInTheDocument();
    expect(screen.queryByText(/SIMULATION|Paris versus Marseille/i)).not.toBeInTheDocument();
  });

  it("submits a VIP question and never exposes another member's private moment", async () => {
    render(<RoomAudienceInteractions roomType="loge" room={room("audience-loge")} isHost={false} isGuest={false} canEngage />);
    fireEvent.click(await screen.findByRole("tab",{name:"Questions"}));
    const input = await screen.findByLabelText(/Votre question/i);
    fireEvent.change(input, { target: { value: "Quel morceau a déclenché cet album ?" } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(await screen.findByText("Quel morceau a déclenché cet album ?")).toBeVisible();
    expect(screen.queryByText(/Lien privé/i)).not.toBeInTheDocument();
  });

  it("does not expose Loge media or VIP actions to an anonymous visitor", async () => {
    const anonymous = { ...room("audience-loge-anonymous"), currentUserProfile: null };
    render(<RoomAudienceInteractions roomType="loge" room={anonymous} isHost={false} isGuest={false} canEngage={false} />);
    expect(await screen.findByText("Cette Loge est réservée")).toBeVisible();
    expect(screen.getByRole("link", { name: "Se connecter" }).getAttribute("href")).toMatch(/^\/auth\?returnTo=/);
    expect(screen.queryByText("eclipse-premix-v7.wav")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Envoyer" })).not.toBeInTheDocument();
    expect(requestLogePreviewMediaUrl).not.toHaveBeenCalled();
  });

  it("keeps an unavailable Loge preview hidden without using the retired content-expiry field", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(new Date("2026-09-19T00:00:00.000Z").getTime());
    try {
      render(<RoomAudienceInteractions roomType="loge" room={room("audience-loge-expired")} isHost={false} isGuest={false} canEngage />);
      expect(await screen.findByRole("heading", { name: "Bienvenue, les fans." })).toBeVisible();
      expect(screen.getByText("Les contenus partagés pendant le direct apparaîtront ici.")).toBeVisible();
      expect(screen.queryByText("eclipse-premix-v7.wav")).not.toBeInTheDocument();
      expect(requestLogePreviewMediaUrl).not.toHaveBeenCalled();
    } finally { now.mockRestore(); }
  });

  it("requests a live preview URL only while the transport is available", async () => {
    const unavailable = render(<LogePreviewPlayer roomId="room-live" source="live" preview={preview()} available={false} />);
    expect(requestLogePreviewMediaUrl).not.toHaveBeenCalled();
    unavailable.unmount();

    requestLogePreviewMediaUrl.mockResolvedValue({ signedUrl: "https://media.example.test/private.wav", expiresAt: "2099-01-01T00:00:00.000Z" });
    render(<LogePreviewPlayer roomId="room-live" source="live" preview={preview({ expiresAt: "2025-01-01T00:00:00.000Z" })} available />);
    await waitFor(() => expect(requestLogePreviewMediaUrl).toHaveBeenCalledWith("room-live"));
  });

  it("uses the bundled media only for the matching demo fixture", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
    const fixture = preview({ mediaName: "eclipse-premix-v7.wav" });
    const { container, rerender } = render(<LogePreviewPlayer roomId="room-demo" source="demo" preview={fixture} available />);
    await waitFor(() => expect(container.querySelector("audio")).toHaveAttribute("src", "/media/preprofile-demo/hazy-after-hours.mp3"));
    fireEvent.loadedMetadata(container.querySelector("audio")!);
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    expect(requestLogePreviewMediaUrl).not.toHaveBeenCalled();

    rerender(<LogePreviewPlayer roomId="room-demo" source="demo" preview={preview({ mediaName: "unrelated.wav" })} available />);
    await waitFor(() => expect(container.querySelector("audio")).not.toHaveAttribute("src"));
  });

  it("lets a Loge member enable playback when the browser blocks autoplay", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play")
      .mockRejectedValueOnce(new DOMException("User activation required", "NotAllowedError"))
      .mockResolvedValueOnce(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
    const { container } = render(<LogePreviewPlayer roomId="loge-autoplay" source="demo" preview={preview({ mediaName: "eclipse-premix-v7.wav" })} available />);
    await waitFor(() => expect(container.querySelector("audio")).toHaveAttribute("src"));
    fireEvent.loadedMetadata(container.querySelector("audio")!);
    fireEvent.click(await screen.findByRole("button", { name: "Activer la lecture" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Activer la lecture" })).not.toBeInTheDocument());
    expect(play).toHaveBeenCalledTimes(2);
  });

  it("requests the private live URL automatically when the public transport starts", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
    requestLogePreviewMediaUrl.mockResolvedValue({
      signedUrl: "https://media.example.test/private-preview.wav?token=short-lived",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });

    const { container } = render(<LogePreviewPlayer roomId="room-live" source="live" preview={preview({ playing: true })} available />);
    const audio = container.querySelector("audio");
    expect(audio).toHaveAttribute("preload", "metadata");
    expect(audio).not.toHaveAttribute("src");
    await waitFor(() => expect(requestLogePreviewMediaUrl).toHaveBeenCalledWith("room-live"));
    await waitFor(() => expect(audio).toHaveAttribute("src", "https://media.example.test/private-preview.wav?token=short-lived"));
    fireEvent.loadedMetadata(audio!);
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    expect(requestLogePreviewMediaUrl).toHaveBeenCalledTimes(1);
  });

  it("stops playback and clears the signed URL when the preview identity changes", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
    requestLogePreviewMediaUrl.mockResolvedValue({
      signedUrl: "https://media.example.test/first.wav?token=short-lived",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    const firstPreview = preview({ mediaName: "first.wav" });
    const { container, rerender } = render(<LogePreviewPlayer roomId="room-live" source="live" preview={firstPreview} available />);
    const audio = container.querySelector("audio");
    await waitFor(() => expect(audio).toHaveAttribute("src"));

    rerender(<LogePreviewPlayer roomId="room-live" source="live" preview={preview({ mediaName: "replacement.wav", waveformPeaks: [-1_000, 2_000] })} available={false} />);
    await waitFor(() => expect(audio).not.toHaveAttribute("src"));
    expect(pause).toHaveBeenCalled();
  });
});

it("displays the host seat price when a viewer opens a free chair",async()=>{
 window.history.replaceState({},"","?classAccess=audience");
 const roomId=`price-${crypto.randomUUID()}`;
 await roomToolsRepository.execute("classe",roomId,"teacher",{type:"classe.seat.price",cents:850});
 render(<RoomAudienceInteractions roomType="classe" room={room(roomId)} isHost={false} isGuest={false} canEngage/>);
 fireEvent.click(await screen.findByRole("button",{name:"Acheter la place 20"}));
 expect(await screen.findByRole("dialog",{name:"Ticket place 20"})).toHaveTextContent(/8,50/);
});

it('lets a viewer enter a newly prepared free class with their own identity', async () => {
  const { createRoomLaunchSession, defaultRoomLaunch } = await import('../../launch/roomLaunch');
  const config = defaultRoomLaunch('classe'); config.title = 'Cours gratuit';
  const session = createRoomLaunchSession(config);
  window.history.replaceState({}, '', '?classAccess=audience');
  render(<RoomAudienceInteractions roomType="classe" room={room(session.id)} isHost={false} isGuest={false} canEngage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Prendre la place 1' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Entrer gratuitement' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Ticket place 1' })).not.toBeInTheDocument());
  const state = await roomToolsRepository.load('classe', session.id);
  expect(state.classe?.seats[0].person).toMatchObject({ id: PLACE_DEMO_PROFILES.viewerA.id, name: PLACE_DEMO_PROFILES.viewerA.displayName, avatarUrl: PLACE_DEMO_PROFILES.viewerA.avatarUrl });
  expect(state.classe?.seatPriceCents).toBe(0);
});
