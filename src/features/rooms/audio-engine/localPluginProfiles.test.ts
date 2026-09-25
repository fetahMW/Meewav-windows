import { describe, expect, it } from "vitest";
import allowlist from "../../../../apps/meewav-audio-engine/config/plugins/allowlist.json";
import graillon from "../../../../apps/meewav-audio-engine/config/plugins/auburnsounds/graillon-3.2.json";
import spoton from "../../../../apps/meewav-audio-engine/config/plugins/sixthsample/spoton-1.1.json";
import liveProcessorSource from "../../../../apps/meewav-audio-engine/src/plugins/vst3/Vst3LiveProcessor.cpp?raw";
import probeSource from "../../../../apps/meewav-audio-engine/src/plugins/vst3/Vst3PocMain.cpp?raw";

const profiles = [spoton, graillon] as const;

describe("verified local plugin profiles", () => {
  it.each(profiles)("pins $canonicalPluginId to its locally scanned identity", (profile) => {
    const entry = allowlist.plugins.find((candidate) => candidate.pluginId === profile.canonicalPluginId);

    expect(profile.profileStatus).toBe("locally_scanned_registry_only");
    expect(profile.verifiedVendor).toBeTruthy();
    expect(profile.verifiedClassIds).toHaveLength(1);
    expect(profile.localProbeEvidence.instantiated).toBe(true);
    expect(profile.localProbeEvidence.processedSyntheticSignal).toBe(true);
    expect(profile.localProbeEvidence.liveAudioTested).toBe(false);
    expect(profile.localProbeEvidence.roomPublicationTested).toBe(false);
    expect(entry).toMatchObject({
      enabled: false,
      verifiedVendor: profile.verifiedVendor,
      verifiedClassIds: profile.verifiedClassIds,
    });
    expect(entry?.reason).toContain("Keep disabled");
  });

  it.each(profiles)("keeps $canonicalPluginId identity aligned with both native POCs", (profile) => {
    for (const source of [liveProcessorSource, probeSource]) {
      expect(source).toContain(profile.canonicalPluginId);
      expect(source.toLowerCase().replace(/ /g, "")).toContain(
        profile.verifiedVendor.toLowerCase().replace(/ /g, ""),
      );
      expect(source).toContain(profile.verifiedClassIds[0]);
    }
  });

  it("does not invent a canonical key/scale mapping for note-toggle plugins", () => {
    for (const profile of profiles) {
      expect(profile.parameterBindings.key).toBeNull();
      expect(profile.parameterBindings.scale).toBeNull();
    }
  });

  it("does not expose an unverified Retune speed mapping for Graillon", () => {
    expect(graillon.parameterBindings.retuneSpeed).toBeNull();
    expect(graillon.parameterBindings.humanize).toBeNull();
  });
});
