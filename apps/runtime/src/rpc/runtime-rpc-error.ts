import {
  STORE_ERROR_CODES,
  VALIDATION_ERROR_CODES,
  resolveKnownErrorCode,
  type KnownErrorCode,
} from "@insecur/domain";
import { InjectionGrantError, RuntimeInjectionPolicyError } from "@insecur/runtime-injection";
import { SecretWriteError } from "@insecur/secret-store";
import {
  RuntimeConfigMissingError,
  isConnectionAcquisitionFailure,
  isTransientConnectionError,
} from "@insecur/tenant-store";
import { RootKeyNotConfiguredError } from "@insecur/crypto";
import { GuidedOrganizationProvisionError, MembershipManagementError } from "@insecur/onboarding";
import { OperationStoreError } from "@insecur/operations";
import { BootstrapError } from "@insecur/instance-bootstrap";
import { HighAssuranceChallengeError, HighAssuranceHandoffError } from "@insecur/high-assurance";
import type { RuntimeRpcError } from "@insecur/worker-kit";
import { RuntimeTokenSigningSecretConfigError, safePublicErrorMessage } from "@insecur/worker-kit";
import { AuditExportKeysNotConfiguredError } from "../crypto/audit-export-keys-not-configured-error.js";
import { AuditExportEntryLimitExceededError } from "@insecur/audit";

const RUNTIME_RPC_GENERIC_MESSAGE = "runtime request failed" as const;

function runtimeRpcMessage(error: unknown, code: KnownErrorCode): string {
  return safePublicErrorMessage(error, code, { genericMessage: RUNTIME_RPC_GENERIC_MESSAGE });
}

/** Raised when the forwarded scoped hop token fails verification (ADR-0077). */
export class RuntimeActorTokenError extends Error {
  readonly code: KnownErrorCode;
  readonly retryable = false;

  constructor(code: KnownErrorCode, message: string) {
    super(message);
    this.name = "RuntimeActorTokenError";
    this.code = code;
  }
}

/**
 * Map a thrown error into the RPC error wire shape. Custom error properties do not survive the RPC
 * boundary, so the Runtime resolves `code`/`retryable` here and returns them as data, not as a
 * thrown class. A missing root key is an internal misconfiguration (the binding should always be
 * present on this deploy) so it maps to a non-retryable validation failure rather than leaking
 * crypto internals.
 */
type DomainError =
  | InjectionGrantError
  | SecretWriteError
  | RuntimeConfigMissingError
  | RuntimeActorTokenError
  | RuntimeTokenSigningSecretConfigError
  | GuidedOrganizationProvisionError
  | MembershipManagementError
  | OperationStoreError
  | BootstrapError
  | HighAssuranceChallengeError
  | HighAssuranceHandoffError
  | RuntimeInjectionPolicyError;

const DOMAIN_ERROR_TYPES = [
  InjectionGrantError,
  RuntimeInjectionPolicyError,
  SecretWriteError,
  RuntimeConfigMissingError,
  RuntimeActorTokenError,
  RuntimeTokenSigningSecretConfigError,
  GuidedOrganizationProvisionError,
  MembershipManagementError,
  OperationStoreError,
  BootstrapError,
  HighAssuranceChallengeError,
  HighAssuranceHandoffError,
] as const;

function isDomainError(error: unknown): error is DomainError {
  return DOMAIN_ERROR_TYPES.some((ErrorType) => error instanceof ErrorType);
}

/** Runtime misconfiguration classes that hide behind fixed non-retryable messages. */
function misconfigurationRpcError(error: unknown): RuntimeRpcError | undefined {
  if (error instanceof RootKeyNotConfiguredError) {
    return {
      code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
      message: "runtime key material is unavailable",
      retryable: false,
    };
  }
  if (error instanceof AuditExportKeysNotConfiguredError) {
    return {
      code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
      message: "runtime audit export keys are unavailable",
      retryable: false,
    };
  }
  if (error instanceof AuditExportEntryLimitExceededError) {
    return {
      code: error.code,
      message: error.message,
      retryable: false,
    };
  }
  return undefined;
}

export function toRuntimeRpcError(error: unknown): RuntimeRpcError {
  if (error instanceof HighAssuranceHandoffError) {
    return {
      code: error.code,
      message: runtimeRpcMessage(error, error.code),
      retryable: error.retryable,
      operationId: error.operationId,
    };
  }
  if (isDomainError(error)) {
    // Not every domain error class carries `retryable`; those without it are non-retryable.
    const retryable = "retryable" in error && typeof error.retryable === "boolean";
    return {
      code: error.code,
      message: runtimeRpcMessage(error, error.code),
      retryable: retryable ? error.retryable : false,
    };
  }
  const misconfiguration = misconfigurationRpcError(error);
  if (misconfiguration !== undefined) {
    return misconfiguration;
  }
  // A transient connection-layer failure (Hyperdrive pool exhaustion surfaces SQLSTATE 58000,
  // server shutdown, connection loss) must not leak the raw SQLSTATE as the public error code
  // (INS-603). This must run before the structural `{ code }` fallback, which would otherwise
  // forward the SQLSTATE verbatim. Retryable only when the failure happened at connection
  // acquisition, before any statement ran: a mid-flight loss (CONNECTION_CLOSED, 08006, ...) can
  // follow a COMMIT whose ack was lost, and blind writes carry no idempotency key, so a client
  // honoring `retryable: true` there could double-apply the write — the same reason 08007 stays
  // non-retryable.
  if (isTransientConnectionError(error)) {
    return {
      code: STORE_ERROR_CODES.unavailable,
      message: runtimeRpcMessage(error, STORE_ERROR_CODES.unavailable),
      retryable: isConnectionAcquisitionFailure(error),
    };
  }
  // resolveKnownErrorCode preserves a structural `{ code }` (e.g. the insufficient-scope denial
  // authorizeScopeOrThrow throws) and otherwise falls back to the shared cross-seam default, so an
  // unknown error resolves to the same code here and at the public edge.
  const code = resolveKnownErrorCode(error);
  return {
    code,
    message: runtimeRpcMessage(error, code),
    retryable: false,
  };
}
