import { AUTHORIZATION_SCOPES, authorizeScopeOrThrow } from "@insecur/access";
import { AUTH_ERROR_CODES, organizationId, requestId, userId } from "@insecur/domain";
import { WEBHOOK_EVENT_CODES } from "@insecur/notifications";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listWebhookEventCodesOperation } from "./webhook-subscription-operations.js";

vi.mock("@insecur/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/access")>();
  return {
    ...actual,
    assertOrganizationMembership: vi.fn(),
    authorizeScopeOrThrow: vi.fn(),
  };
});

vi.mock("./metadata-operation-shared.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./metadata-operation-shared.js")>();
  return {
    ...actual,
    assertUserOrganizationMembership: vi.fn(),
  };
});

import { assertUserOrganizationMembership } from "./metadata-operation-shared.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const REQ = requestId.brand("req_00000000000000000000000001");

const auditActor = { type: "user" as const, userId: USER };
const accessActor = { type: "user" as const, userId: USER };

describe("listWebhookEventCodesOperation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assertUserOrganizationMembership).mockResolvedValue(undefined);
    vi.mocked(authorizeScopeOrThrow).mockResolvedValue(undefined);
  });

  it("requires webhook:read before listing event codes", async () => {
    const result = await listWebhookEventCodesOperation({
      env: {} as never,
      auditActor,
      accessActor,
      input: {
        organizationId: ORG,
        requestId: REQ,
        actorToken: "verified-by-rpc-entry",
      },
    });

    expect(authorizeScopeOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: accessActor,
        auditActor,
        coordinate: { organizationId: ORG },
        requiredScope: AUTHORIZATION_SCOPES.webhookRead,
        requestId: REQ,
      }),
    );
    expect(result.eventCodes).toContain(WEBHOOK_EVENT_CODES.secretNonProtectedWrite);
  });

  it("denies org members without webhook:read", async () => {
    vi.mocked(authorizeScopeOrThrow).mockRejectedValue(
      Object.assign(new Error("Missing required permission."), {
        code: AUTH_ERROR_CODES.insufficientScope,
      }),
    );

    await expect(
      listWebhookEventCodesOperation({
        env: {} as never,
        auditActor,
        accessActor,
        input: {
          organizationId: ORG,
          requestId: REQ,
          actorToken: "verified-by-rpc-entry",
        },
      }),
    ).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.insufficientScope,
    });
  });
});
