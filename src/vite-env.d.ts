/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AUTH_ENTRY_PREVIEW?: "true" | "false";
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_AVATAR_API_BASE_URL?: string;
  readonly VITE_PROFILE_PRIVATE_DEMO?: "true" | "false";
  readonly VITE_GEO_PIPELINE_MODE?: "legacy" | "national" | "comparison";
  readonly VITE_USE_NATIONAL_GEO_PIPELINE?: "true" | "false";
  readonly VITE_NATIONAL_GEO_TILESET_URL?: string;
  readonly VITE_OPENDAW_VOICE_CORRECTION_LAB?: "true" | "false";
  readonly VITE_ROOMS_WORKSPACE_PREVIEW?: "true" | "false";
  readonly VITE_ROOMS_HOME_WORKSPACE_PREVIEW?: "true" | "false";
  readonly VITE_CLASSE_WORKSPACE_PREVIEW?: "true" | "false";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
