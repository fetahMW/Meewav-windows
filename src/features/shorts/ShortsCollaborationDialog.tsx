import { BriefcaseBusiness, MapPin, X } from "lucide-react";
import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import CollaborationComposer, {
  type CollaborationDraft,
} from "../globe/components/preProfile/CollaborationComposer";
import { requestProfileCollaboration } from "../globe/api/preProfile.api";
import { submitGlobeCollaborationRequest } from "../messaging/collaborationRequestBridge";
import { submitGlobeCollaborationWithAttachments } from "../messaging/messaging.collaboration-attachments.service";
import { createMessagingCollaborationIdempotencyKey } from "../messaging/messaging.collaboration.service";
import type { MessagingOriginSource } from "../messaging/messaging.route";
import { MeewavGradeBadge } from "../grades/MeewavGradeBadge";
import type { ShortsVideoItem } from "./shorts-wall-data";
import { resolveSceneCanonicalProfileId } from "./shortsArtistIdentity";
import { useShortsDialog } from "./useShortsDialog";
import "./shorts-collaboration-dialog.css";

export type ShortsCollaborationDialogItem = Pick<
  ShortsVideoItem,
  "artistId" | "mockArtistId" | "profileId" | "artist" | "image" | "role" | "city"
> & Partial<ShortsVideoItem> & {
  mockArtistId: string;
  gradeLevel?: number;
};

export type ShortsCollaborationDialogProps = {
  item: ShortsCollaborationDialogItem;
  onClose: () => void;
  onSubmitted: (requestId: string) => void;
  source?: MessagingOriginSource;
};

const SHORTS_DEMO_SENDER_ID = "shorts-current-user";

function collaborationDraftFingerprint(draft: CollaborationDraft) {
  return JSON.stringify([
    draft.message.trim(),
    draft.attachments.map((file) => [
      file.name,
      file.type,
      file.size,
      file.lastModified,
    ]),
  ]);
}

export default function ShortsCollaborationDialog({
  item,
  onClose,
  onSubmitted,
  source = "shorts",
}: ShortsCollaborationDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const realRecipientProfileId = resolveSceneCanonicalProfileId(item);
  const idempotencyKeysRef = useRef(new Map<string, string>());
  const closeSafely = useCallback(() => {
    if (submittingRef.current) return;
    onClose();
  }, [onClose]);
  const dialogRef = useShortsDialog<HTMLDivElement>(true, closeSafely);

  const closeFromBackdrop = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) closeSafely();
  };

  const submitRequest = async (draft: CollaborationDraft) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      if (realRecipientProfileId) {
        const fingerprint = collaborationDraftFingerprint(draft);
        let requestKey = idempotencyKeysRef.current.get(fingerprint);
        if (!requestKey) {
          requestKey = createMessagingCollaborationIdempotencyKey(source);
          idempotencyKeysRef.current.set(fingerprint, requestKey);
        }
        const result = await submitGlobeCollaborationWithAttachments({
          recipientProfileId: realRecipientProfileId,
          files: draft.attachments,
          requestIdempotencyKey: requestKey,
          createRequest: () => requestProfileCollaboration({
            recipientProfileId: realRecipientProfileId,
            message: draft.message,
            idempotencyKey: requestKey,
            source,
          }),
        });
        onSubmitted(result.requestId);
        return;
      }

    const recipientProfileId = item.mockArtistId.trim();
    if (!recipientProfileId) throw new Error("missing_shorts_collaboration_recipient");

    const request = submitGlobeCollaborationRequest({
      senderProfileId: SHORTS_DEMO_SENDER_ID,
      recipientProfileId,
      recipientName: item.artist,
      recipientRole: item.role,
      recipientAvatar: item.image,
      recipientGradeLevel: Number.isFinite(item.gradeLevel) ? item.gradeLevel : undefined,
      requestSource: source,
      message: draft.message,
      // The demo bridge currently has a narrower file contract than the shared
      // composer. Keep this handoff text-only until both contracts are aligned.
      attachments: [],
    });

    onSubmitted(request.id);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div
      ref={dialogRef}
      className="shorts-collaboration-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shorts-collaboration-dialog-title"
      aria-describedby="shorts-collaboration-dialog-description"
      tabIndex={-1}
      onPointerDown={closeFromBackdrop}
    >
      <section
        className="shorts-collaboration-dialog__surface"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="shorts-collaboration-dialog__header">
          <div className="shorts-collaboration-dialog__portrait">
            <img src={item.image} alt="" />
          </div>

          <div className="shorts-collaboration-dialog__heading">
            <span><BriefcaseBusiness /> Proposition de collaboration</span>
            <h2 id="shorts-collaboration-dialog-title">
              Proposer un projet à {item.artist}
            </h2>
            <MeewavGradeBadge
              level={item.gradeLevel ?? 1}
              size="sm"
              variant="compact-pill"
              labelMode="label"
              className="shorts-collaboration-dialog__grade"
              title={`Grade MeeWav de ${item.artist}`}
            />
            <p id="shorts-collaboration-dialog-description">
              Présente clairement ton idée, le rôle recherché et le calendrier envisagé.
            </p>
            <small><MapPin /> {item.role} · {item.city}</small>
          </div>

          <button
            type="button"
            className="shorts-collaboration-dialog__close"
            aria-label="Fermer la proposition de collaboration"
            title="Fermer"
            onClick={closeSafely}
            disabled={submitting}
          >
            <X />
          </button>
        </header>

        <div className="shorts-collaboration-dialog__composer">
          <CollaborationComposer
            recipientProfileId={realRecipientProfileId ?? item.mockArtistId}
            recipientName={item.artist}
            attachmentsEnabled={Boolean(realRecipientProfileId)}
            onClose={closeSafely}
            onSubmit={submitRequest}
          />
        </div>

        <p className="shorts-collaboration-dialog__handoff">
          Après l’envoi, tu retrouveras cette proposition dans Messagerie → Collabs → Envoyées.
        </p>
      </section>
    </div>
  );
}
