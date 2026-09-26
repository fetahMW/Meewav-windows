import { tallyRoomVote } from "../voting/roomVoting";
import { DEFAULT_CAGE_LAUNCH } from "../launch/cageLaunch";
import { applyOpenMicCommand, finalizeExpiredOpenMicFeedback, initializeOpenMicProgram } from "./cageCompetition.openMic";
export { cageOpenMicStandings, nextCageOpenMicEntry } from "./cageCompetition.openMic";
import type { CageState, RoomPerson, RoomToolsState } from "./roomTools.types";
import type { CageCompetitionCommand, CageCompetitionConfig, CageCompetitionMatch, CageCompetitionRuntime, CagePerformanceStep, TournamentParticipant } from "./cageCompetition.types";

const finished = (match: CageCompetitionMatch) => match.status === "RESOLVED" || match.status === "CLOSED";
const available = (person: TournamentParticipant) => person.present && person.registered && person.eligible && !["ELIMINATED", "FORFEIT", "DISQUALIFIED"].includes(person.status);
/** Waiting demo guests are selectable just like registered live queue entries; media readiness is unchanged. */
export function cageRosterCandidate(runtime: CageCompetitionRuntime, person: TournamentParticipant): boolean {
  return available(person) || (runtime.config.format === "open-mic-battle" && runtime.journal.some(entry => entry.id === "cage-showcase-v2")
    && person.present && person.eligible && person.guestStatus === "waiting" && ["WAITING", "GREENHOUSE", "READY"].includes(person.status));
}
/** Count recorded duels for the current battle, never provisional votes or tournament byes. */
export function cageBattleWinCount(runtime: CageCompetitionRuntime | undefined, participantId: string): number {
  if (runtime?.config.format !== "open-mic-battle") return 0;
  return runtime.matches.filter(match => finished(match) && match.participantAId && match.participantBId && match.winnerId === participantId).length;
}
function fail(message: string): never { throw new Error(message); }
function canonicalPayload(payload: unknown): string {
  const normalize = (value: unknown): unknown => Array.isArray(value) ? value.map(normalize) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, normalize(item)])) : value;
  return JSON.stringify(normalize(payload ?? {})) ?? "{}";
}
export function cageCommandAlreadyApplied(runtime: CageCompetitionRuntime, command: CageCompetitionCommand, actorId: string): boolean {
  if (!runtime.processedCommandIds.includes(command.idempotencyKey)) return false;
  const receipt = runtime.commandReceipts?.[command.idempotencyKey];
  if (receipt && (receipt.actorId !== actorId || receipt.action !== command.action || receipt.payload !== canonicalPayload(command.payload))) fail("cage_idempotency_payload_conflict");
  return true;
}
export const ensureCageRuntime = (cage: CageState) => cage.runtime;
export const cageParticipantReady = (person?: TournamentParticipant) => Boolean(person && available(person) && (["camera", "microphone", "connection", "mixer", "permissions"] as const).every((key) => person.readiness[key] === true));
export const cageMatchPair = (runtime: CageCompetitionRuntime, match: CageCompetitionMatch) => [match.participantAId, match.participantBId].map((id) => runtime.participants.find((person) => person.id === id));
export function nextCageMatch(runtime: CageCompetitionRuntime): CageCompetitionMatch | undefined {
  return runtime.matches.filter((match) => !finished(match) && match.id !== runtime.activeMatchId && match.participantAId && match.participantBId && match.status !== "POSTPONED").sort((a, b) => a.order - b.order)[0];
}
export function cagePerformanceSteps(config: CageCompetitionConfig, tieBreak = false): CagePerformanceStep[] {
  const rounds = tieBreak && config.rules.tieBreak === "sudden-death" ? 1 : config.rules.rounds;
  const steps: CagePerformanceStep[] = [];
  const append = (side: CagePerformanceStep["side"], round: number) => steps.push({ id: `r${round}-${side}`, label: `${tieBreak ? "Manche décisive · " : ""}${side === "BOTH" ? "Duel" : `Performance ${side}`}${rounds > 1 ? ` · manche ${round}` : ""}`, side, durationSeconds: config.rules.passageDurationSeconds });
  for (let round = 1; round <= rounds; round++) {
    if (config.rules.performanceMode === "simultaneous") append("BOTH", round);
    else if (config.rules.performanceMode === "alternating" && round % 2 === 0) { append("B", round); append("A", round); }
    else { append("A", round); append("B", round); }
  }
  return steps;
}
export function createCageCompetitionRuntime(config: CageCompetitionConfig, candidates: TournamentParticipant[]): CageCompetitionRuntime {
  if (!Number.isInteger(config.participantCount) || config.participantCount < (config.format === "open-mic" ? 1 : 2) || config.participantCount > 64 || (config.format === "tournament" && !Number.isInteger(Math.log2(config.participantCount)) && !config.rules.allowByes)) fail("cage_format_size_invalid");
  const ids = new Set<string>();
  const participants = structuredClone(candidates).filter((person) => person.id && !ids.has(person.id) && Boolean(ids.add(person.id))).map((person) => ({ ...person, seed: null, status: "WAITING" as const }));
  const runtime: CageCompetitionRuntime = { version: 1, config: structuredClone(config), status: "CHECK_IN", participants, matches: [], lockedAt: null, activeMatchId: null, preparedMatchId: null, autoRegie: false, publicBracketVisible: false, journal: [], processedCommandIds: [] };
  const prepared = config.rosterMode === "prepared" ? config.rosterProfileIds.map((id) => participants.find((person) => person.id === id)).filter((person): person is typeof participants[number] => Boolean(person && available(person))) : config.rosterMode === "first-eligible" ? participants.filter(available).slice(0, config.participantCount) : [];
  prepared.forEach((person, index) => { const target = runtime.participants.find((item) => item.id === person.id)!; target.seed = index + 1; target.status = "SELECTED"; });
  if (config.format === "open-mic") initializeOpenMicProgram(runtime);
  return runtime;
}
export function initializeCageCompetition(cage: CageState, config: CageCompetitionConfig, candidates: TournamentParticipant[]): CageCompetitionRuntime {
  cage.runtime = createCageCompetitionRuntime(config, candidates);
  syncCageLegacyProjection(cage);
  return cage.runtime;
}

/** Corrects old prototype Open Mic snapshots without fabricating duel results as solo performances. */
export function migrateOpenMicRuntime(cage: CageState): boolean {
  const runtime = cage.runtime;
  if (!runtime || runtime.config.format !== "open-mic" || Array.isArray(runtime.openMicEntries)) return false;
  const legacyEntries = cage.openMicEntries ?? [];
  runtime.participants.forEach((person) => { if (person.seed !== null) { person.status = "SELECTED"; if (person.guestStatus === "on_stage") person.guestStatus = "backstage"; } });
  initializeOpenMicProgram(runtime);
  for (const entry of (runtime as CageCompetitionRuntime).openMicEntries ?? []) {
    const previous = legacyEntries.find((item) => item.personId === entry.participantId);
    if (!previous) continue;
    entry.order = previous.order;
    entry.status = previous.status === "done" ? "PERFORMED" : previous.status === "absent" ? "SKIPPED" : previous.status === "live" && !runtime.activeEntryId ? "ON_STAGE" : "WAITING";
    const person = runtime.participants.find((item) => item.id === entry.participantId);
    if (person && entry.status === "PERFORMED") person.status = "PERFORMED";
    if (person && entry.status === "SKIPPED") person.status = "NO_SHOW";
    if (person && entry.status === "ON_STAGE" && !runtime.activeEntryId) { runtime.activeEntryId = entry.id; person.status = "ON_STAGE"; person.guestStatus = "on_stage"; }
  }
  runtime.journal.push({ id: "openmic-solo-migration-v1", at: new Date().toISOString(), actorId: "system", action: "openmic.migrated", matchId: null, detail: "Programme individuel restauré · aucun duel ni élimination" });
  syncCageLegacyProjection(cage);
  return true;
}

export function migrateChampionshipRuntime(cage: CageState): boolean {
  const runtime = cage.runtime;
  if (!runtime || runtime.config.format !== "championship") return false;
  const previous = runtime.participants.filter((person) => ["ADVANCED", "ELIMINATED", "FORFEIT"].includes(person.status));
  if (!previous.length) return false;
  previous.forEach((person) => { person.status = "SELECTED"; if (person.guestStatus === "audience") person.guestStatus = "backstage"; });
  runtime.journal.push({ id: `championship-cumulative-${runtime.journal.length}`, at: new Date().toISOString(), actorId: "system", action: "championship.migrated", matchId: null, detail: "Classement cumulé restauré · aucune élimination après une rencontre" });
  syncCageLegacyProjection(cage);
  return true;
}
function blankMatch(runtime: CageCompetitionRuntime, round: number, index: number, order: number): CageCompetitionMatch {
  return { id: `cage-r${round}-m${index}`, round, order, label: `Match ${String(order).padStart(2, "0")}`, participantAId: null, participantBId: null, sourceA: null, sourceB: null, status: "WAITING", stepIndex: 0, steps: cagePerformanceSteps(runtime.config), timer: { startedAt: null, elapsedSeconds: 0 }, vote: null, winnerId: null, incident: null };
}
function generateMatches(runtime: CageCompetitionRuntime, selected: TournamentParticipant[], size: number) {
  if (runtime.config.format === "open-mic") fail("cage_openmic_has_no_bracket");
  let ids: Array<string | null> = Array.from({ length: size }, (_, index) => selected[index]?.id ?? null);
  if (selected.length < size && runtime.config.format === "tournament") {
    // Spread exemptions through the first round instead of pairing two empty slots.
    let seeds = [1, 2];
    for (let span = 4; span <= size; span *= 2) seeds = seeds.flatMap((seed) => [seed, span + 1 - seed]);
    ids = seeds.map((seed) => selected[seed - 1]?.id ?? null);
  }
  const matches: CageCompetitionMatch[] = [];
  if (runtime.config.format === "open-mic-battle") {
    for (let index = 0; index < selected.length - 1; index++) {
      matches.push({ ...blankMatch(runtime, index + 1, 1, index + 1), label: `Duel ${index + 1}`, participantAId: index === 0 ? selected[0].id : null, participantBId: selected[index + 1].id, sourceA: index === 0 ? null : { matchId: matches[index - 1].id, kind: "winner" } });
    }
  } else if (runtime.config.format === "championship") {
    const rotation = [...ids];
    if (rotation.length % 2) rotation.push(null);
    for (let round = 1; round < rotation.length; round++) {
      for (let index = 0; index < rotation.length / 2; index++) {
        const a = rotation[index], b = rotation[rotation.length - 1 - index];
        if (a && b) matches.push({ ...blankMatch(runtime, round, index + 1, matches.length + 1), participantAId: a, participantBId: b });
      }
      rotation.splice(1, 0, rotation.pop()!);
    }
  } else {
    // The empty future slots represent source match winners, never hypothetical people.
    for (let round = 1; round <= Math.log2(size); round++) for (let index = 0; index < size / 2 ** round; index++) {
      const match = blankMatch(runtime, round, index + 1, matches.length + 1);
      if (round === 1) { match.participantAId = ids[index * 2]; match.participantBId = ids[index * 2 + 1]; }
      else { match.sourceA = { matchId: `cage-r${round - 1}-m${index * 2 + 1}`, kind: "winner" }; match.sourceB = { matchId: `cage-r${round - 1}-m${index * 2 + 2}`, kind: "winner" }; }
      matches.push(match);
    }
  }
  runtime.matches = matches;
  runtime.status = "SEEDED";
  runtime.activeMatchId = null;
  runtime.preparedMatchId = null;
}
function sourcesResolved(runtime: CageCompetitionRuntime, match: CageCompetitionMatch) {
  return [match.sourceA, match.sourceB].every((source) => !source || runtime.matches.some((item) => item.id === source.matchId && finished(item)));
}
function propagateWinners(runtime: CageCompetitionRuntime) {
  const successor = (id: string | null) => runtime.participants.find((person) => person.seed !== null && person.replacesId === id)?.id ?? id;
  for (const match of runtime.matches) {
    if (finished(match)) continue;
    if (match.sourceA) match.participantAId = successor(runtime.matches.find((source) => source.id === match.sourceA?.matchId)?.winnerId ?? null);
    if (match.sourceB) match.participantBId = successor(runtime.matches.find((source) => source.id === match.sourceB?.matchId)?.winnerId ?? null);
    if (runtime.lockedAt && !finished(match) && sourcesResolved(runtime, match) && (!match.participantAId || !match.participantBId) && runtime.config.rules.allowByes) {
      match.winnerId = match.participantAId ?? match.participantBId;
      match.status = "RESOLVED";
      match.resolution = "bye";
    }
  }
}
function battleIncumbent(runtime: CageCompetitionRuntime, match: CageCompetitionMatch, person: TournamentParticipant | null | undefined) {
  return runtime.config.format === "open-mic-battle" && person?.guestStatus === "on_stage" && Boolean(match.sourceA && runtime.matches.some((previous) => previous.id === match.sourceA?.matchId && finished(previous) && previous.winnerId === person.id));
}
function pairReady(runtime: CageCompetitionRuntime, match: CageCompetitionMatch) {
  return cageMatchPair(runtime, match).every((person) => cageParticipantReady(person) && (person?.guestStatus === "backstage" || battleIncumbent(runtime, match, person)));
}
function prepare(runtime: CageCompetitionRuntime, match: CageCompetitionMatch) {
  if (!runtime.lockedAt || finished(match) || match.id === runtime.activeMatchId || !match.participantAId || !match.participantBId) fail("cage_match_not_preparable");
  const existing = runtime.matches.find((item) => item.id === runtime.preparedMatchId);
  if (existing && existing.id !== match.id && !finished(existing)) fail("cage_pair_already_preparing");
  const pair = cageMatchPair(runtime, match);
  const demoPreview = !runtime.activeMatchId && runtime.journal.some((entry) => entry.id === "cage-showcase-v2");
  pair.forEach((person) => {
    if (!person) fail("cage_participant_missing");
    if (person.guestStatus === "on_stage" && !demoPreview) return;
    if (person.guestStatus !== "on_stage") person.guestStatus = "backstage";
    person.status = cageParticipantReady(person) ? "READY" : "GREENHOUSE";
  });
  match.status = pair.every((person) => cageParticipantReady(person) && (person?.guestStatus === "backstage" || battleIncumbent(runtime, match, person) || (demoPreview && person?.guestStatus === "on_stage"))) ? "READY" : "GREENHOUSE";
  runtime.preparedMatchId = match.id;
}
function promote(runtime: CageCompetitionRuntime, match: CageCompetitionMatch) {
  const current = runtime.matches.find((item) => item.id === runtime.activeMatchId);
  if (current && !finished(current) && current.id !== match.id && current.status !== "POSTPONED") fail("cage_match_already_active");
  if (!["READY", "GREENHOUSE"].includes(match.status) || runtime.preparedMatchId !== match.id) fail("cage_pair_not_prepared");
  const pair = cageMatchPair(runtime, match);
  const demoPreview = !current && runtime.journal.some((entry) => entry.id === "cage-showcase-v2");
  if (!pair.every((person) => cageParticipantReady(person) && (person?.guestStatus === "backstage" || battleIncumbent(runtime, match, person) || (demoPreview && person?.guestStatus === "on_stage")) && (person?.status === "READY" || battleIncumbent(runtime, match, person)))) fail("cage_pair_not_ready");
  runtime.participants.filter((person) => person.guestStatus === "on_stage" && !pair.includes(person)).forEach((person) => { person.guestStatus = "backstage"; });
  pair.forEach((person) => { person!.status = "ON_STAGE"; person!.guestStatus = "on_stage"; });
  match.status = "ON_STAGE";
  runtime.activeMatchId = match.id;
  runtime.preparedMatchId = null;
  runtime.status = runtime.config.format !== "championship" && match.round === Math.max(...runtime.matches.map((item) => item.round)) ? "FINAL" : "RUNNING";
  const next = nextCageMatch(runtime);
  if (next) prepare(runtime, next);
}
function reconcileAutoRegie(runtime: CageCompetitionRuntime) {
  if (!runtime.autoRegie || !runtime.lockedAt || ["COMPLETED", "CANCELLED"].includes(runtime.status)) return;
  const active = runtime.matches.find((match) => match.id === runtime.activeMatchId);
  if (active && !finished(active) && active.status !== "POSTPONED") return;
  const next = runtime.matches.find((match) => match.id === runtime.preparedMatchId && ["GREENHOUSE", "READY"].includes(match.status));
  if (!next || !cageMatchPair(runtime, next).every((person) => person && available(person))) return;
  next.status = pairReady(runtime, next) ? "READY" : "GREENHOUSE";
  if (next.status === "READY") promote(runtime, next);
}
function pauseTimer(match: CageCompetitionMatch, now: string) {
  if (match.timer.startedAt) match.timer.elapsedSeconds += Math.max(0, (Date.parse(now) - Date.parse(match.timer.startedAt)) / 1000);
  match.timer.startedAt = null;
}
function resolveMatch(runtime: CageCompetitionRuntime, match: CageCompetitionMatch, winnerId: string, resolution: "public" | "forfeit", now: string) {
  if (finished(match)) return;
  if (![match.participantAId, match.participantBId].includes(winnerId)) fail("cage_winner_not_in_match");
  match.winnerId = winnerId;
  match.status = "RESOLVED";
  match.resolution = resolution;
  pauseTimer(match, now);
  if (match.vote) { match.vote.open = false; match.vote.closedAt = now; }
  cageMatchPair(runtime, match).forEach((person) => {
    if (!person) return;
    person.status = runtime.config.format === "championship" ? "SELECTED" : person.id === winnerId ? "ADVANCED" : resolution === "forfeit" ? "FORFEIT" : "ELIMINATED";
    person.guestStatus = person.status === "ELIMINATED" || person.status === "FORFEIT" ? "audience" : runtime.config.format === "open-mic-battle" && person.guestStatus === "on_stage" ? "on_stage" : "backstage";
  });
  propagateWinners(runtime);
  if (runtime.matches.every(finished)) { runtime.status = "COMPLETED"; runtime.preparedMatchId = null; return; }
  const next = runtime.matches.find((item) => item.id === runtime.preparedMatchId && !finished(item)) ?? nextCageMatch(runtime);
  if (next) {
    prepare(runtime, next);
    const active = runtime.matches.find((item) => item.id === runtime.activeMatchId);
    if (runtime.autoRegie && next.status === "READY" && (!active || finished(active))) promote(runtime, next);
  }
}
function closeVote(runtime: CageCompetitionRuntime, match: CageCompetitionMatch, now: string) {
  if (!match.vote || match.vote.closedAt) return;
  if (match.status !== "VOTING") fail("cage_vote_not_open");
  match.vote.open = false;
  match.vote.closedAt = now;
  const ballots = Object.values(match.vote.ballots);
  match.vote.scoreA = ballots.filter((choice) => choice === "A").length;
  match.vote.scoreB = ballots.filter((choice) => choice === "B").length;
  const tally = tallyRoomVote(runtime.votingPolicy,match.vote.ballots,["A","B"]);
  match.vote.votingMode = runtime.votingPolicy?.mode ?? "public";
  match.vote.weightedScoreA = tally.percentages[0];
  match.vote.weightedScoreB = tally.percentages[1];
  if (!tally.ready || Math.abs(tally.percentages[0] - tally.percentages[1]) < 0.000001) {
    match.status = "TIE_BREAK";
    match.tieBreakRound = (match.tieBreakRound ?? 0) + 1;
    match.steps = cagePerformanceSteps(runtime.config, true);
    match.stepIndex = 0;
    match.timer = { startedAt: null, elapsedSeconds: 0 };
    cageMatchPair(runtime, match).forEach((person) => { if (person) person.status = "ON_STAGE"; });
  } else resolveMatch(runtime, match, (tally.percentages[0] > tally.percentages[1] ? match.participantAId : match.participantBId)!, "public", now);
}
/** Called inside the demo repository transaction. Live resolution is performed by the RPC. */
export function finalizeExpiredCageVote(cage: CageState, now = new Date().toISOString()): boolean {
  const runtime = cage.runtime;
  if (runtime?.config.format === "open-mic") {
    const changed = finalizeExpiredOpenMicFeedback(runtime, now);
    if (changed) syncCageLegacyProjection(cage);
    return changed;
  }
  const match = runtime?.matches.find((item) => item.id === runtime.activeMatchId);
  if (!runtime || !match?.vote?.open || !match.vote.endsAt || Date.parse(match.vote.endsAt) > Date.parse(now)) return false;
  closeVote(runtime, match, now);
  runtime.journal.push({ id: `vote-expired-${match.vote.roundId}`, at: now, actorId: "system", action: "vote.close", matchId: match.id, detail: "Clôture automatique du vote" });
  syncCageLegacyProjection(cage);
  return true;
}

export function cageCanConfigure(runtime: CageCompetitionRuntime): boolean {
  return !runtime.participants.some((person) => person.guestStatus === "on_stage")
    && !runtime.matches.some((match) => ["ON_STAGE", "IN_PROGRESS", "PAUSED", "READY_FOR_VOTE", "VOTING", "TIE_BREAK"].includes(match.status))
    && !(runtime.openMicEntries ?? []).some((entry) => ["ON_STAGE", "IN_PROGRESS", "PAUSED"].includes(entry.status) || entry.feedback?.open);
}

function configureCompetition(cage: CageState, command: CageCompetitionCommand, actorId: string, now: string) {
  const previous = cage.runtime!;
  const payload = command.payload ?? {};
  if (!cageCanConfigure(previous)) fail("cage_format_change_active");
  if ((previous.matches.length || previous.openMicEntries?.length) && !payload.confirmReset) fail("cage_format_reset_confirmation_required");
  if (!["tournament", "championship", "open-mic", "open-mic-battle"].includes(payload.format ?? "")) fail("cage_format_invalid");
  const format = payload.format!;
  const participantCount = payload.participantCount ?? previous.config.participantCount;
  const feedback = payload.openMicFeedback ?? previous.config.rules.openMicFeedback ?? "appreciation";
  if (!["appreciation", "scored", "none"].includes(feedback)) fail("cage_open_mic_feedback_configuration_required");
  const selected = previous.participants.filter((person) => person.seed !== null && person.present && person.registered && person.eligible)
    .sort((a, b) => (a.seed ?? 0) - (b.seed ?? 0)).slice(0, participantCount).map((person) => person.id);
  const config = { ...previous.config, format, participantCount, rosterMode: "prepared" as const, rosterProfileIds: selected,
    rules: { ...previous.config.rules, openMicFeedback: feedback } };
  if (/^Mon (tournoi|championnat|open mic) — La Cage$/i.test(config.title)) config.title = `Mon ${format === "tournament" ? "tournoi" : format === "championship" ? "championnat" : "open mic"} — La Cage`;
  const next = createCageCompetitionRuntime(config, previous.participants.map((person) => ({ ...person, graceEndsAt: null, replacesId: undefined })));
  next.journal = [...previous.journal, { id: command.idempotencyKey, at: now, actorId, action: command.action, matchId: null, detail: `${previous.config.format} → ${format} · ${participantCount} places` }];
  next.processedCommandIds = [...previous.processedCommandIds, command.idempotencyKey];
  next.commandReceipts = { ...previous.commandReceipts, [command.idempotencyKey]: { actorId, action: command.action, payload: canonicalPayload(command.payload) } };
  cage.runtime = next;
  // Clear the projections of the previous format before deriving the new program.
  cage.matches = []; cage.openMicEntries = []; cage.currentMatchId = ""; cage.currentRound = 1;
  syncCageLegacyProjection(cage);
}

/** Pure authoritative reducer for the persisted demo repository, mirrored by the live SQL RPC. */
export function applyCageCompetitionCommand(state: RoomToolsState, command: CageCompetitionCommand, actorId: string, now = new Date().toISOString()): boolean {
  const cage = state.cage;
  const runtime = cage?.runtime;
  if (!cage || !runtime) fail("cage_configuration_missing");
  if (!command.idempotencyKey) fail("cage_idempotency_key_required");
  if (cageCommandAlreadyApplied(runtime, command, actorId)) return false;
  if (!["vote.cast", "regie.ready", "openmic.feedback.cast"].includes(command.action) && command.expectedRevision !== state.revision) fail("cage_revision_conflict");
  if (command.action === "broadcast.results") {
    const selected = runtime.matches.find((match) => match.id === command.payload?.matchId);
    if (command.payload?.enabled && (command.payload.matchId ? !selected || !finished(selected) : runtime.status !== "COMPLETED")) fail("cage_results_not_ready");
    runtime.publicResults = command.payload?.enabled ? { matchId: command.payload.matchId ?? null } : null;
    runtime.processedCommandIds.push(command.idempotencyKey);
    (runtime.commandReceipts ??= {})[command.idempotencyKey] = { actorId, action: command.action, payload: canonicalPayload(command.payload) };
    runtime.journal.push({id:command.idempotencyKey,at:now,actorId,action:command.action,matchId:command.payload?.matchId ?? null,detail:command.payload?.enabled ? "Résultats publiés au public" : "Résultats retirés du public"});
    syncCageLegacyProjection(cage); return true;
  }
  if (command.action === "competition.configure") { configureCompetition(cage, command, actorId, now); return true; }
  if (["COMPLETED", "CANCELLED"].includes(runtime.status) && command.action !== "broadcast.bracket" && !command.action.startsWith("openmic.feedback.")) fail("cage_competition_closed");
  const payload = { ...command.payload };
  if (runtime.config.format === "open-mic") {
    applyOpenMicCommand(runtime, command, actorId, now);
    runtime.processedCommandIds.push(command.idempotencyKey);
    (runtime.commandReceipts ??= {})[command.idempotencyKey] = { actorId, action: command.action, payload: canonicalPayload(command.payload) };
    const replacement = command.action === "participant.replace" ? runtime.participants.find((person) => person.id === payload.replacementId) : undefined;
    const replaced = command.action === "participant.replace" ? runtime.participants.find((person) => person.id === payload.participantId) : undefined;
    runtime.journal.push({ id: command.idempotencyKey, at: now, actorId, action: command.action, matchId: null, detail: replacement && replaced ? `${replacement.person.name} remplace ${replaced.person.name} · ${payload.reason ?? ""}` : payload.reason?.trim() ?? "" });
    syncCageLegacyProjection(cage);
    return true;
  }
  if (command.action.startsWith("openmic.")) fail("cage_action_only_for_open_mic");
  const match = runtime.matches.find((item) => item.id === (command.action === "match.report" && payload.matchId ? payload.matchId : runtime.activeMatchId));
  const structural = command.action.startsWith("roster.") || command.action.startsWith("bracket.");
  if (structural && runtime.lockedAt) fail("cage_bracket_locked");
  const scoped = command.action.startsWith("match.") || command.action.startsWith("vote.");
  if (scoped && (!match || command.expectedMatchId !== match.id)) fail("cage_match_conflict");
  if (["match.start", "match.end-step", "match.restart"].includes(command.action) && command.expectedStepIndex !== match?.stepIndex) fail("cage_step_conflict");
  const participant = payload.participantId ? runtime.participants.find((person) => person.id === payload.participantId) : undefined;
  const requireMatch = () => match ?? fail("cage_match_missing");
  const requireParticipant = () => participant ?? fail("cage_participant_missing");
  const orderedSeeds = () => runtime.participants.filter((person) => person.seed !== null).sort((a, b) => (a.seed ?? 0) - (b.seed ?? 0));
  const resetDraw = () => { runtime.matches = []; runtime.activeMatchId = null; runtime.preparedMatchId = null; runtime.status = "CHECK_IN"; };
  const requireStageReady = (current: CageCompetitionMatch) => {
    if (!cageMatchPair(runtime, current).every((person) => cageParticipantReady(person) && person?.guestStatus === "on_stage")) fail("cage_pair_not_ready");
  };
  switch (command.action) {
    case "broadcast.bracket": runtime.publicBracketVisible = payload.enabled === true; break;
    case "roster.select": {
      const selected = orderedSeeds();
      for (const id of payload.participantIds ?? []) {
        const person = runtime.participants.find((item) => item.id === id);
        if (!person || !cageRosterCandidate(runtime, person)) fail("cage_participant_unavailable");
        if (person.seed !== null) continue;
        if (selected.length >= runtime.config.participantCount) fail("cage_roster_full");
        person.registered = true;
        person.seed = selected.length + 1;
        person.status = "SELECTED";
        selected.push(person);
      }
      resetDraw();
      break;
    }
    case "roster.remove": {
      const person = requireParticipant();
      person.seed = null; person.status = "WAITING";
      orderedSeeds().forEach((item, index) => { item.seed = index + 1; });
      resetDraw();
      break;
    }
    case "roster.move": {
      const person = requireParticipant();
      if (person.seed === null) fail("cage_participant_not_selected");
      const selected = orderedSeeds().filter((item) => item.id !== person.id);
      selected.splice(Math.max(0, Math.min(selected.length, (payload.toSeed ?? 1) - 1)), 0, person);
      selected.forEach((item, index) => { item.seed = index + 1; });
      resetDraw();
      break;
    }
    case "bracket.generate": {
      const mode = payload.mode ?? "manual";
      let selected = mode === "manual" ? orderedSeeds() : runtime.participants.filter(available);
      if (selected.some((person) => !available(person))) fail("cage_participant_unavailable");
      if (mode === "random") {
        selected = [...selected];
        for (let i = selected.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [selected[i], selected[j]] = [selected[j], selected[i]];
        }
      }
      let size = runtime.config.format === "open-mic-battle" ? Math.min(selected.length, runtime.config.participantCount) : runtime.config.participantCount;
      if (selected.length < size) {
        if (payload.shortage === "byes" && runtime.config.rules.allowByes) { /* Explicit empty slots. */ }
        else if (payload.shortage === "reduce" && runtime.config.rules.allowFormatReduction) size = runtime.config.format !== "tournament" ? selected.length : 2 ** Math.floor(Math.log2(selected.length));
        else fail("cage_not_enough_participants");
      }
      if (selected.length < 2 || size < 2) fail("cage_not_enough_participants");
      selected = selected.slice(0, size);
      runtime.participants.forEach((person) => { person.seed = null; person.status = "WAITING"; });
      selected.forEach((person, index) => { person.seed = index + 1; person.status = "SELECTED"; });
      // Only the session snapshot changes when the host explicitly reduces the field.
      if (runtime.config.format !== "open-mic-battle" && size !== runtime.config.participantCount) runtime.config.participantCount = size;
      generateMatches(runtime, selected, runtime.config.format !== "tournament" ? size : 2 ** Math.ceil(Math.log2(size)));
      break;
    }
    case "bracket.reset":
      runtime.participants.forEach((person) => { person.seed = null; person.status = "WAITING"; });
      runtime.publicBracketVisible = false;
      resetDraw();
      break;
    case "bracket.lock":
      if (!runtime.matches.length || runtime.status !== "SEEDED") fail("cage_bracket_not_seeded");
      if (orderedSeeds().some((person) => !available(person))) fail("cage_participant_unavailable");
      if (runtime.config.format !== "open-mic-battle" && orderedSeeds().length < runtime.config.participantCount && !runtime.config.rules.allowByes) fail("cage_not_enough_participants");
      runtime.lockedAt = now;
      runtime.status = "LOCKED";
      propagateWinners(runtime);
      if (runtime.config.format === "open-mic-battle") { const first = nextCageMatch(runtime); if (first) prepare(runtime, first); }
      break;
    case "regie.prepare": {
      const next = payload.matchId ? runtime.matches.find((item) => item.id === payload.matchId) : nextCageMatch(runtime);
      if (!next) fail("cage_next_match_missing");
      prepare(runtime, next);
      reconcileAutoRegie(runtime);
      break;
    }
    case "regie.ready": {
      const person = requireParticipant();
      if (actorId !== person.id) fail("cage_readiness_owned_by_participant");
      if (!["GREENHOUSE", "READY", "CALLED"].includes(person.status)) fail("cage_not_in_greenhouse");
      if (!payload.readiness) fail("cage_readiness_required");
      person.readiness = { ...payload.readiness };
      person.present = payload.readiness.connection;
      person.status = cageParticipantReady(person) ? "READY" : "GREENHOUSE";
      const prepared = runtime.matches.find((item) => item.id === runtime.preparedMatchId);
      if (prepared) prepared.status = pairReady(runtime, prepared) ? "READY" : "GREENHOUSE";
      reconcileAutoRegie(runtime);
      break;
    }
    case "regie.promote": {
      const next = runtime.matches.find((item) => item.id === (payload.matchId ?? runtime.preparedMatchId));
      if (!next) fail("cage_next_match_missing");
      promote(runtime, next);
      break;
    }
    case "regie.auto": runtime.autoRegie = payload.enabled === true; reconcileAutoRegie(runtime); break;
    case "match.start": {
      const current = requireMatch();
      if (!["ON_STAGE", "TIE_BREAK"].includes(current.status)) fail("cage_performance_not_startable");
      requireStageReady(current);
      if (!current.steps[current.stepIndex]) fail("cage_performance_finished");
      current.timer = { startedAt: now, elapsedSeconds: current.timer.elapsedSeconds };
      current.status = "IN_PROGRESS";
      const side = current.steps[current.stepIndex].side;
      cageMatchPair(runtime, current).forEach((person, index) => { if (person && (side === "BOTH" || side === (index === 0 ? "A" : "B"))) person.status = "PERFORMING"; });
      break;
    }
    case "match.pause": {
      const current = requireMatch();
      if (current.status !== "IN_PROGRESS") fail("cage_performance_not_running");
      pauseTimer(current, now); current.status = "PAUSED";
      break;
    }
    case "match.resume": {
      const current = requireMatch();
      if (current.status !== "PAUSED") fail("cage_performance_not_paused");
      requireStageReady(current);
      current.incident = null;
      current.timer.startedAt = now;
      current.status = "IN_PROGRESS";
      break;
    }
    case "match.end-step": {
      const current = requireMatch();
      if (current.status !== "IN_PROGRESS") fail("cage_performance_not_running");
      pauseTimer(current, now);
      const previous = current.steps[current.stepIndex];
      cageMatchPair(runtime, current).forEach((person, index) => { if (person && (previous.side === "BOTH" || previous.side === (index === 0 ? "A" : "B"))) person.status = "PERFORMED"; });
      current.stepIndex++;
      current.timer = { startedAt: null, elapsedSeconds: 0 };
      current.status = current.stepIndex >= current.steps.length ? "READY_FOR_VOTE" : "ON_STAGE";
      break;
    }
    case "match.incident": {
      const current = requireMatch();
      const person = requireParticipant();
      if (![current.participantAId, current.participantBId].includes(person.id) || !["IN_PROGRESS", "PAUSED", "ON_STAGE"].includes(current.status)) fail("cage_incident_not_available");
      pauseTimer(current, now);
      current.status = "PAUSED";
      current.incident = { participantId: person.id, reason: payload.reason?.trim() || "Incident technique — reconnexion", openedAt: now, graceEndsAt: new Date(Date.parse(now) + runtime.config.rules.disconnectGraceSeconds * 1000).toISOString() };
      person.graceEndsAt = current.incident.graceEndsAt;
      break;
    }
    case "match.restart": {
      const current = requireMatch();
      if (current.status !== "PAUSED" || !current.incident) fail("cage_restart_requires_incident");
      requireStageReady(current);
      current.incident = null;
      current.timer = { startedAt: null, elapsedSeconds: 0 };
      current.status = "ON_STAGE";
      break;
    }
    case "vote.open": {
      const current = requireMatch();
      if (current.status !== "READY_FOR_VOTE" || current.stepIndex < current.steps.length) fail("cage_performances_incomplete");
      if (runtime.config.rules.votingMode !== "public" && (!runtime.votingPolicy || runtime.votingPolicy.mode === "public")) fail("cage_jury_not_configured");
      current.vote = { roundId: `${current.id}-vote-${current.tieBreakRound ?? 0}`, open: true, endsAt: new Date(Date.parse(now) + runtime.config.rules.votingDurationSeconds * 1000).toISOString(), ballots: {}, scoreA: 0, scoreB: 0, closedAt: null };
      current.status = "VOTING";
      break;
    }
    case "vote.cast": {
      const current = requireMatch();
      if (!current.vote?.open || current.status !== "VOTING") fail("cage_vote_closed");
      if (current.vote.endsAt && Date.parse(current.vote.endsAt) <= Date.parse(now)) fail("cage_vote_expired");
      if (payload.accountId && payload.accountId !== actorId) fail("cage_vote_account_mismatch");
      if ([current.participantAId, current.participantBId].includes(actorId)) fail("cage_public_viewer_required");
      if (payload.choice !== "A" && payload.choice !== "B") fail("cage_vote_invalid_choice");
      if (current.vote.ballots[actorId]) fail("cage_vote_already_cast");
      current.vote.ballots[actorId] = payload.choice;
      break;
    }
    case "vote.close": closeVote(runtime, requireMatch(), now); break;
    case "participant.recall": {
      const person = requireParticipant();
      if (!["GREENHOUSE", "READY", "CALLED", "NO_SHOW"].includes(person.status)) fail("cage_recall_not_available");
      person.status = cageParticipantReady(person) ? "READY" : "GREENHOUSE";
      break;
    }
    case "participant.grace": {
      const person = requireParticipant();
      if (person.seed === null || ["ELIMINATED", "FORFEIT", "DISQUALIFIED"].includes(person.status)) fail("cage_grace_not_available");
      person.graceEndsAt = new Date(Date.parse(now) + runtime.config.rules.noShowGraceSeconds * 1000).toISOString();
      break;
    }
    case "participant.replace": {
      const person = requireParticipant();
      const replacement = runtime.participants.find((item) => item.id === payload.replacementId);
      if (runtime.lockedAt && !runtime.config.rules.allowReplacement) fail("cage_replacement_forbidden");
      if (!payload.reason?.trim()) fail("cage_replacement_reason_required");
      if (!replacement || replacement.seed !== null || !cageParticipantReady(replacement) || replacement.guestStatus !== "backstage") fail("cage_replacement_not_ready");
      if (person.seed === null || ["ELIMINATED", "FORFEIT", "DISQUALIFIED"].includes(person.status)) fail("cage_participant_not_replaceable");
      const affected = runtime.matches.filter((item) => !finished(item) && [item.participantAId, item.participantBId].includes(person.id));
      if (affected.some((item) => ["PAUSED", "IN_PROGRESS", "VOTING", "READY_FOR_VOTE", "TIE_BREAK"].includes(item.status) || item.stepIndex > 0 || item.timer.elapsedSeconds > 0 || item.timer.startedAt !== null)) fail("cage_replacement_match_started");
      replacement.seed = person.seed; replacement.replacesId = person.id;
      replacement.status = person.guestStatus === "on_stage" ? "ON_STAGE" : "READY";
      replacement.guestStatus = person.guestStatus;
      person.seed = null; person.status = "NO_SHOW"; person.guestStatus = "audience";
      affected.forEach((item) => { if (item.participantAId === person.id) item.participantAId = replacement.id; if (item.participantBId === person.id) item.participantBId = replacement.id; });
      const prepared = runtime.matches.find((item) => item.id === runtime.preparedMatchId);
      if (prepared && affected.includes(prepared)) prepared.status = pairReady(runtime, prepared) ? "READY" : "GREENHOUSE";
      reconcileAutoRegie(runtime);
      payload.reason = `${replacement.person.name} remplace ${person.person.name}${payload.reason ? ` · ${payload.reason}` : ""}`;
      break;
    }
    case "participant.forfeit": {
      const person = requireParticipant();
      const target = runtime.matches.filter((item) => !finished(item) && item.participantAId && item.participantBId && [item.participantAId, item.participantBId].includes(person.id)).sort((a, b) => a.order - b.order)[0];
      if (!target || !person.graceEndsAt || Date.parse(person.graceEndsAt) > Date.parse(now)) fail("cage_forfeit_grace_not_elapsed");
      if (person.present && !target.incident) fail("cage_forfeit_requires_absence_or_incident");
      const winner = target.participantAId === person.id ? target.participantBId : target.participantAId;
      if (!winner) fail("cage_opponent_missing");
      resolveMatch(runtime, target, winner, "forfeit", now);
      if (runtime.preparedMatchId === target.id) runtime.preparedMatchId = null;
      break;
    }
    case "match.report": {
      const current = payload.matchId ? runtime.matches.find((item) => item.id === payload.matchId) : requireMatch();
      if (!current || finished(current) || ["IN_PROGRESS", "VOTING", "READY_FOR_VOTE"].includes(current.status)) fail("cage_match_not_reportable");
      if (!payload.reason?.trim()) fail("cage_report_reason_required");
      pauseTimer(current, now);
      current.status = "POSTPONED";
      cageMatchPair(runtime, current).forEach((person) => { if (person) { person.guestStatus = "backstage"; person.status = cageParticipantReady(person) ? "READY" : "GREENHOUSE"; } });
      if (runtime.activeMatchId === current.id) runtime.activeMatchId = null;
      if (runtime.preparedMatchId === current.id) runtime.preparedMatchId = null;
      break;
    }
  }
  runtime.processedCommandIds.push(command.idempotencyKey);
  (runtime.commandReceipts ??= {})[command.idempotencyKey] = { actorId, action: command.action, payload: canonicalPayload(command.payload) };
  runtime.journal.push({ id: command.idempotencyKey, at: now, actorId, action: command.action, matchId: match?.id ?? payload.matchId ?? null, detail: payload.reason?.trim() ?? "" });
  syncCageLegacyProjection(cage);
  return true;
}

const unknownPerson = (label: string): RoomPerson => ({ id: "", name: label, avatarUrl: "", role: "", microphone: "off", camera: "off" });
/** The video, timer and shell remain consumers of the same competition truth. */
export function syncCageLegacyProjection(cage: CageState) {
  const runtime = cage.runtime;
  if (!runtime) return;
  const person = (id: string | null, source: CageCompetitionMatch["sourceA"]) => runtime.participants.find((entry) => entry.id === id)?.person ?? unknownPerson(source ? "Vainqueur à déterminer" : "Exemption");
  cage.format = runtime.config.format;
  cage.event = { title: runtime.config.title, discipline: runtime.config.discipline, seeding: runtime.config.rosterMode === "random" ? "random" : "manual", status: runtime.status === "COMPLETED" ? "completed" : ["RUNNING", "FINAL", "PAUSED"].includes(runtime.status) ? "live" : "ready", updatedAt: runtime.journal.at(-1)?.at ?? cage.event?.updatedAt ?? new Date().toISOString() };
  if (runtime.config.format === "open-mic") {
    const entries = runtime.openMicEntries ?? [];
    const current = entries.find((entry) => entry.id === runtime.activeEntryId);
    cage.matches = [];
    cage.currentMatchId = "";
    cage.currentRound = 1;
    cage.openMicEntries = entries.map((entry) => ({ id: entry.id, personId: entry.participantId, order: entry.order, slot: `Passage ${entry.order}`, status: entry.status === "PERFORMED" ? "done" : entry.status === "SKIPPED" ? "absent" : entry.id === runtime.activeEntryId && !["POSTPONED", "WAITING"].includes(entry.status) ? "live" : entry.status === "READY" ? "ready" : "scheduled", score: entry.feedback?.closedAt && entry.feedback.mode === "scored" ? entry.feedback.average ?? undefined : undefined }));
    cage.battleRound = 1;
    cage.battleRoundCount = 1;
    cage.passageDurationSeconds = (current?.durationSeconds ?? runtime.config.rules.passageDurationSeconds) as CageState["passageDurationSeconds"];
    cage.battleStatus = current?.status === "IN_PROGRESS" ? "live-a" : current?.status === "PAUSED" ? current.incident ? "incident" : "paused" : current?.status === "PERFORMED" ? "done" : "ready";
    cage.battleStartedAt = current?.timer.startedAt ?? null;
    cage.battleElapsedSeconds = current?.timer.elapsedSeconds ?? 0;
    cage.battleActiveSide = null;
    cage.battleCountdownEndsAt = null;
    cage.votingOpen = false;
    cage.votingEndsAt = null;
    cage.resultsHidden = true;
    cage.votes = {};
    cage.resultHistory = [];
    return;
  }
  cage.matches = runtime.matches.map((match) => ({ id: match.id, round: match.round, competitorA: person(match.participantAId, match.sourceA), competitorB: person(match.participantBId, match.sourceB), status: finished(match) ? "done" : match.id === runtime.activeMatchId ? "live" : match.status === "READY" ? "ready" : "scheduled", scoreA: match.vote?.closedAt ? match.vote.scoreA : 0, scoreB: match.vote?.closedAt ? match.vote.scoreB : 0, winnerId: match.winnerId ?? undefined }));
  const current = runtime.matches.find((match) => match.id === runtime.activeMatchId) ?? runtime.matches.find((match) => match.id === runtime.preparedMatchId) ?? nextCageMatch(runtime);
  cage.currentMatchId = current?.id ?? "";
  cage.currentRound = current?.round ?? 1;
  const step = current?.steps[current.stepIndex];
  cage.battleRound = step ? Number(step.id.match(/^r(\d+)/)?.[1] ?? 1) : runtime.config.rules.rounds;
  cage.battleRoundCount = ([1, 2, 3, 5].includes(runtime.config.rules.rounds) ? runtime.config.rules.rounds : 1) as CageState["battleRoundCount"];
  cage.passageDurationSeconds = runtime.config.rules.passageDurationSeconds as CageState["passageDurationSeconds"];
  cage.battleActiveSide = step?.side === "B" ? "B" : step ? "A" : null;
  cage.battleStatus = current?.status === "IN_PROGRESS" ? step?.side === "B" ? "live-b" : "live-a" : current?.status === "PAUSED" ? current.incident ? "incident" : "paused" : current && ["READY_FOR_VOTE", "VOTING", "RESOLVED", "CLOSED"].includes(current.status) ? "done" : "ready";
  cage.battleStartedAt = current?.timer.startedAt ?? null;
  cage.battleElapsedSeconds = current?.timer.elapsedSeconds ?? 0;
  cage.battleCountdownEndsAt = null;
  cage.votingMode = runtime.config.rules.votingMode === "mixed" ? "weighted" : runtime.config.rules.votingMode;
  cage.votingDurationSeconds = runtime.config.rules.votingDurationSeconds;
  cage.votingOpen = current?.vote?.open ?? false;
  cage.votingEndsAt = current?.vote?.endsAt ?? null;
  cage.resultsHidden = !current?.vote?.closedAt;
  cage.votes = current?.vote?.ballots ?? {};
  cage.resultHistory = runtime.matches.filter((match) => match.winnerId && finished(match)).map((match) => ({ matchId: match.id, winnerId: match.winnerId!, scoreA: match.vote?.scoreA ?? 0, scoreB: match.vote?.scoreB ?? 0, validatedAt: match.vote?.closedAt ?? runtime.lockedAt ?? "" }));
}

/** Explicit migration only for the existing demonstration fixture, never for a live room. */
export function migrateCageDemoCompetition(cage: CageState): CageCompetitionRuntime {
  if (cage.runtime) return cage.runtime;
  const people = [...new Map(cage.matches.flatMap((match) => [match.competitorA, match.competitorB]).filter((person) => person.id).map((person) => [person.id, person])).values()];
  const currentId = cage.currentMatchId;
  const config: CageCompetitionConfig = { ...structuredClone(DEFAULT_CAGE_LAUNCH), title: cage.event?.title ?? DEFAULT_CAGE_LAUNCH.title, discipline: cage.event?.discipline ?? DEFAULT_CAGE_LAUNCH.discipline, participantCount: people.length, rosterMode: "prepared", rosterProfileIds: people.map((person) => person.id), rules: { ...DEFAULT_CAGE_LAUNCH.rules, rounds: cage.battleRoundCount ?? 3, passageDurationSeconds: cage.passageDurationSeconds ?? 120, votingDurationSeconds: cage.votingDurationSeconds } };
  const runtime = createCageCompetitionRuntime(config, people.map<TournamentParticipant>((person, index) => ({ id: person.id, person, present: true, registered: true, eligible: true, seed: index + 1, status: "SELECTED", readiness: { camera: true, microphone: true, connection: true, mixer: true, permissions: true }, guestStatus: "waiting", graceEndsAt: null })));
  runtime.lockedAt = cage.event?.updatedAt ?? new Date().toISOString();
  runtime.status = "RUNNING";
  const legacy = cage.matches;
  runtime.matches = legacy.map((match, index) => {
    const roundMatches = legacy.filter((item) => item.round === match.round);
    const localIndex = roundMatches.findIndex((item) => item.id === match.id);
    const preceding = legacy.filter((item) => item.round === match.round - 1);
    const current = match.id === currentId;
    return { ...blankMatch(runtime, match.round, localIndex + 1, index + 1), id: match.id, sourceA: match.round > 1 ? { matchId: preceding[localIndex * 2]?.id ?? "", kind: "winner" as const } : null, sourceB: match.round > 1 ? { matchId: preceding[localIndex * 2 + 1]?.id ?? "", kind: "winner" as const } : null, participantAId: match.round === 1 ? match.competitorA.id : null, participantBId: match.round === 1 ? match.competitorB.id : null, status: match.status === "done" ? "RESOLVED" as const : current ? "ON_STAGE" as const : "WAITING" as const, winnerId: match.winnerId ?? null, vote: match.status === "done" ? { roundId: `${match.id}-legacy-result`, open: false, endsAt: null, ballots: {}, scoreA: match.scoreA, scoreB: match.scoreB, closedAt: cage.event?.updatedAt ?? new Date().toISOString() } : null };
  });
  runtime.activeMatchId = currentId;
  propagateWinners(runtime);
  for (const match of runtime.matches.filter(finished)) cageMatchPair(runtime, match).forEach((person) => { if (person) { person.status = person.id === match.winnerId ? "ADVANCED" : "ELIMINATED"; person.guestStatus = person.status === "ELIMINATED" ? "audience" : "backstage"; } });
  const current = runtime.matches.find((match) => match.id === currentId);
  if (current) cageMatchPair(runtime, current).forEach((person) => { if (person) { person.status = "ON_STAGE"; person.guestStatus = "on_stage"; } });
  const next = nextCageMatch(runtime);
  if (next) prepare(runtime, next);
  runtime.journal.push({ id: "demo-competition-migration-v1", at: new Date().toISOString(), actorId: "demo", action: "demo.migrated", matchId: currentId, detail: "Scénario de démonstration explicite · match ROOK / ZÉLIE prêt" });
  cage.runtime = runtime;
  syncCageLegacyProjection(cage);
  return runtime;
}

/** Never expose the voter ledger or interim score, including to the host. */
export function projectCageCompetition(cage: CageState, accountId?: string, controls = false) {
  const runtime = cage.runtime;
  if (!runtime) return;
  runtime.processedCommandIds = [];
  runtime.commandReceipts = {};
  if (!controls) {
    runtime.journal = [];
    runtime.config.rosterProfileIds = [];
    const publicIds = new Set([...runtime.matches.flatMap((match) => [match.participantAId, match.participantBId]), ...(runtime.openMicEntries ?? []).map((entry) => entry.participantId)]);
    runtime.participants = runtime.participants.filter((person) => person.seed !== null || person.id === accountId || publicIds.has(person.id)).map((person) => person.id === accountId ? person : ({ ...person, readiness: { camera: false, microphone: false, connection: false, mixer: false, permissions: false }, graceEndsAt: null, person: { ...person.person, access: undefined } }));
    runtime.matches.forEach((match) => { if (match.incident && match.incident.participantId !== accountId) match.incident = null; });
  }
  runtime.matches.forEach((match) => {
    if (!match.vote) return;
    const own = accountId ? match.vote.ballots[accountId] : undefined;
    match.vote.ballots = own && accountId ? { [accountId]: own } : {};
    if (!match.vote.closedAt) { match.vote.scoreA = 0; match.vote.scoreB = 0; }
  });
  runtime.openMicEntries?.forEach((entry) => {
    if (!controls && entry.incident && entry.incident.participantId !== accountId) entry.incident = null;
    if (!entry.feedback) return;
    const own = accountId ? entry.feedback.responses[accountId] : undefined;
    entry.feedback.responses = accountId && own !== undefined ? { [accountId]: own } : {};
    if (!entry.feedback.closedAt) { entry.feedback.count = 0; entry.feedback.total = 0; entry.feedback.average = null; }
  });
  syncCageLegacyProjection(cage);
}

/** A championship accumulates match wins. Tied totals remain tied; no invented point rule. */
export function cageChampionshipStandings(runtime: CageCompetitionRuntime) {
  if (runtime.config.format !== "championship") return [];
  const rows = runtime.participants.filter((person) => person.seed !== null).map((person) => {
    const played = runtime.matches.filter((match) => finished(match) && [match.participantAId, match.participantBId].includes(person.id));
    const wins = played.filter((match) => match.winnerId === person.id).length;
    return { person: person.person, wins, played: played.length, losses: played.filter((match) => match.winnerId && match.winnerId !== person.id).length };
  }).sort((a, b) => b.wins - a.wins || a.person.name.localeCompare(b.person.name, "fr"));
  return rows.map((row) => ({ ...row, rank: rows.findIndex((candidate) => candidate.wins === row.wins) + 1 }));
}
