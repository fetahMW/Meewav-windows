import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabaseClient";
import { ArrowRight, Globe2, Play } from "lucide-react";
import { chooseDesktopApplicationMode, getDesktopApplicationMode } from "./applicationMode";
import "./desktop-entry-gate.css";

export default function DesktopEntryGate({ children }: { children: ReactNode }) {
  const testEntry = Boolean(window.meewavDesktop?.localTestAccountsEnabled)
    && !sessionStorage.getItem('meewav:test-entry-initialized');
  const [ready, setReady] = useState(!testEntry);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!testEntry) return;
    // A cold test launch always asks which account to use. Other devices keep their sessions.
    void supabase.auth.signOut({ scope: 'local' }).then(({ error: signOutError }) => {
      if (signOutError) { setError(true); return; }
      sessionStorage.setItem('meewav:test-entry-initialized', '1');
      setReady(true);
    }).catch(() => setError(true));
  }, [testEntry]);
  if (!ready) return <main className="desktop-entry-gate"><p role="status">{error
    ? 'Impossible de préparer la connexion de test. Vérifie Supabase puis recharge l’application.'
    : 'Préparation de la connexion…'}</p></main>;
  if (window.meewavDesktop?.version !== 1 || getDesktopApplicationMode()) return children;
  return <main className="desktop-entry-gate">
    <section role="dialog" aria-modal="true" aria-labelledby="desktop-entry-title" className="desktop-entry-gate__card">
      <h1 id="desktop-entry-title">Bienvenue sur Meewav</h1>
      <p>Choisis comment entrer dans Meewav.</p>
      <button autoFocus type="button" onClick={() => chooseDesktopApplicationMode("live")}>
        <Globe2 aria-hidden="true" /><span><strong>Application Meewav</strong><small>Connecte-toi à ton compte pour rejoindre la communauté.</small></span><ArrowRight aria-hidden="true" />
      </button>
      <button type="button" onClick={() => chooseDesktopApplicationMode("demo")}>
        <Play aria-hidden="true" /><span><strong>Mode démo</strong><small>Explore toutes les fonctionnalités avec les données de démonstration, sans connexion.</small></span><ArrowRight aria-hidden="true" />
      </button>
    </section>
  </main>;
}
