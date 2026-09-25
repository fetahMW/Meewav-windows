import type { User } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabaseClient";
import type { MusicSceneOnboardingPayload } from "./musicSceneOnboardingContract";
import { persistMusicSceneProfile } from "./musicSceneProfilePersistence";

const SESSION_WAIT_ATTEMPTS = 24;
const SESSION_WAIT_INTERVAL_MS = 250;

function wait(duration: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, duration));
}

async function waitForAuthenticatedUser(): Promise<User> {
  for (let attempt = 0; attempt < SESSION_WAIT_ATTEMPTS; attempt += 1) {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (data.session?.user) return data.session.user;
    await wait(SESSION_WAIT_INTERVAL_MS);
  }
  throw new Error("La session sociale n’a pas pu être finalisée.");
}

export async function finalizeMusicSceneOAuthOnboarding(
  payload: MusicSceneOnboardingPayload,
) {
  if (payload.auth?.flow !== "oauth") return payload;
  return persistMusicSceneProfile(await waitForAuthenticatedUser(), payload);
}
