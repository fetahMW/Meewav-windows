import { supabase } from "../../lib/supabaseClient";

export async function startSocialSignIn(provider: "google" | "apple") {
  const bridge = window.meewavDesktop;
  const desktop = bridge?.version === 1;
  if (desktop && !bridge.openAuthUrl) {
    throw new Error("Relance Meewav pour activer la connexion Google et Apple.");
  }
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: desktop
        ? "meewav://app/auth/callback"
        : new URL("/auth/callback", window.location.origin).href,
      skipBrowserRedirect: desktop,
    },
  });
  if (error) throw error;
  if (desktop) {
    if (!data.url) throw new Error("Le lien de connexion n’a pas pu être préparé.");
    await bridge.openAuthUrl!(data.url);
  }
}
