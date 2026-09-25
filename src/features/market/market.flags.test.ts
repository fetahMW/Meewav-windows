import { describe, expect, it } from "vitest";
import { resolveMarketRuntimeMode } from "./market.flags";

describe("market runtime flags", () => {
  it("refuse les mocks en production même si le flag de développement est présent", () => {
    expect(resolveMarketRuntimeMode({ isDev: false, demoFlag: "true", localPreview: false })).toBe("supabase");
  });

  it("autorise le catalogue investisseur uniquement en développement explicite", () => {
    expect(resolveMarketRuntimeMode({ isDev: true, demoFlag: "true", localPreview: false })).toBe("demo");
  });

  it("conserve la preview locale Fetah déterministe", () => {
    expect(resolveMarketRuntimeMode({ isDev: true, demoFlag: "false", localPreview: true })).toBe("demo");
  });
});
