import { cleanup, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const finishCss = readFileSync(resolve(process.cwd(), "src/features/rooms/place/place-studio-black-lacquer.css"), "utf8");
const finish = document.createElement("style");
beforeAll(() => {
  finish.textContent = finishCss;
  document.head.appendChild(finish);
});
afterEach(cleanup);
afterAll(() => finish.remove());

function Player({ variant, collapsed }: { variant: "classroom" | "room"; collapsed: boolean }) {
  const buttonClass = variant === "classroom" ? "place-mixer-audio__classroom-toggle" : "place-mixer-audio__collapse-toggle";
  return <main className="rooms-page">
    <div className="place-room-shell" data-room-presentation="classe">
      <aside className="place-studio-panel">
        <div className={`place-mixer-audio is-${variant}-collapsible${collapsed ? ` is-${variant}-collapsed` : ""}`}>
          <button className={buttonClass} aria-label="Replier le lecteur" />
        </div>
      </aside>
    </div>
  </main>;
}

describe("shared player collapse finish", () => {
  it.each(["classroom", "room"] as const)("keeps the %s variant transparent and compact above the waveform", (variant) => {
    const { rerender } = render(<Player variant={variant} collapsed={false} />);
    const button = screen.getByRole("button", { name: "Replier le lecteur" });
    let style = getComputedStyle(button);
    expect(style.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(style.backgroundImage).toBe("none");
    expect(style.boxShadow).toBe("none");
    expect(style.height).toBe("32px");
    expect(style.minHeight).toBe("32px");
    expect(style.top).toBe("4px");

    rerender(<Player variant={variant} collapsed />);
    style = getComputedStyle(button);
    expect(style.height).toBe("44px");
    expect(style.minHeight).toBe("44px");
    expect(style.top).toBe("2px");
    expect(style.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(style.boxShadow).toBe("none");
  });
});
