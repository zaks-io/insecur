import {
  assertSmokeArtifactCredentialRegistryValid,
  readSmokeArtifactCredentialRegistry,
} from "./artifact-credential-registry.js";
import { revokeSmokeCredentials } from "./artifact-credential-revocation.js";
import { checkPreviewDeployIdentity } from "./deploy-identity.js";
import { writePostSuiteDeployIdentityProof } from "./deploy-identity-proof.js";
import { loadPreviewConfig } from "./env.js";

export default async function globalTeardown(): Promise<void> {
  const preview = loadPreviewConfig();
  try {
    writePostSuiteDeployIdentityProof(
      preview.expectedSha,
      await checkPreviewDeployIdentity(preview),
    );
  } finally {
    const registry = readSmokeArtifactCredentialRegistry();
    await revokeSmokeCredentials(preview.apiBaseUrl, registry.credentials);
    assertSmokeArtifactCredentialRegistryValid(registry);
  }
}
