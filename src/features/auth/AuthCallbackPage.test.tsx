import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  session: vi.fn(), exchange: vi.fn(), pending: vi.fn(), finalize: vi.fn(), markComplete: vi.fn(),
}));
vi.mock("../../lib/supabaseClient", () => ({ supabase: { auth: {
  getSession: mocks.session, exchangeCodeForSession: mocks.exchange,
} } }));
vi.mock("./AuthContext", () => ({ useAuth: () => ({ markOnboardingComplete: mocks.markComplete }) }));
vi.mock("./musicSceneOnboardingContract", () => ({ peekPendingMusicSceneArrival: mocks.pending }));
vi.mock("./musicSceneOAuthFinalization", () => ({ finalizeMusicSceneOAuthOnboarding: mocks.finalize }));
import AuthCallbackPage from "./AuthCallbackPage";

function Destination() {
  const location = useLocation();
  return <div>Globe : {String(location.state?.monGlobeDestination)}</div>;
}
function openCallback(path = "/auth/callback") {
  render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/auth/callback" element={<AuthCallbackPage />} />
    <Route path="/globe" element={<Destination />} />
  </Routes></MemoryRouter>);
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ data: { session: { user: { id: "account" } } }, error: null });
  mocks.pending.mockReturnValue({ auth: { flow: "oauth", provider: "google" } });
  mocks.finalize.mockResolvedValue({});
});
afterEach(cleanup);

describe("OAuth callback to globe", () => {
  it("finalizes the selected scene before opening the protected globe", async () => {
    let finish!: () => void;
    mocks.finalize.mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve; }));
    openCallback();
    await waitFor(() => expect(mocks.finalize).toHaveBeenCalledOnce());
    expect(screen.queryByText("Globe : authentication")).not.toBeInTheDocument();
    finish();
    expect(await screen.findByText("Globe : authentication")).toBeInTheDocument();
    expect(mocks.markComplete).toHaveBeenCalledOnce();
  });
  it("keeps a failed finalization on the callback with its error", async () => {
    mocks.finalize.mockRejectedValueOnce(new Error("Scène indisponible"));
    openCallback();
    expect(await screen.findByText("Scène indisponible")).toBeInTheDocument();
    expect(mocks.markComplete).not.toHaveBeenCalled();
    expect(screen.queryByText("Globe : authentication")).not.toBeInTheDocument();
  });
  it("rejects a callback without a session", async () => {
    mocks.session.mockResolvedValue({ data: { session: null }, error: null });
    openCallback();
    expect(await screen.findByText("Le lien de connexion est invalide ou a expiré.")).toBeInTheDocument();
    expect(mocks.finalize).not.toHaveBeenCalled();
  });
});
