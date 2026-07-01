import { readFileSync } from "node:fs";
import path from "node:path";

import {
  assertDependencyCruiserRules,
  graphPathPattern,
  REPO_ROOT,
} from "./dependency-cruiser-graph.mjs";
import { readWorkspacePackages } from "./package-boundary-conformance-lib.mjs";

const CI_WORKFLOW_PATH = path.join(REPO_ROOT, ".github", "workflows", "ci.yml");
const SITE_WRANGLER_PATH = path.join(REPO_ROOT, "apps", "site", "wrangler.jsonc");

export const SITE_PACKAGE = "@insecur/site";
export const UI_PACKAGE = "@insecur/ui";
export const SITE_WORKER_NAME = "insecur-site";
export const SITE_PREVIEW_WORKER_NAME = "insecur-site-preview";

// Bindings that hand a Worker control-plane capability. The Public Site (ADR-0078 / product-spec §2)
// must declare none: no database (Hyperdrive), no keyring, no API/Runtime Service Binding, no
// secrets. The deploy-topology gate already forbids the root-key binding on a public deploy; this
// gate covers the rest so the site's wrangler config can never grow one unnoticed.
const FORBIDDEN_SITE_BINDINGS = ["hyperdrive", "services", "secrets_store_secrets", "secrets"];

// Minimal JSONC reader: strips // line comments and trailing commas. Sufficient for wrangler configs
// (no block comments; no string literals containing `//`).
function parseSiteWrangler() {
  const raw = readFileSync(SITE_WRANGLER_PATH, "utf8");
  const withoutComments = raw
    .split("\n")
    .map((line) => stripJsoncLineComment(line))
    .join("\n");
  return JSON.parse(withoutComments.replace(/,(\s*[}\]])/g, "$1"));
}

function stripJsoncLineComment(line) {
  let inString = false;
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === '"' && line[i - 1] !== "\\") {
      inString = !inString;
    }
    if (!inString && line[i] === "/" && line[i + 1] === "/") {
      return line.slice(0, i);
    }
  }
  return line;
}

// ADR-0078 deploy-shape invariant enforced independently of any deploy run: the Public Site's
// wrangler config names the expected workers and declares zero control-plane bindings in every
// environment scope.
export function assertSiteWranglerConfig() {
  const config = parseSiteWrangler();
  if (config.name !== SITE_WORKER_NAME) {
    throw new Error(
      `apps/site/wrangler.jsonc top-level name must be '${SITE_WORKER_NAME}' (ADR-0078).`,
    );
  }
  if (config.env?.preview?.name !== SITE_PREVIEW_WORKER_NAME) {
    throw new Error(
      `apps/site/wrangler.jsonc env.preview.name must be '${SITE_PREVIEW_WORKER_NAME}' (ADR-0078).`,
    );
  }
  for (const scope of [config, config.env?.preview]) {
    if (!scope) {
      continue;
    }
    const declared = FORBIDDEN_SITE_BINDINGS.filter((binding) => binding in scope);
    if (declared.length > 0) {
      throw new Error(
        `apps/site/wrangler.jsonc declares forbidden control-plane binding(s): ${declared.join(", ")} (ADR-0078).`,
      );
    }
  }
}

const ANY_WORKSPACE_MODULE = "(^|/)insecur__[^/]+\\.mjs$";

// ADR-0078 public-site import boundary. Production source in @insecur/site may import only
// @insecur/ui from the workspace; production source in @insecur/ui may import no @insecur/* package.
// Everything on either side of that fence is a forbidden dependency-cruiser edge.
function siteBoundaryForbiddenRules() {
  return [
    {
      name: "site-imports-only-ui",
      comment: `${SITE_PACKAGE} production source may import only ${UI_PACKAGE} from the @insecur/* workspace (ADR-0078).`,
      severity: "error",
      from: { path: graphPathPattern(SITE_PACKAGE) },
      to: {
        path: ANY_WORKSPACE_MODULE,
        pathNot: [graphPathPattern(SITE_PACKAGE), graphPathPattern(UI_PACKAGE)],
      },
    },
    {
      name: "ui-imports-no-workspace",
      comment: `${UI_PACKAGE} production source may import no @insecur/* package (ADR-0078). It is presentational and content-free.`,
      severity: "error",
      from: { path: graphPathPattern(UI_PACKAGE) },
      to: { path: ANY_WORKSPACE_MODULE, pathNot: [graphPathPattern(UI_PACKAGE)] },
    },
  ];
}

export function assertBoundaryPackagesExist(packages) {
  const missing = [SITE_PACKAGE, UI_PACKAGE].filter((name) => !packages.has(name));
  if (missing.length > 0) {
    throw new Error(`Public-site boundary conformance could not find: ${missing.join(", ")}`);
  }
}

export async function assertSiteBoundaryConformance(packages) {
  assertBoundaryPackagesExist(packages);
  await assertDependencyCruiserRules(
    packages,
    siteBoundaryForbiddenRules(),
    "insecur-site-boundary-",
  );
}

/** Baseline graph carrying only the two boundary packages and no cross edges. */
function createBaselineBoundaryPackages() {
  const packages = new Map();
  for (const packageName of [SITE_PACKAGE, UI_PACKAGE]) {
    packages.set(packageName, {
      packageDir: path.join(REPO_ROOT, "packages", "boundary-probe"),
      dependencies: [],
      sourceImports: [],
    });
  }
  return packages;
}

// Prove the gate fails closed: a @insecur/site -> @insecur/tenant-store edge and a
// @insecur/ui -> @insecur/domain edge must both be rejected.
async function assertSiteBoundaryNegativeProbe() {
  const violating = createBaselineBoundaryPackages();
  violating.set("@insecur/tenant-store", {
    packageDir: path.join(REPO_ROOT, "packages", "boundary-probe"),
    dependencies: [],
    sourceImports: [],
  });
  violating.set("@insecur/domain", {
    packageDir: path.join(REPO_ROOT, "packages", "boundary-probe"),
    dependencies: [],
    sourceImports: [],
  });
  violating.get(SITE_PACKAGE).sourceImports = ["@insecur/tenant-store"];
  violating.get(UI_PACKAGE).sourceImports = ["@insecur/domain"];

  let rejected = false;
  try {
    await assertSiteBoundaryConformance(violating);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/site-imports-only-ui/.test(message) && /ui-imports-no-workspace/.test(message)) {
      rejected = true;
    } else {
      throw error;
    }
  }

  if (!rejected) {
    throw new Error(
      "Public-site boundary negative probe: forbidden site->tenant-store and ui->domain edges must fail closed",
    );
  }
}

export function assertHostedCiVerifyRunsSiteBoundaryConformance() {
  const workflow = readFileSync(CI_WORKFLOW_PATH, "utf8");
  const verifyJobMatch = workflow.match(
    /^\s+verify:\s*\n[\s\S]*?^\s+run:\s*\|\s*\n((?:\s{10}.*\n)+)/m,
  );
  if (!verifyJobMatch) {
    throw new Error(
      "site-boundary conformance: could not locate CI Verify job run block in .github/workflows/ci.yml",
    );
  }
  if (!/\bpnpm\s+conformance:site-boundary\b/.test(verifyJobMatch[1])) {
    throw new Error(
      "site-boundary conformance: hosted CI Verify must run `pnpm conformance:site-boundary`",
    );
  }
}

export async function runSiteBoundaryConformance() {
  assertHostedCiVerifyRunsSiteBoundaryConformance();
  assertSiteWranglerConfig();
  await assertSiteBoundaryNegativeProbe();
  const packages = await readWorkspacePackages();
  await assertSiteBoundaryConformance(packages);
  console.log("Public-site boundary conformance passed with dependency-cruiser.");
}
