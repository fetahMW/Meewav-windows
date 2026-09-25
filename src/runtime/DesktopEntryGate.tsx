import type { ReactNode } from "react";
import { ArrowRight, Globe2, Play } from "lucide-react";
import { chooseDesktopApplicationMode, getDesktopApplicationMode } from "./applicationMode";
import "./desktop-entry-gate.css";

export default function DesktopEntryGate({ children }: { children: ReactNode }) {
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
