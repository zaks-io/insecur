import type { AppConnectionId, OrganizationId, ProjectId, UserId } from "@insecur/domain";

import type { CloudflareConnectionBoundary } from "./cloudflare-scoped-token-metadata.js";
import type {
  CloudflareScopedTokenPort,
  CloudflareScopedTokenVerifyResult,
} from "./cloudflare-scoped-token-port.js";
import { verifyConnectionWithValidationAudit } from "./verify-connection-with-validation-audit.js";

export interface VerifyCloudflareConnectionTokenInput {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly appConnectionId: AppConnectionId;
  readonly tokenPlaintext: Uint8Array;
  readonly boundary: CloudflareConnectionBoundary;
  readonly cloudflarePort: CloudflareScopedTokenPort;
}

/**
 * Verifies a candidate scoped token against the connection boundary before any activation
 * side effects. Denials are audited as `connection.validation_denied` and rethrown.
 */
export async function verifyCloudflareConnectionToken(
  input: VerifyCloudflareConnectionTokenInput,
): Promise<CloudflareScopedTokenVerifyResult> {
  const token = new TextDecoder().decode(input.tokenPlaintext);
  return verifyConnectionWithValidationAudit(input, () =>
    input.cloudflarePort.verifyScopedToken({
      token,
      allowedAccountId: input.boundary.allowedAccountId,
      allowedWorkerScript: input.boundary.allowedWorkerScript,
    }),
  );
}
