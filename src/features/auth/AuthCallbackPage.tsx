import { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { getAuthErrorMessage } from "./auth.service";
import { useAuth } from "./AuthContext";
import { peekPendingMusicSceneArrival } from "./musicSceneOnboardingContract";
import { finalizeMusicSceneOAuthOnboarding } from "./musicSceneOAuthFinalization";
import { getSafeAuthReturnRoute } from "./authReturnRoute";
import { MON_GLOBE_AUTH_NAVIGATION_STATE } from "../globe/monGlobeContract";

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const { markOnboardingComplete } = useAuth();
  const [searchParams] = useSearchParams();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const completeAuthentication = async () => {
      const providerError = searchParams.get("error_description") ?? searchParams.get("error");
      if (providerError) throw new Error(providerError);

      const code = searchParams.get("code");
      const { data: existingSession, error: existingSessionError } = await supabase.auth.getSession();
      if (existingSessionError) throw existingSessionError;

      if (code && !existingSession.session) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) throw exchangeError;
      } else if (!existingSession.session) {
        throw new Error("Le lien de connexion est invalide ou a expiré.");
      }

      const pending = peekPendingMusicSceneArrival();
      if (pending?.auth?.flow === "oauth") {
        await finalizeMusicSceneOAuthOnboarding(pending);
        markOnboardingComplete();
      }
      const destination = getSafeAuthReturnRoute({ returnTo: searchParams.get("next") });
      navigate(destination, {
        replace: true,
        state: destination.split("?")[0] === "/globe" ? MON_GLOBE_AUTH_NAVIGATION_STATE : undefined,
      });
    };

    void completeAuthentication().catch((callbackError: unknown) => {
      setError(getAuthErrorMessage(callbackError, "Impossible de finaliser la connexion."));
    });
  }, [markOnboardingComplete, navigate, searchParams]);

  return (
    <main className="auth-action-page">
      <div className="auth-action-background" />
      <section className="auth-action-card" aria-live="polite">
        {error ? (
          <>
            <AlertCircle className="auth-action-icon is-error" size={28} />
            <h1>Connexion interrompue</h1>
            <p>{error}</p>
            <Link className="primary-button auth-action-link" to="/auth?resume_onboarding=1">Retour à la connexion</Link>
          </>
        ) : (
          <>
            <Loader className="auth-action-icon spinner-icon" size={28} />
            <h1>Connexion sécurisée</h1>
            <p>Nous ouvrons ton espace Meewav.</p>
          </>
        )}
      </section>
    </main>
  );
}
