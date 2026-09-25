import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceRoot = new URL("../../src/", import.meta.url);

async function readSource(relativePath) {
  return readFile(new URL(relativePath, sourceRoot), "utf8");
}

test("le Profil reprend le chrome Tremplin et l’identité globale partagée", async () => {
  const [page, css, brandStyles] = await Promise.all([
    readSource("features/profile/ProfilePage.tsx"),
    readSource("features/profile/profile.css"),
    readSource("components/navigation/meewav-pillar-brand.css"),
  ]);

  assert.match(page, /import MeewavPillarBrand from ["']\.\.\/\.\.\/components\/navigation\/MeewavPillarBrand["']/);
  assert.match(page, /<span className="profile-command-brand"><MeewavPillarBrand pillar="Profil"\s*\/><\/span>/);
  assert.match(page, /<aside className="profile-primary-rail">[\s\S]*?<MeewavPrimaryNav/);
  assert.match(css, /--profile-chrome-height:\s*clamp\(62px,\s*6\.2vh,\s*68px\)/);
  assert.match(css, /--profile-primary-rail-width:\s*clamp\(68px,\s*4vw,\s*80px\)/);
  assert.match(css, /\.profile-primary-rail\s*\{[\s\S]*?linear-gradient\(135deg,\s*rgba\(139,\s*92,\s*246,\s*0\.82\),\s*rgba\(92,\s*83,\s*187,\s*0\.82\)\)/);
  assert.match(css, /\.profile-primary-rail\s*>\s*\.meewav-primary-nav\s*\{[\s\S]*?background:\s*transparent/);
  assert.match(css, /\.profile-primary-rail\s*>\s*\.meewav-primary-nav\s*\{[\s\S]*?border:\s*0/);
  assert.match(css, /\.profile-command-bar\s*\{[\s\S]*?linear-gradient\(102deg,\s*rgba\(7,\s*7,\s*14,\s*0\.96\)/);
  assert.match(css, /\.profile-command-bar\s*\{[\s\S]*?0 9px 28px rgba\(103,\s*63,\s*190,\s*0\.11\)/);
  assert.match(css, /\.profile-command-brand\s*\{[\s\S]*?display:\s*flex[\s\S]*?grid-column:\s*1/);
  assert.match(brandStyles, /\.meewav-pillar-brand__app\s*\{[^}]*color:\s*#a98fff;[^}]*font-size:\s*10px;/s);
  assert.match(brandStyles, /\.meewav-pillar-brand__pillar\s*\{[^}]*color:\s*#f4f1fb;[^}]*font-size:\s*18px;/s);
  assert.match(css, /\.profile-command-brand \.meewav-pillar-brand__pillar\s*\{[^}]*font-size:\s*22px;[^}]*font-weight:\s*780;[^}]*letter-spacing:\s*-0\.04em;/s);
  assert.match(css, /@media\s*\(max-width:\s*760px\)\s*\{[\s\S]*?--profile-chrome-height:\s*58px[\s\S]*?\.profile-primary-rail\s*\{[\s\S]*?width:\s*100%[\s\S]*?height:\s*var\(--profile-mobile-rail-height\)/);
  assert.doesNotMatch(css, /\.profile-command-brand\s*\{[^}]*display:\s*none/);
});

test("Profil, Market, Messagerie et Rooms reprennent exactement la typographie du Tremplin", async () => {
  const [tremplin, tremplinTypography, market, profile, messaging, rooms, brandStyles] = await Promise.all([
    readSource("features/tremplin/tremplin-shell.css"),
    readSource("features/tremplin/tremplin-page.css"),
    readSource("features/market/market-double-band.css"),
    readSource("features/profile/profile.css"),
    readSource("features/messaging/messaging-page.css"),
    readSource("features/rooms/rooms-page.css"),
    readSource("components/navigation/meewav-pillar-brand.css"),
  ]);

  for (const [name, css, variable] of [
    ["Tremplin", tremplin, "--tremplin-pillar-title-inset"],
    ["Market", market, "--market-pillar-title-inset"],
    ["Profil", profile, "--profile-pillar-title-inset"],
    ["Messagerie", messaging, "--messaging-pillar-title-inset"],
  ]) {
    assert.match(css, new RegExp(`${variable}:\\s*clamp\\(18px,\\s*1\\.5vw,\\s*28px\\)`), `${name} doit utiliser le même retrait`);
  }

  assert.match(brandStyles, /\.meewav-pillar-brand__app\s*\{[^}]*font-size:\s*10px;[^}]*letter-spacing:\s*0\.18em;/s);
  assert.match(brandStyles, /\.meewav-pillar-brand__pillar\s*\{[^}]*font-size:\s*18px;[^}]*letter-spacing:\s*-0\.025em;/s);
  assert.match(tremplinTypography, /\.tremplin-brand__copy strong\s*\{[^}]*font-size:\s*22px;[^}]*font-weight:\s*780;[^}]*letter-spacing:\s*-0\.04em;/s);
  for (const [name, css] of [
    ["Market", market],
    ["Profil", profile],
    ["Messagerie", messaging],
    ["Rooms", rooms],
  ]) {
    assert.match(css, /meewav-pillar-brand__pillar[\s\S]*?\{[^}]*font-size:\s*22px;[^}]*font-weight:\s*780;[^}]*letter-spacing:\s*-0\.04em;/s, `${name} doit reprendre la taille du Tremplin`);
  }
});
