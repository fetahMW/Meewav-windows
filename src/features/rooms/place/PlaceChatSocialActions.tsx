import RoomGoldenLikeReactions from "./RoomGoldenLikeReactions";
import LiveActionBurst from "./LiveActionBurst";
import { LiveMonetizationIcon } from "./LiveActionBar";
import { formatSupportAmount } from "./roomSupport";
import type { PlaceRoomState } from "./place.types";
import type { LiveSupportAction } from "./useRoomSupportThrows";
import { useRoomPresentation } from "../roomPresentation";
import { useCageGoldenLikes } from "./CageGoldenLikeContext";

type Props = {
  room: PlaceRoomState;
  canEngage: boolean;
  goldenUnavailable: boolean;
  onLike: () => void;
  onGoldenLike: () => boolean | Promise<boolean>;
  onOpenDonation: () => void;
  supportAction?: LiveSupportAction;
  onSupportThrow?: () => void;
};

/** Existing LIVE/DEMO actions, placed beside the messages in the shared chat. */
export default function PlaceChatSocialActions({ room, canEngage, goldenUnavailable, onLike, onGoldenLike, onOpenDonation, supportAction, onSupportThrow }: Props) {
  const prepared = Boolean(supportAction?.remaining && onSupportThrow);
  const compactCounts = useRoomPresentation().id === "cage";
  const quota = useCageGoldenLikes();
  return <aside className="place-chat-social-actions" aria-label={`Soutenir ${room.host.displayName}, host du live`}>
    <RoomGoldenLikeReactions
      key={`${room.id}:${room.host.id}`}
      variant="compact"
      artistName={room.host.displayName}
      exactLikeCount={!compactCounts}
      likeCount={room.likesCount}
      goldenLikeCount={room.goldenLikesCount}
      liked={room.currentUserHasLiked}
      goldenGiven={room.currentUserHasGoldenLiked || quota?.givenId === room.host.id}
      goldenUnavailable={goldenUnavailable || Boolean(quota?.used || quota?.pending)}
      readOnly={!canEngage}
      ariaLabel={`Likes et Golden Likes pour ${room.host.displayName}, host du live`}
      onToggleLike={onLike}
      onGiveGoldenLike={() => quota ? quota.giveHost(onGoldenLike) : onGoldenLike()}
    />
    <button
      type="button"
      className="place-chat-social-actions__support"
      disabled={supportAction?.pending}
      onClick={prepared ? onSupportThrow : onOpenDonation}
      aria-label={prepared ? `Lancer ${formatSupportAmount(supportAction?.nextCents ?? 0)} · ${supportAction?.remaining} restant(s)` : `Ouvrir la bourse pour soutenir ${room.host.displayName}`}
      title={prepared ? "Lancer le soutien préparé" : "Préparer un soutien"}
    >
      <LiveMonetizationIcon />
      {prepared ? <small>{supportAction?.remaining}</small> : null}
      {supportAction?.burst ? <LiveActionBurst key={supportAction.burst.id} kind="support" cents={supportAction.burst.cents} /> : null}
    </button>
  </aside>;
}
