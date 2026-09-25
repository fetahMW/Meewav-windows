import { describe, expect, it } from "vitest";
import { getTremplinToken24hSnapshot, TREMPLIN_DISCOVERY_TOKEN_UI } from "./tremplinDiscoveryToken";
import type { TremplinArtistToken } from "./tremplinTokenData";

function tokenWith24h(points: TremplinArtistToken["valueHistory"]["24h"]) {
  return { valueHistory: { "24h": points } } as Pick<TremplinArtistToken, "valueHistory">;
}

describe("présentation du jeton dans Découvrir", () => {
  it("réserve le prix et la variation au seul état actif", () => {
    for (const [status, presentation] of Object.entries(TREMPLIN_DISCOVERY_TOKEN_UI)) {
      expect(presentation.showPrice).toBe(status === "active");
      expect(presentation.showChange24h).toBe(status === "active");
    }
  });

  it("calcule la variation à partir des valeurs serveur sur 24 h", () => {
    const snapshot = getTremplinToken24hSnapshot(tokenWith24h([
      { timestamp: "2026-08-05T10:00:00.000Z", label: "Hier", valueEur: 1 },
      { timestamp: "2026-08-06T10:00:00.000Z", label: "Aujourd’hui", valueEur: 1.034 },
    ]));
    expect(snapshot.changePercent).toBeCloseTo(3.4, 5);
    expect(snapshot.updatedAt).toBe("2026-08-06T10:00:00.000Z");
  });

  it("n’invente pas 0 % lorsque la série est absente ou inutilisable", () => {
    expect(getTremplinToken24hSnapshot(undefined).changePercent).toBeNull();
    expect(getTremplinToken24hSnapshot(tokenWith24h([])).changePercent).toBeNull();
    expect(getTremplinToken24hSnapshot(tokenWith24h([
      { timestamp: "2026-08-06T10:00:00.000Z", label: "Maintenant", valueEur: 1 },
    ])).changePercent).toBeNull();
  });
});
