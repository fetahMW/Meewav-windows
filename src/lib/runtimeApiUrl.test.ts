import { describe, expect, it } from "vitest";
import { rewriteLoopbackServiceUrl } from "./runtimeApiUrl";

describe("runtimeApiUrl", () => {
  it("remplace localhost par l’hôte réseau sans altérer le modèle de tuile", () => {
    expect(rewriteLoopbackServiceUrl(
      "http://localhost:5000/musicians_clustered/{z}/{x}/{y}",
      "172.20.10.3",
    )).toBe("http://172.20.10.3:5000/musicians_clustered/{z}/{x}/{y}");
  });

  it("préserve une URL explicitement distante", () => {
    expect(rewriteLoopbackServiceUrl(
      "https://tiles.meewav.example/musicians_clustered/{z}/{x}/{y}",
      "172.20.10.3",
    )).toBe("https://tiles.meewav.example/musicians_clustered/{z}/{x}/{y}");
  });
});
