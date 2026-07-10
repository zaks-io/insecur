import { invitationId, organizationId, userId, type InvitationId } from "@insecur/domain";
import { closeRuntimeSql, withTenantScope } from "@insecur/tenant-store";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  insertPendingInvitationInTransaction,
  loadDefaultTeamId,
} from "../src/invitation-store.js";
import { listPendingInvitations } from "../src/list-pending-invitations.js";
import { integrationDatabaseReady } from "../../tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";
import {
  TEST_NO_SCOPE_USER_ID,
  TEST_ORG_A_ID,
  TEST_ORG_B_ID,
} from "../../tenant-store/test/rls/test-ids.js";

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

const ORG_A = organizationId.brand(TEST_ORG_A_ID);
const ORG_B = organizationId.brand(TEST_ORG_B_ID);
const INVITEE = userId.brand(TEST_NO_SCOPE_USER_ID);

// Per-run ids so concurrent cross-package suites on the shared local Postgres never collide.
const pendingId: InvitationId = invitationId.generate();
const revokedId: InvitationId = invitationId.generate();

async function deleteSuiteInvitations(): Promise<void> {
  // Also clears orphans a crashed earlier run left behind: only one PENDING invitation may exist
  // per (invitee, org, project), so a leftover pending row would break the next run's inserts.
  await withTenantScope({ kind: "organization", organizationId: ORG_A }, async ({ sql }) => {
    await sql`DELETE FROM invitations WHERE org_id = ${ORG_A} AND invitee_user_id = ${INVITEE}`;
  });
}

describeIntegration("listPendingInvitations", () => {
  beforeAll(async () => {
    await seedTenantBaseline();
    await deleteSuiteInvitations();
    const teamId = await loadDefaultTeamId(ORG_A);
    // Sequential insert -> revoke -> insert: two live pending rows for one invitee would violate
    // the one-pending-per-invitee-org-project unique index.
    await withTenantScope({ kind: "organization", organizationId: ORG_A }, async ({ sql }) => {
      await insertPendingInvitationInTransaction(sql, {
        invitationId: revokedId,
        organizationId: ORG_A,
        teamId,
        inviteeUserId: INVITEE,
        rolePreset: "read-only",
        projectId: null,
      });
    });
    await withTenantScope({ kind: "organization", organizationId: ORG_A }, async ({ sql }) => {
      await sql`UPDATE invitations SET status = ${"revoked"} WHERE id = ${revokedId}`;
    });
    await withTenantScope({ kind: "organization", organizationId: ORG_A }, async ({ sql }) => {
      await insertPendingInvitationInTransaction(sql, {
        invitationId: pendingId,
        organizationId: ORG_A,
        teamId,
        inviteeUserId: INVITEE,
        rolePreset: "developer",
        projectId: null,
      });
    });
  });

  afterAll(async () => {
    await deleteSuiteInvitations();
    await closeRuntimeSql();
  });

  it("lists pending invitations with the invitee's admission display name", async () => {
    const invitations = await listPendingInvitations(ORG_A);

    const row = invitations.find((invitation) => invitation.invitationId === pendingId);
    expect(row).toBeDefined();
    expect(row?.inviteeUserId).toBe(INVITEE);
    expect(row?.inviteeDisplayName).toBe("Synthetic no-scope user");
    expect(row?.rolePreset).toBe("developer");
    expect(row?.status).toBe("pending");
    expect(row?.projectId).toBeNull();
    expect(row?.createdAt).toBeInstanceOf(Date);
  });

  it("exposes identifiers, role bundle, status, and timestamp only — no acceptance material", async () => {
    const invitations = await listPendingInvitations(ORG_A);
    const row = invitations.find((invitation) => invitation.invitationId === pendingId);

    expect(Object.keys(row ?? {}).sort()).toEqual([
      "createdAt",
      "invitationId",
      "inviteeDisplayName",
      "inviteeUserId",
      "organizationId",
      "projectId",
      "rolePreset",
      "status",
    ]);
  });

  it("excludes non-pending invitations", async () => {
    const invitations = await listPendingInvitations(ORG_A);

    expect(invitations.map((invitation) => invitation.invitationId)).not.toContain(revokedId);
  });

  it("keeps the read tenant-bound under forced RLS: org B never sees org A invitations", async () => {
    const invitations = await listPendingInvitations(ORG_B);

    expect(invitations.map((invitation) => invitation.invitationId)).not.toContain(pendingId);
    expect(invitations.every((invitation) => invitation.organizationId === TEST_ORG_B_ID)).toBe(
      true,
    );
  });
});
