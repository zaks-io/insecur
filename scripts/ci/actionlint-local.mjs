// Run actionlint locally if it is on PATH; skip gracefully otherwise.
// CI installs a pinned actionlint and runs it directly, so the workflow gate
// is authoritative. This wrapper keeps pre-push and `pnpm verify` from hard
// failing on machines that have not installed actionlint yet.
import { spawnSync } from "node:child_process";

const probe = spawnSync("actionlint", ["--version"], { stdio: "ignore" });

if (probe.error || probe.status !== 0) {
  console.log("actionlint not installed; skipping workflow lint (CI still runs actionlint).");
  process.exit(0);
}

const result = spawnSync("actionlint", ["-color"], { stdio: "inherit" });
process.exit(result.status ?? 1);
