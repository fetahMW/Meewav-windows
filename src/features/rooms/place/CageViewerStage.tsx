import { CameraOff, Mic, Pause, Radio, Swords, TriangleAlert, UserRound } from "lucide-react";
import type { CageState, RoomPerson } from "../tools/roomTools.types";
import type { CageStageProgramProps } from "./CageStageProgram";
import { resolveCageFeed, type FeedAssignment } from "./cageStageFeeds";
import PlaceStageLayoutTile from "./placeStageLayoutTile";
import { resolveParticipantSource, type PlaceStageParticipant } from "./placeStageLayoutEngine";
import "./cage-viewer-stage.css";
import CageArtistGoldenLike from "./CageArtistGoldenLike";

type Props = Omit<CageStageProgramProps, "isHost" | "isGuest"> & { cage: CageState };
const noop = () => undefined;

function personFor(participant: PlaceStageParticipant): RoomPerson {
  return { id: participant.profile.id, name: participant.profile.displayName,
    avatarUrl: participant.profile.avatarUrl, role: participant.profile.role,
    camera: participant.isCameraEnabled ? "ready" : "off", microphone: participant.isMicrophoneEnabled ? "ready" : "off" };
}

function ViewerCamera({ person, assignment, label, active, side, audible, artist, ...props }: Props & {
  person?: RoomPerson; assignment: FeedAssignment | null; label: string;
  active?: boolean; side?: "A" | "B"; audible: boolean; artist?: boolean;
}) {
  const track = props.useRtcVideo && assignment
    ? props.liveKitVideoTracks.find((item) => item.source === "camera" && !item.muted && item.participantIdentity === assignment.trackIdentity)
    : undefined;
  // Keep the exact participant's HLS fallback while its RTC camera reconnects.
  const source = assignment && resolveParticipantSource(assignment.participant, undefined, "program");
  const hasCamera = assignment?.participant.isCameraEnabled && Boolean(track || source?.videoUrl);
  return <article className={`cage-viewer-camera${active ? " is-active" : ""}`} data-side={side} data-feed={assignment?.exact ? "exact" : assignment ? "demo" : "missing"} aria-label={person ? `${person.name} · ${label}` : `Emplacement ${side} libre`}>
    {assignment && hasCamera ? <PlaceStageLayoutTile participant={assignment.participant}
      primary selected={false} program={Boolean(active)} preview={false} director={false}
      canDirectProgram={false} programMutationPending={false} presentationOnly
      muted={props.programMuted || !audible} playbackVolume={props.playbackVolume}
      renderAudience="program" selectionAudience="program" liveKitVideoTrack={track}
      onSelect={noop} onPutOnAir={noop} onOpenSolo={noop} onOpenProfile={props.onOpenProfile}
      onSourceChange={noop} onAspectRatio={noop} /> : <div className="cage-viewer-camera__fallback">
        {person ? <CameraOff aria-hidden="true" /> : <UserRound aria-hidden="true" />}
        <strong>{person ? "Caméra coupée" : "Emplacement libre"}</strong>
        <small>{artist ? person ? "Le direct continue en audio" : `Artiste ${side}` : "Commentaire en direct"}</small>
      </div>}
    {artist && person ? <div className="cage-viewer-camera__artist-support"><CageArtistGoldenLike person={person} canEngage={Boolean(props.canEngage)} viewerId={props.room.currentUserProfile?.id} /></div> : null}
    <div className="cage-viewer-camera__identity">
      {person ? <button type="button" onClick={() => props.onOpenProfile(person.id)} aria-label={`Voir le profil de ${person.name}`}>
        {person.avatarUrl ? <img src={person.avatarUrl} alt="" /> : <UserRound aria-hidden="true" />}
        <span><small>{label}</small><strong>{person.name}</strong></span>
      </button> : <span>Artiste {side}</span>}
      {!artist ? <Mic aria-label="Commentaire du host" /> : active ? <span className="cage-viewer-camera__live"><i />En direct</span> : null}
    </div>
  </article>;
}

/** iOS CageLiveStage: host first, two stable artist slots during Battle, host commentary below. */
export default function CageViewerStage(props: Props) {
  const { cage, room, onStage } = props;
  const match = cage.matches.find((item) => item.id === (cage.runtime ? cage.runtime.activeMatchId : cage.currentMatchId));
  const host = onStage.find((item) => item.status === "host" || item.profile.id === room.host.id)
    ?? room.participants.find((item) => item.profile.id === room.host.id);
  const guests = onStage.filter((item) => item.status === "onstage" && item.profile.id !== room.host.id).slice(0, 2);
  const openMic = cage.runtime?.config.format === "open-mic" || cage.format === "open-mic";
  const showBattle = !openMic && Boolean(match) && cage.battleStatus !== "incident"
    && !["COMPLETED", "CANCELLED"].includes(cage.runtime?.status ?? "");
  const performer = openMic ? guests[0] : undefined;
  const allFeeds = [...onStage, ...room.participants];
  const hostPerson: RoomPerson = { id: room.host.id, name: room.host.displayName, avatarUrl: room.host.avatarUrl, role: "Host", camera: host?.isCameraEnabled ? "ready" : "off", microphone: host?.isMicrophoneEnabled ? "ready" : "off" };
  const hostAssignment: FeedAssignment | null = host ? { participant: host, sourceParticipantId: host.id, trackIdentity: host.profile.id, exact: true } : null;
  const activeSide = cage.battleStatus === "live-a" ? "A" : cage.battleStatus === "live-b" ? "B" : null;
  const fighters = match ? [match.competitorA, match.competitorB] : [guests[0] && personFor(guests[0]), guests[1] && personFor(guests[1])];
  const interruption = cage.battleStatus === "paused" ? "Duel en pause" : cage.battleStatus === "incident" ? "Le direct reprend dans un instant" : null;

  return <section className={`cage-viewer-stage${showBattle || performer ? " has-artists" : ""}${showBattle ? " is-battle" : ""}`} aria-label={showBattle ? "La Cage · duel en direct" : "La Cage · en direct"}>
    <div className="cage-viewer-stage__host">
      <ViewerCamera {...props} person={hostPerson} assignment={hostAssignment} label="HOST · COMMENTAIRE" audible={!showBattle && !performer} />
      {!showBattle && !performer && props.hostActions ? <div className="cage-viewer-stage__host-support">{props.hostActions}</div> : null}
    </div>
    {showBattle ? <div className="cage-viewer-stage__fighters">
      {(["A", "B"] as const).map((side, index) => {
        const person = fighters[index];
        const assignment = person ? resolveCageFeed(person, side, allFeeds, room.source === "demo", cage.demoPresentation?.version === 2) : null;
        return <ViewerCamera key={side} {...props} person={person} assignment={assignment} side={side} label={`ARTISTE ${side}`} active={activeSide === side} audible={activeSide === side} artist />;
      })}
      <span className="cage-viewer-stage__versus" aria-hidden="true">VS</span>
    </div> : performer ? <div className="cage-viewer-stage__fighters is-solo"><ViewerCamera {...props} person={personFor(performer)} assignment={{ participant: performer, sourceParticipantId: performer.id, trackIdentity: performer.profile.id, exact: true }} label="SUR SCÈNE" active audible artist /></div> : null}
    {showBattle || performer ? <div className="cage-viewer-stage__phase" role="status">
      {interruption ? cage.battleStatus === "paused" ? <Pause /> : <TriangleAlert /> : cage.votingOpen ? <Swords /> : <Radio />}
      <span>{interruption ?? (cage.votingOpen ? "Vote ouvert" : activeSide ? `Passage ${activeSide}` : performer ? "Open Mic" : "La Cage · Face-à-face")}</span>
    </div> : null}
  </section>;
}
