import {
  machineIdentityId as brandMachineIdentityId,
  userId as brandUserId,
  type OrganizationId,
  type SecretId,
  type SecretVersionId,
} from "@insecur/domain";
import { and, eq } from "drizzle-orm";

import { secretVersions } from "../db/schema/tenant-secrets.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";
import type { SecretVersionCreatorActor } from "./types.js";

export interface GetDraftVersionCreatorInput {
  readonly organizationId: OrganizationId;
  readonly secretId: SecretId;
  readonly secretVersionId: SecretVersionId;
}

/**
 * Loads the creating actor stamped on a Secret Version (ADR-0017 §27 discard authorization source of
 * truth). Returns `null` when the version does not exist or has no recorded creator — callers must
 * fail closed (only owner/admin cleanup may discard a creator-less draft).
 */
export async function getDraftVersionCreator(
  db: TenantScopedDb,
  input: GetDraftVersionCreatorInput,
): Promise<SecretVersionCreatorActor | null> {
  const [row] = await db
    .select({
      createdByActorType: secretVersions.createdByActorType,
      createdByUserId: secretVersions.createdByUserId,
      createdByMachineIdentityId: secretVersions.createdByMachineIdentityId,
    })
    .from(secretVersions)
    .where(
      and(
        eq(secretVersions.orgId, input.organizationId),
        eq(secretVersions.secretId, input.secretId),
        eq(secretVersions.id, input.secretVersionId),
      ),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  if (row.createdByActorType === "user" && row.createdByUserId !== null) {
    return { type: "user", userId: brandUserId.brand(row.createdByUserId) };
  }

  if (row.createdByActorType === "machine" && row.createdByMachineIdentityId !== null) {
    return {
      type: "machine",
      machineIdentityId: brandMachineIdentityId.brand(row.createdByMachineIdentityId),
    };
  }

  return null;
}
