import { useEffect, useRef } from "react";

export type PlaceLiveCallRoomCleanupOptions = {
  roomId: string;
  onAirInvitationIds: string[];
  authorize?: (invitationIds: string[], enabled: boolean) => Promise<boolean>;
  setAudible?: (invitationIds: string[], audible: boolean) => void;
  setProgramEnabled: (enabled: boolean) => Promise<boolean>;
};

/**
 * Closes every public phone-call gate when the Experience leaves a Room.
 * Callback refs intentionally stay outside the effect dependencies so an
 * ordinary provider refresh cannot flap a healthy on-air call.
 */
export function usePlaceLiveCallRoomCleanup({
  roomId,
  onAirInvitationIds,
  authorize,
  setAudible,
  setProgramEnabled,
}: PlaceLiveCallRoomCleanupOptions) {
  const invitationIdsByRoomRef = useRef(new Map<string, string[]>());
  const authorizeRef = useRef(authorize);
  const setAudibleRef = useRef(setAudible);
  const setProgramEnabledRef = useRef(setProgramEnabled);

  invitationIdsByRoomRef.current.set(roomId, [...onAirInvitationIds]);
  authorizeRef.current = authorize;
  setAudibleRef.current = setAudible;
  setProgramEnabledRef.current = setProgramEnabled;

  useEffect(() => {
    const scopedRoomId = roomId;
    const invitationIdsByRoom = invitationIdsByRoomRef.current;
    return () => {
      const scopedIds = invitationIdsByRoom.get(scopedRoomId) ?? [];
      invitationIdsByRoom.delete(scopedRoomId);

      // Local media gates close before any asynchronous server revocation.
      void setProgramEnabledRef.current(false);
      if (scopedIds.length > 0) {
        setAudibleRef.current?.(scopedIds, false);
        void authorizeRef.current?.(scopedIds, false);
      }
    };
  }, [roomId]);
}

export default usePlaceLiveCallRoomCleanup;
