import { createContext, useContext, type ReactNode } from "react";

export type RoomPresentation = {
  id: "place" | "loge" | "wave" | "cage" | "classe" | "scene";
  label: "La Place" | "La Loge" | "La Wave" | "La Cage" | "La Classe" | "La Scène";
  uppercaseLabel: "LA PLACE" | "LA LOGE" | "LA WAVE" | "LA CAGE" | "LA CLASSE" | "LA SCÈNE";
  theme: "white" | "gold" | "cyan" | "red" | "blue" | "violet";
  toolsReady: boolean;
};

export const PLACE_ROOM_PRESENTATION: RoomPresentation = {
  id: "place",
  label: "La Place",
  uppercaseLabel: "LA PLACE",
  theme: "white",
  toolsReady: true,
};

export const LOGE_ROOM_PRESENTATION: RoomPresentation = {
  id: "loge",
  label: "La Loge",
  uppercaseLabel: "LA LOGE",
  theme: "gold",
  toolsReady: true,
};

export const WAVE_ROOM_PRESENTATION: RoomPresentation = {
  id: "wave",
  label: "La Wave",
  uppercaseLabel: "LA WAVE",
  theme: "cyan",
  toolsReady: true,
};

export const CAGE_ROOM_PRESENTATION: RoomPresentation = {
  id: "cage",
  label: "La Cage",
  uppercaseLabel: "LA CAGE",
  theme: "red",
  toolsReady: true,
};

export const CLASSE_ROOM_PRESENTATION: RoomPresentation = {
  id: "classe",
  label: "La Classe",
  uppercaseLabel: "LA CLASSE",
  theme: "blue",
  toolsReady: true,
};

export const SCENE_ROOM_PRESENTATION: RoomPresentation = {
  id: "scene",
  label: "La Scène",
  uppercaseLabel: "LA SCÈNE",
  theme: "violet",
  toolsReady: true,
};

export const LIVE_ROOM_PRESENTATIONS = {
  place: PLACE_ROOM_PRESENTATION,
  loge: LOGE_ROOM_PRESENTATION,
  wave: WAVE_ROOM_PRESENTATION,
  cage: CAGE_ROOM_PRESENTATION,
  classe: CLASSE_ROOM_PRESENTATION,
  scene: SCENE_ROOM_PRESENTATION,
} as const satisfies Record<RoomPresentation["id"], RoomPresentation>;

export function getLiveRoomPresentation(destination: string) {
  return destination in LIVE_ROOM_PRESENTATIONS
    ? LIVE_ROOM_PRESENTATIONS[destination as RoomPresentation["id"]]
    : null;
}

const RoomPresentationContext = createContext<RoomPresentation>(PLACE_ROOM_PRESENTATION);

export function RoomPresentationProvider({
  presentation,
  children,
}: {
  presentation: RoomPresentation;
  children: ReactNode;
}) {
  return (
    <RoomPresentationContext.Provider value={presentation}>
      {children}
    </RoomPresentationContext.Provider>
  );
}

export function useRoomPresentation() {
  return useContext(RoomPresentationContext);
}
