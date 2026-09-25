import { useMemo, useState } from "react";
import PlaceGiftTool, {
  type PlaceGiftRecipientOption,
  type PlaceGiftSubmission,
} from "../../place/PlaceGiftTool";
import { roomGiftCodeForLabel } from "../../place/placeGiftCatalog";
import type { RoomGiftDraw, RoomGiftDrawInput } from "../../place/place.types";
import { cageEntrants, cageOpenMicEntries, normalizedCageFormat } from "../cageTools.domain";
import type { GiftOrigin, RoomActorRole, RoomPerson, RoomToolsCommand, RoomToolsState } from "../roomTools.types";

function roomRecipients(state: RoomToolsState): RoomPerson[] {
  if (state.scene) {
    const live = state.scene.program.find((entry) => entry.status === "live");
    return [...state.scene.people].sort((a, b) => Number(b.id === live?.artistId) - Number(a.id === live?.artistId));
  }
  if (state.classe) {
    const active = state.classe.activeSpeakerId;
    return state.classe.people.filter((person) => person.id !== "class-teacher").sort((a, b) => Number(b.id === active) - Number(a.id === active));
  }
  if (state.wave) return state.wave.submissions.map((submission) => submission.contributor).filter((person, index, all) => all.findIndex((candidate) => candidate.id === person.id) === index);
  if (state.cage) {
    if (normalizedCageFormat(state.cage.format) === "open-mic") {
      const entries = cageOpenMicEntries(state.cage);
      const currentId = entries.find((entry) => entry.status === "live")?.personId
        ?? entries.find((entry) => entry.status === "ready")?.personId;
      return cageEntrants(state.cage).sort((a, b) => Number(b.id === currentId) - Number(a.id === currentId));
    }
    const match = state.cage.matches.find((candidate) => candidate.id === state.cage?.currentMatchId);
    return match ? [match.competitorA, match.competitorB] : [];
  }
  if (state.loge) return [
    ...state.loge.questions.map((question) => question.author),
    ...state.loge.moments.map((moment) => moment.beneficiary),
  ].filter((person, index, all) => all.findIndex((candidate) => candidate.id === person.id) === index);
  return [];
}

type SpecializedRecipientSource = Exclude<PlaceGiftRecipientOption["source"], "messaging">;

function recipientSource(state: RoomToolsState): SpecializedRecipientSource {
  if (state.wave) return "queue";
  if (state.loge) return "backstage";
  return "stage";
}

function availableStock(state: RoomToolsState, giftCode: NonNullable<ReturnType<typeof roomGiftCodeForLabel>>, accountId: string) {
  return state.gifts.stock.find((item) => (
    item.giftCode === giftCode
    && item.quantity - item.reserved > 0
    && (item.ownerId === null || item.ownerId === accountId)
  ));
}

export default function SharedGiftPanel({
  state,
  role,
  accountId,
  senderGradeLevel,
  disabled,
  execute,
  terminology = "gift",
}: {
  state: RoomToolsState;
  role: RoomActorRole;
  accountId: string;
  senderGradeLevel?: number | null;
  disabled: boolean;
  execute: (command: RoomToolsCommand) => Promise<unknown>;
  terminology?: "gift" | "reward";
}) {
  const [draw, setDraw] = useState<RoomGiftDraw | null>(null);
  const recipients = useMemo(() => roomRecipients(state), [state]);
  const source = recipientSource(state);
  const recipientOptions = useMemo<PlaceGiftRecipientOption[]>(() => recipients.map((person) => ({
    profileId: person.id,
    displayName: person.name,
    avatarUrl: person.avatarUrl,
    detail: person.role,
    source,
  })), [recipients, source]);

  const submitGift = async (submission: PlaceGiftSubmission) => {
    const giftCode = roomGiftCodeForLabel(submission.gift);
    if (!giftCode) throw new Error("room_gift_code_invalid");
    if (giftCode === "la-certif" && (senderGradeLevel ?? 0) < 4) throw new Error("room_gift_certif_grade_required");
    const stock = availableStock(state, giftCode, accountId);
    if (!stock) throw new Error("profile_gift_inventory_insufficient_available");
    await execute({
      type: "gift.send",
      accountId,
      recipientId: submission.recipientProfileId,
      giftCode,
      origin: stock.origin as GiftOrigin,
      idempotencyKey: submission.idempotencyKey,
    });
  };

  const createDraw = async (input: RoomGiftDrawInput) => {
    if (input.giftCode === "la-certif" && (senderGradeLevel ?? 0) < 4) throw new Error("room_gift_certif_grade_required");
    const stock = availableStock(state, input.giftCode, accountId);
    if (!stock) throw new Error("profile_gift_inventory_insufficient_available");
    const eligibleRecipientIds = (input.candidates ?? [])
      .map((candidate) => candidate.profileId)
      .filter((profileId): profileId is string => Boolean(profileId));
    const pool = eligibleRecipientIds.length ? eligibleRecipientIds : recipients.map((person) => person.id);
    if (!pool.length) throw new Error("room_gift_draw_empty");
    const nextState = await execute({
      type: "gift.raffle",
      accountId,
      eligibleRecipientIds: pool,
      giftCode: input.giftCode,
      origin: stock.origin as GiftOrigin,
      idempotencyKey: input.idempotencyKey ?? `room-gift-draw:${Date.now()}`,
    }) as RoomToolsState;
    const winnerId = nextState.gifts.transactions[0]?.recipientId ?? pool[0];
    const winner = recipients.find((person) => person.id === winnerId);
    const revealedAt = new Date().toISOString();
    const nextDraw: RoomGiftDraw = {
      id: nextState.gifts.transactions[0]?.id ?? `draw:${revealedAt}`,
      giftCode: input.giftCode,
      giftLabel: input.giftLabel,
      poolMode: input.poolMode,
      status: "revealed",
      eligibleCount: pool.length,
      scheduledAt: input.scheduledAt ?? null,
      startedAt: revealedAt,
      revealAt: revealedAt,
      revealedAt,
      winner: winner ? {
        key: winner.id,
        profileId: winner.id,
        displayName: winner.name,
        avatarUrl: winner.avatarUrl,
        source,
      } : null,
      createdAt: revealedAt,
    };
    setDraw(nextDraw);
    return nextDraw;
  };

  return (
    <div className="room-tools-place-gift">
      <PlaceGiftTool
        terminology={terminology}
        recipientOptions={recipientOptions}
        messagingMode="local-demo"
        queueCount={source === "queue" ? recipients.length : 0}
        roomCount={recipients.length}
        disabled={disabled || role === "visitor"}
        senderGradeLevel={senderGradeLevel}
        onSubmit={submitGift}
        draw={draw}
        onCreateDraw={createDraw}
        onScheduleDraw={async (input) => createDraw(input)}
        onStartDraw={() => draw}
        onCancelDraw={() => { setDraw(null); return null; }}
      />
    </div>
  );
}
