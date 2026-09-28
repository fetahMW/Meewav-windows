import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PreProfileFrame } from "./components/PreProfileFrame";
import CollaborationComposer from "./components/preProfile/CollaborationComposer";
import { submitGlobeCollaborationRequest } from "../messaging/collaborationRequestBridge";
import { createGlobeMessagingPath } from "./messagingNavigation";
import type { EmbeddedDemoArtist } from "./embeddedProfileActions";
import "./components/preProfile/HoverPreProfileContent.css";
import "./components/preProfile/HoverPreProfileVisitor.css";
import "./components/preProfile/pre-profile-black-glass.css";
import "./embedded-globe-collaboration.css";

/** Demo cards use the existing local collaboration inbox. Live profiles use
 * HoverPreProfileContent and its authenticated backend request service. */
export default function EmbeddedGlobeCollaboration({ artist, ownerId, onClose }: {
  artist: EmbeddedDemoArtist; ownerId: string; onClose(): void;
}) {
  const navigate = useNavigate();
  const close = useRef<HTMLButtonElement>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  useEffect(() => { close.current?.focus(); }, []);
  return <section className="embedded-globe-collaboration" role="dialog" aria-modal="true"
    aria-label={`Collaboration avec ${artist.name}`} onKeyDown={event => {
      if (event.key !== "Tab") return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled):not([type="hidden"]), textarea:not(:disabled), [contenteditable="true"]',
      )).filter(node => node.getClientRects().length > 0 && node.tabIndex >= 0);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
    <PreProfileFrame>
      <div className="mw-preprofile is-visitor">
        <p className="embedded-globe-collaboration__demo">Profil de démonstration · aucun envoi à un compte réel</p>
        <CollaborationComposer recipientProfileId={artist.id} recipientName={artist.name}
          demoMode onClose={onClose}
          onOpenMessaging={() => navigate(createGlobeMessagingPath(artist.id, "collaboration", "demo", requestId))}
          onSubmit={async draft => {
            const result = submitGlobeCollaborationRequest({ ...draft, senderProfileId: ownerId,
              recipientName: artist.name, recipientRole: artist.role,
              recipientAvatar: artist.portraitUrl, recipientGradeLevel: artist.gradeLevel });
            setRequestId(result.id);
          }} />
      </div>
    </PreProfileFrame>
    <button ref={close} type="button" className="embedded-globe-collaboration__close" aria-label="Fermer la demande" onClick={onClose}><X /></button>
  </section>;
}
