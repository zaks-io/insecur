import type { Keyring } from "@insecur/crypto";
import type { UserActorRef } from "@insecur/access";
import {
  APP_CONNECTION_ERROR_CODES,
  type AppConnectionId,
  type OperationId,
  type OrganizationId,
  type RequestId,
} from "@insecur/domain";

import {
  requireUserActorForConnectionCommand,
  runAppConnectionCredentialChangeGate,
} from "./app-connection-change-gate.js";
import { AppConnectionError } from "./app-connection-error.js";
import type { MetadataSafeCloudflareConnectionValidation } from "./create-cloudflare-scoped-token-connection.js";
import {
  dryRunCloudflareCredentialRotation,
  rotateCloudflareScopedTokenCredential,
} from "./rotate-cloudflare-credential.js";
import { toMetadataSafeAppConnectionStatus } from "./metadata-safe-connection-status.js";

export interface RotateAppConnectionCredentialCommandInput {
  readonly actor: UserActorRef;
  readonly organizationId: OrganizationId;
  readonly appConnectionId: AppConnectionId;
  readonly operationId?: OperationId;
  readonly requestId: RequestId;
  readonly dryRun: boolean;
  readonly tokenPlaintext?: Uint8Array;
  readonly keyring: Keyring;
}

export async function rotateAppConnectionCredentialCommand(
  input: RotateAppConnectionCredentialCommandInput,
): Promise<{
  readonly dryRun: boolean;
  readonly connection: ReturnType<typeof toMetadataSafeAppConnectionStatus>;
  readonly validation: MetadataSafeCloudflareConnectionValidation | null;
  readonly auditEventId: string | null;
}> {
  const actor = requireUserActorForConnectionCommand(input.actor);

  if (input.dryRun) {
    const result = await dryRunCloudflareCredentialRotation({
      actor,
      organizationId: input.organizationId,
      appConnectionId: input.appConnectionId,
      keyring: input.keyring,
    });
    return { dryRun: true, ...result, auditEventId: null };
  }

  if (input.tokenPlaintext === undefined) {
    throw new AppConnectionError(
      APP_CONNECTION_ERROR_CODES.credentialMissing,
      "Credential rotation requires a provider token via stdin or masked prompt",
    );
  }

  const gate = await runAppConnectionCredentialChangeGate({
    actor,
    organizationId: input.organizationId,
    appConnectionId: input.appConnectionId,
    requestId: input.requestId,
    ...(input.operationId !== undefined ? { operationId: input.operationId } : {}),
  });

  const result = await rotateCloudflareScopedTokenCredential({
    actor,
    organizationId: input.organizationId,
    appConnectionId: input.appConnectionId,
    operationId: gate.operationId,
    projectId: gate.projectId,
    tokenPlaintext: input.tokenPlaintext,
    keyring: input.keyring,
  });

  return { dryRun: false, ...result };
}
