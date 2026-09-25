import { supabase } from "../../../lib/supabaseClient";
import { cloneCageConfiguration, validateCageLaunch, type CageLaunchConfiguration } from "./cageLaunch";

/** Server owns creation and snapshots the supplied configuration in the same transaction. */
export async function launchCageLive(configuration: CageLaunchConfiguration, requestId: string): Promise<{ roomId: string; sessionId: string }> {
  const validation = validateCageLaunch(configuration);
  if (validation) throw new Error(validation);
  const { data, error } = await supabase.rpc("rooms_cage_launch_v1", {
    p_configuration: cloneCageConfiguration(configuration),
    p_request_id: requestId,
  });
  if (error) throw error;
  const result = (Array.isArray(data) ? data[0] : data) as { roomId?: unknown; sessionId?: unknown } | null;
  if (!result || typeof result.roomId !== "string" || typeof result.sessionId !== "string") throw new Error("La session Cage n’a pas pu être créée.");
  return { roomId: result.roomId, sessionId: result.sessionId };
}
