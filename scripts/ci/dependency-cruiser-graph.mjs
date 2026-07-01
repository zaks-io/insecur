import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const REPO_ROOT = process.cwd();

/** Synthetic-graph module filename for a workspace package (e.g. `insecur__crypto.mjs`). */
export function graphModuleFileName(packageName) {
  return `${packageName.replace(/^@/, "").replaceAll("/", "__")}.mjs`;
}

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** dependency-cruiser path regex matching the synthetic module for one workspace package. */
export function graphPathPattern(packageName) {
  return `(^|/)${escapeRegExp(graphModuleFileName(packageName))}$`;
}

// dependency-cruiser cruises source modules; this turns package manifests and production source
// imports into cruisable modules without relying on built dist output. Each package becomes one
// `.mjs` file importing a stub per workspace dependency, so a forbidden edge is a real import edge.
async function writeGraph(packages, forbidden, tmpPrefix) {
  const graphDir = await mkdtemp(path.join(os.tmpdir(), tmpPrefix));
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

  const config = {
    forbidden,
    options: { doNotFollow: { path: "node_modules" }, progress: { type: "none" } },
  };
  const configPath = path.join(graphDir, "dependency-cruiser.config.cjs");
  await writeFile(configPath, `module.exports = ${JSON.stringify(config, null, 2)};\n`, "utf8");

  return { graphDir, configPath };
}

async function runDepcruise(graphDir, configPath) {
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
    const child = spawn("pnpm", args, { cwd: REPO_ROOT, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => resolve({ stdout, stderr: String(error), exitCode: 1 }));
    child.on("close", (exitCode) => resolve({ stdout, stderr, exitCode }));
  });

  if (exitCode !== 0) {
    const output = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
    throw new Error(output || `dependency-cruiser exited with status ${exitCode}`);
  }
}

/**
 * Assert `forbidden` dependency-cruiser rules over the synthetic graph of `packages`. Throws with
 * dependency-cruiser's error output if any forbidden edge is present. `tmpPrefix` names the temp dir.
 */
export async function assertDependencyCruiserRules(packages, forbidden, tmpPrefix) {
  const { graphDir, configPath } = await writeGraph(packages, forbidden, tmpPrefix);
  try {
    await runDepcruise(graphDir, configPath);
  } finally {
    await rm(graphDir, { recursive: true, force: true });
  }
}
