import {
  errorEnvelope,
  secretId,
  successEnvelope,
  type EnvironmentId,
  type KnownErrorCode,
  type ProjectId,
  type SecretId,
  type VariableKey,
} from "@insecur/domain";
import {
  LOCAL_MODE_ORGANIZATION_ID,
  writeLocalBlindSecretVersion,
  type LocalStore,
} from "@insecur/local-store";
import type { SecretWriteByVariableKeyData } from "../api/secrets-api-types.js";
import type { InsecurProjectConfig } from "../config/project-config.js";
import type { GlobalCliFlags } from "../cli-options.js";
import {
  isSecretWriteError,
  LocalSecretGenerationError,
  resolveValueUtf8,
  upsertManifestShape,
} from "./local-secrets-write-helpers.js";
import { assertLocalProjectReady, syncSecretShapesFromConfig } from "./sync-local-project.js";

const SECRET_WRITE_AUDIT_EVENT = "secret.non_protected_write";

type SecretWriteInput = {
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly variableKey: VariableKey;
  readonly allowEmpty?: boolean;
} & (
  | { readonly valueUtf8: Uint8Array; readonly generate?: never }
  | {
      readonly generate: { readonly mode: "random"; readonly lengthBytes: number };
      readonly valueUtf8?: never;
    }
);

interface WriteFailureResult {
  ok: false;
  envelope: ReturnType<typeof errorEnvelope>;
  httpStatus: number;
}

interface WriteSuccessResult {
  ok: true;
  envelope: ReturnType<typeof successEnvelope<SecretWriteByVariableKeyData>>;
}

async function writeResolvedSecret(input: {
  readonly store: LocalStore;
  readonly write: SecretWriteInput;
  readonly secretId: SecretId;
  readonly generationHint: string | null;
}): Promise<ReturnType<typeof writeLocalBlindSecretVersion>> {
  const valueUtf8 = resolveValueUtf8(input.write);
  return writeLocalBlindSecretVersion(
    {
      secretVersions: input.store.secretVersions,
      projectMetadata: input.store.projects,
    },
    {
      keyring: input.store.keyring,
      ciphertextIdentity: {
        organizationId: LOCAL_MODE_ORGANIZATION_ID,
        projectId: input.write.projectId,
        environmentId: input.write.environmentId,
        secretId: input.secretId,
      },
      projectId: input.write.projectId,
      environmentId: input.write.environmentId,
      secretId: input.secretId,
      variableKey: input.write.variableKey,
      valueUtf8,
      generationHint: input.generationHint,
    },
  );
}

function writeFailureEnvelope(code: KnownErrorCode, message: string): WriteFailureResult {
  return {
    ok: false,
    envelope: errorEnvelope({ code, message, retryable: false }),
    httpStatus: 400,
  };
}

async function resolveOrCreateSecretShape(input: {
  readonly store: LocalStore;
  readonly flags: GlobalCliFlags;
  readonly projectConfig: InsecurProjectConfig | null;
  readonly write: SecretWriteInput;
}): Promise<{ secretId: SecretId; generationHint: string | null; createdSecretShape: boolean }> {
  let shape = await input.store.projects.getSecretShape(
    input.write.projectId,
    input.write.variableKey,
  );
  if (shape !== null) {
    return {
      secretId: shape.secretId,
      generationHint: shape.generationHint,
      createdSecretShape: false,
    };
  }
  await upsertManifestShape(
    input.flags,
    input.projectConfig,
    input.write.projectId,
    input.write.variableKey,
  );
  const secretIdValue = secretId.generate();
  shape = await input.store.projects.upsertSecretShape({
    projectId: input.write.projectId,
    variableKey: input.write.variableKey,
    secretId: secretIdValue,
  });
  return {
    secretId: shape.secretId,
    generationHint: shape.generationHint,
    createdSecretShape: true,
  };
}

export async function writeLocalSecretByVariableKey(input: {
  readonly store: LocalStore;
  readonly flags: GlobalCliFlags;
  readonly projectConfig: InsecurProjectConfig | null;
  readonly write: SecretWriteInput;
}): Promise<WriteFailureResult | WriteSuccessResult> {
  try {
    await assertLocalProjectReady(input.store, input.write.projectId, input.write.environmentId);
    await syncSecretShapesFromConfig(input.store, input.projectConfig, input.write.projectId);

    const shape = await resolveOrCreateSecretShape(input);
    const writeResult = await writeResolvedSecret({
      store: input.store,
      write: input.write,
      secretId: shape.secretId,
      generationHint: shape.generationHint,
    });

    const audit = await input.store.audit.writeEvent({
      eventCode: SECRET_WRITE_AUDIT_EVENT,
      outcome: "success",
      projectId: input.write.projectId,
      environmentId: input.write.environmentId,
      secretId: shape.secretId,
      details: { variableKey: input.write.variableKey },
    });

    return {
      ok: true,
      envelope: successEnvelope({
        secretId: shape.secretId,
        secretVersionId: writeResult.secretVersionId,
        variableKey: input.write.variableKey,
        createdSecretShape: shape.createdSecretShape,
        descriptiveVerdicts: writeResult.descriptiveVerdicts,
        auditEventId: audit.auditEventId,
      }),
    };
  } catch (error) {
    if (error instanceof LocalSecretGenerationError) {
      return writeFailureEnvelope(error.code, error.message);
    }
    if (isSecretWriteError(error)) {
      return writeFailureEnvelope(error.code, error.message);
    }
    throw error;
  }
}
