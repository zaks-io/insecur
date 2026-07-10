import { AUTHORIZATION_SCOPES, authorizeScopeOrThrow } from "@insecur/access";
import { assertSecretPossessionCoordinate, checkSecretPossession } from "@insecur/secret-store";
import type {
  CheckSecretPossessionPayload,
  CheckSecretPossessionRpcInput,
} from "@insecur/worker-kit";

import { createKeyringFromRuntimeEnv } from "../crypto/keyring-context.js";
import type { RuntimeEnv } from "../env.js";

type CheckPossessionAuthorizationInput = Parameters<typeof authorizeScopeOrThrow>[0];

export interface CheckSecretPossessionOperationInput {
  readonly env: RuntimeEnv;
  readonly input: CheckSecretPossessionRpcInput;
  readonly auditActor: CheckPossessionAuthorizationInput["auditActor"];
  readonly accessActor: CheckPossessionAuthorizationInput["actor"];
}

export async function checkSecretPossessionOperation({
  env,
  input,
  auditActor,
  accessActor,
}: CheckSecretPossessionOperationInput): Promise<CheckSecretPossessionPayload> {
  const coordinate = {
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
  };

  // Authorization first, coordinate check second (INS-154 ordering): a caller lacking write scope
  // gets the same insufficient_scope denial whether or not the URL environment exists, so the
  // coordinate read cannot become a cross-project existence oracle. Possession requires
  // secret:non_protected_write — the same atom migrate's verified-then-clean needs — so a read-only
  // actor cannot turn this into a value-guessing oracle.
  await authorizeScopeOrThrow({
    actor: accessActor,
    auditActor,
    coordinate,
    requiredScope: AUTHORIZATION_SCOPES.secretNonProtectedWrite,
    requestId: input.requestId,
  });
  // A coordinate denial here is a possession probe, so it audits under the possession-specific
  // `secret.possession_check_denied` code rather than the write path's denied code (INS-528).
  await assertSecretPossessionCoordinate({
    ...coordinate,
    ...(input.secretId !== undefined ? { secretId: input.secretId } : {}),
    actor: auditActor,
    request: { requestId: input.requestId },
  });

  const result = await checkSecretPossession({
    keyring: createKeyringFromRuntimeEnv(env),
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    ...(input.variableKey !== undefined ? { variableKey: input.variableKey } : {}),
    ...(input.secretId !== undefined ? { secretId: input.secretId } : {}),
    candidateUtf8: input.candidateUtf8,
    actor: auditActor,
    request: { requestId: input.requestId },
  });

  return {
    secretId: result.secretId,
    variableKey: result.variableKey,
    verdict: result.verdict,
    auditEventId: result.auditEventId,
  };
}
