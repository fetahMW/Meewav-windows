import type { RoomToolsRepository } from "./roomTools.service";
import type { RoomToolsState } from "./roomTools.types";
import type { CageCompetitionAction, CageCompetitionPayload } from "./cageCompetition.types";
import { cageParticipantReady } from "./cageCompetition";

/** The guest shortcut uses the same persisted commands as the Open Mic console. */
export async function stageCageOpenMicGuest(repository: RoomToolsRepository, state: RoomToolsState, actorId: string, participantId: string, source: "demo" | "live" = "live"): Promise<RoomToolsState> {
  const runtime = state.cage?.runtime;
  if (!runtime || runtime.config.format !== "open-mic") throw new Error("Ce programme n’est pas un Open Mic.");
  const active = runtime.openMicEntries?.find((entry) => entry.id === runtime.activeEntryId);
  if (active?.participantId === participantId && ["ON_STAGE", "IN_PROGRESS", "PAUSED"].includes(active.status)) return state;
  if (active && !["PERFORMED", "POSTPONED", "SKIPPED"].includes(active.status)) throw new Error("Termine le passage en cours avant de monter le prochain artiste.");
  const person = runtime.participants.find((candidate) => candidate.id === participantId);
  // Repair the old demo shortcut: it could place a guest on stage without an Open Mic entry.
  if (source === "demo" && !active && person?.guestStatus === "on_stage") {
    const repaired = await repository.execute("cage", state.roomId, "host", {type:"cage.demo.guest.move",participantId,destination:"backstage"}, actorId);
    return stageCageOpenMicGuest(repository, repaired, actorId, participantId, source);
  }
  if (!person || !cageParticipantReady(person) || person.guestStatus !== "backstage") throw new Error("Cet artiste doit valider sa Green House et rejoindre les coulisses avant de monter sur scène.");
  if (runtime.participants.some((candidate) => candidate.guestStatus === "on_stage")) throw new Error("Libère la scène avant de monter cet artiste.");
  let entry = runtime.openMicEntries?.find((candidate) => candidate.participantId === participantId);
  if (entry && ["PERFORMED", "SKIPPED"].includes(entry.status)) throw new Error("Cet artiste a déjà terminé son passage dans ce programme.");
  let current = state;
  const send = async (action: CageCompetitionAction, payload: CageCompetitionPayload) => {
    current = await repository.execute("cage", state.roomId, "host", {type:"cage.competition.command", action, payload,
      idempotencyKey:crypto.randomUUID(), expectedRevision:current.revision, expectedEntryId:payload.entryId}, actorId);
  };
  if (!entry) {
    await send("openmic.schedule", {participantIds:[participantId]});
    entry = current.cage!.runtime!.openMicEntries!.find((candidate) => candidate.participantId === participantId);
  }
  if (!entry) throw new Error("Le passage n’a pas pu être ajouté au programme.");
  if (current.cage!.runtime!.preparedEntryId !== entry.id || entry.status !== "READY") await send("openmic.prepare", {entryId:entry.id});
  await send("openmic.promote", {entryId:entry.id});
  return current;
}
