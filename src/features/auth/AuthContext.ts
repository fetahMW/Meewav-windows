import { createContext, useContext } from "react";
import type { Session, User } from "@supabase/supabase-js";

export type AuthStatus = "loading" | "authenticated" | "anonymous";
export type OnboardingStatus = "checking" | "complete" | "required";

export type AuthContextValue = {
  session: Session | null;
  user: User | null;
  status: AuthStatus;
  needsOnboarding: boolean;
  onboardingStatus: OnboardingStatus;
  error: Error | null;
  refreshSession: () => Promise<Session | null>;
  signOut: () => Promise<void>;
  markOnboardingComplete: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth doit être utilisé à l'intérieur de AuthProvider.");
  }
  return context;
}
