import { cleanup, render, screen } from "@testing-library/react";
import { Play } from "lucide-react";
import { afterEach, describe, expect, it } from "vitest";
import PillarCard from "./PillarCard";

afterEach(cleanup);

describe("PillarCard", () => {
  it("creates a stable CSS hook for the accented La Scène identity", () => {
    render(
      <PillarCard
        title="La Scène"
        description="Là où le talent règne sur l’algorithme."
        icon={Play}
      />,
    );

    expect(screen.getByText("La Scène")).toBeVisible();
    expect(screen.getByText("Là où le talent règne sur l’algorithme.")).toHaveClass(
      "pillar-desc-la-scene",
    );
  });
});
