/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type StudioToolsLayout = {
  toolsVisible: boolean;
  nav: HTMLDivElement | null;
  body: HTMLDivElement | null;
  setNav: (node: HTMLDivElement | null) => void;
  setBody: (node: HTMLDivElement | null) => void;
};

const StudioToolsLayoutContext = createContext<StudioToolsLayout | null>(null);

/**
 * Shared Tools chrome for every host Room.
 *
 * This context only owns the two layout slots around the global player. Audio
 * stays in each Room's own engine (notably the dedicated Wave transport).
 */
export function StudioToolsLayoutProvider({ children, toolsVisible }: { children: ReactNode; toolsVisible: boolean }) {
  const [nav, setNav] = useState<HTMLDivElement | null>(null);
  const [body, setBody] = useState<HTMLDivElement | null>(null);
  const value = useMemo<StudioToolsLayout>(() => ({ toolsVisible, nav, body, setNav, setBody }), [body, nav, toolsVisible]);
  return <StudioToolsLayoutContext.Provider value={value}>{children}</StudioToolsLayoutContext.Provider>;
}

export const useStudioToolsLayout = () => useContext(StudioToolsLayoutContext);
