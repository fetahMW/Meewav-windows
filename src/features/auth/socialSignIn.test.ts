import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ signIn: vi.fn() }));
vi.mock("../../lib/supabaseClient", () => ({ supabase: { auth: { signInWithOAuth: mocks.signIn } } }));
import { startSocialSignIn } from "./socialSignIn";

const target = "https://project.supabase.co/auth/v1/authorize?provider=google";
beforeEach(() => {
  mocks.signIn.mockReset().mockResolvedValue({ data: { url: target }, error: null });
  delete window.meewavDesktop;
});
afterEach(() => { delete window.meewavDesktop; });

describe("social sign-in routing", () => {
  it("opens OAuth through the desktop bridge instead of navigating the protected renderer", async () => {
    const openAuthUrl = vi.fn().mockResolvedValue(undefined);
    window.meewavDesktop = { version: 1, openAuthUrl } as NonNullable<Window["meewavDesktop"]>;
    await startSocialSignIn("google");
    expect(mocks.signIn).toHaveBeenCalledWith({
      provider: "google", options: { redirectTo: "meewav://app/auth/callback", skipBrowserRedirect: true },
    });
    expect(openAuthUrl).toHaveBeenCalledWith(target);
  });
  it("uses the browser callback on the website", async () => {
    await startSocialSignIn("apple");
    expect(mocks.signIn).toHaveBeenCalledWith({
      provider: "apple", options: { redirectTo: new URL("/auth/callback", location.origin).href, skipBrowserRedirect: false },
    });
  });
  it("reports an old desktop bridge before silently starting a blocked navigation", async () => {
    window.meewavDesktop = { version: 1 } as NonNullable<Window["meewavDesktop"]>;
    await expect(startSocialSignIn("google")).rejects.toThrow("Relance Meewav");
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
  it("surfaces provider and external-browser errors", async () => {
    const openAuthUrl = vi.fn().mockRejectedValue(new Error("browser_unavailable"));
    window.meewavDesktop = { version: 1, openAuthUrl } as NonNullable<Window["meewavDesktop"]>;
    mocks.signIn.mockResolvedValueOnce({ data: {}, error: new Error("provider_disabled") });
    await expect(startSocialSignIn("google")).rejects.toThrow("provider_disabled");
    expect(openAuthUrl).not.toHaveBeenCalled();
    await expect(startSocialSignIn("google")).rejects.toThrow("browser_unavailable");
  });
});
