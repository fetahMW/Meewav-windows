import { useMemo } from "react";
import { getPreProfileArtistForSeed } from "../globe/components/preProfile/demoPreProfileArtist";
import ProfileViewerOverlay from "./ProfileViewerOverlay";
import type { DemoProfile } from "./profile.data";

export default function ProfileOwnerViewer({ profileId, profile, onClose }: {
  profileId: string;
  profile: DemoProfile;
  onClose: () => void;
}) {
  const artist = useMemo(() => {
    const seed = getPreProfileArtistForSeed({ profileId });
    const grade = profile.visibility.grade ? profile.grade : null;
    return {
      ...seed,
      id: profileId,
      name: profile.displayName,
      handle: profile.username,
      role: profile.visibility.role ? profile.role : "",
      location: [profile.city, profile.country].filter(Boolean).join(", "),
      bio: profile.bio,
      portraitUrl: profile.avatarUrl,
      portraitFallback: profile.avatarUrl,
      verified: profile.isVerified,
      followersLabel: profile.followers,
      followingLabel: profile.following,
      gradeLevel: grade, grade_level: grade, gradeStars: grade, grade_stars: grade,
      stats: { ...seed.stats, collabAvailable: profile.visibility.collab },
    };
  }, [profile, profileId]);
  return <ProfileViewerOverlay profileId={profileId} artist={artist} isOwner
    returnPath="/profile" onClose={onClose} />;
}
