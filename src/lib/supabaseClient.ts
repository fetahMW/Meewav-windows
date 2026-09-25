import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://dqabekaqpznjsagoxzwc.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const localMissingAnonKeyFallback = "meewav-local-missing-supabase-anon-key";

if (!supabaseAnonKey) {
  console.warn("Attention: VITE_SUPABASE_ANON_KEY n'est pas défini dans l'environnement.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey || localMissingAnonKeyFallback);
