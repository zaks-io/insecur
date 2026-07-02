import { readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import {
  assertDependencyCruiserRules,
  graphModuleFileName,
  graphPathPattern,
  REPO_ROOT,
} from "./dependency-cruiser-graph.mjs";

export { graphModuleFileName, REPO_ROOT };

const CI_WORKFLOW_PATH = path.join(REPO_ROOT, ".github", "workflows", "ci.yml");
export const WORKSPACE_DIRS = ["apps", "packages"];
export const CRYPTO_PACKAGE = "@insecur/crypto";
export const DEEP_CRYPTO_IMPORT_FIXTURE = path.join(
  REPO_ROOT,
  "scripts/lint-fixtures/package-boundary-deep-crypto-import.fixture.ts",
);
export const SOURCE_FILE_PATTERN = /\.[cm]?tsx?$/;
export const TEST_FILE_PATTERN = /\.(test|spec)\.[cm]?tsx?$/;
export const STATIC_WORKSPACE_IMPORT_PATTERN =
  /\b(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["'](@insecur\/[^"']+)["']/g;
export const DYNAMIC_WORKSPACE_IMPORT_PATTERN = /\bimport\s*\(\s*["'](@insecur\/[^"']+)["']\s*\)/g;

export const CRYPTO_FORBIDDEN_PRODUCTION_STARTS = [
  "@insecur/api",
  "@insecur/worker-kit",
  "@insecur/tenant-store",
  "@insecur/runtime-injection-issue",
  "@insecur/secret-store-contracts",
  "@insecur/custody-contracts",
];

export function normalizeWorkspacePackageName(specifier) {
  if (!specifier.startsWith("@insecur/")) {
    return specifier;
  }
  const match = specifier.match(/^(@insecur\/[^/]+)/);
  return match?.[1] ?? specifier;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function findWorkspacePackageJsonPaths() {
  const packageJsonPaths = [];
  for (const workspaceDir of WORKSPACE_DIRS) {
    const absoluteWorkspaceDir = path.join(REPO_ROOT, workspaceDir);
    const entries = await readdir(absoluteWorkspaceDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        packageJsonPaths.push(path.join(absoluteWorkspaceDir, entry.name, "package.json"));
      }
    }
  }
  return packageJsonPaths;
}

async function collectProductionSourceFiles(sourceDir) {
  let entries;
  try {
    entries = await readdir(sourceDir, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(sourceDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectProductionSourceFiles(entryPath)));
      continue;
    }
    if (SOURCE_FILE_PATTERN.test(entry.name) && !TEST_FILE_PATTERN.test(entry.name)) {
      files.push(entryPath);
    }
  }
  return files;
}

export function collectWorkspaceImportSpecifiers(source) {
  const specifiers = new Set();
  for (const pattern of [STATIC_WORKSPACE_IMPORT_PATTERN, DYNAMIC_WORKSPACE_IMPORT_PATTERN]) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const specifier = match[1];
      if (specifier) {
        specifiers.add(normalizeWorkspacePackageName(specifier));
      }
    }
  }
  return specifiers;
}

async function findSourceWorkspaceDependencies(packageDir) {
  const dependencies = new Set();
  for (const sourceFile of await collectProductionSourceFiles(path.join(packageDir, "src"))) {
    const source = await readFile(sourceFile, "utf8");
    for (const specifier of collectWorkspaceImportSpecifiers(source)) {
      dependencies.add(specifier);
    }
  }
  return [...dependencies].sort();
}

export async function readWorkspacePackages() {
  const packages = new Map();
  for (const packageJsonPath of await findWorkspacePackageJsonPaths()) {
    const packageJson = await readJson(packageJsonPath);
    packages.set(packageJson.name, {
      packageDir: path.dirname(packageJsonPath),
      dependencies: Object.keys(packageJson.dependencies ?? {}).filter((name) =>
        name.startsWith("@insecur/"),
      ),
      sourceImports: [],
    });
  }

  for (const [packageName, packageInfo] of packages) {
    packageInfo.sourceImports = (await findSourceWorkspaceDependencies(packageInfo.packageDir))
      .filter((dependencyName) => dependencyName !== packageName)
      .filter((dependencyName) => packages.has(dependencyName));
  }

  return packages;
}

export function assertBoundaryPackagesExist(packages) {
  const requiredPackages = new Set([CRYPTO_PACKAGE, ...CRYPTO_FORBIDDEN_PRODUCTION_STARTS]);
  const missingPackages = [...requiredPackages].filter((name) => !packages.has(name));
  if (missingPackages.length > 0) {
    throw new Error(`Package boundary conformance could not find: ${missingPackages.join(", ")}`);
  }
}

function cryptoForbiddenRules() {
  return CRYPTO_FORBIDDEN_PRODUCTION_STARTS.map((start) => ({
    name: `no-prod-crypto-from-${start.replace(/^@/, "").replaceAll("/", "-")}`,
    comment: `${start} must not have a production dependency path to ${CRYPTO_PACKAGE}.`,
    severity: "error",
    from: { path: graphPathPattern(start) },
    to: { reachable: true, path: graphPathPattern(CRYPTO_PACKAGE) },
  }));
}

/** Baseline graph for negative conformance probes (all required nodes, no crypto edges). */
export function createBaselineBoundaryPackages() {
  const packages = new Map();
  for (const packageName of [CRYPTO_PACKAGE, ...CRYPTO_FORBIDDEN_PRODUCTION_STARTS]) {
    packages.set(packageName, {
      packageDir: path.join(REPO_ROOT, "packages", "boundary-probe"),
      dependencies: [],
      sourceImports: [],
    });
  }
  return packages;
}

export async function assertPackageBoundaryConformance(packages) {
  assertBoundaryPackagesExist(packages);
  await assertDependencyCruiserRules(packages, cryptoForbiddenRules(), "insecur-package-boundary-");
}

export function assertHostedCiVerifyRunsPackageBoundaryConformance() {
  const workflow = readFileSync(CI_WORKFLOW_PATH, "utf8");
  const verifyJobMatch = workflow.match(
    /^\s+verify:\s*\n[\s\S]*?^\s+run:\s*\|\s*\n((?:\s{10}.*\n)+)/m,
  );
  if (!verifyJobMatch) {
    throw new Error(
      "package-boundary conformance: could not locate CI Verify job run block in .github/workflows/ci.yml",
    );
  }

  const verifyCommands = verifyJobMatch[1];
  if (!/\bpnpm\s+conformance:packages\b/.test(verifyCommands)) {
    throw new Error(
      "package-boundary conformance: hosted CI Verify must run `pnpm conformance:packages` (INS-307)",
    );
  }
}

export async function runPackageBoundaryConformance() {
  assertHostedCiVerifyRunsPackageBoundaryConformance();
  await assertPackageBoundaryNegativeProbe();
  const packages = await readWorkspacePackages();
  await assertPackageBoundaryConformance(packages);
  console.log("Package boundary conformance passed with dependency-cruiser.");
}

async function assertPackageBoundaryNegativeProbe() {
  const fixtureSource = readFileSync(DEEP_CRYPTO_IMPORT_FIXTURE, "utf8");
  const normalizedImports = collectWorkspaceImportSpecifiers(fixtureSource);
  if (!normalizedImports.has(CRYPTO_PACKAGE)) {
    throw new Error(
      "package-boundary negative probe: deep crypto import did not normalize to @insecur/crypto",
    );
  }
  if (normalizedImports.has("@insecur/crypto/src/keyring.js")) {
    throw new Error(
      "package-boundary negative probe: raw deep crypto import must not survive normalization",
    );
  }

  const violatingPackages = createBaselineBoundaryPackages();
  const tenantStore = violatingPackages.get("@insecur/tenant-store");
  if (!tenantStore) {
    throw new Error(
      "package-boundary negative probe: baseline graph missing @insecur/tenant-store",
    );
  }
  tenantStore.sourceImports = [CRYPTO_PACKAGE];

  let rejectedForbiddenCryptoPath = false;
  try {
    await assertPackageBoundaryConformance(violatingPackages);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/no-prod-crypto-from-insecur-tenant-store/i.test(message)) {
      rejectedForbiddenCryptoPath = true;
    } else {
      throw error;
    }
  }

  if (!rejectedForbiddenCryptoPath) {
    throw new Error(
      "package-boundary negative probe: forbidden tenant-store -> @insecur/crypto path must fail closed",
    );
  }
}
