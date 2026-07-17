import {
  assertSmokeArtifactCredentialRegistryValid,
  clearSmokeArtifactCredentials,
  readSmokeArtifactCredentialRegistry,
} from "./artifact-credential-registry";
import { revokeSmokeCredentials } from "./artifact-credential-revocation";
import { PREVIEW_SMOKE_ARTIFACT_ROOT } from "./artifact-root";
import { assertArtifactSweepClear, runArtifactSweep } from "./artifact-sweep";
import { sentinelForValue } from "./redaction";

const registry = readSmokeArtifactCredentialRegistry();
if (registry.credentials.length > 0) {
  await revokeSmokeCredentials(requireApiBaseUrl(), registry.credentials);
}
const sentinels = registry.credentials.map(sentinelForValue);
const result = await runArtifactSweep(PREVIEW_SMOKE_ARTIFACT_ROOT, sentinels);
assertArtifactSweepClear(result);
assertSmokeArtifactCredentialRegistryValid(registry);
clearSmokeArtifactCredentials();
console.log(
  `Preview smoke artifact sweep passed: ${String(result.fileCount)} files, ${String(result.archiveCount)} archives.`,
);

function requireApiBaseUrl(): string {
  const value = process.env.SMOKE_API_BASE_URL;
  if (value === undefined || value.trim() === "") {
    throw new Error("SMOKE_API_BASE_URL is required to revoke preview smoke credentials");
  }
  return value;
}
