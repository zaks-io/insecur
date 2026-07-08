import type { CredentialScope, MachineActorRef, ResourceCoordinate } from "@insecur/access";
import type { RuntimePolicyId } from "@insecur/domain";
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

export interface EnforceMachineAccessTokenInput {
  readonly accessToken: string;
  readonly signingSecret: string;
  readonly coordinate: ResourceCoordinate;
  readonly requiredCredentialScopes?: readonly CredentialScope[];
  readonly runtimePolicyKeyId?: RuntimePolicyId;
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
    return enforceFailure(verified.reason === "expired" ? "expired" : "invalid");
  }

  const bindingFailure = coordinateBindingFailure(
    verified.token,
    input.coordinate,
    input.runtimePolicyKeyId,
  );
  if (bindingFailure !== null) {
    return enforceFailure(bindingFailure);
  }

  if (
    input.requiredCredentialScopes !== undefined &&
    !credentialScopesSatisfy(verified.token.credentialScopes, input.requiredCredentialScopes)
  ) {
    return enforceFailure("insufficient_credential_scope");
  }

  return {
    ok: true,
    token: verified.token,
    actor: machineActorFromVerifiedMachineAccessToken(verified.token),
  };
}
