import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceRoot = new URL("../../src/features/tremplin/", import.meta.url);

async function readSource(fileName) {
  return readFile(new URL(fileName, sourceRoot), "utf8");
}

test("le vocabulaire public distingue force, jeton de talent et transaction", async () => {
  const [home, discovery, page, education, flow, workspace, copy, tokenStatus] = await Promise.all([
    readSource("TremplinPublicHome.tsx"),
    readSource("TremplinHomeExperience.tsx"),
    readSource("TremplinPage.tsx"),
    readSource("TremplinTokenEducation.tsx"),
    readSource("TremplinTokenFlow.tsx"),
    readSource("TremplinTokenWorkspace.tsx"),
    readSource("tremplinCopy.ts"),
    readSource("tremplinHomeTokenStatus.ts"),
  ]);

  const publicCopy = [home, discovery, page, education, flow, workspace, copy, tokenStatus].join("\n");
  const bannedPhrases = [
    "Ouvre Soutien MW",
    "Ouvrir Soutien MW",
    "Soutiens MW",
    "Simuler un soutien",
    "Montant du soutien",
    "Soutenir davantage",
    "Gérer ma sortie",
    "Confirmer mon soutien",
    "KYC vérifié côté serveur",
  ];

  for (const phrase of bannedPhrases) {
    assert.doesNotMatch(publicCopy, new RegExp(phrase), `le texte public ne doit plus contenir « ${phrase} »`);
  }

  assert.match(home, /donne de la force aux projets qui te parlent/);
  assert.match(tokenStatus, /Voir le jeton de talent/);
  assert.match(page, /Donner de la force au projet de \{artist\.name\}/);
  assert.match(page, /Acheter des jetons \{token\.symbol\}/);
  assert.match(page, /Revendre mes jetons/);
  assert.match(education, /Simuler un achat/);
  assert.match(flow, /Montant de l’achat/);
  assert.match(workspace, /Demander mon jeton de talent/);
  assert.match(copy, /tokenName: "Jeton de talent"/);
});

test("le langage émotionnel ne remplace jamais la confirmation financière", async () => {
  const flow = await readSource("TremplinTokenFlow.tsx");

  assert.doesNotMatch(flow, />\s*Donner de la force\s*</);
  assert.match(flow, /Simuler l’achat de/);
  assert.match(flow, /Simuler la revente de/);
});
