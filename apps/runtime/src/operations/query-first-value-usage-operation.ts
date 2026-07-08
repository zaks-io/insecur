import { AUTHORIZATION_SCOPES, authorizeScopeOrThrow, type ActorRef } from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";
import { queryFirstValueUsageEvidence } from "@insecur/audit";
import type {
  FirstValueUsageStatusRpcPayload,
  QueryFirstValueUsageRpcInput,
} from "@insecur/worker-kit";

export interface QueryFirstValueUsageOperationInput {
  readonly input: QueryFirstValueUsageRpcInput;
  readonly auditActor: AuditActorRef;
  readonly accessActor: ActorRef;
}

const ONBOARDING_USAGE_WINDOW = {
  startInclusive: new Date("2020-01-01T00:00:00.000Z"),
  endExclusive: new Date("2099-01-01T00:00:00.000Z"),
} as const;

/**
 * Org-scoped First Value usage read for the wizard handoff indicator (INS-379). Metadata only:
 * aggregates audit event counts and never returns Sensitive Values.
 */
export async function queryFirstValueUsageOperation({
  input,
  auditActor,
  accessActor,
}: QueryFirstValueUsageOperationInput): Promise<FirstValueUsageStatusRpcPayload> {
  await authorizeScopeOrThrow({
    actor: accessActor,
    auditActor,
    coordinate: { organizationId: input.organizationId },
    requiredScope: AUTHORIZATION_SCOPES.organizationRead,
    requestId: input.requestId,
  });

  const evidence = await queryFirstValueUsageEvidence(
    input.organizationId,
    ONBOARDING_USAGE_WINDOW,
  );

  return {
    secretWrites: evidence.counts.secretWrites,
    grantConsumed: evidence.counts.grantConsumed,
    runCompleted: evidence.counts.runCompleted,
    firstInjectionObserved: evidence.counts.grantConsumed >= 1,
  };
}
