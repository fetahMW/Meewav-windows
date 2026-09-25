import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

function cssRule(source, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `Missing CSS rule: ${selector}`);
  return match[1];
}

test("owner pre-profile truncates long names without moving the grade lockup", async () => {
  const source = await readFile(
    "src/features/globe/components/preProfile/HoverPreProfileContent.css",
    "utf8",
  );

  const ownerNameRule = cssRule(source, ".mw-preprofile.is-owner .mw-preprofile__name");
  assert.match(ownerNameRule, /flex:\s*1 1 0\s*;/);
  assert.match(ownerNameRule, /min-width:\s*0\s*;/);
  assert.match(ownerNameRule, /overflow:\s*hidden\s*;/);
  assert.match(ownerNameRule, /text-overflow:\s*ellipsis\s*;/);
  assert.match(ownerNameRule, /white-space:\s*nowrap\s*;/);
  assert.doesNotMatch(ownerNameRule, /word-break:\s*break-word\s*;/);

  const gradeLockupRule = cssRule(source, ".mw-preprofile__grade-lockup");
  assert.match(gradeLockupRule, /flex:\s*0 0 auto\s*;/);
});
