import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

const apiMocks = vi.hoisted(() => ({
  getPublicPreProfile: vi.fn(),
  getPublishedPreProfileMedia: vi.fn(),
  getFollowState: vi.fn(),
}));

vi.mock("../globe/api/preProfile.api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../globe/api/preProfile.api")>();
  return {
    ...actual,
    getPublicPreProfile: apiMocks.getPublicPreProfile,
    getPublishedPreProfileMedia: apiMocks.getPublishedPreProfileMedia,
    getFollowState: apiMocks.getFollowState,
  };
});

import { ProfileViewerExperience } from "./ProfileViewerPage";

const canonicalProfileId = "123e4567-e89b-42d3-a456-426614174000";

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  apiMocks.getPublicPreProfile.mockResolvedValue({
    id: canonicalProfileId,
    username: "maya.reelle",
    display_name: "Maya Réelle",
    bio: "Autrice-compositrice parisienne.",
    avatar_url: null,
    avatar_style_key: null,
    primary_role_key: "autrice_compositrice",
    city: "Paris",
    country_code: "FR",
    zone_name: "Paris 11e",
    profile_image_url: null,
    collab_available: true,
    is_online: true,
    followers_count: 840,
    following_count: 116,
    grade: 3,
    is_verified: true,
    golden_likes_count: 42,
  });
  apiMocks.getPublishedPreProfileMedia.mockRejectedValue(new Error("media unavailable"));
  apiMocks.getFollowState.mockRejectedValue(new Error("follow unavailable"));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("ProfileViewerExperience canonical public profile", () => {
  it("keeps the real identity when secondary media and follow requests fail", async () => {
    render(
      <MemoryRouter>
        <ProfileViewerExperience profileId={canonicalProfileId} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { level: 1, name: /Maya Réelle/i })).toBeInTheDocument();
    expect(screen.getByText(/créations n’ont pas pu être actualisées/i)).toBeInTheDocument();
    expect(screen.getByText("Résumé public en préparation")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Statistiques" })).not.toBeInTheDocument();

    fireEvent.error(screen.getByAltText("Portrait de Maya Réelle"));
    expect(document.querySelector(".profile-viewer-hero__portrait-fallback")).toHaveTextContent("MR");
  });

  it("falls back to an explicitly labelled Paris fixture when the public server is unavailable", async () => {
    apiMocks.getPublicPreProfile.mockRejectedValueOnce(new Error("profile unavailable"));

    render(
      <MemoryRouter>
        <ProfileViewerExperience profileId={canonicalProfileId} />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/serveur public est indisponible/i)).toBeInTheDocument();
    expect(screen.getByText(/Données de démonstration — aucune donnée privée/i)).toBeInTheDocument();
    expect(screen.getByText("PROJET ACTUEL")).toBeInTheDocument();
  });
});
