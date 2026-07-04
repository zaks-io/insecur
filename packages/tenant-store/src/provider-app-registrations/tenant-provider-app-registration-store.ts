import type { ProviderAppRegistrationId } from "@insecur/domain";
import { and, eq } from "drizzle-orm";

import { providerAppRegistrations } from "../db/schema/instance-bootstrap.js";
import { isUniqueConstraintViolation } from "../is-unique-constraint-violation.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";
import { ProviderAppRegistrationStoreError } from "./errors.js";
import type {
  GetProviderAppRegistrationInput,
  ProviderAppRegistrationRow,
  ProviderAppRegistrationStatus,
  UpsertProviderAppRegistrationInput,
} from "./types.js";

function toProviderAppRegistrationRow(row: {
  id: string;
  instance_id: string;
  provider: string;
  connection_method: string;
  client_id: string;
  callback_path: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}): ProviderAppRegistrationRow {
  return {
    id: row.id as ProviderAppRegistrationId,
    instanceId: row.instance_id,
    provider: row.provider as ProviderAppRegistrationRow["provider"],
    connectionMethod: row.connection_method as ProviderAppRegistrationRow["connectionMethod"],
    clientId: row.client_id,
    callbackPath: row.callback_path,
    status: row.status as ProviderAppRegistrationStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const providerAppRegistrationSelect = {
  id: providerAppRegistrations.id,
  instance_id: providerAppRegistrations.instanceId,
  provider: providerAppRegistrations.provider,
  connection_method: providerAppRegistrations.connectionMethod,
  client_id: providerAppRegistrations.clientId,
  callback_path: providerAppRegistrations.callbackPath,
  status: providerAppRegistrations.status,
  created_at: providerAppRegistrations.createdAt,
  updated_at: providerAppRegistrations.updatedAt,
} as const;

export class TenantProviderAppRegistrationStore {
  constructor(private readonly db: TenantScopedDb) {}

  async upsertRegistration(
    input: UpsertProviderAppRegistrationInput,
  ): Promise<ProviderAppRegistrationRow> {
    try {
      await this.db
        .insert(providerAppRegistrations)
        .values({
          id: input.registrationId,
          instanceId: input.instanceId,
          provider: input.provider,
          connectionMethod: input.connectionMethod,
          clientId: input.clientId,
          callbackPath: input.callbackPath,
          status: input.status ?? "pending_setup",
        })
        .onConflictDoUpdate({
          target: [
            providerAppRegistrations.instanceId,
            providerAppRegistrations.provider,
            providerAppRegistrations.connectionMethod,
          ],
          set: {
            clientId: input.clientId,
            callbackPath: input.callbackPath,
            status: input.status ?? "pending_setup",
            updatedAt: new Date(),
          },
        });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ProviderAppRegistrationStoreError("provider_app_registration.already_exists");
      }
      throw error;
    }

    const registration = await this.getRegistration({
      instanceId: input.instanceId,
      provider: input.provider,
      connectionMethod: input.connectionMethod,
    });
    if (!registration) {
      throw new ProviderAppRegistrationStoreError("provider_app_registration.not_found");
    }
    return registration;
  }

  async getRegistration(
    input: GetProviderAppRegistrationInput,
  ): Promise<ProviderAppRegistrationRow | null> {
    const rows = await this.db
      .select(providerAppRegistrationSelect)
      .from(providerAppRegistrations)
      .where(
        and(
          eq(providerAppRegistrations.instanceId, input.instanceId),
          eq(providerAppRegistrations.provider, input.provider),
          eq(providerAppRegistrations.connectionMethod, input.connectionMethod),
        ),
      )
      .limit(1);

    const row = rows[0];
    return row ? toProviderAppRegistrationRow(row) : null;
  }

  async getRegistrationById(
    registrationId: ProviderAppRegistrationId,
  ): Promise<ProviderAppRegistrationRow | null> {
    const rows = await this.db
      .select(providerAppRegistrationSelect)
      .from(providerAppRegistrations)
      .where(eq(providerAppRegistrations.id, registrationId))
      .limit(1);

    const row = rows[0];
    return row ? toProviderAppRegistrationRow(row) : null;
  }
}
