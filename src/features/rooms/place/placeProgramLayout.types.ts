import type { PlaceProgramLayoutState } from "./placeStageLayoutEngine";

export type PlaceProgramLayoutSnapshot = {
  roomId: string;
  revision: number;
  layout: PlaceProgramLayoutState;
};

export type PlaceProgramLayoutRealtimeStatus = "idle" | "connecting" | "subscribed" | "error";

export type PlaceProgramLayoutSubscription = {
  unsubscribe: () => void;
};

export type PlaceProgramLayoutRepository = {
  load: (roomId: string) => Promise<PlaceProgramLayoutSnapshot | null>;
  save: (
    roomId: string,
    expectedRevision: number,
    layout: PlaceProgramLayoutState,
  ) => Promise<PlaceProgramLayoutSnapshot>;
  subscribe: (
    roomId: string,
    onSnapshot: (snapshot: PlaceProgramLayoutSnapshot) => void,
    onStatus?: (status: PlaceProgramLayoutRealtimeStatus) => void,
  ) => PlaceProgramLayoutSubscription;
};

export type PlaceProgramLayoutController = {
  programLayout: PlaceProgramLayoutState;
  revision: number;
  hydrated: boolean;
  realtimeStatus: PlaceProgramLayoutRealtimeStatus;
  authority: "demo" | "connecting" | "realtime" | "unavailable";
  canDirectProgram: boolean;
  updateProgramLayout: (layout: PlaceProgramLayoutState) => Promise<void>;
};
