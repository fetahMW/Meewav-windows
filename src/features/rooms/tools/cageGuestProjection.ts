import type { PlaceParticipant, PlaceRoomState } from "../place/place.types";
import type { CageCompetitionRuntime } from "./cageCompetition.types";
import { cageDemoMedia } from "../place/cageDemoMedia";

/** Demo adapter for the existing Invités/Stage surfaces. Live invitations are moved atomically by the server. */
export function projectCageDemoGuests(room: PlaceRoomState, runtime: CageCompetitionRuntime): PlaceRoomState {
  if (room.source !== "demo") return room;
  const rosterIds = new Set(runtime.participants.map((person) => person.id));
  const active = runtime.matches.find((match) => match.id === runtime.activeMatchId);
  const manualDemo = runtime.journal.some((entry) => entry.id === "cage-showcase-v2");
  // The last pair remains in the video Program through the verdict, until the host promotes the next pair.
  const heldPair = runtime.config.format !== "open-mic-battle" && active && ["RESOLVED", "CLOSED"].includes(active.status) ? [active.participantAId, active.participantBId] : [];
  const existing = [...room.participants, ...room.queue];
  const openMic = runtime.config.format === "open-mic";
  const guests = runtime.participants.filter((person) => person.guestStatus !== "audience" || heldPair.includes(person.id)).map((person): PlaceParticipant => {
    const previous = existing.find((guest) => guest.profile.id === person.id);
    const side = person.id === active?.participantBId ? "B" : "A";
    const media = cageDemoMedia(person.id, side, manualDemo);
    const onstage = person.guestStatus === "on_stage" || heldPair.includes(person.id);
    const invitationId = person.guestStatus === "backstage" || onstage || ["CALLED", "GREENHOUSE", "READY"].includes(person.status) ? previous?.invitationId ?? `cage-invitation-${person.id}` : undefined;
    const status = onstage ? "onstage" : person.guestStatus === "backstage" && !["GREENHOUSE", "CALLED"].includes(person.status) ? "backstage" : person.status === "READY" ? "ready" : person.status === "GREENHOUSE" ? "accepted" : "pending";
    return {
      id: previous?.id ?? `cage-guest-${person.id}`,
      joinedAt: previous?.joinedAt ?? room.startedAt,
      isSpeaking: false, latencyMs: person.present ? previous?.latencyMs ?? 35 : 0,
      ...previous,
      profile: { ...previous?.profile, id: person.id, displayName: person.person.name, handle: previous?.profile.handle ?? "", avatarUrl: person.person.avatarUrl, role: person.person.role, city: previous?.profile.city ?? "", gradeLevel: person.person.gradeLevel ?? 1 },
      isCameraEnabled: person.readiness.camera, isMicrophoneEnabled: person.readiness.microphone,
      queueEntryId: invitationId ? undefined : previous?.queueEntryId ?? `cage-queue-${person.id}`,
      invitationId,
      status,
      videoUrl: onstage ? openMic && previous?.videoUrl ? previous.videoUrl : media.videoUrl : previous?.videoUrl,
      videoSources: onstage && !openMic ? [media] : previous?.videoSources,
      imageUrl: onstage ? undefined : previous?.imageUrl ?? person.person.avatarUrl,
    };
  });
  const inStageArea = guests.filter((guest) => ["onstage", "backstage"].includes(guest.status));
  const channels = room.channels.filter((channel) => channel.kind !== "guest" || inStageArea.some((guest) => guest.status === "onstage" && [guest.id, guest.profile.id].includes(channel.participantId ?? "")));
  inStageArea.filter((guest) => guest.status === "onstage").forEach((guest) => {
    if (!channels.some((channel) => channel.kind === "guest" && (channel.participantId === guest.profile.id || channel.participantId === guest.id))) channels.push({ id: `cage-mic-${guest.profile.id}`, participantId: guest.profile.id, label: guest.profile.displayName, detail: "Invité", kind: "guest", gain: .74, level: 0, isMuted: false, isSolo: false, signalState: "silent", accent: "#a578ff" });
  });
  const onAir = active ? [active.participantAId, active.participantBId].map((id) => runtime.participants.find((person) => person.id === id)?.person.name).filter(Boolean) : [];
  const bulletinId = active ? `cage-bulletin-${active.id}-${active.status}` : "";
  const hasOldChat = manualDemo && !runtime.matches.length;
  const messages = hasOldChat ? room.messages.filter((message) => !/^message-[1-5]$|^cage-bulletin-|^cage-showcase-welcome$/.test(message.id)) : [...room.messages];
  if (active && onAir.length === 2 && !messages.some((message) => message.id === bulletinId)) {
    const winner = runtime.participants.find((person) => person.id === active.winnerId)?.person.name;
    const content = active.status === "VOTING" ? `À vous de décider : ${onAir.join(" ou ")} ? Les votes sont ouverts.`
      : winner ? `${winner} remporte la rencontre${active.vote?.closedAt ? ` · ${active.vote.scoreA} – ${active.vote.scoreB}` : ""}. Bravo aux deux artistes !`
      : active.status === "ON_STAGE" && active.stepIndex === 0 ? `${active.label} · ${onAir.join(" × ")}. Le prochain duel est en scène.` : null;
    if (content) messages.push({ id: bulletinId, author: null, content, createdAt: new Date().toISOString(), isSystem: true });
  }
  return {
    ...room,
    title: runtime.config.title,
    messages: messages.slice(-100),
    pinnedMessageId: room.pinnedMessageId && messages.some((message) => message.id === room.pinnedMessageId) ? room.pinnedMessageId : null,
    participants: [...room.participants.filter((guest) => !rosterIds.has(guest.profile.id)).map((guest) => guest.status === "onstage" ? { ...guest, status: "backstage" as const } : guest), ...inStageArea],
    queue: [...room.queue.filter((guest) => !rosterIds.has(guest.profile.id)), ...guests.filter((guest) => !["onstage", "backstage"].includes(guest.status))],
    channels,
  };
}
