import { AUTHORIZATION_SCOPES, authorizeScopeOrThrow } from "@insecur/access";
import { assertSecretWriteCoordinate, writeNonProtectedSecret } from "@insecur/secret-store";
import type { RuntimeSecretWritePayload, WriteSecretRpcInput } from "@insecur/worker-kit";

import { createKeyringFromRuntimeEnv } from "../crypto/keyring-context.js";
import type { RuntimeEnv } from "../env.js";
import { generateSecretValueUtf8 } from "../secret-generation.js";

type WriteSecretAuthorizationInput = Parameters<typeof authorizeScopeOrThrow>[0];

export interface WriteSecretOperationInput {
  readonly env: RuntimeEnv;
  readonly input: WriteSecretRpcInput;
  readonly auditActor: WriteSecretAuthorizationInput["auditActor"];
  readonly accessActor: WriteSecretAuthorizationInput["actor"];
}

export async function writeSecretOperation({
  env,
  input,
  auditActor,
  accessActor,
}: WriteSecretOperationInput): Promise<RuntimeSecretWritePayload> {
  const coordinate = {
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
  };

  // Authorization first, coordinate check second: a caller lacking write scope must get the
  // same insufficient_scope denial whether or not the URL environment exists, so the coordinate
  // check (which reads the environments table) cannot become a cross-project existence oracle.
  // The coordinate check then runs only for callers already entitled to write at this project.
  await authorizeScopeOrThrow({
    actor: accessActor,
    auditActor,
    coordinate,
    requiredScope: AUTHORIZATION_SCOPES.secretNonProtectedWrite,
    requestId: input.requestId,
  });
  await assertSecretWriteCoordinate({
    ...coordinate,
    actor: auditActor,
    request: { requestId: input.requestId },
  });
  const result = await writeNonProtectedSecret({
    keyring: createKeyringFromRuntimeEnv(env),
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    variableKey: input.variableKey,
    actor: auditActor,
    valueUtf8: "valueUtf8" in input ? input.valueUtf8 : generateSecretValueUtf8(input.generate),
    ...(input.allowEmpty !== undefined ? { allowEmpty: input.allowEmpty } : {}),
    ...(input.createOnly !== undefined ? { createOnly: input.createOnly } : {}),
    ...(input.secretId !== undefined ? { secretId: input.secretId } : {}),
    request: { requestId: input.requestId },
  });
  return {
    secretId: result.secretId,
    secretVersionId: result.secretVersionId,
    variableKey: result.variableKey,
    createdSecretShape: result.createdSecretShape,
    descriptiveVerdicts: result.descriptiveVerdicts,
    ...(result.auditEventId !== undefined ? { auditEventId: result.auditEventId } : {}),
  };
}
