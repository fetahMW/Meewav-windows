import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import DesktopEntryGate from "./DesktopEntryGate";
import { getDesktopApplicationMode } from "./applicationMode";
import { isLocalAuthPreviewEnabled } from "../features/auth/localAuthPreview";
import { resolveMarketRuntimeMode } from "../features/market/market.flags";
import { resolveMessagingRuntimeMode } from "../features/messaging/messaging.flags";
import { RequireAuth } from "../features/auth/RequireAuth";
import { AuthContext, type AuthContextValue } from "../features/auth/AuthContext";
import { AuthProvider } from "../features/auth/AuthProvider";
import type { SupabaseClient } from "@supabase/supabase-js";

const key = "meewav:desktop:application-mode:v1";
afterEach(() => { cleanup(); sessionStorage.clear(); history.replaceState(null, "", "/"); vi.unstubAllGlobals(); });
function desktop(mode?: string) {
  vi.stubGlobal("meewavDesktop", { version: 1 });
  if (mode) sessionStorage.setItem(key, mode);
}
describe("Desktop entry and data isolation", () => {
  it("asks before mounting authentication or feature content", () => {
    desktop();
    const child = vi.fn(() => <div>Authentification</div>);
    const Child = child;
    render(<DesktopEntryGate><Child /></DesktopEntryGate>);
    expect(screen.getByRole("button", { name: /Mode démo/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /Application Meewav/ })).toBeVisible();
    expect(child).not.toHaveBeenCalled();
  });
  it("bypasses auth only in explicit demo and selects demo repositories", () => {
    desktop("demo");
    expect(isLocalAuthPreviewEnabled()).toBe(true);
    expect(resolveMarketRuntimeMode({ isDev: false })).toBe("demo");
    expect(resolveMessagingRuntimeMode({ isDev: false })).toBe("demo");
    const auth = { status: "anonymous", needsOnboarding: false, onboardingStatus: "complete" } as AuthContextValue;
    render(<MemoryRouter><AuthContext.Provider value={auth}><RequireAuth><div>Accès démo</div></RequireAuth></AuthContext.Provider></MemoryRouter>);
    expect(screen.getByText("Accès démo")).toBeVisible();
  });
  it("real application overrides stale preview keys and environment demo flags", () => {
    desktop("live"); sessionStorage.setItem("meewav:local-auth-preview", "enabled");
    expect(isLocalAuthPreviewEnabled()).toBe(false);
    expect(resolveMarketRuntimeMode({ isDev: true, demoFlag: true, localPreview: true })).toBe("supabase");
    expect(resolveMessagingRuntimeMode({ isDev: true, demoFlag: true, localPreview: true })).toBe("supabase");
    const auth = { status: "anonymous", needsOnboarding: false, onboardingStatus: "complete" } as AuthContextValue;
    render(<MemoryRouter initialEntries={["/private"]}><AuthContext.Provider value={auth}><Routes><Route path="/private" element={<RequireAuth><div>Contenu privé</div></RequireAuth>} /><Route path="/auth" element={<div>Connexion obligatoire</div>} /></Routes></AuthContext.Provider></MemoryRouter>);
    expect(screen.queryByText("Contenu privé")).toBeNull();
  });
  it("does not change the web runtime from a desktop storage value", () => {
    sessionStorage.setItem(key, "demo");
    expect(getDesktopApplicationMode()).toBeNull();
  });
  it("opens a desktop auth return in real mode without losing the one-use code", () => {
    desktop("demo");
    history.replaceState(null, "", "/auth/callback?code=test-code");
    expect(getDesktopApplicationMode()).toBe("live");
    expect(sessionStorage.getItem(key)).toBe("live");
    expect(location.search).toBe("?code=test-code");
  });
  it("does not restore a saved real session while entering demo", () => {
    desktop("demo");
    const getSession = vi.fn();
    const onAuthStateChange = vi.fn();
    const client = { auth: { getSession, onAuthStateChange } } as unknown as SupabaseClient;
    render(<AuthProvider client={client}><div>Démo locale</div></AuthProvider>);
    expect(getSession).not.toHaveBeenCalled();
    expect(onAuthStateChange).not.toHaveBeenCalled();
    expect(screen.getByText("Démo locale")).toBeVisible();
  });
});
