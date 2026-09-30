import { afterEach, describe, expect, it, vi } from "vitest";
import { getDesktopApplicationMode } from "./applicationMode";

const key = "meewav:desktop:application-mode:v1";
function launch(entry: string, previous: string, testAccounts = false) {
  const values = new Map([[key, previous]]);
  vi.stubGlobal("window", {
    meewavDesktop: { version: 1, localTestAccountsEnabled: testAccounts },
    location: { pathname: "/auth", search: `?entry=${entry}`, hash: "" },
    sessionStorage: { getItem: (name: string) => values.get(name) ?? null, setItem: (name: string, value: string) => values.set(name, value) },
  });
  return values;
}

afterEach(() => vi.unstubAllGlobals());

describe("explicit desktop authentication entry", () => {
  it("restores the presentation in demo even after a real session", () => {
    const values = launch("demo", "live");
    expect(getDesktopApplicationMode()).toBe("demo");
    expect(values.get(key)).toBe("demo");
  });
  it("keeps real login available independently of the demo shortcut", () => {
    const values = launch("login", "demo");
    expect(getDesktopApplicationMode()).toBe("live");
    expect(values.get(key)).toBe("live");
  });
  it("keeps explicit tester launches on the real backend", () => {
    launch("demo", "demo", true);
    expect(getDesktopApplicationMode()).toBe("live");
  });
  it("retains the chosen mode when no explicit entry was requested", () => {
    launch("", "demo");
    expect(getDesktopApplicationMode()).toBe("demo");
  });
});
