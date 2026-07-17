import {
  AUTHORIZATION_SCOPES,
  authorizeScopeOrThrow,
  type ActorRef,
  type AuthorizeScopeDeps,
  type UserActorRef,
} from "@insecur/access";
import { toAuditActor } from "@insecur/protected-change";
import {
  AUTH_ERROR_CODES,
  DELIVERY_POLICY_ERROR_CODES,
  isKnownErrorCodeInCatalog,
  parseOpaqueResourceId,
  readErrorCode,
  type EnvironmentId,
  type KnownErrorCode,
  type OpaqueResourceId,
  type OpaqueResourceIdPrefix,
  type OrganizationId,
  type ProjectId,
  type RequestId,
} from "@insecur/domain";

import { DeliveryPolicyError } from "./delivery-policy-error.js";
import {
  recordDeliveryPolicyAudit,
  type RecordDeliveryPolicyAuditInput,
} from "./record-delivery-policy-audit.js";

/**
 * Delivery Risk Policy configuration is never completed solely through an agent-reachable
 * channel in V1 (ADR-0043): machine actors and malformed actor inputs fail closed.
 */
export function requireUserActor(actor: ActorRef | undefined): UserActorRef {
  if (actor?.type !== "user") {
    throw new DeliveryPolicyError(
      DELIVERY_POLICY_ERROR_CODES.actorInvalid,
      "delivery risk policy configuration requires an authenticated human actor",
    );
  }
  return actor;
}

export interface DeliveryPolicyEnvironmentCoordinate {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly requestId: RequestId;
  readonly deps?: AuthorizeScopeDeps;
}

/** Requires `delivery_policy:manage` Effective Access at the exact Environment coordinate. */
export async function authorizeDeliveryPolicyManageAtEnvironment(
  scope: DeliveryPolicyEnvironmentCoordinate,
  actor: UserActorRef,
): Promise<void> {
  await authorizeScopeOrThrow({
    actor,
    auditActor: toAuditActor(actor),
    coordinate: {
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      environmentId: scope.environmentId,
    },
    requiredScope: AUTHORIZATION_SCOPES.deliveryPolicyManage,
    requestId: scope.requestId,
    ...(scope.deps === undefined ? {} : { deps: scope.deps }),
  });
}

/** Step-up handoff for a Risk-Broadening Delivery Change attempted without evidence (ADR-0043). */
export function highAssuranceRequiredError(): Error & {
  code: typeof AUTH_ERROR_CODES.highAssuranceRequired;
} {
  return Object.assign(
    new Error("risk-broadening delivery policy change requires a High-Assurance Challenge"),
    { code: AUTH_ERROR_CODES.highAssuranceRequired },
  );
}

/** Rebrands a store-issued id for the audit resource ref; ids are generated, so this cannot fail. */
export function toOpaqueResourceId(
  value: string,
  expectedPrefix: OpaqueResourceIdPrefix,
): OpaqueResourceId {
  const parsed = parseOpaqueResourceId(value, expectedPrefix);
  if (!parsed.ok) {
    throw new Error(parsed.code);
  }
  return parsed.value;
}

/** Stable denial reason for the denied audit; unknown shapes stay unset rather than guessed. */
function deliveryPolicyDenialReasonCode(error: unknown): KnownErrorCode | undefined {
  if (error instanceof DeliveryPolicyError) {
    return error.code;
  }
  const code = readErrorCode(error);
  return code !== undefined && isKnownErrorCodeInCatalog(code) ? code : undefined;
}

/**
 * Records the denied audit without masking the original denial: audit availability must never
 * change a fail-closed enforcement result.
 */
export async function recordDeniedDeliveryPolicyAudit(
  input: Omit<RecordDeliveryPolicyAuditInput, "outcome" | "reasonCode">,
  error: unknown,
): Promise<void> {
  const reasonCode = deliveryPolicyDenialReasonCode(error);
  try {
    await recordDeliveryPolicyAudit({
      ...input,
      outcome: "denied",
      ...(reasonCode === undefined ? {} : { reasonCode }),
    });
  } catch {
    // Preserve the fail-closed denial; the thrown error is the enforcement result.
  }
}
