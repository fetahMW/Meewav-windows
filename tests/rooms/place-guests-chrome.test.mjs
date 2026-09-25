import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../../src/features/rooms/place/place-guests-chrome.css", import.meta.url), "utf8");
const mixerCss = await readFile(new URL("../../src/features/rooms/place/place-room-shell.css", import.meta.url), "utf8");
const rules = Array.from(css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g), ([, selector, body]) => ({ selector: selector.trim(), body }));
const scope = ".place-room-shell .place-studio-panel.is-guests";
const nav = `${scope} .place-guests__segments`;
function rule(selector) {
  const found = rules.find((entry) => entry.selector === selector);
  assert.ok(found, `Règle manquante : ${selector}`);
  return found.body;
}

test("Invités : seules la barre compacte et sa réserve de hauteur sont modifiées", () => {
  for (const { selector } of rules) {
    assert.ok(selector.startsWith(`${scope} .place-guests`));
    assert.doesNotMatch(selector, /\.place-guest-row|\.place-studio-panel::/);
    assert.doesNotMatch(selector, /\.is-(?:chat|mixer|tools)/);
  }
  const layout = rule(`${scope} .place-guests`);
  assert.match(layout, /--guests-subnav-height:\s*34px/);
  assert.match(layout, /grid-template-rows:\s*max-content minmax\(0, 1fr\)/);
  assert.match(layout, /padding:\s*0 5px 7px/);
  assert.match(layout, /overflow:\s*hidden/);
  assert.match(css, /--guests-subnav-height:\s*37px/);
});

test("Invités : trois colonnes compactes avec les arêtes du Mixeur et des compteurs lisibles", () => {
  assert.match(rule(nav), /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(rule(nav), /border-radius:\s*10px/);
  assert.match(rule(`${nav} > button`), /display:\s*flex/);
  assert.match(rule(`${nav} > button`), /min-height:\s*var\(--guests-subnav-row\)/);
  assert.match(rule(`${nav} > button > svg`), /width:\s*18px/);
  assert.match(rule(`${nav} .place-guests__segment-copy`), /display:\s*flex !important/, "Neutraliser l'ancien empilement vertical prioritaire");
  assert.match(rule(`${nav} .place-guests__segment-copy > strong`), /min-width:\s*16px !important/);
  assert.match(rule(`${nav} .place-guests__segment-copy > strong`), /color:\s*inherit !important/);
  assert.match(rule(`${nav} .place-guests__segment-copy > strong`), /font-size:\s*9px !important/);
  const edge = rule(`${nav}::before`).match(/background:\s*([^;]+);/)[1];
  assert.ok(mixerCss.includes(`background: ${edge};`));
});

test("Invités : accent bleu au survol, à la sélection et au clavier, sans déplacer les onglets", () => {
  const feedback = rule(`${nav} > button:not(:disabled):is(:hover, :focus-visible, .is-active) > svg`);
  assert.match(feedback, /color:\s*#86bdff/);
  assert.match(rule(`${nav} > button`), /transform:\s*none/);
  assert.match(rule(`${nav} > button::after`), /filter:\s*none/);
  assert.match(rule(`${nav} > button.is-active::after`), /opacity:\s*1/);
  assert.match(rule(`${nav} > button:focus-visible`), /outline:\s*1px solid/);
});
