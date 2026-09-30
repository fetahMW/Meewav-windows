import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { User } from "@supabase/supabase-js";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MusicSceneOnboardingPayload } from "../features/auth/musicSceneOnboardingContract";

const mocks = vi.hoisted(() => ({
  user: null as User | null,
  markComplete: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
  getSession: vi.fn(),
  signOut: vi.fn(),
  rpc: vi.fn(),
  persist: vi.fn(),
  prepareArrival: vi.fn(),
  loadCities: vi.fn(),
  loadScenes: vi.fn(),
  preview: false,
  enablePreview: vi.fn(),
  socialSignIn: vi.fn(),
}));

vi.mock("../lib/supabaseClient", () => ({
  supabaseUrl: "https://example.test",
  supabase: {
    rpc: mocks.rpc,
    auth: { signInWithPassword: mocks.signIn, signUp: mocks.signUp, getSession: mocks.getSession, signOut: mocks.signOut },
  },
}));
vi.mock("../features/auth/AuthContext", () => ({
  useAuth: () => ({ user: mocks.user, markOnboardingComplete: mocks.markComplete }),
}));
vi.mock("../features/auth/localAuthPreview", () => ({
  isLocalAuthPreviewAvailable: () => mocks.preview,
  enableLocalAuthPreview: mocks.enablePreview,
  LOCAL_PREVIEW_FETAH_HOST: { profileId: "current_user_fetah", username: "Fetah", role: "Beatmaker", avatarFile: "Beatmaker.png", avatarIconId: "avatar_25" },
}));
vi.mock("../features/auth/socialSignIn", () => ({ startSocialSignIn: mocks.socialSignIn }));
vi.mock("../features/auth/musicSceneProfilePersistence", () => ({ persistMusicSceneProfile: mocks.persist }));
vi.mock("../features/auth/musicSceneAuthenticatedArrival", () => ({ prepareAuthenticatedMusicSceneArrival: mocks.prepareArrival }));
vi.mock("../features/auth/musicSceneSelection", () => ({
  loadMusicSceneCityIndex: mocks.loadCities,
  loadMusicScenesForCity: mocks.loadScenes,
  searchMusicSceneCityCatalog: (cities: unknown[]) => ({ items: cities, total: cities.length }),
  resolveMusicSceneFromCoordinates: vi.fn(),
}));
vi.mock("../components/PillarCard", () => ({ default: () => null }));
vi.mock("./AvatarSelectionPage", () => ({
  default: ({ onNext }: { onNext: (avatar: string, role: string) => void }) =>
    <button onClick={() => onNext("Utilisateur.png", "Utilisateur")}>Choisir cet avatar</button>,
}));
vi.mock("../components/auth/HolographicOrbCTA", () => ({
  default: ({ visible, active, loading, onClick, alert }: {
    visible: boolean; active: boolean; loading: boolean; onClick: () => void; alert: ReactNode;
  }) => visible ? <><button disabled={!active || loading} onClick={onClick}>Entrer sur Mon Globe</button>{alert}</> : null,
}));

import AuthPage from "./AuthPage";
import { readCurrentMusicSceneProfile, saveMusicSceneOnboarding } from "../features/auth/musicSceneOnboardingContract";

const account = {
  id: "10000000-0000-4000-8000-0000000abcde",
  email: "tester@example.test",
  user_metadata: { username: "tester", avatar_name: "Utilisateur.png", artist_type: "Utilisateur" },
} as User;
const arrival: MusicSceneOnboardingPayload = {
  version: 1, createdAt: 1,
  city: { communeCode: "75056", result: {
    id: "paris", label: "Paris", subtitle: "Paris", type: "commune", center: [2.35, 48.85],
    postalCodes: [], departmentCode: "75", departmentName: "Paris", regionName: "", aliases: [], source: "test",
  } },
  scene: { zoneId: "iris-test", label: "Ma scène", communeCode: "75056", communeName: "Paris",
    center: [2.35, 48.85], bbox: [2.3, 48.8, 2.4, 48.9], source: "iris" },
  profile: { profileId: account.id, username: "tester", role: "Utilisateur",
    avatarFile: "Utilisateur.png", avatarIconId: "avatar_4", visible: true },
};

function GlobeDestination() {
  const location = useLocation();
  return <div>Globe ouvert : {String(location.state?.monGlobeDestination)}</div>;
}
function openAuth(route = "/auth") {
  return render(<MemoryRouter initialEntries={[route]}><Routes>
    <Route path="/auth" element={<AuthPage />} />
    <Route path="/globe" element={<GlobeDestination />} />
  </Routes></MemoryRouter>);
}

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { value: vi.fn(), configurable: true });
  vi.clearAllMocks();
  window.sessionStorage.clear();
  window.localStorage.clear();
  mocks.preview = false;
  mocks.user = null;
  mocks.loadCities.mockResolvedValue([arrival.city]);
  mocks.loadScenes.mockResolvedValue([arrival.scene]);
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.signIn.mockResolvedValue({ data: { user: account }, error: null });
  mocks.signUp.mockResolvedValue({ data: { user: account }, error: null });
  mocks.getSession.mockResolvedValue({ data: { session: { user: account } }, error: null });
  mocks.persist.mockResolvedValue(arrival);
  mocks.prepareArrival.mockResolvedValue(arrival);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("authentification vers le globe", () => {
  it("garde la démonstration directe malgré un ancien brouillon Google", async () => {
    mocks.preview = true;
    saveMusicSceneOnboarding({ ...arrival, createdAt: Date.now(), auth: { flow: "oauth", provider: "google" },
      profile: { ...arrival.profile, profileId: "onboarding-current-user" } });
    const { container } = openAuth("/auth?entry=demo");
    expect(screen.queryByRole("button", { name: "Entrer sur Mon Globe" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Créer un compte" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Créer un compte" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Choisir cet avatar" }));
    fireEvent.click(screen.getByRole("button", { name: /Google/ }));
    const city = await screen.findByPlaceholderText("Ville ou commune");
    await waitFor(() => expect(city).toBeEnabled());
    fireEvent.click(city);
    const option = await waitFor(() => {
      const option = container.querySelector("#music-scene-city-option-75056");
      expect(option).not.toBeNull();
      return option!;
    });
    fireEvent.click(option);
    const enter = screen.getByRole("button", { name: "Entrer sur Mon Globe" });
    await waitFor(() => expect(enter).toBeEnabled());
    fireEvent.click(enter);
    expect(await screen.findByText("Globe ouvert : authentication")).toBeInTheDocument();
    expect(mocks.enablePreview).toHaveBeenCalledOnce();
    expect(mocks.socialSignIn).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.persist).not.toHaveBeenCalled();
    expect(readCurrentMusicSceneProfile()?.auth).toBeUndefined();
  });

  it("ouvre le globe après une connexion réussie malgré une erreur de synchronisation du profil", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.persist.mockRejectedValueOnce(new Error("profile_sync_failed"));
    openAuth();
    fireEvent.change(screen.getByPlaceholderText("Adresse e-mail"), { target: { value: account.email } });
    fireEvent.change(screen.getByPlaceholderText("Mot de passe"), { target: { value: "test-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Se Connecter" }));
    expect(await screen.findByText("Globe ouvert : authentication")).toBeInTheDocument();
    expect(mocks.markComplete).not.toHaveBeenCalled();
  });

  it("reprend une session incomplète sans redemander de mot de passe ni créer un compte", async () => {
    mocks.user = account;
    saveMusicSceneOnboarding(arrival);
    openAuth("/auth?resume_onboarding=1");
    const enter = await screen.findByRole("button", { name: "Entrer sur Mon Globe" });
    await waitFor(() => expect(enter).toBeEnabled());
    fireEvent.click(enter);
    expect(await screen.findByText("Globe ouvert : authentication")).toBeInTheDocument();
    expect(mocks.signUp).not.toHaveBeenCalled();
    expect(mocks.signIn).not.toHaveBeenCalled();
    expect(mocks.persist).toHaveBeenCalledWith(account, expect.objectContaining({
      profile: expect.objectContaining({ profileId: account.id }),
    }));
    expect(mocks.markComplete).toHaveBeenCalledOnce();
  });

  it("réessaie la finalisation du même compte après une erreur, sans refaire signUp", async () => {
    mocks.persist.mockRejectedValueOnce(new Error("Scène indisponible. Réessaie."));
    const { container } = openAuth();
    fireEvent.click(screen.getByRole("button", { name: "Créer un compte" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Créer un compte" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Choisir cet avatar" }));
    const credentials = container.querySelector("#step2-form")!;
    fireEvent.change(credentials.querySelector('input[type="email"]')!, { target: { value: account.email } });
    fireEvent.change(credentials.querySelector('input[autoComplete="username"]')!, { target: { value: "tester" } });
    const passwords = credentials.querySelectorAll('input[type="password"]');
    for (const field of passwords) fireEvent.change(field, { target: { value: "test-password" } });
    fireEvent.submit(credentials);
    await screen.findByRole("button", { name: "Entrer sur Mon Globe" });
    const city = await screen.findByPlaceholderText("Ville ou commune");
    await waitFor(() => expect(city).toBeEnabled());
    fireEvent.click(city);
    const option = await waitFor(() => {
      const option = container.querySelector("#music-scene-city-option-75056");
      expect(option).not.toBeNull();
      return option!;
    });
    fireEvent.click(option);
    const enter = screen.getByRole("button", { name: "Entrer sur Mon Globe" });
    await waitFor(() => expect(enter).toBeEnabled());
    fireEvent.click(enter);
    await waitFor(() => expect(mocks.persist).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(enter).toBeEnabled());
    expect(screen.getAllByText("Scène indisponible. Réessaie.").length).toBeGreaterThan(0);
    fireEvent.click(enter);
    expect(await screen.findByText("Globe ouvert : authentication")).toBeInTheDocument();
    expect(mocks.signUp).toHaveBeenCalledOnce();
    expect(mocks.persist).toHaveBeenCalledTimes(2);
    expect(mocks.markComplete).toHaveBeenCalledOnce();
  });
});
