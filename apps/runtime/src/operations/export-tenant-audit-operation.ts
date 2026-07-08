import { AUTHORIZATION_SCOPES, authorizeScopeOrThrow, type ActorRef } from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";
import { exportTenantAuditEvents, type AuditExportBundle } from "@insecur/audit";
import type { ExportTenantAuditRpcInput } from "@insecur/worker-kit";
import type { RuntimeEnv } from "../env.js";
import { resolveAuditExportKeyProviders } from "../crypto/audit-export-key-providers.js";

export interface ExportTenantAuditOperationInput {
  readonly env: RuntimeEnv;
  readonly input: ExportTenantAuditRpcInput;
  readonly auditActor: AuditActorRef;
  readonly accessActor: ActorRef;
}

/**
 * Authorize-then-export for org audit trails (INS-440): `metadata:detail_read` at the org coordinate
 * gates the export; signing runs Runtime-side with custody-held export keys (ADR-0045/0028).
 */
export async function exportTenantAuditOperation({
  env,
  input,
  auditActor,
  accessActor,
}: ExportTenantAuditOperationInput): Promise<AuditExportBundle> {
  await authorizeScopeOrThrow({
    actor: accessActor,
    auditActor,
    coordinate: { organizationId: input.organizationId },
    requiredScope: AUTHORIZATION_SCOPES.metadataDetailRead,
    requestId: input.requestId,
  });

  const { hmacKey, signingKey } = await resolveAuditExportKeyProviders(env);

  return exportTenantAuditEvents({
    organizationId: input.organizationId,
    timeRange: {
      from: input.from,
      to: input.to,
    },
    hmacKey,
    signingKey,
  });
}
