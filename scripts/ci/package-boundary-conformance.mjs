#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const REPO_ROOT = process.cwd();
const WORKSPACE_DIRS = ["apps", "packages"];
const CRYPTO_PACKAGE = "@insecur/crypto";
const SOURCE_FILE_PATTERN = /\.[cm]?tsx?$/;
const TEST_FILE_PATTERN = /\.(test|spec)\.[cm]?tsx?$/;
const STATIC_WORKSPACE_IMPORT_PATTERN =
  /\b(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["'](@insecur\/[^"']+)["']/g;
const DYNAMIC_WORKSPACE_IMPORT_PATTERN = /\bimport\s*\(\s*["'](@insecur\/[^"']+)["']\s*\)/g;

const CRYPTO_FORBIDDEN_PRODUCTION_STARTS = [
  "@insecur/api",
  "@insecur/worker-kit",
  "@insecur/tenant-store",
  "@insecur/runtime-injection-issue",
  "@insecur/secret-store-contracts",
  "@insecur/custody-contracts",
];

function normalizeWorkspacePackageName(specifier) {
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

function collectWorkspaceImportSpecifiers(source) {
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

async function readWorkspacePackages() {
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

function assertBoundaryPackagesExist(packages) {
  const requiredPackages = new Set([CRYPTO_PACKAGE, ...CRYPTO_FORBIDDEN_PRODUCTION_STARTS]);
  const missingPackages = [...requiredPackages].filter((name) => !packages.has(name));
  if (missingPackages.length > 0) {
    throw new Error(`Package boundary conformance could not find: ${missingPackages.join(", ")}`);
  }
}

function graphModuleFileName(packageName) {
  return `${packageName.replace(/^@/, "").replaceAll("/", "__")}.mjs`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function graphPathPattern(packageName) {
  return `(^|/)${escapeRegExp(graphModuleFileName(packageName))}$`;
}

function dependencyCruiserConfig() {
  return {
    forbidden: CRYPTO_FORBIDDEN_PRODUCTION_STARTS.map((start) => ({
      name: `no-prod-crypto-from-${start.replace(/^@/, "").replaceAll("/", "-")}`,
      comment: `${start} must not have a production dependency path to ${CRYPTO_PACKAGE}.`,
      severity: "error",
      from: {
        path: graphPathPattern(start),
      },
      to: {
        reachable: true,
        path: graphPathPattern(CRYPTO_PACKAGE),
      },
    })),
    options: {
      doNotFollow: {
        path: "node_modules",
      },
      progress: {
        type: "none",
      },
    },
  };
}

// dependency-cruiser cruises source modules; this graph turns package manifests and
// production source imports into cruisable modules without relying on built dist output.
async function writeDependencyCruiserGraph(packages) {
  const graphDir = await mkdtemp(path.join(os.tmpdir(), "insecur-package-boundary-"));
  for (const [packageName, packageInfo] of packages) {
    const workspaceDependencies = [
      ...new Set([...packageInfo.dependencies, ...packageInfo.sourceImports]),
    ]
      .filter((dependencyName) => dependencyName !== packageName)
      .filter((dependencyName) => packages.has(dependencyName))
      .sort();
    const imports = workspaceDependencies.map(
      (dependencyName) => `import "./${graphModuleFileName(dependencyName)}";`,
    );
    await writeFile(
      path.join(graphDir, graphModuleFileName(packageName)),
      `${imports.join("\n")}\n`,
      "utf8",
    );
  }

  const configPath = path.join(graphDir, "dependency-cruiser.config.cjs");
  await writeFile(
    configPath,
    `module.exports = ${JSON.stringify(dependencyCruiserConfig(), null, 2)};\n`,
    "utf8",
  );

  return { graphDir, configPath };
}

async function runDependencyCruiser(graphDir, configPath) {
  const args = [
    "exec",
    "depcruise",
    graphDir,
    "--config",
    configPath,
    "--output-type",
    "err",
    "--progress",
    "none",
  ];

  const { stdout, stderr, exitCode } = await new Promise((resolve) => {
    const child = spawn("pnpm", args, {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => resolve({ stdout, stderr: String(error), exitCode: 1 }));
    child.on("close", (exitCode) => resolve({ stdout, stderr, exitCode }));
  });

  if (exitCode !== 0) {
    const output = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
    throw new Error(output || `dependency-cruiser exited with status ${exitCode}`);
  }
}

async function main() {
  const packages = await readWorkspacePackages();
  assertBoundaryPackagesExist(packages);

  const { graphDir, configPath } = await writeDependencyCruiserGraph(packages);
  try {
    await runDependencyCruiser(graphDir, configPath);
  } finally {
    await rm(graphDir, { recursive: true, force: true });
  }
  console.log("Package boundary conformance passed with dependency-cruiser.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
