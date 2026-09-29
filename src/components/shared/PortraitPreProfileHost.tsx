import "./portrait-pre-profile.css";
import { lazy, Suspense, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { PORTRAIT_EVENT, type PortraitRequest } from "./portraitPreProfile";
const Dialog = lazy(() => import("./PortraitPreProfileDialog"));
export default function PortraitPreProfileHost() {
  const [request, setRequest] = useState<PortraitRequest | null>(null);
  const location = useLocation();
  useEffect(() => {
    const open = (event: Event) => setRequest((event as CustomEvent<PortraitRequest>).detail);
    window.addEventListener(PORTRAIT_EVENT, open);
    return () => window.removeEventListener(PORTRAIT_EVENT, open);
  }, []);
  useEffect(() => { setRequest(null); }, [location.key]);
  return request ? <Suspense fallback={null}><Dialog key={request.person.id} {...request} onClose={() => setRequest(null)} /></Suspense> : null;
}
