import PlacePollToolPanel from "./panels/PlacePollToolPanel";
import RoomExperienceBoundary from "../switch-room/RoomExperienceBoundary";
import RoomVotePolicyLabel from "../voting/RoomVotePolicyLabel";
import CageResults from "./panels/CageResults";
import CageCompetitionWorkspace, { CageCommandBar, useCageCommand, type CageWorkspaceView } from "./panels/CageCompetitionWorkspace";
import CagePresentationControls from "./panels/CagePresentationControls";
import {
  Award,
  BarChart3,
  BookOpenText,
  CircleHelp,
  Clapperboard,
  Eye,
  Gift,
  Hand,
  HeartHandshake,
  Inbox,
  ListMusic,
  Mic2,
  MonitorUp,
  Rows3,
  SlidersHorizontal,
  Sparkles,
  Swords,
  Trophy,
  UsersRound,
  Vote,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { PlaceRoomState } from "../place/place.types";
import { createPortal } from "react-dom";
import { useWaveTransport } from "../wave-transport/WaveTransportProvider";
import PlaceToolsSwitch from "../place/PlaceToolsSwitch";
import { useStudioToolsLayout } from "../place/StudioToolsLayoutProvider";
import { canControlRoomTool, resolveRoomActorRole, roomToolConfig } from "./roomTools.config";
import { createRoomToolsFixture } from "./roomTools.fixtures";
import type { RoomPerson, RoomToolConfig, RoomToolId, SpecializedRoomId } from "./roomTools.types";
import { useRoomTools } from "./useRoomTools";
import CageBattlePanel from "./panels/CageBattlePanel";
import CageCompetitionPanel from "./panels/CageCompetitionPanel";
import CageVotePanel from "./panels/CageVotePanel";
import ClassQuestionsPanel from "./panels/ClassQuestionsPanel";
import ClassroomPanel from "./panels/ClassroomPanel";
import LogeDedicationPanel from "./panels/LogeDedicationPanel";
import LogeFaceToFacePanel from "./panels/LogeFaceToFacePanel";
import LogePreviewPanel from "./panels/LogePreviewPanel";
import LogeQuestionsPanel from "./panels/LogeQuestionsPanel";
import SceneEvaluationPanel from "./panels/SceneEvaluationPanel";
import SceneFundraiserPanel from "./panels/SceneFundraiserPanel";
import SceneProgramPanel from "./panels/SceneProgramPanel";
import ScenePrompterPanel from "./panels/ScenePrompterPanel";
import WaveGatePanel from "./panels/WaveGatePanel";
import WaveEmptyPanel from "./panels/WaveEmptyPanel";
import WaveVoteQueuePanel from "./panels/WaveVoteQueuePanel";
import { useClassroomAudioBridge } from "./useClassroomAudioBridge";
import "./room-tools.css";
import "./scene-tools.css";
import "./panels/scene-program.css";
import "./panels/scene-engagement.css";
import "./panels/scene-prompter.css";
import "./panels/cage-tools.css";
import "./panels/wave-gate-panel.css";
import "./panels/wave-control-panels.css";
import "./panels/wave-loop-canonical.css";
import "./panels/wave-gate-premium.css";
import "./panels/loge-questions.css";

const ICONS: Record<RoomToolConfig["icon"], typeof Gift> = {
  text: BookOpenText,
  list: ListMusic,
  evaluation: Award,
  fundraiser: HeartHandshake,
  focus: Eye,
  screen: MonitorUp,
  hand: Hand,
  seats: Rows3,
  audio: Inbox,
  sequence: SlidersHorizontal,
  trophy: Trophy,
  battle: Swords,
  vote: Vote,
  preview: Clapperboard,
  face: HeartHandshake,
  dedication: Mic2,
  question: CircleHelp,
  audience: UsersRound,
  poll: BarChart3,
  gift: Gift,
};

function actionErrorLabel(roomType: SpecializedRoomId, activeTool: RoomToolId, error: string) {
  if (roomType === "cage") {
    if (/cage_format_change_active/.test(error)) return "Termine le passage et son vote, puis libère la scène avant de changer de mode.";
    if (/cage_revision_conflict/.test(error)) return "La régie a été actualisée. Vérifie le programme puis réessaie.";
    if (/cage_format_reset_confirmation_required/.test(error)) return "Confirme le remplacement du programme actuel pour changer de mode.";
  }
  if (roomType !== "classe" || activeTool !== "classe-room") return `Action refusée : ${error.replace(/_/g, " ")}`;
  if (/microphone|audio/i.test(error)) return "Le micro de cet élève est coupé. Demandez-lui de l’activer avant de lui donner la parole.";
  if (/forbidden|permission/i.test(error)) return "Vous n’avez pas les droits nécessaires pour cette commande.";
  return "Cette commande n’a pas pu être appliquée. Réessayez dans un instant.";
}

export type RoomToolsShellProps = {
  roomType: SpecializedRoomId;
  room: PlaceRoomState;
  isHost: boolean;
  isGuest: boolean;
  onSpotlightStudent?: (person: import("./roomTools.types").RoomPerson) => Promise<void>;
  spotlightStudentId?: string | null;
  onOpenMixer: () => void;
  onOpenGuests?: () => void;
  onOpenGuestQueue?: () => void;
  momentVipPersonIds?: readonly string[];
  onMomentVipPersonIdsChange?: (ids: string[]) => void;
  logeGiftPanel?: import("react").ReactNode;
  onLaunchPoll?: import("./panels/PlacePollToolPanel").PlacePollToolPanelProps["onLaunchPoll"];
  onStopPoll?: () => Promise<void>;
  onOpenChat?: () => void;
  onGain?: (channelId: string, gain: number) => void;
  onPinHighlight?: (content: string, durationSeconds: 10 | 20 | 30) => Promise<void>;
  onClearHighlight?: () => Promise<void>;
};

const CAGE_TOOLS: Record<CageWorkspaceView, RoomToolId> = { bracket: "cage-competition", regie: "cage-regie", match: "cage-battle", vote: "cage-vote" };
const cageView = (tool: RoomToolId): CageWorkspaceView => tool === "cage-regie" ? "regie" : tool === "cage-battle" ? "match" : tool === "cage-vote" ? "vote" : "bracket";
export default function RoomToolsShell({ roomType, room, isHost, isGuest, onOpenGuests, onOpenGuestQueue, momentVipPersonIds: controlledMomentVipPersonIds, onMomentVipPersonIdsChange, logeGiftPanel, onLaunchPoll, onStopPoll, onOpenChat, onPinHighlight, onClearHighlight, onSpotlightStudent, spotlightStudentId }: RoomToolsShellProps) {
  const transport = useWaveTransport();
  const toolsLayout = useStudioToolsLayout();
  const configs = useMemo(() => roomToolConfig(roomType), [roomType]);
  const role = resolveRoomActorRole(roomType, isHost, isGuest, room.currentUserProfile?.role);
  const baseAccountId = room.currentUserProfile?.id ?? `anonymous-${roomType}`;
  const initialAccountId = useMemo(() => {
    if (room.source !== "demo" || role === "host" || role === "regisseur" || role === "teacher") return baseAccountId;
    const fixture = createRoomToolsFixture(roomType, room.id);
    if (role === "artist") return fixture.scene?.program.find((entry) => entry.status === "live")?.artistId ?? fixture.scene?.program[0]?.artistId ?? baseAccountId;
    if (role === "premium_participant") return fixture.classe?.seats.find((seat) => seat.person)?.person?.id ?? baseAccountId;
    if (role === "contributor") return fixture.wave?.submissions[0]?.contributor.id ?? baseAccountId;
    if (role === "competitor") {
      const match = fixture.cage?.matches.find((candidate) => candidate.id === fixture.cage?.currentMatchId);
      return match?.competitorA.id ?? baseAccountId;
    }
    return fixture.loge?.questions[0]?.author.id ?? baseAccountId;
  }, [baseAccountId, role, room.id, room.source, roomType]);
  const [resultTarget, setResultTarget] = useState<{matchId?:string}|null>(null);
  const [activeTool, setActiveTool] = useState<RoomToolId>(() => configs[0].id);
  const [momentVipPersonId, setMomentVipPersonId] = useState<string | null>(null);
  const logeWaitingGuests = useMemo<RoomPerson[]>(() => [...new Map([...room.queue, ...room.participants].filter(person => person.profile.id !== room.host.id).map(person => [person.profile.id, person])).values()].map((participant) => ({
    id: participant.profile.id,
    name: participant.profile.displayName,
    avatarUrl: participant.profile.avatarUrl,
    role: participant.profile.role || "Invité",
    gradeLevel: participant.profile.gradeLevel as RoomPerson["gradeLevel"],
    microphone: participant.isMicrophoneEnabled ? "ready" : "off",
    camera: participant.isCameraEnabled ? "ready" : "off",
  })), [room.queue, room.participants, room.host.id]);
  const [selectedClassStudentId, setSelectedClassStudentId] = useState<string | null>(null);
  const { state, busy, error, clearError, execute } = useRoomTools({ roomType, roomId: room.id, role, accountId: initialAccountId, source: room.source });
  const accountId = initialAccountId;
  const classroomAudio = useClassroomAudioBridge({
    roomId: room.id,
    source: room.source,
    authorized: isHost,
    execute,
    privateStudentId: state?.classe?.privateTalkStudentId,
    publicSpeakerStudentId: state?.classe?.publicCallStudentId ?? state?.classe?.activeSpeakerId,
  });

  useEffect(() => {
    if (!configs.some((tool) => tool.id === activeTool)) setActiveTool(configs[0].id);
  }, [activeTool, configs]);

  const activeConfig = configs.find((tool) => tool.id === activeTool) ?? configs[0];
  const controlPermissionDenied = !canControlRoomTool(activeConfig, role);
  const controlDisabled = busy || controlPermissionDenied;

  const sendCageCommand = useCageCommand(state, execute);
  const panel = (() => {
    if (!state) return error
      ? <div className="room-tools-shell__error" role="alert">{roomType === "wave"
        ? "La régie Wave normalisée n’est pas disponible sur ce déploiement. Aucun état de démonstration n’a été affiché à la place."
        : `Chargement impossible : ${error.replace(/_/g, " ")}`}</div>
      : <div className="room-tools-shell__loading"><Sparkles />Préparation des outils de la Room…</div>;
    switch (activeTool) {
      case "scene-prompter": return state.scene ? <ScenePrompterPanel scene={state.scene} role={role} disabled={controlDisabled} execute={execute} /> : null;
      case "scene-program": return state.scene ? <SceneProgramPanel scene={state.scene} disabled={controlDisabled} execute={execute} onOpenGuests={isHost ? onOpenGuests : undefined} onOpenPrompter={(textId) => {
        void execute({ type: "scene.prompter.select", textId }).then(() => setActiveTool("scene-prompter")).catch(() => undefined);
      }} /> : null;
      case "scene-evaluation": return state.scene ? <SceneEvaluationPanel scene={state.scene} disabled={controlDisabled} execute={execute} /> : null;
      case "scene-fundraiser": return state.scene ? <SceneFundraiserPanel scene={state.scene} disabled={controlDisabled} execute={execute} /> : null;
      case "classe-room": return state.classe ? <ClassroomPanel
        classe={state.classe}
        disabled={controlDisabled}
        execute={execute}
        selectedStudentId={selectedClassStudentId}
        onSelectStudent={setSelectedClassStudentId}
        onSpotlightStudent={onSpotlightStudent}
        spotlightStudentId={spotlightStudentId}
        audioBridge={classroomAudio}
        roomId={room.id}
        source={room.source}
        commandError={error}
        onClearCommandError={clearError}
      /> : null;
      case "classe-questions": return state.classe ? <ClassQuestionsPanel
        classe={state.classe}
        disabled={controlDisabled}
        execute={execute}
        onDisplayQuestion={onPinHighlight ? (question) => onPinHighlight(`Question de ${question.author.name} — ${question.text}`, 30) : undefined}
        onClearQuestion={onClearHighlight ? () => onClearHighlight() : undefined}
        onGiveFloor={(personId) => {
          setSelectedClassStudentId(personId);
          setActiveTool("classe-room");
        }}
      /> : null;
      case "wave-gate":
      case "wave-quarantine": return state.wave ? <WaveGatePanel key={activeTool} quarantine={activeTool === "wave-quarantine"} wave={state.wave} role={role} roomId={room.id} source={room.source} accountId={accountId} disabled={controlDisabled} execute={execute} /> : null;
      // Only the shared dock is present while these panels are rebuilt.
      case "wave-sequencer": return state.wave ? <WaveVoteQueuePanel wave={state.wave} role={role} source={room.source} disabled={controlDisabled} execute={execute} /> : null;
      case "wave-orchestra": return <WaveEmptyPanel label="Beat" wave={state.wave}
        onReplacementOpened={() => setActiveTool("wave-sequencer")}
        source={room.source} host={{ id: room.host.id, name: room.source === "demo" ? "Puff" : room.host.displayName, avatarUrl: room.host.avatarUrl, role: room.host.role, microphone: "ready", camera: "ready" }}
        hostName={room.source === "demo" ? "Puff" : room.host.displayName}
        avatarUrl={room.source === "demo" ? "/assets/orbit/founder-puff.png" : room.host.avatarUrl}
        disabled={controlDisabled} volumeDisabled={controlPermissionDenied} execute={execute} />;
      case "cage-competition":
      case "cage-regie":
      case "cage-battle":
      case "cage-vote": return state.cage?.runtime ? <CageCompetitionWorkspace key={state.cage.runtime.config.format}
        runtime={state.cage.runtime} view={cageView(activeTool)} disabled={busy}
        isControl={role === "host" || role === "regisseur"} accountId={accountId}
        send={sendCageCommand} onOpenGuests={onOpenGuests} onResults={(matchId) => setResultTarget({matchId})}
        onView={(view) => setActiveTool(CAGE_TOOLS[view])}
      /> : <div className="room-tools-shell__loading">La configuration de cette compétition n’est pas encore disponible.</div>;
      case "loge-preview": return state.loge ? <LogePreviewPanel roomId={room.id} source={room.source} loge={state.loge} disabled={controlDisabled} execute={execute} /> : null;
      case "loge-face-to-face": return state.loge ? <LogeFaceToFacePanel loge={state.loge} disabled={controlDisabled} execute={execute} /> : null;
      case "loge-dedication": return state.loge ? <LogeDedicationPanel loge={state.loge} disabled={controlDisabled} execute={execute} waitingGuests={logeWaitingGuests} initialFanId={controlledMomentVipPersonIds?.[0] ?? momentVipPersonId} onFanChange={id => { setMomentVipPersonId(id); onMomentVipPersonIdsChange?.([id]); }} roomId={room.id} source={room.source} /> : null;
      case "loge-audience-choice": return onLaunchPoll && onStopPoll && onOpenChat ? <PlacePollToolPanel room={room} disabled={controlDisabled} onLaunchPoll={onLaunchPoll} onStopPoll={onStopPoll} onOpenChat={onOpenChat} /> : null;
      case "gift": return logeGiftPanel;
      case "loge-questions": return state.loge ? <LogeQuestionsPanel loge={state.loge} role={role} accountId={accountId} disabled={controlDisabled} execute={execute} source={room.source} authenticated={Boolean(room.currentUserProfile)} onDisplayQuestion={onPinHighlight ? (question) => onPinHighlight(`Question de ${question.author.name} — ${question.text}`, 30) : undefined} onClearQuestion={onClearHighlight ? (question) => room.highlightText === `Question de ${question.author.name} — ${question.text}` ? onClearHighlight() : Promise.resolve() : undefined} onOpenMomentVip={(personId) => { setMomentVipPersonId(personId); onMomentVipPersonIdsChange?.([personId]); setActiveTool("loge-dedication"); }} /> : null;
    }
  })();

  useEffect(() => { transport?.setContext(activeTool); }, [activeTool, transport]);

  const roomToolLabels: Record<SpecializedRoomId, string> = {
    scene: "Outils de La Scène",
    classe: "Outils de La Classe",
    wave: "Outils de La Wave",
    cage: "Outils de La Cage",
    loge: "Outils de La Loge",
  };
  const toolRail = <PlaceToolsSwitch
      activeTool={activeTool}
      ariaLabel={roomToolLabels[roomType]}
      idPrefix="room-tool-tab"
      items={configs.map((tool) => {
        const Icon = ICONS[tool.icon];
        const format = state?.cage?.runtime?.config.format;
        const label = roomType === "cage" && tool.id === "cage-competition" ? format === "open-mic-battle" ? "Participants" : format === "open-mic" ? "Programme" : format === "championship" ? "Classement" : "Bracket"
          : roomType === "cage" && format === "open-mic" && tool.id === "cage-battle" ? "Passage"
          : roomType === "cage" && format === "open-mic" && tool.id === "cage-vote" ? "Vote" : tool.label;
        return { id: tool.id, label, shortLabel: label === tool.label ? tool.shortLabel : label, icon: <Icon aria-hidden="true" />, controlsId: `room-tool-panel-${tool.id}` };
      })}
      onSelect={(tool) => { setResultTarget(null); setActiveTool(tool); }}
      semantics="tabs"
    />;
  const shellError = error && !(roomType === "classe" && activeTool === "classe-room")
    ? <p className="room-tools-shell__error" role="alert">{actionErrorLabel(roomType, activeTool, error)}</p>
    : null;
  const panelSection = <section className="room-tools-shell__panel" id={`room-tool-panel-${activeTool}`} role="tabpanel" aria-label={activeConfig.label} aria-labelledby={`room-tool-tab-${activeTool}`}><RoomVotePolicyLabel roomId={room.id} source={room.source} accountId={accountId}/>{shellError}{roomType === "cage" && state?.cage?.runtime && resultTarget ? <CageResults runtime={state.cage.runtime} matchId={resultTarget.matchId} busy={busy} send={role === "host" || role === "regisseur" ? sendCageCommand : undefined} onBack={() => setResultTarget(null)} /> : panel}</section>;
  const toolPanel = roomType === "cage" ? <div className="cage-tools-body">{state?.cage?.runtime && (role === "host" || role === "regisseur") ? <CagePresentationControls runtime={state.cage.runtime} demo={room.source === "demo"} busy={busy} send={sendCageCommand} onConfigured={() => { setResultTarget(null); setActiveTool("cage-competition"); }} /> : null}{panelSection}{state?.cage?.runtime ? <CageCommandBar
    runtime={state.cage.runtime} view={cageView(activeTool)} disabled={busy}
    isControl={role === "host" || role === "regisseur"} accountId={accountId} send={sendCageCommand}
    onOpenGuests={onOpenGuests}
    onResults={(matchId) => setResultTarget({matchId})}
    onView={(view) => setActiveTool(CAGE_TOOLS[view])}
  /> : null}</div> : panelSection;
  const waveToolSkinClass = " is-wave-tool-skin";
  return <div className={`room-tools-shell is-${roomType} place-tools-console${waveToolSkinClass}`} data-room-tools={roomType} data-active-tool={activeTool}>
    {toolsLayout?.nav ? createPortal(<div className={`room-tools-shell is-${roomType} place-tools-console${waveToolSkinClass}`}>{toolRail}</div>, toolsLayout.nav) : toolRail}
    {toolsLayout?.body ? createPortal(<div className={`room-tools-shell is-${roomType} place-tools-console${waveToolSkinClass}`} data-active-tool={activeTool}><RoomExperienceBoundary onChat={() => onOpenChat?.()}>{toolPanel}</RoomExperienceBoundary></div>, toolsLayout.body) : toolPanel}
  </div>;
}
