import { describe, expect, it } from "vitest";
import { resolveMessagingRuntimeMode } from "./messaging.flags";

describe("messaging runtime flags", () => {
  it("never enables the demo flag in production", () => {
    expect(resolveMessagingRuntimeMode({ isDev: false, demoFlag: "true", localPreview: false })).toBe("supabase");
  });

  it("allows an explicit local development demo", () => {
    expect(resolveMessagingRuntimeMode({ isDev: true, demoFlag: "true", localPreview: false })).toBe("demo");
  });

  it("keeps the authentication-free localhost preview deterministic", () => {
    expect(resolveMessagingRuntimeMode({ isDev: true, demoFlag: "false", localPreview: true })).toBe("demo");
  });
});
