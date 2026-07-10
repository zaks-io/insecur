import { waitForPreviewDeployIdentity } from "./deploy-identity.js";
import {
  resetPreviewDeployIdentityProof,
  writePreSuiteDeployIdentityProof,
} from "./deploy-identity-proof.js";
import { loadPreviewConfig } from "./env.js";

export default async function globalSetup(): Promise<void> {
  const preview = loadPreviewConfig();
  resetPreviewDeployIdentityProof();
  writePreSuiteDeployIdentityProof(
    preview.expectedSha,
    await waitForPreviewDeployIdentity(preview),
  );
}
