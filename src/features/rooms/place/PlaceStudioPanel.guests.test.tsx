import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlaceDemoState } from "./place.fixtures";
import PlaceStudioPanel from "./PlaceStudioPanel";

afterEach(() => { cleanup(); vi.useRealTimers(); });

function renderGuestPanel({ stageFull = true }: { stageFull?: boolean } = {}) {
  const noop = vi.fn();
  const asyncNoop = vi.fn().mockResolvedValue(undefined);
  const onMoveGuest = vi.fn().mockResolvedValue(undefined);
  const onRemoveGuest = vi.fn().mockResolvedValue(undefined);
  const onOpenProfile = vi.fn();
  const onMessageProfile = vi.fn();
  const onCollaborateProfile = vi.fn();
  const onMute = vi.fn();
  const onCamera = vi.fn();
  const room = createPlaceDemoState();
  if (!stageFull) {
    let onstageSeen = 0;
    room.participants = room.participants.filter((participant) => participant.status !== "onstage" || onstageSeen++ < 2);
  }
  const props: ComponentProps<typeof PlaceStudioPanel> = {
    room,
    isHost: true,
    isGuest: false,
    canEngage: true,
    collapsed: false,
    onCollapsedChange: noop,
    surface: "guests",
    onSurface: noop,
    mixerView: "volumes",
    onMixerView: noop,
    onGain: noop,
    onMute,
    onCamera,
    onVocal: noop,
    onTune: noop,
    pitchProvider: "none",
    pitchCorrection: { available: false, active: false, adapterId: null, reason: null },
    localAudioStatus: "idle",
    localAudioError: null,
    pluginInventory: [],
    pluginsRefreshing: false,
    nativePluginStatus: "idle",
    nativePluginAudioReady: false,
    nativePluginError: null,
    onPitchProvider: vi.fn().mockResolvedValue(true),
    onRefreshPlugins: asyncNoop,
    onRemoveNativePlugin: asyncNoop,
    onToggleMonitoring: noop,
    onTogglePlayback: noop,
    onSendMessage: asyncNoop,
    onJoinQueue: asyncNoop,
    onLeaveQueue: asyncNoop,
    onAcceptInvitation: asyncNoop,
    onDeclineInvitation: asyncNoop,
    onMarkReady: asyncNoop,
    onLaunchPoll: asyncNoop,
    onStopPoll: asyncNoop,
    onPinHighlight: asyncNoop,
    onPinMessage: asyncNoop,
    onDeleteMessage: asyncNoop,
    onClearHighlight: asyncNoop,
    onMoveGuest,
    onRemoveGuest,
    onSetQueueOpen: asyncNoop,
    onOpenProfile,
    onMessageProfile,
    onCollaborateProfile,
  };
  render(<PlaceStudioPanel {...props} />);
  return { onMoveGuest, onRemoveGuest, onOpenProfile, onMessageProfile, onCollaborateProfile, onMute, onCamera, room };
}

function artistRow(name: string) {
  const identity = screen.getByRole("button", { name: `Voir le profil de ${name}` });
  const row = identity.closest<HTMLElement>(".place-guest-row");
  expect(row).not.toBeNull();
  return row!;
}

describe("PlaceStudioPanel guest navigation", () => {
  it("ne montre plus de bulle après un survol prolongé d'un déplacement", () => {
    vi.useFakeTimers();
    renderGuestPanel({ stageFull: false });
    fireEvent.click(screen.getByRole("tab", { name: /Coulisses,/ }));
    const button = within(artistRow("Louna Saphir")).getByRole("button", { name: "Renvoyer vers la File d’attente Louna Saphir" });
    fireEvent.mouseEnter(button);
    act(() => vi.advanceTimersByTime(999));
    expect(screen.queryByRole("tooltip")).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("tooltip")).toBeNull();
    act(() => vi.advanceTimersByTime(3_000));
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.mouseLeave(button);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
  it("conserve les déplacements accessibles sans bulle ni title natif", () => {
    const { onMoveGuest } = renderGuestPanel({ stageFull: false });
    fireEvent.click(screen.getByRole("tab", { name: /Coulisses,/ }));
    const row = artistRow("Louna Saphir");
    for (const button of row.querySelectorAll<HTMLButtonElement>(".place-guest-row__primary")) {
      expect(button).not.toHaveAttribute("title");
      fireEvent.focus(button);
      expect(screen.queryByRole("tooltip")).toBeNull();
      expect(button).not.toHaveAttribute("aria-describedby");
      fireEvent.blur(button);
    }
    fireEvent.click(within(row).getByRole("button", { name: "Renvoyer vers la File d’attente Louna Saphir" }));
    expect(onMoveGuest).toHaveBeenCalledWith(expect.objectContaining({ id: "guest-d" }), "accepted");
  });
  it("relie les boutons carrés Scène aux commandes du Mixeur", () => {
    const { onMute, onCamera, room } = renderGuestPanel();
    fireEvent.click(screen.getByRole("tab", { name: /Sur scène,/ }));
    const row = artistRow("Lior Benali");
    const participant = room.participants.find((item) => item.profile.displayName === "Lior Benali")!;
    const channel = room.channels.find((item) => item.participantId === participant.id || item.participantId === participant.profile.id)!;
    fireEvent.click(within(row).getByRole("button", { name: "Couper le micro à l’antenne de Lior Benali" }));
    expect(onMute).toHaveBeenCalledWith(channel.id);
    fireEvent.click(within(row).getByRole("button", { name: "Couper la caméra de Lior Benali" }));
    expect(onCamera).toHaveBeenCalledWith(participant.profile.id, false);
    expect(row.querySelector(".place-guest-row__media-details")).toBeNull();
    expect(within(row).getByRole("group", { name: "Micro et caméra de Lior Benali" }).querySelectorAll(":scope > button")).toHaveLength(3);
  });
  it("présente les trois onglets compacts avec icônes, compteurs et noms accessibles complets", () => {
    renderGuestPanel();

    const navigation = screen.getByRole("tablist", { name: "Gestion des invités" });
    expect(within(navigation).getByText("Demandes")).toBeVisible();
    expect(within(navigation).getByText("Coulisses")).toBeVisible();
    expect(within(navigation).getByText("Scène")).toBeVisible();
    expect(navigation.querySelector(".place-guests__segment-icon")).toBeNull();
    expect(navigation.querySelectorAll("svg[aria-hidden=true]")).toHaveLength(3);
    expect(navigation.querySelectorAll(".place-guests__segment-copy > strong")).toHaveLength(3);
    expect(navigation.querySelector("em")).toBeNull();
    expect(within(navigation).getByRole("tab", { name: /Coulisses,/ })).toHaveAttribute("title", expect.stringContaining("invités prêts"));
    expect(within(navigation).getByRole("tab", { name: /Sur scène,/ })).toHaveTextContent("3 / 3");
    fireEvent.click(within(navigation).getByRole("tab", { name: /File d’attente,/ }));
    expect(within(navigation).getByRole("tab", { name: /File d’attente,/ })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(within(navigation).getByRole("tab", { name: /Sur scène,/ }));
    expect(within(navigation).getByRole("tab", { name: /Sur scène,/ })).toHaveAttribute("aria-selected", "true");
  });

  it("identifie les quatre boutons principaux pour colorer chaque icône indépendamment de la vue active", () => {
    renderGuestPanel();
    const navigation = screen.getByRole("tablist", { name: "Surfaces du Studio" });
    for (const [label, surface] of [["Chat", "chat"], ["Mixeur", "mixer"], ["Place", "tools"], ["Invités", "guests"]]) {
      const tab = within(navigation).getByRole("tab", { name: label });
      expect(tab).toHaveAttribute("data-surface", surface);
      expect(tab.querySelector("svg")).not.toBeNull();
    }
  });

  it("garde Coulisses compacte avec son filtre et conserve le filtre des Invités", () => {
    renderGuestPanel();

    expect(screen.queryByText("Invités en coulisses")).not.toBeInTheDocument();
    const backstageHeader = document.querySelector<HTMLElement>("#place-guests-backstage .place-guests__section-head");
    expect(backstageHeader).not.toBeNull();
    expect(backstageHeader).toHaveClass("is-capacity-only");
    expect(backstageHeader!.querySelector(".place-guests__section-title")).toBeNull();
    expect(within(backstageHeader!).getByText("Scène complète")).toBeVisible();
    expect(within(backstageHeader!).getByText("Filtrer")).toBeVisible();
    expect(within(backstageHeader!).getByRole("button", { name: "Tout sélectionner" })).toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: /File d’attente,/ }));
    const queueHeader = document.querySelector<HTMLElement>("#place-guests-queue .place-guests__section-head");
    expect(queueHeader).toHaveClass("is-capacity-only", "is-queue-tools");
    expect(queueHeader!.querySelector(".place-guests__section-title")).toBeNull();
    expect(queueHeader!.querySelector(".place-guests-filter-trigger")).not.toBeNull();
    expect(within(queueHeader!).getByText("Filtrer")).toBeVisible();
    expect(within(queueHeader!).getByRole("button", { name: "Tout sélectionner" })).toBeVisible();
    expect(within(queueHeader!).getByRole("button", { name: "Ajouter" })).toBeVisible();
    expect(within(queueHeader!).getByRole("button", { name: "Fermer la file d’attente" })).toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: /Sur scène,/ }));
    const stageHeader = document.querySelector<HTMLElement>("#place-guests-stage .place-guests__section-head");
    expect(stageHeader).toHaveClass("is-capacity-only");
    expect(within(stageHeader!).getByText("3 / 3 sur scène")).toBeVisible();
    expect(within(stageHeader!).getByRole("button", { name: "Filtrer les invités" })).toBeVisible();
  });

  it("ouvre le filtre premium en tiroir et filtre réellement par niveau", () => {
    renderGuestPanel();
    fireEvent.click(screen.getByRole("tab", { name: /File d’attente,/ }));

    fireEvent.click(screen.getByRole("button", { name: "Filtrer les invités" }));
    const drawer = screen.getByRole("dialog", { name: "Filtrer les invités" });
    expect(drawer).toHaveClass("meewav-filter-panel");
    expect(drawer).toHaveClass("is-open");
    expect(within(drawer).getByText("Badge MeeWav")).toBeVisible();
    expect(within(drawer).getByText("Styles d’avatar")).toBeVisible();
    expect(within(drawer).getByText("Prêt pour le live")).toBeVisible();

    const levelFive = within(drawer).getByText("Niveau 5").closest<HTMLButtonElement>("button");
    expect(levelFive).not.toBeNull();
    fireEvent.click(levelFive!);
    fireEvent.click(within(drawer).getByRole("button", { name: /^Afficher .* profils$/ }));
    expect(drawer).not.toHaveClass("is-open");

    const queuePanel = document.querySelector<HTMLElement>("#place-guests-queue");
    expect(queuePanel).not.toBeNull();
    expect(within(queuePanel!).getByText("Miko Rêve")).toBeVisible();
    expect(within(queuePanel!).queryByText("Kenza Loba")).toBeNull();
  });

  it("remplace le tri Récentes par Tout sélectionner et permet la sélection groupée", () => {
    renderGuestPanel();
    fireEvent.click(screen.getByRole("tab", { name: /File d’attente,/ }));

    expect(screen.queryByRole("combobox", { name: "Trier la file" })).toBeNull();
    expect(screen.queryByText("Récentes")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tout sélectionner" }));

    expect(screen.getByRole("button", { name: "Tout désélectionner" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Désélectionner Kenza Loba" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Inviter la sélection/ })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Tout désélectionner" }));
    expect(screen.getByRole("button", { name: "Tout sélectionner" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("button", { name: /Inviter la sélection/ })).toBeNull();
  });

  it("permet aussi de tout sélectionner et désélectionner dans les Coulisses", () => {
    renderGuestPanel();

    fireEvent.click(screen.getByRole("button", { name: "Tout sélectionner" }));
    expect(screen.getByRole("button", { name: "Tout désélectionner" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Désélectionner Louna Saphir" })).toHaveAttribute("aria-pressed", "true");
    expect(document.querySelector("#place-guests-backstage .place-guests__bulk-bar")).toHaveTextContent("2 artistes sélectionnés");

    fireEvent.click(screen.getByRole("button", { name: "Tout désélectionner" }));
    expect(screen.getByRole("button", { name: "Tout sélectionner" })).toHaveAttribute("aria-pressed", "false");
    expect(document.querySelector("#place-guests-backstage .place-guests__bulk-bar")).toBeNull();
  });

  it("affiche les diagnostics courts et les deux mouvements Coulisses sans répéter la saturation", () => {
    const { onOpenProfile, onMessageProfile, onCollaborateProfile, onRemoveGuest } = renderGuestPanel();

    const louna = artistRow("Louna Saphir");
    expect(louna).toHaveClass("is-backstage", "is-connecting");
    expect(louna.querySelector(".place-guest-row__avatar img")).toHaveAttribute("src", expect.stringContaining("louna-saphir"));
    expect(louna.querySelector(".mw-grade-badge")).not.toBeNull();
    expect(within(louna).getByText("Violoncelliste")).toBeVisible();
    const lounaMain = louna.querySelector<HTMLElement>(".place-guest-row__main");
    const lounaUpper = louna.querySelector<HTMLElement>(".place-guest-row__upper");
    const lounaLower = louna.querySelector<HTMLElement>(".place-guest-row__lower");
    expect(lounaMain).not.toBeNull();
    expect(lounaUpper).not.toBeNull();
    expect(lounaLower).not.toBeNull();
    expect(lounaUpper).toContainElement(within(louna).getByRole("button", { name: "Voir le profil de Louna Saphir" }));

    const lounaStatus = louna.querySelector<HTMLElement>(".place-guest-row__status-pill");
    expect(lounaStatus).toHaveClass("is-ready");
    expect(within(lounaStatus!).getByText("Prêt")).toBeVisible();
    expect(within(louna).queryByText("Prête à monter sur scène")).toBeNull();
    expect(within(louna).getByLabelText("Connexion instable")).toHaveTextContent("Instable");
    const lounaMedia = louna.querySelector<HTMLElement>(".place-guest-row__media-details");
    expect(lounaMedia).toBeNull();
    expect(lounaLower).toContainElement(within(louna).getByRole("button", { name: "Voir la caméra de Louna Saphir" }));
    expect(lounaLower).toContainElement(within(louna).getByRole("button", { name: "Contacter Louna Saphir" }));
    expect(screen.getAllByText("Scène complète")).toHaveLength(1);
    const backstageActions = louna.querySelector<HTMLElement>(".place-guest-row__actions");
    expect(lounaLower).toContainElement(backstageActions);
    expect(within(backstageActions!).getAllByRole("button")).toHaveLength(2);
    const toQueue = within(backstageActions!).getByRole("button", { name: "Renvoyer vers la File d’attente Louna Saphir" });
    const toStage = within(backstageActions!).getByRole("button", { name: "Passer sur Scène Louna Saphir" });
    expect(toQueue).toHaveClass("is-cyan");
    expect(toQueue).toHaveAttribute("data-direction", "down");
    expect(toStage).toHaveClass("is-violet");
    expect(toStage).toHaveAttribute("data-direction", "up");
    expect(toStage).toBeDisabled();
    expect(within(louna).queryByText("Scène complète")).toBeNull();

    const aicha = artistRow("Aïcha Sol");
    const ready = aicha.querySelector<HTMLElement>(".place-guest-row__status-pill");
    expect(ready).toHaveClass("is-ready");
    expect(within(ready!).getByText("Prêt")).toBeVisible();
    expect(within(aicha).queryByText("Micro et caméra prêts")).toBeNull();
    expect(aicha.querySelector(".place-guest-row__media-details .is-off")).toBeNull();

    const menuSummary = within(louna).getByLabelText("Plus d’actions pour Louna Saphir");
    expect(menuSummary).toHaveClass("place-guest-row__menu-trigger");
    expect(menuSummary).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(menuSummary);
    let menu = screen.getByRole("menu", { name: "Actions pour Louna Saphir" });
    expect(menu.parentElement).toBe(document.body);
    expect(louna).not.toContainElement(menu);
    expect(menu).toHaveAttribute("data-placement", "below");
    expect(menuSummary).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Voir le profil" }));
    fireEvent.click(menuSummary);
    menu = screen.getByRole("menu", { name: "Actions pour Louna Saphir" });
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Message" }));
    fireEvent.click(menuSummary);
    menu = screen.getByRole("menu", { name: "Actions pour Louna Saphir" });
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Collaboration" }));
    fireEvent.click(menuSummary);
    menu = screen.getByRole("menu", { name: "Actions pour Louna Saphir" });
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Retirer du parcours" }));
    expect(onOpenProfile).toHaveBeenCalledWith("51000000-0000-4000-8000-000000000025");
    expect(onMessageProfile).toHaveBeenCalledWith("51000000-0000-4000-8000-000000000025");
    expect(onCollaborateProfile).toHaveBeenCalledWith(expect.objectContaining({ displayName: "Louna Saphir" }));
    expect(onRemoveGuest).toHaveBeenCalledWith(expect.objectContaining({ id: "guest-d" }));
  });

  it("limite File et Sur scène à leur mouvement cohérent et conserve le refus dans le menu", () => {
    const { onMoveGuest, onRemoveGuest } = renderGuestPanel();

    fireEvent.click(screen.getByRole("tab", { name: /File d’attente,/ }));
    const kenza = artistRow("Kenza Loba");
    expect(kenza).toHaveClass("is-queue");
    expect(kenza).not.toHaveClass("is-connecting");
    const queueStatus = kenza.querySelector<HTMLElement>(".place-guest-row__status-pill");
    expect(queueStatus).toHaveClass("is-queue");
    expect(queueStatus).toHaveTextContent(/\d+ min/);
    expect(queueStatus?.closest(".place-guest-row__status-line")).toHaveClass("is-corner");
    expect(queueStatus).toHaveAttribute("title", expect.stringMatching(/Demande · \d+ min/));
    expect(within(kenza).getByText("Micro et caméra prêts")).toBeVisible();
    const queueActions = kenza.querySelector<HTMLElement>(".place-guest-row__actions");
    expect(within(queueActions!).getAllByRole("button")).toHaveLength(1);
    const toBackstage = within(queueActions!).getByRole("button", { name: "Inviter en coulisses Kenza Loba" });
    expect(toBackstage).toHaveClass("is-amber");
    expect(toBackstage).toHaveAttribute("data-direction", "up");
    expect(within(toBackstage).getByText("Inviter en coulisses")).toBeVisible();
    fireEvent.click(toBackstage);
    expect(onMoveGuest).toHaveBeenCalledWith(expect.objectContaining({ id: "queue-1" }), "accepted");

    const queueMenuSummary = within(kenza).getByLabelText("Plus d’actions pour Kenza Loba");
    fireEvent.click(queueMenuSummary);
    const queueMenu = screen.getByRole("menu", { name: "Actions pour Kenza Loba" });
    expect(within(queueMenu).queryByRole("menuitem", { name: "Retirer du parcours" })).toBeNull();
    fireEvent.click(within(queueMenu).getByRole("menuitem", { name: "Refuser la demande" }));
    expect(onRemoveGuest).toHaveBeenCalledWith(expect.objectContaining({ id: "queue-1" }));

    fireEvent.click(screen.getByRole("tab", { name: /Sur scène,/ }));
    const lior = artistRow("Lior Benali");
    expect(lior).toHaveClass("is-onstage");
    const stageStatus = lior.querySelector<HTMLElement>(".place-guest-row__status-pill");
    expect(stageStatus).toHaveClass("is-stage");
    expect(stageStatus).toHaveTextContent("En scène");
    expect(stageStatus).toHaveAttribute("title", expect.stringMatching(/En scène depuis \d+ min/));
    expect(within(lior).getByRole("button", { name: "Couper le micro à l’antenne de Lior Benali" })).toBeVisible();
    const stageActions = lior.querySelector<HTMLElement>(".place-guest-row__actions");
    expect(within(stageActions!).getAllByRole("button")).toHaveLength(1);
    const stageToBackstage = within(stageActions!).getByRole("button", { name: "Envoyer en Coulisses Lior Benali" });
    expect(stageToBackstage).toHaveClass("is-amber");
    expect(stageToBackstage).toHaveAttribute("data-direction", "down");
    expect(within(stageToBackstage).getByText("Vers les coulisses")).toBeVisible();
    fireEvent.click(stageToBackstage);
    expect(onMoveGuest).toHaveBeenCalledWith(expect.objectContaining({ id: "guest-a" }), "backstage");

    const solis = artistRow("Solis Miro");
    expect(within(solis).getByRole("button", { name: "Couper le micro à l’antenne de Solis Miro" })).toHaveClass("is-active");
    expect(within(solis).getByRole("button", { name: "Couper la caméra de Solis Miro" })).toBeVisible();
  });

  it("branche les deux mouvements Coulisses quand une place est libre", () => {
    const { onMoveGuest } = renderGuestPanel({ stageFull: false });
    const aicha = artistRow("Aïcha Sol");

    fireEvent.click(within(aicha).getByRole("button", { name: "Renvoyer vers la File d’attente Aïcha Sol" }));
    fireEvent.click(within(aicha).getByRole("button", { name: "Passer sur Scène Aïcha Sol" }));

    expect(onMoveGuest).toHaveBeenCalledWith(expect.objectContaining({ id: "guest-e" }), "accepted");
    expect(onMoveGuest).toHaveBeenCalledWith(expect.objectContaining({ id: "guest-e" }), "onstage");
  });
});

it("sélectionne exactement les huit premiers invités depuis les chips", () => {
  renderGuestPanel();
  fireEvent.click(screen.getByRole("tab", { name: /File d’attente,/ }));
  for (const count of [16, 8, 4]) expect(screen.getByRole("button", { name: `Les ${count} premiers` })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Les 8 premiers" }));
  expect(screen.getByRole("button", { name: "Les 8 premiers" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getAllByRole("button", { name: /^Désélectionner / })).toHaveLength(8);
});


