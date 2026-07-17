import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { PREVIEW_SMOKE_ARTIFACT_ROOT } from "./artifact-root";
import { mintBearer } from "./auth";
import { createCloudflareR2BackupSweepProvider } from "./cloudflare-r2-backup-provider";
import { loadLocalEnvFiles } from "./env";
import { provisionFirstValueCoords } from "./first-value-coords";
import { createRedactor, mintSmokeSentinel } from "./redaction";
import { runR2BackupSweep } from "./r2-backup-sweep";
import { R2_BACKUP_SWEEP_EVIDENCE_RELATIVE_PATH } from "./r2-backup-sweep-evidence";

/**
 * Hosted entry for the real R2 backup no-plaintext sweep (INS-562). Runs inside the preview
 * smoke workflow with the existing Cloudflare deploy credentials and the configured Preview
 * backups bucket. Exits non-zero on any missing object, mismatched export operation,
 * incomplete scan, provider error, or sentinel finding. Success writes the metadata-only
 * release-gate evidence under the uploaded preview smoke artifact tree.
 */

const PREVIEW_RUNTIME_SCRIPT_NAME = "insecur-runtime-preview";

loadLocalEnvFiles();

const accountId = requireSweepEnv("CLOUDFLARE_ACCOUNT_ID");
const apiToken = requireSweepEnv("CLOUDFLARE_API_TOKEN");
const bucketName = requireSweepEnv("PREVIEW_RUNTIME_BACKUPS_BUCKET_NAME");
const expectedInstanceId = requireSweepEnv("PREVIEW_INSTANCE_ID");
const apiBaseUrl = requireSweepEnv("SMOKE_API_BASE_URL").replace(/\/$/u, "");
const expectedSha = requireSweepEnv("SMOKE_EXPECTED_DEPLOY_SHA", "GITHUB_SHA");
const signingSecret = requireSweepEnv("SMOKE_SESSION_SIGNING_SECRET", "SESSION_SIGNING_SECRET");
const ownerUserId = requireSweepEnv("SMOKE_ADMITTED_USER_ID");
const ownerWorkosUserId = requireSweepEnv("SMOKE_WORKOS_USER_ID");

const sentinel = mintSmokeSentinel();
const sentinelRunId = `r2-sweep-${randomUUID()}`;

const bearer = await mintBearer({
  rawUserId: ownerUserId,
  sessionId: `session_preview_smoke_r2_sweep_${randomUUID()}`,
  signingSecret,
  workosUserId: ownerWorkosUserId,
});
const redactor = createRedactor([
  ...sentinel.variants.map((variant) => variant.pattern),
  apiToken,
  signingSecret,
  bearer,
]);

const evidence = await runR2BackupSweep({
  bucketName,
  expectedInstanceId,
  expectedSha,
  provider: createCloudflareR2BackupSweepProvider({
    accountId,
    apiToken,
    bucketName,
    scriptName: PREVIEW_RUNTIME_SCRIPT_NAME,
  }),
  sentinel,
  sentinelRunId,
  writeCanary: async () => {
    await provisionFirstValueCoords({
      apiBaseUrl,
      bearer,
      redactor,
      sentinel,
      variableKey: `SMOKE_R2_SWEEP_${String(Date.now())}`,
    });
  },
});

const evidencePath = join(PREVIEW_SMOKE_ARTIFACT_ROOT, R2_BACKUP_SWEEP_EVIDENCE_RELATIVE_PATH);
await mkdir(dirname(evidencePath), { recursive: true });
await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

console.log(
  `R2 backup no-plaintext sweep passed: ${String(evidence.scanned_object_count)} objects, ` +
    `${String(evidence.scanned_byte_count)} bytes, zero findings (${evidence.target_ref}).`,
);
console.log(`R2 backup sweep evidence written: ${evidencePath}`);

function requireSweepEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && value.trim() !== "") {
      return value.trim();
    }
  }
  throw new Error(`${names.join(" or ")} is required for the R2 backup no-plaintext sweep`);
}
