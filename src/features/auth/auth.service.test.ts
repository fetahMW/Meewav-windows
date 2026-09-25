import { describe, expect, it } from "vitest";
import type { Session } from "@supabase/supabase-js";
import {
  countryNameToCode,
  normalizeUsername,
  onboardingPayloadToMetadata,
  sessionNeedsOnboarding,
  type OnboardingPayload,
} from "./auth.service";

const basePayload: OnboardingPayload = {
  username: "  Nox_Amani  ",
  displayName: "Nox Amani",
  avatarStyleKey: "Studio.png",
  primaryRoleKey: "Producteur",
  city: "Paris",
  countryCode: "FR",
  countryName: "France",
  street: "10 rue de Test",
  postalCode: "75011",
  latitude: null,
  longitude: null,
  isGhostMode: true,
  showOnPublicProfile: false,
};

describe("auth.service", () => {
  const sessionWithMetadata = (metadata: Record<string, unknown>) => ({
    user: { user_metadata: metadata },
  }) as Session;

  it("normalise le username sans modifier son identité", () => {
    expect(normalizeUsername(basePayload.username)).toBe("nox_amani");
  });

  it.each([
    ["France", "FR"],
    [" Belgique ", "BE"],
    ["Suisse", "CH"],
    ["Canada", "CA"],
    ["Inconnu", null],
  ])("convertit %s en code ISO", (country, expected) => {
    expect(countryNameToCode(country)).toBe(expected);
  });

  it("produit les métadonnées modernes et legacy attendues par le trigger distant", () => {
    expect(onboardingPayloadToMetadata(basePayload)).toEqual(expect.objectContaining({
      username: "nox_amani",
      display_name: "Nox Amani",
      full_name: "Nox Amani",
      avatar_style_key: "Studio.png",
      avatar_name: "Studio.png",
      primary_role_key: "Producteur",
      artist_type: "Producteur",
      city: "Paris",
      country_code: "FR",
      country: "France",
      is_ghost_mode: true,
      show_on_public_profile: false,
      onboarding_completed: false,
    }));
  });

  it("ne conserve qu’une position kilométrique dans les métadonnées Auth", () => {
    const metadata = onboardingPayloadToMetadata({
      ...basePayload,
      latitude: 48.8566,
      longitude: 2.3522,
    });

    expect(metadata.latitude).toBe(48.86);
    expect(metadata.longitude).toBe(2.35);
  });

  it("bloque explicitement une session dont l'onboarding est incomplet", () => {
    expect(sessionNeedsOnboarding(sessionWithMetadata({ onboarding_completed: false }))).toBe(true);
  });

  it("accepte une session explicitement finalisée", () => {
    expect(sessionNeedsOnboarding(sessionWithMetadata({ onboarding_completed: true }))).toBe(false);
  });

  it("préserve les comptes legacy qui avaient déjà username, avatar et rôle", () => {
    expect(sessionNeedsOnboarding(sessionWithMetadata({
      username: "nox_amani",
      avatar_name: "Studio.png",
      artist_type: "Producteur",
    }))).toBe(false);
  });

  it("détecte un compte OAuth sans profil Meewav", () => {
    expect(sessionNeedsOnboarding(sessionWithMetadata({ full_name: "Nox Amani" }))).toBe(true);
  });
});
