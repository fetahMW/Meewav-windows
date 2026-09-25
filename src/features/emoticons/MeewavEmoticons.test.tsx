import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  appendMeeWavEmoticon,
  MEEWAV_EMOTICONS,
  MeeWavEmoticonComposer,
  MeewavEmoticonImage,
  MeeWavEmoticonPicker,
  meewavEmoticonToken,
} from "./MeewavEmoticons";

describe("MeeWav emoticons", () => {
  it("réunit les six packs en 300 WebP 256 uniques sans exposer les PNG maîtres", () => {
    expect(MEEWAV_EMOTICONS).toHaveLength(300);
    expect(new Set(MEEWAV_EMOTICONS.map((item) => item.name)).size).toBe(300);
    for (const item of MEEWAV_EMOTICONS) {
      expect(item.assetPath).toMatch(/^\/meewav-emojis\/(?:v[2-6]\/)?webp\/256\/[a-z0-9-]+\.webp$/);
      expect(item.assetPath).not.toMatch(/\.png$/i);
    }
  });

  it("charge les images de l’interface à la demande", () => {
    render(<MeewavEmoticonImage name={MEEWAV_EMOTICONS[0].name} />);
    const image = screen.getByRole("img");
    expect(image).toHaveAttribute("loading", "lazy");
    expect(image).toHaveAttribute("decoding", "async");
    expect(image).toHaveAttribute("src", MEEWAV_EMOTICONS[0].assetPath);
  });

  it("insère un jeton portable sans dépasser la limite du champ", () => {
    const name = MEEWAV_EMOTICONS[0].name;
    expect(appendMeeWavEmoticon("Salut", name, 80)).toBe(`Salut [[mw:${name}]]`);
    expect(appendMeeWavEmoticon("x".repeat(79), name, 80)).toHaveLength(79);
  });

  it("garde le mur ouvert pour sélectionner plusieurs émoticônes", () => {
    const onSelect = vi.fn();
    render(<MeeWavEmoticonPicker onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Ajouter une émoticône MeeWav" }));
    const dialog = screen.getByRole("dialog", { name: "Mur d’émoticônes" });
    fireEvent.click(screen.getByRole("listitem", { name: MEEWAV_EMOTICONS[0].label }));
    expect(onSelect).toHaveBeenCalledWith(MEEWAV_EMOTICONS[0]);
    expect(dialog).toBeVisible();
    expect(screen.getByRole("button", { name: "Fermer le mur d’émoticônes" })).toBeVisible();
  });

  it("affiche les vraies images dans le composeur tout en conservant le jeton portable", () => {
    const item = MEEWAV_EMOTICONS[0];
    function Harness() {
      const [value, setValue] = useState(`Salut ${meewavEmoticonToken(item.name)}`);
      return <MeeWavEmoticonComposer value={value} onChange={setValue} placeholder="Message" ariaLabel="Message visuel" />;
    }
    render(<Harness />);
    const composer = screen.getByRole("textbox", { name: "Message visuel" });
    expect(composer).not.toHaveTextContent("[[mw:");
    expect(composer.querySelector("img")).toHaveAttribute("src", item.assetPath);
    expect(composer.querySelector("img")).toHaveAttribute("data-mw-emoticon-token", meewavEmoticonToken(item.name));
  });
});
