import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "./AuthContext";
import { RequireAuth } from "./RequireAuth";
import { disableLocalAuthPreview, enableLocalAuthPreview } from "./localAuthPreview";

afterEach(() => {
  cleanup();
  disableLocalAuthPreview();
});

function renderRoute(status: AuthContextValue["status"], needsOnboarding = false) {
  const authValue: AuthContextValue = {
    session: status === "authenticated" ? ({ user: { id: "user-1" } } as AuthContextValue["session"]) : null,
    user: status === "authenticated" ? ({ id: "user-1" } as AuthContextValue["user"]) : null,
    status,
    needsOnboarding,
    onboardingStatus: needsOnboarding ? "required" : "complete",
    error: null,
    refreshSession: vi.fn(async () => null),
    signOut: vi.fn(async () => undefined),
    markOnboardingComplete: vi.fn(),
  };

  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={["/profile/private?tab=wallet"]}>
        <Routes>
          <Route
            path="/profile/*"
            element={<RequireAuth><div>Espace privé</div></RequireAuth>}
          />
          <Route path="/auth" element={<div>Connexion</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("RequireAuth", () => {
  it("affiche un état d'attente tant que la session est inconnue", () => {
    renderRoute("loading");
    expect(screen.getByText("Ouverture de ton espace Meewav…")).toBeInTheDocument();
  });

  it("redirige une session anonyme vers l'authentification", () => {
    renderRoute("anonymous");
    expect(screen.getByText("Connexion")).toBeInTheDocument();
  });

  it("rend la route protégée pour une session authentifiée", () => {
    renderRoute("authenticated");
    expect(screen.getByText("Espace privé")).toBeInTheDocument();
  });

  it("rend temporairement la route en aperçu local sans compte", () => {
    enableLocalAuthPreview();
    renderRoute("anonymous");
    expect(screen.getByText("Espace privé")).toBeInTheDocument();
  });

  it("renvoie une session incomplète vers l'onboarding", () => {
    renderRoute("authenticated", true);
    expect(screen.getByText("Connexion")).toBeInTheDocument();
  });
});
