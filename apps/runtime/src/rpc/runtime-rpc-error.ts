import { AUTH_ERROR_CODES, VALIDATION_ERROR_CODES, type KnownErrorCode } from "@insecur/domain";
import { InjectionGrantError } from "@insecur/runtime-injection";
import { SecretWriteError } from "@insecur/secret-store";
import { RuntimeConfigMissingError } from "@insecur/tenant-store";
import { RootKeyNotConfiguredError } from "@insecur/crypto";
import { GuidedOrganizationProvisionError, MembershipManagementError } from "@insecur/onboarding";
import { OperationStoreError } from "@insecur/operations";
import { BootstrapError } from "@insecur/instance-bootstrap";
import type { RuntimeRpcError } from "@insecur/worker-kit";

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
  | GuidedOrganizationProvisionError
  | MembershipManagementError
  | OperationStoreError
  | BootstrapError;

function isDomainError(error: unknown): error is DomainError {
  return (
    error instanceof InjectionGrantError ||
    error instanceof SecretWriteError ||
    error instanceof RuntimeConfigMissingError ||
    error instanceof RuntimeActorTokenError ||
    error instanceof GuidedOrganizationProvisionError ||
    error instanceof MembershipManagementError ||
    error instanceof OperationStoreError ||
    error instanceof BootstrapError
  );
}

export function toRuntimeRpcError(error: unknown): RuntimeRpcError {
  if (isDomainError(error)) {
    // Not every domain error class carries `retryable`; those without it are non-retryable.
    const retryable = "retryable" in error && typeof error.retryable === "boolean";
    return {
      code: error.code,
      message: error.message,
      retryable: retryable ? error.retryable : false,
    };
  }
  if (error instanceof RootKeyNotConfiguredError) {
    return {
      code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
      message: "runtime key material is unavailable",
      retryable: false,
    };
  }
  const message = error instanceof Error ? error.message : "runtime request failed";
  const structuredCode = readStructuredErrorCode(error);
  return { code: structuredCode ?? AUTH_ERROR_CODES.invalid, message, retryable: false };
}

/**
 * Read a `{ code }` own-property off a non-class error - the shape `authorizeScopeOrThrow` throws
 * for an insufficient-scope denial. Preserving the code keeps the authorization verdict honest
 * across the seam instead of collapsing it to a generic auth failure.
 */
function readStructuredErrorCode(error: unknown): KnownErrorCode | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const { code } = error;
    if (typeof code === "string") {
      return code;
    }
  }
  return undefined;
}
