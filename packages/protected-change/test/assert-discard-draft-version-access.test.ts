import { AUTHORIZATION_SCOPES, type ActorRef, type EffectiveAccessResult } from "@insecur/access";
import {
  environmentId,
  machineIdentityId,
  organizationId,
  projectId,
  userId,
} from "@insecur/domain";
import type { SecretVersionCreatorActor } from "@insecur/tenant-store";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@insecur/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/access")>();
  return { ...actual, resolveEffectiveAccess: vi.fn() };
});

import { resolveEffectiveAccess } from "@insecur/access";

import { assertDiscardDraftVersionAccess } from "../src/assert-discard-draft-version-access.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");

const CREATOR_USER = userId.brand("usr_00000000000000000000000001");
const OTHER_USER = userId.brand("usr_00000000000000000000000002");
const OWNER_USER = userId.brand("usr_00000000000000000000000003");

const SCOPE = { organizationId: ORG, projectId: PROJECT, environmentId: ENV };
const CREATOR: SecretVersionCreatorActor = { type: "user", userId: CREATOR_USER };

function effectiveAccess(scopes: readonly string[]): EffectiveAccessResult {
  return { organizationId: ORG, scopes };
}

const DEVELOPER_SCOPES = [
  AUTHORIZATION_SCOPES.secretProtectedDraftWrite,
  AUTHORIZATION_SCOPES.secretNonProtectedWrite,
];
const OWNER_ADMIN_SCOPES = [
  AUTHORIZATION_SCOPES.secretProtectedDraftWrite,
  AUTHORIZATION_SCOPES.projectConfigure,
  AUTHORIZATION_SCOPES.membershipManage,
];

function actorUser(id: typeof CREATOR_USER): ActorRef {
  return { type: "user", userId: id };
}

describe("assertDiscardDraftVersionAccess (ADR-0017 §27)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("denies a non-creator, non-owner/admin developer (stable forbidden error, not a crash)", async () => {
    vi.mocked(resolveEffectiveAccess).mockResolvedValue(effectiveAccess(DEVELOPER_SCOPES));

    await expect(
      assertDiscardDraftVersionAccess(actorUser(OTHER_USER), SCOPE, CREATOR),
    ).rejects.toMatchObject({ code: "auth.insufficient_scope" });
  });

  it("allows the draft creator with draft-write scope", async () => {
    vi.mocked(resolveEffectiveAccess).mockResolvedValue(effectiveAccess(DEVELOPER_SCOPES));

    await expect(
      assertDiscardDraftVersionAccess(actorUser(CREATOR_USER), SCOPE, CREATOR),
    ).resolves.toBeUndefined();
  });

  it("allows an owner/admin cleanup actor who is not the creator", async () => {
    vi.mocked(resolveEffectiveAccess).mockResolvedValue(effectiveAccess(OWNER_ADMIN_SCOPES));

    await expect(
      assertDiscardDraftVersionAccess(actorUser(OWNER_USER), SCOPE, CREATOR),
    ).resolves.toBeUndefined();
  });

  it("fails closed for a creator-less draft unless the actor is owner/admin", async () => {
    vi.mocked(resolveEffectiveAccess).mockResolvedValue(effectiveAccess(DEVELOPER_SCOPES));
    await expect(
      assertDiscardDraftVersionAccess(actorUser(CREATOR_USER), SCOPE, null),
    ).rejects.toMatchObject({ code: "auth.insufficient_scope" });

    vi.mocked(resolveEffectiveAccess).mockResolvedValue(effectiveAccess(OWNER_ADMIN_SCOPES));
    await expect(
      assertDiscardDraftVersionAccess(actorUser(OWNER_USER), SCOPE, null),
    ).resolves.toBeUndefined();
  });

  it("does not treat a machine creator as matching a user actor of the same id string", async () => {
    vi.mocked(resolveEffectiveAccess).mockResolvedValue(effectiveAccess(DEVELOPER_SCOPES));
    const machineCreator: SecretVersionCreatorActor = {
      type: "machine",
      machineIdentityId: machineIdentityId.brand("mach_00000000000000000000000001"),
    };

    await expect(
      assertDiscardDraftVersionAccess(actorUser(CREATOR_USER), SCOPE, machineCreator),
    ).rejects.toMatchObject({ code: "auth.insufficient_scope" });
  });
});
