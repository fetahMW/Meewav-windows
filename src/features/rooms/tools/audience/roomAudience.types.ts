import type { RoomActorRole, RoomToolsState, SpecializedRoomId } from "../roomTools.types";

export type RoomAudienceRole =
  | "ANONYMOUS_VIEWER"
  | "VIEWER"
  | "ELIGIBLE_PARTICIPANT"
  | "ACTIVE_PARTICIPANT"
  | "HOST"
  | "REGISSEUR";

export function resolveRoomAudienceRole({
  roomType,
  actorRole,
  accountId,
  state,
}: {
  roomType: SpecializedRoomId;
  actorRole: RoomActorRole;
  accountId: string;
  state: RoomToolsState | null;
}): RoomAudienceRole {
  if (actorRole === "host" || actorRole === "teacher") return "HOST";
  if (actorRole === "regisseur") return "REGISSEUR";
  if (actorRole === "visitor") return "ANONYMOUS_VIEWER";

  if (roomType === "classe" && state?.classe) {
    const seat = state.classe.seats.find((candidate) => candidate.person?.id === accountId);
    if (state.classe.activeSpeakerId === accountId || seat?.status === "speaking") return "ACTIVE_PARTICIPANT";
    if (seat) return "ELIGIBLE_PARTICIPANT";
  }
  if (roomType === "scene" && actorRole === "artist") return "ACTIVE_PARTICIPANT";
  if (roomType === "wave" && actorRole === "contributor") return "ELIGIBLE_PARTICIPANT";
  if (roomType === "cage" && actorRole === "competitor") return "ACTIVE_PARTICIPANT";
  if (roomType === "loge" && state?.loge?.moments.some((moment) => moment.beneficiary.id === accountId && moment.status === "live")) {
    return "ACTIVE_PARTICIPANT";
  }
  if (roomType === "loge" && (state?.audience?.eligible || state?.loge?.moments.some((moment) => moment.beneficiary.id === accountId && ["scheduled", "accepted"].includes(moment.status)))) {
    return state.loge?.moments.some((moment) => moment.beneficiary.id === accountId && moment.status === "live")
      ? "ACTIVE_PARTICIPANT"
      : "ELIGIBLE_PARTICIPANT";
  }
  return "VIEWER";
}

export function audienceRoleLabel(role: RoomAudienceRole) {
  if (role === "ANONYMOUS_VIEWER") return "Consultation publique";
  if (role === "ELIGIBLE_PARTICIPANT") return "Participation autorisée";
  if (role === "ACTIVE_PARTICIPANT") return "Intervention active";
  if (role === "HOST") return "Host";
  if (role === "REGISSEUR") return "Régisseur";
  return "Audience";
}
