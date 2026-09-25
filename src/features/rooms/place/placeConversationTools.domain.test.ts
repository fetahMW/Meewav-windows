import { describe, expect, it } from "vitest";
import { clockRemaining, createPlaceConversationState, reducePlaceConversation, type PlaceConversationCommand, type PlaceConversationState } from "./placeConversationTools.domain";

const host = { id: "host", isHost: true, canEngage: true };
const guest = { id: "guest", isHost: false, canEngage: true };
const people = ["host", "guest", "other"];
const apply = (state: PlaceConversationState, command: PlaceConversationCommand, actor = host, now = 1_000) => reducePlaceConversation(state, command, actor, people, now);

describe("La Place conversation tools", () => {
  it("keeps one speaker, deduplicates requests and skips people who left", () => {
    let state = apply(createPlaceConversationState(), { type: "floor.join", personId: "guest" }, guest);
    expect(apply(state, { type: "floor.join", personId: "guest" }, guest)).toBe(state);
    state = apply(state, { type: "floor.join", personId: "other" });
    state = reducePlaceConversation(state, { type: "floor.next" }, host, ["host", "other"], 1_000);
    expect(state.floor.current).toBe("other");
    expect(state.floor.queue).toEqual([]);
    expect(state.floor.deadline).toBe(61_000);
  });

  it("pauses and resumes from the remaining time without timer drift", () => {
    let state = apply(createPlaceConversationState(), { type: "floor.join", personId: "guest" });
    state = apply(state, { type: "floor.next" });
    state = apply(state, { type: "floor.pause" }, host, 22_100);
    expect(state.floor.remaining).toBe(39);
    state = apply(state, { type: "floor.resume" }, host, 100_000);
    expect(clockRemaining(state.floor, 120_000)).toBe(19);
    expect(clockRemaining(state.floor, 200_000)).toBe(0);
    expect(state.floor.current).toBe("guest");
  });

  it("lets a speaker finish their turn without controlling someone else", () => {
    let state = apply(createPlaceConversationState(), { type: "floor.join", personId: "guest" });
    state = apply(state, { type: "floor.next" });
    expect(() => apply(state, { type: "floor.leave", personId: "host" }, guest)).toThrow(/uniquement/);
    state = apply(state, { type: "floor.leave", personId: "guest" }, guest);
    expect(state.floor.current).toBeNull();
    expect(state.floor.deadline).toBeNull();
  });

  it("enforces closed requests and host controls", () => {
    const state = apply(createPlaceConversationState(), { type: "floor.open", open: false });
    expect(() => apply(state, { type: "floor.join", personId: "guest" }, guest)).toThrow(/fermées/);
    expect(() => apply(state, { type: "floor.open", open: true }, guest)).toThrow(/host/);
    expect(() => apply(state, { type: "floor.next" }, { ...guest, canEngage: false })).toThrow(/Rejoins/);
  });

  const invite = () => apply(createPlaceConversationState(), { type: "clash.invite", id: "duel", title: "Talent ou travail ?", left: "host", right: "guest", rounds: 3, seconds: 30 });

  it("cannot start a clash before both personal consents", () => {
    let state = invite();
    expect(() => apply(state, { type: "clash.start" })).toThrow(/deux participants/);
    expect(() => apply(state, { type: "clash.accept" }, { ...guest, id: "other" })).toThrow(/invitation/);
    state = apply(state, { type: "clash.accept" });
    expect(() => apply(state, { type: "clash.start" })).toThrow(/deux participants/);
    state = apply(state, { type: "clash.accept" }, guest);
    state = apply(state, { type: "clash.start" });
    expect(state.clash?.status).toBe("running");
    expect(state.clash?.accepted).toEqual(["host", "guest"]);
  });

  it("alternates two passages per round and ends after the final reply", () => {
    let state = apply(apply(invite(), { type: "clash.accept" }), { type: "clash.accept" }, guest);
    state = apply(state, { type: "clash.start" });
    for (let passage = 1; passage <= 6; passage += 1) {
      expect(state.clash?.round).toBe(Math.ceil(passage / 2));
      expect(state.clash?.turn).toBe((passage - 1) % 2);
      state = apply(state, { type: "clash.next" });
    }
    expect(state.clash?.status).toBe("ended");
    expect(state.clash?.deadline).toBeNull();
  });

  it("a declined invitation cancels the clash without a forced start", () => {
    const state = apply(invite(), { type: "clash.decline" }, guest);
    expect(state.clash?.status).toBe("cancelled");
    expect(() => apply(state, { type: "clash.start" })).toThrow();
  });

  it("requires different participants and does not mutate the previous state", () => {
    const initial = createPlaceConversationState();
    expect(() => apply(initial, { type: "clash.invite", id: "bad", title: "Débat", left: "guest", right: "guest", seconds: 30, rounds: 1 })).toThrow(/différentes/);
    expect(initial.clash).toBeNull();
    expect(() => apply(initial, { type: "floor.configure", prompt: "", seconds: 0 })).toThrow(/durée/);
  });

  it("allows a non-artist to propose a challenge and enforces the target's consent", () => {
    let state = apply(createPlaceConversationState(), { type: "challenge.create", id: "challenge", title: "Une histoire en une minute", target: "other", seconds: 60 }, guest);
    expect(state.challenges[0].author).toBe("guest");
    expect(() => apply(state, { type: "challenge.accept", id: "challenge" })).toThrow(/autre personne/);
    expect(() => apply(state, { type: "challenge.start", id: "challenge" })).toThrow(/accepter/);
    state = apply(state, { type: "challenge.accept", id: "challenge" }, { ...guest, id: "other" });
    expect(state.challenges[0].accepted).toEqual(["other"]);
  });

  it("requires completion by a participant before host validation", () => {
    let state = apply(createPlaceConversationState(), { type: "challenge.create", id: "challenge", title: "Un souvenir", target: null, seconds: 60 });
    state = apply(state, { type: "challenge.accept", id: "challenge" }, guest);
    state = apply(state, { type: "challenge.start", id: "challenge" });
    expect(() => apply(state, { type: "challenge.validate", id: "challenge" })).toThrow(/terminé/);
    expect(() => apply(state, { type: "challenge.complete", id: "challenge" })).toThrow(/participer/);
    state = apply(state, { type: "challenge.complete", id: "challenge" }, guest);
    expect(() => apply(state, { type: "challenge.validate", id: "challenge" }, guest)).toThrow(/host/);
    state = apply(state, { type: "challenge.validate", id: "challenge" });
    expect(state.challenges[0].status).toBe("done");
    expect(state.challenges[0].deadline).toBeNull();
  });
});
