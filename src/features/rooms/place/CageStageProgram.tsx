import {
  AlertTriangle,
  CameraOff,
  CircleDot,
  Crown,
  Heart,
  Pause,
  Radio,
  Swords,
  Trophy,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cageBattleWinCount } from "../tools/cageCompetition";
import { resolveRoomActorRole } from "../tools/roomTools.config";
import {
  cageEntrants,
  cageEvent,
  cageOpenMicEntries,
  normalizedCageFormat,
} from "../tools/cageTools.domain";
import type { CageState, RoomPerson } from "../tools/roomTools.types";
import { useRoomTools } from "../tools/useRoomTools";
import type { PlaceLiveKitVideoTrack } from "./placeLiveKit.service";
import type { PlaceRoomState } from "./place.types";
import {
  inferParticipantAspectRatio,
  resolveParticipantSource,
  type PlaceStageAspectRatio,
  type PlaceStageParticipant,
} from "./placeStageLayoutEngine";
import PlaceStageLayoutTile from "./placeStageLayoutTile";
import { formatCageStageTime, useCageStageClock } from "./cageStageClock";
import { resolveCageDuelMediaLayout } from "./cageDuelMediaLayout";
import "./cage-portrait-duel.css";
import { cageDemoMedia } from "./cageDemoMedia";
import { useRuntime } from "../../../runtime/RuntimeProvider";

export { cageStageRemaining } from "./cageStageClock";

type CageStageProgramProps = {
  composition?: "ensemble" | "focus" | "solo";
  focusedParticipantId?: string;
  feedSelectionDisabled?: boolean;
  onSelectFeed?: (participantId: string) => void;
  room: PlaceRoomState;
  isHost: boolean;
  isGuest: boolean;
  onStage: PlaceStageParticipant[];
  liveKitVideoTracks: PlaceLiveKitVideoTrack[];
  useRtcVideo: boolean;
  programMuted: boolean;
  playbackVolume?: number;
  onOpenProfile: (profileId: string) => void;
  onPortraitDuelChange?: (portrait: boolean) => void;
};

type CageStageProgramViewProps = Omit<CageStageProgramProps, "isHost" | "isGuest"> & {
  cage: CageState | null;
  isHost?: boolean;
};

type FeedAssignment = {
  participant: PlaceStageParticipant;
  sourceParticipantId: string;
  trackIdentity: string;
  exact: boolean;
};

const compactMetric = new Intl.NumberFormat("fr-FR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatMetric(value: number) {
  return compactMetric.format(Math.max(0, value));
}

function feedDetectionKey(matchId: string, side: "A" | "B", assignment: FeedAssignment | null) {
  if (!assignment) return `${matchId}:${side}:missing:none`;
  const sourceId = resolveParticipantSource(assignment.participant, undefined, "program")?.id ?? "primary";
  return `${matchId}:${side}:${assignment.participant.id}:${sourceId}`;
}

const BATTLE_STATUS_LABEL: Record<CageState["battleStatus"], string> = {
  ready: "PRÊT À LANCER",
  countdown: "DÉCOMPTE",
  "live-a": "EN DIRECT",
  "live-b": "EN DIRECT",
  paused: "EN PAUSE",
  incident: "INCIDENT",
  done: "MANCHES TERMINÉES",
};

function virtualParticipant(person: RoomPerson, source: PlaceStageParticipant, preservePoster: boolean): PlaceStageParticipant {
  return {
    ...source,
    id: `cage-feed-${person.id}-${source.id}`,
    imageUrl: preservePoster ? source.imageUrl : undefined,
    videoSources: preservePoster
      ? source.videoSources
      : source.videoSources?.map((videoSource) => ({ ...videoSource, imageUrl: undefined })),
    profile: {
      ...source.profile,
      id: person.id,
      displayName: person.name,
      role: person.role,
      avatarUrl: person.avatarUrl,
    },
    isCameraEnabled: source.isCameraEnabled,
    isMicrophoneEnabled: source.isMicrophoneEnabled,
  };
}

export function resolveCageFeed(
  person: RoomPerson,
  side: "A" | "B",
  onStage: PlaceStageParticipant[],
  demoFallback: boolean,
  variedDemo = false,
): FeedAssignment | null {
  const exact = onStage.find((participant) => participant.profile.id === person.id || participant.id === person.id);
  if (!demoFallback) return exact ? { participant: virtualParticipant(person, exact, true), sourceParticipantId: exact.id, trackIdentity: exact.profile.id, exact: true } : null;
  const media = cageDemoMedia(person.id, side, variedDemo);
  const source: PlaceStageParticipant = exact ?? {
    id: `cage-guest-${person.id}`, profile: { id: person.id, displayName: person.name, handle: "", role: person.role, city: "", avatarUrl: person.avatarUrl, gradeLevel: person.gradeLevel ?? 1 },
    joinedAt: "", status: "onstage", isSpeaking: false, latencyMs: 35,
    isCameraEnabled: person.camera !== "off", isMicrophoneEnabled: person.microphone !== "off",
  };
  return { participant: virtualParticipant(person, { ...source, videoUrl: media.videoUrl, videoSources: [media], imageUrl: undefined }, true),
    sourceParticipantId: source.id, trackIdentity: person.id, exact: Boolean(exact) };
}

function activeSide(cage: CageState): "A" | "B" | null {
  if (cage.battleStatus === "live-a") return "A";
  if (cage.battleStatus === "live-b") return "B";
  if (cage.battleStatus === "paused" || cage.battleStatus === "incident") return cage.battleActiveSide ?? null;
  return null;
}

function FeedTile({
  side,
  person,
  assignment,
  live,
  winner,
  battleWins = 0,
  score,
  liveKitVideoTracks,
  useRtcVideo,
  muted,
  playbackVolume = 1,
  aspectRatio = null,
  portraitPresentation = false,
  streamLive = false,
  audienceCount = 0,
  supportCount = 0,
  solo = false,
  cleanProgram = false,
  onAspectRatio,
  onOpenProfile,
}: {
  side: "A" | "B";
  person: RoomPerson;
  assignment: FeedAssignment | null;
  live: boolean;
  winner: boolean;
  battleWins?: number;
  score: number | null;
  liveKitVideoTracks: PlaceLiveKitVideoTrack[];
  useRtcVideo: boolean;
  muted: boolean;
  playbackVolume?: number;
  aspectRatio?: PlaceStageAspectRatio | null;
  portraitPresentation?: boolean;
  streamLive?: boolean;
  audienceCount?: number;
  supportCount?: number;
  solo?: boolean;
  cleanProgram?: boolean;
  onAspectRatio?: (ratio: PlaceStageAspectRatio) => void;
  onOpenProfile: (profileId: string) => void;
  onPortraitDuelChange?: (portrait: boolean) => void;
}) {
  const desktopFeedDrag = useRuntime().isDesktop && assignment?.exact && assignment.participant.status === "onstage";
  const liveKitVideoTrack = assignment && useRtcVideo
    ? liveKitVideoTracks.find((item) => item.source === "camera" && !item.muted && item.participantIdentity === assignment.trackIdentity)
    : undefined;
  const noOp = () => undefined;

  return <article className={`cage-stage-feed is-${side.toLowerCase()}${live ? " is-live" : ""}${winner ? " is-winner" : ""}${portraitPresentation ? " is-portrait-presentation" : ""}`} data-side={side} data-feed={assignment?.exact ? "exact" : assignment ? "demo" : "missing"} data-media-format={aspectRatio ?? "unknown"} data-participant-id={desktopFeedDrag ? assignment.sourceParticipantId : undefined} draggable={Boolean(desktopFeedDrag)}>
    <div className="cage-stage-feed__media">
      {assignment ? <PlaceStageLayoutTile
        participant={assignment.participant}
        aspectRatio={aspectRatio ?? undefined}
        primary
        selected={false}
        program={live}
        preview={false}
        director={false}
        canDirectProgram={false}
        programMutationPending={false}
        playbackVolume={playbackVolume}
        muted={muted || !live}
        renderAudience="program"
        selectionAudience="program"
        liveKitVideoTrack={liveKitVideoTrack}
        presentationOnly
        onSelect={noOp}
        onPutOnAir={noOp}
        onOpenSolo={noOp}
        onOpenProfile={onOpenProfile}
        onSourceChange={noOp}
        onAspectRatio={(_participantId, _sourceId, ratio) => onAspectRatio?.(ratio)}
      /> : <div className="cage-stage-feed__missing"><img src={person.avatarUrl} alt="" /><CameraOff aria-hidden="true" /><strong>Flux caméra en attente</strong><small>L’adversaire doit être envoyé sur scène.</small></div>}
    </div>
    <div className="cage-stage-feed__shade" aria-hidden="true" />
    {portraitPresentation ? <>
      <button type="button" className="cage-stage-feed__portrait-identity" onClick={() => onOpenProfile(person.id)} aria-label={`Voir le profil de ${person.name}`}>
        <strong>{person.name}</strong>
        <small>{person.role}</small>
      </button>
      {assignment && streamLive ? <span className="cage-stage-feed__portrait-live"><i aria-hidden="true" />EN DIRECT</span> : null}
      <span className="cage-stage-feed__portrait-metrics" aria-label={`${audienceCount} participants, ${supportCount} soutiens`}>
        <span><Users aria-hidden="true" /><b>{formatMetric(audienceCount)}</b><small>participants</small></span>
        <span><Heart aria-hidden="true" /><b>{formatMetric(supportCount)}</b></span>
      </span>
    </> : null}
    {cleanProgram ? null : <span className="cage-stage-feed__side"><b>{solo ? <Radio aria-hidden="true" /> : <img src={person.avatarUrl} alt="" />}</b>{live ? <><i />{solo ? "SUR SCÈNE" : "À L’ANTENNE"}</> : solo ? "PASSAGE" : "ADVERSAIRE"}</span>}
    {battleWins > 0 ? <span className="cage-stage-feed__battle-wins" role="status" aria-label={`${person.name} : ${battleWins} duel${battleWins > 1 ? "s" : ""} gagné${battleWins > 1 ? "s" : ""}`} title={`${battleWins} victoire${battleWins > 1 ? "s" : ""} en Open Mic Battle`}><Crown aria-hidden="true" /><b aria-hidden="true">{battleWins}</b></span> : null}
    {winner && !cleanProgram ? <span className="cage-stage-feed__winner"><Crown aria-hidden="true" /> VAINQUEUR</span> : null}
    {!cleanProgram ? <button type="button" className="cage-stage-feed__identity" onClick={() => onOpenProfile(person.id)} aria-label={`Voir le profil de ${person.name}`}>
        <img src={person.avatarUrl} alt="" />
        <span><small>{person.role}</small><strong>{person.name}</strong></span>
        {score === null ? null : <b>{score}</b>}
      </button> : null}
  </article>;
}

function DuelProgram({ cage, room, onStage, liveKitVideoTracks, useRtcVideo, programMuted, playbackVolume = 1, onOpenProfile, onPortraitDuelChange, composition = "ensemble", focusedParticipantId, feedSelectionDisabled, onSelectFeed, isHost }: CageStageProgramViewProps & { cage: CageState }) {
  const [detectedAspectByFeed, setDetectedAspectByFeed] = useState<Record<string, PlaceStageAspectRatio>>({});
  const match = cage.matches.find((candidate) => candidate.id === (cage.runtime ? cage.runtime.activeMatchId : cage.currentMatchId));
  if (!match) return <UnmatchedProgram room={room} onStage={onStage} liveKitVideoTracks={liveKitVideoTracks} useRtcVideo={useRtcVideo} programMuted={programMuted} playbackVolume={playbackVolume} onOpenProfile={onOpenProfile} cage={cage} isHost={isHost} />;

  if (cage.runtime?.config.format === "open-mic-battle" && match.status === "done") {
    const retained = onStage.filter((person) => person.profile.id === match.winnerId);
    return <UnmatchedProgram room={room} onStage={retained} liveKitVideoTracks={liveKitVideoTracks} useRtcVideo={useRtcVideo} programMuted={programMuted} playbackVolume={playbackVolume} onOpenProfile={onOpenProfile} cage={cage} isHost={isHost} />;
  }
  const currentSide = activeSide(cage);
  const revealed = !cage.resultsHidden && match.status === "done";
  const winnerId = revealed ? match.winnerId : undefined;
  const feeds = [...onStage, ...room.participants];
  const variedDemo = cage.demoPresentation?.version === 2;
  const assignmentA = resolveCageFeed(match.competitorA, "A", feeds, room.source === "demo", variedDemo);
  const assignmentB = resolveCageFeed(match.competitorB, "B", feeds, room.source === "demo", variedDemo);
  const selectedB = Boolean(assignmentB && (assignmentB.sourceParticipantId === focusedParticipantId || !assignmentA));
  const selectedSide = selectedB ? "B" : "A";
  const feedKeyA = feedDetectionKey(match.id, "A", assignmentA);
  const feedKeyB = feedDetectionKey(match.id, "B", assignmentB);
  const aspectA = assignmentA
    ? detectedAspectByFeed[feedKeyA] ?? inferParticipantAspectRatio(assignmentA.participant)
    : null;
  const aspectB = assignmentB
    ? detectedAspectByFeed[feedKeyB] ?? inferParticipantAspectRatio(assignmentB.participant)
    : null;
  const mediaLayout = resolveCageDuelMediaLayout([aspectA, aspectB]);
  const portraitPresentation = mediaLayout === "portrait-duel";
  const streamsLive = room.status === "live" && room.broadcastStatus === "active";
  const reportAspect = (feedKey: string, ratio: PlaceStageAspectRatio) => {
    setDetectedAspectByFeed((current) => current[feedKey] === ratio
      ? current
      : { ...current, [feedKey]: ratio });
  };

  return <section className={`cage-stage-program is-duel is-${cage.battleStatus} is-${mediaLayout}`} data-composition={composition} data-focused-side={selectedSide} data-match-id={match.id} data-battle-status={cage.battleStatus} data-active-side={currentSide ?? "none"} data-media-layout={mediaLayout} data-feed-a-format={aspectA ?? "unknown"} data-feed-b-format={aspectB ?? "unknown"} aria-label={`Réalisation vidéo spéciale Cage : ${match.competitorA.name} face à ${match.competitorB.name}`}>
    <CagePortraitSignal portrait={portraitPresentation} onChange={onPortraitDuelChange} />
    <div className="cage-stage-program__duel-grid">
      <FeedTile side="A" person={match.competitorA} assignment={assignmentA} live={currentSide === "A"} winner={winnerId === match.competitorA.id} battleWins={cageBattleWinCount(cage.runtime, match.competitorA.id)} score={revealed ? match.scoreA : null} liveKitVideoTracks={liveKitVideoTracks} useRtcVideo={useRtcVideo} muted={programMuted} playbackVolume={playbackVolume} aspectRatio={aspectA} portraitPresentation={portraitPresentation} streamLive={streamsLive} audienceCount={room.participantsCount} supportCount={room.likesCount} cleanProgram onAspectRatio={(ratio) => reportAspect(feedKeyA, ratio)} onOpenProfile={onOpenProfile} />
      <FeedTile side="B" person={match.competitorB} assignment={assignmentB} live={currentSide === "B"} winner={winnerId === match.competitorB.id} battleWins={cageBattleWinCount(cage.runtime, match.competitorB.id)} score={revealed ? match.scoreB : null} liveKitVideoTracks={liveKitVideoTracks} useRtcVideo={useRtcVideo} muted={programMuted} playbackVolume={playbackVolume} aspectRatio={aspectB} portraitPresentation={portraitPresentation} streamLive={streamsLive} audienceCount={room.participantsCount} supportCount={room.likesCount} cleanProgram onAspectRatio={(ratio) => reportAspect(feedKeyB, ratio)} onOpenProfile={onOpenProfile} />
    </div>
    {onSelectFeed && composition !== "ensemble" ? (
      <nav className="cage-stage-program__selection" aria-label={composition === "solo" ? "Vidéo en solo" : "Vidéo à mettre en avant"}>
        {([
          ["A", match.competitorA, assignmentA],
          ["B", match.competitorB, assignmentB],
        ] as const).map(([side, person, assignment]) => (
          <button
            key={side}
            type="button"
            aria-pressed={selectedSide === side}
            disabled={!assignment || feedSelectionDisabled}
            onClick={() => assignment && onSelectFeed(assignment.sourceParticipantId)}
          >
            {person.name}
          </button>
        ))}
      </nav>
    ) : null}
    <span className="cage-stage-program__duel-axis" aria-hidden="true"><i /><b>VS</b></span>

    <footer className="cage-stage-program__footer">
      <span><Radio aria-hidden="true" />PROGRAM · FACE-À-FACE</span>
      {cage.votingOpen ? <strong><CircleDot aria-hidden="true" /> VOTE OUVERT</strong> : revealed && winnerId ? <strong className="is-result"><Trophy aria-hidden="true" /> VERDICT RÉVÉLÉ</strong> : <small>Les scores restent masqués jusqu’au verdict.</small>}
    </footer>

    {cage.battleStatus === "paused" ? <div className="cage-stage-program__interruption is-pause"><Pause aria-hidden="true" /><span><small>RÉGIE</small><strong>Match en pause</strong></span></div> : null}
    {cage.battleStatus === "incident" ? <div className="cage-stage-program__interruption is-incident"><AlertTriangle aria-hidden="true" /><span><small>ALERTE RÉGIE</small><strong>Incident en cours</strong></span></div> : null}
  </section>;
}

function UnmatchedProgram({ room, cage, onStage, liveKitVideoTracks, useRtcVideo, programMuted, playbackVolume = 1, onOpenProfile, isHost }: CageStageProgramViewProps & { cage: CageState }) {
  const guests = onStage.filter((person) => person.status !== "host").slice(0, 2);
  const visible = guests.length ? guests : onStage.filter((person) => person.status === "host").slice(0, 1);
  if (!visible.length) return <EmptyProgram title="La scène est prête" detail={isHost ? "Appelle les artistes depuis les Invités. Le tournoi attend tes choix." : "Les artistes se préparent. Le prochain passage va commencer."} />;
  const aspects = visible.map(inferParticipantAspectRatio);
  const layout = resolveCageDuelMediaLayout(aspects);
  return <section className={`cage-stage-program is-duel is-${layout}`} data-composition={visible.length === 1 ? "solo" : "ensemble"} data-focused-side="A" data-feed-a-format={aspects[0]} data-feed-b-format={aspects[1]} aria-label="Retours vidéo avant la rencontre">
    <div className="cage-stage-program__duel-grid">{visible.map((participant, index) => {
      const side = index === 0 ? "A" : "B";
      const person: RoomPerson = { id: participant.profile.id, name: participant.profile.displayName, avatarUrl: participant.profile.avatarUrl, role: participant.profile.role,
        camera: participant.isCameraEnabled ? "ready" : "off", microphone: participant.isMicrophoneEnabled ? "ready" : "off" };
      return <FeedTile key={person.id} side={side} person={person} assignment={{ participant, sourceParticipantId: participant.id, trackIdentity: person.id, exact: true }} live={false} winner={false} battleWins={participant.status === "host" ? 0 : cageBattleWinCount(cage.runtime, person.id)} score={null}
        liveKitVideoTracks={liveKitVideoTracks} useRtcVideo={useRtcVideo} muted={programMuted} playbackVolume={playbackVolume} cleanProgram aspectRatio={aspects[index]} portraitPresentation={layout === "portrait-duel"}
        streamLive={room.status === "live"} onOpenProfile={onOpenProfile} />;
    })}</div>
    <footer className="cage-stage-program__footer"><span><Radio />{isHost ? "RETOURS VIDÉO" : "EN DIRECT"}</span><small>{!isHost ? "Le prochain passage se prépare." : cage.runtime?.lockedAt ? "La régie attend ta mise en scène." : "Construis ton tournoi depuis les Invités et le Bracket."}</small></footer>
  </section>;
}

function OpenMicProgram({ cage, room, onStage, liveKitVideoTracks, useRtcVideo, programMuted, playbackVolume = 1, onOpenProfile }: CageStageProgramViewProps & { cage: CageState }) {
  const event = cageEvent(cage);
  const entries = cageOpenMicEntries(cage);
  const people = cageEntrants(cage);
  const entry = entries.find((candidate) => candidate.status === "live")
    ?? entries.find((candidate) => candidate.status === "ready")
    ?? entries.find((candidate) => candidate.status === "scheduled")
    ?? entries[0];
  const person = people.find((candidate) => candidate.id === entry?.personId);
  const { remaining } = useCageStageClock(cage);
  const assignment = person ? resolveCageFeed(person, "A", onStage, room.source === "demo") : null;
  const official = cage.runtime?.openMicEntries?.find((passage) => passage.id === cage.runtime?.activeEntryId);
  if (cage.runtime && (!official || !["ON_STAGE", "IN_PROGRESS", "PAUSED"].includes(official.status))) return <EmptyProgram title="Le prochain artiste se prépare" detail="Le programme de l’Open Mic reprend dès que l’artiste est prêt." />;
  if (!entry || !person) return <EmptyProgram title="Open mic en attente" detail="Ajoute un artiste au Programme puis prépare son passage dans la Régie." />;

  return <section className={`cage-stage-program is-open-mic is-${cage.battleStatus}`} data-entry-id={entry.id} data-battle-status={cage.battleStatus} aria-label={`Réalisation vidéo spéciale Cage : passage de ${person.name}`}>
    <header className="cage-stage-program__header">
      <span className="cage-stage-program__event"><Radio aria-hidden="true" /><span><small>{event.discipline}</small><strong>{event.title}</strong></span></span>
      <span className={`cage-stage-program__status is-${cage.battleStatus}`}><i />{BATTLE_STATUS_LABEL[cage.battleStatus]}</span>
      <span className="cage-stage-program__round"><small>OPEN MIC</small><strong>PASSAGE {entry.order}/{entries.length}</strong></span>
    </header>
    <div className="cage-stage-program__solo-feed"><FeedTile side="A" person={person} assignment={assignment} live={entry.status === "live"} winner={false} score={entry.status === "done" ? entry.score ?? null : null} liveKitVideoTracks={liveKitVideoTracks} useRtcVideo={useRtcVideo} muted={programMuted} playbackVolume={playbackVolume} solo onOpenProfile={onOpenProfile} /></div>
    <div className="cage-stage-program__solo-clock"><small>{entry.slot}</small><time>{formatCageStageTime(remaining)}</time><strong>{entry.status === "live" ? "SUR SCÈNE" : "PRÊT"}</strong></div>
    <footer className="cage-stage-program__footer"><span><Radio aria-hidden="true" />PROGRAM · OPEN MIC</span><small>Passage {entry.order} sur {entries.length}</small></footer>
  </section>;
}

function CagePortraitSignal({ portrait, onChange }: { portrait: boolean; onChange?: (portrait: boolean) => void }) {
  useEffect(() => { onChange?.(portrait); return () => onChange?.(false); }, [portrait, onChange]);
  return null;
}

function EmptyProgram({ title, detail }: { title: string; detail: string }) {
  return <section className="cage-stage-program is-empty" aria-label="Réalisation vidéo spéciale Cage en attente"><span><Swords aria-hidden="true" /></span><small>CAGE · PROGRAM</small><strong>{title}</strong><p>{detail}</p></section>;
}

export function CageStageProgramView(props: CageStageProgramViewProps) {
  const { cage } = props;
  if (!cage) return <EmptyProgram title="Synchronisation de la Régie…" detail="Le retour vidéo va se caler sur la rencontre active." />;
  return normalizedCageFormat(cage.format) === "open-mic"
    ? <OpenMicProgram {...props} cage={cage} />
    : <DuelProgram {...props} cage={cage} />;
}

export default function CageStageProgram({ room, isHost, isGuest, onStage, liveKitVideoTracks, useRtcVideo, programMuted, playbackVolume = 1, onOpenProfile, onPortraitDuelChange, composition, focusedParticipantId, feedSelectionDisabled, onSelectFeed }: CageStageProgramProps) {
  const role = resolveRoomActorRole("cage", isHost, isGuest, room.currentUserProfile?.role);
  const accountId = room.currentUserProfile?.id ?? `anonymous-cage-${room.id}`;
  const { state, error } = useRoomTools({ roomType: "cage", roomId: room.id, role, accountId, source: room.source });
  const [preview, setPreview] = useState<CageState | null>(null);
  useEffect(() => {
    if (room.source !== "demo" || isHost) return;
    const receive = (event: Event) => setPreview((event as CustomEvent<CageState | null>).detail);
    window.addEventListener("cage-viewer-preview-state", receive);
    return () => window.removeEventListener("cage-viewer-preview-state", receive);
  }, [room.source, isHost]);
  const viewProps = useMemo(() => ({ room, onStage, liveKitVideoTracks, useRtcVideo, programMuted, playbackVolume, onOpenProfile, onPortraitDuelChange, composition, focusedParticipantId, feedSelectionDisabled, onSelectFeed }), [liveKitVideoTracks, onOpenProfile, onStage, programMuted, playbackVolume, room, useRtcVideo, onPortraitDuelChange, composition, focusedParticipantId, feedSelectionDisabled, onSelectFeed]);
  if (error && !state?.cage) return <EmptyProgram title="Régie vidéo indisponible" detail="La Cage n’a pas pu synchroniser la rencontre active. Réessaie dans quelques instants." />;
  return <CageStageProgramView {...viewProps} isHost={isHost} cage={preview ?? state?.cage ?? null} />;
}
