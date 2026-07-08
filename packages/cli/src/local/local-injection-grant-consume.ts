import {
  bytesToBase64Url,
  errorEnvelope,
  INJECTION_ERROR_CODES,
  successEnvelope,
  type EnvironmentId,
  type InjectionGrantId,
  type ProjectId,
  type SecretId,
  type VariableKey,
} from "@insecur/domain";
import {
  decryptLocalSecretForInjection,
  LOCAL_MODE_ORGANIZATION_ID,
  type LocalStore,
} from "@insecur/local-store";
import type { InjectionGrantDeliveryData } from "../api/runtime-injection-api-types.js";
import {
  GRANT_CONSUME_DENIED_EVENT,
  GRANT_CONSUMED_EVENT,
  mapConsumeFailure,
  RUN_COMPLETED_EVENT,
} from "./local-injection-grant-resolve.js";

interface ConsumeFailureResult {
  ok: false;
  envelope: ReturnType<typeof errorEnvelope>;
  httpStatus: number;
}

interface ConsumeSuccessResult {
  ok: true;
  envelope: { ok: true; delivery: InjectionGrantDeliveryData };
}

async function loadDeliveryPayload(input: {
  readonly store: LocalStore;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly secretId: SecretId;
}): Promise<string | null> {
  const wrapped = await input.store.secretVersions.getCurrentWrappedVersion(
    input.projectId,
    input.secretId,
  );
  if (wrapped === null) {
    return null;
  }
  const plaintext = await decryptLocalSecretForInjection(
    input.store.keyring,
    {
      organizationId: LOCAL_MODE_ORGANIZATION_ID,
      projectId: input.projectId,
      environmentId: input.environmentId,
      secretId: input.secretId,
    },
    wrapped.wrapped,
  );
  return bytesToBase64Url(plaintext.unwrapUtf8());
}

function missingShapeFailure(variableKey: VariableKey): ConsumeFailureResult {
  return {
    ok: false,
    envelope: errorEnvelope({
      code: INJECTION_ERROR_CODES.grantDenied,
      message: `No secret shape exists for variable key ${variableKey}.`,
      retryable: false,
    }),
    httpStatus: 404,
  };
}

async function denyConsumeFailure(input: {
  readonly store: LocalStore;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly grantId: InjectionGrantId;
  readonly secretId: SecretId;
  readonly variableKey: VariableKey;
  readonly failure:
    "not_found" | "expired" | "already_consumed" | "binding_not_allowed" | "revoked";
}): Promise<ConsumeFailureResult> {
  await input.store.audit.writeEvent({
    eventCode: GRANT_CONSUME_DENIED_EVENT,
    outcome: "denied",
    projectId: input.projectId,
    environmentId: input.environmentId,
    secretId: input.secretId,
    details: {
      grantId: input.grantId,
      variableKey: input.variableKey,
      reasonCode: input.failure,
    },
  });
  return {
    ok: false,
    envelope: errorEnvelope({
      code: mapConsumeFailure(input.failure),
      message: "Injection grant could not be consumed.",
      retryable: false,
    }),
    httpStatus: 404,
  };
}

function missingPayloadFailure(): ConsumeFailureResult {
  return {
    ok: false,
    envelope: errorEnvelope({
      code: INJECTION_ERROR_CODES.decryptFailed,
      message: "Grant delivery payload could not be resolved.",
      retryable: false,
    }),
    httpStatus: 500,
  };
}

async function buildConsumedSuccess(input: {
  readonly store: LocalStore;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly grantId: InjectionGrantId;
  readonly secretId: SecretId;
  readonly secretVersionId: import("@insecur/domain").SecretVersionId;
  readonly variableKey: VariableKey;
  readonly encodedValueUtf8: string;
}): Promise<ConsumeSuccessResult> {
  const audit = await input.store.audit.writeEvent({
    eventCode: GRANT_CONSUMED_EVENT,
    outcome: "success",
    projectId: input.projectId,
    environmentId: input.environmentId,
    secretId: input.secretId,
    details: {
      grantId: input.grantId,
      variableKey: input.variableKey,
    },
  });
  return {
    ok: true,
    envelope: {
      ok: true,
      delivery: {
        grantId: input.grantId,
        secretId: input.secretId,
        secretVersionId: input.secretVersionId,
        variableKey: input.variableKey,
        encodedValueUtf8: input.encodedValueUtf8,
        auditEventId: audit.auditEventId,
      },
    },
  };
}

export async function consumeLocalVariableKeyInjectionGrant(input: {
  readonly store: LocalStore;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly grantId: InjectionGrantId;
  readonly variableKey: VariableKey;
}): Promise<ConsumeFailureResult | ConsumeSuccessResult> {
  const shape = await input.store.projects.getSecretShape(input.projectId, input.variableKey);
  const secretIdValue = shape?.secretId;
  if (secretIdValue === undefined) {
    return missingShapeFailure(input.variableKey);
  }

  const consumed = await input.store.injectionGrants.tryConsumeGrant(
    input.projectId,
    input.grantId,
    secretIdValue,
    input.variableKey,
  );
  if (!consumed.ok) {
    return denyConsumeFailure({
      store: input.store,
      projectId: input.projectId,
      environmentId: input.environmentId,
      grantId: input.grantId,
      secretId: secretIdValue,
      variableKey: input.variableKey,
      failure: consumed.failure,
    });
  }

  const encodedValueUtf8 = await loadDeliveryPayload({
    store: input.store,
    projectId: input.projectId,
    environmentId: input.environmentId,
    secretId: consumed.grant.secretId,
  });
  if (encodedValueUtf8 === null) {
    return missingPayloadFailure();
  }

  return buildConsumedSuccess({
    store: input.store,
    projectId: input.projectId,
    environmentId: input.environmentId,
    grantId: input.grantId,
    secretId: consumed.grant.secretId,
    secretVersionId: consumed.grant.secretVersionId,
    variableKey: input.variableKey,
    encodedValueUtf8,
  });
}

export async function recordLocalInjectionRunCompleted(input: {
  readonly store: LocalStore;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly grantId: InjectionGrantId;
  readonly childExitCode: number;
}): Promise<{
  ok: true;
  envelope: {
    ok: true;
    data: { auditEventId: string; alreadyRecorded: boolean };
  };
}> {
  const audit = await input.store.audit.writeEvent({
    eventCode: RUN_COMPLETED_EVENT,
    outcome: "success",
    projectId: input.projectId,
    environmentId: input.environmentId,
    details: {
      grantId: input.grantId,
      childExitCode: input.childExitCode,
    },
  });
  return {
    ok: true,
    envelope: successEnvelope({
      auditEventId: audit.auditEventId,
      alreadyRecorded: false,
    }),
  };
}
