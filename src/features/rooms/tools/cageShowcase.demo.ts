import { DEFAULT_CAGE_LAUNCH } from "../launch/cageLaunch";
import { cageDemoGuestCandidates } from "./cageCompetition.demo";
import { applyCageCompetitionCommand, initializeCageCompetition, syncCageLegacyProjection } from "./cageCompetition";
import type { CageCompetitionAction, CageCompetitionPayload } from "./cageCompetition.types";
import type { RoomToolsState } from "./roomTools.types";

function run(state: RoomToolsState, action: CageCompetitionAction, payload: CageCompetitionPayload, actorId: string) {
  applyCageCompetitionCommand(state, { type: "cage.competition.command", action, payload,
    idempotencyKey: crypto.randomUUID(), expectedRevision: state.revision }, actorId);
  state.revision++;
}

/** Reset the obsolete automatic preview once. New user-created sessions remain untouched. */
export function initializeCageShowcase(state: RoomToolsState, now = Date.now()) {
  const cage = state.cage;
  if (!cage || cage.demoPresentation?.version === 2) return false;
  if (cage.runtime && !cage.demoPresentation && !cage.runtime.journal.some((entry) => entry.id === "demo-competition-migration-v1")) return false;
  const candidates = cageDemoGuestCandidates().map((person) => ({
    ...person, registered: false, seed: null, status: "WAITING" as const, guestStatus: "waiting" as const,
  }));
  const runtime = initializeCageCompetition(cage, { ...structuredClone(DEFAULT_CAGE_LAUNCH),
    title: "Mon tournoi — La Cage", rosterMode: "manual", rosterProfileIds: [] }, candidates);
  cage.demoPresentation = { version: 2 };
  runtime.journal.push({ id: "cage-showcase-v2", at: new Date(now).toISOString(), actorId: "demo", action: "demo.reset", matchId: null, detail: "Tournoi vierge · sélection et progression manuelles depuis les Invités" });
  state.updatedAt = new Date(now).toISOString();
  syncCageLegacyProjection(cage);
  return true;
}

/** Only this local demo simulates the invited person's acceptance and preparation. */
export function moveCageDemoGuest(state: RoomToolsState, participantId: string, destination: "backstage" | "onstage" | "accepted" | "ready", actorId: string) {
  const cage = state.cage;
  const runtime = cage?.runtime;
  const person = runtime?.participants.find((item) => item.id === participantId);
  if (!cage || !runtime || !person) throw new Error("Cet invité ne figure pas dans la file de la Cage.");
  if (runtime.config.format === "open-mic") {
    const entry = runtime.openMicEntries?.find((item) => item.id === runtime.activeEntryId);
    if (entry?.participantId === person.id && !["PERFORMED", "SKIPPED", "POSTPONED"].includes(entry.status)) throw new Error("Termine ce passage depuis la régie avant de déplacer l’artiste.");
    if (destination === "onstage" && runtime.openMicEntries?.length) {
      const prepared = runtime.openMicEntries.find((item) => item.id === runtime.preparedEntryId && item.participantId === person.id);
      if (!prepared) throw new Error("Prépare le passage de cet artiste dans la Régie avant de le monter sur scène.");
      run(state, "openmic.promote", { entryId: prepared.id }, actorId);
      return;
    }
  }
  const current = runtime.matches.find((match) => match.id === runtime.activeMatchId);
  const currentPair = current ? [current.participantAId, current.participantBId] : [];
  if (current && currentPair.includes(person.id) && !["RESOLVED", "CLOSED", "POSTPONED"].includes(current.status)) {
    throw new Error("Pilote cette paire depuis Match ; son passage doit être terminé avant de changer la scène.");
  }
  if (destination === "onstage" && runtime.lockedAt) {
    const next = runtime.matches.find((match) => match.id === runtime.preparedMatchId);
    if (!next || ![next.participantAId, next.participantBId].includes(person.id)) throw new Error("Prépare cette rencontre dans la Régie avant de monter sa paire sur scène.");
    run(state, "regie.promote", { matchId: next.id }, actorId);
    return;
  }
  if (destination === "accepted") {
    // Guest placement is independent of tournament registration. Returning to
    // the queue must not remove a seed, redraw matches or unregister an artist.
    person.status = person.status === "READY" || person.guestStatus === "backstage" || person.guestStatus === "on_stage" ? "WAITING" : "GREENHOUSE";
    person.guestStatus = "waiting";
    person.readiness = { camera: false, microphone: false, connection: false, mixer: false, permissions: false };
  } else if (destination === "ready") {
    if (person.status !== "GREENHOUSE" && person.status !== "CALLED") throw new Error("Invite d’abord cet artiste dans la Green House.");
    person.registered = true;
    person.readiness = { camera: true, microphone: true, connection: true, mixer: true, permissions: true };
    person.status = "READY"; person.guestStatus = "backstage";
  } else {
    if (destination === "onstage" && person.guestStatus !== "backstage" && person.status !== "READY") throw new Error("Cet invité doit rejoindre les coulisses avant de monter sur scène.");
    if (destination === "backstage" && person.status !== "READY" && person.guestStatus !== "on_stage") throw new Error("Cet invité doit valider sa Green House avant les coulisses.");
    if (["ELIMINATED", "FORFEIT", "DISQUALIFIED"].includes(person.status)) throw new Error("Cet artiste a terminé sa participation au tournoi.");
    if (destination === "onstage" && runtime.participants.filter((item) => item.guestStatus === "on_stage" && item.id !== person.id).length >= 2) throw new Error("La Cage accueille deux artistes sur scène.");
    person.registered = true;
    person.readiness = { camera: true, microphone: true, connection: true, mixer: true, permissions: true };
    person.person.camera = "ready"; person.person.microphone = "ready";
    person.status = destination === "onstage" ? "ON_STAGE" : "READY";
    person.guestStatus = destination === "onstage" ? "on_stage" : "backstage";
  }
  syncCageLegacyProjection(cage);
}

/** Fictitious ballots follow Open vote; only the host's Close vote command resolves the demo. */
export function prepareCageShowcaseVote(state: RoomToolsState) {
  if (state.cage?.demoPresentation?.version !== 2) return;
  const match = state.cage.runtime?.matches.find((item) => item.id === state.cage?.runtime?.activeMatchId);
  if (!match?.vote?.open) return;
  match.vote.endsAt = null;
  if (!match.vote.ballots[`demo-public-${match.id}-0`]) {
    const total = 127 + (match.order * 37) % 140;
    const percentA = [58, 43, 54, 38, 61, 47, 56, 41][(match.order - 1) % 8];
    const countA = Math.round(total * percentA / 100);
    for (let index = 0; index < total; index++) match.vote.ballots[`demo-public-${match.id}-${index}`] = index < countA ? "A" : "B";
  }
  syncCageLegacyProjection(state.cage);
}

export function controlCageShowcase(state: RoomToolsState, action: "restart") {
  if (action !== "restart" || !state.cage?.demoPresentation) throw new Error("cage_demo_presentation_unavailable");
  delete state.cage.demoPresentation;
  delete state.cage.runtime;
  initializeCageShowcase(state);
}
