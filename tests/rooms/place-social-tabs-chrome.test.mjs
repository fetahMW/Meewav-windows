import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../../src/features/rooms/place/place-social-tabs-chrome.css", import.meta.url), "utf8");
const rules = Array.from(css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g), ([, selectors, body]) => ({ selectors: selectors.split(/,(?![^(]*\))/).map((selector) => selector.trim()), body }));
const active = (surface) => `.place-room-shell .place-studio-panel.is-host-panel.is-${surface}:not(.is-collapsed) .place-studio-panel__tabs > button.is-active`;
const iconScope = ".place-room-shell .place-studio-panel.is-host-panel:not(.is-collapsed) .place-studio-panel__tabs > button";

function declarations(selector) {
  const found = rules.filter((rule) => rule.selectors.includes(selector));
  assert.ok(found.length, `Règle manquante : ${selector}`);
  return found.map((rule) => rule.body).join("\n");
}

test("Les matériaux Chat / Invités et les couleurs d'icônes restent limités aux onglets principaux", () => {
  assert.ok(rules.length >= 10);
  for (const { selectors } of rules) {
    for (const selector of selectors) {
      assert.ok(selector.startsWith(`${iconScope}[data-surface`) || /^\.place-room-shell \.place-studio-panel\.is-host-panel\.is-(?:chat|guests):not\(\.is-collapsed\) \.place-studio-panel__tabs > button\.is-active/.test(selector), selector);
      assert.doesNotMatch(selector, /\.is-(?:mixer|tools)|__subnav|\.place-guests|__bar/);
    }
  }
});

test("Chaque icône prend sa propre couleur au survol, au focus et à la sélection, quelle que soit la surface ouverte", () => {
  const palette = { chat: "#e9edf4", mixer: "#c584ff", tools: "#edc875", guests: "#86bdff" };
  for (const [surface, color] of Object.entries(palette)) {
    const material = declarations(`${iconScope}[data-surface="${surface}"]`);
    assert.ok(material.includes(`--studio-tab-icon: ${color};`));
    assert.match(material, /--studio-tab-icon-glow:\s*rgba/);
    assert.doesNotMatch(material, /(?:^|[;\n])\s*(?:background|border|box-shadow|width|height|padding|margin):/);
  }
  const feedback = declarations(`${iconScope}[data-surface]:not(:disabled):is(:hover, :focus-visible, .is-active) > svg`);
  assert.match(feedback, /color:\s*var\(--studio-tab-icon\)/);
  assert.match(feedback, /filter:\s*drop-shadow\(0 0 4px var\(--studio-tab-icon-glow\)\)/);
});

test("Chat / Invités : le relief Hi-Fi conserve le gabarit partagé", () => {
  for (const surface of ["chat", "guests"]) {
    const material = declarations(active(surface));
    assert.match(material, /border:\s*1px solid transparent/);
    assert.equal((material.match(/padding-box/g) ?? []).length, 3);
    assert.equal((material.match(/border-box/g) ?? []).length, 1);
    assert.match(material, /inset 0 -11px 21px/);
    assert.doesNotMatch(material, /(?:^|[;\n])\s*(?:width|height|min-height|margin|padding|border-radius|transform|display|position):/);
    const reflection = declarations(`${active(surface)}::before`);
    assert.match(reflection, /filter:\s*none/, "Ne pas conserver le filtre violet hérité");
    assert.match(reflection, /opacity:\s*\.54/);
  }
});

test("Chat : blanc nacré discret ; Invités : néon bleu et icône assortie", () => {
  assert.match(declarations(active("chat")), /#141517/);
  assert.match(declarations(`${active("chat")}::after`), /#eef1f7/);
  assert.match(declarations(`${active("chat")} > svg`), /color:\s*#e9edf4/);
  assert.match(declarations(active("guests")), /#0d1420/);
  assert.match(declarations(`${active("guests")}::after`), /#a9d2ff/);
  assert.match(declarations(`${active("guests")} > svg`), /color:\s*#86bdff/);
  for (const surface of ["chat", "guests"]) {
    const neon = declarations(`${active(surface)}::after`);
    assert.match(neon, /display:\s*block !important/);
    assert.match(neon, /height:\s*2px/);
    assert.match(neon, /pointer-events:\s*none/);
  }
});

test("Chat / Invités : couleur active prioritaire sur le hover générique et focus visible", () => {
  for (const surface of ["chat", "guests"]) {
    // .is-chat / .is-guests ajoute un niveau à la règle historique générique
    // .is-host-panel:not(.is-collapsed) button:hover : la palette ne redevient pas violette.
    const selector = active(surface);
    assert.match(selector, /\.is-host-panel\.is-(?:chat|guests):not\(\.is-collapsed\)/);
    assert.match(declarations(`${selector} > svg`), /filter:\s*drop-shadow/);
    const focus = declarations(`${selector}:focus-visible`);
    assert.match(focus, /outline:\s*1px solid/);
    assert.match(focus, /outline-offset:\s*-3px/);
  }
});
