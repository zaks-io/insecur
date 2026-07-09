import { withServiceRoleSql } from "./audit-verification-db.js";

/**
 * Preview smoke High-Assurance Challenge harness (INS-508).
 *
 * No smoke-reachable HTTP route can mint a real pending challenge: `POST
 * /v1/orgs/:organizationId/projects/:projectId/environments` (the only public environment-create
 * route) always creates a non-protected `development` environment, and a Protected Environment is
 * the sole condition that fails `gateProtectedRuntimeInjectionPolicyChange` closed. Mirroring the
 * INS-358 operation-poll harness precedent, this seeds a tenant-qualified `operations` row via
 * service-role SQL carrying real `progress.highAssuranceChallenge` evidence so the shipped review
 * routes (list / evidence-get / deny) run against the actual Runtime query and access-scope paths
 * on live preview. The clear (step-up) path stays out of reach here on purpose: WorkOS browser MFA
 * cannot run headless, so it is annotated, not seeded or faked.
 */
const SMOKE_HIGH_ASSURANCE_INTENT_CODE = "runtime_injection_policy.change" as const;

const SMOKE_HIGH_ASSURANCE_OPERATION_STATE = "waiting_for_human" as const;

/** Mirrors `HIGH_ASSURANCE_RISK_REASON_CODES.protectedRuntimeInjectionPolicy` (`@insecur/high-assurance`). */
const SMOKE_HIGH_ASSURANCE_RISK_REASON_CODE =
  "high_assurance.risk.protected_runtime_injection_policy" as const;

export interface SeedSmokeHighAssuranceChallengeInput {
  /** Must satisfy `isMetadataSafeOpaqueTokenString` (1-256 char opaque token). */
  readonly challengeId: string;
  readonly databaseUrl: string;
  /** Must be a real `env_`-prefixed environment ID (validated by `assertHighAssuranceChallengeEvidence`). */
  readonly environmentId: string;
  readonly operationId: string;
  readonly organizationId: string;
  /** Must be a real `prj_`-prefixed project ID (validated by `assertHighAssuranceChallengeEvidence`). */
  readonly projectId: string;
  /** Must start with `aud_`; re-validated on every progress rewrite, including deny. */
  readonly requestAuditEventId: string;
  /** Must be a real `usr_`-prefixed user ID (validated by `assertHighAssuranceChallengeEvidence`). */
  readonly requestingUserId: string;
}

function futureIsoTimestamp(minutesFromNow: number): string {
  return new Date(Date.now() + minutesFromNow * 60_000).toISOString();
}

/**
 * Smoke-only mint: inserts a metadata-safe `operations` row in `waiting_for_human` state with
 * pending High-Assurance Challenge evidence, so the list/get/deny routes have a real row to serve.
 * `requestAuditEventId` is a fabricated opaque id (the `operations` table carries no foreign key to
 * `audit_events`); it is never dereferenced by the routes under test.
 */
export async function seedSmokeHighAssuranceChallenge(
  input: SeedSmokeHighAssuranceChallengeInput,
): Promise<void> {
  const requestedAt = futureIsoTimestamp(0);
  const expiresAt = futureIsoTimestamp(30);

  const progress = {
    highAssuranceChallenge: {
      challengeId: input.challengeId,
      riskReasonCode: SMOKE_HIGH_ASSURANCE_RISK_REASON_CODE,
      projectId: input.projectId,
      environmentId: input.environmentId,
      requestingUserId: input.requestingUserId,
      requestedAt,
      expiresAt,
      requestAuditEventId: input.requestAuditEventId,
    },
  };

  await withServiceRoleSql(input.databaseUrl, async (sql) => {
    await sql`
      INSERT INTO operations (
        id,
        org_id,
        state,
        intent_code,
        progress
      )
      VALUES (
        ${input.operationId},
        ${input.organizationId},
        ${SMOKE_HIGH_ASSURANCE_OPERATION_STATE},
        ${SMOKE_HIGH_ASSURANCE_INTENT_CODE},
        ${sql.json(progress)}
      )
    `;
  });
}
