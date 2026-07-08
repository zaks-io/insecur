import { userId } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { toAuditActor } from "../src/to-audit-actor.js";

const USER = userId.brand("usr_00000000000000000000000001");

describe("toAuditActor", () => {
  it("maps actors into audit actor refs", () => {
    expect(toAuditActor({ type: "user", userId: USER })).toEqual({
      type: "user",
      userId: USER,
    });
    expect(
      toAuditActor({
        type: "machine",
        machineIdentityId: "mid_test" as never,
        tokenScope: { organizationId: "org_test" as never },
        credentialScopes: [],
      }),
    ).toEqual({ type: "machine", machineIdentityId: "mid_test" });
  });
});
