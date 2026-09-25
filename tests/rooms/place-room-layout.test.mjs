import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceRoot = new URL("../../src/features/rooms/place/", import.meta.url);

test("Invités conserve la largeur commune du panneau Room", async () => {
  const [shellCss, premiumCss] = await Promise.all([
    readFile(new URL("place-room-shell.css", sourceRoot), "utf8"),
    readFile(new URL("place-room-premium.css", sourceRoot), "utf8"),
  ]);
  const styles = `${premiumCss}\n${shellCss}`;
  const guestWidthOverrides = styles.match(
    /:has\(\.place-studio-panel\.is-guests\)[^{]*\{[^}]*--place-studio-width:[^;}]+/g,
  ) ?? [];

  assert.equal(guestWidthOverrides.length, 1);
  assert.match(guestWidthOverrides[0], /clamp\(400px,\s*27vw,\s*440px\)/);
  assert.doesNotMatch(styles, /--place-studio-width:\s*clamp\(580px,\s*38vw,\s*720px\)/);
});

test("les commandes immédiates sont centrées au bas de la scène", async () => {
  const shellCss = await readFile(new URL("place-room-shell.css", sourceRoot), "utf8");
  const centeredControls = shellCss.match(
    /\.place-room-shell \.place-stage\.place-stage--director > \.place-stage__controls\s*\{([^}]*)\}/,
  );

  assert.ok(centeredControls);
  assert.match(centeredControls[1], /left:\s*50%/);
  assert.match(centeredControls[1], /right:\s*auto/);
  assert.match(centeredControls[1], /transform:\s*translateX\(-50%\)/);
});

test("Effets voix garde le ratio de référence et ses quatre lignes simultanées", async () => {
  const [shellCss, mixerSource] = await Promise.all([
    readFile(new URL("place-room-shell.css", sourceRoot), "utf8"),
    readFile(new URL("PlaceMixer.tsx", sourceRoot), "utf8"),
  ]);
  const voiceFx = shellCss.slice(shellCss.lastIndexOf("/* Effets voix — référence normalisée"));
  const sharedStack = shellCss.match(/\.place-fx-accordion-stack\s*\{([^}]*)\}/);
  const stack = voiceFx.match(/\.place-room-shell \.place-fx-accordion-stack\s*\{([^}]*)\}/);
  const scrollbar = voiceFx.match(/\.place-room-shell \.place-fx-accordion-stack::\-webkit-scrollbar\s*\{([^}]*)\}/);
  const scrollbarTrack = voiceFx.match(/\.place-room-shell \.place-fx-accordion-stack::\-webkit-scrollbar-track\s*\{([^}]*)\}/);
  const scrollbarThumb = voiceFx.match(/\.place-room-shell \.place-fx-accordion-stack::\-webkit-scrollbar-thumb\s*\{([^}]*)\}/);
  const panel = voiceFx.match(/\.place-room-shell \.place-fx-accordion\[data-section="effects"\]\.is-open\s*\{([^}]*)\}/);
  const trigger = voiceFx.match(/\.place-room-shell \.place-fx-accordion\[data-section="effects"\]\.is-open > \.place-fx-accordion__trigger\s*\{([^}]*)\}/);
  const formTypography = voiceFx.match(/\.place-room-shell \.place-fx-accordion\[data-section="effects"\]\.is-open button,\s*[\s\S]*?\.is-open output\s*\{([^}]*)\}/);
  const list = voiceFx.match(/\.place-room-shell \.place-fx-effect-list\s*\{([^}]*)\}/);
  const row = voiceFx.match(/\.place-room-shell \.place-fx-effect-list > \.place-fx-card\s*\{([^}]*)\}/);
  const lastRow = voiceFx.match(/\.place-room-shell \.place-fx-effect-list > \.place-fx-card:last-child\s*\{([^}]*)\}/);
  const toggle = voiceFx.match(/\.place-room-shell \.place-fx-effect-list \.place-fx-card__toggle\s*\{([^}]*)\}/);
  const railGeometry = voiceFx.match(/\.place-room-shell \.place-fx-effect-list \.place-fx-card__range::before,\s*[\s\S]*?\.place-fx-card__range::after\s*\{([^}]*)\}/);
  const rail = voiceFx.match(/\.place-room-shell \.place-fx-effect-list \.place-fx-card__range::before\s*\{([^}]*)\}/);
  const knob = voiceFx.match(/\.place-room-shell \.place-fx-effect-list \.place-fx-card__range > i\s*\{([^}]*)\}/);
  const rowTitle = voiceFx.match(/\.place-room-shell \.place-fx-effect-list \.place-fx-card > header > strong\s*\{([^}]*)\}/);
  const value = voiceFx.match(/\.place-room-shell \.place-fx-effect-list \.place-fx-card output\s*\{([^}]*)\}/);

  assert.ok(sharedStack && stack && scrollbar && scrollbarTrack && scrollbarThumb && panel && trigger && formTypography && list && row && lastRow && toggle && railGeometry && rail && knob && rowTitle && value);
  assert.match(sharedStack[1], /overflow-y:\s*auto/);
  assert.match(stack[1], /grid-auto-rows:\s*max-content/);
  assert.match(stack[1], /width:\s*calc\(100% \+ 7px\)/);
  assert.match(stack[1], /margin-right:\s*-7px/);
  assert.match(stack[1], /scrollbar-gutter:\s*stable/);
  assert.match(stack[1], /scrollbar-width:\s*thin/);
  assert.match(stack[1], /scrollbar-color:\s*#7558e8 rgba\(40, 35, 62, \.22\)/);
  assert.match(stack[1], /touch-action:\s*pan-y/);
  assert.match(scrollbar[1], /width:\s*7px/);
  assert.match(scrollbarTrack[1], /background:\s*rgba\(40, 35, 62, \.22\)/);
  assert.match(scrollbarThumb[1], /min-height:\s*34px/);
  assert.match(scrollbarThumb[1], /linear-gradient\(180deg, #a15cff 0%, #745cf4 48%, #4d7fe8 100%\)/);
  assert.doesNotMatch(shellCss, /\.place-room-shell \.place-fx-accordion-stack[^{}]*\{[^}]*scrollbar-width:\s*none/);
  assert.match(panel[1], /width:\s*100%/);
  assert.match(panel[1], /min-height:\s*244px/);
  assert.match(panel[1], /aspect-ratio:\s*1328\s*\/\s*902/);
  assert.match(panel[1], /grid-template-rows:\s*14% minmax\(0, 86%\)/);
  assert.match(panel[1], /border:\s*1px solid transparent/);
  assert.match(panel[1], /linear-gradient\(135deg, rgba\(154, 87, 196, \.26\), rgba\(86, 77, 154, \.2\) 52%, rgba\(50, 105, 164, \.26\)\) border-box/);
  assert.match(panel[1], /border-radius:\s*9px/);
  assert.match(panel[1], /font-family:\s*Arial, Helvetica, ui-sans-serif, system-ui, sans-serif/);
  assert.match(formTypography[1], /font-family:\s*Arial, Helvetica, ui-sans-serif, system-ui, sans-serif/);
  assert.match(trigger[1], /grid-template-columns:\s*22px minmax\(0, 1fr\) 12px/);
  assert.match(trigger[1], /gap:\s*13px/);
  assert.match(list[1], /grid-template-rows:\s*24% 24% 24% 28%/);
  assert.match(row[1], /grid-template-rows:\s*18px 10px minmax\(8px, 1fr\)/);
  assert.match(row[1], /gap:\s*2px/);
  assert.match(row[1], /padding:\s*7px 15px 4px 14px/);
  assert.match(lastRow[1], /padding-top:\s*7px/);
  assert.match(lastRow[1], /padding-bottom:\s*8px/);
  assert.match(toggle[1], /width:\s*39px/);
  assert.match(toggle[1], /height:\s*17px/);
  assert.match(railGeometry[1], /height:\s*5\.5px/);
  assert.match(knob[1], /width:\s*15px/);
  assert.match(knob[1], /height:\s*15px/);
  assert.match(knob[1], /border:\s*3px solid transparent/);
  assert.match(knob[1], /linear-gradient\(135deg, #a05be6 0%, #6b61fd 56%, #3b91fe 100%\) border-box/);
  assert.match(rowTitle[1], /transform:\s*scaleX\(\.88\)/);
  assert.match(rowTitle[1], /transform-origin:\s*left center/);
  assert.match(value[1], /transform:\s*scaleX\(\.83\)/);
  assert.match(value[1], /transform-origin:\s*right center/);

  assert.match(mixerSource, /className="place-fx-effect-list"/);
  assert.equal((mixerSource.match(/<EffectCard title=/g) ?? []).length, 4);
  assert.doesNotMatch(mixerSource, /openBrowserEffect|place-fx-effect-tabs/);
  assert.match(mixerSource, /lowLabel="Sec" highLabel="Ambiant"/);
  assert.match(mixerSource, /lowLabel="Court" highLabel="Long"/);
  assert.match(mixerSource, /lowLabel="Doux" highLabel="Fort"/);
  assert.match(mixerSource, /lowLabel="Grave" highLabel="Clair"/);
  for (const section of ["effects", "autotune", "engines", "plugins"]) {
    assert.match(mixerSource, new RegExp(`id="${section}"`));
  }

  const normalizedWidth = 371;
  const normalizedHeight = normalizedWidth * 902 / 1328;
  const headerHeight = normalizedHeight * 0.14;
  const panelHeight = normalizedHeight * 0.86;
  const nextAccordionTop = normalizedHeight + 6;
  assert.ok(normalizedHeight >= 251 && normalizedHeight <= 253);
  assert.ok(headerHeight >= 35 && headerHeight <= 36);
  assert.ok(panelHeight >= 216 && panelHeight <= 217);
  assert.ok(nextAccordionTop >= normalizedHeight + 6);
});

test("Autotune conserve le ratio de référence et ses commandes dans la colonne Room", async () => {
  const [shellCss, mixerSource] = await Promise.all([
    readFile(new URL("place-room-shell.css", sourceRoot), "utf8"),
    readFile(new URL("PlaceMixer.tsx", sourceRoot), "utf8"),
  ]);
  const autotune = shellCss.slice(shellCss.lastIndexOf("/* Autotune — référence 1097 × 841"));
  const frame = autotune.match(/\.place-room-shell \.place-fx-accordion\[data-section="autotune"\]\.is-open\s*\{([^}]*)\}/);
  const header = autotune.match(/\.place-fx-accordion__header > \.place-fx-accordion__trigger\s*\{([^}]*)\}/);
  const selectors = autotune.match(/\.place-autotune-controls__selectors\s*\{([^}]*)\}/);
  const premiumSelect = autotune.match(/\.place-autotune-select__trigger\s*\{([^}]*)\}/);
  const premiumListbox = autotune.match(/\.place-autotune-select__listbox\s*\{([^}]*)\}/);
  const ranges = autotune.match(/\.place-autotune-controls__ranges\s*\{([^}]*)\}/);
  const railGeometry = autotune.match(/\.place-fx-detail-range__rail::before,\s*[\s\S]*?\.place-fx-detail-range__rail::after\s*\{([^}]*)\}/);
  const rail = autotune.match(/\.place-fx-detail-range__rail::before\s*\{([^}]*)\}/);
  const knob = autotune.match(/\.place-fx-detail-range__rail > i\s*\{([^}]*)\}/);
  const dry = autotune.match(/\.place-autotune-controls__dry\s*\{([^}]*)\}/);
  const toggle = autotune.match(/\.place-autotune-toggle\s*\{([^}]*)\}/);

  assert.ok(frame && header && selectors && premiumSelect && premiumListbox && ranges && railGeometry && rail && knob && dry && toggle);
  assert.match(frame[1], /width:\s*100%/);
  assert.match(frame[1], /aspect-ratio:\s*1097\s*\/\s*841/);
  assert.match(frame[1], /grid-template-rows:\s*18\.1% minmax\(0, 81\.9%\)/);
  assert.match(frame[1], /overflow:\s*hidden/);
  assert.match(frame[1], /border:\s*1px solid transparent/);
  assert.match(frame[1], /linear-gradient\(#0c0e19, #0c0e19\) padding-box/);
  assert.match(frame[1], /font-family:\s*Arial, Helvetica, ui-sans-serif, system-ui, sans-serif/);
  assert.match(header[1], /grid-template-columns:\s*24px minmax\(0, 1fr\) 54px 44px 14px/);
  assert.match(header[1], /gap:\s*7px/);
  assert.match(header[1], /padding:\s*0 13px 0 16px/);
  assert.match(selectors[1], /top:\s*6px/);
  assert.match(selectors[1], /right:\s*12\.5px/);
  assert.match(selectors[1], /left:\s*12\.5px/);
  assert.match(selectors[1], /height:\s*40px/);
  assert.match(selectors[1], /gap:\s*8\.5px/);
  assert.match(premiumSelect[1], /display:\s*grid/);
  assert.match(premiumSelect[1], /height:\s*40px/);
  assert.match(premiumSelect[1], /grid-template-columns:\s*minmax\(0, 1fr\) 12px/);
  assert.match(premiumSelect[1], /border:\s*1px solid transparent/);
  assert.match(premiumListbox[1], /max-height:\s*143px/);
  assert.match(premiumListbox[1], /overflow-y:\s*auto/);
  assert.match(premiumListbox[1], /linear-gradient\(145deg, #171326 0%, #0e1220 58%, #0b1723 100%\)/);
  assert.match(ranges[1], /top:\s*59px/);
  assert.match(ranges[1], /grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(ranges[1], /grid-template-rows:\s*54px 54px/);
  assert.match(ranges[1], /gap:\s*17px/);
  assert.match(railGeometry[1], /height:\s*5px/);
  assert.match(knob[1], /width:\s*15px/);
  assert.match(knob[1], /height:\s*15px/);
  assert.match(knob[1], /border:\s*1px solid #f1f1ff/);
  assert.match(knob[1], /linear-gradient\(135deg, #9f67f5 0%, #7273fb 56%, #5596fc 100%\)/);
  assert.match(toggle[1], /width:\s*42px/);
  assert.match(toggle[1], /height:\s*24px/);
  assert.match(dry[1], /width:\s*77px/);
  assert.match(dry[1], /height:\s*26px/);
  assert.match(dry[1], /right:\s*12\.5px/);
  assert.match(dry[1], /bottom:\s*12px/);

  assert.match(mixerSource, /function AutotuneSparkleIcon\(\)/);
  assert.match(mixerSource, /preserveAspectRatio="none"/);
  assert.match(mixerSource, /linearGradient id="place-autotune-sparkle-main"/);
  assert.match(mixerSource, /status=\{autotuneRuntimeLabel\}/);
  assert.match(mixerSource, /correctionSelected \? correctionRuntimeLabel : "Prêt à tester"/);
  assert.match(mixerSource, /requestPitchProvider\("meewav_test"\)/);
  assert.match(mixerSource, /label="Vitesse de correction"/);
  assert.match(mixerSource, /visualValue=\{toVisualPosition\(room\.personalVocal\.tuneSpeed, 0\.86, 0\.8225\) \* 100\}/);
  assert.match(mixerSource, /visualValue=\{toVisualPosition\(room\.personalVocal\.tuneHumanize, 0\.22, 0\.2623\) \* 100\}/);
  assert.match(mixerSource, /lowLabel="Naturel"/);
  assert.match(mixerSource, /highLabel="Humain"/);
});

test("le bandeau live garde l'identité et le direct à gauche, puis les quatre compteurs à droite", async () => {
  const [shellCss, headerSource, moneyBag] = await Promise.all([
    readFile(new URL("place-room-shell.css", sourceRoot), "utf8"),
    readFile(new URL("PlaceRoomShellHeader.tsx", sourceRoot), "utf8"),
    readFile(new URL("../../public/images/rooms/place/money-bag.svg", import.meta.url), "utf8"),
  ]);
  const liveHeader = shellCss.slice(shellCss.lastIndexOf("/* Bandeau live — composition normalisée"));
  const shellbar = liveHeader.match(/\.place-room-shellbar\s*\{([^}]*)\}/);
  const hostSide = liveHeader.match(/\.place-room-shellbar__host-side\s*\{([^}]*)\}/);
  const countdownSlot = liveHeader.match(/\.place-room-shellbar > \.place-room-shellbar__broadcast-cluster\s*\{([^}]*)\}/);
  const counters = liveHeader.match(/\.place-room-shellbar__counters\s*\{([^}]*)\}/);
  const moneyBagRule = liveHeader.match(/\.place-room-shellbar__money-bag\s*\{([^}]*)\}/);
  const actions = liveHeader.match(/\.place-room-shellbar__actions\s*\{([^}]*)\}/);

  assert.ok(shellbar && hostSide && countdownSlot && counters && moneyBagRule && actions);
  assert.match(shellbar[1], /position:\s*relative/);
  assert.match(shellbar[1], /grid-template-columns:\s*max-content minmax\(0, 1fr\)/);
  assert.match(hostSide[1], /display:\s*flex/);
  assert.match(hostSide[1], /justify-self:\s*end/);
  assert.match(countdownSlot[1], /width:\s*154px/);
  assert.match(countdownSlot[1], /min-width:\s*154px/);
  assert.match(countdownSlot[1], /max-width:\s*154px/);
  assert.match(countdownSlot[1], /height:\s*50px/);
  assert.match(countdownSlot[1], /position:\s*absolute/);
  assert.match(countdownSlot[1], /inset-block-start:\s*50%/);
  assert.match(countdownSlot[1], /inset-inline-start:\s*50%/);
  assert.match(countdownSlot[1], /transform:\s*translate\(-50%, -50%\)/);
  assert.match(countdownSlot[1], /justify-self:\s*center/);
  assert.match(counters[1], /width:\s*280px/);
  assert.match(counters[1], /grid-template-columns:\s*repeat\(4, 70px\)/);
  assert.match(moneyBagRule[1], /object-fit:\s*contain/);
  assert.doesNotMatch(moneyBagRule[1], /filter:/);
  assert.match(actions[1], /border-left:\s*1px solid/);
  assert.match(headerSource, /"EN DIRECT"/);
  assert.match(headerSource, /title="Likes"/);
  assert.match(headerSource, /className="is-like" title="Likes"/);
  assert.match(headerSource, /title="Golden Likes"/);
  assert.match(headerSource, /title="Soutien reçu"/);
  assert.match(headerSource, /title="Audience actuelle"/);
  assert.match(headerSource, /title="Soutien reçu"[\s\S]*title="Golden Likes"[\s\S]*title="Likes"[\s\S]*title="Audience actuelle"/);
  assert.match(headerSource, /MeewavPillarBrand pillar=\{roomPresentation\.label\}/);
  assert.match(headerSource, /place-room-shellbar__identity[\s\S]*MeewavPillarBrand[\s\S]*place-room-shellbar__live-since/);
  assert.match(headerSource, /place-room-shellbar__identity[\s\S]*place-room-shellbar__broadcast-cluster[\s\S]*place-room-shellbar__host-side/);
  assert.match(headerSource, /src="\/images\/rooms\/place\/money-bag\.svg"/);
  assert.match(moneyBag, /viewBox="0 0 800 800"/);
  assert.match(moneyBag, /fill="#FFCA28"/);
  assert.match(moneyBag, /stroke="#6C43FF"/);
  assert.doesNotMatch(headerSource, /PlaceDonationHat/);
});

test("le lecteur sans pochette reste strictement contenu dans son cadre compact de 108px", async () => {
  const [shellCss, playerSource] = await Promise.all([
    readFile(new URL("place-room-shell.css", sourceRoot), "utf8"),
    readFile(new URL("PlaceMixerAudioPlayer.tsx", sourceRoot), "utf8"),
  ]);
  const finalPlayer = shellCss.slice(shellCss.lastIndexOf("/* Lecteur compact 108px"));
  const player = finalPlayer.match(/\.place-room-shell \.place-mixer-audio,\s*[\s\S]*?\.place-mixer-audio\.is-empty\s*\{([^}]*)\}/);
  const surface = finalPlayer.match(/\.place-room-shell \.place-mixer-audio__surface,\s*[\s\S]*?\.place-mixer-audio__surface\s*\{([^}]*)\}/);
  const body = finalPlayer.match(/\.place-room-shell \.place-mixer-audio__body,\s*[\s\S]*?\.place-mixer-audio__body\s*\{([^}]*)\}/);
  const track = finalPlayer.match(/\.place-room-shell \.place-mixer-audio__track,\s*[\s\S]*?\.place-mixer-audio__track\s*\{([^}]*)\}/);
  const title = finalPlayer.match(/\.place-room-shell \.place-mixer-audio__meta strong,\s*[\s\S]*?\.place-mixer-audio__meta strong\s*\{([^}]*)\}/);
  const importButton = finalPlayer.match(/\.place-room-shell \.place-mixer-audio__import\s*\{([^}]*)\}/);
  const waveform = finalPlayer.match(/\.place-room-shell \.place-mixer-audio__waveform,\s*[\s\S]*?\.place-mixer-audio__waveform\s*\{([^}]*)\}/);
  const waveformBars = finalPlayer.match(/\.place-room-shell \.place-mixer-audio__waveform-bars,\s*[\s\S]*?\.place-mixer-audio__waveform-bars\s*\{([^}]*)\}/);
  const waveformCursor = finalPlayer.match(/\.place-room-shell \.place-mixer-audio__waveform-cursor\s*\{([^}]*)\}/);
  const timeline = finalPlayer.match(/\.place-room-shell \.place-mixer-audio__timeline\s*\{([^}]*)\}/);
  const time = finalPlayer.match(/\.place-room-shell \.place-mixer-audio__time\s*\{([^}]*)\}/);
  const controls = finalPlayer.match(/\.place-room-shell \.place-mixer-audio__controls,\s*[\s\S]*?\.place-mixer-audio__controls\s*\{([^}]*)\}/);
  const controlsSurface = finalPlayer.match(/\.place-room-shell \.place-mixer-audio__controls::before\s*\{([^}]*)\}/);
  const chronoSlot = finalPlayer.match(/\.place-room-shell \.place-mixer-audio__chrono-slot\s*\{([^}]*)\}/);
  const chrono = finalPlayer.match(/\.place-room-shell \.place-mixer-audio__chrono-toggle\.is-visible,\s*[\s\S]*?input:checked\)\s*\{([^}]*)\}/);
  const chronoHit = finalPlayer.match(/\.place-room-shell \.place-mixer-audio__chrono-toggle\.is-visible::before\s*\{([^}]*)\}/);
  const chronoIcon = finalPlayer.match(/\.place-room-shell \.place-mixer-audio__chrono-toggle\.is-visible svg\s*\{([^}]*)\}/);
  const chronoSwitch = finalPlayer.match(/\.place-room-shell \.place-mixer-audio__chrono-toggle\.is-visible > i\s*\{([^}]*)\}/);
  const chronoKnob = finalPlayer.match(/\.place-room-shell \.place-mixer-audio__chrono-toggle\.is-visible > i::after\s*\{([^}]*)\}/);
  const chronoCheckedKnob = finalPlayer.match(/\.place-room-shell \.place-mixer-audio__chrono-toggle\.is-visible:has\(input:checked\) > i::after\s*\{([^}]*)\}/);
  const transport = finalPlayer.match(/\.place-room-shell \.place-mixer-audio__transport-buttons\s*\{([^}]*)\}/);
  const transportButton = finalPlayer.match(/\.place-room-shell \.place-mixer-audio__transport-buttons > button\s*\{([^}]*)\}/);
  const play = finalPlayer.match(/\.place-room-shell \.place-mixer-audio__play,\s*[\s\S]*?\.place-mixer-audio__play\s*\{([^}]*)\}/);
  const nextButton = finalPlayer.match(/\.place-room-shell \.place-mixer-audio__transport-buttons > button:last-child\s*\{([^}]*)\}/);
  const coverDrawer = finalPlayer.match(/\.place-room-shell \.place-mixer-cover-drawer\s*\{([^}]*)\}/);
  const coverWall = finalPlayer.match(/\.place-room-shell \.place-mixer-cover-wall\s*\{([^}]*)\}/);
  const coverOption = finalPlayer.match(/\.place-room-shell \.place-mixer-cover-wall > button\s*\{([^}]*)\}/);
  const compactPlayer = finalPlayer.slice(finalPlayer.indexOf("@container (max-width: 369px)"));
  const compactSurface = compactPlayer.match(/\.place-room-shell \.place-mixer-audio__surface,\s*[\s\S]*?\.place-mixer-audio__surface\s*\{([^}]*)\}/);
  const compactControls = compactPlayer.match(/\.place-room-shell \.place-mixer-audio__controls,\s*[\s\S]*?\.place-mixer-audio__controls\s*\{([^}]*)\}/);
  const compactChrono = compactPlayer.match(/\.place-room-shell \.place-mixer-audio__chrono-toggle\.is-visible,\s*[\s\S]*?input:checked\)\s*\{([^}]*)\}/);
  const compactChronoIcon = compactPlayer.match(/\.place-room-shell \.place-mixer-audio__chrono-toggle\.is-visible svg\s*\{([^}]*)\}/);
  const compactChronoSwitch = compactPlayer.match(/\.place-room-shell \.place-mixer-audio__chrono-toggle\.is-visible > i\s*\{([^}]*)\}/);
  const compactChronoKnob = compactPlayer.match(/\.place-room-shell \.place-mixer-audio__chrono-toggle\.is-visible > i::after\s*\{([^}]*)\}/);
  const compactChronoCheckedKnob = compactPlayer.match(/\.place-room-shell \.place-mixer-audio__chrono-toggle\.is-visible:has\(input:checked\) > i::after\s*\{([^}]*)\}/);

  assert.ok(player && surface && body && track && title && importButton && waveform && waveformBars && waveformCursor && timeline && time && controls && controlsSurface && chronoSlot && chrono && chronoHit && chronoIcon && chronoSwitch && chronoKnob && chronoCheckedKnob && transport && transportButton && play && nextButton && coverDrawer && coverWall && coverOption && compactSurface && compactControls && compactChrono && compactChronoIcon && compactChronoSwitch && compactChronoKnob && compactChronoCheckedKnob);
  assert.match(player[1], /min-height:\s*108px/);
  assert.match(player[1], /height:\s*108px/);
  assert.match(player[1], /max-height:\s*108px/);
  assert.match(player[1], /border:\s*1px solid transparent/);
  assert.match(player[1], /linear-gradient\(90deg, #ce60f8 0%, #6c5fff 50%, #185493 100%\) border-box/);
  assert.match(surface[1], /grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(surface[1], /grid-template-rows:\s*98px/);
  assert.match(surface[1], /gap:\s*0/);
  assert.match(surface[1], /padding:\s*5px 9px 3px/);
  assert.match(body[1], /height:\s*98px/);
  assert.match(body[1], /grid-column:\s*1/);
  assert.match(body[1], /grid-row:\s*1/);
  assert.match(body[1], /grid-template-rows:\s*22px 31px 10px 35px/);
  assert.match(track[1], /grid-template-columns:\s*minmax\(0, 1fr\) auto/);
  assert.match(track[1], /gap:\s*8px/);
  assert.match(title[1], /font-size:\s*12px/);
  assert.match(title[1], /font-weight:\s*900/);
  assert.match(importButton[1], /width:\s*66px\s*!important/);
  assert.match(importButton[1], /height:\s*22px\s*!important/);
  assert.match(importButton[1], /transform:\s*none/);
  assert.match(waveform[1], /width:\s*100%/);
  assert.match(waveform[1], /height:\s*31px/);
  assert.match(waveformBars[1], /height:\s*23px/);
  assert.match(waveformBars[1], /transform:\s*none/);
  assert.match(waveformCursor[1], /top:\s*3px/);
  assert.match(waveformCursor[1], /bottom:\s*-1px/);
  assert.match(waveformCursor[1], /width:\s*1px/);
  assert.match(timeline[1], /width:\s*100%/);
  assert.match(timeline[1], /padding:\s*2px 0 0/);
  assert.match(time[1], /font-size:\s*6px/);
  assert.match(controls[1], /width:\s*100%/);
  assert.match(controls[1], /height:\s*35px/);
  assert.match(controls[1], /grid-template-columns:\s*minmax\(39px, 1fr\) 114px minmax\(39px, 1fr\)/);
  assert.match(controls[1], /column-gap:\s*8px/);
  assert.match(controls[1], /border:\s*0/);
  assert.match(controls[1], /background:\s*transparent/);
  assert.match(controlsSurface[1], /display:\s*none/);
  assert.match(chronoSlot[1], /position:\s*absolute/);
  assert.match(chronoSlot[1], /top:\s*50%/);
  assert.match(chronoSlot[1], /right:\s*0/);
  assert.match(chronoSlot[1], /margin-left:\s*0/);
  assert.match(chronoSlot[1], /transform:\s*translateY\(-50%\)/);
  assert.match(chrono[1], /width:\s*39px/);
  assert.match(chrono[1], /height:\s*13px\s*!important/);
  assert.match(chrono[1], /border:\s*0\s*!important/);
  assert.match(chronoHit[1], /inset:\s*-5px -4px/);
  assert.match(chronoIcon[1], /width:\s*12px/);
  assert.match(chronoSwitch[1], /width:\s*23px/);
  assert.match(chronoSwitch[1], /height:\s*13px/);
  assert.match(chronoKnob[1], /width:\s*9px/);
  assert.match(chronoKnob[1], /height:\s*9px/);
  assert.match(chronoCheckedKnob[1], /translateX\(11px\)/);
  assert.match(transport[1], /width:\s*114px/);
  assert.match(transport[1], /gap:\s*0/);
  assert.match(transport[1], /justify-self:\s*center/);
  assert.match(transport[1], /transform:\s*none/);
  assert.match(transportButton[1], /width:\s*24px/);
  assert.match(transportButton[1], /height:\s*24px/);
  assert.match(play[1], /width:\s*34px/);
  assert.match(play[1], /height:\s*34px\s*!important/);
  assert.match(play[1], /margin-left:\s*16px/);
  assert.match(nextButton[1], /margin-left:\s*16px/);
  assert.match(coverDrawer[1], /grid-template-rows:\s*23px 59px 20px/);
  assert.match(coverWall[1], /grid-template-columns:\s*repeat\(6, 28px\)/);
  assert.match(coverWall[1], /grid-template-rows:\s*repeat\(2, 28px\)/);
  assert.match(coverOption[1], /width:\s*28px/);
  assert.match(coverOption[1], /height:\s*28px/);

  const playerWidth = 373;
  const bodyRows = [22, 31, 10, 35];
  const bodyTop = 1 + 5;
  const bodyLeft = 1 + 9;
  const bodyRight = playerWidth - 1 - 9;
  const bodyWidth = bodyRight - bodyLeft;
  const waveformTop = bodyTop + bodyRows[0];
  const waveformBarsTop = waveformTop + ((31 - 23) / 2);
  const timelineTop = waveformTop + bodyRows[1];
  const controlsTop = timelineTop + bodyRows[2];
  const transportLeft = bodyLeft + ((bodyWidth - 114) / 2);
  const transportCenterY = controlsTop + (35 / 2);
  const previousCenterX = transportLeft + 12;
  const playCenterX = transportLeft + 24 + 16 + 17;
  const nextCenterX = transportLeft + 24 + 16 + 34 + 16 + 12;
  const chronoLeft = bodyRight - 39;
  const chronoRight = chronoLeft + 39;

  assert.equal(bodyRows.reduce((total, value) => total + value, 0), 98);
  assert.equal(bodyTop, 6);
  assert.equal(bodyLeft, 10);
  assert.equal(bodyWidth, 353);
  assert.equal(bodyRight - 66, 297);
  assert.equal(waveformBarsTop, 32);
  assert.equal(timelineTop, 59);
  assert.equal(controlsTop, 69);
  assert.equal(transportCenterY, 86.5);
  assert.equal(previousCenterX, 141.5);
  assert.equal(playCenterX, 186.5);
  assert.equal(nextCenterX, 231.5);
  assert.equal(chronoLeft, 324);
  assert.equal(bodyRight - chronoRight, 0);
  assert.equal(108 - (transportCenterY + 17), 4.5);

  assert.doesNotMatch(playerSource, /place-mixer-audio__art|resolvePlaceMixerCover|place-mixer-audio__label|place-mixer-audio__actions|place-mixer-audio__queue-button|place-mixer-audio__more/);
  assert.doesNotMatch(playerSource, /aria-label="Activer le chronomètre"|<span>Chrono<\/span>|<span>Chronomètre<\/span>/);
  assert.match(playerSource, /aria-label="Piste précédente"/);
  assert.match(playerSource, /aria-label="Piste suivante"/);
  assert.match(playerSource, /Revenir au curseur/);
  assert.match(playerSource, /aria-label="Options de lecture"/);
  assert.match(playerSource, /Lecture dans l’ordre/);
  assert.match(playerSource, /Lecture aléatoire/);
  assert.match(playerSource, /Lecture en boucle/);
  assert.match(playerSource, /PLACE_MIXER_FALLBACK_COVERS\.map/);
  assert.match(playerSource, /pendingImportCover && !track\.cover/);
  assert.match(compactSurface[1], /grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(compactSurface[1], /grid-template-rows:\s*98px/);
  assert.match(compactControls[1], /grid-template-columns:\s*minmax\(31px, 1fr\) 84px minmax\(31px, 1fr\)/);
  assert.match(compactChrono[1], /width:\s*31px/);
  assert.match(compactChrono[1], /height:\s*12px\s*!important/);
  assert.match(compactChronoIcon[1], /width:\s*9px/);
  assert.match(compactChronoSwitch[1], /width:\s*18px/);
  assert.match(compactChronoSwitch[1], /height:\s*11px/);
  assert.match(compactChronoKnob[1], /width:\s*8px/);
  assert.match(compactChronoKnob[1], /height:\s*8px/);
  assert.match(compactChronoCheckedKnob[1], /translateX\(8px\)/);
});

test("le mixeur récupère la ligne du libellé sans redimensionner ses outils", async () => {
  const [shellCss, mixerSource] = await Promise.all([
    readFile(new URL("place-room-shell.css", sourceRoot), "utf8"),
    readFile(new URL("PlaceMixer.tsx", sourceRoot), "utf8"),
  ]);
  const finalMixer = shellCss.slice(shellCss.indexOf("/* Mixeur 2026 — outils ouverts"));
  const mixer = finalMixer.match(
    /\.place-room-shell \.place-mixer\.has-audio-player\s*\{([^}]*)\}/,
  );
  const navigation = finalMixer.match(
    /\.place-room-shell \.place-mixer__subnav\.has-twists\s*\{([^}]*)\}/,
  );
  const navigationButton = finalMixer.match(
    /\.place-room-shell \.place-mixer__subnav\.has-twists > button\s*\{([^}]*)\}/,
  );

  assert.ok(mixer && navigation && navigationButton);
  assert.doesNotMatch(mixerSource, /Outils du mixeur|place-mixer__tools-label/);
  assert.doesNotMatch(finalMixer, /place-mixer__tools-label/);
  assert.match(mixer[1], /grid-template-rows:\s*39px auto minmax\(0, 1fr\)/);
  assert.match(navigation[1], /min-height:\s*39px/);
  assert.match(navigation[1], /grid-template-rows:\s*35px/);
  assert.match(navigationButton[1], /min-height:\s*35px/);
  assert.match(navigationButton[1], /grid-row:\s*1/);
});

test("chaque tranche vocale réserve sa deuxième action à la caméra", async () => {
  const [shellCss, mixerSource] = await Promise.all([
    readFile(new URL("place-room-shell.css", sourceRoot), "utf8"),
    readFile(new URL("PlaceMixer.tsx", sourceRoot), "utf8"),
  ]);
  const camera = shellCss.match(
    /\.place-room-shell \.place-volume-row__camera\s*\{([^}]*)\}/,
  );
  const compactCamera = shellCss.match(
    /\.place-room-shell \.place-mixer\.has-audio-player \.place-volume-row__camera\s*\{([^}]*)\}/,
  );

  assert.ok(camera && compactCamera);
  assert.match(camera[1], /grid-area:\s*action/);
  assert.match(compactCamera[1], /width:\s*27px/);
  assert.match(compactCamera[1], /height:\s*27px/);
  assert.match(mixerSource, /Couper ma caméra/);
  assert.match(mixerSource, /Couper la caméra de/);
  assert.doesNotMatch(mixerSource, /place-volume-row__fx/);
});

test("les faders Big Tech restent contenus avec le mute et la caméra", async () => {
  const shellCss = await readFile(new URL("place-room-shell.css", sourceRoot), "utf8");
  const finalBigTech = shellCss.slice(shellCss.indexOf("/* Big Tech — faders de référence"));
  const volumeView = finalBigTech.match(/\.place-room-shell \.place-mixer\.has-audio-player > \.place-volume-view\s*\{([^}]*)\}/);
  const volumeList = finalBigTech.match(/\.place-room-shell \.place-mixer\.has-audio-player \.place-volume-list\s*\{([^}]*)\}/);
  const volumeRow = finalBigTech.match(/\.place-volume-list > \.place-volume-row\s*\{([^}]*)\}/);
  const masterDock = finalBigTech.match(/\.place-room-shell \.place-mixer\.has-audio-player \.place-master-dock\s*\{([^}]*)\}/);
  const masterSurface = finalBigTech.match(/\.place-room-shell \.place-studio-panel__surface:has\(> \.place-mixer\.has-audio-player > \.place-volume-view\)\s*\{([^}]*)\}/);
  const masterBackdrop = finalBigTech.match(/\.place-room-shell \.place-studio-panel__surface:has\(> \.place-mixer\.has-audio-player > \.place-volume-view\)::after\s*\{([^}]*)\}/);
  const masterRow = finalBigTech.match(/\.place-room-shell \.place-mixer\.has-audio-player \.place-master-dock \.place-volume-row\s*\{([^}]*)\}/);
  const faderTrack = finalBigTech.match(/\.place-room-shell \.place-mixer\.has-audio-player \.place-volume-row__fader::\-webkit-slider-runnable-track\s*\{([^}]*)\}/);
  const faderThumb = finalBigTech.match(/\.place-room-shell \.place-mixer\.has-audio-player \.place-volume-row__fader::\-webkit-slider-thumb\s*\{([^}]*)\}/);
  const compactActions = finalBigTech.match(
    /\.place-volume-row__mute,[\s\S]*?\.place-volume-row__camera\s*\{([^}]*)\}/,
  );

  assert.ok(volumeView && volumeList && volumeRow && masterDock && masterSurface && masterBackdrop && masterRow && faderTrack && faderThumb && compactActions);
  assert.match(volumeView[1], /grid-template-rows:\s*minmax\(0, 1fr\) 72px/);
  assert.match(volumeView[1], /align-content:\s*stretch/);
  assert.match(volumeView[1], /gap:\s*8px/);
  assert.match(volumeList[1], /grid-auto-rows:\s*50px/);
  assert.match(volumeList[1], /align-content:\s*space-between/);
  assert.match(volumeList[1], /gap:\s*4px/);
  assert.match(volumeList[1], /padding:\s*5px 6px 4px/);
  assert.match(volumeRow[1], /grid-template-columns:\s*31px minmax\(0, 1fr\) 47px 27px 27px/);
  assert.match(volumeRow[1], /max-height:\s*none/);
  assert.match(volumeRow[1], /padding:\s*4px 6px 0/);
  assert.match(masterDock[1], /height:\s*72px/);
  assert.match(masterDock[1], /justify-self:\s*stretch/);
  assert.match(masterDock[1], /width:\s*100%/);
  assert.match(masterDock[1], /max-width:\s*none/);
  assert.match(masterDock[1], /margin:\s*0/);
  assert.match(masterDock[1], /padding:\s*3px 6px 2px/);
  assert.match(masterDock[1], /border-top:\s*0/);
  assert.match(masterDock[1], /border-radius:\s*0/);
  assert.match(masterDock[1], /background:\s*transparent/);
  assert.match(masterDock[1], /box-shadow:\s*none/);
  assert.match(masterSurface[1], /position:\s*relative/);
  assert.match(masterBackdrop[1], /right:\s*0/);
  assert.match(masterBackdrop[1], /bottom:\s*0/);
  assert.match(masterBackdrop[1], /left:\s*0/);
  assert.match(masterBackdrop[1], /height:\s*72px/);
  assert.match(masterBackdrop[1], /rgba\(112, 72, 255, \.12\)/);
  assert.match(masterBackdrop[1], /rgba\(52, 106, 255, \.08\)/);
  assert.match(masterBackdrop[1], /#14112c 0%, #0b1024 100%/);
  assert.match(masterBackdrop[1], /pointer-events:\s*none/);
  assert.match(masterRow[1], /height:\s*54px/);
  assert.match(faderTrack[1], /#a05be6 0%, #9151fc 36%, #665cfd 68%, #3b91fe 100%/);
  assert.match(faderTrack[1], /var\(--gain-pct\) 100% no-repeat/);
  assert.match(faderTrack[1], /rgba\(244, 243, 248, \.84\)/);
  assert.match(faderThumb[1], /width:\s*15px/);
  assert.match(faderThumb[1], /height:\s*15px/);
  assert.match(faderThumb[1], /margin-top:\s*-5px/);
  assert.match(faderThumb[1], /border:\s*3px solid transparent/);
  assert.match(faderThumb[1], /linear-gradient\(#fff, #fff\) padding-box/);
  assert.match(faderThumb[1], /#a05be6 0%, #6b61fd 56%, #3b91fe 100%/);
  assert.match(compactActions[1], /width:\s*27px/);
  assert.match(compactActions[1], /height:\s*27px/);
  assert.match(compactActions[1], /border-radius:\s*50%/);
  assert.equal(5 * 50 + 4 * 4 + 5 + 4, 275);
});

test("les outils Big Tech reprennent la hiérarchie des références dans la colonne existante", async () => {
  const [shellCss, studioSource] = await Promise.all([
    readFile(new URL("place-room-shell.css", sourceRoot), "utf8"),
    readFile(new URL("PlaceStudioPanel.tsx", sourceRoot), "utf8"),
  ]);
  const finalTools = shellCss.slice(shellCss.indexOf("/* Big Tech — faders de référence"));
  const tools = finalTools.match(/\.place-room-shell \.place-tools-console\s*\{([^}]*)\}/);
  const toolTabs = finalTools.match(/\.place-room-shell \.place-tools-console__switch\s*\{([^}]*)\}/);
  const pollAction = finalTools.match(/data-active-tool="poll"\] \.place-tool-card__primary\s*\{([^}]*)\}/);

  assert.ok(tools && toolTabs && pollAction);
  assert.match(tools[1], /grid-template-rows:\s*20px 78px minmax\(0, 1fr\)/);
  assert.match(toolTabs[1], /grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(pollAction[1], /width:\s*100%/);
  assert.match(studioSource, /Partage d’écran[\s\S]*Sondage rapide[\s\S]*Mettre en avant[\s\S]*Cadeau/);
  assert.match(studioSource, /place-tool-poll__duration-summary/);
  assert.match(studioSource, /place-tool-highlight-live__actions/);
  assert.ok(studioSource.indexOf("place-tool-screen__preview") < studioSource.indexOf("place-tool-screen__settings"));
});

test("les quatre CTA des outils gardent une bordure stable dans tous leurs états", async () => {
  const shellCss = await readFile(new URL("place-room-shell.css", sourceRoot), "utf8");
  const legacyTools = shellCss.slice(
    shellCss.indexOf("/* Outils — quatre onglets ouverts"),
    shellCss.indexOf("/* Big Tech — faders de référence"),
  );
  const finalTools = shellCss.slice(shellCss.indexOf("/* Big Tech — outils de diffusion"));
  const button = finalTools.match(/\.place-room-shell \.place-tools-console__switch button\s*\{([^}]*)\}/);
  const hover = finalTools.match(/\.place-room-shell \.place-tools-console__switch button:hover\s*\{([^}]*)\}/);
  const active = finalTools.match(/\.place-room-shell \.place-tools-console__switch button\.is-active\s*\{([^}]*)\}/);
  const activeHover = finalTools.match(/\.place-room-shell \.place-tools-console__switch button\.is-active:hover\s*\{([^}]*)\}/);
  const focus = finalTools.match(/\.place-room-shell \.place-tools-console__switch button:focus-visible\s*\{([^}]*)\}/);

  assert.ok(button && hover && active && activeHover && focus);
  assert.match(button[1], /box-sizing:\s*border-box/);
  assert.match(button[1], /border:\s*1px solid/);
  assert.match(button[1], /transition:[^;]*border-color/);
  assert.match(hover[1], /border-color:\s*rgba\(var\(--place-tool-accent-rgb\)/);
  assert.match(active[1], /border-color:\s*rgba\(var\(--place-tool-accent-rgb\)/);
  assert.match(activeHover[1], /border-color:\s*rgba\(var\(--place-tool-accent-rgb\)/);
  assert.match(focus[1], /border-color:\s*rgba\(var\(--place-tool-accent-rgb\)/);
  assert.match(focus[1], /outline:\s*2px solid rgba\(var\(--place-tool-accent-rgb\)/);
  assert.doesNotMatch(`${legacyTools}\n${hover[1]}\n${active[1]}\n${activeHover[1]}`, /button(?:\.is-active|:hover)[^{]*\{[^}]*border:\s*0/);
});

test("le toggle audio du partage reste un switch violet exact de 34 par 20", async () => {
  const shellCss = await readFile(new URL("place-room-shell.css", sourceRoot), "utf8");
  const finalTools = shellCss.slice(shellCss.indexOf("/* Big Tech — outils de diffusion"));
  const toggle = finalTools.match(/\.place-room-shell \.place-tool-card__audio input\[type="checkbox"\]\s*\{([^}]*)\}/);
  const knob = finalTools.match(/\.place-room-shell \.place-tool-card__audio input\[type="checkbox"\]::after\s*\{([^}]*)\}/);
  const checked = finalTools.match(/\.place-room-shell \.place-tool-card__audio input\[type="checkbox"\]:checked\s*\{([^}]*)\}/);
  const checkedKnob = finalTools.match(/\.place-room-shell \.place-tool-card__audio input\[type="checkbox"\]:checked::after\s*\{([^}]*)\}/);
  const focus = finalTools.match(/\.place-room-shell \.place-tool-card__audio input\[type="checkbox"\]:focus-visible\s*\{([^}]*)\}/);
  const disabled = finalTools.match(/\.place-room-shell \.place-tool-card__audio input\[type="checkbox"\]:disabled\s*\{([^}]*)\}/);

  assert.ok(toggle && knob && checked && checkedKnob && focus && disabled);
  assert.match(finalTools, /\.place-room-shell \.place-tool-card input:not\(\[type="checkbox"\]\)/);
  assert.match(toggle[1], /appearance:\s*none/);
  assert.match(toggle[1], /width:\s*34px/);
  assert.match(toggle[1], /min-width:\s*34px/);
  assert.match(toggle[1], /max-width:\s*34px/);
  assert.match(toggle[1], /height:\s*20px/);
  assert.match(toggle[1], /min-height:\s*20px/);
  assert.match(toggle[1], /max-height:\s*20px/);
  assert.match(toggle[1], /border-radius:\s*999px/);
  assert.match(knob[1], /top:\s*2px/);
  assert.match(knob[1], /left:\s*2px/);
  assert.match(knob[1], /width:\s*14px/);
  assert.match(knob[1], /height:\s*14px/);
  assert.match(checked[1], /rgba\(var\(--place-tool-accent-rgb\)/);
  assert.match(checkedKnob[1], /transform:\s*translateX\(14px\)/);
  assert.match(focus[1], /outline:\s*2px solid rgba\(var\(--place-tool-accent-rgb\)/);
  assert.match(disabled[1], /cursor:\s*not-allowed/);
  assert.match(disabled[1], /opacity:\s*\.48/);
});

test("le partage d’écran reprend entièrement le violet du sondage", async () => {
  const shellCss = await readFile(new URL("place-room-shell.css", sourceRoot), "utf8");
  const finalTools = shellCss.slice(shellCss.indexOf("/* Big Tech — outils de diffusion"));
  const screenAccent = finalTools.match(/data-active-tool="screen"\]\s*\{([^}]*)\}/);
  const pollAccent = finalTools.match(/data-active-tool="poll"\]\s*\{([^}]*)\}/);
  const preview = finalTools.match(/\.place-room-shell \.place-tool-screen__preview\s*\{([^}]*)\}/);
  const previewIcon = finalTools.match(/\.place-room-shell \.place-tool-screen__preview > svg\s*\{([^}]*)\}/);
  const published = shellCss.match(/\.place-room-shell \.place-tool-screen__preview\.is-published\s*\{([^}]*)\}/);
  const previewMeta = shellCss.match(/\.place-room-shell \.place-tool-screen__preview-meta\s*\{([^}]*)\}/);
  const previewMetaLabel = shellCss.match(/\.place-room-shell \.place-tool-screen__preview-meta small\s*\{([^}]*)\}/);
  const share = finalTools.match(/data-active-tool="screen"\] \.place-tool-card__share:not\(\.is-active\)\s*\{([^}]*)\}/);
  const shareHover = finalTools.match(/data-active-tool="screen"\] \.place-tool-card__share:not\(\.is-active\):hover:not\(:disabled\)\s*\{([^}]*)\}/);

  assert.ok(screenAccent && pollAccent && preview && previewIcon && published && previewMeta && previewMetaLabel && share && shareHover);
  assert.match(screenAccent[1], /--place-tool-accent:\s*#a66bff/);
  assert.match(screenAccent[1], /--place-tool-accent-rgb:\s*166, 107, 255/);
  assert.match(pollAccent[1], /--place-tool-accent:\s*#a66bff/);
  assert.match(preview[1], /rgba\(var\(--place-tool-accent-rgb\)/);
  assert.match(previewIcon[1], /color:\s*var\(--place-tool-accent\)/);
  assert.match(published[1], /rgba\(var\(--place-tool-accent-rgb\)/);
  assert.match(previewMeta[1], /rgba\(var\(--place-tool-accent-rgb\)/);
  assert.match(previewMetaLabel[1], /color:\s*var\(--place-tool-accent\)/);
  assert.match(share[1], /background:\s*linear-gradient\(135deg, #7950e6, #4f2caf\)/);
  assert.match(shareHover[1], /background:\s*linear-gradient\(135deg, #8b62ed, #5c36c0\)/);

  const screenVisuals = [preview[1], previewIcon[1], published[1], previewMeta[1], previewMetaLabel[1], share[1], shareHover[1]].join("\n");
  assert.doesNotMatch(screenVisuals, /#(?:35d8a0|4ce4ad)|rgba\((?:47,\s*230,\s*166|52,\s*207,\s*153|53,\s*216,\s*160|35,\s*164,\s*119)/i);
});

test("le chronomètre actif garde un cadre fixe sans le mot TIME", async () => {
  const shellCss = await readFile(new URL("place-room-shell.css", sourceRoot), "utf8");
  const shellHeaderSource = await readFile(new URL("PlaceRoomShellHeader.tsx", sourceRoot), "utf8");
  const finalBigTech = shellCss.slice(shellCss.indexOf("/* Big Tech — faders de référence"));
  const countdownSlot = finalBigTech.match(/\.place-room-shellbar__broadcast-cluster\s*\{([^}]*)\}/);
  const countdown = finalBigTech.match(/\.place-room-shellbar__countdown\s*\{([^}]*)\}/);
  const countdownValue = finalBigTech.match(/\.place-room-shellbar__countdown strong\s*\{([^}]*)\}/);
  const compactBreakpoint = finalBigTech.slice(finalBigTech.lastIndexOf("@media (max-width: 1120px) and (min-width: 901px)"));

  assert.ok(countdownSlot && countdown && countdownValue);
  assert.match(countdownSlot[1], /width:\s*154px/);
  assert.match(countdownSlot[1], /min-width:\s*154px/);
  assert.match(countdownSlot[1], /height:\s*50px/);
  assert.match(countdown[1], /width:\s*154px/);
  assert.match(countdown[1], /min-width:\s*154px/);
  assert.match(countdown[1], /max-width:\s*154px/);
  assert.match(countdown[1], /flex:\s*0 0 154px/);
  assert.match(countdownValue[1], /font-variant-numeric:\s*tabular-nums/);
  assert.match(compactBreakpoint, /\.place-room-shellbar__broadcast-cluster\s*\{[\s\S]*?width:\s*154px;[\s\S]*?min-width:\s*154px;[\s\S]*?max-width:\s*154px;/);
  assert.match(compactBreakpoint, /\.place-room-shellbar__countdown\s*\{[\s\S]*?width:\s*154px;[\s\S]*?min-width:\s*154px;[\s\S]*?max-width:\s*154px;[\s\S]*?flex:\s*0 0 154px;/);
  assert.match(shellHeaderSource, /data-countdown-active=\{countdown\.enabled \? "true" : "false"\}/);
  assert.doesNotMatch(shellHeaderSource, /<small>TIME<\/small>/);
});

test("tous les états interactifs du lecteur restent violets ou bleus", async () => {
  const shellCss = await readFile(new URL("place-room-shell.css", sourceRoot), "utf8");
  const finalInteractions = shellCss.slice(shellCss.indexOf("/* Lecteur — couche finale de tous les états interactifs"));
  const genericHover = finalInteractions.match(
    /\.place-room-shell \.place-mixer-audio button:hover:not\(:disabled\)\s*\{([^}]*)\}/,
  );
  const genericActive = finalInteractions.match(
    /\.place-room-shell \.place-mixer-audio button:active:not\(:disabled\)\s*\{([^}]*)\}/,
  );
  const focus = finalInteractions.match(
    /\.place-room-shell \.place-mixer-audio button:focus-visible,[\s\S]*?input:focus-visible\)\s*\{([^}]*)\}/,
  );
  const waveformFocus = finalInteractions.match(
    /\.place-room-shell \.place-mixer-audio__waveform:has\(input:focus-visible\)\s*\{([^}]*)\}/,
  );
  const playHover = finalInteractions.match(
    /\.place-room-shell \.place-mixer-audio__play:hover:not\(:disabled\),[\s\S]*?\.place-mixer-audio__play:hover:not\(:disabled\)\s*\{([^}]*)\}/,
  );

  assert.ok(genericHover && genericActive && focus && waveformFocus && playHover);
  assert.match(genericHover[1], /139, 111, 255/);
  assert.match(genericHover[1], /116, 91, 232/);
  assert.match(genericActive[1], /117, 106, 255/);
  assert.match(focus[1], /128, 105, 255/);
  assert.match(waveformFocus[1], /92, 120, 255/);
  assert.match(playHover[1], /#8969ec/);
  assert.match(playHover[1], /#34248a/);
  assert.doesNotMatch(
    finalInteractions,
    /#ffe17e|#e3a632|#ffe08a|#ffd26c|#ffc95e|#f0bc4f|#f2c361|#f6cf68|#c58a27|#d99b31|yellow/i,
  );
});

test("le bandeau Studio centre ses onglets et le bloc épinglé reste dans le même rail", async () => {
  const [shellCss, premiumCss] = await Promise.all([
    readFile(new URL("place-room-shell.css", sourceRoot), "utf8"),
    readFile(new URL("place-room-premium.css", sourceRoot), "utf8"),
  ]);
  const stableStudio = shellCss.slice(shellCss.lastIndexOf("STUDIO / GÉOMÉTRIE STABLE"));
  const bar = stableStudio.match(/\.place-studio-panel__bar\s*\{([^}]*)\}/);
  const tabs = stableStudio.match(/\.place-studio-panel__tabs\s*\{([^}]*)\}/);
  const pinned = premiumCss.slice(premiumCss.lastIndexOf(".place-chat__pinned {")).match(/\.place-chat__pinned\s*\{([^}]*)\}/);

  assert.ok(bar && tabs && pinned);
  assert.match(bar[1], /height:\s*60px/);
  assert.match(bar[1], /align-items:\s*center/);
  assert.match(tabs[1], /height:\s*44px/);
  assert.match(tabs[1], /min-height:\s*44px/);
  assert.match(tabs[1], /align-self:\s*center/);
  assert.match(pinned[1], /width:\s*auto/);
  assert.match(pinned[1], /margin:\s*7px 4px 6px/);
});
