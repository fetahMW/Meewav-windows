import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import MeewavPrimaryNav, {
  getPrimaryDestinationFromPathname,
  type PrimaryDestinationId,
} from "./MeewavPrimaryNav";
import { resolvePrimaryChromeTopbarHeight } from "./primaryChromeGeometry";

afterEach(cleanup);

function NavigationHarness({ activeDestination }: { activeDestination?: PrimaryDestinationId }) {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <>
      <MeewavPrimaryNav
        activeView="globe"
        activeDestination={activeDestination}
        onGlobe={() => navigate("/globe")}
      />
      <output aria-label="Route active">{location.pathname}</output>
    </>
  );
}

function renderNavigation(initialPath: string, activeDestination?: PrimaryDestinationId) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <NavigationHarness activeDestination={activeDestination} />
    </MemoryRouter>,
  );
}

describe("MeewavPrimaryNav", () => {
  it("ancre le châssis une seule fois sur le token du bandeau Rooms", () => {
    expect(resolvePrimaryChromeTopbarHeight(64, 128)).toBe(64);
    expect(resolvePrimaryChromeTopbarHeight(0, 64)).toBe(64);
  });

  it("sépare les six piliers du Profil et conserve Profil en dernier", () => {
    renderNavigation("/globe");

    const navigation = screen.getByRole("navigation", { name: "Navigation principale MeeWav" });
    const pillars = within(navigation).getByRole("group", { name: "Piliers MeeWav" });
    const account = within(navigation).getByRole("group", { name: "Compte MeeWav" });
    const pillarButtons = within(pillars).getAllByRole("button");

    expect(pillarButtons).toHaveLength(6);
    expect(pillarButtons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Globe / Carte",
      "Messagerie",
      "Rooms",
      "La Scène",
      "Marketplace",
      "Tremplin",
    ]);
    expect(within(pillars).queryByRole("button", { name: "Profil" })).not.toBeInTheDocument();
    expect(within(account).getAllByRole("button")).toHaveLength(1);
    expect(within(account).getByRole("button", { name: "Profil" })).toBeVisible();
    const navigationButtons = within(navigation).getAllByRole("button");
    expect(navigationButtons[navigationButtons.length - 1]).toHaveAccessibleName("Profil");
  });

  it.each(["/globe", "/messages"])("ouvre le profil host depuis %s", async (initialPath) => {
    const user = userEvent.setup();
    renderNavigation(initialPath, initialPath === "/messages" ? "messages" : undefined);

    await user.click(screen.getByRole("button", { name: "Profil" }));

    expect(screen.getByLabelText("Route active")).toHaveTextContent("/profile");
  });

  it("revient au Globe depuis le Profil", async () => {
    const user = userEvent.setup();
    renderNavigation("/profile", "profile");

    await user.click(screen.getByRole("button", { name: "Globe / Carte" }));

    expect(screen.getByLabelText("Route active")).toHaveTextContent("/globe");
  });

  it("retire le verre partagé en revenant au Globe, même avec un ancien pilier reçu", async () => {
    const user = userEvent.setup();
    const { container } = renderNavigation("/profile", "profile");
    const navigation = screen.getByRole("navigation", { name: "Navigation principale MeeWav" });
    expect(navigation).toHaveClass("is-glass-chassis");
    expect(container.querySelector(".meewav-primary-nav__glass-lintel")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Globe / Carte" }));

    expect(navigation).not.toHaveClass("is-glass-chassis");
    expect(container.querySelector(".meewav-primary-nav__glass-lintel")).not.toBeInTheDocument();
    expect(container.querySelector(".meewav-primary-nav__pole-wordmark")).not.toBeInTheDocument();
    expect(container.querySelector(".meewav-primary-nav__l-chassis")).toBeInTheDocument();
  });

  it.each(["/globe", "/profile"])("ouvre la Messagerie depuis %s", async (initialPath) => {
    const user = userEvent.setup();
    renderNavigation(initialPath, initialPath === "/profile" ? "profile" : undefined);

    await user.click(screen.getByRole("button", { name: "Messagerie" }));

    expect(screen.getByLabelText("Route active")).toHaveTextContent("/messages");
  });

  it.each(["/globe", "/profile", "/messages"])("ouvre la Marketplace depuis %s", async (initialPath) => {
    const user = userEvent.setup();
    const activeDestination = initialPath === "/profile"
      ? "profile"
      : initialPath === "/messages" ? "messages" : undefined;
    renderNavigation(initialPath, activeDestination);

    await user.click(screen.getByRole("button", { name: "Marketplace" }));

    expect(screen.getByLabelText("Route active")).toHaveTextContent("/market");
  });

  it.each([
    ["Profil", "/profile"],
    ["Messagerie", "/messages"],
  ])("ouvre %s depuis le Market", async (label, expectedPath) => {
    const user = userEvent.setup();
    renderNavigation("/market", "market");

    await user.click(screen.getByRole("button", { name: label }));

    expect(screen.getByLabelText("Route active")).toHaveTextContent(expectedPath);
  });

  it.each([
    ["/messages/groupes/midnight-echo", "Messagerie"],
    ["/messagerie/messages/midnight-echo", "Messagerie"],
    ["/profile/settings", "Profil"],
    ["/profil/fetah", "Profil"],
    ["/market/instruments/synthes", "Marketplace"],
    ["/tremplin/decouvrir", "Tremplin"],
    ["/scene/suivis", "La Scène"],
    ["/shorts/abonnements", "La Scène"],
    ["/rooms/la-cage", "Rooms"],
  ])("conserve %s actif selon la route réelle", (initialPath, activeLabel) => {
    renderNavigation(initialPath, "map");

    expect(screen.getByRole("button", { name: activeLabel })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Globe / Carte" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("navigation")).toHaveClass("is-glass-chassis");
  });

  it("ouvre La Scène depuis un autre pilier", async () => {
    const user = userEvent.setup();
    renderNavigation("/market", "market");

    await user.click(screen.getByRole("button", { name: "La Scène" }));

    expect(screen.getByLabelText("Route active")).toHaveTextContent("/scene");
  });

  it("ouvre Rooms depuis un autre pilier", async () => {
    const user = userEvent.setup();
    renderNavigation("/profile", "profile");

    await user.click(screen.getByRole("button", { name: "Rooms" }));

    expect(screen.getByLabelText("Route active")).toHaveTextContent("/rooms/home");
  });

  it("rend sur l’accueil Rooms un châssis monobloc sculpté sans empiler de bandeaux", () => {
    const { container } = renderNavigation("/rooms/home", "rooms");

    const chassis = container.querySelector(".meewav-primary-nav__l-chassis");
    const piecePath = chassis?.querySelector("#meewav-l-chassis-piece-path");
    const edgePath = chassis?.querySelector("#meewav-l-chassis-edge-path");
    expect(chassis).toHaveAttribute("aria-hidden", "true");
    expect(chassis?.querySelectorAll(".meewav-primary-nav__l-chassis-piece")).toHaveLength(1);
    expect(piecePath).toBeInTheDocument();
    expect(edgePath).toBeInTheDocument();
    expect(container.querySelector(".meewav-primary-nav")).toHaveClass("is-rooms-landing-chassis");
    expect(piecePath?.getAttribute("d")).toContain("C");
    expect(edgePath?.getAttribute("d")).toContain("C");
    expect(piecePath?.getAttribute("d")).not.toContain("Q");
    expect(edgePath?.getAttribute("d")).not.toContain("Q");
    expect(chassis?.querySelectorAll(".meewav-primary-nav__l-chassis-edge-main")).toHaveLength(1);
    expect(chassis?.querySelectorAll(".meewav-primary-nav__l-chassis-edge-echo")).toHaveLength(0);
    expect(chassis?.querySelectorAll(".meewav-primary-nav__l-chassis-arc")).toHaveLength(0);
    expect(chassis?.querySelectorAll(".meewav-primary-nav__l-chassis-corner-bloom")).toHaveLength(0);
    expect(chassis?.querySelectorAll(".meewav-primary-nav__l-chassis-corner-glow")).toHaveLength(0);
  });

  it("conserve la silhouette sculptée dans les Rooms actives", () => {
    const { container } = renderNavigation("/rooms/la-place", "rooms");

    const navigation = container.querySelector(".meewav-primary-nav");
    const edgePath = container.querySelector("#meewav-l-chassis-edge-path");
    expect(navigation).toHaveClass("is-rooms-landing-chassis");
    expect(edgePath?.getAttribute("d")).toContain("C");
    expect(edgePath?.getAttribute("d")).not.toContain("Q");
  });

  it.each([
    ["/messages", "messages"],
    ["/profile", "profile"],
    ["/market", "market"],
    ["/tremplin", "tremplin"],
    ["/scene", "shorts"],
  ] as const)("applique le bandeau unifié sur %s", (pathname, destination) => {
    const { container } = renderNavigation(pathname, destination);

    expect(container.querySelector(".meewav-primary-nav")).toHaveClass("is-rooms-landing-chassis");
    expect(container.querySelector("#meewav-l-chassis-edge-path")?.getAttribute("d")).toContain("C");
    expect(container.querySelector(".meewav-primary-nav")).toHaveClass("is-glass-chassis");
    expect(container.querySelector(".meewav-primary-nav__pole-wordmark")).toHaveTextContent("MEEWAV");
    expect(container.querySelector(".meewav-primary-nav__glass-lintel")).toHaveAttribute("clip-path");
  });

  it("résout les alias de piliers sans dépendre du dernier état reçu", () => {
    expect(getPrimaryDestinationFromPathname("/messagerie/groupes/1")).toBe("messages");
    expect(getPrimaryDestinationFromPathname("/profil/fetah")).toBe("profile");
    expect(getPrimaryDestinationFromPathname("/tremplin/comprendre")).toBe("tremplin");
    expect(getPrimaryDestinationFromPathname("/market/services")).toBe("market");
    expect(getPrimaryDestinationFromPathname("/scene")).toBe("shorts");
    expect(getPrimaryDestinationFromPathname("/shorts")).toBe("shorts");
    expect(getPrimaryDestinationFromPathname("/rooms/la-cage")).toBe("rooms");
    expect(getPrimaryDestinationFromPathname("/room/la-wave")).toBe("rooms");
  });
});
