import { useEffect, useState } from "react";
import {
  isLocalAuthPreviewEnabled,
  LOCAL_PREVIEW_FETAH_HOST,
} from "../auth/localAuthPreview";
import { useAuth } from "../auth/AuthContext";
import { prepareAuthenticatedMusicSceneArrival } from "../auth/musicSceneAuthenticatedArrival";
import { readCurrentMusicSceneProfile, peekPendingMusicSceneArrival, type MusicSceneOnboardingPayload } from "../auth/musicSceneOnboardingContract";
import { canonicalizeMusicSceneSelection } from "../auth/musicSceneSelection";
import VinylGlobe from "./VinylGlobe";
import type { MonGlobeInitialDestination } from "./monGlobeContract";

type MonGlobeProps = {
  initialDestination?: MonGlobeInitialDestination;
};

export function MonGlobe({ initialDestination }: MonGlobeProps) {
  const { status, user } = useAuth();
  const authenticatedUserId = status === "loading" ? undefined : user?.id ?? null;
  const [arrival, setArrival] = useState<MusicSceneOnboardingPayload | null>(null);

  useEffect(() => {
    if (status === 'loading') return;
    let cancelled = false;
    setArrival(null);
    const pending = peekPendingMusicSceneArrival();
    const ownerMatches = user ? pending?.profile.profileId === user.id
      : isLocalAuthPreviewEnabled() && !!pending;
    if (!ownerMatches && initialDestination !== 'host-position') return;
    async function prepare() {
      const payload = user ? await prepareAuthenticatedMusicSceneArrival(user)
        : isLocalAuthPreviewEnabled() ? pending ?? readCurrentMusicSceneProfile() : null;
      if (!payload) return;
      const canonical = await canonicalizeMusicSceneSelection(payload.city, payload.scene);
      if (!cancelled) setArrival({ ...payload, ...canonical });
    }
    void prepare().catch(error => console.warn('[globe auth] Quartier de départ indisponible.', error));
    return () => { cancelled = true; };
    // Metadata synchronization refreshes the User object; it must not restart
    // this arrival or create a loop of auth writes.
  }, [authenticatedUserId, initialDestination]);

  const localPreviewOwnerId = authenticatedUserId === null && isLocalAuthPreviewEnabled()
    ? readCurrentMusicSceneProfile()?.profile.profileId ?? LOCAL_PREVIEW_FETAH_HOST.profileId
    : null;
  const profileOwnerId = authenticatedUserId ?? localPreviewOwnerId;
  const persistenceOwner = profileOwnerId ?? "anonymous";
  return (
    <VinylGlobe
      // Keep the loading animation mounted while the session resolves.
      // The embedded globe itself still waits for its definitive owner.
      ownerKey={authenticatedUserId === undefined ? null : persistenceOwner}
      arrival={arrival?.profile.profileId === persistenceOwner ? arrival : null}
    />
  );
}
