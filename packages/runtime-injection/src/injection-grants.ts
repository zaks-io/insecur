import type { AuditActorRef, AuditOperationRef, AuditRequestRef } from "@insecur/audit";
import type { Keyring, PlaintextHandle } from "@insecur/crypto";
import type {
  InjectionGrantId,
  OrganizationId,
  SecretId,
  SecretVersionId,
  VariableKey,
} from "@insecur/domain";

import { consumeInjectionGrantWithAudit } from "./consume-injection-grant.js";
import { consumeInjectionGrantAllWithAudit } from "./consume-injection-grant-all.js";
import { normalizeConsumeSelector } from "./injection-grant-selectors.js";

export {
  type IssueInjectionGrantInput,
  type IssueInjectionGrantResult,
  issueInjectionGrant,
} from "@insecur/runtime-injection-issue";

export {
  type RecordInjectionRunCompletedInput,
  type RecordInjectionRunCompletedResult,
  recordInjectionRunCompleted,
} from "./record-injection-run-completed.js";

export interface ConsumeInjectionGrantInput {
  keyring: Keyring;
  organizationId: OrganizationId;
  grantId: InjectionGrantId;
  /** Deliver by exact Variable Key when the grant was issued for that binding. */
  variableKey?: VariableKey;
  /** Deliver by exact Secret ID when the grant was issued for that binding. */
  secretId?: SecretId;
  actor: AuditActorRef;
  request?: AuditRequestRef;
  operation?: AuditOperationRef;
}

/**
 * One-time grant consume returns env entries for the child process only.
 * Values must not be logged or returned in metadata-only CLI/API envelopes.
 */
export interface ConsumeInjectionGrantResult {
  secretId: SecretId;
  secretVersionId: SecretVersionId;
  variableKey: VariableKey;
  /** Process-environment delivery only; never serialize to metadata envelopes. */
  valueUtf8: PlaintextHandle;
  auditEventId?: string;
}

export interface ConsumeInjectionGrantAllInput {
  keyring: Keyring;
  organizationId: OrganizationId;
  grantId: InjectionGrantId;
  actor: AuditActorRef;
  request?: AuditRequestRef;
  operation?: AuditOperationRef;
}

export interface ConsumeInjectionGrantAllResult {
  entries: readonly {
    secretId: SecretId;
    secretVersionId: SecretVersionId;
    variableKey: VariableKey;
    valueUtf8: PlaintextHandle;
  }[];
  auditEventId?: string;
}

/**
 * Consumes a one-use policy-backed Injection Grant and returns all bound values for runtime delivery.
 */
export function consumeInjectionGrantAll(
  input: ConsumeInjectionGrantAllInput,
): Promise<ConsumeInjectionGrantAllResult> {
  return consumeInjectionGrantAllWithAudit({
    keyring: input.keyring,
    organizationId: input.organizationId,
    grantId: input.grantId,
    actor: input.actor,
    ...(input.request !== undefined ? { request: input.request } : {}),
    ...(input.operation !== undefined ? { operation: input.operation } : {}),
  });
}

/**
 * Consumes a one-use Injection Grant and returns the bound Secret Version value for runtime delivery only.
 */
export function consumeInjectionGrant(
  input: ConsumeInjectionGrantInput,
): Promise<ConsumeInjectionGrantResult> {
  return consumeInjectionGrantWithAudit({
    keyring: input.keyring,
    organizationId: input.organizationId,
    grantId: input.grantId,
    selector: normalizeConsumeSelector({
      ...(input.variableKey !== undefined ? { variableKey: input.variableKey } : {}),
      ...(input.secretId !== undefined ? { secretId: input.secretId } : {}),
    }),
    actor: input.actor,
    ...(input.request !== undefined ? { request: input.request } : {}),
    ...(input.operation !== undefined ? { operation: input.operation } : {}),
  });
}
