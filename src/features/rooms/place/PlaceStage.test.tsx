import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPlaceDemoState, PLACE_DEMO_PROFILES } from "./place.fixtures";
import type { PlaceRemoteAudioTrack } from "./placeLiveKit.service";
import { createPlaceProgramLayout } from "./placeProgramLayout.service";
import PlaceStage, { resolvePlaceViewerCallHandoff } from "./PlaceStage";
import { LIVE_ROOM_PRESENTATIONS, PLACE_ROOM_PRESENTATION, RoomPresentationProvider, type RoomPresentation } from "../roomPresentation";
import { MEEWAV_EMOTICONS } from "../../emoticons/MeewavEmoticons";
import type { ReactNode } from "react";

function renderStage({
  isHost = true,
  isGuest = false,
  panelCollapsed = false,
  suppressPhoneCallAudio = false,
  onViewerProgramActiveChange,
  hlsFallback = false,
  excludeOwnPhoneCallAudio = false,
  allowHlsPhoneCallHandoff = true,
  remoteAudioTracks = [],
  rtcAudioPlaybackReady = false,
  authoritativePublicMix = false,
  screenShareStream = null,
  presentation = PLACE_ROOM_PRESENTATION,
  screenShareRequesting = false,
  highlightText,
  musicGain,
  masterGain,
  hostVoiceGain,
  hostSocialActions,
  withGuest = false,
}: {
  isHost?: boolean;
  isGuest?: boolean;
  panelCollapsed?: boolean;
  suppressPhoneCallAudio?: boolean;
  onViewerProgramActiveChange?: (active: boolean) => void;
  hlsFallback?: boolean;
  excludeOwnPhoneCallAudio?: boolean;
  allowHlsPhoneCallHandoff?: boolean;
  remoteAudioTracks?: PlaceRemoteAudioTrack[];
  rtcAudioPlaybackReady?: boolean;
  authoritativePublicMix?: boolean;
  screenShareStream?: MediaStream | null;
  presentation?: RoomPresentation;
  screenShareRequesting?: boolean;
  highlightText?: string;
  musicGain?: number;
  masterGain?: number;
  hostVoiceGain?: number;
  hostSocialActions?: ReactNode;
  withGuest?: boolean;
} = {}) {
  const room = createPlaceDemoState(isHost ? PLACE_DEMO_PROFILES.host.id : PLACE_DEMO_PROFILES.viewerA.id);
  if (highlightText !== undefined) {
    room.highlightText = highlightText;
    room.pinnedMessageId = null;
  }
  room.participants = room.participants.map((participant) => (
    participant.id === "guest-b" || participant.id === "guest-c"
      ? { ...participant, status: "backstage" as const }
      : participant
  ));
  if (withGuest) {
    const guest = room.participants.find(participant => participant.profile.id === PLACE_DEMO_PROFILES.guestA.id);
    if (guest) guest.status = "onstage";
  }
  if (hlsFallback) {
    room.participants = room.participants.map((participant) => participant.status === "host"
      ? {
          ...participant,
          videoSources: [{
            id: "host-hls-program",
            type: "desktop_composite" as const,
            aspectRatio: "16:9" as const,
            transport: "hls" as const,
            publicationSid: "PA_host_hls_program",
            active: true,
            programEligible: true,
            viewerSelectable: true,
            videoUrl: "https://media.example.test/place-live.m3u8",
          }],
        }
      : participant);
  }
  if (authoritativePublicMix) {
    room.channels = room.channels.map((channel) => (
      channel.kind === "microphone" || channel.kind === "guest"
        ? { ...channel, publicMixAuthoritative: true, isRoutedToPublic: true }
        : channel
    ));
  }
  if (musicGain !== undefined || masterGain !== undefined || hostVoiceGain !== undefined) {
    room.channels = room.channels.map((channel) => {
      if (channel.kind === "audio" && musicGain !== undefined) return { ...channel, gain: musicGain, isRoutedToPublic: true };
      if (channel.kind === "master" && masterGain !== undefined) return { ...channel, gain: masterGain };
      if (channel.kind === "microphone" && channel.participantId === room.host.id && hostVoiceGain !== undefined) {
        return { ...channel, gain: hostVoiceGain, publicMixAuthoritative: true, isRoutedToPublic: true };
      }
      return channel;
    });
    room.track = { ...room.track, audioRoute: "public", audioPlaybackState: "playing" };
  }
  const onProgramLayoutChange = vi.fn().mockResolvedValue(undefined);
  const onPanelCollapsedChange = vi.fn();
  const onOpenProfile = vi.fn();
  const onStartScreenShare = vi.fn();
  const onStopScreenShare = vi.fn();
  const result = render(
    <RoomPresentationProvider presentation={presentation}><PlaceStage
      room={room}
      hostSocialActions={hostSocialActions}
      isHost={isHost}
      isGuest={isGuest}
      canEngage
      currentUserId={isHost ? room.host.id : room.currentUserProfile?.id}
      hostCameraEnabled
      hostMicrophoneEnabled
      hostMonitoringEnabled={false}
      onToggleHostMicrophone={vi.fn()}
      onToggleHostCamera={vi.fn()}
      onToggleHostMonitoring={vi.fn()}
      onVotePoll={vi.fn()}
      onNotice={vi.fn()}
      screenShareStream={screenShareStream}
      screenSharePublished={Boolean(screenShareStream)}
      screenShareRequesting={screenShareRequesting}
      onStartScreenShare={onStartScreenShare}
      onStopScreenShare={onStopScreenShare}
      remoteAudioTracks={remoteAudioTracks}
      rtcAudioPlaybackReady={rtcAudioPlaybackReady}
      suppressPhoneCallAudio={suppressPhoneCallAudio}
      excludeOwnPhoneCallAudio={excludeOwnPhoneCallAudio}
      allowHlsPhoneCallHandoff={allowHlsPhoneCallHandoff}
      onViewerProgramActiveChange={onViewerProgramActiveChange}
      onOpenProfile={onOpenProfile}
      panelCollapsed={panelCollapsed}
      onPanelCollapsedChange={onPanelCollapsedChange}
      programLayout={createPlaceProgramLayout(room)}
      onProgramLayoutChange={onProgramLayoutChange}
      canDirectProgram={isHost}
    /></RoomPresentationProvider>,
  );
  return { ...result, onStartScreenShare, onStopScreenShare, onOpenProfile, onPanelCollapsedChange, onProgramLayoutChange };
}

function remoteAudioTrack(
  purpose: PlaceRemoteAudioTrack["purpose"],
  participantIdentity: string,
): PlaceRemoteAudioTrack {
  return {
    key: `${purpose}:${participantIdentity}`,
    publicationSid: `PA_${purpose}_${participantIdentity}`,
    participantIdentity,
    muted: false,
    purpose,
    track: {
      attach: vi.fn(),
      detach: vi.fn(),
    } as unknown as PlaceRemoteAudioTrack["track"],
  };
}

Object.defineProperty(HTMLDialogElement.prototype, "showModal", {configurable:true,writable:true,value:function(this:HTMLDialogElement){this.setAttribute("open", "");}});
Object.defineProperty(HTMLDialogElement.prototype, "close", {configurable:true,writable:true,value:function(this:HTMLDialogElement){this.removeAttribute("open");}});

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PlaceStage — composition et taille indépendantes", () => {
  it.each(Object.values(LIVE_ROOM_PRESENTATIONS))("réserve le partage d’écran au Host dans $label", (presentation) => {
    const host = renderStage({ presentation });
    const trigger = screen.getByRole("button", { name: "Partager mon écran" });
    expect(trigger).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(trigger);
    expect(host.onStartScreenShare).toHaveBeenCalledOnce();
    host.unmount();
    const viewer = renderStage({ isHost: false, presentation });
    expect(screen.queryByRole("button", { name: "Partager mon écran" })).not.toBeInTheDocument();
    viewer.unmount();
    renderStage({ isHost: false, isGuest: true, presentation });
    expect(screen.queryByRole("button", { name: "Partager mon écran" })).not.toBeInTheDocument();
  });

  it.each(Object.values(LIVE_ROOM_PRESENTATIONS))("bloque les démarrages répétés pendant la sélection dans $label", (presentation) => {
    const host = renderStage({ presentation, screenShareRequesting: true });
    const trigger = screen.getByRole("button", { name: "Ouverture du partage d’écran" });
    expect(trigger).toBeDisabled();
    fireEvent.click(trigger);
    expect(host.onStartScreenShare).not.toHaveBeenCalled();
  });

  it.each(Object.values(LIVE_ROOM_PRESENTATIONS))("affiche le flux partagé exact et permet son arrêt dans $label", async (presentation) => {
    const publishedStream = {} as MediaStream;
    const host = renderStage({ presentation, screenShareStream: publishedStream });
    const canvas = host.container.querySelector(".place-stage__grid");
    await waitFor(() => expect(canvas).toHaveClass("is-screen-sharing"));
    expect(canvas).not.toHaveClass("is-cage-program");
    expect(canvas).toHaveAttribute("data-participants", "1");
    expect(host.container.querySelector<HTMLVideoElement>(".place-screen-share video")?.srcObject).toBe(publishedStream);
    const stop = screen.getByRole("button", { name: "Arrêter le partage d’écran" });
    expect(stop).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(stop);
    expect(host.onStopScreenShare).toHaveBeenCalledOnce();
    expect(host.onStartScreenShare).not.toHaveBeenCalled();
  });

  it.each(Object.values(LIVE_ROOM_PRESENTATIONS))("affiche les émoticônes du message mis en avant dans $label", (presentation) => {
    const emoticon = MEEWAV_EMOTICONS.find((item) => item.name === "coeur-casque")!;
    const { container } = renderStage({ presentation, highlightText: "On reprend [[mw:coeur-casque]]" });
    const highlight = container.querySelector(".place-stage__highlight") as HTMLElement;
    expect(highlight).toHaveTextContent("On reprend");
    expect(highlight).not.toHaveTextContent("[[mw:");
    expect(within(highlight).getByRole("img", { name: emoticon.label })).toHaveAttribute("src", emoticon.assetPath);
  });

  it("met automatiquement le flux publié exact sur le grand retour", async () => {
    const publishedStream = {} as MediaStream;
    const { container } = renderStage({ screenShareStream: publishedStream });

    await waitFor(() => expect(container.querySelector(".place-stage__grid")).toHaveClass("is-screen-sharing"));
    const programmeVideo = container.querySelector<HTMLVideoElement>(".place-screen-share video");
    expect(programmeVideo).not.toBeNull();
    expect(programmeVideo?.srcObject).toBe(publishedStream);
    expect(screen.getByRole("button", { name: "Revenir au PROGRAM" })).toBeVisible();
  });

  it.each([true, false])("affiche un avatar de profil compact sur chaque vidéo (host=%s)", (isHost) => {
    const { container, onOpenProfile, onProgramLayoutChange } = renderStage({ isHost });
    const tiles = Array.from(container.querySelectorAll<HTMLElement>(".place-stage-layout__tile"));

    expect(tiles).toHaveLength(2);
    tiles.forEach((tile) => {
      const profileButton = within(tile).getByRole("button", { name: /Voir le profil de/ });
      expect(profileButton).toHaveClass("place-stage-layout__profile");
      expect(profileButton.querySelector("img")).toBeInTheDocument();
    });

    fireEvent.click(within(tiles[1]).getByRole("button", { name: "Voir le profil de Lior Benali" }));
    expect(onOpenProfile).toHaveBeenCalledWith(PLACE_DEMO_PROFILES.guestA.id);
    expect(onProgramLayoutChange).not.toHaveBeenCalled();
    if (!isHost) {
      const stage = container.querySelector(".place-stage") as HTMLElement;
      expect(stage.dataset.composition).toBe("ensemble");
      expect(screen.queryByText("VUE PERSONNELLE")).not.toBeInTheDocument();
    }
  });

  it("ne réutilise jamais le portrait de profil comme poster vidéo", () => {
    const { container } = renderStage();

    const tiles = Array.from(container.querySelectorAll<HTMLElement>(".place-stage-layout__tile"));
    tiles.forEach((tile) => {
      const portrait = within(tile).getByRole("button", { name: /Voir le profil de/ }).querySelector("img");
      expect(portrait).toBeInTheDocument();
      const mediaPoster = tile.querySelector<HTMLImageElement>(".place-camera__media-frame img.place-camera__media");
      expect(mediaPoster?.getAttribute("src")).not.toBe(portrait?.getAttribute("src"));
    });
  });

  it("ancre la mise à l’antenne à la vidéo choisie", () => {
    const { container, onProgramLayoutChange } = renderStage();
    const guestTile = container.querySelectorAll<HTMLElement>(".place-stage-layout__tile")[1];

    fireEvent.click(within(guestTile).getByRole("button", { name: "Ouvrir la réalisation pour Lior Benali" }));

    const menu = within(guestTile).getByRole("menu", { name: "Actions pour Lior Benali" });
    expect(menu).toHaveClass("place-stage-layout__action-menu");
    expect(container.querySelector(".place-stage-layout__selection")).not.toBeInTheDocument();
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Mettre à l’antenne" }));

    expect(onProgramLayoutChange).toHaveBeenCalledWith(expect.objectContaining({
      mode: "stage",
      primaryParticipantId: "guest-a",
    }));
  });

  it("ne propose jamais la réalisation globale au viewer", () => {
    renderStage({ isHost: false });

    expect(screen.queryByRole("button", { name: /Ouvrir la réalisation pour/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Mettre à l’antenne" })).not.toBeInTheDocument();
  });

  it("expose uniquement les trois compositions et les trois tailles publiques", () => {
    const { container } = renderStage();
    fireEvent.click(container.querySelector(".place-stage-layout__mode-trigger") as HTMLButtonElement);

    expect(screen.getByRole("menuitemradio", { name: "Ensemble" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "Mise en avant" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "Solo" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "Normale" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "Scène élargie" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "Plein écran" })).toBeInTheDocument();
    expect(screen.queryByText("Automatique")).not.toBeInTheDocument();
  });

  it("la scène élargie replie seulement le panneau droit", () => {
    const { container, onPanelCollapsedChange, onProgramLayoutChange } = renderStage();
    fireEvent.click(container.querySelector(".place-stage-layout__mode-trigger") as HTMLButtonElement);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Scène élargie" }));

    expect(onPanelCollapsedChange).toHaveBeenCalledWith(true);
    expect(onProgramLayoutChange).not.toHaveBeenCalled();
  });

  it("le plein écran conserve la composition initiale", () => {
    const { container, onProgramLayoutChange } = renderStage();
    const stage = container.querySelector(".place-stage") as HTMLElement & { requestFullscreen: () => Promise<void> };
    stage.requestFullscreen = vi.fn().mockResolvedValue(undefined);
    const initialComposition = stage.dataset.composition;

    fireEvent.click(container.querySelector(".place-stage-layout__mode-trigger") as HTMLButtonElement);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Plein écran" }));

    expect(stage.requestFullscreen).toHaveBeenCalledOnce();
    expect(stage.dataset.composition).toBe(initialComposition);
    expect(onProgramLayoutChange).not.toHaveBeenCalled();
  });

  it("un clic viewer crée une Mise en avant locale sans modifier le PROGRAM", () => {
    const { container, onProgramLayoutChange } = renderStage({ isHost: false });
    const tiles = container.querySelectorAll<HTMLElement>(".place-stage-layout__tile");
    fireEvent.click(tiles[1]);

    const stage = container.querySelector(".place-stage") as HTMLElement;
    expect(stage.dataset.composition).toBe("focus");
    expect(stage.dataset.layoutRecipe).toBe("stage-pip");
    expect(onProgramLayoutChange).not.toHaveBeenCalled();
    expect(screen.getByText("VUE PERSONNELLE")).toBeInTheDocument();
  });

  it("un double-clic host ouvre Solo localement sans mettre la personne à l’antenne", () => {
    const { container, onProgramLayoutChange } = renderStage();
    const tiles = container.querySelectorAll<HTMLElement>(".place-stage-layout__tile");
    fireEvent.doubleClick(tiles[1]);

    const stage = container.querySelector(".place-stage") as HTMLElement;
    expect(stage.dataset.composition).toBe("solo");
    expect(stage.dataset.layoutRecipe).toBe("solo");
    expect(onProgramLayoutChange).not.toHaveBeenCalled();
  });

  it("réorganise Ensemble quand une caméra tourne sans recréer la vidéo", () => {
    const { container } = renderStage({ isHost: false });
    const stage = container.querySelector(".place-stage") as HTMLElement;
    const hostVideo = container.querySelector("video") as HTMLVideoElement;
    expect(stage.dataset.layoutRecipe).toBe("grid-two");

    Object.defineProperty(hostVideo, "videoWidth", { configurable: true, value: 1080 });
    Object.defineProperty(hostVideo, "videoHeight", { configurable: true, value: 1920 });
    fireEvent(hostVideo, new Event("resize"));

    expect(container.querySelector("video")).toBe(hostVideo);
    expect(stage.dataset.shortCount).toBe("1");
    expect(stage.dataset.layoutRecipe).toBe("mixed-grid");
  });
});

describe("PlaceStage — handoff du retour téléphone", () => {
  it("reste sur le retour privé tant que le programme public n’est pas prêt", () => {
    expect(resolvePlaceViewerCallHandoff({
      isHost: false,
      isGuest: false,
      playbackRequested: true,
      publicOutputMuted: false,
      rtcProgrammeReady: false,
      hlsProgrammeReady: false,
    })).toBe(false);
    expect(resolvePlaceViewerCallHandoff({
      isHost: false,
      isGuest: false,
      playbackRequested: true,
      publicOutputMuted: false,
      rtcProgrammeReady: true,
      hlsProgrammeReady: false,
    })).toBe(true);
    expect(resolvePlaceViewerCallHandoff({
      isHost: false,
      isGuest: false,
      playbackRequested: true,
      publicOutputMuted: true,
      rtcProgrammeReady: true,
      hlsProgrammeReady: true,
    })).toBe(false);
  });

  it("bascule vers un HLS confirmé puis restaure le privé dès que ce programme attend", async () => {
    const onViewerProgramActiveChange = vi.fn();
    const { container } = renderStage({
      isHost: false,
      suppressPhoneCallAudio: true,
      onViewerProgramActiveChange,
      hlsFallback: true,
    });
    const hlsVideo = container.querySelector<HTMLVideoElement>("video.place-camera__media");
    expect(hlsVideo).not.toBeNull();

    fireEvent.canPlay(hlsVideo!);
    expect(onViewerProgramActiveChange).not.toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByRole("button", { name: "Activer le son" }));
    await waitFor(() => expect(onViewerProgramActiveChange).toHaveBeenLastCalledWith(true));

    fireEvent.waiting(hlsVideo!);
    await waitFor(() => expect(onViewerProgramActiveChange).toHaveBeenLastCalledWith(false));
  });

  it("ne bascule jamais vers le HLS agrégé quand l’appel du contact a été à l’antenne", async () => {
    const onViewerProgramActiveChange = vi.fn();
    const { container } = renderStage({
      isHost: false,
      suppressPhoneCallAudio: true,
      excludeOwnPhoneCallAudio: true,
      allowHlsPhoneCallHandoff: false,
      onViewerProgramActiveChange,
      hlsFallback: true,
    });
    const hlsVideo = container.querySelector<HTMLVideoElement>("video.place-camera__media");
    fireEvent.canPlay(hlsVideo!);
    fireEvent.click(screen.getByRole("button", { name: "Activer le son" }));

    await waitFor(() => expect(onViewerProgramActiveChange).toHaveBeenLastCalledWith(false));
    expect(onViewerProgramActiveChange).not.toHaveBeenCalledWith(true);
  });

  it("écoute le mix RTC complet sans jamais rejouer la piste phone_call du contact", async () => {
    const onViewerProgramActiveChange = vi.fn();
    const tracks = [
      remoteAudioTrack("voice", PLACE_DEMO_PROFILES.host.id),
      remoteAudioTrack("voice", PLACE_DEMO_PROFILES.guestA.id),
      remoteAudioTrack("phone_call", PLACE_DEMO_PROFILES.host.id),
    ];
    const { container } = renderStage({
      isHost: false,
      suppressPhoneCallAudio: false,
      excludeOwnPhoneCallAudio: true,
      onViewerProgramActiveChange,
      remoteAudioTracks: tracks,
      rtcAudioPlaybackReady: true,
      authoritativePublicMix: true,
    });

    fireEvent.click(screen.getByRole("button", { name: "Activer le son" }));
    await waitFor(() => expect(onViewerProgramActiveChange).toHaveBeenLastCalledWith(true));

    expect(container.querySelector('[data-place-livekit-purpose="voice"]'
      + `[data-place-livekit-participant="${PLACE_DEMO_PROFILES.host.id}"]`)).toBeInTheDocument();
    expect(container.querySelector('[data-place-livekit-purpose="phone_call"]')).not.toBeInTheDocument();
  });

  it("applique Musique × Master à la musique et Voix × Master aux micros", async () => {
    const tracks = [
      remoteAudioTrack("voice", PLACE_DEMO_PROFILES.host.id),
      remoteAudioTrack("music", PLACE_DEMO_PROFILES.host.id),
    ];
    const { container } = renderStage({
      isHost: false,
      remoteAudioTracks: tracks,
      rtcAudioPlaybackReady: true,
      authoritativePublicMix: true,
      musicGain: .4,
      masterGain: .5,
      hostVoiceGain: .8,
    });

    fireEvent.click(screen.getByRole("button", { name: "Activer le son" }));
    const voice = container.querySelector<HTMLAudioElement>('[data-place-livekit-purpose="voice"]')!;
    const music = container.querySelector<HTMLAudioElement>('[data-place-livekit-purpose="music"]')!;
    await waitFor(() => {
      expect(voice.volume).toBeCloseTo(.4);
      expect(music.volume).toBeCloseTo(.2);
    });
  });
});


it.each(Object.values(LIVE_ROOM_PRESENTATIONS))("keeps viewer social actions out of the stage controls in $label", (presentation) => {
  renderStage({ isHost: false, presentation });
  expect(screen.queryByRole("button", { name: /Like|bourse|soutenir/ })).not.toBeInTheDocument();
});

it.each(Object.values(LIVE_ROOM_PRESENTATIONS).filter(presentation => presentation.id !== "cage"))("attaches viewer support only to the host video in $label", (presentation) => {
  const onSupport = vi.fn();
  const { container } = renderStage({ isHost: false, presentation, withGuest: true, hostSocialActions: <button onClick={onSupport}>Soutenir le host</button> });
  const support = screen.getByRole("button", { name: "Soutenir le host" });
  expect(support.parentElement).toHaveClass("room-viewer-host-support");
  expect(support.closest(".place-stage-layout__tile")).toHaveAttribute("aria-label", expect.stringContaining(PLACE_DEMO_PROFILES.host.displayName));
  const guestTile = container.querySelector<HTMLElement>(`.place-stage-layout__tile[aria-label*="${PLACE_DEMO_PROFILES.guestA.displayName}"]`);
  expect(guestTile).toBeInTheDocument();
  expect(guestTile!.querySelector(".room-viewer-host-support")).toBeNull();
  expect(container.querySelector(".place-stage__controls .room-viewer-host-support")).toBeNull();
  fireEvent.click(support);
  expect(onSupport).toHaveBeenCalledOnce();
});

it("never duplicates host support on a shared screen or its presenter thumbnail", () => {
  const { container } = renderStage({ isHost: false, screenShareStream: {} as MediaStream, hostSocialActions: <button>Soutenir le host</button> });
  expect(container.querySelector(".place-screen-share")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Soutenir le host" })).not.toBeInTheDocument();
});
