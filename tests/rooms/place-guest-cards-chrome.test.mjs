import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../../src/features/rooms/place/place-guest-cards-chrome.css", import.meta.url), "utf8");
const tabCss = await readFile(new URL("../../src/features/rooms/place/place-social-tabs-chrome.css", import.meta.url), "utf8");
const scope = ".place-room-shell .place-studio-panel.is-guests .place-guest-row";
const rules = Array.from(css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g), ([, selector, body]) => ({ selector: selector.trim(), body }));
function rule(selector) {
  const found = rules.find((entry) => entry.selector === selector);
  assert.ok(found, `Règle manquante : ${selector}`);
  return found.body;
}

test("Les cartes gardent le reflet bleu Invités sur une base noire froide, sans voile gris", () => {
  assert.match(rule(scope), /--guest-accent:\s*#86bdff/);
  assert.match(rule(scope), /linear-gradient\(180deg, #080c16 0%, #03050a 55%, #010102 100%\)/);
  const guestTab = tabCss.slice(tabCss.indexOf(".place-room-shell .place-studio-panel.is-host-panel.is-guests"));
  const layers = rule(scope).match(/background:([\s\S]*?);/)[1].trim().split(/,\s*\n/);
  assert.equal(layers.length, 3);
  assert.match(layers[0], /rgba\(163, 191, 255, \.075\)/);
  assert.ok(guestTab.includes(layers[1].trim()), "Conserver exactement la teinte du reflet bleu de l'onglet");
  assert.match(rule(scope), /rgba\(76, 143, 238, \.22\)/);
  assert.match(rule(scope), /border-top-color:\s*rgba\(157, 204, 255, \.42\)/);
  assert.doesNotMatch(rule(scope), /(?:^|[;\n])\s*opacity:/, "Ne pas rendre les textes, portraits et boutons transparents");
  for (const { selector, body } of rules) {
    assert.ok(selector.startsWith(scope));
    if (!selector.includes("__primary")) assert.doesNotMatch(selector, /\.is-(?:queue|backstage|onstage|green-house)/);
    assert.doesNotMatch(body, /(?:^|[;\n])\s*(?:height|width|padding|margin|transform|grid-template[^:]*):/);
  }
  assert.doesNotMatch(rule(`${scope}:hover`), /background:/);
  assert.doesNotMatch(rule(`${scope}.is-selected`), /background:/);
  assert.match(rule(`${scope}.is-selected`), /border-color:/);
});

test("Le cerclage des portraits est commun et le séparateur intérieur est supprimé", () => {
  assert.match(rule(`${scope} .place-guest-row__avatar`), /conic-gradient/);
  assert.match(rule(`${scope} .place-guest-row__lower`), /border-top:\s*0/);
  assert.match(rule(`${scope} .place-guest-row__lower::before`), /content:\s*none/);
  assert.match(rule(`${scope} .place-guest-row__lower::before`), /display:\s*none/);
  assert.doesNotMatch(css, /__status-pill|__connection-indicator|__tabs|__segments/);
});

test("Les boutons de déplacement conservent leur finition commune au repos et désactivés", () => {
  const button = `${scope} .place-guest-row__primary[data-direction]`;
  assert.match(rule(button), /color:\s*#c3bff0/);
  assert.match(rule(button), /background:\s*linear-gradient\(135deg, #191a30, #10111f\)/);
  assert.match(rule(`${button}:hover:not(:disabled)`), /color:\s*#eeeaff/);
  assert.match(rule(`${button}:focus-visible`), /outline:\s*1px solid #aaa5f7/);
  assert.match(rule(`${button}:disabled`), /opacity:\s*\.48/);
  assert.match(rule(`${button}:disabled`), /color:\s*#c3bff0/);
  assert.match(rule(`${button} > svg`), /color:\s*inherit/);
  assert.doesNotMatch(css, /\.is-(?:amber|cyan|violet)/);
});

test("Coulisses : survol et focus distinguent la montée sur scène du retour en attente", () => {
  const state = ':is(:hover, :focus-visible):not(:disabled)';
  const button = `${scope}.is-backstage .place-guest-row__primary`;
  const waiting = rule(`${button}[data-direction="down"]${state}`);
  const stage = rule(`${button}[data-direction="up"]${state}`);
  assert.match(stage, /#30203e, #170f24/);
  assert.match(stage, /outline-color: #c584ff/);
  assert.match(waiting, /#35334b, #20202f/);
  assert.match(waiting, /0 0 10px/);
  assert.doesNotMatch(stage, /0 0 10px/);
});
