import { tallyRoomVote } from "../voting/roomVoting";
import type { CageCompetitionCommand, CageCompetitionRuntime, CageOpenMicPassage, TournamentParticipant } from "./cageCompetition.types";

const finished = (entry: CageOpenMicPassage) => entry.status === "PERFORMED" || entry.status === "SKIPPED";
const available = (person?: TournamentParticipant) => Boolean(person?.present && person.registered && person.eligible && !["NO_SHOW", "FORFEIT", "DISQUALIFIED"].includes(person.status));
const ready = (person?: TournamentParticipant) => Boolean(available(person) && person && (["camera", "microphone", "connection", "mixer", "permissions"] as const).every((key) => person.readiness[key] === true));
function fail(message: string): never { throw new Error(message); }
const byId = (runtime: CageCompetitionRuntime, id: string) => runtime.participants.find((person) => person.id === id);
export const nextCageOpenMicEntry = (runtime: CageCompetitionRuntime) => runtime.openMicEntries?.filter((entry) => !finished(entry) && entry.status !== "POSTPONED" && entry.id !== runtime.activeEntryId).sort((a, b) => a.order - b.order)[0];

export function initializeOpenMicProgram(runtime: CageCompetitionRuntime) {
  runtime.matches = [];
  runtime.activeMatchId = null;
  runtime.preparedMatchId = null;
  runtime.lockedAt = null;
  runtime.publicBracketVisible = false;
  runtime.openMicEntries = runtime.participants.filter((person) => person.seed !== null).sort((a, b) => (a.seed ?? 0) - (b.seed ?? 0)).map((person, index) => ({ id: `openmic-${person.id}`, order: index + 1, participantId: person.id, status: "WAITING", timer: { startedAt: null, elapsedSeconds: 0 }, durationSeconds: runtime.config.rules.passageDurationSeconds, incident: null }));
  runtime.activeEntryId = null;
  runtime.preparedEntryId = null;
  runtime.feedbackEntryId = null;
  runtime.status = runtime.openMicEntries.length ? "PREPARING" : "CHECK_IN";
}

function prepare(runtime: CageCompetitionRuntime, entry: CageOpenMicPassage) {
  if (finished(entry) || entry.id === runtime.activeEntryId) fail("cage_openmic_entry_not_preparable");
  const previous = runtime.openMicEntries?.find((item) => item.id === runtime.preparedEntryId);
  const person = byId(runtime, entry.participantId);
  if (!person || !available(person)) fail("cage_participant_unavailable");
  if (person.guestStatus === "on_stage") fail("cage_next_artist_still_on_stage");
  if (previous && previous.id !== entry.id && !finished(previous)) {
    if (previous.id === runtime.activeEntryId) fail("cage_openmic_entry_already_active");
    previous.status = "WAITING";
    const previousArtist = byId(runtime, previous.participantId);
    if (previousArtist) previousArtist.status = "SELECTED";
  }
  person.guestStatus = "backstage";
  person.status = ready(person) ? "READY" : "GREENHOUSE";
  entry.status = person.status;
  runtime.preparedEntryId = entry.id;
}

function promote(runtime: CageCompetitionRuntime, entry: CageOpenMicPassage) {
  const active = runtime.openMicEntries?.find((item) => item.id === runtime.activeEntryId);
  if (active && !finished(active) && active.status !== "POSTPONED") fail("cage_openmic_entry_already_active");
  if (runtime.preparedEntryId !== entry.id || entry.status !== "READY") fail("cage_openmic_entry_not_ready");
  const person = byId(runtime, entry.participantId);
  if (!person || !ready(person) || person.guestStatus !== "backstage" || person.status !== "READY") fail("cage_openmic_entry_not_ready");
  if (runtime.participants.some((item) => item.guestStatus === "on_stage" && item.id !== person.id)) fail("cage_stage_not_empty");
  person.status = "ON_STAGE";
  person.guestStatus = "on_stage";
  entry.status = "ON_STAGE";
  runtime.activeEntryId = entry.id;
  runtime.preparedEntryId = null;
  runtime.status = "RUNNING";
  const next = nextCageOpenMicEntry(runtime);
  if (next && available(byId(runtime, next.participantId))) prepare(runtime, next);
}

function reconcileAutoOpenMic(runtime: CageCompetitionRuntime) {
  if (!runtime.autoRegie || ["COMPLETED", "CANCELLED"].includes(runtime.status)) return;
  const active = runtime.openMicEntries?.find((entry) => entry.id === runtime.activeEntryId);
  if (active && !finished(active) && active.status !== "POSTPONED") return;
  const next = runtime.openMicEntries?.find((entry) => entry.id === runtime.preparedEntryId && ["GREENHOUSE", "READY"].includes(entry.status));
  if (!next || !available(byId(runtime, next.participantId))) return;
  const candidate = byId(runtime, next.participantId);
  next.status = candidate?.status === "READY" && candidate.guestStatus === "backstage" && ready(candidate) ? "READY" : "GREENHOUSE";
  if (next.status === "READY") promote(runtime, next);
}

function stopTimer(entry: CageOpenMicPassage, now: string) {
  if (entry.timer.startedAt) entry.timer.elapsedSeconds += Math.max(0, (Date.parse(now) - Date.parse(entry.timer.startedAt)) / 1000);
  entry.timer.startedAt = null;
}

function afterPassage(runtime: CageCompetitionRuntime) {
  const allDone = runtime.openMicEntries?.length && runtime.openMicEntries.every(finished);
  const feedbackEnabled = runtime.config.rules.openMicFeedback && runtime.config.rules.openMicFeedback !== "none";
  const pendingFeedback = feedbackEnabled && runtime.openMicEntries?.some((entry) => entry.status === "PERFORMED" && !entry.feedback?.closedAt);
  if (allDone && !pendingFeedback) { runtime.status = "COMPLETED"; runtime.preparedEntryId = null; return; }
  const next = runtime.openMicEntries?.find((entry) => entry.id === runtime.preparedEntryId && !finished(entry)) ?? nextCageOpenMicEntry(runtime);
  if (!next || !available(byId(runtime, next.participantId))) return;
  prepare(runtime, next);
  const active = runtime.openMicEntries?.find((entry) => entry.id === runtime.activeEntryId);
  if (runtime.autoRegie && next.status === "READY" && (!active || finished(active))) promote(runtime, next);
}

function closeFeedback(runtime: CageCompetitionRuntime, entry: CageOpenMicPassage, now: string) {
  if (!entry.feedback || entry.feedback.closedAt) return;
  const policy = runtime.votingPolicy;
  const tally = tallyRoomVote(policy,entry.feedback.responses,[1,2,3,4,5]);
  const values = Object.entries(entry.feedback.responses).filter(([id])=>policy?.mode!=="jury" || policy.jurorIds.includes(id)).map(([,value])=>value);
  entry.feedback.count = values.length;
  entry.feedback.total = values.reduce((sum, value) => sum + value, 0);
  entry.feedback.average = entry.feedback.mode === "scored" && values.length ? (policy?.mode && policy.mode!=="public" ? tally.ready ? tally.percentages.reduce((sum,pct,index)=>sum+(index+1)*pct/100,0) : null : entry.feedback.total / values.length) : null;
  entry.feedback.open = false;
  entry.feedback.closedAt = now;
  if (runtime.feedbackEntryId === entry.id) runtime.feedbackEntryId = null;
  if (runtime.openMicEntries?.every(finished) && runtime.openMicEntries.every((item) => item.status === "SKIPPED" || item.feedback?.closedAt)) runtime.status = "COMPLETED";
}

export function finalizeExpiredOpenMicFeedback(runtime: CageCompetitionRuntime, now: string) {
  let changed = false;
  for (const entry of runtime.openMicEntries ?? []) {
    if (entry.feedback?.open && entry.feedback.endsAt && Date.parse(entry.feedback.endsAt) <= Date.parse(now)) {
      closeFeedback(runtime, entry, now);
      runtime.journal.push({ id: `feedback-expired-${entry.id}`, at: now, actorId: "system", action: "openmic.feedback.close", matchId: null, detail: `Appréciations closes · passage ${entry.order}` });
      changed = true;
    }
  }
  return changed;
}

/** Individual Open Mic programme. It shares the guest preparation contract, never duel resolution. */
export function applyOpenMicCommand(runtime: CageCompetitionRuntime, command: CageCompetitionCommand, actorId: string, now: string) {
  const entries = runtime.openMicEntries ?? (runtime.openMicEntries = []);
  const payload = command.payload ?? {};
  const feedbackAction = command.action.startsWith("openmic.feedback.");
  const participantActionEntry = command.action.startsWith("participant.") && payload.participantId ? entries.find((item) => item.participantId === payload.participantId && !finished(item)) : undefined;
  const entry = entries.find((item) => item.id === (payload.entryId ?? participantActionEntry?.id ?? (feedbackAction ? runtime.feedbackEntryId : runtime.activeEntryId)));
  const participant = payload.participantId ? byId(runtime, payload.participantId) : entry ? byId(runtime, entry.participantId) : undefined;
  const scoped = ["openmic.move", "openmic.remove", "openmic.start", "openmic.pause", "openmic.resume", "openmic.end", "openmic.incident", "openmic.restart", "openmic.report", "openmic.feedback.open", "openmic.feedback.close", "openmic.feedback.cast", "participant.forfeit", "participant.replace"].includes(command.action);
  if (scoped && (!entry || command.expectedEntryId !== entry.id)) fail("cage_openmic_entry_conflict");
  if (["openmic.start", "openmic.pause", "openmic.resume", "openmic.end", "openmic.incident", "openmic.restart"].includes(command.action) && runtime.activeEntryId !== entry?.id) fail("cage_openmic_entry_not_active");
  const current = () => entry ?? fail("cage_openmic_entry_missing");
  const person = () => participant ?? fail("cage_participant_missing");
  const stageReady = () => { if (!ready(person()) || person().guestStatus !== "on_stage") fail("cage_stage_not_ready"); };
  const reorder = () => {
    entries.sort((a, b) => a.order - b.order).forEach((item, index) => { item.order = index + 1; const member = byId(runtime, item.participantId); if (member) member.seed = index + 1; });
  };
  switch (command.action) {
    case "broadcast.bracket": runtime.publicBracketVisible = payload.enabled === true; break;
    case "openmic.schedule": {
      if (!Array.isArray(payload.participantIds)) fail("cage_participants_required");
      for (const id of payload.participantIds) {
        if (entries.some((item) => item.participantId === id)) continue;
        const candidate = byId(runtime, id);
        if (!candidate || !available(candidate)) fail("cage_participant_unavailable");
        if (entries.length >= runtime.config.participantCount) fail("cage_roster_full");
        candidate.seed = entries.length + 1;
        candidate.status = "SELECTED";
        entries.push({ id: `openmic-${id}`, order: entries.length + 1, participantId: id, status: "WAITING", timer: { startedAt: null, elapsedSeconds: 0 }, durationSeconds: runtime.config.rules.passageDurationSeconds, incident: null });
      }
      if (!runtime.activeEntryId) runtime.status = "PREPARING";
      break;
    }
    case "openmic.move": {
      const target = entries.find((item) => item.id === payload.entryId);
      if (!target || target.status !== "WAITING") fail("cage_openmic_order_locked");
      entries.sort((a, b) => a.order - b.order);
      const index = entries.indexOf(target), destination = index + (payload.direction === -1 ? -1 : 1);
      if (destination < 0 || destination >= entries.length) break;
      if (entries[destination].status !== "WAITING") fail("cage_openmic_order_locked");
      [entries[index], entries[destination]] = [entries[destination], entries[index]];
      entries.forEach((item, order) => { item.order = order + 1; });
      reorder();
      break;
    }
    case "openmic.remove": {
      const target = entries.find((item) => item.id === payload.entryId);
      if (!target || !["WAITING", "POSTPONED"].includes(target.status)) fail("cage_openmic_entry_started");
      entries.splice(entries.indexOf(target), 1);
      const candidate = byId(runtime, target.participantId);
      if (candidate) { candidate.seed = null; candidate.status = "WAITING"; }
      reorder();
      break;
    }
    case "openmic.prepare": {
      const next = payload.entryId ? entries.find((item) => item.id === payload.entryId) : nextCageOpenMicEntry(runtime);
      if (!next) fail("cage_openmic_next_missing");
      prepare(runtime, next);
      reconcileAutoOpenMic(runtime);
      break;
    }
    case "openmic.promote": {
      const next = entries.find((item) => item.id === (payload.entryId ?? runtime.preparedEntryId));
      if (!next) fail("cage_openmic_next_missing");
      promote(runtime, next);
      break;
    }
    case "regie.ready": {
      const candidate = person();
      if (candidate.id !== actorId) fail("cage_readiness_owned_by_participant");
      if (!["READY", "GREENHOUSE", "CALLED"].includes(candidate.status) || !payload.readiness) fail("cage_not_in_greenhouse");
      candidate.readiness = { ...payload.readiness };
      candidate.present = payload.readiness.connection;
      candidate.status = ready(candidate) ? "READY" : "GREENHOUSE";
      const prepared = entries.find((item) => item.id === runtime.preparedEntryId && item.participantId === candidate.id);
      if (prepared) prepared.status = candidate.status;
      reconcileAutoOpenMic(runtime);
      break;
    }
    case "regie.auto": runtime.autoRegie = payload.enabled === true; reconcileAutoOpenMic(runtime); break;
    case "openmic.start": {
      const target = current();
      if (runtime.activeEntryId !== target.id || target.status !== "ON_STAGE") fail("cage_openmic_not_startable");
      stageReady();
      target.status = "IN_PROGRESS";
      target.timer = { startedAt: now, elapsedSeconds: target.timer.elapsedSeconds };
      person().status = "PERFORMING";
      runtime.status = "RUNNING";
      break;
    }
    case "openmic.pause": {
      const target = current();
      if (target.status !== "IN_PROGRESS") fail("cage_openmic_not_running");
      stopTimer(target, now); target.status = "PAUSED";
      runtime.status = "PAUSED";
      break;
    }
    case "openmic.resume": {
      const target = current();
      if (target.status !== "PAUSED") fail("cage_openmic_not_paused");
      stageReady(); target.status = "IN_PROGRESS"; target.timer.startedAt = now; target.incident = null; runtime.status = "RUNNING";
      break;
    }
    case "openmic.end": {
      const target = current();
      if (target.status !== "IN_PROGRESS") fail("cage_openmic_not_running");
      stopTimer(target, now); target.status = "PERFORMED"; target.incident = null;
      person().status = "PERFORMED"; person().guestStatus = "backstage";
      afterPassage(runtime);
      break;
    }
    case "openmic.incident": {
      const target = current();
      if (!["IN_PROGRESS", "PAUSED"].includes(target.status)) fail("cage_openmic_not_running");
      stopTimer(target, now); target.status = "PAUSED";
      runtime.status = "PAUSED";
      target.incident = { participantId: target.participantId, reason: payload.reason?.trim() || "Incident technique — reconnexion", openedAt: now, graceEndsAt: new Date(Date.parse(now) + runtime.config.rules.disconnectGraceSeconds * 1000).toISOString() };
      person().graceEndsAt = target.incident.graceEndsAt;
      break;
    }
    case "openmic.restart": {
      const target = current();
      if (target.status !== "PAUSED" || !target.incident) fail("cage_restart_requires_incident");
      stageReady(); target.status = "ON_STAGE"; target.timer = { startedAt: null, elapsedSeconds: 0 }; target.incident = null;
      break;
    }
    case "openmic.report": {
      const target = current();
      if (finished(target) || target.status === "IN_PROGRESS") fail("cage_report_requires_pause");
      if (!payload.reason?.trim()) fail("cage_report_reason_required");
      stopTimer(target, now); target.status = "POSTPONED";
      person().guestStatus = "backstage"; person().status = ready(person()) ? "READY" : "GREENHOUSE";
      if (runtime.activeEntryId === target.id) runtime.activeEntryId = null;
      if (runtime.preparedEntryId === target.id) runtime.preparedEntryId = null;
      break;
    }
    case "participant.recall":
    case "participant.grace": {
      const candidate = person();
      if (!entries.some((item) => item.participantId === candidate.id && !finished(item))) fail("cage_openmic_entry_missing");
      candidate.graceEndsAt = new Date(Date.parse(now) + runtime.config.rules.noShowGraceSeconds * 1000).toISOString();
      if (candidate.guestStatus !== "on_stage") candidate.status = "CALLED";
      break;
    }
    case "participant.replace": {
      const candidate = person();
      const target = entries.find((item) => item.participantId === candidate.id && !finished(item));
      const replacement = runtime.participants.find((item) => item.id === payload.replacementId);
      if (!runtime.config.rules.allowReplacement || !target || !["WAITING", "READY", "GREENHOUSE", "POSTPONED", "ON_STAGE"].includes(target.status) || target.timer.elapsedSeconds > 0 || target.timer.startedAt !== null) fail("cage_replacement_forbidden");
      if (!replacement || entries.some((item) => item.participantId === replacement.id) || !ready(replacement) || replacement.guestStatus !== "backstage") fail("cage_replacement_not_ready");
      if (!payload.reason?.trim()) fail("cage_replacement_reason_required");
      replacement.seed = candidate.seed; replacement.replacesId = candidate.id;
      replacement.guestStatus = candidate.guestStatus; replacement.status = target.status === "ON_STAGE" ? "ON_STAGE" : "READY";
      candidate.seed = null; candidate.status = "NO_SHOW"; candidate.guestStatus = "backstage";
      target.participantId = replacement.id;
      if (target.status === "GREENHOUSE" || target.status === "READY") target.status = "READY";
      reconcileAutoOpenMic(runtime);
      break;
    }
    case "participant.forfeit": {
      const candidate = person();
      const target = entries.find((item) => item.participantId === candidate.id && !finished(item));
      if (!target || candidate.present && !target.incident) fail("cage_forfeit_requires_absence_or_incident");
      const grace = target.incident?.graceEndsAt ?? candidate.graceEndsAt;
      if (!grace || Date.parse(grace) > Date.parse(now)) fail("cage_grace_period_active");
      stopTimer(target, now); target.status = "SKIPPED";
      candidate.status = "NO_SHOW"; candidate.guestStatus = "backstage";
      if (runtime.preparedEntryId === target.id) runtime.preparedEntryId = null;
      afterPassage(runtime);
      break;
    }
    case "openmic.feedback.open": {
      const target = current();
      const mode = runtime.config.rules.openMicFeedback;
      if (mode !== "appreciation" && mode !== "scored") fail("cage_openmic_feedback_disabled");
      if (target.status !== "PERFORMED" || target.feedback) fail("cage_openmic_feedback_unavailable");
      if (entries.some((item) => item.feedback?.open)) fail("cage_openmic_feedback_already_open");
      target.feedback = { mode, open: true, endsAt: new Date(Date.parse(now) + runtime.config.rules.votingDurationSeconds * 1000).toISOString(), closedAt: null, responses: {}, count: 0, total: 0, average: null };
      runtime.feedbackEntryId = target.id;
      break;
    }
    case "openmic.feedback.cast": {
      const target = current(), feedback = target.feedback;
      if (!feedback?.open || feedback.endsAt && Date.parse(feedback.endsAt) <= Date.parse(now)) fail("cage_openmic_feedback_closed");
      if (target.participantId === actorId || payload.accountId && payload.accountId !== actorId) fail("cage_public_viewer_required");
      if (feedback.responses[actorId] !== undefined) fail("cage_vote_already_cast");
      if (feedback.mode === "scored" && ![1, 2, 3, 4, 5].includes(payload.score ?? 0)) fail("cage_openmic_score_invalid");
      feedback.responses[actorId] = feedback.mode === "appreciation" ? 1 : payload.score!;
      break;
    }
    case "openmic.feedback.close": {
      const target = current();
      if (!target.feedback?.open) fail("cage_openmic_feedback_closed");
      closeFeedback(runtime, target, now);
      break;
    }
    default: fail("cage_action_not_for_open_mic");
  }
}

/** Open Mic scores are individual feedback, never victories or elimination. */
export function cageOpenMicStandings(runtime: CageCompetitionRuntime) {
  if (runtime.config.rules.openMicFeedback !== "scored") return [];
  const standings = (runtime.openMicEntries ?? []).filter((entry) => entry.feedback?.closedAt && entry.feedback.mode === "scored" && entry.feedback.count > 0).map((entry) => ({ entryId: entry.id, person: byId(runtime, entry.participantId)?.person, average: entry.feedback!.average!, responses: entry.feedback!.count })).sort((a, b) => b.average - a.average);
  return standings.map((item) => ({ ...item, rank: standings.findIndex((candidate) => candidate.average === item.average) + 1 }));
}
