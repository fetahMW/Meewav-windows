import { useCallback, useEffect, useState, type SetStateAction } from "react";
import { scenePrivateKey } from "../scenePrivateStorage";
export function useSceneListWindow(context: string, initial: number) {
 const key = scenePrivateKey("meewav:scene:list-windows:v1");
 const [windows, setWindows] = useState<Record<string, number>>(() => { try { const parsed = JSON.parse(sessionStorage.getItem(key) ?? "{}"); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; } });
 const count = Number.isFinite(windows[context]) ? Math.max(initial, Math.min(2000, windows[context])) : initial;
 const setCount = useCallback((value: SetStateAction<number>) => setWindows((previous) => ({ ...previous, [context]: typeof value === "function" ? value(previous[context] ?? initial) : value })), [context, initial]);
 useEffect(() => { try { sessionStorage.setItem(key, JSON.stringify(Object.fromEntries(Object.entries(windows).slice(-30)))); } catch { /* Current session memory still restores the list. */ } }, [key, windows]);
 return [count, setCount] as const;
}
