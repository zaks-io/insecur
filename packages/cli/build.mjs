import { chmod, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { build } from "esbuild";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));
const distDir = path.join(packageRoot, "dist");
const outFile = path.join(distDir, "index.js");
const metaFile = path.join(distDir, "metafile.json");
const packageJson = JSON.parse(await readFile(new URL("package.json", import.meta.url), "utf8"));

await rm(distDir, { recursive: true, force: true });

const result = await build({
  absWorkingDir: packageRoot,
  bundle: true,
  define: { __INSECUR_CLI_VERSION__: JSON.stringify(packageJson.version) },
  entryPoints: ["src/index.ts"],
  format: "esm",
  logLevel: "info",
  metafile: true,
  outfile: outFile,
  platform: "node",
  target: "node24",
});

await writeFile(metaFile, `${JSON.stringify(result.metafile, null, 2)}\n`, "utf8");
await chmod(outFile, 0o755);
