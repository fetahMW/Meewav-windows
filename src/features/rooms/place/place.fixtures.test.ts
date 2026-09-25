import { describe, expect, it } from "vitest";
import { createPlaceDemoState } from "./place.fixtures";

describe("La Place investor fixture", () => {
  it("starts with the host alone and guests backstage", () => {
    const room = createPlaceDemoState();
    const hosts = room.participants.filter((participant) => participant.status === "host");
    const publicGuests = room.participants.filter((participant) => participant.status === "onstage");

    expect(hosts).toHaveLength(1);
    expect(publicGuests).toHaveLength(0);
    expect(new Set(room.participants.map((participant) => participant.profile.id)).size).toBe(room.participants.length);
  });

  it("ships a credible production state for every Studio surface", () => {
    const room = createPlaceDemoState();

    expect(room.messages.length).toBeGreaterThanOrEqual(5);
    expect(room.queue.length).toBeGreaterThanOrEqual(18);
    expect(room.participants.filter((participant) => participant.status === "onstage")).toHaveLength(0);
    expect(room.participants.filter((participant) => participant.status === "backstage")).toHaveLength(5);
    expect(room.channels.map((channel) => channel.kind)).toEqual(expect.arrayContaining(["microphone", "audio", "guest", "master"]));
    expect(room.channels.filter((channel) => channel.kind === "audio")).toHaveLength(1);
    expect(room.channels.filter((channel) => channel.kind === "master")).toHaveLength(1);
    expect(room.channels.filter((channel) => channel.kind === "guest")).toHaveLength(3);
    expect(room.channels).toHaveLength(6);
    expect(room.likesCount).toBe(12_846);
    expect(room.goldenLikesCount).toBe(214);
    expect(room.hatTotalAmount).toBe(842);
    expect(room.track.waveform.length).toBeGreaterThan(64);
    expect(room.track.bpm).toBeGreaterThan(0);
    expect(room.personalVocal.tuneAmount).toBe(0.98);
    expect(room.personalVocal.tunePreset).toBe("effect");
    expect(room.personalVocal.tuneSmooth).toBe(0.22);
    expect(room.personalVocal.tuneShift).toBe(0);
    expect(room.personalVocal.reverbAmount).toBe(0.18);
    expect(room.personalVocal.reverbEnabled).toBe(true);
    expect(room.personalVocal.delayEnabled).toBe(false);
    expect(room.personalVocal.delayTimeMs).toBe(120);
    expect(room.personalVocal.compEnabled).toBe(true);
    expect(room.personalVocal.compAmount).toBe(0.62);
    expect(room.personalVocal.eqEnabled).toBe(true);
    expect(room.personalVocal.preset).toBe("Trap");
  });

  it("uses stable UUID-compatible identifiers for server-backed demo actions", () => {
    const room = createPlaceDemoState();
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/i;

    expect(room.id).toMatch(uuid);
    expect(room.host.id).toMatch(uuid);
    room.participants.forEach((participant) => expect(participant.profile.id).toMatch(uuid));
  });
});
