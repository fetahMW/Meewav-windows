import { LoaderCircle, PhoneIncoming, PhoneOff } from "lucide-react";
import type { RoomLiveCallInvitation } from "./roomLiveCall.service";
import "./room-live-call.css";

type RoomLiveCallIncomingProps = {
  invitation: RoomLiveCallInvitation | null;
  queuedCount: number;
  pendingAction: "accept" | "decline" | null;
  errorMessage: string | null;
  onAccept: () => void;
  onDecline: () => void;
};

const FALLBACK_AVATAR = "/avatars/utilisateur.png";

export default function RoomLiveCallIncoming({
  invitation,
  queuedCount,
  pendingAction,
  errorMessage,
  onAccept,
  onDecline,
}: RoomLiveCallIncomingProps) {
  if (!invitation) return null;

  return (
    <aside
      className="room-live-call-incoming"
      role="dialog"
      aria-modal="false"
      aria-labelledby="room-live-call-incoming-title"
      aria-describedby="room-live-call-incoming-description"
    >
      <span className="room-live-call-incoming__signal" aria-hidden="true">
        <i />
        <PhoneIncoming />
      </span>

      <div className="room-live-call-incoming__identity">
        <img src={invitation.hostAvatarUrl ?? FALLBACK_AVATAR} alt="" />
        <span>
          <small>{invitation.callMode === "public" ? "APPEL PUBLIC MEEWAV" : "APPEL PRIVÉ MEEWAV"}</small>
          <strong id="room-live-call-incoming-title">{invitation.hostDisplayName}</strong>
          <em id="room-live-call-incoming-description">
            vous invite dans « {invitation.roomTitle} »
          </em>
        </span>
      </div>

      <p>{invitation.callMode === "public"
        ? "En acceptant, vous autorisez le Host à préparer votre retour vocal pour le direct. Il devra encore le mettre explicitement à l’antenne."
        : "Votre voix reste entre vous et le Host. Cet appel privé ne peut pas être envoyé dans le direct."}</p>

      {queuedCount > 0 ? (
        <span className="room-live-call-incoming__queue" aria-label={`${queuedCount} autre appel en attente`}>
          +{queuedCount} en attente
        </span>
      ) : null}

      <div className="room-live-call-incoming__actions">
        <button
          type="button"
          className="is-decline"
          disabled={pendingAction !== null}
          onClick={onDecline}
        >
          {pendingAction === "decline" ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <PhoneOff aria-hidden="true" />}
          Refuser
        </button>
        <button
          type="button"
          className="is-accept"
          disabled={pendingAction !== null}
          onClick={onAccept}
        >
          {pendingAction === "accept" ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <PhoneIncoming aria-hidden="true" />}
          Accepter
        </button>
      </div>

      {errorMessage ? <small className="room-live-call-incoming__error" role="alert">{errorMessage}</small> : null}
    </aside>
  );
}
