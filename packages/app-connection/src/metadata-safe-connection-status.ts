import type { AppConnectionId, OrganizationId } from "@insecur/domain";
import type { AppConnectionRow } from "@insecur/tenant-store";

export interface MetadataSafeAppConnectionStatus {
  readonly id: AppConnectionId;
  readonly organizationId: OrganizationId;
  readonly provider: AppConnectionRow["provider"];
  readonly connectionMethod: AppConnectionRow["connectionMethod"];
  readonly displayName: AppConnectionRow["displayName"];
  readonly status: AppConnectionRow["status"];
  readonly statusReasonCode: string | null;
  readonly hasActiveCredential: boolean;
  readonly setupUserId: AppConnectionRow["setupUserId"];
  readonly lastValidationCheckedAt: string | null;
  readonly lastValidationOutcome: AppConnectionRow["lastValidationOutcome"];
  readonly lastValidationReasonCode: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function toMetadataSafeAppConnectionStatus(
  connection: AppConnectionRow,
): MetadataSafeAppConnectionStatus {
  return {
    id: connection.id,
    organizationId: connection.organizationId,
    provider: connection.provider,
    connectionMethod: connection.connectionMethod,
    displayName: connection.displayName,
    status: connection.status,
    statusReasonCode: connection.statusReasonCode,
    hasActiveCredential: connection.activeCredentialId !== null,
    setupUserId: connection.setupUserId,
    lastValidationCheckedAt: connection.lastValidationCheckedAt?.toISOString() ?? null,
    lastValidationOutcome: connection.lastValidationOutcome,
    lastValidationReasonCode: connection.lastValidationReasonCode,
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
  };
}
