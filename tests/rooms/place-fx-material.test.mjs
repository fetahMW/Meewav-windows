import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../../src/features/rooms/place/place-room-shell.css", import.meta.url), "utf8");
const mixer = ".place-room-shell .place-studio-panel.is-mixer";

function rulesFor(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Array.from(css.matchAll(new RegExp(`^${escaped}(?:,\\s*[^{}]+)?\\s*\\{([^}]*)\\}`, "gm")), (match) => match[1]);
}

function lastRule(selector) {
  const rule = rulesFor(selector).at(-1);
  assert.ok(rule, `Règle manquante : ${selector}`);
  return rule;
}

test("FX : Plugins du PC hérite de la hauteur et du noir communs aux modules repliés", () => {
  const common = lastRule(`${mixer} .place-fx-accordion:not(.is-open)`);
  assert.match(common, /min-height:\s*48px/);
  assert.match(common, /height:\s*48px/);
  assert.match(common, /#0c0e17 0%, #080910 58%, #060710 100%/);

  const plugins = `${mixer} .place-fx-accordion[data-section="plugins"]:not(.is-open)`;
  assert.equal(rulesFor(plugins).length, 0, "Le plugin ne doit plus imposer sa propre hauteur ou couleur");
  assert.equal(rulesFor(`${plugins} > .place-fx-accordion__trigger`).length, 0);
  const badge = lastRule(`${mixer} .place-fx-accordion:not(.is-open) .place-fx-accordion__trigger > em`);
  assert.match(badge, /min-width:\s*57px/);
  assert.match(badge, /height:\s*19px/);
  assert.match(lastRule(`${mixer} .place-fx-view__voice.is-compact`), /height:\s*73px/);
});

test("FX : les modules ouverts reprennent le bandeau premium, le contenu noir et les icônes du plugin", () => {
  const palette = lastRule(`${mixer} .place-fx-view.is-accordion`);
  assert.match(palette, /--fx-expanded-face:[^;]*linear-gradient\(105deg, #22242a 0%, #14151a 35%, #090a0c 100%\)/);
  assert.match(palette, /--fx-expanded-well:[^;]*#090a0c 0%, var\(--fx-rack-well\) 100%/);
  assert.match(palette, /--fx-expanded-icon-face:[^;]*#2b2d33 0%, #15171b 50%, #08090a 100%/);
  assert.match(palette, /--fx-control-face:\s*linear-gradient\(180deg, #1b1d21 0%, #0c0d10 100%\)/);
  for (const section of ["effects", "autotune"]) {
    const selector = `${mixer} .place-fx-accordion[data-section="${section}"].is-open`;
    const panel = lastRule(selector);
    assert.match(panel, /background:\s*var\(--fx-expanded-face\)/, section);
    assert.match(panel, /border:\s*1px solid rgba\(156, 95, 226, \.42\)/, section);
    const content = lastRule(`${selector} > .place-fx-accordion__panel`);
    assert.match(content, /background:\s*var\(--fx-expanded-well\)/, section);
    const icon = lastRule(`${selector} .place-fx-accordion__icon`);
    assert.match(icon, /background:\s*var\(--fx-expanded-icon-face\)/, section);
    assert.match(icon, /box-shadow:\s*var\(--fx-expanded-icon-shadow\)/, section);
    assert.match(icon, /width:\s*32px/, section);
  }
  const controls = rulesFor(`${mixer} .place-fx-accordion[data-section="autotune"].is-open .place-autotune-select__trigger`)
    .filter((rule) => /background:/.test(rule)).at(-1);
  assert.ok(controls);
  assert.match(controls, /background:\s*var\(--fx-control-face\)/);
});

test("Autotune : le moteur est placé à gauche de Son sec et sa liste monte", () => {
  const scope = `${mixer} .place-fx-accordion[data-section="autotune"].is-open`;
  const engine = lastRule(`${scope} .place-autotune-controls__engine`);
  assert.match(engine, /left:\s*17px/);
  assert.match(engine, /right:\s*95px/);
  assert.match(engine, /bottom:\s*6.5px/);
  const menu = lastRule(`${scope} .place-autotune-select[data-selector="engine"] .place-autotune-select__listbox`);
  assert.match(menu, /top:\s*auto/);
  assert.match(menu, /bottom:\s*calc\(100% \+ 4px\)/);
});

test("Lecteur : Préécoute, Public et Régie retrouvent les 34px de hauteur de la cible", () => {
  const root = ".place-room-shell";
  for (const selector of [
    `${root} .place-mixer-audio__routing button`,
    `${root} .place-mixer-audio__utility-actions .place-mixer-audio__regie-button`,
  ]) {
    const dimensions = rulesFor(selector).filter((rule) => /(?:^|\s)height:/.test(rule)).at(-1);
    assert.match(dimensions, /(?:^|\s)height:\s*34px;/);
    assert.match(dimensions, /min-height:\s*34px;/);
  }
  assert.match(lastRule(`${root} .place-mixer-audio__routing > span`), /height:\s*36px;/);
});

test("Volumes : espaces resserrés sans séparateur au-dessus du Master", () => {
  const scope = `${mixer} .place-mixer.has-audio-player`;
  assert.match(lastRule(`${scope} .place-volume-list`), /grid-template-rows:\s*repeat\(3, minmax\(0, 1fr\) 0px\) minmax\(0, 1fr\) 4px minmax\(0, 1fr\);/);
  assert.match(lastRule(`${scope} .place-volume-list`), /gap:\s*0;/);
  const separator = `${scope} .place-master-dock::before`;
  assert.match(lastRule(separator), /display:\s*none;/);
  assert.match(lastRule(separator), /content:\s*none;/);
  for (const rule of rulesFor(separator)) {
    assert.doesNotMatch(rule, /(?:display|content):[^;]*!important/);
  }
});

test("Volumes : poignées nacrées atténuées au repos, lumineuses au survol et au clavier", () => {
  const fader = `${mixer} .place-volume-row__fader`;
  for (const pseudo of ["::-webkit-slider-thumb", "::-moz-range-thumb"]) {
    const idle = lastRule(`${fader}${pseudo}`);
    assert.match(idle, /filter:\s*brightness\(\.78\)/);
    assert.match(idle, /transition:\s*filter 140ms ease/);
    assert.match(idle, /#fff 0%, #e7eaee 42%, #a1a6ae 100%/);
    const feedback = lastRule(`${fader}:not(:disabled):is(:hover, :focus-visible, :active)${pseudo}`);
    assert.match(feedback, /filter:\s*brightness\(1\)/);
    assert.doesNotMatch(feedback, /(?:width|height|transform):/);
  }
});

test("Studio : les quatre vues partagent un seul cadre PVC laqué, sans modifier la géométrie", () => {
  const shared = `.place-room-shell .place-studio-panel.is-host-panel:not(.is-collapsed):is(
  .is-chat,
  .is-mixer,
  .is-tools,
  .is-guests
)`;
  // Normalize only line endings so this invariant is portable on Windows.
  const normalized = css.replace(/\r\n/g, "\n");
  const material = normalized.slice(normalized.lastIndexOf(`${shared} {`)).split("}")[0];
  assert.match(material, /border-radius:\s*18px/);
  assert.match(material, /0 0 0 1px #010101/);
  assert.doesNotMatch(material, /0 0 0 [23]px/);
  assert.doesNotMatch(material, /(?:padding|height|width):/);
  const frame = normalized.slice(normalized.lastIndexOf(`${shared}::before {`)).split("}")[0];
  assert.match(frame, /inset:\s*0;/);
  assert.match(frame, /padding:\s*4px/);
  assert.match(frame, /border:\s*0;/);
  assert.match(frame, /border-radius:\s*inherit/);
  assert.match(frame, /mask-composite:\s*exclude/);
  assert.match(frame, /pointer-events:\s*none/);
  assert.match(frame, /opacity:\s*1;/);
  for (const corner of ["0% 0%", "100% 0%", "100% 100%", "0% 100%"]) {
    assert.ok(frame.includes(`at ${corner},`), `Reflet de laque manquant au coin ${corner}`);
  }
  assert.match(material, /#0c0e0f 0%, #050607 43%, #020203 100%/);
  const extraEdge = normalized.slice(normalized.lastIndexOf(`${shared}::after {`)).split("}")[0];
  assert.match(extraEdge, /display:\s*none/);
  assert.match(extraEdge, /content:\s*none/);
});
