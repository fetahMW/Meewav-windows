import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appPath = "src/App.tsx";
const routePolicyPath = "src/features/auth/authRefreshRoutePolicy.ts";

test("auth work starts on authentication and a globe refresh returns there", async () => {
  const [app, routePolicy] = await Promise.all([
    readFile(appPath, "utf8"),
    readFile(routePolicyPath, "utf8"),
  ]);

  assert.match(app, /path="\/" element=\{<Navigate to="\/auth" replace \/>\}/u);
  assert.match(app, /path=\{MON_GLOBE_ROUTE\} element=\{<AuthenticatedGlobeTestRoute \/>\}/u);
  assert.match(app, /const routeNavigationType = useNavigationType\(\)/u);
  assert.match(app, /DOCUMENT_STARTED_ON_GLOBE[\s\S]*?window\.location\.pathname/u);
  assert.match(app, /DOCUMENT_STARTED_ON_GLOBE[\s\S]*?routeNavigationType === "POP"/u);
  assert.match(app, /routeNavigationType === "POP"[\s\S]*?shouldReturnToAuthenticationOnGlobeLoad\(navigationType\)/u);
  assert.match(app, /shouldReturnToAuthenticationOnGlobeLoad\(navigationType\)/u);
  assert.match(app, /initialDestination=\{getMonGlobeInitialDestination\(location\.state\)\}/u);
  assert.match(routePolicy, /getEntriesByType\(\s*"navigation"/u);
  assert.match(routePolicy, /return navigationType === "reload"/u);
});
