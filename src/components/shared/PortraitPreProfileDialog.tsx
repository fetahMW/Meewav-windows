import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../features/auth/AuthContext";
import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { PreProfileFrame } from "../../features/globe/components/PreProfileFrame";
import HoverPreProfileContent from "../../features/globe/components/preProfile/HoverPreProfileContent";
import { getPreProfileArtistForSeed, type PreProfileDemoArtist } from "../../features/globe/components/preProfile/demoPreProfileArtist";
import { isCanonicalProfileId } from "../../features/globe/api/preProfile.api";
import type { PortraitRequest } from "./portraitPreProfile";
import "./portrait-pre-profile.css";

export default function PortraitPreProfileDialog({person, trigger, onClose}: PortraitRequest & {onClose: () => void}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const dragStart = useRef<number | null>(null);
  const demo = !isCanonicalProfileId(person.id);
  const artist = useMemo<PreProfileDemoArtist>(() => {
    const name = person.name || "Artiste";
    if (demo) {
      const seed = getPreProfileArtistForSeed({profileId:person.id, displayName:person.name, mainRole:person.role, gradeLevel:person.gradeLevel});
      return {...seed, ...(person.avatarUrl ? {portraitUrl:person.avatarUrl} : {})};
    }
    return {id:person.id, name, role:person.role || "", portraitUrl:person.avatarUrl || "", portraitFallback:name.slice(0,1),
      verified:false, online:false, location:"", followersLabel:"", bio:"", gradeLevel:person.gradeLevel ?? null,
      gradeStars:person.gradeLevel ?? null, gradeTier:"", gradeColor:"#a6aec0", publicStatsPublished:false,
      pinColors:[], shorts:[], audios:[], stats:{shorts:0,audios:0,collabAvailable:false}};
  }, [person, demo]);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    close.current?.focus({preventScroll:true});
    return () => { document.body.style.overflow = previousOverflow; if (trigger?.isConnected) trigger.focus({preventScroll:true}); };
  }, [trigger]);
  return createPortal(<div className="portrait-preprofile-backdrop" onClick={event => { if(event.target === event.currentTarget) onClose(); }}>
    <div ref={panel} className="portrait-preprofile-dialog" role="dialog" aria-modal="true" aria-label={`Pré-profil de ${artist.name}`}
      onKeyDown={event => {
        if(event.key === "Escape" && !event.defaultPrevented) {event.preventDefault(); event.stopPropagation(); onClose();}
        if(event.key !== "Tab") return;
        const focusable = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]') || []).filter(el => el.getClientRects().length);
        const first=focusable[0], last=focusable[focusable.length-1];
        if(event.shiftKey && document.activeElement===first) {event.preventDefault();last?.focus();}
        if(!event.shiftKey && document.activeElement===last) {event.preventDefault();first?.focus();}
      }}>
      <div className="portrait-preprofile-handle" aria-hidden="true" onPointerDown={event => { dragStart.current=event.clientY; event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerUp={event => { if(dragStart.current !== null && event.clientY-dragStart.current>65) onClose(); dragStart.current=null; }} onPointerCancel={() => {dragStart.current=null;}}><i /></div>
      <div className="portrait-preprofile-card"><PreProfileFrame><HoverPreProfileContent artist={artist} demoFollow={demo} showMapPin={false} isOwner={user?.id === person.id} onOpenProfile={id => {
        const query = demo ? `?${new URLSearchParams({name:artist.name,role:artist.role,portrait:artist.portraitUrl,grade:String(artist.gradeLevel ?? 1)})}` : "";
        navigate(`/profile/view/${encodeURIComponent(id)}${query}`, {state:{from:location.pathname + location.search}}); onClose();
      }} onContact={id => {
        navigate(`/messages?${new URLSearchParams({space:"messages",intent:"message",source:"globe",mode:demo ? "demo" : "real",[demo ? "mockArtistId" : "profileId"]:id,mockArtistName:artist.name,mockArtistRole:artist.role,mockArtistAvatar:artist.portraitUrl})}`); onClose();
      }} /></PreProfileFrame></div>
      <button ref={close} type="button" className="portrait-preprofile-close" aria-label="Fermer le pré-profil" onClick={onClose}><X aria-hidden="true" /></button>
    </div>
  </div>, document.body);
}
