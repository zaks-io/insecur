import type {
  AppConnectionId,
  DisplayName,
  OrganizationId,
  ProviderCredentialId,
  UserId,
} from "@insecur/domain";
import { APP_CONNECTION_ERROR_CODES } from "@insecur/domain";
import { and, eq } from "drizzle-orm";

import { appConnections } from "../db/schema/tenant-integrations.js";
import { isUniqueConstraintViolation } from "../is-unique-constraint-violation.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";
import { AppConnectionStoreError } from "./errors.js";
import type {
  AppConnectionRow,
  AppConnectionStatus,
  CreateAppConnectionInput,
  ListAppConnectionsInput,
  UpdateAppConnectionStatusInput,
} from "./types.js";

function toAppConnectionRow(row: {
  id: string;
  org_id: string;
  provider: string;
  connection_method: string;
  display_name: string;
  status: string;
  setup_user_id: string;
  active_credential_id: string | null;
  status_reason_code: string | null;
  created_at: Date;
  updated_at: Date;
}): AppConnectionRow {
  return {
    id: row.id as AppConnectionId,
    organizationId: row.org_id as OrganizationId,
    provider: row.provider as AppConnectionRow["provider"],
    connectionMethod: row.connection_method as AppConnectionRow["connectionMethod"],
    displayName: row.display_name as DisplayName,
    status: row.status as AppConnectionStatus,
    setupUserId: row.setup_user_id as UserId,
    activeCredentialId: row.active_credential_id as ProviderCredentialId | null,
    statusReasonCode: row.status_reason_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const appConnectionSelect = {
  id: appConnections.id,
  org_id: appConnections.orgId,
  provider: appConnections.provider,
  connection_method: appConnections.connectionMethod,
  display_name: appConnections.displayName,
  status: appConnections.status,
  setup_user_id: appConnections.setupUserId,
  active_credential_id: appConnections.activeCredentialId,
  status_reason_code: appConnections.statusReasonCode,
  created_at: appConnections.createdAt,
  updated_at: appConnections.updatedAt,
} as const;

export class TenantAppConnectionStore {
  constructor(private readonly db: TenantScopedDb) {}

  async createConnection(input: CreateAppConnectionInput): Promise<AppConnectionRow> {
    try {
      await this.db.insert(appConnections).values({
        id: input.appConnectionId,
        orgId: input.organizationId,
        provider: input.provider,
        connectionMethod: input.connectionMethod,
        displayName: input.displayName,
        status: input.status ?? "pending_setup",
        setupUserId: input.setupUserId,
        activeCredentialId: input.activeCredentialId ?? null,
        statusReasonCode: input.statusReasonCode ?? null,
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new AppConnectionStoreError(APP_CONNECTION_ERROR_CODES.resourceConflict);
      }
      throw error;
    }

    const created = await this.getConnectionById(input.organizationId, input.appConnectionId);
    if (!created) {
      throw new AppConnectionStoreError("connection.not_found");
    }
    return created;
  }

  async getConnectionById(
    organizationId: OrganizationId,
    appConnectionIdValue: AppConnectionId,
  ): Promise<AppConnectionRow | null> {
    const rows = await this.db
      .select(appConnectionSelect)
      .from(appConnections)
      .where(
        and(eq(appConnections.orgId, organizationId), eq(appConnections.id, appConnectionIdValue)),
      )
      .limit(1);

    const row = rows[0];
    return row ? toAppConnectionRow(row) : null;
  }

  async listConnections(input: ListAppConnectionsInput): Promise<readonly AppConnectionRow[]> {
    const rows = await this.db
      .select(appConnectionSelect)
      .from(appConnections)
      .where(eq(appConnections.orgId, input.organizationId));

    return rows.map(toAppConnectionRow);
  }

  async updateConnectionStatus(input: UpdateAppConnectionStatusInput): Promise<AppConnectionRow> {
    const rows = await this.db
      .update(appConnections)
      .set({
        status: input.status,
        statusReasonCode: input.statusReasonCode ?? null,
        activeCredentialId: input.activeCredentialId ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(appConnections.orgId, input.organizationId),
          eq(appConnections.id, input.appConnectionId),
        ),
      )
      .returning(appConnectionSelect);

    const row = rows[0];
    if (!row) {
      throw new AppConnectionStoreError("connection.not_found");
    }
    return toAppConnectionRow(row);
  }
}
