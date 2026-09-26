import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { getPublicPreProfile } from "./api/preProfile.api";
import type { LiveGlobeMarker } from "./api/globePublicMarkers";
import { PreProfileFrame } from "./components/PreProfileFrame";
import { HoverPreProfileContent } from "./components/preProfile/HoverPreProfileContent";
import type { PreProfileDemoArtist } from "./components/preProfile/demoPreProfileArtist";
import { createGlobeMessagingPath } from "./messagingNavigation";

export default function LiveGlobeProfile({ marker, ownerId, onClose }: { marker: LiveGlobeMarker; ownerId: string; onClose(): void }) {
  const navigate = useNavigate();
  const [artist, setArtist] = useState<PreProfileDemoArtist | null>(null);
  const [error, setError] = useState(false);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let stopped = false; setArtist(null); setError(false); close.current?.focus();
    void getPublicPreProfile(marker.id).then(profile => {
      if (stopped) return;
      if (!profile) { setError(true); return; }
      setArtist({ id: marker.id, name: profile.display_name || marker.name, handle: profile.username || undefined,
        verified: profile.is_verified, role: marker.role, location: profile.zone_name || profile.city || marker.city,
        online: profile.is_online, followersLabel: String(profile.followers_count), followingLabel: String(profile.following_count),
        portraitUrl: profile.profile_image_url || profile.avatar_url || "", portraitFallback: "", gradeLevel: profile.grade,
        gradeStars: profile.grade, gradeTier: "", gradeColor: "", bio: profile.bio || "", pinColors: [],
        goldenLikesCount: profile.golden_likes_count, shorts: [], audios: [],
        stats: { shorts: 0, audios: 0, collabAvailable: profile.collab_available } });
    }).catch(() => { if (!stopped) setError(true); });
    return () => { stopped = true; };
  }, [marker.id]);
  return <section className="vinyl-globe-live-profile" role="dialog" aria-label={`Pré-profil de ${marker.name}`}
    onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
    <button ref={close} type="button" className="vinyl-globe-profile-close" aria-label="Fermer le pré-profil" onClick={onClose}><X /></button>
    {artist ? <PreProfileFrame><HoverPreProfileContent artist={artist} senderProfileId={ownerId} demoFollow={false} showMapPin={false}
      onOpenProfile={id => navigate(`/profile/view/${encodeURIComponent(id)}`)}
      onContact={id => navigate(createGlobeMessagingPath(id, "message", "real"))} /></PreProfileFrame>
      : <p role={error ? "alert" : "status"}>{error ? "Ce profil n’est pas disponible." : "Chargement du profil…"}</p>}
  </section>;
}
