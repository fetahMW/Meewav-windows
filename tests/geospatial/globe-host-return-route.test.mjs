import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appPath = "src/App.tsx";
const messagingPath = "src/features/messaging/MessagingPage.tsx";
const profilePath = "src/features/profile/ProfilePage.tsx";
const marketPath = "src/features/market/MarketPage.tsx";
const monGlobePath = "src/features/globe/MonGlobe.tsx";
const globePath = "src/features/globe/components/GlobeMapV2.tsx";
const globeCssPath = "src/features/globe/styles/globe-v2.css";
const profileCssPath = "src/features/profile/profile.css";
const authCssPath = "src/styles/auth.css";

test("profile, messaging and Market return to the authenticated host position", async () => {
  const [app, messaging, profile, market, monGlobe, globe] = await Promise.all([
    readFile(appPath, "utf8"),
    readFile(messagingPath, "utf8"),
    readFile(profilePath, "utf8"),
    readFile(marketPath, "utf8"),
    readFile(monGlobePath, "utf8"),
    readFile(globePath, "utf8"),
  ]);

  assert.match(
    messaging,
    /activeDestination="messages"[\s\S]*?onGlobe=\{\(\) => navigate\(MON_GLOBE_ROUTE, \{[\s\S]*?state: MON_GLOBE_HOST_POSITION_NAVIGATION_STATE/u,
  );
  assert.match(app, /path="\/messages"[\s\S]*?element=\{<MessagingRoute \/>\}/u);
  assert.match(
    profile,
    /activeDestination="profile"[\s\S]*?onGlobe=\{\(\) => navigate\(MON_GLOBE_ROUTE, \{[\s\S]*?state: MON_GLOBE_HOST_POSITION_NAVIGATION_STATE/u,
  );
  assert.match(monGlobe, /initialDestination=\{initialDestination\}/u);
  assert.match(
    market,
    /activeDestination="market"[\s\S]*?onGlobe=\{\(\) => navigate\(MON_GLOBE_ROUTE, \{[\s\S]*?state: MON_GLOBE_HOST_POSITION_NAVIGATION_STATE/u,
  );
  assert.match(app, /path="\/market\/\*"[\s\S]*?element=\{<MarketRoute \/>\}/u);

  const loadStart = globe.indexOf("const handleMapLoad = () => {");
  const loadEnd = globe.indexOf("const handleMoveEnd = () => {", loadStart);
  const loadBlock = globe.slice(loadStart, loadEnd);
  const hostReturn = loadBlock.indexOf('initialDestination === "host-position"');
  const hostAction = loadBlock.indexOf("goToHostPosition();", hostReturn);
  const normalStartup = loadBlock.indexOf("startAtHostPosition();", hostReturn);

  assert.ok(hostReturn >= 0, "the route destination must be handled after map load");
  assert.ok(hostAction > hostReturn, "the existing host-position action must be reused");
  assert.ok(normalStartup > hostAction, "host return must bypass the standard startup route");
});

test("the Globe navigation stays clickable above avatar popups", async () => {
  const [globe, globeCss] = await Promise.all([
    readFile(globePath, "utf8"),
    readFile(globeCssPath, "utf8"),
  ]);

  assert.match(
    globe,
    /\n\s*<\/div>\s*\n\s*<MeewavPrimaryNav\s*[\s\S]*?activeView=\{activeMapView\}/u,
    "the global navigation must be a sibling of the low-z map UI root",
  );
  assert.match(
    globeCss,
    /\.globe-v2-page\.is-startup-handoff-active\s*>\s*\.meewav-primary-nav/u,
    "moving the navigation must not reveal it above the startup splash",
  );
});

test("profile starts at the top and reclaims wheel scrolling after the fixed Globe", async () => {
  const [profile, profileCss, authCss] = await Promise.all([
    readFile(profilePath, "utf8"),
    readFile(profileCssPath, "utf8"),
    readFile(authCssPath, "utf8"),
  ]);

  assert.match(profile, /useLayoutEffect\(\(\) => \{[\s\S]*?document\.documentElement\.scrollTop = 0;[\s\S]*?document\.body\.scrollTop = 0;[\s\S]*?window\.scrollTo\(\{ top: 0, left: 0, behavior: "auto" \}\);[\s\S]*?\}, \[location\.key\]\);/u);
  assert.match(profileCss, /html:has\(\.profile-page\),\s*body:has\(\.profile-page\)\s*\{[\s\S]*?overflow-y:\s*auto\s*;/u);
  assert.match(authCss, /html:has\(\.auth-page\),\s*body:has\(\.auth-page\)\s*\{[\s\S]*?overflow:\s*hidden\s*!important\s*;/u);
  assert.doesNotMatch(authCss, /@media\s*\(min-width:\s*992px\)\s*\{\s*html\s*,\s*body\s*\{/u);
});
