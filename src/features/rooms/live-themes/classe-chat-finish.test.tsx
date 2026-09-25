import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const finish = document.createElement("style");
const rooms = ["classe", "place", "wave", "loge", "cage", "scene"];

beforeAll(() => {
  finish.textContent = readFileSync(resolve(process.cwd(), "src/features/rooms/live-themes/classe-chat-finish.css"), "utf8");
  document.head.appendChild(finish);
});
afterEach(cleanup);
afterAll(() => finish.remove());

function renderComposer(room?: string, ready = false, inRooms = true) {
  render(
    <div className={inRooms ? "rooms-page" : "messaging-page"}>
      <div className="place-room-shell" data-room-presentation={room}>
        <aside className="place-studio-panel is-shared-studio-chassis is-chat">
          <div className="place-chat">
            <form className="place-chat__composer" aria-label="Composition">
              <label><div className="mw-emoticon-composer" role="textbox" aria-label="Message" /></label>
              <span className="place-chat__emoji"><button type="button" aria-label="Émoticônes" aria-expanded="false" /></span>
              <button type="submit" aria-label="Envoyer" disabled={!ready} />
            </form>
          </div>
        </aside>
      </div>
    </div>,
  );
}

describe("Shared room chat finish", () => {
  it.each(rooms)("%s : aligne la saisie et les deux touches sur des cibles de 44 px", (room) => {
    renderComposer(room);
    expect(getComputedStyle(screen.getByRole("form")).minHeight).toBe("60px");
    for (const element of [screen.getByRole("textbox"), ...screen.getAllByRole("button")]) {
      expect(getComputedStyle(element).height).toBe("44px");
    }
    expect(getComputedStyle(screen.getByRole("textbox")).display).toBe("block");
  });

  it.each(rooms.flatMap((room) => [false, true].map((ready) => ({ room, ready }))))(
    "$room : distingue l’envoi prêt=$ready sans estomper tout le bouton",
    ({ room, ready }) => {
      renderComposer(room, ready);
      const style = getComputedStyle(screen.getByRole("button", { name: "Envoyer" }));
      expect(style.opacity).toBe("1");
      expect(style.color).toBe(ready ? "rgb(255, 225, 196)" : "rgb(105, 114, 131)");
    },
  );

  it.each(rooms.flatMap((room) => ["classe-chat-workspace", "place-chat-workspace"].map((workspace) => ({ room, workspace }))))(
    "$room : conserve le rail compact orange dans $workspace",
    ({ room, workspace }) => {
      render(
        <div className="rooms-page">
          <div className="place-room-shell" data-room-presentation={room}>
            <div className={workspace}>
              <nav className="place-tools-console__switch" aria-label="Actions du Chat">
                <button className="is-active" aria-pressed="true"><svg /><span>Messages</span></button>
                <button aria-pressed="false">Sondages</button>
                <button aria-pressed="false">Épinglés</button>
                <button aria-pressed="false">Cadeaux</button>
              </nav>
            </div>
          </div>
        </div>,
      );
      const rail = getComputedStyle(screen.getByRole("navigation"));
      expect(rail.height).toBe("38px");
      expect(rail.gridTemplateColumns).toBe("repeat(4, minmax(0, 1fr))");
      const active = getComputedStyle(screen.getByRole("button", { name: "Messages" }));
      expect(active.height).toBe("32px");
      expect(active.color).toBe("rgb(255, 211, 172)");
      expect(active.flexDirection).toBe("row");
    },
  );

  it.each([
    { query: "@container (max-width: 360px)", fontSize: "10px" },
    { query: "@media (max-width: 600px)", fontSize: "9px" },
  ])("$query : surclasse le rail bureau pour garder les libellés complets", ({ query, fontSize }) => {
    // JSDOM does not perform container layout. Apply only the matched rule's
    // declarations to verify their specificity against the desktop finish.
    const group = Array.from(finish.sheet!.cssRules).find((rule) => rule.cssText.startsWith(query)) as CSSGroupingRule | undefined;
    expect(group).toBeDefined();
    const matchedStyles = document.createElement("style");
    matchedStyles.textContent = Array.from(group!.cssRules).map((rule) => rule.cssText).join("\n");
    document.head.appendChild(matchedStyles);
    try {
      render(
        <div className="rooms-page"><div className="place-room-shell" data-room-presentation="classe">
          <div className="place-chat-workspace"><nav className="place-tools-console__switch" aria-label="Actions du Chat">
            <button><svg /><span>Messages</span></button>
            <button><svg /><span>Sondages</span></button>
          </nav></div>
        </div></div>,
      );
      expect(getComputedStyle(screen.getByRole("navigation")).height).toBe("48px");
      for (const button of screen.getAllByRole("button")) {
        const style = getComputedStyle(button);
        expect(style.flexDirection).toBe("column");
        expect(style.height).toBe("44px");
        expect(style.fontSize).toBe(fontSize);
      }
    } finally {
      matchedStyles.remove();
    }
  });

  it.each(["mw-emoticon-wall--room-chat", "mw-emoticon-wall--classe-chat"])(
    "applique le mur noir laqué au portail opt-in %s",
    (className) => {
      render(<div className={`mw-emoticon-wall ${className}`} role="dialog" aria-label="Émoticônes"><div className="mw-emoticon-wall__grid" data-testid="grid" /></div>);
      expect(getComputedStyle(screen.getByRole("dialog")).borderRadius).toBe("17px");
      expect(getComputedStyle(screen.getByTestId("grid")).gridTemplateColumns).toBe("repeat(4, minmax(0, 1fr))");
    },
  );

  it("ne modifie pas le mur d’émoticônes de la messagerie", () => {
    render(<div className="mw-emoticon-wall" role="dialog" aria-label="Émoticônes" />);
    expect(getComputedStyle(screen.getByRole("dialog")).borderRadius).not.toBe("17px");
  });

  it.each([
    { room: undefined, inRooms: true },
    { room: "classe", inRooms: false },
  ])("ne modifie pas les compositions hors d’une room identifiée : %j", ({ room, inRooms }) => {
    renderComposer(room, false, inRooms);
    expect(getComputedStyle(screen.getByRole("form")).minHeight).not.toBe("60px");
    expect(getComputedStyle(screen.getByRole("button", { name: "Envoyer" })).color).not.toBe("rgb(105, 114, 131)");
  });
});
