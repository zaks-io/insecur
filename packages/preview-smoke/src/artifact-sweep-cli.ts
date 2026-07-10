import { fileURLToPath } from "node:url";

import {
  clearSmokeArtifactCredentials,
  readSmokeArtifactCredentials,
} from "./artifact-credential-registry";
import { revokeSmokeCredentials } from "./artifact-credential-revocation";
import { assertArtifactSweepClear, runArtifactSweep } from "./artifact-sweep";
import { sentinelForValue } from "./redaction";

const artifactRoot = fileURLToPath(new URL("../../preview-smoke-artifacts", import.meta.url));

try {
  const credentials = readSmokeArtifactCredentials();
  if (credentials.length > 0) {
    await revokeSmokeCredentials(requireApiBaseUrl(), credentials);
  }
  const sentinels = credentials.map(sentinelForValue);
  const result = await runArtifactSweep(artifactRoot, sentinels);
  assertArtifactSweepClear(result);
  console.log(
    `Preview smoke artifact sweep passed: ${String(result.fileCount)} files, ${String(result.archiveCount)} archives.`,
  );
} finally {
  clearSmokeArtifactCredentials();
}

function requireApiBaseUrl(): string {
  const value = process.env.SMOKE_API_BASE_URL;
  if (value === undefined || value.trim() === "") {
    throw new Error("SMOKE_API_BASE_URL is required to revoke preview smoke credentials");
  }
  return value;
}
