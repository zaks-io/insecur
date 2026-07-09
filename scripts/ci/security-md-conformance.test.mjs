import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  checkSecurityMdConformance,
  INVENTORY_DOC_PATH,
  orgGroupSlugs,
  routeCoveredBy,
  SECURITY_MD_PATH,
} from "./security-md-conformance-lib.mjs";

function inventoryDoc({ apiRoutes, siteRoutes, webRoutes, runtimeRoutes }) {
  const table = (routes) =>
    ["| Method | Mount prefix |", "| --- | --- |", ...routes.map((r) => `| GET | \`${r}\` |`)].join(
      "\n",
    );
  return [
    "## API Worker — `apps/api` (`insecur-api`)",
    table(apiRoutes),
    "## Web Worker — `apps/web` (`insecur-web`)",
    table(webRoutes),
    "## Public Site Worker — `apps/site` (`insecur-site`)",
    table(siteRoutes),
    "## Runtime Worker — `apps/runtime` (`insecur-runtime`)",
    table(runtimeRoutes),
  ].join("\n\n");
}

function securityMd({ siteCell, webCell, apiCell, runtimeCell, orgGroupsSentence }) {
  return [
    "| Surface | Production endpoint | Preview endpoint | Public route groups |",
    "| --- | --- | --- | --- |",
    `| Public Site | x | x | ${siteCell} |`,
    `| Web Console BFF | x | x | ${webCell} |`,
    `| API | x | x | ${apiCell} |`,
    `| Runtime | None | None | ${runtimeCell} |`,
    "",
    orgGroupsSentence,
  ].join("\n");
}

const CONFORMING = {
  securityMd: securityMd({
    siteCell: "`GET /`, `GET /docs/*` (HTML plus `.md` twins), `GET /healthz`",
    webCell: "`GET /healthz`, `GET /auth/*`",
    apiCell: "`GET /healthz`, `/v1/session`, `/v1/orgs/:organizationId/*`",
    runtimeCell: "No public routes. Direct fetches return `404`.",
    orgGroupsSentence:
      "Current organization-qualified API groups under `/v1/orgs/:organizationId/*` include members and projects.",
  }),
  inventoryDoc: inventoryDoc({
    apiRoutes: [
      "/healthz",
      "/v1/session",
      "/v1/orgs/:organizationId/members",
      "/v1/orgs/:organizationId/projects",
    ],
    siteRoutes: ["/", "/docs/", "/docs/$", "/healthz"],
    webRoutes: ["/healthz", "/auth/callback", "/auth/step-up"],
    runtimeRoutes: ["404"],
  }),
};

test("routeCoveredBy handles exact and glob patterns", () => {
  assert.equal(routeCoveredBy("/healthz", ["/healthz"]), true);
  assert.equal(routeCoveredBy("/docs/$", ["/docs/*"]), true);
  assert.equal(routeCoveredBy("/docs/", ["/docs/*"]), true);
  assert.equal(routeCoveredBy("/docs", ["/docs/*"]), true);
  assert.equal(routeCoveredBy("/documents", ["/docs/*"]), false);
  assert.equal(routeCoveredBy("/v1/auth", ["/v1/session"]), false);
});

test("orgGroupSlugs extracts the first path segment under the org prefix", () => {
  assert.deepEqual(
    orgGroupSlugs([
      "/healthz",
      "/v1/orgs/:organizationId/members",
      "/v1/orgs/:organizationId/projects",
      "/v1/orgs/:organizationId/projects/:projectId/secrets",
    ]),
    new Set(["members", "projects"]),
  );
});

test("a conforming SECURITY.md produces no problems", () => {
  assert.deepEqual(checkSecurityMdConformance(CONFORMING), []);
});

test("an inventory route missing from SECURITY.md is a problem", () => {
  const problems = checkSecurityMdConformance({
    ...CONFORMING,
    securityMd: CONFORMING.securityMd.replace("`GET /docs/*` (HTML plus `.md` twins), ", ""),
  });
  assert.ok(
    problems.some((p) => p.includes("`/docs/`")),
    problems.join("\n"),
  );
});

test("a SECURITY.md pattern matching no inventory route is a problem", () => {
  const problems = checkSecurityMdConformance({
    ...CONFORMING,
    securityMd: CONFORMING.securityMd.replace("`GET /`, ", "`GET /`, `GET /install.sh`, "),
  });
  assert.ok(
    problems.some((p) => p.includes("`/install.sh`")),
    problems.join("\n"),
  );
});

test("org-group drift is caught in both directions", () => {
  const missing = checkSecurityMdConformance({
    ...CONFORMING,
    securityMd: CONFORMING.securityMd.replace("members and projects", "projects"),
  });
  assert.ok(
    missing.some((p) => p.includes("missing `members`")),
    missing.join("\n"),
  );

  const stale = checkSecurityMdConformance({
    ...CONFORMING,
    securityMd: CONFORMING.securityMd.replace(
      "members and projects",
      "connections, members, and projects",
    ),
  });
  assert.ok(
    stale.some((p) => p.includes("lists `connections`")),
    stale.join("\n"),
  );
});

test("a runtime deploy with public routes is a problem", () => {
  const problems = checkSecurityMdConformance({
    ...CONFORMING,
    inventoryDoc: CONFORMING.inventoryDoc.replace("| GET | `404` |", "| GET | `/v1/leak` |"),
  });
  assert.ok(
    problems.some((p) => p.includes("insecur-runtime")),
    problems.join("\n"),
  );
});

test("the checked-in SECURITY.md conforms to the checked-in inventory", () => {
  const problems = checkSecurityMdConformance({
    securityMd: readFileSync(SECURITY_MD_PATH, "utf8"),
    inventoryDoc: readFileSync(INVENTORY_DOC_PATH, "utf8"),
  });
  assert.deepEqual(problems, []);
});
