import { BarChart3, Check, ChevronDown, Gift, Headphones, LockKeyhole, Radio, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import type { PlaceRoomState, RoomGiftDelivery, RoomGiftDeliveryInput, RoomGiftDraw, RoomGiftDrawInput } from "../../place/place.types";
import PlaceGiftTool, { type PlaceGiftRecipientOption, type PlaceGiftSubmission } from "../../place/PlaceGiftTool";
import { roomGiftCodeForLabel } from "../../place/placeGiftCatalog";
import "./room-audience-interactions.css";

type PlaceAudienceInteractionsProps = {
  room: PlaceRoomState;
  canEngage: boolean;
  onVotePoll: (optionIndex: number) => void;
  onNotice?: (message: string) => void;
  onSubmitGift?: (input: RoomGiftDeliveryInput) => Promise<RoomGiftDelivery | null>;
  onCreateGiftDraw?: (input: RoomGiftDrawInput) => Promise<RoomGiftDraw | null>;
  onScheduleGiftDraw?: (input: RoomGiftDrawInput & { scheduledAt: string }) => Promise<RoomGiftDraw | null>;
  onStartGiftDraw?: (drawId?: string) => Promise<RoomGiftDraw | null>;
  onCancelGiftDraw?: (drawId?: string) => Promise<RoomGiftDraw | null>;
};

function existingAuthHref() {
  const returnTo = typeof window === "undefined" ? "/rooms/place" : `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return `/auth?returnTo=${encodeURIComponent(returnTo)}`;
}

export default function PlaceAudienceInteractions({ room, canEngage, onVotePoll, onNotice, onSubmitGift, onCreateGiftDraw, onScheduleGiftDraw, onStartGiftDraw, onCancelGiftDraw }: PlaceAudienceInteractionsProps) {
  const [giftOpen, setGiftOpen] = useState(false);
  const recipients = useMemo<PlaceGiftRecipientOption[]>(() => {
    const active = room.participants.filter((participant) => participant.status === "onstage").map((participant) => ({ profileId: participant.profile.id, displayName: participant.profile.displayName, avatarUrl: participant.profile.avatarUrl || participant.imageUrl, detail: "En direct sur La Place", source: "stage" as const }));
    if (!active.some((candidate) => candidate.profileId === room.host.id)) active.unshift({ profileId: room.host.id, displayName: room.host.displayName, avatarUrl: room.host.avatarUrl, detail: "Host de La Place", source: "stage" });
    return active;
  }, [room.host, room.participants]);
  const submitGift = async (submission: PlaceGiftSubmission) => {
    if (!onSubmitGift) throw new Error("gift-delivery-unavailable");
    const giftCode = roomGiftCodeForLabel(submission.gift);
    if (!giftCode) throw new Error("gift-delivery-invalid-gift");
    const action = submission.action === "Envoyer maintenant" ? "send_now" : submission.action === "Programmer" ? "schedule" : "round";
    const scheduledDate = action === "schedule" ? new Date(`${submission.date}T${submission.time}:00`) : null;
    const delivered = await onSubmitGift({
      giftCode,
      giftLabel: submission.gift,
      recipientProfileId: submission.recipientProfileId,
      recipientDisplayName: submission.recipient,
      recipientAvatarUrl: submission.recipientAvatarUrl,
      recipientSource: submission.recipientSource,
      action,
      scheduledAt: scheduledDate && Number.isFinite(scheduledDate.getTime()) ? scheduledDate.toISOString() : null,
      roundLabel: action === "round" ? submission.round : null,
      idempotencyKey: submission.idempotencyKey,
    });
    if (!delivered) throw new Error("gift-delivery-not-confirmed");
  };
  return <div className="room-audience-interactions is-place">
    <header className="room-audience-interactions__header"><span><Headphones /><span><small>LA PLACE · EN DIRECT</small><strong>Interactions</strong><em>Les actions disponibles évoluent avec le live.</em></span></span><b>{canEngage ? "Audience" : "Consultation publique"}</b></header>
    <div className="room-audience-interactions__body">
      {!canEngage ? <p className="room-audience-auth"><LockKeyhole /><span><strong>Le live reste accessible.</strong><small>Connectez-vous pour voter ou envoyer un cadeau sans perdre votre contexte.</small></span><a href={existingAuthHref()}>Se connecter</a></p> : null}
      {room.poll?.isActive ? <section className="room-audience-place-poll"><header><span><small>SONDAGE EN DIRECT</small><strong>{room.poll.question}</strong></span><BarChart3 /></header><div>{room.poll.options.map((option, index) => <button type="button" key={`${option.label}-${index}`} className={room.poll?.currentUserVoteIndex === index ? "is-selected" : ""} disabled={!canEngage || room.poll?.currentUserVoteIndex !== null} onClick={() => onVotePoll(index)}><span>{room.poll?.currentUserVoteIndex === index ? <Check /> : <Radio />}{option.label}</span><b>{option.votes}</b></button>)}</div>{room.poll.currentUserVoteIndex !== null ? <p><Check /> Vote enregistré.</p> : null}</section> : <div className="room-audience-empty" role="status"><span><Sparkles /></span><strong>Le live est libre pour le moment.</strong><small>Un sondage ou une mise en avant apparaîtra ici dès sa publication.</small></div>}
      <details className="room-audience-gift" open={giftOpen} onToggle={(event) => setGiftOpen(event.currentTarget.open)}><summary><span><Gift /><span><strong>Envoyer un cadeau</strong><small>Au Host ou à une personne actuellement en direct.</small></span></span><ChevronDown /></summary><PlaceGiftTool senderGradeLevel={room.currentUserProfile?.gradeLevel} recipientOptions={recipients} disabled={!canEngage} onSubmit={submitGift} draw={room.giftDraw} onCreateDraw={onCreateGiftDraw} onScheduleDraw={onScheduleGiftDraw} onStartDraw={onStartGiftDraw} onCancelDraw={onCancelGiftDraw} onDone={(message) => onNotice?.(message)} /></details>
    </div>
  </div>;
}
