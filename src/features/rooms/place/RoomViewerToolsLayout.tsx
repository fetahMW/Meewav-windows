import { createContext, useContext, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import PlaceToolsSwitch, { type PlaceToolsSwitchProps } from "./PlaceToolsSwitch";
import "./room-viewer-tools-layout.css";

const ViewerNavigationSlot = createContext<HTMLDivElement | null>(null);

/** Keep room navigation directly below the console tabs, outside scrolling content. */
export default function RoomViewerToolsLayout({ children }: { children: ReactNode }) {
  const [nav, setNav] = useState<HTMLDivElement | null>(null);
  return <ViewerNavigationSlot.Provider value={nav}>
    <div className="room-viewer-tools-layout">
      <div className="room-viewer-tools-layout__nav" ref={setNav} />
      <div className="room-viewer-tools-layout__body">{children}</div>
    </div>
  </ViewerNavigationSlot.Provider>;
}

export function RoomViewerSubmenu<ToolId extends string>(props: PlaceToolsSwitchProps<ToolId>) {
  const slot = useContext(ViewerNavigationSlot);
  const id = useId();
  const rail = <PlaceToolsSwitch semantics="tabs" idPrefix={`viewer-tool-${id}`} {...props} />;
  return slot ? createPortal(rail, slot) : rail;
}
