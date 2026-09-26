import type { ReactNode } from "react";
import "./room-viewer-host-support.css";

export default function RoomViewerHostSupport({ children }: { children: ReactNode }) {
  return <div className="room-viewer-host-support" onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}>
    {children}
  </div>;
}
