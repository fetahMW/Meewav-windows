import { getDesktopApplicationMode } from "../../runtime/applicationMode";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabaseClient";
import {
  AuthContext,
  type AuthContextValue,
  type AuthStatus,
  type OnboardingStatus,
} from "./AuthContext";
import { sessionNeedsOnboarding } from "./auth.service";
import { clearMusicSceneOnboardingPreview } from "./musicSceneOnboardingContract";

type AuthProviderProps = {
  children: ReactNode;
  client?: SupabaseClient;
};

export function AuthProvider({ children, client = supabase }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [error, setError] = useState<Error | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatus>("checking");
  const onboardingValidationId = useRef(0);

  const validateOnboarding = useCallback(async (nextSession: Session | null) => {
    const validationId = ++onboardingValidationId.current;
    if (!nextSession) {
      setNeedsOnboarding(false);
      setOnboardingStatus("complete");
      return false;
    }

    const fallbackNeedsOnboarding = sessionNeedsOnboarding(nextSession);
    setOnboardingStatus("checking");

    try {
      const { data, error: profileError } = await client.rpc("get_my_private_profile");
      if (validationId !== onboardingValidationId.current) return fallbackNeedsOnboarding;

      if (profileError || !data || typeof data !== "object") {
        setNeedsOnboarding(fallbackNeedsOnboarding);
        setOnboardingStatus(fallbackNeedsOnboarding ? "required" : "complete");
        return fallbackNeedsOnboarding;
      }

      const completedAt = (data as Record<string, unknown>).onboarding_completed_at;
      const serverNeedsOnboarding = typeof completedAt !== "string" || completedAt.length === 0;
      setNeedsOnboarding(serverNeedsOnboarding);
      setOnboardingStatus(serverNeedsOnboarding ? "required" : "complete");
      return serverNeedsOnboarding;
    } catch {
      if (validationId !== onboardingValidationId.current) return fallbackNeedsOnboarding;
      setNeedsOnboarding(fallbackNeedsOnboarding);
      setOnboardingStatus(fallbackNeedsOnboarding ? "required" : "complete");
      return fallbackNeedsOnboarding;
    }
  }, [client]);

  const refreshSession = useCallback(async () => {
    if (getDesktopApplicationMode() === "demo") return null;
    const { data, error: sessionError } = await client.auth.getSession();
    if (sessionError) {
      const normalizedError = new Error(sessionError.message);
      setError(normalizedError);
      setSession(null);
      setStatus("anonymous");
      throw normalizedError;
    }

    setError(null);
    setSession(data.session);
    await validateOnboarding(data.session);
    setStatus(data.session ? "authenticated" : "anonymous");
    return data.session;
  }, [client, validateOnboarding]);

  const signOut = useCallback(async () => {
    const { error: signOutError } = await client.auth.signOut();
    if (signOutError) throw signOutError;
    clearMusicSceneOnboardingPreview();
    setSession(null);
    setNeedsOnboarding(false);
    setOnboardingStatus("complete");
    setStatus("anonymous");
  }, [client]);

  useEffect(() => {
    if (getDesktopApplicationMode() === "demo") {
      setSession(null); setStatus("anonymous"); setNeedsOnboarding(false); setOnboardingStatus("complete");
      return;
    }
    let mounted = true;

    const { data: listener } = client.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      if (event === "SIGNED_OUT") clearMusicSceneOnboardingPreview();
      setSession(nextSession);
      // Supabase warns against awaiting another auth call inside this callback.
      // The validation therefore runs asynchronously after the event returns.
      window.setTimeout(() => void validateOnboarding(nextSession), 0);
      setStatus(nextSession ? "authenticated" : "anonymous");
      setError(null);
    });

    void client.auth.getSession().then(({ data, error: sessionError }) => {
      if (!mounted) return;

      if (sessionError) {
        setError(new Error(sessionError.message));
        setSession(null);
        setNeedsOnboarding(false);
        setOnboardingStatus("complete");
        setStatus("anonymous");
        return;
      }

      setSession(data.session);
      void validateOnboarding(data.session);
      setStatus(data.session ? "authenticated" : "anonymous");
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [client, validateOnboarding]);

  const markOnboardingComplete = useCallback(() => {
    setNeedsOnboarding(false);
    setOnboardingStatus("complete");
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    status,
    needsOnboarding,
    onboardingStatus,
    error,
    refreshSession,
    signOut,
    markOnboardingComplete,
  }), [error, markOnboardingComplete, needsOnboarding, onboardingStatus, refreshSession, session, signOut, status]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
