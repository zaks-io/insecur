import {
  errorEnvelope,
  injectionGrantId,
  successEnvelope,
  type EnvironmentId,
  type ProjectId,
  type VariableKey,
} from "@insecur/domain";
import type { LocalStore } from "@insecur/local-store";
import type { IssueInjectionGrantData } from "../api/runtime-injection-api-types.js";
import { CliError } from "../output/cli-error.js";
import {
  computeGrantExpiresAt,
  GRANT_ISSUED_EVENT,
  GRANT_ISSUE_DENIED_EVENT,
  resolveVariableKeyBinding,
} from "./local-injection-grant-resolve.js";

interface IssueFailureResult {
  ok: false;
  envelope: ReturnType<typeof errorEnvelope>;
  httpStatus: number;
}

interface IssueSuccessResult {
  ok: true;
  envelope: ReturnType<typeof successEnvelope<IssueInjectionGrantData>>;
}

async function insertGrantAndAudit(input: {
  readonly store: LocalStore;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly variableKey: VariableKey;
  readonly secretId: import("@insecur/domain").SecretId;
  readonly secretVersionId: import("@insecur/domain").SecretVersionId;
}): Promise<IssueSuccessResult> {
  const grantId = injectionGrantId.generate();
  const expiresAt = computeGrantExpiresAt();
  await input.store.injectionGrants.insertGrant({
    grantId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    bindings: [
      {
        secretId: input.secretId,
        secretVersionId: input.secretVersionId,
        variableKey: input.variableKey,
      },
    ],
    expiresAt,
  });
  const audit = await input.store.audit.writeEvent({
    eventCode: GRANT_ISSUED_EVENT,
    outcome: "success",
    projectId: input.projectId,
    environmentId: input.environmentId,
    secretId: input.secretId,
    details: { grantId, variableKey: input.variableKey },
  });
  return {
    ok: true,
    envelope: successEnvelope({
      grantId,
      expiresAt: expiresAt.toISOString(),
      auditEventId: audit.auditEventId,
    }),
  };
}

async function denyIssue(input: {
  readonly store: LocalStore;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly variableKey: VariableKey;
  readonly error: CliError;
}): Promise<IssueFailureResult> {
  await input.store.audit.writeEvent({
    eventCode: GRANT_ISSUE_DENIED_EVENT,
    outcome: "denied",
    projectId: input.projectId,
    environmentId: input.environmentId,
    details: {
      variableKey: input.variableKey,
      reasonCode: input.error.code,
    },
  });
  return { ok: false, envelope: input.error.toErrorEnvelope(), httpStatus: 404 };
}

export async function issueLocalVariableKeyInjectionGrant(input: {
  readonly store: LocalStore;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly variableKey: VariableKey;
}): Promise<IssueFailureResult | IssueSuccessResult> {
  try {
    const binding = await resolveVariableKeyBinding(
      input.store,
      input.projectId,
      input.environmentId,
      input.variableKey,
    );
    return await insertGrantAndAudit({
      store: input.store,
      projectId: input.projectId,
      environmentId: input.environmentId,
      variableKey: input.variableKey,
      secretId: binding.secretId,
      secretVersionId: binding.secretVersionId,
    });
  } catch (error) {
    if (error instanceof CliError) {
      return denyIssue({
        store: input.store,
        projectId: input.projectId,
        environmentId: input.environmentId,
        variableKey: input.variableKey,
        error,
      });
    }
    throw error;
  }
}
