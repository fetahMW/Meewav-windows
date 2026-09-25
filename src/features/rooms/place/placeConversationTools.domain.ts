export type PlaceConversationTool = "floor" | "queue" | "clash" | "challenges";
export type PlaceToolPerson = { id: string; name: string; avatar: string };
export type PlaceToolClock = { seconds: number; remaining: number; deadline: number | null };
export type PlaceFloor = PlaceToolClock & {
  prompt: string; open: boolean; queue: string[]; current: string | null;
  status: "idle" | "running" | "paused" | "ended"; completed: string[];
};
export type PlaceClash = PlaceToolClock & {
  id: string; title: string; left: string; right: string; accepted: string[];
  rounds: number; round: number; turn: 0 | 1;
  status: "inviting" | "running" | "paused" | "ended" | "cancelled";
};
export type PlaceChallenge = PlaceToolClock & {
  id: string; title: string; author: string; target: string | null;
  accepted: string[]; completed: string[];
  status: "open" | "running" | "done" | "cancelled";
};
export type PlaceConversationState = {
  version: 1; revision: number; floor: PlaceFloor; clash: PlaceClash | null; challenges: PlaceChallenge[];
};
export type PlaceConversationCommand =
  | { type: "floor.configure"; prompt: string; seconds: number }
  | { type: "floor.open"; open: boolean }
  | { type: "floor.join"; personId: string }
  | { type: "floor.leave"; personId: string }
  | { type: "floor.next" }
  | { type: "floor.pause" }
  | { type: "floor.resume" }
  | { type: "floor.end" }
  | { type: "clash.invite"; id: string; title: string; left: string; right: string; seconds: number; rounds: number }
  | { type: "clash.accept" }
  | { type: "clash.decline" }
  | { type: "clash.start" }
  | { type: "clash.next" }
  | { type: "clash.pause" }
  | { type: "clash.resume" }
  | { type: "clash.end" }
  | { type: "challenge.create"; id: string; title: string; target: string | null; seconds: number }
  | { type: "challenge.accept"; id: string }
  | { type: "challenge.start"; id: string }
  | { type: "challenge.complete"; id: string }
  | { type: "challenge.validate"; id: string }
  | { type: "challenge.cancel"; id: string };

export function createPlaceConversationState(): PlaceConversationState {
  return {
    version: 1, revision: 0,
    floor: { prompt: "", open: true, seconds: 60, remaining: 60, deadline: null, queue: [], current: null, status: "idle", completed: [] },
    clash: null, challenges: [],
  };
}

export function clockRemaining(clock: PlaceToolClock, now = Date.now()) {
  return clock.deadline === null ? clock.remaining : Math.max(0, Math.ceil((clock.deadline - now) / 1_000));
}

function text(value: string) {
  const clean = value.trim();
  if (!clean || clean.length > 160) throw new Error("Écris un intitulé de 1 à 160 caractères.");
  return clean;
}

function duration(seconds: number) {
  if (![30, 60, 90, 120, 180, 300].includes(seconds)) throw new Error("Choisis une durée proposée.");
  return seconds;
}

function startClock(clock: PlaceToolClock, now: number) {
  clock.remaining = clock.seconds;
  clock.deadline = now + clock.seconds * 1_000;
}

/** No microphone, camera or mixing authority is granted by these social tools. */
export function reducePlaceConversation(
  previous: PlaceConversationState,
  command: PlaceConversationCommand,
  actor: { id: string; isHost: boolean; canEngage: boolean },
  eligibleIds: readonly string[],
  now = Date.now(),
): PlaceConversationState {
  if (!actor.id || !actor.canEngage) throw new Error("Rejoins la Room pour participer.");
  const state = structuredClone(previous);
  const floor = state.floor;
  const host = () => { if (!actor.isHost) throw new Error("Cette commande est réservée au host."); };
  const person = (id: string) => { if (!eligibleIds.includes(id)) throw new Error("Cette personne n’est plus disponible dans la Room."); };
  const ownOrHost = (id: string) => { if (!actor.isHost && id !== actor.id) throw new Error("Tu peux uniquement gérer ta participation."); };
  switch (command.type) {
    case "floor.configure":
      host();
      if (floor.current) throw new Error("Termine le tour en cours avant de modifier la durée.");
      floor.prompt = command.prompt.trim().slice(0, 160);
      floor.seconds = duration(command.seconds); floor.remaining = floor.seconds;
      break;
    case "floor.open": host(); floor.open = command.open; break;
    case "floor.join":
      ownOrHost(command.personId); person(command.personId);
      if (!floor.open && !actor.isHost) throw new Error("Les demandes de parole sont fermées.");
      if (floor.queue.includes(command.personId) || floor.current === command.personId) return previous;
      if (floor.queue.length >= 50) throw new Error("La file de parole est complète.");
      floor.queue.push(command.personId); break;
    case "floor.leave":
      ownOrHost(command.personId);
      floor.queue = floor.queue.filter((id) => id !== command.personId);
      if (floor.current === command.personId) { floor.current = null; floor.deadline = null; floor.status = "ended"; }
      break;
    case "floor.next": {
      host();
      const next = floor.queue.find((id) => eligibleIds.includes(id));
      if (!next) throw new Error("Ajoute une personne à la file de parole.");
      if (floor.current) floor.completed = [...floor.completed, floor.current].slice(-50);
      floor.queue = floor.queue.filter((id) => id !== next && eligibleIds.includes(id));
      floor.current = next; floor.status = "running"; startClock(floor, now); break;
    }
    case "floor.pause":
      host(); if (floor.status !== "running") return previous;
      floor.remaining = clockRemaining(floor, now); floor.deadline = null; floor.status = "paused"; break;
    case "floor.resume":
      host(); if (floor.status !== "paused" || floor.remaining <= 0) return previous;
      floor.deadline = now + floor.remaining * 1_000; floor.status = "running"; break;
    case "floor.end":
      host();
      if (floor.current) floor.completed = [...floor.completed, floor.current].slice(-50);
      floor.current = null; floor.deadline = null; floor.remaining = floor.seconds; floor.status = "ended"; break;
    case "clash.invite":
      host(); person(command.left); person(command.right);
      if (command.left === command.right) throw new Error("Choisis deux personnes différentes.");
      if (state.clash && !["ended", "cancelled"].includes(state.clash.status)) throw new Error("Termine le clash actuel avant d’en créer un autre.");
      if (![1, 3, 5].includes(command.rounds)) throw new Error("Choisis 1, 3 ou 5 manches.");
      state.clash = { id: command.id, title: text(command.title), left: command.left, right: command.right,
        seconds: duration(command.seconds), remaining: command.seconds, deadline: null,
        rounds: command.rounds, round: 1, turn: 0, accepted: [], status: "inviting" };
      break;
    case "clash.accept":
    case "clash.decline": {
      const clash = state.clash;
      if (!clash || clash.status !== "inviting" || ![clash.left, clash.right].includes(actor.id)) throw new Error("Aucune invitation à ce clash pour toi.");
      if (command.type === "clash.decline") clash.status = "cancelled";
      else if (!clash.accepted.includes(actor.id)) clash.accepted.push(actor.id);
      else return previous;
      break;
    }
    case "clash.start": {
      host(); const clash = state.clash;
      if (!clash || clash.status !== "inviting" || ![clash.left, clash.right].every((id) => clash.accepted.includes(id))) throw new Error("Les deux participants doivent accepter le clash.");
      person(clash.left); person(clash.right);
      clash.status = "running"; startClock(clash, now); break;
    }
    case "clash.next": {
      host(); const clash = state.clash;
      if (!clash || !["running", "paused"].includes(clash.status)) return previous;
      if (clash.turn === 1 && clash.round >= clash.rounds) { clash.status = "ended"; clash.deadline = null; clash.remaining = 0; }
      else {
        if (clash.turn === 1) clash.round += 1;
        clash.turn = clash.turn === 0 ? 1 : 0;
        clash.status = "running"; startClock(clash, now);
      }
      break;
    }
    case "clash.pause": {
      host(); const clash = state.clash;
      if (!clash || clash.status !== "running") return previous;
      clash.remaining = clockRemaining(clash, now); clash.deadline = null; clash.status = "paused"; break;
    }
    case "clash.resume": {
      host(); const clash = state.clash;
      if (!clash || clash.status !== "paused" || clash.remaining <= 0) return previous;
      clash.deadline = now + clash.remaining * 1_000; clash.status = "running"; break;
    }
    case "clash.end":
      host(); if (state.clash) { state.clash.status = state.clash.status === "inviting" ? "cancelled" : "ended"; state.clash.deadline = null; }
      break;
    case "challenge.create":
      if (command.target) person(command.target);
      if (state.challenges.some((challenge) => challenge.id === command.id)) return previous;
      if (state.challenges.filter((challenge) => ["open", "running"].includes(challenge.status)).length >= 6) throw new Error("Termine un défi avant d’en ajouter un autre.");
      state.challenges = [{ id: command.id, title: text(command.title), author: actor.id, target: command.target,
        seconds: duration(command.seconds), remaining: command.seconds, deadline: null, accepted: [], completed: [], status: "open" as const }, ...state.challenges]
        .filter((challenge, index) => index < 20 || ["open", "running"].includes(challenge.status));
      break;
    default: {
      const challenge = state.challenges.find((item) => item.id === command.id);
      if (!challenge) throw new Error("Ce défi n’est plus disponible.");
      if (command.type === "challenge.accept") {
        if (challenge.status !== "open") throw new Error("Ce défi n’accepte plus de participants.");
        if (challenge.target && challenge.target !== actor.id) throw new Error("Ce défi est adressé à une autre personne.");
        if (challenge.accepted.includes(actor.id)) return previous;
        if (challenge.accepted.length >= 50) throw new Error("Ce défi est complet.");
        challenge.accepted.push(actor.id);
      } else if (command.type === "challenge.start") {
        host();
        if (challenge.status !== "open" || !challenge.accepted.length) throw new Error("Au moins une personne doit accepter le défi.");
        challenge.status = "running"; startClock(challenge, now);
      } else if (command.type === "challenge.complete") {
        if (challenge.status !== "running" || !challenge.accepted.includes(actor.id)) throw new Error("Tu dois participer à ce défi pour le déclarer terminé.");
        if (challenge.completed.includes(actor.id)) return previous;
        challenge.completed.push(actor.id);
      } else if (command.type === "challenge.validate") {
        host(); if (challenge.status !== "running" || !challenge.completed.length) throw new Error("Attends qu’un participant ait terminé le défi.");
        challenge.status = "done"; challenge.deadline = null;
      } else if (command.type === "challenge.cancel") {
        host(); if (!["open", "running"].includes(challenge.status)) return previous;
        challenge.status = "cancelled"; challenge.deadline = null;
      }
    }
  }
  state.revision += 1;
  return state;
}
