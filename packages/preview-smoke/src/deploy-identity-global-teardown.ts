import { checkPreviewDeployIdentity } from "./deploy-identity.js";
import { writePostSuiteDeployIdentityProof } from "./deploy-identity-proof.js";
import { loadPreviewConfig } from "./env.js";

export default async function globalTeardown(): Promise<void> {
  const preview = loadPreviewConfig();
  writePostSuiteDeployIdentityProof(preview.expectedSha, await checkPreviewDeployIdentity(preview));
}
