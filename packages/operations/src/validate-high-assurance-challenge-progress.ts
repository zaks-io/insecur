import {
  isMetadataSafeOpaqueTokenString,
  type AuditEventId,
  type EnvironmentId,
  type MachineIdentityId,
  type ProjectId,
  type UserId,
} from "@insecur/domain";
import { OPERATION_ERROR_CODES, OperationStoreError } from "./operation-errors.js";
import { assertIsoTimestamp, assertKnownErrorCode } from "./metadata-assertions.js";
import type { OperationHighAssuranceChallengeEvidence } from "./operation-types.js";

function assertAuditEventId(id: AuditEventId, field: string): void {
  if (typeof id !== "string" || !id.startsWith("aud_")) {
    throw new OperationStoreError(
      OPERATION_ERROR_CODES.invalidMetadata,
      `${field} must be an audit event opaque ID`,
    );
  }
}

function assertUserId(value: UserId, field: string): void {
  if (typeof value !== "string" || !value.startsWith("usr_")) {
    throw new OperationStoreError(
      OPERATION_ERROR_CODES.invalidMetadata,
      `${field} must be a user opaque ID`,
    );
  }
}

function assertProjectId(value: ProjectId, field: string): void {
  if (typeof value !== "string" || !value.startsWith("prj_")) {
    throw new OperationStoreError(
      OPERATION_ERROR_CODES.invalidMetadata,
      `${field} must be a project opaque ID`,
    );
  }
}

function assertEnvironmentId(value: EnvironmentId, field: string): void {
  if (typeof value !== "string" || !value.startsWith("env_")) {
    throw new OperationStoreError(
      OPERATION_ERROR_CODES.invalidMetadata,
      `${field} must be an environment opaque ID`,
    );
  }
}

function assertMachineIdentityId(value: MachineIdentityId, field: string): void {
  if (typeof value !== "string" || !value.startsWith("mach_")) {
    throw new OperationStoreError(
      OPERATION_ERROR_CODES.invalidMetadata,
      `${field} must be a machine identity opaque ID`,
    );
  }
}

function assertRequestingActor(evidence: OperationHighAssuranceChallengeEvidence): void {
  if (
    evidence.requestingUserId === undefined &&
    evidence.requestingMachineIdentityId === undefined
  ) {
    throw new OperationStoreError(
      OPERATION_ERROR_CODES.invalidMetadata,
      "highAssuranceChallenge requires requestingUserId or requestingMachineIdentityId",
    );
  }
}

function assertOptionalClearedFields(evidence: OperationHighAssuranceChallengeEvidence): void {
  if (evidence.clearedAt !== undefined) {
    assertIsoTimestamp(evidence.clearedAt, "highAssuranceChallenge.clearedAt");
  }
  if (evidence.clearingUserId !== undefined) {
    assertUserId(evidence.clearingUserId, "highAssuranceChallenge.clearingUserId");
  }
  if (evidence.clearAuthenticationMethodCode !== undefined) {
    assertKnownErrorCode(
      evidence.clearAuthenticationMethodCode,
      "highAssuranceChallenge.clearAuthenticationMethodCode",
    );
  }
  if (evidence.clearAuditEventId !== undefined) {
    assertAuditEventId(evidence.clearAuditEventId, "highAssuranceChallenge.clearAuditEventId");
  }
}

function assertOptionalConsumedFields(evidence: OperationHighAssuranceChallengeEvidence): void {
  if (evidence.consumedAt !== undefined) {
    assertIsoTimestamp(evidence.consumedAt, "highAssuranceChallenge.consumedAt");
  }
  if (evidence.consumeAuditEventId !== undefined) {
    assertAuditEventId(evidence.consumeAuditEventId, "highAssuranceChallenge.consumeAuditEventId");
  }
}

function assertOptionalDeniedFields(evidence: OperationHighAssuranceChallengeEvidence): void {
  if (evidence.denyingUserId !== undefined) {
    assertUserId(evidence.denyingUserId, "highAssuranceChallenge.denyingUserId");
  }
  if (evidence.denyAuditEventId !== undefined) {
    assertAuditEventId(evidence.denyAuditEventId, "highAssuranceChallenge.denyAuditEventId");
  }
}

function assertOptionalLifecycleFields(evidence: OperationHighAssuranceChallengeEvidence): void {
  assertOptionalClearedFields(evidence);
  assertOptionalConsumedFields(evidence);
  assertOptionalDeniedFields(evidence);
}

export function assertHighAssuranceChallengeEvidence(
  evidence: OperationHighAssuranceChallengeEvidence,
): void {
  if (!isMetadataSafeOpaqueTokenString(evidence.challengeId)) {
    throw new OperationStoreError(
      OPERATION_ERROR_CODES.invalidMetadata,
      "highAssuranceChallenge.challengeId must be a 1-256 character opaque token",
    );
  }
  assertKnownErrorCode(evidence.riskReasonCode, "highAssuranceChallenge.riskReasonCode");
  assertProjectId(evidence.projectId, "highAssuranceChallenge.projectId");
  if (evidence.environmentId !== undefined) {
    assertEnvironmentId(evidence.environmentId, "highAssuranceChallenge.environmentId");
  }
  if (evidence.requestingUserId !== undefined) {
    assertUserId(evidence.requestingUserId, "highAssuranceChallenge.requestingUserId");
  }
  if (evidence.requestingMachineIdentityId !== undefined) {
    assertMachineIdentityId(
      evidence.requestingMachineIdentityId,
      "highAssuranceChallenge.requestingMachineIdentityId",
    );
  }
  assertRequestingActor(evidence);
  assertIsoTimestamp(evidence.requestedAt, "highAssuranceChallenge.requestedAt");
  assertIsoTimestamp(evidence.expiresAt, "highAssuranceChallenge.expiresAt");
  assertAuditEventId(evidence.requestAuditEventId, "highAssuranceChallenge.requestAuditEventId");
  assertOptionalLifecycleFields(evidence);
}
