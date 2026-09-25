import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabaseClient";
import type { WaveInfraAdapter, WaveInfraMode } from "./contracts";
import { LocalOnlyWaveInfraAdapter } from "./localWaveInfra";
import { SupabaseWaveInfraAdapter } from "./supabaseWaveInfra";

export * from "./contracts";
export * from "./assetPipeline";
export * from "./errors";
export * from "./eventSequencer";
export * from "./localWaveInfra";
export * from "./supabaseWaveInfra";

export type CreateWaveInfraAdapterOptions = {
  mode?: WaveInfraMode;
  client?: SupabaseClient;
  directUploadFetch?: typeof fetch;
};

/** No implicit demo fallback: production is the default. */
export function createWaveInfraAdapter(options: CreateWaveInfraAdapterOptions = {}): WaveInfraAdapter {
  const configured = options.mode
    ?? (import.meta.env.VITE_WAVE_INFRA_MODE === "local-explicit" ? "local-explicit" : "production");
  if (configured === "local-explicit") return new LocalOnlyWaveInfraAdapter();
  return new SupabaseWaveInfraAdapter(options.client ?? supabase, options.directUploadFetch ?? fetch);
}
