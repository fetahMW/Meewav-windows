import { type RefObject, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import EmbeddedGlobeCollaboration from "./EmbeddedGlobeCollaboration";
import { parseEmbeddedProfileAction, type EmbeddedDemoArtist } from "./embeddedProfileActions";
import { createGlobeMessagingPath } from "./messagingNavigation";

export default function EmbeddedGlobeProfileActions({ frame, ownerId, allowDemo = true }: {
  frame: RefObject<HTMLIFrameElement | null>; ownerId: string; allowDemo?: boolean;
}) {
  const navigate = useNavigate();
  const [artist, setArtist] = useState<EmbeddedDemoArtist | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow
        || event.data?.channel !== "meewav:vinyl-globe:v1") return;
      const action = parseEmbeddedProfileAction(event.data);
      if (!action) return;
      if (action.action === "manage-collabs") navigate("/messages?space=collabs&source=globe");
      else if (!allowDemo) setNotice("Ce profil est une démonstration. Choisis un artiste réel sur le Globe pour lui écrire.");
      else if (action.action === "demo-contact") navigate(createGlobeMessagingPath(action.artist.id, "message", "demo"));
      else setArtist(action.artist);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [allowDemo, frame, navigate]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 7000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!artist || !frame.current) return;
    const element = frame.current, wasInert = element.inert;
    element.inert = true;
    element.contentWindow?.postMessage({ channel: "meewav:vinyl-globe:v1", type: "activity", active: false }, window.location.origin);
    return () => {
      if (!element.isConnected) return;
      element.inert = wasInert;
      element.contentWindow?.postMessage({ channel: "meewav:vinyl-globe:v1", type: "activity", active: !document.hidden }, window.location.origin);
      element.focus();
    };
  }, [artist, frame]);
  return artist ? <div className="embedded-globe-collaboration-backdrop" onPointerDown={event => {
    if (event.target === event.currentTarget) setArtist(null);
  }}><EmbeddedGlobeCollaboration key={artist.id} artist={artist} ownerId={ownerId} onClose={() => setArtist(null)} /></div>
    : notice ? <p className="embedded-globe-actions-notice" role="status">{notice}</p> : null;
}
