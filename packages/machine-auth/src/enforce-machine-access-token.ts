import type { CredentialScope, MachineActorRef, ResourceCoordinate } from "@insecur/access";
import type { OperationId, RequestId, RuntimePolicyId } from "@insecur/domain";
import {
  machineAccessTokenDenialMessage,
  machineAccessTokenDenialReasonCode,
  type MachineAccessTokenDenialKind,
} from "./machine-access-token-denial.js";
import { machineActorFromVerifiedMachineAccessToken } from "./machine-actor-from-verified-token.js";
import {
  verifyMachineAccessToken,
  type VerifiedMachineAccessToken,
} from "./machine-access-token.js";
import {
  authorizationScopeAuditAtom,
  type MachineCredentialMethod,
} from "./machine-access-audit-metadata.js";
import { machineAuthExchangeTenantScope } from "./machine-auth-exchange-tenant-scope.js";
import {
  recordMachineAccessTokenDenied,
  recordMachineAccessTokenUsed,
} from "./record-machine-access-token-audit.js";

export interface MachineAccessTokenAuditContext {
  readonly credentialMethod: MachineCredentialMethod;
  readonly request?: { requestId: RequestId };
  readonly operation?: { operationId: OperationId };
}

export interface EnforceMachineAccessTokenInput {
  readonly accessToken: string;
  readonly signingSecret: string;
  readonly coordinate: ResourceCoordinate;
  readonly requiredCredentialScopes?: readonly CredentialScope[];
  readonly runtimePolicyKeyId?: RuntimePolicyId;
  readonly audit?: MachineAccessTokenAuditContext;
}

interface EnforceMachineAccessTokenFailure {
  readonly ok: false;
  readonly code: ReturnType<typeof machineAccessTokenDenialReasonCode>;
  readonly denialKind: MachineAccessTokenDenialKind;
  readonly message: string;
}

interface EnforceMachineAccessTokenSuccess {
  readonly ok: true;
  readonly token: VerifiedMachineAccessToken;
  readonly actor: MachineActorRef;
}

export type EnforceMachineAccessTokenResult =
  EnforceMachineAccessTokenSuccess | EnforceMachineAccessTokenFailure;

function enforceFailure(
  denialKind: MachineAccessTokenDenialKind,
): EnforceMachineAccessTokenFailure {
  return {
    ok: false,
    code: machineAccessTokenDenialReasonCode(denialKind),
    denialKind,
    message: machineAccessTokenDenialMessage(denialKind),
  };
}

function credentialScopesSatisfy(
  tokenScopes: readonly CredentialScope[],
  requiredScopes: readonly CredentialScope[],
): boolean {
  const granted = new Set(tokenScopes);
  return requiredScopes.every((scope) => granted.has(scope));
}

function environmentBindingFailure(
  token: VerifiedMachineAccessToken,
  coordinate: ResourceCoordinate,
): MachineAccessTokenDenialKind | null {
  if (coordinate.environmentId === undefined) {
    return null;
  }
  if (token.environmentId === undefined || token.environmentId !== coordinate.environmentId) {
    return "wrong_environment";
  }
  return null;
}

function runtimePolicyBindingFailure(
  token: VerifiedMachineAccessToken,
  runtimePolicyKeyId: RuntimePolicyId | undefined,
): MachineAccessTokenDenialKind | null {
  if (runtimePolicyKeyId === undefined) {
    return null;
  }
  if (token.runtimePolicyKeyId === undefined || token.runtimePolicyKeyId !== runtimePolicyKeyId) {
    return "wrong_runtime_policy";
  }
  return null;
}

function coordinateBindingFailure(
  token: VerifiedMachineAccessToken,
  coordinate: ResourceCoordinate,
  runtimePolicyKeyId: RuntimePolicyId | undefined,
): MachineAccessTokenDenialKind | null {
  if (token.organizationId !== coordinate.organizationId) {
    return "wrong_organization";
  }
  if (coordinate.projectId !== undefined && token.projectId !== coordinate.projectId) {
    return "wrong_project";
  }
  return (
    environmentBindingFailure(token, coordinate) ??
    runtimePolicyBindingFailure(token, runtimePolicyKeyId)
  );
}

/**
 * Verifies a machine access token and enforces coordinate binding plus optional Credential Scope
 * requirements. Trusted source matching happens at auth-method exchange time; this gate covers
 * token lifetime, signature, and request-bound scope enforcement.
 */
export async function enforceMachineAccessToken(
  input: EnforceMachineAccessTokenInput,
): Promise<EnforceMachineAccessTokenResult> {
  const verified = await verifyMachineAccessToken(input.accessToken, input.signingSecret);
  if (!verified.ok) {
    const denialKind = verified.reason === "expired" ? "expired" : "invalid";
    await recordMachineAccessTokenAuditDenied(input, denialKind);
    return enforceFailure(denialKind);
  }

  const bindingFailure = coordinateBindingFailure(
    verified.token,
    input.coordinate,
    input.runtimePolicyKeyId,
  );
  if (bindingFailure !== null) {
    await recordMachineAccessTokenAuditDenied(input, bindingFailure, verified.token);
    return enforceFailure(bindingFailure);
  }

  if (
    input.requiredCredentialScopes !== undefined &&
    !credentialScopesSatisfy(verified.token.credentialScopes, input.requiredCredentialScopes)
  ) {
    await recordMachineAccessTokenAuditDenied(
      input,
      "insufficient_credential_scope",
      verified.token,
      input.requiredCredentialScopes[0],
    );
    return enforceFailure("insufficient_credential_scope");
  }

  await recordMachineAccessTokenAuditUsed(input, verified.token);

  return {
    ok: true,
    token: verified.token,
    actor: machineActorFromVerifiedMachineAccessToken(verified.token),
  };
}

async function recordMachineAccessTokenAuditDenied(
  input: EnforceMachineAccessTokenInput,
  denialKind: MachineAccessTokenDenialKind,
  token?: VerifiedMachineAccessToken,
  requiredScopeAtom?: CredentialScope,
): Promise<void> {
  if (input.audit === undefined) {
    return;
  }

  await recordMachineAccessTokenDenied(
    buildMachineAccessTokenDeniedAuditInput(input, denialKind, token, requiredScopeAtom),
  );
}

function buildMachineAccessTokenDeniedAuditInput(
  input: EnforceMachineAccessTokenInput,
  denialKind: MachineAccessTokenDenialKind,
  token?: VerifiedMachineAccessToken,
  requiredScopeAtom?: CredentialScope,
) {
  const audit = input.audit;
  if (audit === undefined) {
    throw new Error("machine access token audit context is required");
  }

  const details =
    requiredScopeAtom !== undefined
      ? { details: { requiredScopeAtom: authorizationScopeAuditAtom(requiredScopeAtom) } }
      : {};

  return {
    ...machineAuthExchangeTenantScope({
      ...input.coordinate,
      ...(token !== undefined ? { machineIdentityId: token.machineIdentityId } : {}),
      ...(audit.request !== undefined ? { request: audit.request } : {}),
    }),
    credentialMethod: audit.credentialMethod,
    ...(token !== undefined ? { credentialScopes: token.credentialScopes } : {}),
    denialKind,
    ...(audit.operation !== undefined ? { operation: audit.operation } : {}),
    ...details,
  };
}

async function recordMachineAccessTokenAuditUsed(
  input: EnforceMachineAccessTokenInput,
  token: VerifiedMachineAccessToken,
): Promise<void> {
  if (input.audit === undefined) {
    return;
  }

  await recordMachineAccessTokenUsed({
    organizationId: token.organizationId,
    projectId: token.projectId,
    ...(token.environmentId !== undefined ? { environmentId: token.environmentId } : {}),
    machineIdentityId: token.machineIdentityId,
    credentialMethod: input.audit.credentialMethod,
    credentialScopes: token.credentialScopes,
    ...(token.runtimePolicyKeyId !== undefined
      ? { runtimePolicyKeyId: token.runtimePolicyKeyId }
      : {}),
    ...(input.audit.request !== undefined ? { request: input.audit.request } : {}),
    ...(input.audit.operation !== undefined ? { operation: input.audit.operation } : {}),
  });
}
