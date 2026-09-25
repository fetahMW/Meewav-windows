import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../../src/features/rooms/place/place-tools-chrome.css", import.meta.url), "utf8");
const mixerCss = await readFile(new URL("../../src/features/rooms/place/place-room-shell.css", import.meta.url), "utf8");
const rules = Array.from(css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g), ([, selector, body]) => ({ selector: selector.trim(), body }));
const tools = ".place-room-shell .place-studio-panel.is-tools .room-tools-shell.is-wave";
const nav = `${tools} .place-tools-console__switch`;

function rule(selector) {
  const found = rules.find((entry) => entry.selector === selector);
  assert.ok(found, `Règle manquante : ${selector}`);
  return found.body;
}

test("Outils : toutes les nouvelles règles restent isolées du Mixeur, du Chat et des Invités", () => {
  assert.ok(rules.length > 15);
  for (const { selector } of rules) {
    assert.match(selector, /^\.place-room-shell \.place-studio-panel\.(?:is-host-panel\.)?is-tools/);
    assert.doesNotMatch(selector, /\.is-(?:mixer|chat|guests)/);
    assert.match(selector, /(?:__tabs|\.room-tools-shell\.is-wave)/, "Le cadre extérieur ne doit pas être ciblé");
  }
});

test("Outils : une barre 34px, 37px sur écran haut, avec quatre entrées horizontales", () => {
  const layout = rule(`${tools}.place-tools-console`);
  assert.match(layout, /--tools-subnav-height:\s*34px/);
  assert.match(layout, /grid-template-rows:\s*max-content minmax\(0, 1fr\)/);
  assert.match(layout, /min-height:\s*0/);
  assert.match(css, /--tools-subnav-height:\s*37px/);
  assert.match(mixerCss, /\.place-mixer__subnav\.has-twists\s*\{\s*height:\s*37px/);
  assert.match(rule(nav), /grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(rule(nav), /margin:\s*3px 6px 4px/);
  assert.match(rule(nav), /border-radius:\s*10px/);
  assert.match(rule(`${nav} > button`), /display:\s*flex/);
  assert.match(rule(`${nav} > button`), /min-height:\s*var\(--tools-subnav-row\)/);
  assert.match(rule(`${nav} > button > span`), /white-space:\s*nowrap/);
  assert.match(rule(`${nav} > button > svg`), /width:\s*18px/);
  assert.match(rule(`${nav} > button + button::before`), /display:\s*block/);
});

test("Outils : arête du Mixeur conservée, accent or et focus clavier visible", () => {
  const edge = rule(`${nav}::before`).match(/background:\s*([^;]+);/)[1];
  assert.ok(mixerCss.includes(`background: ${edge};`), "Le sous-menu doit conserver la finition du Mixeur");
  assert.match(rule(`${nav}::before`), /mask-composite:\s*exclude/);
  assert.match(rule(`${nav} > button.is-active > svg`), /color:\s*#edc875/);
  assert.match(rule(`${nav} > button.is-active::after`), /opacity:\s*1/);
  assert.match(rule(`${nav} > button:focus-visible`), /outline:\s*1px solid/);
  const activeTab = ".place-room-shell .place-studio-panel.is-host-panel.is-tools:not(.is-collapsed) .place-studio-panel__tabs > button.is-active";
  assert.match(rule(activeTab), /border:\s*1px solid transparent/);
  assert.match(rule(`${activeTab}::after`), /#ffe1a0/);
  assert.match(rule(`${activeTab}::after`), /height:\s*2px/);
  assert.doesNotMatch(rule(activeTab), /(?:width|height|margin|padding):/, "L'onglet garde le gabarit partagé");
});
