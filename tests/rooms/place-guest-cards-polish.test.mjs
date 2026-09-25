import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../../src/features/rooms/place/place-guest-cards-polish.css", import.meta.url), "utf8");
const scope = ".place-room-shell .place-studio-panel.is-guests .place-guest-row";
const rules = Array.from(css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g), ([, selector, body]) => ({ selector: selector.trim(), body }));
const rule = (selector) => {
  const found = rules.find((entry) => entry.selector === selector);
  assert.ok(found, selector);
  return found.body;
};

test("L'essai reste limité aux cartes sans modifier leur gabarit ni leur fond", () => {
  for (const { selector, body } of rules) {
    assert.ok(selector.startsWith(scope));
    if (!selector.endsWith("> svg")) assert.doesNotMatch(body, /(?:^|[;\n])\s*(?:width|padding|margin|transform|grid-template[^:]*):/);
    if (!selector.includes("__primary")) assert.doesNotMatch(body, /(?:^|[;\n])\s*(?:height|min-height):/);
  }
  assert.doesNotMatch(rule(scope), /background:/);
  assert.match(rule(scope), /rgba\(76, 135, 218, \.17\)/);
  assert.match(rule(scope), /border-top-color:\s*rgba\(157, 204, 255, \.42\)/);
});

test("Typographie sans empattements, CTA bleu-noir de 24px et informations secondaires atténuées", () => {
  assert.match(rules[0].body, /font-family: Inter, ui-sans-serif, system-ui, sans-serif/);
  const button = `${scope} .place-guest-row__primary[data-direction]`;
  assert.match(rule(button), /height: 24px/);
  assert.match(rule(button), /#101923, #060a11/);
  assert.match(rule(`${scope} .place-guest-row__media-details small.is-ready`), /#9aaed0/);
  assert.match(rule(`${scope}.is-queue .place-guest-row__status-line.is-corner .place-guest-row__status-pill`), /box-shadow: none/);
  assert.match(rule(`${button}:disabled`), /box-shadow: none/);
  assert.match(rule(`${scope}.is-backstage .place-guest-row__primary[data-direction="down"]:is(:hover, :focus-visible):not(:disabled)`), /#263c58, #132135/);
  assert.ok(!css.includes('[data-direction="up"]'), "Ne pas écraser le survol violet de Sur scène");
});

test("Coulisses : libellés et icônes des actions plus lisibles, rôles légèrement éclaircis", () => {
  const backstage = `${scope}.is-backstage`;
  assert.match(rule(`${backstage} .place-guest-row__primary[data-direction]`), /font-size: clamp\(7.5px, 1.9cqi, 8px\)/);
  assert.match(rule(`${backstage} .place-guest-row__primary[data-direction] > svg`), /width: 11px/);
  assert.match(rule(`${backstage} .place-guest-row__role`), /#a3a7b3/);
  assert.match(rule(`${backstage} .place-guest-row__media-details small`), /font-size: clamp\(7.5px, 2.2cqi, 8.5px\)/);
});
