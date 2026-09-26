import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import MeewavSelect from "./MeewavSelect";

afterEach(cleanup);

function Choice({ label = "Qui vote ?" }: { label?: string }) {
  const [value, setValue] = useState("public");
  return <label>{label}<MeewavSelect name="vote" value={value} onChange={event => setValue(event.target.value)}>
    <option value="public">Le public</option><option value="unavailable" disabled>Pas de vote</option>
    <option value="jury">Le jury</option><option value="mixed">Public et jury</option>
  </MeewavSelect></label>;
}

describe("MeewavSelect", () => {
  it("uses an accessible custom list and preserves the chosen form value", async () => {
    const user = userEvent.setup();
    render(<form aria-label="Préparation"><Choice /></form>);
    const control = screen.getByRole("combobox", { name: "Qui vote ?" });
    expect(control.tagName).toBe("BUTTON");
    await user.click(control);
    expect(screen.getByRole("option", { name: "Le public" })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("option", { name: "Public et jury" }));
    expect(control).toHaveTextContent("Public et jury");
    expect(screen.getByRole("form")).toHaveFormValues({ vote: "mixed" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(control).toHaveFocus();
  });

  it("supports keyboard selection, skips disabled choices and cancels without changing the value", async () => {
    const user = userEvent.setup();
    render(<Choice />);
    const control = screen.getByRole("combobox");
    control.focus();
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(control).toHaveTextContent("Le jury");
    await user.keyboard("{ArrowDown}{End}{Escape}");
    expect(control).toHaveTextContent("Le jury");
    expect(control).toHaveFocus();
    expect(screen.queryByRole("listbox")).toBeNull();
    await user.keyboard("{ArrowDown}{Home}{Enter}");
    expect(control).toHaveTextContent("Le public");
  });

  it("closes the previous menu when another field or the surrounding page is clicked", async () => {
    const user = userEvent.setup();
    render(<><Choice label="Premier" /><Choice label="Second" /><button>Continuer</button></>);
    await user.click(screen.getByRole("combobox", { name: "Premier" }));
    await user.click(screen.getByRole("combobox", { name: "Second" }));
    expect(screen.getAllByRole("listbox")).toHaveLength(1);
    expect(screen.getByRole("combobox", { name: "Premier" })).toHaveAttribute("aria-expanded", "false");
    await user.click(screen.getByRole("button", { name: "Continuer" }));
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("keeps the list in a native dialog and prevents Escape from closing the preparation", async () => {
    const user = userEvent.setup();
    const outerKey = vi.fn();
    render(<dialog open aria-label="Studio" onKeyDown={outerKey}><Choice /></dialog>);
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("combobox"));
    expect(screen.getByRole("listbox").parentElement).toBe(dialog);
    await user.keyboard("{Escape}");
    expect(outerKey).not.toHaveBeenCalled();
    expect(dialog).toHaveAttribute("open");
    await user.click(within(dialog).getByRole("combobox"));
    await user.keyboard("{Tab}");
    expect(outerKey).toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("uses the space above the field near the bottom edge and respects disabled options", () => {
    render(<Choice />);
    const control = screen.getByRole("combobox");
    vi.spyOn(control, "getBoundingClientRect").mockReturnValue({ top: window.innerHeight - 80, bottom: window.innerHeight - 40, left: 20, right: 300, width: 280, height: 40, x: 20, y: window.innerHeight - 80, toJSON: () => ({}) });
    fireEvent.click(control);
    expect(screen.getByRole("listbox")).toHaveAttribute("data-placement", "above");
    fireEvent.click(screen.getByRole("option", { name: "Pas de vote" }));
    expect(control).toHaveTextContent("Le public");
    expect(screen.getByRole("listbox")).toBeVisible();
  });
});
